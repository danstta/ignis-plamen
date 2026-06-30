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

/** True if any text element in the document uses fit-to-box. */
export function docHasAutoFit(doc: TemplateDoc): boolean {
  return doc.pages.some((page) =>
    page.elements.some((el) => el.type === "text" && el.autoFit),
  );
}

/**
 * Source for a `<FitText>` React component (emitted into exported `.tsx` files).
 * Binary-searches `font-size` in `[min, max]` so the text fits the box after
 * layout. Depends only on `React`, already imported by the generated file.
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
  contentStyle: React.CSSProperties;
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
      <div style={contentStyle}>{children}</div>
    </div>
  );
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
