import type { TemplateDoc } from "@/lib/editor/types";

/**
 * Runtime snippets injected into exported code so {@link TemplateElement.autoFit}
 * text re-fits its box at render time — the export's counterpart to the editor's
 * canvas fit and the PNG's opentype fit.
 *
 * Exports run in a real browser, so these measure with live layout (binary-search
 * the font size until the text no longer overflows the box) rather than shipping
 * the font-metric machinery. That keeps the generated code self-contained and
 * dependency-free while still sizing to whatever data fills the placeholder.
 */

/** True if any element re-fits at render time: auto-fit text, or any list. */
export function docHasAutoFit(doc: TemplateDoc): boolean {
  return doc.pages.some((page) =>
    page.elements.some(
      (el) => (el.type === "text" && el.autoFit) || el.type === "list",
    ),
  );
}

/** True if the document contains a list element (needs the items helper). */
export function docHasList(doc: TemplateDoc): boolean {
  return doc.pages.some((page) =>
    page.elements.some((el) => el.type === "list"),
  );
}

/**
 * Source for a `<FitText>` React component (emitted into exported `.tsx` files).
 * Binary-searches `font-size` in `[min, max]` so the content fits the box after
 * layout. Text passes a `contentStyle` for its inner flow wrapper; lists omit it
 * (the fitted box IS their flex column — their gaps/icons are in em, so they
 * scale with the searched font size). Depends only on `React`, already imported
 * by the generated file.
 */
export const FIT_TEXT_COMPONENT_SOURCE = `function FitText({
  children,
  style,
  contentStyle,
  min,
  max,
}: {
  children: React.ReactNode;
  style: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  min: number;
  max: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lo = min;
    let hi = max;
    let best = min;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      el.style.fontSize = mid + "px";
      const fits =
        el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight;
      if (fits) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    el.style.fontSize = best + "px";
  });
  return (
    <div ref={ref} style={style}>
      {contentStyle ? <div style={contentStyle}>{children}</div> : children}
    </div>
  );
}`;

/**
 * Source for the list-items normalizer emitted alongside components that render
 * list elements: arrays pass through, strings split on newlines, blanks drop —
 * the exported mirror of `toListItems` (lib/editor/types.ts).
 */
export const LIST_ITEMS_HELPER_SOURCE = `function listItems(
  value: string | string[] | undefined,
  fallback: string[],
): string[] {
  const items =
    value === undefined
      ? fallback
      : Array.isArray(value)
        ? value
        : value.split(/\\r?\\n/);
  return items.map((item) => item.trim()).filter(Boolean);
}`;

/**
 * A `<script>` (emitted into exported HTML) that fits every `[data-fit]` element
 * to its box on load, after fonts are ready, and on resize. Bounds come from
 * `data-fit-min` / `data-fit-max`.
 */
export const FIT_HTML_SCRIPT = `    <script>
      (function () {
        function fit(el) {
          var min = +el.getAttribute("data-fit-min") || 8;
          var max = +el.getAttribute("data-fit-max") || 400;
          var lo = min, hi = max, best = min;
          while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            el.style.fontSize = mid + "px";
            if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) {
              best = mid; lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          el.style.fontSize = best + "px";
        }
        function run() {
          document.querySelectorAll("[data-fit]").forEach(fit);
        }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
        else run();
        window.addEventListener("resize", run);
      })();
    </script>`;
