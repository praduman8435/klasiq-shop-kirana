"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateReturnRequestAdminNoteAction } from "@/server/actions/admin/returns";

/**
 * Internal-Admin-only context (e.g. "customer called to confirm pickup
 * time") — never rendered anywhere in the customer portal (see
 * `ReturnRequest.adminNote`'s own schema doc comment). Independent of
 * status — editable at any point in the request's lifecycle, including
 * after it reaches a terminal state.
 */
export function ReturnAdminNote({ returnNumber, initialNote }: { returnNumber: string; initialNote: string }) {
  const [note, setNote] = useState(initialNote);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (isPending) return;
    startTransition(async () => {
      const result = await updateReturnRequestAdminNoteAction({ returnNumber, adminNote: note });
      if (result.success) {
        toast.success("Note saved.");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Internal note — never shown to the customer"
        aria-label="Internal admin note"
        className="rounded-md border border-input bg-background p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={isPending} onClick={handleSave}>
        {isPending ? "Saving..." : "Save Note"}
      </Button>
    </div>
  );
}
