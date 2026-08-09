"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { SiteCard } from "@/components/sites/site-card";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

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

const SITES: { domain: string; label: string }[] = [
  { domain: "zbautomations.ie", label: "Landing" },
  { domain: "matrix.zbautomations.ie", label: "Dashboard" },
  { domain: "builder.zbautomations.ie", label: "Builder" },
];

export default function SitesPage() {
  const ref = useGsapEntrance();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteData[]>([]);

  useEffect(function loadSiteData() {
    async function fetchData() {
      setLoading(true);
      // TODO: Task 7 — wire real analytics data from /api/analytics
      const results: SiteData[] = SITES.map((s) => ({
        ...s,
        visitors24h: 0,
        visitors7d: 0,
        pageviews24h: 0,
        sparkline: [],
        status: "unknown" as const,
      }));
      setSites(results);
      setLoading(false);
    }
    fetchData();
  }, []);

  return (
    <div ref={ref} className="mx-auto max-w-5xl space-y-8 px-4 py-8 md:px-8">
      <div>
        <span className="eyebrow">
          <Globe size={11} /> Analytics
        </span>
        <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Sites</h1>
        <p className="text-text-secondary mt-2 text-sm">
          Web analytics across all ZB Automations domains. Powered by PostHog.
        </p>
      </div>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="text-text-muted h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {sites.map((site) => (
            <SiteCard key={site.domain} site={site} />
          ))}
        </div>
      )}
    </div>
  );
}
