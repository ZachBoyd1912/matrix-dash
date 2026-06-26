You are working in the matrix-dash project (Next.js App Router + TypeScript + Tailwind + Drizzle, at /Users/zach/Desktop/matrix-dash).

# MISSION
Add a new sidebar page called "Matrix Builder". Its content is an existing, separate app — "Matrix Builder" (a customized bolt.new fork: a full-screen AI in-browser IDE) — running locally and embedded as-is via an <iframe>. Do NOT rewrite or port Matrix Builder; it stays its own app. You only build the matrix-dash side: a nav item, a route, an iframe, and the HTTP headers that let it work.

# THE OTHER APP (context — you do NOT edit it, and may not have filesystem access to it)
- Location on disk: /Users/zach/Desktop/bolt.new-custom  (Remix + Vite + WebContainer + Gemini)
- Local dev URL: http://localhost:5001  (Vite, strictPort, binds all interfaces)
- It serves these response headers on every route: Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: credentialless, Cross-Origin-Resource-Policy: cross-origin. It has a service-worker fallback that re-applies them.
- It runs an in-browser runtime (WebContainer) that REQUIRES the page to be cross-origin isolated (window.crossOriginIsolated === true, backed by SharedArrayBuffer). If isolation is missing, the IDE loads but building/previewing an app fails.
- On localhost it requires NO authentication (auth is bypassed in local dev), so the iframe works anonymously. Do not build any login/token bridge.

# WHO RUNS WHAT (important — split of responsibilities)
- The USER starts Matrix Builder in a terminal:  cd /Users/zach/Desktop/bolt.new-custom && pnpm dev   → it must be reachable at http://localhost:5001. (Node 22 / pnpm 9. Never run `pnpm build` there — it OOMs the machine; dev only.)
- YOU (this agent) own ONLY the matrix-dash changes below. You do not start or modify the bolt.new-custom app.

# STEP 0 — EXPLORE matrix-dash FIRST (do this before writing anything)
Find and report, with file paths:
1. The sidebar / navigation component (where nav items are defined) and how an item is added (icon + label + href).
2. The App Router layout that wraps dashboard pages (app/.../layout.tsx) and how the main content area is sized (so the iframe can fill it at full height).
3. The next config file (next.config.ts or .js/.mjs) and its current `headers()` (if any), and the dev port (assume 3000 unless configured otherwise).
4. Whether the shared dashboard chrome on that route renders any EXTERNAL <img> (e.g., a Google/Gravatar user avatar) — note it; see "Known gotcha: COEP + external images" below.

# STEP 1 — Add the sidebar nav item
Add a "Matrix Builder" entry to the sidebar nav (use a fitting icon already in the project), linking to /matrix-builder. Match the existing nav-item pattern exactly.

# STEP 2 — Create the route: app/matrix-builder/page.tsx
A minimal client component that fills the dashboard content area with a full-height iframe to Matrix Builder, plus an always-visible "Open in new tab" fallback link. Keep this route's own markup minimal (no extra external images — see gotcha). Example:

    'use client';
    import { useEffect, useRef } from 'react';
    const BUILDER_URL = process.env.NEXT_PUBLIC_MATRIX_BUILDER_URL ?? 'http://localhost:5001';
    export default function MatrixBuilderPage() {
      const ref = useRef<HTMLIFrameElement>(null);
      useEffect(() => {
        // Explicit anonymous iframe. Harmless under COEP: require-corp; REQUIRED if you
        // fall back to COEP: credentialless on the host. React won't pass this prop, so set it via ref.
        ref.current?.setAttribute('credentialless', '');
      }, []);
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, flex: 1 }}>
          <iframe
            ref={ref}
            src={BUILDER_URL}
            title="Matrix Builder"
            allow="cross-origin-isolated; clipboard-read; clipboard-write"
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          />
          <a href={BUILDER_URL} target="_blank" rel="noopener noreferrer"
             style={{ position: 'absolute', top: 8, right: 12, fontSize: 12, opacity: 0.7 }}>
            Open in new tab ↗
          </a>
        </div>
      );
    }

Ensure the parent layout gives this content area a real height (e.g. the dashboard main is a flex column with min-height:0 / h-full) so height:100% resolves; otherwise the iframe collapses to 0px.

Optionally add NEXT_PUBLIC_MATRIX_BUILDER_URL=http://localhost:5001 to matrix-dash's .env.local so the URL isn't hardcoded.

# STEP 3 — Make the /matrix-builder route cross-origin isolated (REQUIRED)
For the iframe's WebContainer to work, the HOST page must itself be cross-origin isolated AND delegate isolation to the iframe (the allow="cross-origin-isolated" above). Add SCOPED headers in the next config — scope to /matrix-builder ONLY, never globally (global COEP will break external images/scripts across the whole dashboard):

    async headers() {
      return [
        {
          source: '/matrix-builder',
          headers: [
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          ],
        },
      ];
    }

COEP value rule: TRY `require-corp` FIRST. Matrix Builder sends CORP: cross-origin, so its iframe loads fine under require-corp, and require-corp avoids the storage-partitioning that `credentialless` imposes (the partitioning is the thing most likely to break the preview's service worker). If a same-origin/host subresource on this route throws a CORP error in the console, either give that resource a CORP header / proxy it, or switch this value to `credentialless` (and keep the credentialless attribute on the iframe). The host and the iframe do NOT need the same COEP value.

# VERIFICATION — gate "done" on a RENDERED PREVIEW, not just headers
Run matrix-dash dev (e.g. `pnpm dev`, port 3000) WHILE the user has Matrix Builder running on 5001. Then, in order:
1. `curl -I http://localhost:3000/matrix-builder` shows Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers. (If missing, the headers() source didn't match — fix before continuing.)
2. Click the sidebar "Matrix Builder" item → the iframe loads the Matrix Builder IDE, filling the content area (not 0px tall).
3. Right-click inside the iframe → "Inspect" → in that frame's console: `crossOriginIsolated` returns `true`. (Necessary but NOT sufficient — continue.)
4. HEADLINE TEST: In the embedded IDE, send a prompt like "build a simple todo app in React". Confirm: streaming response appears, WebContainer boots with no "crossOriginIsolated is false" error, and the live preview iframe actually renders the running app. This 3-level-nested preview rendering is the true pass criterion.
5. Host console (the matrix-dash top frame) shows no COEP-blocked-resource errors on the /matrix-builder route.
6. The "Open in new tab" fallback opens http://localhost:5001 in a standalone tab and works.

If step 4's preview will not render despite step 3 passing, do NOT keep fighting it: ship the page with the iframe AND make the fallback prominent (a large "Open Matrix Builder" button that opens localhost:5001 in a new tab/window). The feature still ships; note the limitation for the user.

# TROUBLESHOOTING
- Iframe blank / crossOriginIsolated === false inside it → host headers not applied (verify step 1) OR iframe missing allow="cross-origin-isolated". Hard-refresh (Matrix Builder's COI service worker can serve a cached non-isolated response once); try an incognito window.
- IDE loads but preview won't render (WebContainer error) → 3-level nesting + credentialless partitioning. Toggle host COEP require-corp ↔ credentialless; confirm allow="cross-origin-isolated" is present; ensure the credentialless attribute is set on the iframe. If still failing, use the new-tab fallback.
- Streaming/LLM produces nothing → Matrix Builder's GOOGLE_GENERATIVE_AI_API_KEY is missing in its /Users/zach/Desktop/bolt.new-custom/.env.local. Ask the user to set it; restart `pnpm dev`.
- iframe shows connection refused → the user hasn't started Matrix Builder (`pnpm dev` on 5001), or 5001 is taken (strictPort fails hard — free the port).
- Dashboard avatar/external image broken ONLY on this route → see gotcha below.
- "Open in new tab" works but the embed doesn't → acceptable fallback state; keep it and report.

# KNOWN GOTCHA — COEP + external images on the /matrix-builder route
Because this route is COEP-isolated, any CROSS-ORIGIN <img> rendered by the shared dashboard chrome on this page (e.g. a Google/Gravatar user avatar in the sidebar) will be blocked unless it sends CORP/CORS. Mitigations, cheapest first: keep this route's chrome minimal; add crossOrigin="anonymous" to such <img> (Google avatars serve CORS-ok); or proxy the image through a same-origin matrix-dash route. The dashboard's OWN bundled assets (same-origin) are unaffected.

# OUT OF SCOPE (do not do)
- No auth/login/token bridge (local dev needs none).
- Do not modify /Users/zach/Desktop/bolt.new-custom.
- Do not set COEP/COOP globally — only on /matrix-builder.
- Do not deploy anything.

When finished, report: files changed in matrix-dash, the final COEP value you settled on, and the result of verification step 4 (preview rendered? yes/no) and step 6 (fallback works? yes/no).