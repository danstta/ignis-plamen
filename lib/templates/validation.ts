import { z } from "zod";

/**
 * Light validation for the template write API. The `doc` is produced by our own
 * editor, so we validate the envelope and accept the document body as-is.
 */
/** A fill is a solid CSS color string or a structured gradient. */
const fillSchema = z.union([
  z.string(),
  z.object({
    type: z.enum(["linear", "radial"]),
    angle: z.number().optional(),
    stops: z.array(z.object({ color: z.string(), offset: z.number() })),
  }),
]);

/** One page: its own background + elements (size is shared at the doc level). */
const pageSchema = z.object({
  id: z.string(),
  background: fillSchema,
  elements: z.array(z.any()),
});

export const templateInputSchema = z.object({
  name: z.string().min(1).max(200),
  width: z.number().int().positive().max(10000),
  height: z.number().int().positive().max(10000),
  doc: z.object({
    version: z.literal(2),
    width: z.number(),
    height: z.number(),
    // Optional; z.object strips unknown keys, so brandId must be declared to survive.
    brandId: z.string().optional(),
    pages: z.array(pageSchema).min(1),
  }),
});

export type TemplateInputBody = z.infer<typeof templateInputSchema>;
