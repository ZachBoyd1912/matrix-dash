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
interface BreakdownEntry {
  label: string;
  count: number;
}

export function DomainDetail({ domain }: DomainDetailProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [dau, setDau] = useState<DauPoint[]>([]);
  const [topPages, setTopPages] = useState<BreakdownEntry[]>([]);
  const [referrers, setReferrers] = useState<BreakdownEntry[]>([]);
  const [geo, setGeo] = useState<BreakdownEntry[]>([]);
  const [uptime, setUptime] = useState<{
    ok: boolean;
    lastStatus: number | null;
    everChecked: boolean;
    lastCheckedAt: string | null;
  } | null>(null);

  useEffect(
    function fetchAll() {
      async function load() {
        setLoading(true);
        const enc = encodeURIComponent(domain);
        try {
          const results = await Promise.allSettled([
            fetch(`/api/analytics?metric=summary&domain=${enc}`).then((r) => r.json()),
            fetch(`/api/analytics?metric=dau&domain=${enc}&range=last_7_days`).then((r) =>
              r.json()
            ),
            fetch(`/api/analytics?metric=top_pages&domain=${enc}&range=last_7_days`).then((r) =>
              r.json()
            ),
            fetch(`/api/analytics?metric=referrers&domain=${enc}&range=last_7_days`).then((r) =>
              r.json()
            ),
            fetch(`/api/analytics?metric=geo&domain=${enc}&range=last_30_days`).then((r) =>
              r.json()
            ),
            fetch("/api/sites").then((r) =>
              r.ok
                ? (r.json() as Promise<
                    {
                      label: string;
                      ok: boolean;
                      lastStatus: number | null;
                      everChecked: boolean;
                      lastCheckedAt: string | null;
                    }[]
                  >)
                : null
            ),
          ]);
          const [sRes, dRes, pRes, rRes, gRes, uRes] = results;
          if (sRes.status === "fulfilled")
            setSummary({
              visitors24h: sRes.value.visitors24h ?? 0,
              visitors7d: sRes.value.visitors7d ?? 0,
              pageviews24h: sRes.value.pageviews24h ?? 0,
              sparkline: sRes.value.sparkline ?? [],
            });
          if (dRes.status === "fulfilled") setDau(dRes.value.result ?? []);
          if (pRes.status === "fulfilled")
            setTopPages(
              pRes.value.result?.map((e: Record<string, unknown>) => ({
                label: String(e.page || "/"),
                count: Number(e.count ?? 0),
              })) ?? []
            );
          if (rRes.status === "fulfilled")
            setReferrers(
              rRes.value.result?.map((e: Record<string, unknown>) => ({
                label: String(e.referrer || "direct"),
                count: Number(e.count ?? 0),
              })) ?? []
            );
          if (gRes.status === "fulfilled")
            setGeo(
              gRes.value.result?.map((e: Record<string, unknown>) => ({
                label: String(e.country || "Unknown"),
                count: Number(e.count ?? 0),
              })) ?? []
            );
          if (uRes.status === "fulfilled" && uRes.value) {
            const match = uRes.value.find((s: { label: string }) => s.label === domain);
            if (match)
              setUptime({
                ok: match.ok,
                lastStatus: match.lastStatus,
                everChecked: match.everChecked,
                lastCheckedAt: match.lastCheckedAt,
              });
          }
        } catch {
          /* errors handled per-panel */
        }
        setLoading(false);
      }
      load();
    },
    [domain]
  );

  function timeAgo(iso: string | null): string {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  }

  const maxDau = Math.max(...dau.map((p) => p.count), 1);

  return (
    <div className="space-y-6">
      {/* Header with uptime */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="display text-gradient text-3xl">{domain}</h1>
        {uptime && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${uptime.everChecked ? (uptime.ok ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300") : "bg-text-muted/15 text-text-muted"}`}
          >
            {uptime.everChecked
              ? uptime.ok
                ? "Online"
                : `Down (${uptime.lastStatus})`
              : "Not checked"}
            {uptime.lastCheckedAt && ` · ${timeAgo(uptime.lastCheckedAt)}`}
          </span>
        )}
      </div>

      {/* Summary tiles */}
      {summary ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricTile label="Visitors (24h)" value={summary.visitors24h} />
          <MetricTile label="Page Views (24h)" value={summary.pageviews24h} />
          <MetricTile label="Visitors (7d)" value={summary.visitors7d} />
          <MetricTile
            label="Avg. Daily"
            value={summary.visitors7d > 0 ? Math.round(summary.visitors7d / 7) : "—"}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricTile label="Visitors (24h)" value={loading ? "…" : "—"} />
          <MetricTile label="Page Views (24h)" value={loading ? "…" : "—"} />
          <MetricTile label="Avg. Duration" value={loading ? "…" : "—"} />
          <MetricTile label="Bounce Rate" value={loading ? "…" : "—"} />
        </div>
      )}

      {/* DAU trend */}
      <div className="bg-bg-surface rounded-xl border border-white/5 p-4 md:p-6">
        <h3 className="text-text-primary mb-4 text-sm font-semibold">
          Daily Active Users — Last 7 Days
        </h3>
        {loading ? (
          <Loader2 className="text-text-muted mx-auto h-5 w-5 animate-spin" />
        ) : dau.length > 0 ? (
          <div>
            <div className="flex h-36 items-end gap-1 md:h-40">
              {dau.map((point) => {
                const height = Math.max(4, (point.count / maxDau) * 160);
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
          <p className="text-text-muted py-8 text-center text-xs">
            No trend data yet — events may still be accumulating
          </p>
        )}
      </div>

      {/* Top pages + Referrers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-text-muted text-xs font-medium tracking-wider uppercase">
            Top Pages
          </h3>
          {topPages.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {topPages.slice(0, 6).map((p) => (
                <li key={p.label} className="flex items-center justify-between">
                  <span className="text-text-primary truncate text-xs font-medium">{p.label}</span>
                  <span className="text-text-muted ml-2 shrink-0 text-xs tabular-nums">
                    {p.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted mt-4 text-center text-xs">No page data yet</p>
          )}
        </div>

        <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-text-muted text-xs font-medium tracking-wider uppercase">
            Top Referrers
          </h3>
          {referrers.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {referrers.slice(0, 6).map((r) => (
                <li key={r.label} className="flex items-center justify-between">
                  <span className="text-text-primary truncate text-xs font-medium">{r.label}</span>
                  <span className="text-text-muted ml-2 shrink-0 text-xs tabular-nums">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted mt-4 text-center text-xs">No referrer data yet</p>
          )}
        </div>
      </div>

      {/* Geography */}
      <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
        <h3 className="text-text-muted text-xs font-medium tracking-wider uppercase">
          Geography — Last 30 Days
        </h3>
        {geo.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {geo.map((g) => (
              <span
                key={g.label}
                className="text-text-primary inline-flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-xs"
              >
                {g.label} <span className="text-text-muted tabular-nums">{g.count}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-text-muted py-4 text-center text-xs">No geographic data yet</p>
        )}
      </div>

      {/* Sparkline summary */}
      {summary && summary.sparkline.length > 0 && (
        <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-text-muted mb-2 text-xs font-medium tracking-wider uppercase">
            Daily Visitors — 7-Day Trend
          </h3>
          <div className="flex h-12 items-end gap-1">
            {summary.sparkline.map((v, i) => {
              const max = Math.max(...summary.sparkline, 1);
              const h = Math.max(3, (v / max) * 48);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-emerald-400/80"
                  style={{ height: h }}
                  title={`${v}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
