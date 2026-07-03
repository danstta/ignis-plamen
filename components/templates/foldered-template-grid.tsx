"use client";

import { FolderedItemGrid } from "@/components/folders/foldered-item-grid";
import { TemplateCard } from "@/components/templates/template-card";
import type { FolderSummary } from "@/lib/folders/types";
import type { TemplateDoc } from "@/lib/editor/types";

export type FolderedTemplate = {
  id: string;
  name: string;
  folderId: string | null;
  size: string;
  updated: string;
  doc: TemplateDoc;
};

export function FolderedTemplateGrid({
  folders,
  templates,
}: {
  folders: FolderSummary[];
  templates: FolderedTemplate[];
}) {
  return (
    <FolderedItemGrid
      kind="design"
      folders={folders}
      items={templates}
      emptyLabel="No designs yet."
      gridClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      renderItem={(template) => (
        <TemplateCard
          id={template.id}
          name={template.name}
          size={template.size}
          updated={template.updated}
          doc={template.doc}
        />
      )}
    />
  );
}
