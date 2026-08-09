import { withUser } from "@/lib/auth/with-user";
import { getSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POSTHOG_API = "https://app.posthog.com/api";

interface CacheEntry {
  data: unknown;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const GET = withUser(async (req) => {
  const url = new URL(req.url);
  const metric = url.searchParams.get("metric") || "trends";
  const range = url.searchParams.get("range") || "last_7_days";
  const domain = url.searchParams.get("domain");

  const projectId = getSetting("posthog_project_id") || "";
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!projectId || !apiKey) {
    return Response.json({ error: "PostHog not configured" }, { status: 503 });
  }

  const cacheKey = `${metric}:${range}:${domain || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Response.json(cached.data);
  }

  let data: unknown;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  if (metric === "trends") {
    const event = url.searchParams.get("event") || "$pageview";
    const body = {
      date_from: range === "last_24_hours" ? "-24h" : range === "last_7_days" ? "-7d" : "-30d",
      events: [{ id: event, name: event, type: "events", math: "dau" }],
      ...(domain
        ? {
            properties: [{ key: "$host", value: domain, operator: "exact", type: "event" }],
          }
        : {}),
    };
    const res = await fetch(`${POSTHOG_API}/projects/${projectId}/insights/trend/`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    data = await res.json();
  } else if (metric === "summary") {
    const body = {
      date_from: "-24h",
      events: [{ id: "$pageview", name: "Pageviews", type: "events" }],
      ...(domain
        ? {
            properties: [{ key: "$host", value: domain, operator: "exact", type: "event" }],
          }
        : {}),
    };
    const res = await fetch(`${POSTHOG_API}/projects/${projectId}/insights/trend/`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    data = await res.json();
  }
  // More metric types added in future tasks

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return Response.json(data);
});
