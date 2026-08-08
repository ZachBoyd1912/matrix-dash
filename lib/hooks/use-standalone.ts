"use client";

import { useEffect, useState } from "react";

interface StandaloneState {
  /** True when running as an installed PWA (iOS standalone or Chromium display-mode). */
  isStandalone: boolean;
  /** True specifically when running on iOS (via `navigator.standalone` detection). */
  isIOS: boolean;
}

/**
 * Detects whether the app is running in standalone (installed PWA) mode.
 * iOS: `window.navigator.standalone` is true when launched from Home Screen.
 * Chromium: `matchMedia('(display-mode: standalone)').matches`.
 *
 * When standalone is detected, a `standalone-mode` class is added to `<html>`
 * for CSS adaptations (safe areas, overscroll, browser-chrome replacement).
 */
export function useStandalone(): StandaloneState {
  const [state, setState] = useState<StandaloneState>({
    isStandalone: false,
    isIOS: false,
  });

  useEffect(function detectStandalone() {
    if (typeof window === "undefined") return;

    const check = function updateStandaloneFlag() {
      const iosStandalone =
        "standalone" in window.navigator &&
        (window.navigator as { standalone?: boolean }).standalone === true;
      const chromeStandalone = window.matchMedia("(display-mode: standalone)").matches;
      const isStandalone = iosStandalone || chromeStandalone;

      setState({ isStandalone, isIOS: iosStandalone });

      if (isStandalone) {
        document.documentElement.classList.add("standalone-mode");
      } else {
        document.documentElement.classList.remove("standalone-mode");
      }
    };

    check();

    // Chromium display-mode can change (unlikely in practice, but correct).
    const mql = window.matchMedia("(display-mode: standalone)");
    mql.addEventListener("change", check);
    return function cleanupStandaloneListener() {
      mql.removeEventListener("change", check);
    };
  }, []);

  return state;
}
