import posthog from "posthog-js";
import { getSetting } from "@/lib/db/settings";

export function initPostHog() {
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: "https://app.posthog.com",
    persistence: "localStorage",
    autocapture: true,
    capture_pageview: true,
    capture_performance: true,
  });
}

export function getPostHog() {
  return posthog;
}
