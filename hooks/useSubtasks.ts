import { useState, useEffect } from "react";
import { Subtask } from "@/types/models";
import { createBrowserClient } from "@supabase/ssr";

const SUGGEST_ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/suggest-subtasks`;

// The steps (subtasks) of one task: load them, add, tick, delete, and ask the
// AI to suggest more.
export function useSubtasks(taskId: string) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  // Fetch the task's steps, oldest first.
  // Row Level Security limits this to the user's own steps.
  useEffect(() => {
    if (!taskId) return;

    const fetchSubtasks = async () => {
      const { data, error } = await supabase
        .from("subtasks")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (error) console.error("Error fetching subtasks:", error);
      setSubtasks(data ?? []);
      setIsLoading(false);
    };

    fetchSubtasks();
  }, [taskId]);

  const addSubtask = async (title: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("You are not signed in");

    const { data, error } = await supabase
      .from("subtasks")
      .insert({ task_id: taskId, user_id: session.user.id, title })
      .select()
      .single();

    if (error) throw error;
    setSubtasks((current) => [...current, data]);
  };

  const toggleSubtask = async (subtaskId: string, completed: boolean) => {
    const { error } = await supabase
      .from("subtasks")
      .update({ completed })
      .eq("subtask_id", subtaskId);

    if (error) throw error;
    setSubtasks((current) =>
      current.map((subtask) =>
        subtask.subtask_id === subtaskId ? { ...subtask, completed } : subtask
      )
    );
  };

  const deleteSubtask = async (subtaskId: string) => {
    const { error } = await supabase
      .from("subtasks")
      .delete()
      .eq("subtask_id", subtaskId);

    if (error) throw error;
    setSubtasks((current) =>
      current.filter((subtask) => subtask.subtask_id !== subtaskId)
    );
  };

  // Ask the Edge Function suggest-subtasks for steps. It saves them and
  // returns the new rows.
  const suggestSubtasks = async () => {
    setIsSuggesting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(SUGGEST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify({ task_id: taskId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to suggest steps");
      }

      const newSubtasks: Subtask[] = await response.json();
      setSubtasks((current) => [...current, ...newSubtasks]);
      return newSubtasks;
    } finally {
      setIsSuggesting(false);
    }
  };

  return {
    subtasks,
    isLoading,
    isSuggesting,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    suggestSubtasks,
  };
}
