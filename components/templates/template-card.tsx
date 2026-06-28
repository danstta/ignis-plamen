"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteTemplateAction } from "@/app/(admin)/templates/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export function TemplateCard({
  id,
  name,
  size,
  updated,
}: {
  id: string;
  name: string;
  size: string;
  updated: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{name}</CardTitle>
        <CardDescription>
          {size} · updated {updated}
        </CardDescription>
      </CardHeader>
      <CardFooter className="gap-2">
        <Button
          size="sm"
          variant="outline"
          render={<Link href={`/editor/${id}`} />}
        >
          <Pencil className="size-4" /> Edit
        </Button>
        <ConfirmDeleteDialog
          itemLabel="template"
          itemName={name}
          onConfirm={async () => {
            try {
              await deleteTemplateAction(id);
              toast.success("Template deleted");
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
