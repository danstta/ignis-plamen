"use client";

import Link from "next/link";
import { toast } from "sonner";
import { CircleDot, Pencil, Trash2 } from "lucide-react";
import { deleteWorkflowAction } from "@/app/(admin)/workflows/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function WorkflowCard({
  id,
  name,
  active,
  updated,
}: {
  id: string;
  name: string;
  active: boolean;
  updated: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="truncate">{name}</span>
          <span
            className={
              active
                ? "flex items-center gap-1 text-xs font-normal text-green-600"
                : "flex items-center gap-1 text-xs font-normal text-muted-foreground"
            }
          >
            <CircleDot className="size-3.5" />
            {active ? "Active" : "Inactive"}
          </span>
        </CardTitle>
        <CardDescription>Updated {updated}</CardDescription>
      </CardHeader>
      <CardFooter className="gap-2">
        <Button
          size="sm"
          variant="outline"
          render={<Link href={`/workflows/${id}`} />}
        >
          <Pencil className="size-4" /> Open
        </Button>
        <ConfirmDeleteDialog
          itemLabel="workflow"
          itemName={name}
          onConfirm={async () => {
            try {
              await deleteWorkflowAction(id);
              toast.success("Workflow deleted");
            } catch (err) {
              toast.error("Delete failed", { description: String(err) });
              throw err;
            }
          }}
        >
          <Button size="sm" variant="ghost">
            <Trash2 className="size-4" />
          </Button>
        </ConfirmDeleteDialog>
      </CardFooter>
    </Card>
  );
}
