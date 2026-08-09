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
const CACHE_TTL = 5 * 60 * 1000;

function makeHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

async function hogql(
  projectId: string,
  apiKey: string,
  query: string
): Promise<{ columns: string[]; results: unknown[][] }> {
  const res = await fetch(`${POSTHOG_API}/projects/${projectId}/query/`, {
    method: "POST",
    headers: makeHeaders(apiKey),
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  return res.json();
}

function domainWhere(domain?: string): string {
  return domain ? ` AND properties.\$host = '${domain.replace(/'/g, "''")}'` : "";
}

function dateWhere(range: string): string {
  if (range === "last_24_hours") return "timestamp > now() - interval 24 hour";
  if (range === "last_7_days") return "timestamp > now() - interval 7 day";
  return "timestamp > now() - interval 30 day";
}

export const GET = withUser(async (req) => {
  const url = new URL(req.url);
  const metric = url.searchParams.get("metric") || "trends";
  const range = url.searchParams.get("range") || "last_7_days";
  const domain = url.searchParams.get("domain") || undefined;

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

  try {
    if (metric === "dau" || metric === "trends") {
      const dw = dateWhere(range);
      const dom = domainWhere(domain);
      const q = `SELECT toDate(timestamp) as date, count(DISTINCT person_id) as visitors FROM events WHERE event = '$pageview' AND ${dw}${dom} GROUP BY date ORDER BY date`;
      const r = await hogql(projectId, apiKey, q);
      data = {
        result: r.results.map(([date, count]) => ({ date: String(date), count: Number(count) })),
      };
    } else if (metric === "summary") {
      if (!domain) {
        // Per-domain counts
        const hosts = ["zbautomations.ie", "matrix.zbautomations.ie", "builder.zbautomations.ie"];
        const results: { domain: string; count: number }[] = [];
        for (const host of hosts) {
          const dw = dateWhere(range);
          const q = `SELECT count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND properties.\$host = '${host}' AND ${dw}`;
          const r = await hogql(projectId, apiKey, q);
          results.push({ domain: host, count: Number(r.results?.[0]?.[0] ?? 0) });
        }
        data = { result: results };
      } else {
        const dom = domainWhere(domain);
        const dw24 = dateWhere("last_24_hours");
        const dw7 = dateWhere("last_7_days");
        const [v24, pv24, trend] = await Promise.all([
          hogql(
            projectId,
            apiKey,
            `SELECT count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND ${dw24}${dom}`
          ),
          hogql(
            projectId,
            apiKey,
            `SELECT count() FROM events WHERE event = '$pageview' AND ${dw24}${dom}`
          ),
          hogql(
            projectId,
            apiKey,
            `SELECT toDate(timestamp) as date, count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND ${dw7}${dom} GROUP BY date ORDER BY date`
          ),
        ]);
        data = {
          visitors24h: Number(v24.results?.[0]?.[0] ?? 0),
          pageviews24h: Number(pv24.results?.[0]?.[0] ?? 0),
          visitors7d: trend.results.reduce((s, r) => s + Number(r[1] ?? 0), 0),
          sparkline: trend.results.map((r) => Number(r[1] ?? 0)),
        };
      }
    } else if (metric === "top_pages") {
      const dw = dateWhere(range);
      const dom = domainWhere(domain);
      const q = `SELECT properties.\$pathname, count() as c FROM events WHERE event = '$pageview' AND ${dw}${dom} GROUP BY properties.\$pathname ORDER BY c DESC LIMIT 10`;
      const r = await hogql(projectId, apiKey, q);
      data = {
        result: r.results.map(([page, count]) => ({
          page: String(page || "/"),
          count: Number(count),
        })),
      };
    } else if (metric === "referrers") {
      const dw = dateWhere(range);
      const dom = domainWhere(domain);
      const q = `SELECT properties.\$referrer, count() as c FROM events WHERE event = '$pageview' AND ${dw}${dom} GROUP BY properties.\$referrer ORDER BY c DESC LIMIT 10`;
      const r = await hogql(projectId, apiKey, q);
      data = {
        result: r.results.map(([referrer, count]) => ({
          referrer: String(referrer || "direct"),
          count: Number(count),
        })),
      };
    } else if (metric === "geo") {
      const dw = dateWhere(range);
      const dom = domainWhere(domain);
      const q = `SELECT properties.\$geoip_country_code, count() as c FROM events WHERE event = '$pageview' AND ${dw}${dom} GROUP BY properties.\$geoip_country_code ORDER BY c DESC LIMIT 15`;
      const r = await hogql(projectId, apiKey, q);
      data = {
        result: r.results.map(([country, count]) => ({
          country: String(country || "Unknown"),
          count: Number(count),
        })),
      };
    } else {
      return Response.json({ error: `Unknown metric: ${metric}` }, { status: 400 });
    }
  } catch (err) {
    return Response.json(
      { error: `PostHog query failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return Response.json(data);
});
