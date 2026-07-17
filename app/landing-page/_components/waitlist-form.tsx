"use client";

import { useId, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Email capture for the hosted-beta waitlist. There is no signup backend yet —
 * the form validates and confirms locally so the page can ship ahead of it.
 * Wire the submit handler to an API route or list provider when one exists.
 */
export function WaitlistForm({ className }: { className?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);

  if (joined) {
    return (
      <div
        className={cn(
          "flex min-h-10 items-center gap-2.5 text-sm",
          className,
        )}
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ember text-ember-foreground">
          <Check className="size-3" strokeWidth={3} />
        </span>
        You&apos;re on the list. One email when the beta opens — nothing else.
      </div>
    );
  }

  return (
    <form
      className={cn(
        "flex w-full max-w-md flex-col gap-2 sm:flex-row",
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault();
        setJoined(true);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Email address
      </label>
      <Input
        id={id}
        type="email"
        required
        placeholder="you@studio.com"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="h-10 flex-1 sm:min-w-0"
      />
      <Button
        type="submit"
        className="h-10 shrink-0 bg-ember px-4 text-ember-foreground hover:bg-ember/90"
      >
        Join the waitlist
        <ArrowRight />
      </Button>
    </form>
  );
}
