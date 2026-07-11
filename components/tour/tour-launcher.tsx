"use client";

import { useEffect, useRef } from "react";
import { useTour } from "@/lib/stores/use-tour";
import { TourOverlay } from "./tour-overlay";

/**
 * Mounts the tour overlay and auto-launches it once, on first login, when the
 * account hasn't completed it (tutorialCompletedAt null). Replays are triggered
 * from Settings via useTour().start().
 */
export function TourLauncher() {
  const start = useTour((s) => s.start);
  const launched = useRef(false);

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user && !data.user.tutorialCompletedAt) {
          start({ isOwner: data.user.role === "owner" });
        }
      } catch {
        /* never block the app on the tour */
      }
    })();
  }, [start]);

  return <TourOverlay />;
}
