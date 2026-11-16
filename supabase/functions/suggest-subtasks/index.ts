// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { SUPABASE_PUBLISHABLE_KEY } from "../_shared/supabaseKeys.ts";

// Load environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// The OpenAI model that suggests the steps.
const OPENAI_MODEL = "gpt-4o-mini";

// How many steps the AI may add in one go, and how long a step may be
// (the subtasks table allows 200 characters).
const MAX_STEPS = 5;
const MAX_STEP_LENGTH = 120;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Turn the AI's reply into a clean list of steps. The reply should be a JSON
// object like {"steps": ["...", "..."]}; anything else gives an empty list.
function parseSteps(reply: string | null): string[] {
  try {
    const steps = JSON.parse(reply ?? "{}").steps;
    if (!Array.isArray(steps)) return [];
    return steps
      .filter((step): step is string => typeof step === "string")
      .map((step) => step.trim().slice(0, MAX_STEP_LENGTH))
      .filter((step) => step.length > 0)
      .slice(0, MAX_STEPS);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { task_id } = await req.json();
    if (!task_id) throw new Error("No task_id given");

    console.log("🔄 Suggesting steps with AI...");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Initialize Supabase client
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get user session
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("No user found");

    // Read the task. Row Level Security returns it only if it is the user's own.
    const { data: task, error: taskError } = await supabaseClient
      .from("tasks")
      .select("task_id, title, description")
      .eq("task_id", task_id)
      .single();

    if (taskError || !task) throw new Error("Task not found");

    // The steps the task already has, so the AI doesn't repeat them.
    const { data: existingRows, error: existingError } = await supabaseClient
      .from("subtasks")
      .select("title")
      .eq("task_id", task_id);

    if (existingError) throw existingError;
    const existingSteps = (existingRows ?? []).map(
      (row: { title: string }) => row.title
    );

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    const prompt = `You break a task from a to-do list app into small, concrete steps.

Task title: "${task.title}"
Task description: "${task.description ?? ""}"

Steps the task already has: ${
      existingSteps.length > 0 ? existingSteps.join("; ") : "(none)"
    }

Rules:
1. Suggest 3 to ${MAX_STEPS} new steps, in the order to do them.
2. Each step is one short action, at most ${MAX_STEP_LENGTH} characters, starting with a verb.
3. Do not repeat a step the task already has.

Reply with a JSON object of this form and nothing else: {"steps": ["first step", "second step"]}`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: OPENAI_MODEL,
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const steps = parseSteps(completion.choices[0].message.content);
    console.log(`✨ AI suggested ${steps.length} steps`);
    if (steps.length === 0) throw new Error("The AI suggested no steps");

    // Save the steps
    const { data: newSubtasks, error: insertError } = await supabaseClient
      .from("subtasks")
      .insert(
        steps.map((title) => ({ task_id, user_id: user.id, title }))
      )
      .select();

    if (insertError) throw insertError;

    return new Response(JSON.stringify(newSubtasks), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    // Errors from Supabase are not always Error objects, but have a message.
    const message = (error as { message?: string })?.message ?? String(error);
    console.error("Error in suggest-subtasks:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
