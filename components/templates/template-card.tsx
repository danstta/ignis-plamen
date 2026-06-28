"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteTemplateAction } from "@/app/(admin)/templates/actions";
import { TemplatePreview } from "@/components/render/template-preview";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TemplateDoc } from "@/lib/editor/types";

export function TemplateCard({
  id,
  name,
  size,
  updated,
  doc,
}: {
  id: string;
  name: string;
  size: string;
  updated: string;
  doc: TemplateDoc;
}) {
  return (
    <Card>
      <Dialog>
        <DialogTrigger
          render={
            <button
              type="button"
              className="-mt-(--card-spacing) flex h-48 w-full cursor-zoom-in items-center justify-center border-b bg-muted outline-none -outline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Preview ${name}`}
            />
          }
        >
          <TemplatePreview doc={doc} className="h-full w-full" />
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate">{name}</DialogTitle>
            <DialogDescription>{size}</DialogDescription>
          </DialogHeader>
          <TemplatePreview
            doc={doc}
            className="h-[70vh] w-full rounded-lg ring-1 ring-foreground/10"
          />
        </DialogContent>
      </Dialog>

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
