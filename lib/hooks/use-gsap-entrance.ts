"use client";

import { useEffect, useRef } from "react";

/**
 * Staggered fade+rise entrance on every direct child of the ref element.
 * GSAP is dynamically imported so it never lands in a shared bundle — the
 * animation is pure garnish, so first paint should never wait on it.
 * Respects prefers-reduced-motion (skips loading GSAP entirely).
 */
export function useGsapEntrance() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (typeof window !== "undefined") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (reduced.matches) return;
    }

    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    import("gsap").then(({ gsap }) => {
      // Component may have unmounted (or navigated away) before GSAP loaded.
      if (cancelled || !ref.current) return;
      ctx = gsap.context(() => {
        gsap.from(ref.current!.children, {
          opacity: 0,
          y: 12,
          duration: 0.4,
          stagger: 0.05,
          ease: "cubic-bezier(0.32, 0.72, 0, 1)",
          clearProps: "all",
        });
      }, ref);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return ref;
}
