import { z } from "zod";

/** Rename payload for PATCH /api/assets/[id]. */
export const renameAssetSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

/** SVG-as-code import payload for POST /api/assets/svg. */
export const importSvgSchema = z.object({
  /** Optional display name; defaults to a generated one when blank. */
  name: z.string().trim().max(200).optional(),
  code: z.string().min(1).max(1_000_000),
});

export type ImportSvgInput = z.infer<typeof importSvgSchema>;

/**
 * Validate pasted SVG markup. Assets are served via `<img src>` (and Satori), where
 * embedded scripts never execute — but we still reject `<script>` so we don't host
 * obviously-active markup, and require a real <svg> root so junk isn't stored.
 */
export function validateSvgCode(code: string): { ok: true } | { ok: false; error: string } {
  const trimmed = code.trim();
  if (!/<svg[\s>]/i.test(trimmed) || !/<\/svg\s*>/i.test(trimmed)) {
    return { ok: false, error: "That doesn't look like SVG markup (missing <svg>…</svg>)." };
  }
  if (/<script[\s>]/i.test(trimmed)) {
    return { ok: false, error: "SVG contains a <script> tag, which isn't allowed." };
  }
  return { ok: true };
}
