"use client";

import { useFormStatus } from "react-dom";
import { updateConnectionConfigAction } from "@/app/(admin)/connections/actions";
import type { ConfigField } from "@/lib/connections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="self-start">
      {pending ? "Saving…" : "Save configuration"}
    </Button>
  );
}

export function ConnectionConfigForm({
  id,
  name,
  fields,
  values,
}: {
  id: string;
  name: string;
  fields: ConfigField[];
  values: Record<string, string>;
}) {
  return (
    <form
      action={updateConnectionConfigAction.bind(null, id)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Connection name</Label>
        {/* These inputs are uncontrolled; `key` re-mounts them when the saved
            value changes (e.g. after a save revalidates the page) so they reset
            to server truth instead of warning about a changed defaultValue. */}
        <Input
          key={name}
          id="name"
          name="name"
          defaultValue={name}
          className="max-w-md"
        />
      </div>
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          <Input
            key={values[f.name] ?? ""}
            id={f.name}
            name={f.name}
            type={f.type}
            defaultValue={values[f.name] ?? ""}
            placeholder={f.placeholder}
            className="max-w-md"
            autoComplete="off"
          />
          {f.help ? (
            <p className="text-xs text-muted-foreground">{f.help}</p>
          ) : null}
        </div>
      ))}
      <SaveButton />
    </form>
  );
}
