"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MetricTile } from "@/components/sites/metric-tile";

interface DomainDetailProps {
  domain: string;
}

interface SummaryData {
  visitors24h: number;
  visitors7d: number;
  pageviews24h: number;
  sparkline: number[];
}

interface DauPoint {
  date: string;
  count: number;
}

interface PageEntry {
  page: string;
  count: number;
}

interface ReferrerEntry {
  referrer: string;
  count: number;
}

interface GeoEntry {
  country: string;
  count: number;
}

export function DomainDetail({ domain }: DomainDetailProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [dau, setDau] = useState<DauPoint[]>([]);
  const [topPages, setTopPages] = useState<PageEntry[]>([]);
  const [referrers, setReferrers] = useState<ReferrerEntry[]>([]);
  const [geo, setGeo] = useState<GeoEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);

      const enc = encodeURIComponent(domain);

      try {
        const results = await Promise.allSettled([
          fetch(`/api/analytics?metric=summary&domain=${enc}&range=last_24_hours`).then((r) =>
            r.json()
          ),
          fetch(`/api/analytics?metric=dau&domain=${enc}&range=last_7_days`).then((r) => r.json()),
          fetch(`/api/analytics?metric=top_pages&domain=${enc}&range=last_7_days`).then((r) =>
            r.json()
          ),
          fetch(`/api/analytics?metric=referrers&domain=${enc}&range=last_7_days`).then((r) =>
            r.json()
          ),
          fetch(`/api/analytics?metric=geo&domain=${enc}&range=last_7_days`).then((r) => r.json()),
        ]);

        const [sRes, dRes, pRes, rRes, gRes] = results;

        if (sRes.status === "fulfilled") {
          setSummary({
            visitors24h: sRes.value.visitors24h ?? 0,
            visitors7d: sRes.value.visitors7d ?? 0,
            pageviews24h: sRes.value.pageviews24h ?? 0,
            sparkline: sRes.value.sparkline ?? [],
          });
        }
        if (dRes.status === "fulfilled") setDau(dRes.value.result ?? []);
        if (pRes.status === "fulfilled") setTopPages(pRes.value.result ?? []);
        if (rRes.status === "fulfilled") setReferrers(rRes.value.result ?? []);
        if (gRes.status === "fulfilled") setGeo(gRes.value.result ?? []);
      } catch {
        setError("Failed to load analytics data");
      }

      setLoading(false);
    }

    fetchAll();
  }, [domain]);

  return (
    <>
      <h1 className="display text-gradient text-3xl">{domain}</h1>

      {/* ── Summary metric tiles ──────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-text-muted h-5 w-5 animate-spin" />
          <span className="text-text-muted ml-2 text-xs">Loading metrics…</span>
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricTile label="Unique Visitors (24h)" value={summary.visitors24h} />
          <MetricTile label="Page Views (24h)" value={summary.pageviews24h} />
          <MetricTile label="Visitors (7d)" value={summary.visitors7d} />
          <MetricTile
            label="Avg. Daily"
            value={summary.visitors7d > 0 ? Math.round(summary.visitors7d / 7) : "—"}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricTile label="Unique Visitors (24h)" value="—" />
          <MetricTile label="Page Views (24h)" value="—" />
          <MetricTile label="Avg. Duration" value="—" />
          <MetricTile label="Bounce Rate" value="—" />
        </div>
      )}

      {/* ── DAU trend chart ──────────────────────────────────── */}
      <div className="bg-bg-surface rounded-xl border border-white/5 p-6">
        <h3 className="text-text-primary mb-4 text-sm font-semibold">
          Daily Active Users — Last 7 Days
        </h3>
        {loading ? (
          <div className="text-text-muted flex items-center justify-center py-12 text-xs">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading analytics data…
          </div>
        ) : dau.length > 0 ? (
          <div>
            <div className="flex h-40 items-end gap-1">
              {dau.map((point) => {
                const max = Math.max(...dau.map((p) => p.count), 1);
                const height = Math.max(4, (point.count / max) * 160);
                return (
                  <div
                    key={point.date}
                    className="group relative flex flex-1 flex-col items-center justify-end"
                  >
                    <span className="text-text-muted mb-1 text-[10px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
                      {point.count}
                    </span>
                    <div
                      className="w-full rounded-sm bg-emerald-400/70 transition-colors hover:bg-emerald-400"
                      style={{ height }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between">
              {dau.map((point) => (
                <span key={point.date} className="text-text-muted text-[9px]">
                  {new Date(point.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-text-muted py-8 text-center text-xs">No trend data available</p>
        )}
      </div>

      {/* ── Top pages + Referrers ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Top pages */}
        <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-text-muted text-xs font-medium tracking-wider uppercase">
            Top Pages
          </h3>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="text-text-muted h-4 w-4 animate-spin" />
            </div>
          ) : topPages.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {topPages.slice(0, 5).map((p) => (
                <li key={p.page} className="flex items-center justify-between">
                  <span className="text-text-primary truncate text-xs font-medium">{p.page}</span>
                  <span className="text-text-muted ml-2 shrink-0 text-xs tabular-nums">
                    {p.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted mt-4 text-center text-xs">No page data available</p>
          )}
        </div>

        {/* Top referrers */}
        <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-text-muted text-xs font-medium tracking-wider uppercase">
            Top Referrers
          </h3>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="text-text-muted h-4 w-4 animate-spin" />
            </div>
          ) : referrers.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {referrers.slice(0, 5).map((r) => (
                <li key={r.referrer} className="flex items-center justify-between">
                  <span className="text-text-primary truncate text-xs font-medium">
                    {r.referrer || "direct"}
                  </span>
                  <span className="text-text-muted ml-2 shrink-0 text-xs tabular-nums">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted mt-4 text-center text-xs">No referrer data available</p>
          )}
        </div>
      </div>

      {/* ── Geography ────────────────────────────────────────── */}
      <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
        <h3 className="text-text-muted text-xs font-medium tracking-wider uppercase">Geography</h3>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="text-text-muted h-4 w-4 animate-spin" />
          </div>
        ) : geo.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {geo.slice(0, 12).map((g) => (
              <span
                key={g.country}
                className="bg-bg-raised text-text-primary inline-flex items-center gap-1 rounded-full border border-white/5 px-3 py-1 text-xs"
              >
                {g.country} <span className="text-text-muted tabular-nums">{g.count}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-text-muted py-4 text-center text-xs">No geographic data available</p>
        )}
      </div>

      {/* ── Error banner ─────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3">
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}
    </>
  );
}
