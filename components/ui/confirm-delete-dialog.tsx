"use client";

import * as React from "react";
import { useId, useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The exact phrase the user must type to arm the delete button. */
const CONFIRM_PHRASE = "Yes delete";

/**
 * Two-step confirmation for irreversible deletes: the user must retype the item's
 * name and then type "Yes delete". Both must match exactly before the destructive
 * action is enabled. Reusable across any feature (templates, workflows, …).
 *
 * `onConfirm` should perform the deletion and surface its own success/error toast.
 * On success it should resolve (the dialog closes); on failure it should throw so
 * the dialog stays open and the user can retry.
 */
export function ConfirmDeleteDialog({
  children,
  itemLabel,
  itemName,
  onConfirm,
}: {
  /** The trigger element, e.g. a delete <Button>. */
  children: React.ReactElement;
  /** Lowercase noun for copy, e.g. "workflow" or "template". */
  itemLabel: string;
  /** The exact name the user must retype to confirm. */
  itemName: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [phraseInput, setPhraseInput] = useState("");
  const [pending, setPending] = useState(false);
  const nameId = useId();
  const phraseId = useId();

  const nameMatches = nameInput.trim() === itemName.trim();
  const phraseMatches = phraseInput.trim() === CONFIRM_PHRASE;
  const canDelete = nameMatches && phraseMatches && !pending;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    // Always start fresh so a previous attempt's text never lingers.
    if (!next) {
      setNameInput("");
      setPhraseInput("");
    }
  }

  async function handleConfirm() {
    if (!canDelete) return;
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
      setNameInput("");
      setPhraseInput("");
    } catch {
      // onConfirm surfaced the error; keep the dialog open for a retry.
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && canDelete) {
      e.preventDefault();
      void handleConfirm();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-destructive" />
            Delete {itemLabel}?
          </DialogTitle>
          <DialogDescription>
            This permanently deletes{" "}
            <span className="font-medium text-foreground">{itemName}</span>. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>
              Type the {itemLabel} name{" "}
              <span className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {itemName}
              </span>{" "}
              to confirm
            </Label>
            <Input
              id={nameId}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoFocus
              aria-invalid={nameInput.length > 0 && !nameMatches}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={phraseId}>
              Then type{" "}
              <span className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {CONFIRM_PHRASE}
              </span>{" "}
              below
            </Label>
            <Input
              id={phraseId}
              value={phraseInput}
              onChange={(e) => setPhraseInput(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              aria-invalid={phraseInput.length > 0 && !phraseMatches}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={!canDelete}
            onClick={handleConfirm}
          >
            {pending ? "Deleting…" : `Delete ${itemLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
