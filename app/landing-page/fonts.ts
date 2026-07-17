import localFont from "next/font/local";

/**
 * Garet is the brand font already shipped with the render engine
 * (lib/render/font-registry.ts). The landing page sets its display type in it
 * so the marketing site is literally set in the same face templates render
 * with.
 */
export const garet = localFont({
  src: [
    {
      path: "../../public/fonts/garet-400.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/garet-700.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-garet",
  display: "swap",
});
