"use client";

import { MetricTile } from "./metric-tile";

interface SiteData {
  domain: string;
  label: string;
  visitors24h: number;
  visitors7d: number;
  pageviews24h: number;
  sparkline: number[];
  status: "up" | "down" | "unknown";
  lastStatus?: number;
}

export function SiteCard({ site }: { site: SiteData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={
            site.status === "up"
              ? "h-2 w-2 rounded-full bg-emerald-400"
              : site.status === "down"
                ? "h-2 w-2 rounded-full bg-rose-400"
                : "bg-text-muted h-2 w-2 rounded-full"
          }
        />
        <h2 className="text-text-primary text-lg font-semibold">{site.domain}</h2>
        {site.lastStatus && <span className="text-text-muted text-xs">({site.lastStatus})</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile label="Visitors (24h)" value={site.visitors24h} />
        <MetricTile label="Visitors (7d)" value={site.visitors7d} />
        <MetricTile label="Pageviews (24h)" value={site.pageviews24h} />
        <MetricTile
          label="Uptime"
          value={site.status === "up" ? "Online" : site.status === "down" ? "Down" : "Unknown"}
        />
      </div>
    </div>
  );
}
