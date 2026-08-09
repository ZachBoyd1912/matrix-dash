"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHog } from "@/lib/posthog";

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(
    function trackPageview() {
      if (typeof window === "undefined") return;
      import("posthog-js")
        .then(({ default: posthog }) => {
          if (posthog.__loaded) posthog.capture("$pageview");
        })
        .catch(() => {});
    },
    [pathname, searchParams]
  );

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(function initAnalytics() {
    initPostHog();
  }, []);

  return (
    <Suspense fallback={null}>
      <PageviewTracker />
      {children}
    </Suspense>
  );
}
