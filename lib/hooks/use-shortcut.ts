"use client";

import { useEffect } from "react";

interface Options {
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
}

/** Cross-platform: matches metaKey on mac, ctrlKey elsewhere. */
export function useShortcut({ key, meta, shift, alt, handler }: Options) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (meta && !(e.metaKey || e.ctrlKey)) return;
      if (shift && !e.shiftKey) return;
      if (alt && !e.altKey) return;
      if (!meta && (e.metaKey || e.ctrlKey)) return;
      handler(e);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [key, meta, shift, alt, handler]);
}
