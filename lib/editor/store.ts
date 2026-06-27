import { create } from "zustand";
import type { Brand } from "@/lib/brand/types";
import {
  type ElementPatch,
  type Fill,
  type TemplateDoc,
  type TemplateElement,
  emptyDoc,
} from "./types";

const HISTORY_LIMIT = 50;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function patchChangesElement(el: TemplateElement, patch: ElementPatch): boolean {
  return Object.entries(patch).some(
    ([key, value]) => !valuesEqual(el[key as keyof TemplateElement], value),
  );
}

export type GeometryPatch = {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
};

interface EditorState {
  templateId: string | null;
  name: string;
  doc: TemplateDoc;
  selectedIds: string[];
  zoom: number;
  dirty: boolean;
  past: TemplateDoc[];
  future: TemplateDoc[];
  /** Available brand identities (ambient config — not part of undo history). */
  brands: Brand[];

  // lifecycle
  load: (input: { id: string | null; name: string; doc: TemplateDoc }) => void;
  setName: (name: string) => void;
  setZoom: (zoom: number) => void;
  setBrands: (brands: Brand[]) => void;
  setBrandId: (brandId: string | null) => void;
  markSaved: () => void;

  // history — call pushHistory() once at the start of an undoable interaction
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // selection
  select: (ids: string[]) => void;
  toggleSelect: (id: string, additive: boolean) => void;
  clearSelection: () => void;

  // elements
  addElement: (el: TemplateElement) => void;
  updateElement: (id: string, patch: ElementPatch) => void;
  updateGeometry: (patches: GeometryPatch[]) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  reorderSelected: (direction: "front" | "forward" | "backward" | "back") => void;
  setBackground: (fill: Fill) => void;
  setCanvasSize: (width: number, height: number) => void;
}

/** Apply a mutation to the doc, mark dirty, and clear the redo stack. */
function commitDoc(
  state: EditorState,
  next: TemplateDoc,
): Partial<EditorState> {
  return { doc: next, dirty: true };
}

export const useEditor = create<EditorState>((set, get) => ({
  templateId: null,
  name: "Untitled template",
  doc: emptyDoc(),
  selectedIds: [],
  zoom: 1,
  dirty: false,
  past: [],
  future: [],
  brands: [],

  load: ({ id, name, doc }) =>
    set({
      templateId: id,
      name,
      doc,
      selectedIds: [],
      past: [],
      future: [],
      dirty: false,
    }),

  setName: (name) => set({ name, dirty: true }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.1, zoom)) }),
  setBrands: (brands) => set({ brands }),
  setBrandId: (brandId) => {
    get().pushHistory();
    set((s) =>
      commitDoc(s, {
        ...s.doc,
        brandId: brandId ?? undefined,
      }) as EditorState,
    );
  },
  markSaved: () => set({ dirty: false }),

  pushHistory: () => {
    const { doc, past } = get();
    const next = [...past, clone(doc)];
    if (next.length > HISTORY_LIMIT) next.shift();
    set({ past: next, future: [] });
  },

  undo: () => {
    const { past, future, doc } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      doc: previous,
      past: past.slice(0, -1),
      future: [clone(doc), ...future],
      dirty: true,
    });
  },

  redo: () => {
    const { past, future, doc } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      doc: next,
      future: future.slice(1),
      past: [...past, clone(doc)],
      dirty: true,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  select: (ids) => set({ selectedIds: ids }),
  toggleSelect: (id, additive) =>
    set((s) => {
      if (!additive) return { selectedIds: [id] };
      return s.selectedIds.includes(id)
        ? { selectedIds: s.selectedIds.filter((x) => x !== id) }
        : { selectedIds: [...s.selectedIds, id] };
    }),
  clearSelection: () => set({ selectedIds: [] }),

  addElement: (el) => {
    get().pushHistory();
    set((s) =>
      commitDoc(s, { ...s.doc, elements: [...s.doc.elements, el] }) as EditorState,
    );
  },

  updateElement: (id, patch) =>
    set((s) => {
      let changed = false;
      const elements = s.doc.elements.map((el) =>
        el.id === id && patchChangesElement(el, patch)
          ? ((changed = true), ({ ...el, ...patch } as TemplateElement))
          : el,
      );
      if (!changed) return s;
      return commitDoc(s, { ...s.doc, elements }) as EditorState;
    }),

  updateGeometry: (patches) =>
    set((s) => {
      const byId = new Map(patches.map((p) => [p.id, p]));
      let changed = false;
      const elements = s.doc.elements.map((el) => {
        const p = byId.get(el.id);
        if (!p) return el;
        // Auto-width text derives its width from content; Moveable reads back an
        // empty inline width (→ 0), so never let geometry commits overwrite it.
        const next: GeometryPatch = { ...p };
        if (el.type === "text" && el.autoWidth) delete next.width;
        if (!patchChangesElement(el, next)) return el;
        changed = true;
        return {
          ...el,
          ...(next.x !== undefined ? { x: next.x } : {}),
          ...(next.y !== undefined ? { y: next.y } : {}),
          ...(next.width !== undefined ? { width: next.width } : {}),
          ...(next.height !== undefined ? { height: next.height } : {}),
          ...(next.rotation !== undefined ? { rotation: next.rotation } : {}),
        } as TemplateElement;
      });
      if (!changed) return s;
      return commitDoc(s, { ...s.doc, elements }) as EditorState;
    }),

  removeSelected: () => {
    if (get().selectedIds.length === 0) return;
    get().pushHistory();
    set((s) => {
      const ids = new Set(s.selectedIds);
      const elements = s.doc.elements.filter((el) => !ids.has(el.id));
      return {
        ...commitDoc(s, { ...s.doc, elements }),
        selectedIds: [],
      } as EditorState;
    });
  },

  duplicateSelected: () => {
    if (get().selectedIds.length === 0) return;
    get().pushHistory();
    set((s) => {
      const ids = new Set(s.selectedIds);
      const copies: TemplateElement[] = [];
      const newIds: string[] = [];
      for (const el of s.doc.elements) {
        if (ids.has(el.id)) {
          const id = crypto.randomUUID();
          newIds.push(id);
          copies.push({ ...clone(el), id, x: el.x + 20, y: el.y + 20 });
        }
      }
      return {
        ...commitDoc(s, { ...s.doc, elements: [...s.doc.elements, ...copies] }),
        selectedIds: newIds,
      } as EditorState;
    });
  },

  reorderSelected: (direction) => {
    if (get().selectedIds.length !== 1) return;
    get().pushHistory();
    set((s) => {
      const id = s.selectedIds[0];
      const els = [...s.doc.elements];
      const i = els.findIndex((e) => e.id === id);
      if (i < 0) return s;
      const [el] = els.splice(i, 1);
      let j = i;
      if (direction === "front") j = els.length;
      else if (direction === "back") j = 0;
      else if (direction === "forward") j = Math.min(els.length, i + 1);
      else if (direction === "backward") j = Math.max(0, i - 1);
      els.splice(j, 0, el);
      return commitDoc(s, { ...s.doc, elements: els }) as EditorState;
    });
  },

  setBackground: (fill) =>
    set((s) => commitDoc(s, { ...s.doc, background: fill }) as EditorState),

  setCanvasSize: (width, height) => {
    get().pushHistory();
    set((s) => commitDoc(s, { ...s.doc, width, height }) as EditorState);
  },
}));

/** The brand currently selected by the doc, if it still exists. */
export function activeBrand(s: EditorState): Brand | undefined {
  return s.doc.brandId
    ? s.brands.find((b) => b.id === s.doc.brandId)
    : undefined;
}
