"use client";

import { FolderedItemGrid } from "@/components/folders/foldered-item-grid";
import { WorkflowCard } from "@/components/workflow/workflow-card";
import type { FolderSummary } from "@/lib/folders/types";

export type FolderedWorkflow = {
  id: string;
  name: string;
  folderId: string | null;
  active: boolean;
  updated: string;
};

export function FolderedWorkflowGrid({
  folders,
  workflows,
}: {
  folders: FolderSummary[];
  workflows: FolderedWorkflow[];
}) {
  return (
    <FolderedItemGrid
      kind="workflow"
      folders={folders}
      items={workflows}
      emptyLabel="No workflows yet. Create one to get started."
      gridClassName="grid gap-4 sm:grid-cols-2"
      renderItem={(workflow) => (
        <WorkflowCard
          id={workflow.id}
          name={workflow.name}
          active={workflow.active}
          updated={workflow.updated}
        />
      )}
    />
  );
}
