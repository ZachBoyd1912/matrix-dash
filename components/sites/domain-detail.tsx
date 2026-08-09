"use client";

import { Loader2 } from "lucide-react";
import { MetricTile } from "@/components/sites/metric-tile";

interface DomainDetailProps {
  domain: string;
}

export function DomainDetail({ domain }: DomainDetailProps) {
  return (
    <>
      <h1 className="display text-gradient text-3xl">{domain}</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile label="Unique Visitors (24h)" value="—" />
        <MetricTile label="Page Views (24h)" value="—" />
        <MetricTile label="Avg. Duration" value="—" />
        <MetricTile label="Bounce Rate" value="—" />
      </div>

      {/* Trend chart placeholder — Task 7 wires real data */}
      <div className="bg-bg-surface rounded-xl border border-white/5 p-6">
        <h3 className="text-text-primary mb-4 text-sm font-semibold">Visitors — Last 7 Days</h3>
        <div className="text-text-muted flex items-center justify-center py-12 text-xs">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading analytics data…
        </div>
      </div>

      {/* Additional metric panels: referrers, geography */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-text-muted text-xs font-medium tracking-wider uppercase">
            Top Referrers
          </h3>
          <p className="text-text-muted mt-4 text-center text-xs">Data loads from PostHog</p>
        </div>
        <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-text-muted text-xs font-medium tracking-wider uppercase">
            Geography
          </h3>
          <p className="text-text-muted mt-4 text-center text-xs">Data loads from PostHog</p>
        </div>
      </div>
    </>
  );
}
