import { FONTS } from "@/lib/render/font-registry";
import { buildEditorFontCss } from "@/lib/render/font-assets";

export const dynamic = "force-static";

const css = buildEditorFontCss(FONTS);

export async function GET() {
  return new Response(css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
