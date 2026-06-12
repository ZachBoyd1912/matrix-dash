"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * Staggered fade+rise entrance on every direct child of the ref element.
 * Respects prefers-reduced-motion automatically (the keyframes in
 * globals.css zero out durations, but GSAP needs the matchMedia check too).
 */
export function useGsapEntrance() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (typeof window !== "undefined") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (reduced.matches) {
        gsap.set(ref.current.children, { opacity: 1, y: 0 });
        return;
      }
    }
    const ctx = gsap.context(() => {
      gsap.from(ref.current!.children, {
        opacity: 0,
        y: 12,
        duration: 0.4,
        stagger: 0.05,
        ease: "cubic-bezier(0.32, 0.72, 0, 1)",
        clearProps: "all",
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  return ref;
}
