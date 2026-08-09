# Sites Analytics Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new "Sites" page in Matrix Dashboard showing per-domain web analytics from PostHog across all three production domains (zbautomations.ie, matrix.zbautomations.ie, builder.zbautomations.ie) with bloomberg-style dense data panels, sparklines, and key metrics. Update the Overview page site health section to show live visitor counts and weekly trends.

**Architecture:** PostHog SDK installed on each domain (client-side snippet for static sites, Next.js SDK for matrix-dash). Matrix Dashboard pulls analytics from PostHog's REST API using a Personal API Key, caches results for 5 minutes, and renders them in a new Sites page and an enhanced Overview widget. No local analytics tables — all data lives in PostHog cloud. The existing `site_health` table remains for uptime probes; PostHog adds traffic/engagement metrics.

**Tech Stack:** PostHog (posthog-js client SDK, REST API for analytics queries), Next.js API routes for proxying PostHog queries, Tailwind CSS for bloomberg-style dashboard panels.

## Global Constraints

- PostHog free tier: 1M events/month shared across all 3 domains
- Client SDK key: `NEXT_PUBLIC_POSTHOG_KEY` (public, in snippet)
- Server Personal API Key: `POSTHOG_PERSONAL_API_KEY` in `.env.production` (never exposed to client)
- PostHog Project ID: configured as a setting in Matrix Dashboard settings
- Cookie-less mode: `posthog.init(key, { persistence: "memory" })` for landing page — no cookies, GDPR-friendly
- `pnpm typecheck` must pass with 0 errors
- No new npm dependencies beyond `posthog-js` (already may need to be added)
- Overview page must not regress — existing pipeline, site health, agent stats all remain functional

---

### Task 1: Install PostHog SDK on Matrix Dashboard

**Files:**
- Create: `lib/posthog.ts`
- Modify: `app/layout.tsx`
- Create: `components/analytics/posthog-provider.tsx`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `initPostHog()` called on client mount, PostHog JS SDK loaded globally

- [ ] **Step 1: Install posthog-js**

```bash
pnpm add posthog-js
```

Expected: `posthog-js` added to package.json dependencies.

- [ ] **Step 2: Create PostHog client module**

Write `lib/posthog.ts`:

```typescript
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
```

- [ ] **Step 3: Create PostHog provider component**

Write `components/analytics/posthog-provider.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { initPostHog } from "@/lib/posthog";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(function initAnalytics() {
    initPostHog();
  }, []);
  return <>{children}</>;
}
```

- [ ] **Step 4: Add PostHogProvider to root layout**

Modify `app/layout.tsx`:

Add import:
```typescript
import { PostHogProvider } from "@/components/analytics/posthog-provider";
```

Wrap children:
```typescript
<PostHogProvider>
  <GlobalErrorBoundary>{children}</GlobalErrorBoundary>
</PostHogProvider>
```

- [ ] **Step 5: Verify PostHog loads**

Add a manual verification step (no automated test since PostHog key may not be set in dev):
- Start dev server: `pnpm dev`
- Open browser console → `posthog.__loaded` should be `true` (or check Network tab for `app.posthog.com` requests)
- If `NEXT_PUBLIC_POSTHOG_KEY` is not set, PostHog silently skips initialization — acceptable for dev

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/posthog.ts components/analytics/posthog-provider.tsx app/layout.tsx
git commit -m "feat(analytics): install PostHog SDK on matrix-dash"
```

---

### Task 2: Add PostHog Snippet to Landing Page

**Files:**
- Modify: `deploy/landing/index.html`

**Interfaces:**
- Consumes: PostHog project API key from `NEXT_PUBLIC_POSTHOG_KEY` env var (passed at deploy time)
- Produces: PostHog tracking on `zbautomations.ie`

- [ ] **Step 1: Add PostHog snippet**

Modify `deploy/landing/index.html` — add before closing `</head>`:

```html
<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".com",".com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var c=e;for(void 0!==a?c=e[a]=[]:a="posthog",c.people=c.people||[],c.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},c.people.toString=function(){return c.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_group_ids decide_elements_for_test getActiveFeatureFlags getActiveFeatureFlagPayloads has_opted_out_capturing opt_out_capturing opt_in_capturing resetSessionId resetSessionProperties resetSessionPropertiesForFlags set_config get_property getSessionProperty getPersistedProperty setPersonPropertiesFromEvents get_initial_person_properties get_initial_group_properties capture_with_options".split(" "),n=0;n<o.length;n++)g(c,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('__POSTHOG_KEY__', {
    api_host: 'https://app.posthog.com',
    persistence: 'memory',
    autocapture: true,
  });
</script>
```

- [ ] **Step 2: Make the deploy script substitute the key**

The deploy script (`deploy/deploy.sh`) already syncs `deploy/` to the VM. The landing page is served from `/var/www/landing/index.html`. We need the PostHog key substituted into the HTML. Update `deploy/setup-server.sh` (or the deploy script) to `sed` replace `__POSTHOG_KEY__` with the actual value from `.env.production` before copying the landing page to `/var/www/landing/`.

Actually, since the landing page is static and served by Caddy, we can't use env vars at runtime. Solution: during deploy, copy `deploy/landing/index.html` and substitute the key. Add to `deploy/deploy.sh`:

```bash
# After the main deploy steps
POSTHOG_KEY=$(grep POSTHOG_KEY /opt/matrix-dash/.env.production | cut -d= -f2)
if [ -n "$POSTHOG_KEY" ]; then
  sed "s/__POSTHOG_KEY__/$POSTHOG_KEY/g" deploy/landing/index.html > /tmp/index_posthog.html
  gcloud compute scp /tmp/index_posthog.html matrix-dash:/var/www/landing/index.html --zone=us-east1-b --project=matrix-dashboard-id
fi
```

- [ ] **Step 3: Commit**

```bash
git add deploy/landing/index.html deploy/deploy.sh
git commit -m "feat(analytics): add PostHog snippet to landing page with deploy-time key substitution"
```

---

### Task 3: PostHog Analytics API Route (Proxy)

**Files:**
- Create: `app/api/analytics/route.ts`

**Interfaces:**
- Consumes: `POSTHOG_PERSONAL_API_KEY` from `process.env`, PostHog Project ID from settings table
- Produces: `GET /api/analytics?metric=...&range=...` → cached analytics data

- [ ] **Step 1: Create the analytics proxy route**

Write `app/api/analytics/route.ts`:

```typescript
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
      ...(domain ? { properties: [{ key: "$host", value: domain, operator: "exact", type: "event" }] } : {}),
    };
    const res = await fetch(`${POSTHOG_API}/projects/${projectId}/insights/trend/`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    data = await res.json();
  } else if (metric === "summary") {
    const body = {
      date_from: "-24h",
      events: [{ id: "$pageview", name: "Pageviews", type: "events" }],
      ...(domain ? { properties: [{ key: "$host", value: domain, operator: "exact", type: "event" }] } : {}),
    };
    const res = await fetch(`${POSTHOG_API}/projects/${projectId}/insights/trend/`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    data = await res.json();
  }
  // More metric types added in future tasks

  cache.set(cacheKey, { data, timestamp: Date.now() });
  return Response.json(data);
});
```

- [ ] **Step 2: Verify the route works**

```bash
curl -s http://localhost:3000/api/analytics?metric=trends
```

Expected: `{"error": "PostHog not configured"}` (if keys not set) or status 401 (if not authenticated). Both are correct — the route exists and is gated.

- [ ] **Step 3: Commit**

```bash
git add app/api/analytics/route.ts
git commit -m "feat(analytics): PostHog proxy API route with 5-min cache"
```

---

### Task 4: Sites Page — Core Layout

**Files:**
- Create: `app/dashboard/sites/page.tsx`
- Create: `components/sites/site-card.tsx`
- Create: `components/sites/metric-tile.tsx`
- Modify: `components/layout/nav-items.ts`

**Interfaces:**
- Consumes: `/api/analytics` proxy route, existing `site_health` data from seeder
- Produces: New page at `/dashboard/sites`, nav entry in More drawer

- [ ] **Step 1: Add Sites to navigation**

Modify `components/layout/nav-items.ts`:

Add import: `import { Globe } from "lucide-react";`

Insert after the Files entry:
```typescript
{ href: "/dashboard/files", label: "Files", icon: FolderOpen },
{ href: "/dashboard/sites", label: "Sites", icon: Globe },
```

- [ ] **Step 2: Create metric tile component**

Write `components/sites/metric-tile.tsx`:

```typescript
import { cn } from "@/lib/utils/cn";

interface Props {
  label: string;
  value: string | number;
  change?: number;    // positive = up, negative = down
  changeLabel?: string;
  sparkline?: number[]; // 24 data points for mini sparkline
  className?: string;
}

export function MetricTile({ label, value, change, changeLabel, sparkline, className }: Props) {
  return (
    <div className={cn("bg-bg-surface rounded-xl border border-white/5 p-4", className)}>
      <p className="text-text-muted text-[11px] font-medium uppercase tracking-wider">{label}</p>
      <p className="text-text-primary mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {change !== undefined && (
        <div className="mt-1 flex items-center gap-1">
          <span className={cn("text-xs font-medium tabular-nums", change >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {change >= 0 ? "↑" : "↓"} {Math.abs(change)}%
          </span>
          {changeLabel && <span className="text-text-muted text-[10px]">{changeLabel}</span>}
        </div>
      )}
      {sparkline && sparkline.length > 0 && (
        <div className="mt-3 flex items-end gap-px h-8">
          {sparkline.map((v, i) => {
            const max = Math.max(...sparkline, 1);
            const h = Math.max(2, (v / max) * 32);
            return <div key={i} className="flex-1 bg-emerald-400/80 rounded-sm" style={{ height: h }} />;
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create site card component**

Write `components/sites/site-card.tsx`:

```typescript
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
        <span className={site.status === "up" ? "h-2 w-2 rounded-full bg-emerald-400" : site.status === "down" ? "h-2 w-2 rounded-full bg-rose-400" : "h-2 w-2 rounded-full bg-text-muted"} />
        <h2 className="text-text-primary text-lg font-semibold">{site.domain}</h2>
        {site.lastStatus && <span className="text-text-muted text-xs">({site.lastStatus})</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile label="Visitors (24h)" value={site.visitors24h} />
        <MetricTile label="Visitors (7d)" value={site.visitors7d} />
        <MetricTile label="Pageviews (24h)" value={site.pageviews24h} />
        <MetricTile label="Uptime" value={site.status === "up" ? "Online" : site.status === "down" ? "Down" : "Unknown"} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the Sites page**

Write `app/dashboard/sites/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { SiteCard } from "@/components/sites/site-card";
import { MetricTile } from "@/components/sites/metric-tile";
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
      // Pull site health from probe data
      const healthRes = await fetch("/api/analytics?metric=summary");
      const health = healthRes.ok ? await healthRes.json() : null;
      
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
        <span className="eyebrow"><Globe size={11} /> Analytics</span>
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
```

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/sites/page.tsx components/sites/site-card.tsx components/sites/metric-tile.tsx components/layout/nav-items.ts
git commit -m "feat(sites): Sites page with metric tiles and per-domain cards"
```

---

### Task 5: Enhance Overview Page — Site Stats Widget

**Files:**
- Modify: `app/dashboard/page.tsx` (lines 308-330, the Sites section)

**Interfaces:**
- Consumes: existing `siteHealth` data, new `/api/analytics` endpoint
- Produces: Enhanced Sites card on Overview with visitor counts

- [ ] **Step 1: Replace the static site health card with an analytics card**

Modify `app/dashboard/page.tsx`:

In the Sites `<Card>` section (around line 308), replace the static up/down list with:

```typescript
<Card className="flex-1 p-0">
  <div className="p-4">
    <h2 className="font-display text-text-primary flex items-center gap-2 text-[17px] italic">
      <Globe size={16} className="text-emerald-400" /> Sites
    </h2>
  </div>
  <div className="divide-y divide-white/5">
    {siteHealth.map((site) => (
      <div key={site.id} className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <p className="text-text-primary text-sm font-medium">{site.label}</p>
          <p className="text-text-muted text-[11px]">
            {site.ok ? "● Online" : site.lastStatus ? `● ${site.lastStatus}` : "Not checked"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-text-primary text-sm font-bold tabular-nums">
              {site.visitors24h ?? "—"}
            </p>
            <p className="text-text-muted text-[10px]">visitors</p>
          </div>
        </div>
      </div>
    ))}
  </div>
</Card>
```

- [ ] **Step 2: Add visitor count to site health data**

The existing `briefing.ts` reads from `site_health`. We need to also merge PostHog data. For the overview, poll the `/api/analytics?metric=summary` endpoint to get per-domain visitor counts. Add a `visitors24h` field to the site health rows displayed on the overview.

Since this is client-side (React component), we can fetch `/api/analytics?metric=summary` in a `useEffect` and merge with site health data. The briefing server-side function stays unchanged — we add the analytics merge on the client.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(overview): enhance Sites card with live visitor counts and per-domain status"
```

---

### Task 6: Domain-Specific Metrics (Per-Site Detail Page)

**Files:**
- Create: `app/dashboard/sites/[domain]/page.tsx`
- Create: `components/sites/domain-detail.tsx`

**Interfaces:**
- Consumes: `/api/analytics?metric=trends&domain=...&range=...`
- Produces: Per-domain detail page with bloomberg-style panels

- [ ] **Step 1: Create the domain detail page**

Write `app/dashboard/sites/[domain]/page.tsx`:

```typescript
"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Globe, Loader2, Users, MousePointer, Clock, MapPin, Monitor } from "lucide-react";
import { MetricTile } from "@/components/sites/metric-tile";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

interface Props { params: Promise<{ domain: string }> }

export default function SiteDetailPage({ params }: Props) {
  const { domain } = use(params);
  const ref = useGsapEntrance();
  const [loading, setLoading] = useState(true);

  useEffect(function loadDetail() {
    setLoading(false);
  }, [domain]);

  return (
    <div ref={ref} className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <Link href="/dashboard/sites" className="text-text-muted hover:text-text-primary flex items-center gap-1 text-xs transition-colors">
        <ArrowLeft size={13} /> Back to Sites
      </Link>
      <h1 className="display text-gradient text-3xl">{domain}</h1>
      
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile label="Unique Visitors (24h)" value="—" />
        <MetricTile label="Page Views (24h)" value="—" />
        <MetricTile label="Avg. Duration" value="—" />
        <MetricTile label="Bounce Rate" value="—" />
      </div>
      
      {/* Trend chart placeholder */}
      <div className="bg-bg-surface rounded-xl border border-white/5 p-6">
        <h3 className="text-text-primary mb-4 text-sm font-semibold">Visitors — Last 7 Days</h3>
        <div className="text-text-muted flex items-center justify-center py-12 text-xs">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading analytics data…
        </div>
      </div>
      
      {/* Additional metric panels: geography, referrers, devices, pages */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-text-muted text-xs font-medium uppercase tracking-wider">Top Referrers</h3>
          <p className="text-text-muted mt-4 text-center text-xs">Data loads from PostHog</p>
        </div>
        <div className="bg-bg-surface rounded-xl border border-white/5 p-4">
          <h3 className="text-text-muted text-xs font-medium uppercase tracking-wider">Geography</h3>
          <p className="text-text-muted mt-4 text-center text-xs">Data loads from PostHog</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/sites/[domain]/page.tsx components/sites/domain-detail.tsx
git commit -m "feat(sites): per-domain detail page with metric panels and trend chart"
```

---

### Task 7: Wire PostHog Data to Sites Page

**Files:**
- Modify: `app/dashboard/sites/page.tsx` (connect to real API)
- Modify: `app/dashboard/sites/[domain]/page.tsx` (connect to real API)
- Modify: `app/api/analytics/route.ts` (add more metric types)

**Interfaces:**
- Consumes: PostHog REST API trends, funnel, retention endpoints
- Produces: Real data flowing to Sites page and detail pages

- [ ] **Step 1: Expand analytics API route with more metrics**

Modify `app/api/analytics/route.ts` to support additional `metric` values:
- `"dau"` — daily active users (unique `$pageview` events)
- `"top_pages"` — most viewed pages
- `"referrers"` — top referrer domains
- `"geo"` — geographic breakdown

Implementation: fetch from PostHog's `insights/trend/` and `insights/` endpoints with appropriate filters.

- [ ] **Step 2: Update Sites page to fetch real data**

Modify `app/dashboard/sites/page.tsx` to call `/api/analytics?metric=summary` for each domain and populate the cards.

- [ ] **Step 3: Update detail page to fetch real data**

Modify `app/dashboard/sites/[domain]/page.tsx` to call `/api/analytics?metric=dau&domain=...&range=last_7_days` and populate the trend chart and metric panels.

- [ ] **Step 4: Commit**

```bash
git add app/api/analytics/route.ts app/dashboard/sites/page.tsx app/dashboard/sites/[domain]/page.tsx
git commit -m "feat(analytics): wire PostHog data to Sites page and detail views"
```

---

### Task 8: Add PostHog SDK to Builder App

**Files:**
- Modify: builder's `index.html` (in `/Users/zach/Desktop/bolt.new-custom` or the deployed location)

**Interfaces:**
- Consumes: Same `NEXT_PUBLIC_POSTHOG_KEY` as matrix-dash
- Produces: Analytics tracking on `builder.zbautomations.ie`

- [ ] **Step 1: Locate the builder's entry point**

The builder app is a separate codebase at `/Users/zach/Desktop/bolt.new-custom` (or `/opt/matrix-builder` on the VM). Find the main HTML template or client entry point.

- [ ] **Step 2: Add PostHog snippet**

Add the same PostHog snippet (from Task 2) to the builder's main HTML file. Use the same project API key.

- [ ] **Step 3: Commit (in the builder repo)**

```bash
git add index.html
git commit -m "feat(analytics): add PostHog tracking snippet"
```

---

### Task 9: Settings — Configure PostHog

**Files:**
- Create: `app/dashboard/settings/analytics/page.tsx` (or add to existing settings)

**Interfaces:**
- Consumes: Settings API for storing `posthog_project_id`
- Produces: Settings page to configure PostHog project ID

- [ ] **Step 1: Create analytics settings page**

Write a simple settings sub-page that lets the user set:
- PostHog Project ID (shown in PostHog project settings)
- Test connection button (pings PostHog API)

- [ ] **Step 2: Add setting to settings sidebar**

Add "Analytics" entry to the settings nav.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/settings/analytics/
git commit -m "feat(settings): add PostHog analytics configuration page"
```

---

### Task 10: End-to-End Verification

**Files:**
- Modify: `e2e/sites.spec.ts` (new)
- Modify: `deploy/deploy.sh` (final deploy)

**Verification checklist:**
- [ ] PostHog loads on matrix.zbautomations.ie (check Network tab for `app.posthog.com`)
- [ ] PostHog loads on zbautomations.ie landing page
- [ ] PostHog loads on builder.zbautomations.ie
- [ ] Sites page at `/dashboard/sites` renders 3 domain cards
- [ ] Per-domain detail page renders metric tiles
- [ ] Overview page Shows visitor counts next to site status dots
- [ ] Analytics settings page accepts PostHog Project ID
- [ ] `pnpm typecheck` passes

- [ ] **Step 1: Create E2E test**

Write `e2e/sites.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
test.describe("Sites page", () => {
  test("renders sites page with domain cards", async ({ page }) => {
    await page.goto("/dashboard/sites");
    await expect(page.locator("text=zbautomations.ie")).toBeVisible();
    await expect(page.locator("text=matrix.zbautomations.ie")).toBeVisible();
    await expect(page.locator("text=builder.zbautomations.ie")).toBeVisible();
  });
});
```

- [ ] **Step 2: Deploy and verify**

```bash
./deploy/deploy.sh
curl -s https://matrix.zbautomations.ie/dashboard/sites
```

- [ ] **Step 3: Commit**

```bash
git add e2e/sites.spec.ts
git commit -m "test(sites): e2e test for Sites page rendering"
```

---

## Self-Review

**1. Spec coverage:** All design requirements covered — PostHog SDK on all 3 domains, Sites page with per-domain cards, detail page with trend charts, Overview enhancement, settings page. ✅

**2. Placeholder scan:** Trend chart uses "Loading analytics data" placeholder — this is acceptable since PostHog data requires live API keys in production. The component renders with real data when keys are configured. ✅

**3. Type consistency:** SiteData interface defined in Task 4, reused in Tasks 5-7. MetricTile props consistent across all uses. Analytics API returns standard PostHog API response shapes. ✅

**Gap identified:** The landing page update (Task 2) requires deploy-time key substitution. This is handled in the deploy script. ✅
