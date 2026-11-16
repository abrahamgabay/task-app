import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubtasks } from "@/hooks/useSubtasks";
import { useToast } from "@/components/hooks/use-toast";

interface SubtaskListProps {
  taskId: string;
}

// The checklist of steps on the task page. It sits inside the task's form, so
// its buttons are type="button" and Enter in the input adds a step instead of
// submitting the form.
const SubtaskList = ({ taskId }: SubtaskListProps) => {
  const {
    subtasks,
    isLoading,
    isSuggesting,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    suggestSubtasks,
  } = useSubtasks(taskId);
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState("");

  const showError = (title: string, error: any) => {
    toast({
      title,
      description: error.message || "Something went wrong",
      variant: "destructive",
    });
  };

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;

    try {
      await addSubtask(title);
      setNewTitle("");
    } catch (error: any) {
      showError("❌ Could not add the step", error);
    }
  };

  const handleSuggest = async () => {
    try {
      const added = await suggestSubtasks();
      toast({
        title: "✨ Steps Suggested",
        description: `The AI added ${added.length} steps`,
      });
    } catch (error: any) {
      showError("❌ Could not suggest steps", error);
    }
  };

  const doneCount = subtasks.filter((subtask) => subtask.completed).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {subtasks.length > 0
            ? `${doneCount} of ${subtasks.length} done`
            : isLoading
            ? "Loading..."
            : "No steps yet"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleSuggest}
          disabled={isSuggesting}
        >
          <Sparkles className="mr-1 h-4 w-4" />
          {isSuggesting ? "Thinking..." : "Suggest steps with AI"}
        </Button>
      </div>

      {subtasks.length > 0 && (
        <ul className="rounded-md border divide-y">
          {subtasks.map((subtask) => (
            <li
              key={subtask.subtask_id}
              className="flex items-center gap-2 px-3 py-1"
            >
              <Checkbox
                checked={subtask.completed}
                onCheckedChange={(checked) =>
                  toggleSubtask(subtask.subtask_id, checked as boolean).catch(
                    (error) => showError("❌ Could not update the step", error)
                  )
                }
              />
              <span
                className={cn(
                  "flex-1 text-sm",
                  subtask.completed && "line-through text-muted-foreground"
                )}
              >
                {subtask.title}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Delete step"
                onClick={() =>
                  deleteSubtask(subtask.subtask_id).catch((error) =>
                    showError("❌ Could not delete the step", error)
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={newTitle}
          placeholder="Add a step"
          maxLength={200}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={handleAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
};

export default SubtaskList;
