"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Loader2 } from "lucide-react";
import { MetricTile } from "@/components/sites/metric-tile";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

interface SiteHealth {
  id: string;
  label: string;
  lastStatus: number | null;
  ok: boolean;
  everChecked: boolean;
  lastCheckedAt: string | null;
}

interface SiteSummary {
  visitors24h: number;
  visitors7d: number;
  pageviews24h: number;
  sparkline: number[];
}

interface SiteEntry {
  domain: string;
  label: string;
  health: SiteHealth | null;
  summary: SiteSummary;
}

const DOMAINS = [
  { domain: "zbautomations.ie", label: "Landing" },
  { domain: "matrix.zbautomations.ie", label: "Dashboard" },
  { domain: "builder.zbautomations.ie", label: "Builder" },
];

export default function SitesPage() {
  const ref = useGsapEntrance();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteEntry[]>([]);

  useEffect(function loadSites() {
    async function fetchData() {
      setLoading(true);

      // Fetch site_health (uptime) and PostHog summary in parallel
      const [healthRes, summaryRes] = await Promise.all([
        fetch("/api/sites").then((r) => (r.ok ? (r.json() as Promise<SiteHealth[]>) : null)),
        fetch("/api/analytics?metric=summary").then((r) =>
          r.ok ? (r.json() as Promise<{ result: { domain: string; count: number }[] }>) : null
        ),
      ]);

      const healthMap = new Map((healthRes || []).map((h: SiteHealth) => [h.label, h]));

      // Fetch per-domain summary data
      const entries = await Promise.all(
        DOMAINS.map(async (d): Promise<SiteEntry> => {
          try {
            const res = await fetch(
              `/api/analytics?metric=summary&domain=${encodeURIComponent(d.domain)}`
            );
            const json = await res.json();
            return {
              ...d,
              health: healthMap.get(d.domain) || null,
              summary: {
                visitors24h: json.visitors24h ?? 0,
                visitors7d: json.visitors7d ?? 0,
                pageviews24h: json.pageviews24h ?? 0,
                sparkline: json.sparkline ?? [],
              },
            };
          } catch {
            return {
              ...d,
              health: healthMap.get(d.domain) || null,
              summary: { visitors24h: 0, visitors7d: 0, pageviews24h: 0, sparkline: [] },
            };
          }
        })
      );

      setSites(entries);
      setLoading(false);
    }
    fetchData();
  }, []);

  function statusLabel(h: SiteHealth | null): { text: string; dot: string } {
    if (!h || !h.everChecked) return { text: "Not checked", dot: "bg-text-muted" };
    if (h.ok) return { text: "Online", dot: "bg-emerald-400" };
    return { text: `Down (${h.lastStatus})`, dot: "bg-rose-400" };
  }

  function timeAgo(iso: string | null): string {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  }

  return (
    <div ref={ref} className="mx-auto max-w-5xl space-y-8 px-4 py-8 md:px-8">
      <div>
        <span className="eyebrow">
          <Globe size={11} /> Analytics
        </span>
        <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Sites</h1>
        <p className="text-text-secondary mt-2 text-sm">
          Real-time analytics and uptime across all ZB Automations domains. Powered by PostHog.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="text-text-muted h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {sites.map((site) => {
            const st = statusLabel(site.health);
            const s = site.summary;
            return (
              <div key={site.domain} className="space-y-4">
                {/* Domain header */}
                <Link
                  href={`/dashboard/sites/${encodeURIComponent(site.domain)}`}
                  className="group flex items-center gap-3"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
                  <h2 className="text-text-primary text-lg font-semibold transition-colors group-hover:text-emerald-400">
                    {site.domain}
                  </h2>
                  <span className="text-text-muted text-xs">
                    {st.text}
                    {site.health?.lastCheckedAt &&
                      ` · checked ${timeAgo(site.health.lastCheckedAt)}`}
                  </span>
                </Link>

                {/* Metric tiles */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricTile label="Visitors (24h)" value={s.visitors24h} />
                  <MetricTile label="Visitors (7d)" value={s.visitors7d} />
                  <MetricTile label="Pageviews (24h)" value={s.pageviews24h} />
                  <MetricTile label="Uptime" value={st.text} />
                </div>

                {/* Sparkline trend */}
                {s.sparkline.length > 0 && (
                  <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
                    <p className="text-text-muted mb-2 text-[11px] font-medium tracking-wider uppercase">
                      Daily Visitors — Last 7 Days
                    </p>
                    <div className="flex h-12 items-end gap-1">
                      {s.sparkline.map((v, i) => {
                        const max = Math.max(...s.sparkline, 1);
                        const h = Math.max(3, (v / max) * 48);
                        return (
                          <div
                            key={i}
                            className="flex-1 rounded-sm bg-emerald-400/80 transition-colors hover:bg-emerald-400"
                            style={{ height: h }}
                            title={`Day ${i + 1}: ${v}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
