"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHog } from "@/lib/posthog";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Init PostHog once on mount
  useEffect(function initAnalytics() {
    initPostHog();
  }, []);

  // Track SPA pageviews on every route change
  useEffect(
    function trackPageview() {
      if (typeof window === "undefined") return;
      // Dynamic import so posthog-js isn't bundled if not initialized
      import("posthog-js")
        .then(({ default: posthog }) => {
          if (posthog.__loaded) {
            posthog.capture("$pageview");
          }
        })
        .catch(() => {});
    },
    [pathname, searchParams]
  );

  return <>{children}</>;
}
