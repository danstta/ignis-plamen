"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setPluginEnabledAction } from "@/app/(admin)/plugins/actions";

/** A Switch wired to the plugin enable/disable server action. */
export function PluginToggle({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={enabled}
      disabled={pending}
      onCheckedChange={(checked) =>
        startTransition(() => {
          void setPluginEnabledAction(id, checked);
        })
      }
      aria-label={enabled ? "Disable plugin" : "Enable plugin"}
    />
  );
}
