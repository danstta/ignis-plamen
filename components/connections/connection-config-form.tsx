"use client";

import { useFormStatus } from "react-dom";
import { updateConnectionConfigAction } from "@/app/(admin)/settings/connections/actions";
import type { ConfigField } from "@/lib/connections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="self-start">
      {pending ? "Saving..." : "Save configuration"}
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
      className="grid gap-4"
    >
      <div className="grid gap-1.5">
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
          required
        />
      </div>
      {fields.map((field) => (
        <div key={field.name} className="grid gap-1.5">
          <Label htmlFor={field.name}>
            {field.label}
            {field.required === false ? (
              <span className="text-xs font-normal text-muted-foreground">
                Optional
              </span>
            ) : null}
          </Label>
          <Input
            key={values[field.name] ?? ""}
            id={field.name}
            name={field.name}
            type={field.type}
            defaultValue={values[field.name] ?? ""}
            placeholder={field.placeholder}
            className="max-w-md"
            autoComplete={field.type === "password" ? "new-password" : "off"}
            required={field.required !== false}
          />
          {field.help ? (
            <p className="max-w-lg text-xs leading-5 text-muted-foreground">
              {field.help}
            </p>
          ) : null}
        </div>
      ))}
      <SaveButton />
    </form>
  );
}
