"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSchoolClassAction, deleteSchoolClassAction } from "@/server/actions/admin/schools";

export function SchoolClassesManager({
  schoolId,
  classes,
}: {
  schoolId: string;
  classes: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [newClassName, setNewClassName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !newClassName.trim()) return;
    startTransition(async () => {
      const result = await createSchoolClassAction({ schoolId, name: newClassName.trim() });
      if (result.success) {
        toast.success("Class added.");
        setNewClassName("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete(id: string) {
    if (isPending) return;
    const confirmed = window.confirm(
      "Remove this class? Any assignments or recommended sets scoped to it will be removed too.",
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteSchoolClassAction({ id });
      if (result.success) {
        toast.success("Class removed.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div>
      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No classes added yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {classes.map((cls) => (
            <li
              key={cls.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/20 py-1 pl-3 pr-1.5 text-sm"
            >
              {cls.name}
              <button
                type="button"
                aria-label={`Remove ${cls.name}`}
                disabled={isPending}
                onClick={() => handleDelete(cls.id)}
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="mt-3 flex gap-2">
        <Input
          value={newClassName}
          onChange={(e) => setNewClassName(e.target.value)}
          placeholder="e.g. Class 7"
          className="h-9 max-w-48"
        />
        <Button type="submit" variant="outline" className="h-9" disabled={isPending || !newClassName.trim()}>
          Add class
        </Button>
      </form>
    </div>
  );
}
