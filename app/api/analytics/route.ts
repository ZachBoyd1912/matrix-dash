import { withUser } from "@/lib/auth/with-user";
import { getSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POSTHOG_API = "https://eu.posthog.com/api";

interface CacheEntry {
  data: unknown;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── shared helpers ──────────────────────────────────────────────

function makeHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function dateFromParam(range: string): string {
  if (range === "last_24_hours") return "-24h";
  if (range === "last_7_days") return "-7d";
  return "-30d";
}

function domainFilter(domain?: string) {
  return domain
    ? { properties: [{ key: "$host", value: domain, operator: "exact", type: "event" }] }
    : {};
}

function posthogTrendUrl(projectId: string) {
  return `${POSTHOG_API}/projects/${projectId}/insights/trend/`;
}

function posthogInsightUrl(projectId: string) {
  return `${POSTHOG_API}/projects/${projectId}/insights/`;
}

// ── placeholder generators (seeded by domain for variety) ──────

function seedFromDomain(domain: string) {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function placeholderSummary(domain: string) {
  const s = seedFromDomain(domain);
  return {
    visitors24h: 30 + (s % 60),
    visitors7d: 200 + (s % 300),
    pageviews24h: 80 + (s % 200),
    sparkline: Array.from({ length: 7 }, (_, i) => 25 + ((s + i * 7) % 50)),
    placeholder: true,
  };
}

function placeholderDau(domain: string) {
  const s = seedFromDomain(domain);
  const today = new Date();
  return {
    result: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      return {
        date: d.toISOString().slice(0, 10),
        count: 25 + ((s + i * 11) % 55),
      };
    }),
    placeholder: true,
  };
}

function placeholderTopPages(domain: string) {
  const s = seedFromDomain(domain);
  return {
    result: [
      { page: "/", count: 100 + (s % 80) },
      { page: "/dashboard", count: 50 + (s % 60) },
      { page: "/about", count: 30 + (s % 40) },
      { page: "/contact", count: 15 + (s % 25) },
    ],
    placeholder: true,
  };
}

function placeholderReferrers(_domain: string) {
  return {
    result: [
      { referrer: "google.com", count: 45 },
      { referrer: "twitter.com", count: 20 },
      { referrer: "linkedin.com", count: 12 },
      { referrer: "direct", count: 80 },
    ],
    placeholder: true,
  };
}

function placeholderGeo(_domain: string) {
  return {
    result: [
      { country: "United States", count: 60 },
      { country: "Ireland", count: 40 },
      { country: "United Kingdom", count: 25 },
      { country: "Germany", count: 18 },
      { country: "Canada", count: 12 },
    ],
    placeholder: true,
  };
}

// ── route handler ───────────────────────────────────────────────

export const GET = withUser(async (req) => {
  const url = new URL(req.url);
  const metric = url.searchParams.get("metric") || "trends";
  const range = url.searchParams.get("range") || "last_7_days";
  const domain = url.searchParams.get("domain") || undefined;

  const projectId = getSetting("posthog_project_id") || "";
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;

  // ── no PostHog keys → return placeholder data ──────────────────
  if (!projectId || !apiKey) {
    if (metric === "summary" && !domain) {
      return Response.json({
        result: [
          { domain: "zbautomations.ie", count: 142 },
          { domain: "matrix.zbautomations.ie", count: 87 },
          { domain: "builder.zbautomations.ie", count: 31 },
        ],
        placeholder: true,
      });
    }
    if (metric === "summary" && domain) return Response.json(placeholderSummary(domain));
    if (metric === "dau") return Response.json(placeholderDau(domain || "unknown"));
    if (metric === "top_pages") return Response.json(placeholderTopPages(domain || "unknown"));
    if (metric === "referrers") return Response.json(placeholderReferrers(domain || "unknown"));
    if (metric === "geo") return Response.json(placeholderGeo(domain || "unknown"));
    return Response.json({ error: "PostHog not configured" }, { status: 503 });
  }

  // ── cache check ───────────────────────────────────────────────
  const cacheKey = `${metric}:${range}:${domain || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Response.json(cached.data);
  }

  const headers = makeHeaders(apiKey);
  let data: unknown;

  // ── metric: dau ───────────────────────────────────────────────
  if (metric === "dau") {
    const body = {
      date_from: dateFromParam(range),
      events: [{ id: "$pageview", name: "$pageview", type: "events", math: "dau" }],
      ...domainFilter(domain),
    };
    const res = await fetch(posthogTrendUrl(projectId), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    // PostHog returns { result: [{ days: [...], data: [...] }] }
    // Map into [{ date, count }]
    const raw = (json as { result?: Array<{ days: string[]; data: number[] }> }).result?.[0];
    if (raw) {
      data = {
        result: raw.days.map((d, i) => ({ date: d, count: raw.data[i] ?? 0 })),
      };
    } else {
      data = json;
    }

    // ── metric: summary ───────────────────────────────────────────
  } else if (metric === "summary") {
    // Without domain: return per-domain counts (existing behaviour)
    if (!domain) {
      const res = await fetch(posthogTrendUrl(projectId), {
        method: "POST",
        headers,
        body: JSON.stringify({
          date_from: "-24h",
          events: [{ id: "$pageview", name: "Pageviews", type: "events" }],
        }),
      });
      data = await res.json();
    } else {
      // Per-domain summary: fetch 24h DAU + 24h total + 7d DAU trend in parallel
      const baseBody = (overrides: Record<string, unknown>) => ({
        ...domainFilter(domain),
        ...overrides,
      });

      const [vis24, pv24, trend7d] = await Promise.all([
        fetch(posthogTrendUrl(projectId), {
          method: "POST",
          headers,
          body: JSON.stringify(
            baseBody({
              date_from: "-24h",
              events: [{ id: "$pageview", name: "Visitors 24h", type: "events", math: "dau" }],
            })
          ),
        }).then((r) => r.json()),
        fetch(posthogTrendUrl(projectId), {
          method: "POST",
          headers,
          body: JSON.stringify(
            baseBody({
              date_from: "-24h",
              events: [{ id: "$pageview", name: "Pageviews 24h", type: "events" }],
            })
          ),
        }).then((r) => r.json()),
        fetch(posthogTrendUrl(projectId), {
          method: "POST",
          headers,
          body: JSON.stringify(
            baseBody({
              date_from: "-7d",
              events: [{ id: "$pageview", name: "DAU trend", type: "events", math: "dau" }],
            })
          ),
        }).then((r) => r.json()),
      ]);

      type TrendResult = { result?: Array<{ data: number[] }> };
      const v24 = (vis24 as TrendResult).result?.[0]?.data?.[0] ?? 0;
      const p24 = (pv24 as TrendResult).result?.[0]?.data?.[0] ?? 0;
      const trend = (trend7d as TrendResult).result?.[0]?.data ?? [];
      const v7d = trend.reduce((a, b) => a + b, 0);

      data = { visitors24h: v24, visitors7d: v7d, pageviews24h: p24, sparkline: trend };
    }

    // ── metric: trends (legacy) ───────────────────────────────────
  } else if (metric === "trends") {
    const event = url.searchParams.get("event") || "$pageview";
    const body = {
      date_from: dateFromParam(range),
      events: [{ id: event, name: event, type: "events", math: "dau" }],
      ...domainFilter(domain),
    };
    const res = await fetch(posthogTrendUrl(projectId), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    data = await res.json();

    // ── metric: top_pages ― breakdown by pathname ─────────────────
  } else if (metric === "top_pages") {
    const body = {
      date_from: dateFromParam(range),
      insight: "TRENDS",
      display: "ActionsTable",
      events: [{ id: "$pageview", name: "$pageview", type: "events", math: "total" }],
      breakdown_type: "event",
      breakdown: "$pathname",
      ...domainFilter(domain),
    };
    const res = await fetch(posthogInsightUrl(projectId), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    // Map { result: [{ breakdown_value, aggregated_value }] }
    const raw = (json as { result?: Array<{ breakdown_value: string; aggregated_value: number }> })
      .result;
    data = raw
      ? {
          result: raw
            .slice(0, 10)
            .map((r) => ({ page: r.breakdown_value, count: r.aggregated_value })),
        }
      : json;

    // ── metric: referrers ― breakdown by referrer ─────────────────
  } else if (metric === "referrers") {
    const body = {
      date_from: dateFromParam(range),
      insight: "TRENDS",
      display: "ActionsTable",
      events: [{ id: "$pageview", name: "$pageview", type: "events", math: "total" }],
      breakdown_type: "event",
      breakdown: "$referrer",
      ...domainFilter(domain),
    };
    const res = await fetch(posthogInsightUrl(projectId), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    const raw = (json as { result?: Array<{ breakdown_value: string; aggregated_value: number }> })
      .result;
    data = raw
      ? {
          result: raw
            .slice(0, 10)
            .map((r) => ({ referrer: r.breakdown_value || "direct", count: r.aggregated_value })),
        }
      : json;

    // ── metric: geo ― breakdown by country ────────────────────────
  } else if (metric === "geo") {
    const body = {
      date_from: dateFromParam(range),
      insight: "TRENDS",
      display: "ActionsTable",
      events: [{ id: "$pageview", name: "$pageview", type: "events", math: "total" }],
      breakdown_type: "event",
      breakdown: "$geoip_country_code",
      ...domainFilter(domain),
    };
    const res = await fetch(posthogInsightUrl(projectId), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    const raw = (json as { result?: Array<{ breakdown_value: string; aggregated_value: number }> })
      .result;
    data = raw
      ? {
          result: raw
            .slice(0, 15)
            .map((r) => ({ country: r.breakdown_value, count: r.aggregated_value })),
        }
      : json;
  }

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return Response.json(data);
});
