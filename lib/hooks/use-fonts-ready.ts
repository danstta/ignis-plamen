"use client";

import { useEffect, useState } from "react";

/**
 * Returns a counter that bumps when the document's web fonts finish loading (and
 * on later font loads). Auto-fit measurement relies on `canvas.measureText`,
 * which reports fallback metrics until the real font is ready — depending on this
 * value forces a re-fit once the correct font is available, so the first paint
 * doesn't sit on a slightly-wrong size.
 */
export function useFontsReady(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fonts = (
      document as Document & { fonts?: FontFaceSet }
    ).fonts;
    if (!fonts) return;
    let active = true;
    const bump = () => active && setTick((t) => t + 1);
    fonts.ready.then(bump);
    fonts.addEventListener?.("loadingdone", bump);
    return () => {
      active = false;
      fonts.removeEventListener?.("loadingdone", bump);
    };
  }, []);
  return tick;
}
