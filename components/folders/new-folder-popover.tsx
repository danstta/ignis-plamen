"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createFolderAction } from "@/app/(admin)/folders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FolderKind } from "@/lib/folders/types";

/**
 * Inline "new folder" flow: the trigger opens a small popover with a name
 * input, so folder creation stays in context instead of a blocking prompt.
 */
export function NewFolderPopover({
  kind,
  trigger,
}: {
  kind: FolderKind;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || isPending) return;
    startTransition(async () => {
      try {
        await createFolderAction(kind, trimmed);
        toast.success("Folder created");
        setOpen(false);
        setName("");
        router.refresh();
      } catch (err) {
        toast.error("Folder not created", { description: String(err) });
      }
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setName("");
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent side="right" align="start" className="w-60 p-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2"
        >
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              kind === "design" ? "Design folder name" : "Workflow folder name"
            }
            aria-label="Folder name"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isPending || name.trim().length === 0}
          >
            Create folder
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
