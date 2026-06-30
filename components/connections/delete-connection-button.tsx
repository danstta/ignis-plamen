"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteConnectionAction } from "@/app/(admin)/settings/connections/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

export function DeleteConnectionButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  return (
    <ConfirmDeleteDialog
      itemLabel="connection"
      itemName={name}
      onConfirm={() =>
        new Promise<void>((resolve) => {
          start(() => {
            void deleteConnectionAction(id);
            resolve();
          });
        })
      }
    >
      <Button variant="outline" size="sm" disabled={pending}>
        <Trash2 className="size-4" /> Delete connection
      </Button>
    </ConfirmDeleteDialog>
  );
}
