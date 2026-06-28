import { create } from "zustand";
import type { Brand } from "@/lib/brand/types";
import {
  type ElementPatch,
  type Fill,
  type Page,
  type TemplateDoc,
  type TemplateElement,
  createPage,
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

/** Deep-copy a page's elements, assigning fresh ids (ids must be unique per page). */
function cloneElementsWithIds(elements: TemplateElement[]): TemplateElement[] {
  return elements.map((el) => ({ ...clone(el), id: crypto.randomUUID() }));
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
  /** Id of the page currently shown on the canvas. */
  currentPageId: string;
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

  // pages
  setCurrentPage: (id: string) => void;
  addPage: () => void;
  duplicatePage: (id?: string) => void;
  removePage: (id: string) => void;
  movePage: (id: string, direction: "left" | "right") => void;

  // selection
  select: (ids: string[]) => void;
  toggleSelect: (id: string, additive: boolean) => void;
  clearSelection: () => void;

  // elements (operate on the current page)
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
  _state: EditorState,
  next: TemplateDoc,
): Partial<EditorState> {
  return { doc: next, dirty: true };
}

/** The page currently being edited; falls back to the first page if the id is stale. */
function resolveCurrentPage(s: EditorState): Page {
  return s.doc.pages.find((p) => p.id === s.currentPageId) ?? s.doc.pages[0];
}

/** Produce a new doc with the current page replaced by `fn(page)`. */
function mapCurrentPage(s: EditorState, fn: (page: Page) => Page): TemplateDoc {
  const currentId = resolveCurrentPage(s).id;
  return {
    ...s.doc,
    pages: s.doc.pages.map((p) => (p.id === currentId ? fn(p) : p)),
  };
}

export const useEditor = create<EditorState>((set, get) => ({
  templateId: null,
  name: "Untitled template",
  doc: emptyDoc(),
  currentPageId: "",
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
      currentPageId: doc.pages[0]?.id ?? "",
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
      // The restored doc may not contain the active page (undoing an add-page).
      currentPageId: previous.pages.some((p) => p.id === get().currentPageId)
        ? get().currentPageId
        : (previous.pages[0]?.id ?? ""),
      selectedIds: [],
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
      currentPageId: next.pages.some((p) => p.id === get().currentPageId)
        ? get().currentPageId
        : (next.pages[0]?.id ?? ""),
      selectedIds: [],
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  setCurrentPage: (id) => {
    if (!get().doc.pages.some((p) => p.id === id)) return;
    set({ currentPageId: id, selectedIds: [] });
  },

  addPage: () => {
    get().pushHistory();
    set((s) => {
      // Inherit the current page's background so a new page feels consistent.
      const page = createPage(resolveCurrentPage(s).background);
      const idx = s.doc.pages.findIndex((p) => p.id === resolveCurrentPage(s).id);
      const pages = [...s.doc.pages];
      pages.splice(idx + 1, 0, page);
      return {
        ...commitDoc(s, { ...s.doc, pages }),
        currentPageId: page.id,
        selectedIds: [],
      } as EditorState;
    });
  },

  duplicatePage: (id) => {
    get().pushHistory();
    set((s) => {
      const sourceId = id ?? resolveCurrentPage(s).id;
      const idx = s.doc.pages.findIndex((p) => p.id === sourceId);
      if (idx < 0) return s;
      const source = s.doc.pages[idx];
      const copy: Page = {
        id: crypto.randomUUID(),
        background: clone(source.background),
        elements: cloneElementsWithIds(source.elements),
      };
      const pages = [...s.doc.pages];
      pages.splice(idx + 1, 0, copy);
      return {
        ...commitDoc(s, { ...s.doc, pages }),
        currentPageId: copy.id,
        selectedIds: [],
      } as EditorState;
    });
  },

  removePage: (id) => {
    if (get().doc.pages.length <= 1) return; // always keep at least one page
    get().pushHistory();
    set((s) => {
      const idx = s.doc.pages.findIndex((p) => p.id === id);
      if (idx < 0) return s;
      const pages = s.doc.pages.filter((p) => p.id !== id);
      // If the removed page was active, move to the neighbor that takes its slot.
      const nextActive =
        id === resolveCurrentPage(s).id
          ? (pages[Math.min(idx, pages.length - 1)]?.id ?? pages[0].id)
          : resolveCurrentPage(s).id;
      return {
        ...commitDoc(s, { ...s.doc, pages }),
        currentPageId: nextActive,
        selectedIds: [],
      } as EditorState;
    });
  },

  movePage: (id, direction) => {
    const list = get().doc.pages;
    const from = list.findIndex((p) => p.id === id);
    if (from < 0) return;
    const to = direction === "left" ? from - 1 : from + 1;
    if (to < 0 || to >= list.length) return;
    get().pushHistory();
    set((s) => {
      const pages = [...s.doc.pages];
      const [page] = pages.splice(from, 1);
      pages.splice(to, 0, page);
      return commitDoc(s, { ...s.doc, pages }) as EditorState;
    });
  },

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
      commitDoc(
        s,
        mapCurrentPage(s, (p) => ({ ...p, elements: [...p.elements, el] })),
      ) as EditorState,
    );
  },

  updateElement: (id, patch) =>
    set((s) => {
      let changed = false;
      const next = mapCurrentPage(s, (page) => ({
        ...page,
        elements: page.elements.map((el) =>
          el.id === id && patchChangesElement(el, patch)
            ? ((changed = true), ({ ...el, ...patch } as TemplateElement))
            : el,
        ),
      }));
      if (!changed) return s;
      return commitDoc(s, next) as EditorState;
    }),

  updateGeometry: (patches) =>
    set((s) => {
      const byId = new Map(patches.map((p) => [p.id, p]));
      let changed = false;
      const next = mapCurrentPage(s, (page) => ({
        ...page,
        elements: page.elements.map((el) => {
          const p = byId.get(el.id);
          if (!p) return el;
          // Auto-width text derives its width from content; Moveable reads back an
          // empty inline width (→ 0), so never let geometry commits overwrite it.
          const patch: GeometryPatch = { ...p };
          if (el.type === "text" && el.autoWidth) delete patch.width;
          if (!patchChangesElement(el, patch)) return el;
          changed = true;
          return {
            ...el,
            ...(patch.x !== undefined ? { x: patch.x } : {}),
            ...(patch.y !== undefined ? { y: patch.y } : {}),
            ...(patch.width !== undefined ? { width: patch.width } : {}),
            ...(patch.height !== undefined ? { height: patch.height } : {}),
            ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
          } as TemplateElement;
        }),
      }));
      if (!changed) return s;
      return commitDoc(s, next) as EditorState;
    }),

  removeSelected: () => {
    if (get().selectedIds.length === 0) return;
    get().pushHistory();
    set((s) => {
      const ids = new Set(s.selectedIds);
      return {
        ...commitDoc(
          s,
          mapCurrentPage(s, (p) => ({
            ...p,
            elements: p.elements.filter((el) => !ids.has(el.id)),
          })),
        ),
        selectedIds: [],
      } as EditorState;
    });
  },

  duplicateSelected: () => {
    if (get().selectedIds.length === 0) return;
    get().pushHistory();
    set((s) => {
      const ids = new Set(s.selectedIds);
      const newIds: string[] = [];
      const next = mapCurrentPage(s, (page) => {
        const copies: TemplateElement[] = [];
        for (const el of page.elements) {
          if (ids.has(el.id)) {
            const id = crypto.randomUUID();
            newIds.push(id);
            copies.push({ ...clone(el), id, x: el.x + 20, y: el.y + 20 });
          }
        }
        return { ...page, elements: [...page.elements, ...copies] };
      });
      return {
        ...commitDoc(s, next),
        selectedIds: newIds,
      } as EditorState;
    });
  },

  reorderSelected: (direction) => {
    if (get().selectedIds.length !== 1) return;
    get().pushHistory();
    set((s) => {
      const id = s.selectedIds[0];
      const next = mapCurrentPage(s, (page) => {
        const els = [...page.elements];
        const i = els.findIndex((e) => e.id === id);
        if (i < 0) return page;
        const [el] = els.splice(i, 1);
        let j = i;
        if (direction === "front") j = els.length;
        else if (direction === "back") j = 0;
        else if (direction === "forward") j = Math.min(els.length, i + 1);
        else if (direction === "backward") j = Math.max(0, i - 1);
        els.splice(j, 0, el);
        return { ...page, elements: els };
      });
      return commitDoc(s, next) as EditorState;
    });
  },

  setBackground: (fill) =>
    set((s) =>
      commitDoc(
        s,
        mapCurrentPage(s, (p) => ({ ...p, background: fill })),
      ) as EditorState,
    ),

  setCanvasSize: (width, height) => {
    get().pushHistory();
    set((s) => commitDoc(s, { ...s.doc, width, height }) as EditorState);
  },
}));

/** The page currently being edited; falls back to the first page if the id is stale. */
export function currentPage(s: EditorState): Page {
  return s.doc.pages.find((p) => p.id === s.currentPageId) ?? s.doc.pages[0];
}

/** The brand currently selected by the doc, if it still exists. */
export function activeBrand(s: EditorState): Brand | undefined {
  return s.doc.brandId
    ? s.brands.find((b) => b.id === s.doc.brandId)
    : undefined;
}
