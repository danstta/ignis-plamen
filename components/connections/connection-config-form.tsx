"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { updateConnectionConfigAction } from "@/app/(admin)/settings/connections/actions";
import { splitConfiguredModels } from "@/lib/connections/model-options";
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

function ModelListField({
  field,
  value,
}: {
  field: ConfigField;
  value: string;
}) {
  const itemLabel = field.itemLabel ?? "model";
  const [items, setItems] = useState(() => {
    const models = splitConfiguredModels(value);
    return models.length > 0 ? models : [""];
  });

  const hiddenValue = items
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");

  const updateItem = (index: number, nextValue: string) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? nextValue : item,
      ),
    );
  };

  const removeItem = (index: number) => {
    setItems((current) => {
      if (current.length === 1) return [""];
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  return (
    <div className="grid max-w-lg gap-2">
      <input type="hidden" name={field.name} value={hiddenValue} readOnly />
      {items.map((item, index) => {
        const inputId = index === 0 ? field.name : `${field.name}-${index}`;
        const removeDisabled = items.length === 1 && item.trim() === "";

        return (
          <div key={index} className="flex min-w-0 items-center gap-2">
            <Input
              id={inputId}
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
              placeholder={index === 0 ? field.placeholder : undefined}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${itemLabel} ${index + 1}`}
              disabled={removeDisabled}
              onClick={() => removeItem(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => setItems((current) => [...current, ""])}
      >
        <Plus className="size-4" /> Add {itemLabel}
      </Button>
    </div>
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
          {field.type === "model-list" ? (
            <ModelListField
              key={values[field.name] ?? ""}
              field={field}
              value={values[field.name] ?? ""}
            />
          ) : (
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
          )}
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
