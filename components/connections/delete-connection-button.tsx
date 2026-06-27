"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteConnectionAction } from "@/app/(admin)/settings/connections/actions";
import { Button } from "@/components/ui/button";

export function DeleteConnectionButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete connection "${name}"?`)) return;
        start(() => {
          void deleteConnectionAction(id);
        });
      }}
    >
      <Trash2 className="size-4" /> Delete connection
    </Button>
  );
}
