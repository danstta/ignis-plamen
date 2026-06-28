"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteTemplateAction } from "@/app/(admin)/templates/actions";
import { TemplatePreview } from "@/components/render/template-preview";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
      <div className="relative -mt-(--card-spacing)">
        <Link
          href={`/editor/${id}`}
          className="block aspect-[4/5] w-full overflow-hidden border-b bg-muted outline-none -outline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${name} in editor`}
        >
          <TemplatePreview doc={doc} className="h-full w-full" />
        </Link>

        {/* Edit / delete reveal on hover (or keyboard focus); icon-only to keep
            the card minimal. Siblings of the link so they never trigger it. */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100">
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label={`Edit ${name}`}
            render={<Link href={`/editor/${id}`} />}
          >
            <Pencil />
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
            <Button size="icon-sm" variant="secondary" aria-label={`Delete ${name}`}>
              <Trash2 />
            </Button>
          </ConfirmDeleteDialog>
        </div>
      </div>

      <CardHeader>
        <CardTitle className="truncate">{name}</CardTitle>
        <CardDescription>
          {size} · updated {updated}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
