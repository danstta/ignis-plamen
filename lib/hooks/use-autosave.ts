"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { StoreApi, UseBoundStore } from "zustand";

export type SaveStatus = "saved" | "saving" | "unsaved";

/** Upper bound on the exponential backoff between failed autosave retries. */
const MAX_BACKOFF_MS = 30_000;

/**
 * Drives autosave for an editor backed by a zustand store with a `dirty` flag.
 *
 * The store should set `dirty: true` on every persistable change and clear it
 * (via its own `markSaved`) once a save succeeds. Because `dirty` stays true
 * across a streak of edits, the timer fires ~`delay` after the first change and
 * again after each save while edits keep arriving — bounding how much work can
 * be lost without resetting the timer on every keystroke.
 *
 * Saves run one-at-a-time. The `save` performer is responsible for clearing the
 * store's dirty flag *only when the persisted snapshot still matches current
 * state*, so edits made mid-request aren't silently dropped.
 */
export function useAutosave<S extends { dirty: boolean }>({
  store,
  save,
  delay = 800,
}: {
  store: UseBoundStore<StoreApi<S>>;
  /** Persist current state. Throws on failure. `auto` is false for manual saves. */
  save: (opts: { auto: boolean }) => Promise<void>;
  /** Idle delay (ms) after a change before autosaving. */
  delay?: number;
}) {
  const dirty = store((s) => s.dirty);
  const [saving, setSaving] = useState(false);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const savingRef = useRef(false);
  const errorsRef = useRef(0);

  const run = useCallback(
    async (auto: boolean) => {
      // One save in flight at a time; auto-saves skip when nothing is pending.
      if (savingRef.current) return;
      if (auto && !store.getState().dirty) return;
      savingRef.current = true;
      setSaving(true);
      try {
        await saveRef.current({ auto });
        errorsRef.current = 0;
      } catch (err) {
        errorsRef.current += 1;
        // Always surface a manual failure; for autosave only the first of a
        // streak, so a flaky/offline backend doesn't spam a toast every retry.
        if (!auto || errorsRef.current === 1) {
          toast.error("Failed to save", { description: String(err) });
        }
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [store],
  );

  useEffect(() => {
    if (!dirty || saving) return;
    const wait =
      errorsRef.current > 0
        ? Math.min(delay * 2 ** errorsRef.current, MAX_BACKOFF_MS)
        : delay;
    const t = setTimeout(() => void run(true), wait);
    return () => clearTimeout(t);
  }, [dirty, saving, delay, run]);

  const saveNow = useCallback(() => void run(false), [run]);
  const status: SaveStatus = saving ? "saving" : dirty ? "unsaved" : "saved";

  return { status, saving, saveNow };
}
