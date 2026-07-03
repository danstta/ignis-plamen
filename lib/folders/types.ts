export type FolderKind = "design" | "workflow";

export type FolderSummary = {
  id: string;
  kind: FolderKind;
  name: string;
};

export type FolderItem = {
  id: string;
  name: string;
  folderId: string | null;
};
