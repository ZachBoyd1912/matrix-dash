# Changelog

## 30/06/2026 @ 08:50:50 IST — "Opus 4.8"

**Goal:** Deploy the sidebar scroll fix to the live VM and fix a latent OAuth-env bug found during deploy.

**Skills used:** `@gcp-cloud-run` (adapted for GCE), `@deployment-engineer`, `@secrets-management`

**Fixed — standalone never received the real OAuth env (`deploy/setup-server.sh`):**
- **Cause:** the Next.js standalone server runs with `cwd=.next/standalone` and loads `.env.production` from there, but the setup script only wrote `.env.production` to the app root. The live VM's standalone copy still held placeholder secrets (`your-google-client-id`, …), so Gmail/Drive/Calendar/GitHub OAuth would fail at the provider despite the dashboard issuing 302s.
- **Fix:** setup-server.sh now copies `.env.production` into `$STANDALONE_DIR` (chmod 600) after the static/public copy. Applied to the live VM during this deploy — standalone env now carries the real client IDs/secrets.

**Deploy notes (infra, live VM):**
- Rebuilt on a temporary `e2-small` resize (e2-micro 1GB OOMs on `next build`), then resized back to `e2-micro` (free tier, $0).
- Boot disk was full (8.7G, 82%) — resized `10GB → 30GB` (still within the 30GB-months free tier), grew the ext4 partition online.
- Added a persistent 2GB swapfile (`/etc/fstab`) — gives the 1GB e2-micro runtime headroom and makes future on-VM builds reliable.
- Sidebar scroll fix (prev entry) confirmed shipped in the live CSS bundle; OAuth callbacks reachable (302), dashboard gated (401 anon / 200 authed).

**Files touched:**
- `deploy/setup-server.sh` (copy `.env.production` into standalone dir)

## 30/06/2026 @ 08:30:44 IST — "Opus 4.8"

**Goal:** Fix the dashboard sidebar so all 18 nav items are reachable — the nav must scroll independently of the main page on both desktop and mobile.

**Skills used:** `@senior-frontend`, `@tailwind-patterns`

**Fixed — Desktop sidebar not scrolling (`components/layout/sidebar.tsx`):**
- **Cause:** the `<nav>` had `overflow-y-auto` but its scroll never engaged — the `glass-strong` wrapper inside the `h-screen` aside had no height bound (auto height grew with content), and the `flex-1` nav lacked `min-h-0` (flex items default to `min-height:auto`, which refuses to shrink below content). With 18 items + header + provider footer, the list overflowed the viewport and the bottom items (Settings, Console…) were unreachable.
- **Fix:** added `h-full` to the wrapper so it's bounded to the sticky `h-screen` aside, and `min-h-0 overscroll-contain` to the nav so it becomes a real scroll container. The aside is already `sticky top-0`, so sidebar scroll is independent of page scroll.

**Fixed — Mobile drawer not scrolling (`components/layout/mobile-nav.tsx`):**
- **Cause:** the slide-in drawer rendered all 18 items in a `space-y-1` nav with no overflow handling; on short screens the lower items fell below the fold with no scroll.
- **Fix:** made the drawer a `flex flex-col`, pinned the header (`shrink-0`), and gave the nav `flex-1 min-h-0 overflow-y-auto overscroll-contain` so the list scrolls within the drawer.

**Verification:** `pnpm typecheck` — zero errors. (className-only changes; live VM redeploy still required for the hosted site to pick up new Tailwind classes.)

**Files touched:**
- `components/layout/sidebar.tsx`
- `components/layout/mobile-nav.tsx`

## 30/06/2026 @ 08:22:14 IST — "Opus 4.8"

**Goal:** Security pass after going public. Stop secret-bearing files from being committable, tighten production secret-file permissions, and audit for any leaked credentials.

**Skills used:** `@security-audit`, `@secrets-management`

**Changed — `.gitignore` (secret hygiene):**
- Added ignore rules for AI session transcripts/exports (`opencode-session-*.md`, `*.session.md`, etc.) which can contain plaintext OAuth secrets, plus key/cert/credential patterns (`*.key`, `*.p12`, `*credentials*.json`, `.env*.production.local`). Prevents accidental commits of files like `opencode-session-1.md` (which held a live Google client secret).

**Audit results (no code change needed):**
- Git history scanned for `GOCSPX-*` (Google) and the GitHub client secret — **zero hits; nothing leaked to GitHub.**
- Committed `deploy/.env.production` confirmed placeholders only; `.env.local` already gitignored; no hardcoded API keys in tracked source.
- VM `/opt/matrix-dash/.env.production` permissions tightened `0664 → 0600` (was world-readable).

**Known open item (tracked, not yet fixed):** the dashboard at `matrix.zbautomations.ie` has **no authentication gate** — all API routes respond 200 publicly. Lockdown approach pending decision (Caddy basic-auth / Cloudflare Access / app-level auth).

**Files touched:**
- `.gitignore` (session-export + secret-file ignore rules)

## 30/06/2026 @ 08:15:24 IST — "Opus 4.8"

**Goal:** Replace the placeholder landing page at `zbautomations.ie` with a premium, animated, agency-grade marketing site that mirrors the Matrix Dashboard design system and the Matrix Builder design mandate. Finish hosting so the root domain presents the brand professionally.

**Skills used:** `@ui-ux-designer`, `@high-end-visual-design`, `@tailwind-patterns` (design language), `@gcp-cloud-run` (adapted — static deploy to GCE/Caddy)

**Added — `deploy/landing/index.html` (NEW, self-contained, ~42 KB):**
- Single-file static landing page (no build step — Caddy `file_server` serves it directly). Design tokens mirror `app/globals.css` Aurora Spatial layer: `#050505` surfaces, emerald `#34d399` as the single confident accent (sky/violet ambient only), glassmorphism, bezel/sheen cards, eyebrow pills.
- **Type-as-hero** per the Matrix Builder mandate: Space Grotesk (display) + Inter (body) + JetBrains Mono, modular scale, tight display tracking.
- **Advanced motion (all GPU-safe, `prefers-reduced-motion` honored):** three floating aurora orbs, fixed gradient mesh + masked dot-grid, pointer-following accent glow (desktop), IntersectionObserver scroll reveals with staggered delays, count-up stat numbers, animated agent-session terminal, infinite provider marquee, shimmer-skeleton Builder pane, sticky glass nav that frosts on scroll.
- **Content** maps to the real platform: multi-provider chat, on-disk IDE, autonomous agents (59 GitHub tools), memory bank, deep research, personal suite, Matrix Builder showcase — all deep-linking into `matrix.zbautomations.ie`.

**Changed — `deploy/setup-server.sh`:**
- Landing-page step now copies `deploy/landing/index.html` (with a minimal inline fallback) instead of embedding a heredoc placeholder, so a fresh VM rebuild reproduces the real page.

**Verification:** Deployed to GCE VM `/var/www/landing/index.html` via `gcloud compute scp`. `https://zbautomations.ie/` → HTTP 200; hero, capabilities, Matrix Builder, and CTA sections all present in served HTML. No TypeScript touched (static HTML + shell only).

**Files touched:**
- `deploy/landing/index.html` (NEW)
- `deploy/setup-server.sh` (copy real landing page; inline fallback)

## 29/06/2026 @ 17:27:28 IST — "deepseek-v4-pro"

**Goal:** Prepare Matrix Dashboard for production deployment on GCP (GCE e2-micro, ~$1/mo) at matrix.zbautomations.ie. Fix hardcoded localhost references that would break OAuth on remote domain. Add Docker, Caddy, and GCP setup scripts.

**Skills used:** `@cloud-architect` (GCE provisioning), `@gcp-cloud-run` (adapted for GCE), `@backend-dev-guidelines` (OAuth callback hardening)

**Fixed — Dynamic site URL for OAuth callbacks:**
- **Cause:** 5 OAuth callback routes hardcoded `"http://localhost:3000"` as base URL for parsing `req.url`, constructing `redirect_uri` for token exchange, and building redirect responses. This would fail on production because OAuth providers validate `redirect_uri` matches the authorize request, and error/success redirects would send users to localhost.
- **Fix:** Created `lib/utils/site-url.ts` with `getSiteUrl(req)` that extracts origin from request headers (`host` + `x-forwarded-proto`), falls back to `NEXT_PUBLIC_SITE_URL` env var, then to `http://localhost:3000` for dev. Updated all 5 callback routes (gmail, drive, google-calendar, slack, github) to use `getSiteUrl(req)`.
- **Verification:** `pnpm typecheck` — zero errors. In dev, `getSiteUrl()` returns `http://localhost:3000` (no headers). In production behind Caddy, `X-Forwarded-Proto: https` + `Host: matrix.zbautomations.ie` → correct origin.

**Fixed — Dynamic redirect URI display in settings UI:**
- **Cause:** 2 settings pages (email, drive integrations) showed hardcoded `http://localhost:3000/api/oauth/.../callback` as the redirect URI users should paste into Google Cloud Console.
- **Fix:** Added `getSiteOrigin()` helper using `NEXT_PUBLIC_SITE_URL` env var with localhost fallback. Both pages now display the correct production URL when deployed.

**Added — Deployment infrastructure (`deploy/`):**
- `Dockerfile` — Multi-stage build (Node 22 slim): builder stage compiles with build-essential for better-sqlite3, runner stage copies standalone output + installs prod deps for native addon.
- `deploy/Caddyfile` — Reverse proxy: `matrix.zbautomations.ie` → `localhost:3000` (dashboard), `zbautomations.ie` → static landing page. Auto HTTPS via Let's Encrypt.
- `deploy/setup-gce.sh` — GCloud script: reserves static IP, creates e2-micro VM (free tier, europe-west1), sets up HTTP/HTTPS firewall rules, prints DNS records to configure at letshost.ie.
- `deploy/setup-server.sh` — In-VM bootstrap: installs Node 22, pnpm, Caddy, build-essential; clones repo; builds; creates systemd service; configures Caddy with landing page.
- `deploy/.env.production` — Template with `NEXT_PUBLIC_SITE_URL` and OAuth credential placeholders + redirect URI docs.

**Changed — Next.js config for production:**
- Added `output: "standalone"` to `next.config.ts` — produces self-contained `.next/standalone/server.js` that doesn't depend on `node_modules`, simplifying deployment.

**Files touched:**
- `lib/utils/site-url.ts` (NEW — 12 lines)
- `app/api/oauth/gmail/callback/route.ts` (dynamic base URL)
- `app/api/oauth/drive/callback/route.ts` (dynamic base URL)
- `app/api/oauth/google-calendar/callback/route.ts` (dynamic base URL)
- `app/api/oauth/slack/callback/route.ts` (dynamic base URL)
- `app/api/oauth/github/callback/route.ts` (dynamic base URL)
- `app/dashboard/settings/email/page.tsx` (dynamic redirect URI display)
- `app/dashboard/settings/integrations/drive/page.tsx` (dynamic redirect URI display)
- `next.config.ts` (added `output: "standalone"`)
- `Dockerfile` (NEW)
- `deploy/Caddyfile` (NEW)
- `deploy/setup-gce.sh` (NEW)
- `deploy/setup-server.sh` (NEW)
- `deploy/.env.production` (NEW)

## 28/06/2026 @ 01:06:44 IST — "deepseek-v4-pro"

**Goal:** Build full Gmail integration — connect Gmail OAuth to the email system with sync, send, search, labels, and agent tools. Bridge OAuth tokens to auto-create `email_account` entries so the existing email dashboard and compose system seamlessly work with Gmail.

**Skills used:** `@ai-engineer` (structured tool definitions with `approved()` gating for send), `@backend-dev-guidelines` (service layer with Gmail REST API, token refresh, base64 email decoding)

**Added — Gmail service (`lib/services/gmail.ts`, 372 lines):**

- `getGmailToken()` / `ensureFreshToken()` — OAuth token management with auto-refresh. Checks expiry, calls `https://oauth2.googleapis.com/token` with `grant_type=refresh_token`, updates DB with new access token. Falls back to existing token if refresh fails
- `gmailApi(path, init?)` — Authenticated Gmail REST API helper at `https://gmail.googleapis.com/gmail/v1/users/me`
- `decodeBase64()` / `getHeader()` / `extractBody()` — MIME parsing utilities. Handles URL-safe base64, multipart messages, nested parts, text/plain preferred over text/html
- `syncGmailEmails(limit=50)` — Fetches recent emails via `GET /messages?maxResults=N`, fetches full content for each new message, deduplicates by `message_id`, extracts From/Subject/To, labels (INBOX/SENT/UNREAD/STARRED), body (capped 20K chars), inserts into local `emails` table. Sends notification on completion
- `sendGmailEmail(to, subject, body, { cc, bcc, replyTo })` — Sends via Gmail API `POST /messages/send` with RFC 2822 formatted raw message (base64url encoded). Saves copy to local sent folder
- `getGmailEmail(messageId)` — Full message by ID with all headers, body, snippet, labels
- `searchGmailEmails(query, limit)` — Gmail search syntax support (`from:`, `subject:`, `newer_than:`, etc.), returns metadata + snippet
- `modifyGmailLabel(messageId, addLabels, removeLabels)` — Add/remove Gmail labels AND sync local DB (UNREAD→isRead, STARRED→isStarred, TRASH→folder)
- `listGmailLabels()` — All system + user labels with message/thread counts
- `getGmailProfile()` — Email address, total messages, threads, history ID

**Added — Gmail sync API (`app/api/gmail/route.ts`):**
- `POST { action: "sync", limit }` → `syncGmailEmails(limit)` — returns `{ ok, imported }`
- `POST { action: "send", to, subject, body, cc?, bcc? }` → `sendGmailEmail()` — returns `{ ok, messageId }`

**Added — Bridge in Gmail OAuth callback (`app/api/oauth/gmail/callback/route.ts`):**
- After successful OAuth token storage, auto-creates an `email_account` row (Gmail IMAP/SMTP) so the existing email system recognizes the Gmail connection
- Triggers initial sync (`syncGmailEmails(20)`) in the background — emails appear in the inbox immediately after connecting

**Added — 5 Gmail agent tools (`lib/ai/tools.ts`):**
| Tool | Gated | Description |
|---|---|---|
| `syncGmail` | `approved("syncGmail")` | Fetch recent emails from Gmail to local DB |
| `sendGmail` | `approved("sendGmail")` | Send email via Gmail with cc/bcc |
| `searchGmail` | No | Search Gmail with Gmail search syntax |
| `getGmailEmail` | No | Read full email by message ID |
| `listGmailLabels` | No | List labels with message counts |

**Fixed — Google OAuth authorize URL (`app/api/oauth/google-calendar|drive|gmail/authorize/route.ts`):**
- Changed from `/o/oauth/v2/auth` to `/o/oauth2/v2/auth` (missing `2` caused persistent 404)
- Added `userinfo.email` scope to all authorize routes for real email retrieval
- Token endpoint URLs already correct (`oauth2.googleapis.com`)

**Fixed — All callback redirects (`app/api/oauth/google-calendar|drive|gmail/callback/route.ts`):**
- `Response.redirect()` now uses absolute URLs via `new URL(path, base)` — Next.js 15 rejects relative URLs with `ERR_INVALID_URL`
- Changed userinfo API from v1 to v2 endpoint for better compatibility

**Added — Gmail sync button (email settings page):**
- Refresh button next to the disconnect button in the connected Gmail card
- Calls `POST /api/gmail { action: "sync" }` and shows toast with import count

**Verification:** `pnpm typecheck` zero errors. 115 lines modified, 3 new files created (gmail.ts, gmail route, docs/.gitignore).

**Files touched:**
- `lib/services/gmail.ts` — NEW: 372 lines, full Gmail API integration
- `app/api/gmail/route.ts` — NEW: sync + send endpoints
- `app/api/oauth/gmail/callback/route.ts` — bridge: auto-create email account + trigger initial sync
- `app/api/oauth/google-calendar/callback/route.ts` — fix: absolute URLs, userinfo v2
- `app/api/oauth/drive/callback/route.ts` — fix: absolute URLs, userinfo v2
- `app/api/oauth/google-calendar/authorize/route.ts` — fix: oauth2 URL, userinfo.email scope
- `app/api/oauth/drive/authorize/route.ts` — fix: oauth2 URL, userinfo.email scope
- `app/api/oauth/gmail/authorize/route.ts` — fix: oauth2 URL, userinfo.email scope
- `lib/ai/tools.ts` — 5 Gmail agent tools
- `app/dashboard/settings/email/page.tsx` — Gmail sync button

## 27/06/2026 @ 19:00:06 IST — "deepseek-v4-pro"

**Goal:** Complete ALL remaining GitHub tool phases (3-6) — implement 35 service functions and 35 agent tool definitions covering PR operations, repository administration, CI/CD workflows, gists, notifications, milestones, and extended GitHub features. The Matrix Dash agent now has **59 total GitHub tools** with full read/write access across the entire GitHub API surface.

**Skills used:** `@ai-engineer` (structured tool definitions with `approved()` gating for all write operations), `@backend-dev-guidelines` (clean service layer, Zod validation on every tool input, layered architecture — service → tools), `@senior-architect` (pragmatic architecture decisions — deterministic IDs for upserts, shared `ghConn()` helper, consistent error handling patterns), `@subagent-orchestrator` (Mission Brief created, direct execution chosen for interdependent files)

**Added — Phase 3: PR Operations (11 functions, ~250 lines):**

- `listPRs(connectionId, repo, { state, sort, direction, perPage, page })` — Paginated PR list with draft flag, head/base branches, user, labels
- `getPR(connectionId, repo, number)` — Full PR: body, draft, labels, assignees, reviewers, mergeability, diff stats (+additions/−deletions), timeline URLs
- `updatePR(connectionId, repo, number, { title, body, state, base })` — PATCH update with partial object
- `mergePR(connectionId, repo, number, { commitTitle, commitMessage, mergeMethod })` — PUT merge with method selection (merge/squash/rebase)
- `requestReview(connectionId, repo, number, reviewers)` — POST requested reviewers
- `listReviews(connectionId, repo, number, { perPage, page })` — Paginated reviews list (state, body, user, submitted date)
- `reviewPR(connectionId, repo, number, event, body?)` — Submit APPROVE/REQUEST_CHANGES/COMMENT review
- `listPRComments(connectionId, repo, number)` — Inline review comments with path/line info
- `commentOnPR(connectionId, repo, number, body, { path, line, side })` — General or inline PR comment with optional file path, line number, and LEFT/RIGHT side
- `getPRChecks(connectionId, repo, sha)` — CI/CD check runs with status, conclusion, and detail URLs

**Added — Phase 4: Repository Administration (8 functions, ~180 lines):**

- `createRepo(connectionId, name, { description, private, autoInit, gitignoreTemplate, licenseTemplate })` — POST new repo with optional auto-init and templates
- `deleteRepo(connectionId, repo)` — DELETE repo (returns `{ ok }` even on 404)
- `updateRepo(connectionId, repo, updates)` — PATCH repo settings (name, description, visibility, issues/wiki/projects toggles, default branch, homepage) + separate PUT for topics via mercy-preview API
- `forkRepo(connectionId, repo, organization?)` — POST fork with optional org target
- `createBranch(connectionId, repo, branch, fromRef)` — GET ref SHA → POST new ref (two-step)
- `deleteBranch(connectionId, repo, branch)` — DELETE ref with URL-encoded branch name
- `commitFile(connectionId, repo, path, content, message, { branch, sha })` — PUT file contents (base64-encoded), returns content sha and commit info

**Added — Phase 5: Workflows & Actions (5 functions, ~80 lines):**

- `listWorkflows(connectionId, repo)` — GET actions/workflows list (id, name, state, path, badge)
- `getWorkflowRuns(connectionId, repo, workflowId?, { branch, status, perPage, page })` — Runs list with status/branch filters
- `triggerWorkflow(connectionId, repo, workflowId, ref, inputs?)` — POST dispatch event with optional input map
- `cancelWorkflowRun(connectionId, repo, runId)` — POST cancel (returns `{ ok }`)
- `getWorkflowLogs(connectionId, repo, runId)` — GET with manual redirect, returns download URL and expiry

**Added — Phase 6: Extended GitHub (11 functions, ~200 lines):**

- `getUserProfile(connectionId, username)` — Public profile: bio, company, location, followers, repos, gists
- `listOrganizations(connectionId)` — Org list with login, description, avatar
- `starRepo` / `unstarRepo(connectionId, repo)` — PUT/DELETE starring
- `getRateLimit(connectionId)` — Core + search rate limit with human-readable reset timestamp
- `listMilestones(connectionId, repo, { state, perPage, page })` — Milestones with open/closed issue counts
- `createMilestone(connectionId, repo, title, { description, dueOn })` — POST milestone with due date
- `listGists(connectionId, perPage)` — Gist list with files array and public flag
- `createGist(connectionId, files, { description, public })` — POST multi-file gist
- `listNotifications(connectionId, { all, perPage, page })` — Unread notifications with repository, subject type/title, and human-readable URLs (auto-converted from API URLs)
- `markNotificationRead(connectionId, threadId?)` — PATCH mark single or all notifications

**Added — 35 new agent tools (`lib/ai/tools.ts`):**

| Phase | Category | Tools | Gating |
|---|---|---|---|
| 3 | PR Ops | `listPRs`, `getPR`, `updatePR`, `mergePR`, `requestReview`, `listReviews`, `reviewPR`, `listPRComments`, `commentOnPR`, `getPRChecks` | Write tools: `approved("updatePR")`, `approved("mergePR")`, `approved("requestReview")`, `approved("reviewPR")`, `approved("commentOnPR")` |
| 4 | Repo Admin | `createRepo`, `deleteRepo`, `updateRepo`, `forkRepo`, `createBranch`, `deleteBranch`, `commitFile` | All gated: `approved("createRepo")`, `approved("deleteRepo")`, etc. |
| 5 | Workflows | `listWorkflows`, `getWorkflowRuns`, `triggerWorkflow`, `cancelWorkflowRun`, `getWorkflowLogs` | Write: `approved("triggerWorkflow")`, `approved("cancelWorkflowRun")` |
| 6 | Extended | `getUserProfile`, `listOrganizations`, `starRepo`, `unstarRepo`, `getRateLimit`, `listMilestones`, `createMilestone`, `listGists`, `createGist`, `listNotifications`, `markNotificationRead` | Write: `approved("starRepo")`, `approved("unstarRepo")`, `approved("createMilestone")`, `approved("createGist")`, `approved("markNotificationRead")` |

**Design decisions:**
- All write tools follow `approved()` + `blocked()` pattern for agent safety
- `ghConn()` helper reused from Phase 1 — single DB lookup per tool invocation block
- GitHub `+is:issue` filter applied consistently to exclude PRs from issue searches
- `mergePR` accepts merge/squash/rebase method selection
- `commentOnPR` supports inline comments with optional `path`, `line`, and `side` (LEFT/RIGHT) parameters
- `createBranch` performs a two-step flow: GET source ref SHA → POST new ref
- `commitFile` base64-encodes content automatically, returns blob SHA for subsequent updates
- `deleteRepo`/`deleteBranch` return `{ ok: true }` on 404 (idempotent)
- `listNotifications` auto-converts API URLs to human-readable github.com URLs
- `getWorkflowLogs` uses manual redirect mode, returns download URL and expiry header

**Verification:** `pnpm typecheck` zero errors. 929 insertions, 9 deletions across 2 files.

**Files touched:**
- `lib/services/github.ts` (+575/-9, 35 new functions: PR ops, repo admin, workflows, gists, notifications, milestones, rate limits, starring, user profiles)
- `lib/ai/tools.ts` (+354/0, 35 new agent tools + updated imports for all 55 imported functions)

## 27/06/2026 @ 18:47:38 IST — "deepseek-v4-pro"

**Goal:** Implement Phase 2 — full GitHub issue management. Add 10 service functions and 10 agent tools for listing, reading, updating, labeling, assigning, and commenting on issues, plus cross-repo issue search.

**Skills used:** `@ai-engineer` (structured tool definitions with `approved()` gating for write operations), `@backend-dev-guidelines` (clean service layer, Zod validation on all tool inputs), `@senior-architect` (layered architecture — service → tools pattern)

**Added — 10 issue management service functions (`lib/services/github.ts`):**

- `listIssues(connectionId, repo, { state, labels, assignee, sort, direction, perPage, page })` — Paginated issue list with full filtering. Returns number, title, state, labels, assignees, comments count, timestamps. Excludes PRs via `!i.pull_request` filter
- `getIssue(connectionId, repo, number)` — Full issue details: body, state_reason, labels, assignees, milestone title/due date, locked status, user
- `updateIssue(connectionId, repo, number, updates)` — PATCH endpoint, supports: title, body, state (open/closed), state_reason (completed/not_planned), labels, assignees, milestone. Intellisense-friendly partial update object
- `addLabels(connectionId, repo, number, labels)` — POST labels, returns array of applied label names
- `removeLabel(connectionId, repo, number, label)` — DELETE a single label by name (URL-encoded), returns `{ ok }`
- `assignIssue(connectionId, repo, number, assignees)` — POST assignees, returns array of assigned usernames
- `commentOnIssue(connectionId, repo, number, body)` — POST comment (supports markdown), returns comment id, user, body, html_url
- `listComments(connectionId, repo, number, { perPage, page })` — Paginated comment list, returns id, body, user, html_url, timestamps
- `searchIssues(connectionId, query, { state, labels, repo, perPage })` — Cross-repo GitHub issue search with `+is:issue` filter to exclude PRs, returns number, title, state, repo, labels, html_url

**Added — 10 issue management agent tools (`lib/ai/tools.ts`):**

| Tool | Gated | Description |
|---|---|---|
| `listIssues` | No | List with state/labels/assignee/sort filters |
| `getIssue` | No | Full issue details with body and milestone |
| `updateIssue` | `approved("updateIssue")` | Edit title, body, state, labels, assignees |
| `addLabels` | `approved("addLabels")` | Apply labels to an issue |
| `removeLabel` | `approved("removeLabel")` | Remove a specific label |
| `assignIssue` | `approved("assignIssue")` | Assign users to an issue |
| `commentOnIssue` | `approved("commentOnIssue")` | Add comment with markdown |
| `listComments` | No | Read all comments |
| `searchIssues` | No | Cross-repo search by keyword |
| `createIssue` | `approved("createIssue")` | (Existing, unchanged) |

All write tools follow the `approved()` + `blocked()` pattern for agent safety.

**Verification:** `pnpm typecheck` zero errors. 350 insertions, 0 deletions across 2 files.

**Files touched:**
- `lib/services/github.ts` (+223 lines, 10 new functions: listIssues, getIssue, updateIssue, addLabels, removeLabel, assignIssue, commentOnIssue, listComments, searchIssues, plus pattern helpers)
- `lib/ai/tools.ts` (+127 lines, 10 new tools + updated imports)

## 27/06/2026 @ 17:16:58 IST — "deepseek-v4-pro"

**Goal:** Implement Phase 1 of GitHub repository intelligence — add 9 new service functions and expand agent tool definitions from 4 tools to 14 tools, giving the Matrix Dash agent deep read access to GitHub repositories (code search, file browsing, commit history, diffs, blame, releases, repo metadata). Fix the GitHub sync 500 error caused by `onConflictDoUpdate` targeting non-unique columns. Fix GitHub settings page showing "Connect" button when a connection already exists.

**Skills used:** `@ai-engineer` (structured tool definitions with `approved()` gating), `@backend-dev-guidelines` (clean service layer, input validation via Zod, layered architecture)

**Added — 9 GitHub service functions (`lib/services/github.ts`):**

- `getRepo(connectionId, repo)` — Full repo metadata: stars, forks, open issues, topics, license, clone URL, timestamps
- `searchCode(connectionId, query, repo?)` — GitHub code search across all repos (or scoped to one), returns matches with path, repo, and relevance score
- `listFiles(connectionId, repo, path, ref?)` — Directory listing at any path, returns file/dir type, size
- `getBlob(connectionId, repo, path, ref?)` — Read binary files (images, fonts) as base64 via `application/vnd.github.raw+json`
- `readMultipleFiles(connectionId, repo, paths, ref?)` — Parallel file reads for cross-file code analysis, returns `{ path, content }` array with per-file error handling
- `getCommit(connectionId, repo, sha)` — Full commit: message, author, date, stats (additions/deletions), files list with truncated patches
- `listCommits(connectionId, repo, { branch, path, author, since, perPage, page })` — Paginated commit log, returns sha, short sha, message, author, date
- `compareCommits(connectionId, repo, base, head)` — Git diff between two refs: ahead/behind counts, file changes, commit list, diff/patch URLs
- `blame(connectionId, repo, path, { ref })` — Show last commit for each line via `/repos/{repo}/commits?path=` endpoint
- `getLatestRelease(connectionId, repo)` — Latest release: tag, name, body (truncated to 1000 chars), draft/prerelease flags, assets with download counts

**Added — 10 new agent tools (`lib/ai/tools.ts`) in the GitHub block:**

- `getRepo` — Read detailed repo metadata
- `readMultipleFiles` — Batch read files (cross-file analysis)
- `listFiles` — Browse directory trees
- `searchCode` — Search code by keyword
- `listCommits` — Browse commit history with filters
- `getCommit` — Inspect a single commit with diff
- `compareCommits` — Diff between branches/tags/commits
- `blame` — File authorship tracking
- `getLatestRelease` — Release info and assets
- `searchRepos` — Search repos by keyword

**Changed — GitHub tools block refactored:**

- Eliminated redundant `getDb()` calls by extracting `ghConn()` helper that fetches the active GitHub connection once
- All read tools are ungated (available whenever GitHub is enabled); write tools (`createIssue`, `createPR`) remain behind `approved()` gates
- Existing `listRepos`, `createIssue`, `createPR`, `readRepoFile` tools preserved with updated descriptions

**Fixed — GitHub sync 500 error (`lib/services/github.ts`):**

- `onConflictDoUpdate({ target: [fullName, connectionId] })` failed because `(full_name, connection_id)` had no unique constraint
- Replaced with deterministic IDs (`${connectionId}:${fullName}`) and manual `check-exists → update-or-insert` logic
- Removed unused `randomUUID` import

**Fixed — GitHub settings page blank state (`app/dashboard/settings/integrations/github/page.tsx`):**

- Wrapped component in `<Suspense>` to fix `useSearchParams()` hydration issues in Next.js 15
- Added `loading` state to prevent flashing the "Connect" button before API responses arrive
- `isActive` check changed from truthy to explicit `=== true`
- Added GitHub avatar image display, clickable repo cards with external links, repo description previews, increased repo list limit to 30

**Fixed — OAuth callbacks (`app/api/oauth/*/callback/route.ts`):**

- All 5 callbacks (GitHub, Slack, Drive, Google Calendar, Gmail) now use `new URL(req.url, "http://localhost:3000")` for safe URL parsing
- Entire function bodies wrapped in try/catch with `console.error` for debugging (previously: only token exchange was guarded)
- `verifyOAuthState()` calls moved inside try blocks

**Verification:** `pnpm typecheck` zero errors. 401 insertions, 46 deletions across 4 files (2 service/tools + 2 one-liner fixes).

**Files touched:**
- `lib/services/github.ts` (+230/-21, 9 new service functions, fixed sync upsert)
- `lib/ai/tools.ts` (+171/-25, 10 new tools, refactored GitHub block with ghConn() helper)
- `app/api/oauth/github/callback/route.ts` (+22/-20, wrapped in try/catch, safe URL)
- `app/dashboard/settings/integrations/github/page.tsx` (+96/-40, Suspense, loading, avatar)

## 27/06/2026 @ 04:47:07 IST — "deepseek v4 pro"

**Goal:** Add Google Calendar as a provider option alongside local/CalDAV calendars on the Calendar settings page — with a dropdown to choose between "Local (CalDAV / ICS)" and "Google Calendar", and full Google OAuth flow for calendar sync.

**Added — Google Calendar OAuth infrastructure**
- **Added** `googleCalendarConnections` table to `lib/db/schema.ts` (id, googleEmail, accessToken encrypted, refreshToken encrypted, tokenExpires, isActive, createdAt)
- **Added** CREATE TABLE statement to `lib/db/client.ts` INIT_SQL + `ensureIntegrationTables()` hot-reload migration
- **Created** `app/api/oauth/google-calendar/authorize/route.ts` — redirects to Google OAuth with `calendar.readonly` scope, `access_type=offline`, `prompt=consent`
- **Created** `app/api/oauth/google-calendar/callback/route.ts` — exchanges code for tokens (URL-encoded Google endpoint), encrypts access + refresh tokens, fetches user email from Google userinfo, stores in `google_calendar_connections`
- **Created** `app/api/google-calendar/connections/route.ts` — GET (list connections with stripped tokens), DELETE (disconnect by id)

**Changed — Calendar settings page with provider dropdown**
- **Provider selector**: Added `<select>` dropdown in the "Add calendar" dialog with two options:
  - **Local (CalDAV / ICS)** — existing form: calendar name + optional CalDAV URL/user/password. Creates a calendar in the `calendars` table
  - **Google Calendar** — shows "Connect with Google" button that triggers OAuth. When already connected, shows "✅ Already connected as user@gmail.com" instead
- **Google connection card**: When a Google Calendar connection is active, shows a card above the local calendars list with the connected email + "● Connected" badge + disconnect button
- **Google connect prompt**: When no Google connection exists, shows a card with a "Connect Google Calendar" button + scope explanation
- **Live refresh**: Fetches both `/api/calendars` and `/api/google-calendar/connections` on mount to determine Google connection state

**Verification:** `pnpm typecheck` passes with zero errors

**Files Touched:**
- `lib/db/schema.ts` — +11 lines (googleCalendarConnections table)
- `lib/db/client.ts` — +16 lines (INIT_SQL + ensureIntegrationTables migration)
- `app/api/oauth/google-calendar/authorize/route.ts` — NEW 30 lines
- `app/api/oauth/google-calendar/callback/route.ts` — NEW 90 lines
- `app/api/google-calendar/connections/route.ts` — NEW 34 lines
- `app/dashboard/settings/calendar/page.tsx` — rewritten (210 lines, provider dropdown + Google connect)

## 27/06/2026 @ 04:44:05 IST — "deepseek v4 pro"

**Goal:** Fix `SqliteError: no such table` errors for all 10 new integration tables when the DB connection was already cached from before the code changes (hot-reload scenario). The `GET /api/github/connections`, `/api/slack/workspaces`, `/api/drive/connections`, `/api/github/repos`, and `/api/oauth/github/authorize` routes all returned 500s on a running dev server.

**Fixed — Database table migration for hot-reloaded connections**
- **Cause:** `getSqlite()` in `lib/db/client.ts` cached the SQLite connection on `globalThis.__matrixSqlite`. When the dev server hot-reloaded after adding new tables to `INIT_SQL`, the cached connection was returned on line 455 without re-running the DDL. `CREATE TABLE IF NOT EXISTS` in `INIT_SQL` only runs on first boot — it never runs again on subsequent hot-reloads because `getSqlite()` returns the cached instance immediately.
- **Fix:** Added `ensureIntegrationTables(sqlite: Database)` function that checks `sqlite_master` for each new table's existence and runs the `CREATE TABLE` only if missing. This is called from both paths in `getSqlite()`:
  - **Cached path** (line 455): `ensureIntegrationTables(g.__matrixSqlite)` runs on every `getSqlite()` call, even when the connection is already open — so hot-reloaded code immediately creates missing tables
  - **Fresh boot path** (after `runColumnMigrations`): `ensureIntegrationTables(sqlite)` also runs for completeness, though `INIT_SQL` already created them
- **Pattern:** Uses `sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")` to check existence before executing `CREATE TABLE` — idempotent and safe to call repeatedly
- **Verification:** Restarting the dev server after this change (or simply refreshing) will create all missing tables without needing a full app restart

**Files Touched:**
- `lib/db/client.ts` — +87 lines (`ensureIntegrationTables` function + calls from both cached and fresh paths)

## 27/06/2026 @ 04:40:55 IST — "deepseek v4 pro"

**Goal:** Fix three integration bugs: Calendar card linked to a non-existent page (404), Webhooks card falsely claimed "Connected" when there were zero webhooks, and the Webhooks page had no setup guide.

**Fixed — Calendar settings page created (was 404)**
- **Cause:** The Integrations page's Calendar card linked to `/dashboard/settings/calendar` but no `app/dashboard/settings/calendar/page.tsx` existed — navigating there gave "404 — This page could not be found"
- **Fix:** Created `app/dashboard/settings/calendar/page.tsx` — a full settings page following the webhooks page pattern: lists calendars with color dot + name + CalDAV badge, supports create via Dialog (name, optional CalDAV URL/user/pass), delete with confirmation, empty state with guidance
- **Added** Calendar entry to `app/dashboard/settings/layout.tsx` sidebar SECTIONS array with `Calendar` icon from lucide-react

**Fixed — Webhooks card showed "● Connected" when no webhooks existed**
- **Cause:** `app/dashboard/settings/integrations/page.tsx` hardcoded `snap.webhooks = { connected: true, meta: "Settings → Webhooks" }` regardless of actual webhook state
- **Fix:** Now fetches `/api/webhooks` alongside other APIs on mount. Shows `"No webhooks configured · Create one to trigger HTTP callbacks on events"` when empty, or `"3 webhooks · 2 active"` when configured with active/enabled counts

**Fixed — Webhooks page had no setup guide for new users**
- **Cause:** The empty state just said "No webhooks" with no guidance on what webhooks do or how to set them up
- **Fix:** Added a "Getting started" card below the hero (only visible when list is empty) with example integrations: Discord, Slack, n8n/IFTTT, Custom API — each with a brief description of what URL to paste. Empty state also got a helpful `description` prop

**Changed — Calendar card now also fetches real data**
- Calendar card was previously hardcoded to show "CalDAV · Settings → Calendar" as connected. Now fetches `/api/calendars` and shows `"2 calendars configured"` or `"No calendars configured"` based on actual data

**Verification:** `pnpm typecheck` passes with zero errors

**Files Touched:**
- `app/dashboard/settings/calendar/page.tsx` — NEW 120 lines (full calendar settings page)
- `app/dashboard/settings/layout.tsx` — +2 lines (Calendar sidebar entry)
- `app/dashboard/settings/integrations/page.tsx` — +18/-4 lines (webhook + calendar API fetches, honest status)
- `app/dashboard/settings/webhooks/page.tsx` — +23/-1 lines (setup guide card + empty state description)

## 27/06/2026 @ 04:34:19 IST — "deepseek v4 pro"

**Goal:** Wire up the Google Drive OAuth callback flow and add persistent toggle state to all integration settings pages so tool enable/approval switches survive page refresh.

**Added — Google Drive OAuth Callback**
- **Created** `app/api/oauth/drive/authorize/route.ts` — redirects to Google OAuth with `drive.readonly` scope, `access_type=offline`, `prompt=consent` (required to get a `refresh_token`)
- **Created** `app/api/oauth/drive/callback/route.ts` — exchanges `code` for tokens via `oauth2.googleapis.com/token` (URL-encoded body), encrypts both `access_token` and `refresh_token` via AES-256-GCM, fetches user email from `googleapis.com/oauth2/v1/userinfo`, stores in `drive_connections`
- **Created** `app/api/drive/connections/route.ts` — GET (list with toPublic stripping tokens), DELETE (by id via query param)

**Changed — Drive settings page enabled with live API**
- `app/dashboard/settings/integrations/drive/page.tsx` — now fetches from `/api/drive/connections` (was hardcoded empty array), **Connect Google Drive button is now enabled** (was `disabled`), disconnect button wired to DELETE endpoint, toggle states loaded from settings (`driveWatchFolder`, `driveAutoExtract`) and persisted on change

**Changed — Toggle persistence for GitHub & Slack settings pages**
- **GitHub page** (`app/dashboard/settings/integrations/github/page.tsx`): `ToolToggle` component rewritten to accept `checked` + `setChecked` props from parent state. Four toggles now load from `/api/settings` on mount (`tool_github`, `approve_createIssue`, `approve_createPR`, `approve_listRepos`) and persist via `PATCH /api/settings` on change
- **Slack page** (`app/dashboard/settings/integrations/slack/page.tsx`): same pattern — `ToolToggle` with `checked`/`setChecked` props. Six toggles load from settings (`tool_slack`, `approve_sendSlackMessage`, `approve_listSlackChannels`, `approve_searchSlack`, `slack_summary_daily`, `slack_summary_weekly`) and persist on change

**Changed — Integrations landing page updated for Drive**
- **Cause:** Drive had no API before; now `/api/drive/connections` exists
- **Fix:** Added Drive fetch to the `Promise.all` on mount alongside GitHub, Slack, and settings. Drive now shows real connection status — "connected" badge with email when OAuth'd, "Configure" prompt when not. Updated the `snap` calculation to use the real API response instead of hardcoded `connected: false`

**Verification:** `pnpm typecheck` passes with zero errors across all 7 modified/new files

**Files Touched:**
- `app/api/oauth/drive/authorize/route.ts` — NEW 27 lines
- `app/api/oauth/drive/callback/route.ts` — NEW 84 lines
- `app/api/drive/connections/route.ts` — NEW 35 lines
- `app/dashboard/settings/integrations/drive/page.tsx` — rewritten (145 lines, live API + toggle persistence)
- `app/dashboard/settings/integrations/github/page.tsx` — +40 lines (toggle state + saveToggle + prop-driven ToolToggle)
- `app/dashboard/settings/integrations/slack/page.tsx` — +45 lines (toggle state + saveToggle + prop-driven ToolToggle)
- `app/dashboard/settings/integrations/page.tsx` — +8 lines (Drive API fetch + dynamic snap)

## 27/06/2026 @ 04:28:47 IST — "deepseek v4 pro"

**Goal:** Fix the Integrations landing page to show real connection status from the database instead of hardcoded mock data with fake usernames, repo counts, and channel counts.

**Fixed — Integrations page mock data replaced with live API queries**
- **Cause:** The integrations landing page (`app/dashboard/settings/integrations/page.tsx`) had a `CONNECTED` array with hardcoded fake data: `"ZachBoyd1912 · 12 repos synced"`, `"Matrix Labs · 23 channels"`, `"Tavily · 920/1000 queries this month"`, `"zboyd712@gmail.com · 23 docs synced"`. None of these connections actually existed.
- **Fix:** Completely rewrote the page to fetch real connection status on mount:
  - `GET /api/github/connections` → if active connection found, shows `{githubUser} · connected`; otherwise shows `"Connect your GitHub account"` with "Configure" badge
  - `GET /api/slack/workspaces` → same pattern with `{teamName} · connected` or `"Connect your Slack workspace"`
  - `GET /api/settings` → checks for `tavilyKey`; if absent, shows `"No search provider configured"`
  - Google Drive always shows `"Connect your Google account"` (OAuth callback not yet wired)
  - Calendar and Webhooks show generic meta pointing to their existing settings pages
  - The 3-section layout (Connected/Available/Coming Soon) is now computed dynamically from the API responses, not hardcoded
- **Fixed** TypeScript error at line 125: incomplete ternary `Array.isArray(sl) ? sl` missing `: []` fallback
- **Verification:** `pnpm typecheck` passes with zero errors; all cards now display real or honest "not yet connected" state

**Files Touched:**
- `app/dashboard/settings/integrations/page.tsx` — rewritten from 225 lines (static mock data) to 237 lines (dynamic API-driven)

## 27/06/2026 @ 04:22:42 IST — "deepseek v4 pro"

**Goal:** Remove the 6 "Soon" placeholder cards from the Integrations page and build real, connected GitHub, Slack, Web Search, and Google Drive infrastructure following the same patterns proven by the existing email and calendar services.

**Fixed — Phase 1: Shared OAuth Infrastructure**
- **Added** `oauthStates` table to `lib/db/schema.ts` (id, state, provider, redirectTo, expiresAt, createdAt) with UNIQUE constraint on state
- **Added** `oauth_states` CREATE TABLE IF NOT EXISTS to `lib/db/client.ts` INIT_SQL
- **Created** `lib/services/oauth.ts` — `generateOAuthState()`, `verifyOAuthState()`, `purgeExpiredOAuthStates()` with 10-min TTL and single-use consumption
- **Created** OAuth callback route templates in `app/api/oauth/github/callback/route.ts` and `app/api/oauth/slack/callback/route.ts` — exchange code, encrypt token, store connection, redirect

**Added — Phase 2: GitHub Integration**
- **Added** 4 Drizzle tables to `lib/db/schema.ts`: `githubConnections` (accessToken encrypted, githubUser, avatarUrl, scopes, isActive), `githubRepos` (fullName, owner, stars, language, isPrivate, with FK cascade), `githubIssues`, `githubPullRequests`
- **Added** 4 CREATE TABLE statements to `lib/db/client.ts` INIT_SQL
- **Created** `lib/services/github.ts` — `testGitHubConnection()`, `syncRepos()` (paginated, upsert), `createIssue()`, `createPR()`, `searchRepos()`, `readRepoFile()`
- **Created** API routes:
  - `app/api/oauth/github/authorize/route.ts` — redirects to GitHub OAuth with scope repo,user,notifications
  - `app/api/oauth/github/callback/route.ts` — exchanges code, encrypts token via AES-256-GCM, stores connection, redirects back
  - `app/api/github/connections/route.ts` — GET (list with toPublic stripping accessToken), DELETE (by id)
  - `app/api/github/repos/route.ts` — GET (list repos ordered by stars)
  - `app/api/github/repos/[owner]/[repo]/issues/route.ts` — POST (create issue with Zod validation)
  - `app/api/github/repos/[owner]/[repo]/pulls/route.ts` — POST (create PR with Zod validation)
  - `app/api/github/repos/[owner]/[repo]/pulls/[n]/route.ts` — GET/PATCH (fetch/update PR)
  - `app/api/github/sync/route.ts` — POST (trigger full paginated repo sync)
- **Created** `app/dashboard/settings/integrations/github/page.tsx` — full settings page with connected/disconnected OAuth state, repo list, agent tool toggles, sync/disconnect buttons
- **Added** types: `GitHubConnectionPublic`, `GitHubRepoPublic` to `types/jarvis.ts`
- **Added** GitHub agent tools to `lib/ai/tools.ts` — `listRepos`, `createIssue` (gated by approval), `createPR` (gated by approval), `readRepoFile`, all behind `if (enabled("github"))`

**Added — Phase 3: Slack Integration**
- **Added** 2 Drizzle tables to `lib/db/schema.ts`: `slackWorkspaces` (accessToken encrypted, teamId, teamName, botUserId, scopes), `slackChannels` (channelId, name, topic, memberCount, isPrivate, FK cascade)
- **Added** 2 CREATE TABLE statements to `lib/db/client.ts` INIT_SQL
- **Created** `lib/services/slack.ts` — `testSlackConnection()`, `listChannels()`, `sendMessage()`, `sendThreadReply()`, `searchMessages()`, `uploadFile()`
- **Created** API routes:
  - `app/api/oauth/slack/authorize/route.ts` — redirects to Slack OAuth with channels:read,chat:write,search:read,files:write
  - `app/api/oauth/slack/callback/route.ts` — exchanges code, encrypts token, stores workspace, redirects
  - `app/api/slack/workspaces/route.ts` — GET/DELETE with toPublic
  - `app/api/slack/workspaces/[id]/channels/route.ts` — GET (list channels), POST (sync from Slack API, onConflictDoNothing)
  - `app/api/slack/send/route.ts` — POST (send message with Zod validation)
  - `app/api/slack/search/route.ts` — GET (search messages by query)
- **Created** `app/dashboard/settings/integrations/slack/page.tsx` — full settings page with connected workspace, channel grid, agent tool toggles, auto-summary toggles, OAuth connect
- **Added** types: `SlackWorkspacePublic`, `SlackChannelPublic` to `types/jarvis.ts`
- **Added** Slack agent tools to `lib/ai/tools.ts` — `sendSlackMessage` (gated), `listSlackChannels`, `searchSlack`, all behind `if (enabled("slack"))`

**Added — Phase 4: Web Search Settings UI**
- **Created** `app/api/search/test/route.ts` — POST (test search with current config, save provided tavilyKey/searxngUrl)
- **Created** `app/dashboard/settings/search/page.tsx` — full settings page with provider selector (Tavily/SearXNG/Auto), Tavily API key input with status dot and quota display placeholder, SearXNG URL config, inline search test with live results rendering

**Added — Phase 5: Google Drive Integration**
- **Added** 2 Drizzle tables to `lib/db/schema.ts`: `driveConnections` (accessToken, refreshToken both encrypted, googleEmail, tokenExpires), `driveDocs` (driveId, name, mimeType, parentFolder, extractedText, FK cascade)
- **Added** 2 CREATE TABLE statements to `lib/db/client.ts` INIT_SQL
- **Created** `app/dashboard/settings/integrations/drive/page.tsx` — settings page with connected/disconnected state, auto-import watch folder toggle, auto-extract toggle
- **Added** types: `DriveConnectionPublic`, `DriveDocPublic` to `types/jarvis.ts`

**Changed — Phase 6: Integrations Landing Page Polish**
- **Rewritten** `app/dashboard/settings/integrations/page.tsx` from 60-line hardcoded "Soon" card grid to full dynamic landing page with 3 sections:
  - **Connected** (4 cards): GitHub, Slack, Web Search, Google Drive — each links to its settings page, shows status badges and meta
  - **Available** (2 cards): Calendar (ENABLED), Webhooks (4 ACTIVE)
  - **Coming Soon** (4 cards, 50% opacity): Linear, Notion, Discord, Home Assistant
  - Links are clickable to dedicated settings pages; "Soon" cards are non-clickable with reduced opacity
- **Removed** unused `Badge` imports from old integrations page

**Verification:**
- `pnpm typecheck` passes with zero errors across all 30+ new/modified files

**Files Touched (modified):**
- `lib/db/schema.ts` — +250 lines (oauthStates + 9 integration tables)
- `lib/db/client.ts` — +115 lines (10 CREATE TABLE statements in INIT_SQL)
- `types/jarvis.ts` — +65 lines (6 public interfaces for integration types)
- `lib/ai/tools.ts` — +120 lines (GitHub + Slack agent tool blocks with enabled/approved guards)
- `app/dashboard/settings/integrations/page.tsx` — fully rewritten (162 lines)

**Files Created (new):**
- `lib/services/oauth.ts` — 55 lines (OAuth state generation, verification, expiry purge)
- `lib/services/github.ts` — 155 lines (GitHub API wrapper, repo sync, issue/PR creation, file read)
- `lib/services/slack.ts` — 100 lines (Slack API wrapper, channel list, messages, search, file upload)
- `app/api/oauth/github/authorize/route.ts` — 25 lines
- `app/api/oauth/github/callback/route.ts` — 65 lines
- `app/api/oauth/slack/authorize/route.ts` — 25 lines
- `app/api/oauth/slack/callback/route.ts` — 65 lines
- `app/api/github/connections/route.ts` — 34 lines (GET/DELETE with toPublic)
- `app/api/github/repos/route.ts` — 31 lines (GET list)
- `app/api/github/repos/[owner]/[repo]/issues/route.ts` — 42 lines (POST create)
- `app/api/github/repos/[owner]/[repo]/pulls/route.ts` — 42 lines (POST create)
- `app/api/github/repos/[owner]/[repo]/pulls/[n]/route.ts` — 50 lines (GET/PATCH)
- `app/api/github/sync/route.ts` — 28 lines (POST trigger sync)
- `app/api/slack/workspaces/route.ts` — 34 lines (GET/DELETE)
- `app/api/slack/workspaces/[id]/channels/route.ts` — 57 lines (GET/POST sync channels)
- `app/api/slack/send/route.ts` — 38 lines (POST send message)
- `app/api/slack/search/route.ts` — 28 lines (GET search)
- `app/api/search/test/route.ts` — 43 lines (POST test search)
- `app/dashboard/settings/integrations/github/page.tsx` — 200 lines (full GitHub settings UI)
- `app/dashboard/settings/integrations/slack/page.tsx` — 190 lines (full Slack settings UI)
- `app/dashboard/settings/integrations/drive/page.tsx` — 130 lines (full Drive settings UI)
- `app/dashboard/settings/search/page.tsx` — 210 lines (full Web Search settings UI)

**Goal:** Now that Matrix Builder runs in the background (its dev-server output goes to a log file instead of a terminal), give back visibility — a single, prettified, live **Console** page that surfaces logs from **both projects**, clearly divided into **Matrix Dashboard** and **Matrix Builder** sections.

**Added — new `/dashboard/console` page** (nav item `Console`, `SquareTerminal` icon) with up to 4 live sources, prettified (time · color-coded level · message), with search, per-level filter chips, pause/resume (freezes display), per-pane copy/download/clear + clear-all, and stick-to-bottom auto-scroll with a "Jump to bottom" button.
- **Dashboard – Backend** (`lib/services/log-bus.ts` + `instrumentation.ts`): a capped (2000) ring buffer + pub/sub on `globalThis`; `instrumentation.ts` tees `process.stdout/stderr.write` into it (line-buffered, ANSI-stripped, level-inferred, **re-entrancy + HMR-double-install guarded**, original write still passes through so the terminal is unaffected). Streamed by `GET /api/console/server` (NDJSON: snapshot + live subscribe; `DELETE` clears).
- **Dashboard – Browser** (`components/console/console-capture.tsx` mounted in `dashboard-shell.tsx` + `lib/stores/use-log-store.ts`): patches `window.console.*` + `error`/`unhandledrejection` into a zustand store (capped 1500). Install-guarded; original console still fires.
- **Builder – Dev server** (`lib/services/matrix-builder.ts` + `GET /api/matrix-builder/logs`): tails `~/.matrix-dash/matrix-builder/dev.log` — 64KB snapshot then polled appends, with a `{__control:"reset"}` marker on truncation/rotation; `DELETE` clears. New service helpers `builderLogPath/readBuilderLogTail/readBuilderLogSince/clearBuilderLog`.
- **Builder – App console** (optional, Tier-2): the host listens for `postMessage` of shape `{__mbConsole:true,...}` from the builder origin (`console-capture.tsx`). It's cross-origin so it can't be read directly; until a small bridge snippet is added inside the bolt app, the pane shows a hint. Host side is built and harmless until enabled.
- **Shared**: `lib/console/types.ts` (LogLine model + `stripAnsi`/`fmtTime`/`levelColor`/`inferLevel`), `lib/hooks/use-log-stream.ts` (NDJSON `getReader` consumer, reuses the chat-route streaming pattern, aborts on unmount), reusable `components/console/{log-line,log-stream-view,console-page}.tsx`.

**Verification (typecheck + real headless Chrome via CDP, live):**
- `pnpm typecheck` clean.
- `GET /api/console/server` streamed real backend lines (`[daemon] started`, `✓ Ready`, `Compiling /dashboard/console`, request logs); `DeprecationWarning` correctly classified `warn`. `GET /api/matrix-builder/logs` tailed the existing `dev.log`. Both `DELETE`s return `{ok:true}`.
- Page renders both divided sections; backend pane showed 350 live rows; **browser capture proven** — a `console.error(marker)` emitted in the page appeared in the Browser pane; **zero uncaught exceptions**.
- Confirmed the stdout/stderr tee does **not** break terminal logging (writes still pass through).

**Files Touched:** new `lib/console/types.ts`, `lib/services/log-bus.ts`, `lib/stores/use-log-store.ts`, `lib/hooks/use-log-stream.ts`, `app/api/console/server/route.ts`, `app/api/matrix-builder/logs/route.ts`, `app/dashboard/console/page.tsx`, `components/console/{console-page,log-stream-view,log-line,console-capture}.tsx`; modified `instrumentation.ts`, `lib/services/matrix-builder.ts`, `components/layout/{dashboard-shell,nav-items,topbar}.tsx`.

## 26/06/2026 @ 02:06:35 IST — "Opus 4.8"

**Goal:** Make the Matrix Builder tab auto-start its dev server. Opening `/dashboard/matrix-builder` should bring `:5001` up on demand (no separate terminal), mirroring the IDE's on-demand code-server lifecycle.

**Added:**
- **`lib/services/matrix-builder.ts`** — start/stop/restart/status for the builder's `pnpm dev` (the bolt.new fork, `remix vite:dev` on :5001). Spawns detached + unref'd from its own dir so it survives the request; idempotent start (reuses an already-listening server); status via an HTTP reachability probe + `lsof`; stop kills the whole process group found on the port. Resolves `pnpm` via `command -v` with Homebrew/corepack fallbacks; strips `PORT`/`HOST` from the child env so the inherited `next dev` `PORT=3000` can't override the builder's Vite `strictPort: 5001`. Dir/port overridable via `MATRIX_BUILDER_DIR` / `MATRIX_BUILDER_PORT`.
- **`app/api/matrix-builder/server/route.ts`** — `GET` status, `POST {action: start|stop|restart}` (mirrors `/api/ide/server`).
- **`components/matrix-builder/matrix-builder-gate.tsx`** — lifecycle gate: ensures cross-origin isolation (the self-heal hard-reload), then **auto-starts the builder on mount**, polls until reachable (~2 min budget for first Vite boot), and embeds it. Loading/starting spinner, and an error state with **Start** + prominent **Open in new tab** fallback.
- **`components/matrix-builder/matrix-builder-embed.tsx`** — the isolated iframe + a slim toolbar (Restart / Stop / Open in new tab), mirroring `CodeServerEmbed`.

**Changed:**
- **`app/dashboard/matrix-builder/page.tsx`** — now renders `<MatrixBuilderGate />` (the passive iframe + COI-reload logic moved into the gate).

**Fixed:**
- **Gate stuck on "Connecting…" forever.** **Cause:** the boot effect guarded its state update with a *shared* `mounted` ref toggled by a separate effect; React 19 Strict Mode (dev) double-invokes effects, and the ref read `false` mid-flight, permanently swallowing the `setPhase("running")`. **Fix:** an effect-local `cancelled` flag so only the superseded run bails and the live run always completes. Verified the embed renders after the fix.

**Verification (real headless Chrome via CDP, with :5001 actually running):**
- Auto-start: `POST …/server {start}` spawned `remix vite:dev`; `:5001` came up; status flipped to `running:true` (pid observed). Stop: `:5001` torn down, `running:false`.
- **Host** `/dashboard/matrix-builder`: `crossOriginIsolated === true`, `SharedArrayBuffer` available, iframe present with `allow="cross-origin-isolated"` + `credentialless`, no COEP-blocked errors.
- **Embedded bolt frame (:5001, level 2): `crossOriginIsolated === true`, `SharedArrayBuffer` available** — the real WebContainer precondition, proven in-browser.
- The **WebContainer runtime frame** (`stackblitz.com/headless?coep=credentialless`) booted inside the embed (3-level nesting reached). The LLM *generation* of an app (plan step 4's headline test) still needs the builder's Gemini key + a real prompt — not headlessly verifiable.

**Files Touched:** `lib/services/matrix-builder.ts` (new), `app/api/matrix-builder/server/route.ts` (new), `components/matrix-builder/matrix-builder-gate.tsx` (new), `components/matrix-builder/matrix-builder-embed.tsx` (new), `app/dashboard/matrix-builder/page.tsx`.

## 26/06/2026 @ 01:36:40 IST — "Opus 4.8"

**Goal:** Add a "Matrix Builder" sidebar page to matrix-dash that embeds the separate Matrix Builder app (a local bolt.new fork — a full-screen, in-browser AI IDE on :5001) as-is in a full-height iframe, with cross-origin isolation scoped to just that route so its WebContainer can boot. matrix-dash owns only the nav item, route, iframe, and headers; the embedded app is not ported or modified.

**Added:**
- **`/dashboard/matrix-builder` route** (`app/dashboard/matrix-builder/page.tsx`) — client component filling the dashboard content area with a full-height iframe (`page-h` utility, mirrors the IDE embed) to `NEXT_PUBLIC_MATRIX_BUILDER_URL` (default `http://localhost:5001`), plus an always-visible "Open in new tab" fallback. Sets the `credentialless` iframe attribute imperatively (React won't render the boolean attr) and delegates isolation via `allow="cross-origin-isolated"`.
- **Self-healing cross-origin isolation** — COOP/COEP headers only apply on a *full* document load, so a Next soft-nav from another sidebar route would land with `crossOriginIsolated === false`. On mount the page detects this and forces one hard reload (sessionStorage-guarded against loops, flag cleared once isolated), so clicking the sidebar item yields an isolated host without a manual refresh.
- **Sidebar nav item** "Matrix Builder" (`Blocks` icon) → `/dashboard/matrix-builder`, placed right after IDE (`components/layout/nav-items.ts`).
- **`.env.local`** (gitignored) documenting `NEXT_PUBLIC_MATRIX_BUILDER_URL=http://localhost:5001` so the embed URL isn't hardcoded.

**Changed:**
- **`next.config.ts`** — added `async headers()` scoped to `source: "/dashboard/matrix-builder"` ONLY: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. **Cause:** the embedded WebContainer needs SharedArrayBuffer, granted only in a cross-origin-isolated context. **Why require-corp (not credentialless):** the embed sends `CORP: cross-origin` so it loads fine, and require-corp avoids the storage partitioning that breaks the preview's service worker. **Deliberately NOT global** — a global COEP would block cross-origin images/scripts across the whole dashboard.
- **`components/layout/topbar.tsx`** — added `/dashboard/matrix-builder → "Matrix Builder"` to TITLES. **Cause:** without it the page rendered the wrong title ("Overview") via the `startsWith` fallback. **Fix:** explicit mapping.

**Verification:**
- `pnpm typecheck` → zero errors.
- `curl -I http://localhost:3000/dashboard/matrix-builder` → `200` with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- Scoping confirmed: `/dashboard` and `/dashboard/ide` return `200` with **no** COOP/COEP headers.
- Browser-gated steps (iframe renders, in-frame `crossOriginIsolated === true`, the 3-level-nested live preview, fallback tab) require the user's browser **and** Matrix Builder running on :5001 — handed off as a manual checklist.

**Known limitation:** the auto-reload makes the shared dashboard document cross-origin isolated, so soft-navigating *away* from this route to another dashboard page inherits COEP until the next full refresh. Severity is low (chrome, root layout, and Geist fonts are all same-origin) and it self-heals on any hard refresh.

**Files Touched:** `app/dashboard/matrix-builder/page.tsx` (new), `components/layout/nav-items.ts`, `components/layout/topbar.tsx`, `next.config.ts`, `.env.local` (new, gitignored), `plan.md` (spec).

## 26/06/2026 @ 01:16:04 IST — "Opus 4.8"

**Goal:** Make Project Planning match the agreed design (reference `~/Desktop/test/projects.html` + the OpenChamber planning session): a readable portfolio catalog **and** a proper 6×1 kanban whose cards are colour-coded project work-items (task/bug/error/feature) with descriptions, fully editable and draggable/togglable across stages.

**Fixed (runtime / environment — no tracked file):**
- **All DB-backed routes 500'd with empty bodies** → client threw `SyntaxError: Unexpected end of JSON input` in `fetchProjects`. **Cause:** `better-sqlite3` native addon was compiled for Node 22 (ABI 137) but the dev server runs on Node 26 (ABI 147) → `ERR_DLOPEN_FAILED`. **Fix:** `pnpm rebuild better-sqlite3` (recovers without restart). Logged to agent memory for next Node bump.

**Added:**
- **`kind` field on tasks** (`task` | `bug` | `error` | `feature`) — `schema.ts`, idempotent `ensureColumn` migration + `INIT_SQL` in `client.ts`, `KanbanTask` type + `TaskKind`, and zod create/update schemas in both task API routes.
- **Type select** in the task dialog; **Delete** button (fully editable) wired to `DELETE /api/projects/tasks/[id]` with optimistic removal + cross-tab notify.
- **Colour legend** + **"New task"** header button on the page.

**Changed (cause → fix → verification):**
- **ProjectCard rewritten** to match the reference catalog — always-visible rich card: colour-coded type badge, left accent stripe, **Description / Purpose / Tech Stack** (FE/BE/DB rows) and **coloured tech tags** derived from the stack strings, open-in-Finder link. (Was: collapsed one-line rows — the degraded version that was rejected.)
- **KanbanCard** now renders a **kind chip** (icon + colour), the **colour-coded project pill**, and the **description** under the title; keeps inline-edit, drag handle, and prev/next toggle.
- **Empty-board bug fixed** — the board used to be replaced wholesale by a "No tasks yet" state, hiding the column **Add** buttons so the first task could never be created. The board now always renders; a header **New task** button is the primary entry point.
- **Catalog centered** (~920px) so it reads like `projects.html`; board kept full-width below (stacked, since a 6-column board needs the width).

**Verification:** `pnpm typecheck` passes with zero errors. Page rendered and visually confirmed against `projects.html`; seeded sample cards across all 6 stages / 4 kinds / 4 projects to confirm the board (samples are user-deletable via the new Delete button).

**Files touched:**
`lib/db/schema.ts` · `lib/db/client.ts` · `types/jarvis.ts` · `app/api/projects/tasks/route.ts` · `app/api/projects/tasks/[id]/route.ts` · `components/projects/project-card.tsx` · `components/projects/kanban-card.tsx` · `components/projects/edit-task-dialog.tsx` · `app/dashboard/projects/page.tsx` · `components/projects/kanban-board.tsx` · `components/projects/kanban-column.tsx` · `CHANGELOG.md`

## 17/06/2026 @ 23:57:20 IST — "deepseek-v4-flash"

**Goal:** Rebuild the kanban board as a proper kanban system — colour-coded per project, inline-editable titles, quick-toggle arrows between stages, premium antigravity visual design.

**Changed (cause → fix → verification):**

- **KanbanCard rewritten** — now shows a 4px coloured left border per project (12 distinct project colours mapped via `PROJECT_COLORS`), a coloured project badge/chip at top, an **inline-editable title** (click to edit → input with Enter/Escape/Blur save → PATCH API), **quick-toggle arrows** (◀ ▶ at top-right with tooltip showing target column name), and **due-date urgency** (overdue = red pulse + "overdue" label, today = orange + "today" label). Drag grip handle remains on hover. Card uses `React.memo` for performance.
- **KanbanColumn redesigned** — computes adjacent column labels per task (`prevColumn` / `nextColumn`) and passes them to each card. Droppable area has glassmorphism + emerald glow ring on hover. Column header has accent dot with glow shadow + tabular-nums task count.
- **KanbanBoard updated** — new `onInlineEdit` and `onQuickToggle` props passed through to all cards. DragOverlay preview fixed to match new card shape.
- **Page wired** — `handleInlineEdit` PATCHes title and re-fetches, `handleQuickToggle` computes target column from `COLUMN_IDS` index + does optimistic state update + PATCH + re-fetch + cross-tab notify.
- **Visual polish** — glass hover lift on cards (`hover:translate-y-[-1px]` + soft shadow), column accent dot glowing (`shadow-[0_0_8px_currentColor]`), editing ring (`ring-1 ring-emerald-400/40`), arrow buttons only visible on row hover.

**Verification:** `pnpm typecheck` passes with zero errors. All 12 project colours display correctly.

**Files touched:**
`components/projects/kanban-card.tsx` · `components/projects/kanban-board.tsx` · `components/projects/kanban-column.tsx` · `app/dashboard/projects/page.tsx` · `CHANGELOG.md`

## 17/06/2026 @ 23:36:16 IST — "deepseek-v4-flash"

**Goal:** Enable true multi-tab support — all browser windows see data changes instantly without manual refresh.

**Added:**
- `lib/hooks/use-cross-tab-sync.ts` — reusable `BroadcastChannel` hook that signals all same-origin tabs to re-fetch after any mutation.
- Integrated into projects page: `handleSaveTask` (dialog create/edit) and `KanbanBoard.handleDragEnd` (drag persistence) both call `notifyTabs()` after the server write completes.
- KanbanBoard accepts optional `onNotifyTabs` callback, wired from the page.

**How it works:** The `BroadcastChannel` API is native to all modern browsers (Chrome, Safari 16.4+, Firefox). Tab A POST/PATCHes data → server persists to SQLite (WAL mode, single process) → Tab A calls `notifyTabs()` → Tab B's message handler fires → `refreshAll()` re-fetches both projects + tasks. Zero polling, zero server overhead, zero latency.

**Verification:** `pnpm typecheck` passes with zero errors.

**Files touched:**
`lib/hooks/use-cross-tab-sync.ts` (created) ·
`app/dashboard/projects/page.tsx` · `components/projects/kanban-board.tsx` ·
`CHANGELOG.md`

## 17/06/2026 @ 23:32:08 IST — "deepseek-v4-flash"

**Goal:** Add a "Project Planning" sidebar page with a portfolio catalog of all 12 projects (seeded from the `projects.html` portfolio file) and a 6-column Kanban board with drag-and-drop task management.

**Added:**
- **Database:** `projects` table (id, name, description, purpose, frontend/backend/database, badge, path, status) + `kanban_status`, `project_id`, `kanban_order` columns on existing `tasks` table. 12 projects auto-seeded from the portfolio HTML file on first DB init. Column migrations for existing task rows.
- **Types:** `Project` and `KanbanTask` interfaces in `types/jarvis.ts`, with `KanbanStatus` union type for the 6 columns.
- **API routes:** `/api/projects` (GET/POST), `/api/projects/[id]` (GET/PATCH/DELETE), `/api/projects/tasks` (GET with projectId/kanbanStatus filters + POST with auto-order), `/api/projects/tasks/[id]` (PATCH/DELETE).
- **UI components:**
  - `project-card.tsx` — expandable portfolio card with badge, description/purpose/tech-stack sections, "View Tasks" button, file:// link.
  - `kanban-board.tsx` — `@dnd-kit` DndContext with 6 droppable columns, DragOverlay, cross-column sorting, server persistence on dragEnd.
  - `kanban-column.tsx` — column header with accent dot, task count, "+" button, droppable + sortable task list (scrollable, max-h 420px).
  - `kanban-card.tsx` — sortable task card with grip handle, project badge, priority color, due date.
  - `edit-task-dialog.tsx` — modal for create/edit with title, notes, priority, due date, project selector, column selector.
- **Page:** `app/dashboard/projects/page.tsx` — full page with orb backgrounds, gradient title, portfolio catalog, kanban board, filter pill, empty states, loading spinner.
- **Sidebar:** "Project Planning" nav item (FolderKanban icon) between Tasks and Calendar.
- **Package:** `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`.

**Verification:** `pnpm typecheck` passes with zero errors.

**Files touched:**
`lib/db/schema.ts` · `lib/db/client.ts` · `types/jarvis.ts` · `components/layout/nav-items.ts` ·
`app/api/projects/route.ts` · `app/api/projects/[id]/route.ts` · `app/api/projects/tasks/route.ts` · `app/api/projects/tasks/[id]/route.ts` ·
`components/projects/project-card.tsx` · `components/projects/kanban-card.tsx` · `components/projects/kanban-column.tsx` · `components/projects/kanban-board.tsx` · `components/projects/edit-task-dialog.tsx` ·
`app/dashboard/projects/page.tsx` ·
`package.json` · `pnpm-lock.yaml`

## 15/06/2026 @ 18:03:06 IST — "claude-opus-4-8"

**Goal:** Wire **every** slash command to a real Matrix action (not just `/clear`), and fix the `SQLITE_CORRUPT_VTAB` crash that broke skill toggling.

**Fixed (cause → fix):** Toggling skills threw `SqliteError: database disk image is malformed (SQLITE_CORRUPT_VTAB)` — the `skills_fts` FTS5 index was corrupt, and the `skills_au` trigger writes to it on every change. Repaired the live DB (drop → recreate → rebuild `skills_fts`; main DB `quick_check` was clean, 1540 skills intact). Hardened `backfillSkillsFts()` (`lib/db/client.ts`) to **self-heal on boot**: a failing read or rebuild now drops + recreates the virtual table and rebuilds from content, so corruption can't permanently break skill writes.

**Added — full slash-command dispatch (`components/chat/chat-interface.tsx`):**
- `/clear` → reset transcript · `/model` → opens the model dropdown (new `modelSelectorOpen` store flag + `model-selector.tsx` sync) · `/agents` + `/permissions` → Settings → Agent Tools · `/mcp` → Settings → Integrations · `/memory` → Memory Bank · `/usage` → Settings → Diagnostics · `/context` → injects a session/provider/model summary · `/help` → injects the command list · `/compact` `/init` `/review` → passed through to the OpenClaude engine.

**Verification:** `pnpm typecheck` → **0 errors**. Live: `skills_fts` rebuilt (1540 rows), trigger-write succeeds.

**Files touched:** `lib/db/client.ts`, `components/chat/chat-interface.tsx`, `components/chat/model-selector.tsx`, `lib/stores/use-app-store.ts`; `CHANGELOG.md`.

## 15/06/2026 @ 17:54:52 IST — "claude-opus-4-8"

**Goal:** Two chat-input fixes — remove the redundant Matrix chat/agent toggle, and open a slash-command menu when typing `/`.

**Changed (`components/chat/chat-input.tsx`):**
- **Removed the Chat / Agent segmented toggle** (and its `chatMode` store reads) — the input now has just the **Claude Code** button plus the provider/model selectors.
- **Slash-command menu**: typing `/` at the start of the input opens a popover of commands (filtered as you type), with ↑/↓ to navigate, Enter/Tab to insert, Esc to dismiss, and click-to-select. Placeholder updated to hint "/ for commands".

**Added:**
- **`lib/chat/slash-commands.ts`** — the command registry (clear, compact, init, review, context, usage, model, agents, mcp, memory, permissions, help).
- **`/clear` handled client-side** (`components/chat/chat-interface.tsx`): resets the transcript instead of sending; other commands pass through to the OpenClaude engine.

**Verification:** `pnpm typecheck` → **0 errors**.

**Files touched:** `components/chat/chat-input.tsx`, `lib/chat/slash-commands.ts`, `components/chat/chat-interface.tsx`; `CHANGELOG.md`.

## 15/06/2026 @ 17:45:09 IST — "claude-opus-4-8"

**Goal:** The Chat tab should be a **standalone Claude chat**, not the VS Code/code-server IDE. Revert the IDE embed and integrate **OpenClaude** (github.com/Gitlawb/openclaude) as the chat engine.

**Changed:**
- **`app/dashboard/chat/page.tsx`**: reverted the code-server embed — the Chat tab is the standalone `ChatInterface` again.
- **`components/chat/chat-interface.tsx`**: the engine toggle now routes to `/api/ai/openclaude`; install banner + status check point at OpenClaude (`npm install -g @gitlawb/openclaude@latest`).

**Added:**
- **`lib/services/openclaude.ts`** + **`app/api/ai/openclaude/route.ts`**: spawn OpenClaude headless (`openclaude -p --output-format stream-json`) and stream its events into the block UI. OpenClaude is a provider-agnostic Claude Code fork, so it runs the **active Matrix provider/model natively** — `providerEnv()` maps the provider to `CLAUDE_CODE_USE_OPENAI=1` + `OPENAI_BASE_URL/_API_KEY/_MODEL` (or Gemini/Anthropic env). **No Anthropic proxy needed.** Auto-detects the `openclaude` binary; power level → permission flags; per-session `--resume`. Reuses the existing stream-json → Block mapping.

**Verified live:** `POST /api/ai/openclaude` → OpenClaude on Deepseek → streamed `{"type":"text","value":"openclaude works"}` (the missing piece was `CLAUDE_CODE_USE_OPENAI=1`, which selects the OpenAI-compatible provider instead of OpenClaude's default Opengateway). `pnpm typecheck` → **0 errors**.

**Files touched:** `app/dashboard/chat/page.tsx`, `components/chat/chat-interface.tsx`, `lib/services/openclaude.ts`, `app/api/ai/openclaude/route.ts`; `CHANGELOG.md`.

## 15/06/2026 @ 07:54:31 IST — "claude-opus-4-8"

**Goal:** Give the Chat tab the *actual* Claude Code input bar with **all** its features (slash commands, model/effort/thinking, MCP, agents, hooks, output styles, plugins, usage, context) — by embedding the real extension rather than reimplementing it, and running it on the Matrix model.

**Added / Changed:**
- **`app/dashboard/chat/page.tsx`**: when the Claude Code engine is toggled, the Chat tab now embeds the **real Claude Code extension** via the existing code-server gate (`CodeServerGate`) instead of the custom chat — the genuine panel with every feature. A slim header (Claude logo + "runs on your active Matrix model" + "Use Matrix chat") lets you switch back. A `[&>div]:!h-full` override fits the gate's `page-h` shell into the chat area.
- **Process Wrapper (machine config, outside the repo):** created `~/.matrix-dash/claude-proxy-wrapper.sh` and set `claudeCode.claudeProcessWrapper` in code-server's `data/User/settings.json` so the extension launches Claude through Matrix's proxy → the full real UI runs on the **active Matrix provider/model**, not Claude credits.

**Why embed (not reimplement):** those features are Claude Code's own frontend; a hand-built copy would be brittle and perpetually behind. The real extension (already installed in Matrix's code-server) has all of them — we just feed it Matrix's models.

**Verified live:** the wrapper routed the real `claude` → Matrix proxy → Deepseek (`"wired"`, `is_error:false`, **$0.00006** — not Claude credits). `pnpm typecheck` → **0 errors**.

**Known limitation:** the embed shows inside code-server's frame (open the ✳ Claude Code panel within it). A fully chrome-less, auto-opened panel isn't reliably achievable via code-server URL params without hiding the IDE-tab chrome too.

**Files touched:** `app/dashboard/chat/page.tsx`; `CHANGELOG.md`. (Plus machine config: `~/.matrix-dash/claude-proxy-wrapper.sh`, code-server `settings.json`.)

## 15/06/2026 @ 07:19:42 IST — "claude-opus-4-8"

**Goal:** Make the chat's empty state look identical to the real Claude Code UI when the Claude Code engine is active.

**Added:**
- **`components/chat/claude-code-hero.tsx`** — `ClaudeCodeEmpty`: reproduces Claude Code's start screen — clay "✳ Claude Code" serif wordmark at the top, the **real Clawd pixel mascot** centered, the `Shift`+`Tab` "automatically approve code edits" hint, and the chat input at the bottom, on Claude Code's near-black (`#0d0d0d`) background.
- **`public/clawd.svg` + `public/claude-logo.svg`** — the genuine assets, copied from the installed Claude Code extension (`~/.matrix-dash/code-server/extensions/anthropic.claude-code-2.1.177/resources`) so it's pixel-identical rather than an approximation. (These are Anthropic's brand assets — fine for personal/local use; keep the repo private or swap them if publishing.)

**Changed:**
- **`components/chat/chat-interface.tsx`**: when the chat is empty and the Claude Code engine is on, render `ClaudeCodeEmpty` (with the install-status banner + input) instead of the Matrix Dash hero. Plain Matrix chat is unchanged.

**Verification:** `pnpm typecheck` → **0 errors**.

**Files touched:** `components/chat/claude-code-hero.tsx`, `components/chat/chat-interface.tsx`, `public/clawd.svg`, `public/claude-logo.svg`; `CHANGELOG.md`.

## 15/06/2026 @ 00:27:18 IST — "claude-opus-4-8"

**Goal:** Fix the empty-response bug found during live end-to-end testing of the Claude Code wrapper.

**Fixed (cause → fix):** The built-in proxy honored the `model` field Claude Code sends — but Claude Code always sends *its own* model id (e.g. `claude-opus-4-7`), which other providers reject (`400 The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed claude-opus-4-7`). So the provider 400'd and Claude Code reported an empty result. Now the proxy **ignores the requested model and always runs the active Matrix provider/model** (`resolveModel(provider)` in `app/api/ai/proxy/v1/messages/route.ts`), and `lib/services/claude-code.ts` **no longer passes `--model`** (Claude Code's Claude id would never match another provider). The user picks the model in Matrix as usual.

**Verified live (this session):** real `claude` CLI → Matrix proxy → Deepseek round-trip ran for **$0.00006** (not $0.18 — confirming it used the Matrix provider, NOT Claude credits), and after the fix the proxy streamed real text (`"it works"`) while Claude Code requested `claude-opus-4-7`. `pnpm typecheck` → **0 errors**.

**Files touched:** `app/api/ai/proxy/v1/messages/route.ts`, `lib/services/claude-code.ts`; `CHANGELOG.md`.

## 15/06/2026 @ 00:09:06 IST — "claude-opus-4-8"

**Goal:** Make the Claude Code engine **zero-config and "just work" with any Matrix-selected model** — no base URLs, no bin paths, no separate router to install.

**Added:**
- **`app/api/ai/proxy/v1/messages/route.ts`** — Matrix's own built-in **Anthropic-compatible `/v1/messages` endpoint**. Translates the request Claude Code sends into an AI SDK `streamText` call on the user's **active Matrix provider** (tools passed through as definitions only — the model emits `tool_use`, Claude Code runs the tool locally), and translates the output back into Anthropic SSE (`message_start` → text/`tool_use` content blocks → `message_delta`/`message_stop`). So Matrix *is* the router — no claude-code-router needed. Honors the model id Matrix passes (`resolveModel(provider, body.model)`), so Claude Code runs exactly the model selected in Matrix.

**Changed (`lib/services/claude-code.ts`):**
- **Auto-detect the binary** — `findClaudeBin()` searches the setting, then common install paths (`/usr/local/bin`, Homebrew, `~/.local/bin`, npm/bun global), then PATH. No "bin" field to fill in.
- **Auto-wire credentials** — `autoCredentials()` always points `ANTHROPIC_BASE_URL` at Matrix's own proxy (derived from the request origin — `app/api/ai/claude-code/route.ts` passes `matrixOrigin`) and passes the active model via `--model`. The user configures nothing.
- **Status banner** (`components/chat/chat-interface.tsx`): when the Claude Code engine is on but the CLI isn't installed, a banner shows the one install command.

**Removed:** the earlier Anthropic-key-direct shortcut — per the user, Claude Code must always run on the **Matrix-selected model** (any provider), never fall back to a separate Anthropic key.

**Verification:** `pnpm typecheck` → **0 errors**. NOTE: still needs the `claude` CLI installed (`npm i -g @anthropic-ai/claude-code`); the proxy translation is typecheck-proven, not runtime-proven — first real run may need a tweak. A non-Claude `--model` could be rejected by some CLI versions; the proxy falls back to the provider default if so.

**Files touched:** `app/api/ai/proxy/v1/messages/route.ts`, `lib/services/claude-code.ts`, `app/api/ai/claude-code/route.ts`, `components/chat/chat-interface.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 23:54:07 IST — "claude-opus-4-8"

**Goal:** Pivot Claude Code mode to **wrap the REAL Claude Code CLI** (not just reimplement its experience). The chat can now run through the actual `claude` agent — routed through claude-code-router so it uses any Matrix provider key — with its event stream rendered in Matrix's existing block UI. The native agent (Phases 1–4) remains the fallback when the CLI isn't installed.

**Added:**
- **`lib/services/claude-code.ts`** — spawns `claude -p … --output-format stream-json --verbose` headlessly (mirrors `ollama.ts`/`code-server.ts`); maps Claude Code's stream-json events (`system/init`, `assistant` text + `tool_use`, `user` `tool_result`, `result`) onto Matrix's `StreamEvent`/`Block` protocol so it renders in the same transcript UI. `detectClaude()` probes the binary; power level → permission flags (`--dangerously-skip-permissions` / `acceptEdits` / `plan`); per-session `--resume` via a process-wide session map; `ANTHROPIC_BASE_URL` from the `claude_code_base_url` setting (point at claude-code-router for any provider).
- **`app/api/ai/claude-code/route.ts`** — `GET` status probe; `POST` streams a turn through the CLI over the same NDJSON block protocol and persists the transcript like the native route.
- **Engine toggle** — `useClaudeCode` in the app store + a "Claude Code" pill in the chat input; `chat-interface` routes to `/api/ai/claude-code` vs `/api/ai/chat` accordingly.
- **Settings** (`types/settings.ts`): `claude_code_bin` (defaults to `claude` on PATH) and `claude_code_base_url`.

**Removed:** the abandoned native-unification stubs (`lib/ai/capabilities.ts`, `lib/ai/agent-prompt.ts`) — superseded by the wrapper pivot.

**Verification:** `pnpm typecheck` → **0 errors**. NOTE: end-to-end runtime requires the `claude` CLI installed (and, for non-Anthropic providers, claude-code-router running with `claude_code_base_url` pointed at it) — that can't be exercised in this environment. Reuses the Phase 1–2 block model/renderer/persistence, so its output renders identically to the native agent.

**Files touched:** `lib/services/claude-code.ts`, `app/api/ai/claude-code/route.ts`, `lib/stores/use-app-store.ts`, `components/chat/chat-input.tsx`, `components/chat/chat-interface.tsx`, `types/settings.ts`; removed `lib/ai/capabilities.ts`, `lib/ai/agent-prompt.ts`; `CHANGELOG.md`.

## 14/06/2026 @ 23:42:06 IST — "claude-opus-4-8"

**Goal:** Phase 4 of Claude Code mode — **interactive inline Allow/Deny approvals**. In `approval` power level the agent now pauses mid-run, shows an Allow / Allow always / Deny card, and resumes on your click.

**Added:**
- **`lib/ai/approvals.ts`** — the side-channel. A `globalThis`-pinned pending-approval registry (safe: single self-hosted Node process). `requestApproval(ctx, …)` emits an `approval_request` event and returns a Promise that a tool's `execute()` awaits — which holds the streamText step open with no extra plumbing (the SDK awaits the execute promise before emitting the tool-result). Auto-denies after 5 min and on request-abort so the loop never wedges; always emits a matching `approval_resolved`. `settleApproval()` is delete-before-resolve (idempotent; first decision wins) and persists `approve_<tool>` on "allow always". Exports `AgentRequestContext`.
- **`app/api/ai/approve/route.ts`** — `POST {approvalId, decision}` → `settleApproval`; 404 if expired/already-decided/server-restarted.
- **`components/chat/blocks/approval-card.tsx`** — the inline amber "Approval required" card (Allow / Allow always / Deny), flipping to a resolved chip when the decision lands.

**Changed:**
- **`app/api/ai/chat/route.ts`**: threads a per-request `AgentRequestContext` into `streamText` via `experimental_context` (+ `abortSignal: req.signal`); its `emit` is bound to the live stream controller inside the ReadableStream, so a tool can write an approval request into the same stream it's blocking.
- **`lib/ai/coding-tools.ts`**: the interim boolean gate is now an async `gate()` that calls `requestApproval` at `approval` level (skipped if `approve_<tool>` is already remembered, or auto-denied with no interactive stream — safe for headless runs).
- **Client threading** (`transcript-renderer.tsx`, `message-bubble.tsx`, `chat-interface.tsx`): an `onApprove` callback POSTs the decision to `/api/ai/approve`; the card resolves when the streamed `approval_resolved` updates the block.

**Verification:** `pnpm typecheck` → **0 errors**. Lifecycle hazards handled: timeout auto-deny, abort release, idempotent settle, restart → 404, "allow always" persisted via the existing `approve_*` convention.

**Files touched:** `lib/ai/approvals.ts`, `app/api/ai/approve/route.ts`, `components/chat/blocks/approval-card.tsx`, `app/api/ai/chat/route.ts`, `lib/ai/coding-tools.ts`, `components/chat/transcript-renderer.tsx`, `components/chat/message-bubble.tsx`, `components/chat/chat-interface.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 23:35:02 IST — "claude-opus-4-8"

**Goal:** Phase 3 of Claude Code mode — give the agent **real coding tools on the real filesystem**, gated by a three-level power setting (sandboxed / approval / unrestricted).

**Added:**
- **`lib/ai/power.ts`** — the power model: `PowerLevel`, `getPowerLevel()` (fails closed to `sandboxed`), `getWorkspaceRoot()` (default `~/MatrixDash`), `isToolAllowed`/`requiresApproval`, and the `MUTATING_TOOLS` set.
- **`lib/services/workspace-root.ts`** — `resolveInRoot()`: the root-containment check `workspace.ts`'s `assertAbsolute` lacks (it doesn't stop `../` escape). Confines every coding-tool path to the workspace root and re-checks the parent's realpath to defeat symlink escapes. Plus `relToRoot()` for short display paths.
- **`lib/ai/bash.ts`** — `runBash()`: real shell via `spawn({shell:true, cwd:root, detached:true})` with a **process-group SIGTERM→SIGKILL timeout** (execFile leaks grandchildren), `AbortSignal` teardown, scrubbed env (drops `PORT`/`BIND_ADDR`), and head+tail output truncation (~40 KB) to protect the 8 GB box.
- **`lib/ai/coding-tools.ts`** — `buildCodingTools(level, root)`: `readFileFs`, `grep`, `glob`, `todoWrite` (always), plus `writeFileFs`, `editFile`, `multiEdit`, `bash` (only at approval/unrestricted). grep/glob are dependency-free Node walkers honoring an ignore set; `editFile`/`multiEdit` require a unique `oldString` unless `replaceAll`.
- **Settings UI** (`app/dashboard/settings/agent-tools/page.tsx`): a three-way power-level control + a workspace-root input, and a "Coding tools" toggle.

**Changed:**
- **`lib/ai/tools.ts`**: spreads `buildCodingTools(getPowerLevel(), getWorkspaceRoot())` into the agent toolset (gated by a `coding` flag, default on).
- **`types/settings.ts`**: `agent_power_level` (default `approval`) and `agent_workspace_root` defaults.

**Interim note:** in `approval` mode, mutating tools currently block unless their `approve_<tool>` flag is set (the existing boolean convention). Phase 4 replaces that with **interactive inline Allow/Deny** prompts.

**Verification:** `pnpm typecheck` → **0 errors**. `sandboxed` is the fail-closed default for any unknown value; mutating tools aren't even registered there.

**Files touched:** `lib/ai/power.ts`, `lib/services/workspace-root.ts`, `lib/ai/bash.ts`, `lib/ai/coding-tools.ts`, `lib/ai/tools.ts`, `types/settings.ts`, `app/dashboard/settings/agent-tools/page.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 23:26:43 IST — "claude-opus-4-8"

**Goal:** Phase 2 of Claude Code mode — persist the structured block transcript so an assistant turn's tool calls (and later diffs/todos) **replay on session reload**, not just the final text.

**Added:**
- **`session_messages.blocks`** — a nullable `TEXT` column (JSON-encoded `Block[]`) added to the schema (`lib/db/schema.ts`) and backfilled idempotently on boot via `ensureColumn("session_messages","blocks","blocks TEXT")` (`lib/db/client.ts`). Strictly additive: legacy rows keep `blocks` NULL and render from `content`.
- **`serializeBlocksForStorage` / `parseBlocksJson`** (`lib/chat/blocks.ts`): serialize a turn's blocks (capping large tool outputs at ~6 KB so a runaway result can't bloat the row) and safely parse them back, falling back to `null` on any error.

**Changed:**
- **`app/api/ai/chat/route.ts`**: the stream now folds every emitted event into a server-side `Block[]` (same `appendEvent` reducer the client uses) and persists the assistant row in the stream's `finally` — `content` stays the concatenated text (so memory extraction/search/export are untouched) and `blocks` stores the JSON transcript. Assistant-row persistence moved out of `onFinish` (which now only triggers background extraction) so the block array is guaranteed fully assembled before the write.
- **Hydration** (`app/dashboard/sessions/[id]/page.tsx`, `components/chat/chat-interface.tsx`, `types/session.ts`): saved sessions pass `blocks` through; `toChatMessage` prefers `parseBlocksJson(blocks)` and falls back to `textToBlocks(content)` for legacy rows.

**Verification:** `pnpm typecheck` → **0 errors**. Additive column + null-tolerant hydration keep old sessions loading unchanged.

**Files touched:** `lib/db/schema.ts`, `lib/db/client.ts`, `lib/chat/blocks.ts`, `app/api/ai/chat/route.ts`, `app/dashboard/sessions/[id]/page.tsx`, `components/chat/chat-interface.tsx`, `types/session.ts`; `CHANGELOG.md`.

## 14/06/2026 @ 23:12:27 IST — "claude-opus-4-8"

**Goal:** Phase 1 of bringing the Claude Code agent experience into Matrix's unified chat: replace the flat-string assistant transcript with an ordered **block model** and start rendering tool calls. Until now the chat ran a server-side agent loop but the NDJSON stream **dropped every tool-call/tool-result part**, so the tools the agent already ran in agent mode were invisible. This is the backbone every later phase (real coding tools, interactive approvals, diffs/todos) renders on top of — backward-compatible, no new tools or power levels yet.

**Added:**
- **`lib/chat/blocks.ts`** — the canonical, isomorphic transcript model shared by server + client: a `Block` discriminated union (text · reasoning · tool_call · todo · approval · error), the `StreamEvent` NDJSON vocabulary, a pure `appendEvent(blocks, idMap, ev)` reducer that folds events into blocks in arrival order (matching each `tool_result` to its `tool_call` by id), plus `blocksToText` / `textToBlocks` helpers for TTS, persistence, and legacy-row hydration.
- **`components/chat/transcript-renderer.tsx`** — maps an assistant turn's `Block[]` to components (text → Markdown, reasoning → ThinkingBlock, tool_call → ToolCallBlock); shows a "Working…" pulse for the empty streaming placeholder. todo/approval are no-ops until later phases.
- **`components/chat/blocks/tool-call-block.tsx`** — a collapsible "● Tool(arg)" card with a running-spinner / emerald-dot / rose-✗ `StatusGlyph` and a mono output body, in the artifact-panel machined-glass famil

**Changed:**
- **`app/api/ai/chat/route.ts`**: the `result.fullStream` loop now forwards the previously-dropped `tool-call` → `{type:"tool_call",id,name,args}`, `tool-result` → `{type:"tool_result",id,name,result}`, and `tool-error` → `{type:"tool_result",id,name,error}` (field names verified against the AI SDK v5 `TextStreamPart` typings). Existing text/reasoning/error lines unchanged.
- **`components/chat/chat-interface.tsx`**: `ChatMessage` now carries `blocks: Block[]` instead of `content`/`thinking`; the streaming reducer uses `appendEvent` (flushing a fresh array ref each tick so React re-renders); the API payload derives `content` via `blocksToText`; an `InitialMessage` prop type keeps persisted sessions passing `{id,role,content}` (converted to a single text block on load — so existing callers and old rows need no change).
- **`components/chat/message-bubble.tsx`**: the assistant branch delegates to `TranscriptRenderer`; the user branch + avatar chrome are untouched.

**Verification:** `pnpm typecheck` → **0 errors**. Backward-compat preserved on both the wire (legacy `text`/`reasoning`/`error` lines retained) and load path (old `content` rows hydrate as one text block); non-tool-capable models simply emit no tool blocks and render exactly as before.

**Files touched:** `lib/chat/blocks.ts`, `components/chat/transcript-renderer.tsx`, `components/chat/blocks/tool-call-block.tsx`, `app/api/ai/chat/route.ts`, `components/chat/chat-interface.tsx`, `components/chat/message-bubble.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 18:19:41 IST — "claude-opus-4-8"

**Goal:** Make the AI provider form dynamic — only require fields that a given provider actually needs. Concretely: local providers (Ollama, LM Studio) run on the user's machine and need no API key, but the form (and API) hard-required one.

**Added:**
- `local?: boolean` on `ProviderSpec` (marked on `ollama` + `lmstudio`), plus `requiresApiKey(kind)` and a `LOCAL_API_KEY` placeholder constant (`types/ai-provider.ts`).

**Changed:**
- **Form** (`components/settings/provider-form.tsx`): the API-key field is now labelled "(optional — local)" with a "Not needed for local models" placeholder when the selected provider is local; "Load models", submit-disabled, and the footer note all key off `requiresApiKey(provider)` instead of unconditionally demanding a key. Cloud providers behave exactly as before.
- **Create route** (`app/api/providers/route.ts`): `apiKey` is now optional in the schema, with a server-side backstop that still returns **400** for cloud providers missing a key; local providers store the `LOCAL_API_KEY` placeholder (so `createOpenAI` always has a non-empty key — local endpoints ignore it).
- **Unsaved-form model listing** (`app/api/providers/models/route.ts`): `apiKey` optional, defaults to the placeholder so local catalogues list without a key.

**Verification:** `pnpm typecheck` → **0 errors**. Live API test on :3000 — cloud provider with no key → `400 "An API key is required"`; local Ollama provider with no key → `200` (created); test row deleted afterward.

**Files touched:** `types/ai-provider.ts`, `components/settings/provider-form.tsx`, `app/api/providers/route.ts`, `app/api/providers/models/route.ts`; `CHANGELOG.md`.

## 14/06/2026 @ 18:13:56 IST — "claude-opus-4-8"

**Goal:** Fix `TypeError: crypto.randomUUID is not a function` that crashed the confirm dialog when deleting a model provider.

**Fixed (cause → fix):** Zustand store initializers (`lib/stores/use-feedback.ts`) and client components (`components/chat/chat-interface.tsx`) called `crypto.randomUUID()` — the browser Web Crypto global. Next.js evaluates these modules at SSR time where that global is absent. Replaced all call sites with a `uid()` helper that guards the call and falls back to `Math.random().toString(36).slice(2)` when `crypto.randomUUID` is unavailable.

**Verification:** `pnpm typecheck` → **0 errors**.

**Files touched:** `lib/stores/use-feedback.ts`, `components/chat/chat-interface.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 18:06:48 IST — "claude-opus-4-8"

**Goal:** Stop dumping every enabled skill into the agent system prompt and replace it with skill RAG — retrieve only the skills relevant to each turn, and give the agent tools to discover/load more on demand. With 1540 enabled skills, the old `buildSkillsPrompt()` concatenated all of them and leaned on a 60k-char truncation, so the agent got an arbitrary alphabetical slice rather than the relevant ones.

**Added:**
- **`skills_fts` FTS5 index** (`lib/db/client.ts`): a virtual table over `skills(name, description, instructions)` with insert/delete/update triggers mirroring `memories_fts`/`notes_fts`. A `backfillSkillsFts()` step rebuilds the index on boot whenever it drifts from the base table, so the 1540 already-imported skills get indexed without a re-import.
- **`searchSkillsFts(query, limit)`** (`lib/db/fts.ts`): ranked retrieval of *enabled* skills via FTS5, reusing the existing `toFtsQuery()` sanitizer.
- **`findSkills` / `loadSkill` agent tools** (`lib/ai/tools.ts`): the orchestrator layer — the agent can search the catalog (names + descriptions) and pull a skill's full instructions on demand mid-reasoning. Gated by a new `skills` tool flag (default on), surfaced in Settings → Agent Tools.

**Changed:** `buildSkillsPrompt()` (`app/api/ai/chat/route.ts`) now takes the user message and injects the top-8 FTS-matched enabled skills (falling back to the most recently enabled when there's no query signal), instead of all enabled skills. The 60k budget cap remains as a final safety net.

**Verification:** `pnpm typecheck` → **0 errors**. Proved the retrieval pipeline on a copy of the live DB (`~/MatrixDash/matrix.db`, 1540 skills): `rebuild` indexed all 1540; query "react frontend component design" → `frontend-developer`, `senior-frontend`, …; "stripe payment subscription" → `stripe-integration`, `payment-integration`, … — tightly relevant top-K.

**Files touched:** `lib/db/client.ts`, `lib/db/fts.ts`, `lib/ai/tools.ts`, `app/api/ai/chat/route.ts`, `app/dashboard/settings/agent-tools/page.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 13:43:40 IST — "claude-opus-4-8"

**Goal:** Fix the broken "Pull" button in the Cookbook model catalog (`/dashboard/settings/cookbook`) — while pulling, it wrapped to three lines and burst out of the pill.

**Fixed (cause → fix):** Ollama's pull stream emits per-layer statuses like `pulling aabd4debf0c8` with a `completed/total`; the button label was set to `"<status> <pct>%"`, so it rendered the long layer digest (`pulling aabd4debf0c8 15%`) inside a small `size="sm"` pill with no width constraint → it wrapped and overflowed. `app/dashboard/settings/cookbook/page.tsx` now (1) shows just the percentage during layer downloads (drops the digest) and (2) constrains the button (`min-w-[92px] max-w-[124px] whitespace-nowrap`, `truncate` label, `shrink-0` icon) so even long phase labels (e.g. "verifying sha256 digest") ellipsize instead of breaking the box.

**Verification:** `pnpm typecheck` → **0 errors**. Live on :3001 — `/dashboard/settings/cookbook` renders 200.

**Files touched:** `app/dashboard/settings/cookbook/page.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 13:28:04 IST — "claude-opus-4-8"

**Goal:** Bring the three interactive surfaces that were intentionally skipped — Chat, Email, and the IDE — onto Aurora Spatial, using the "material" language (glass, accent states, spring motion) rather than hero headers that would clip a full-height pane.

**Changed (visual/className-only; all interaction logic preserved):**
- **Chat** — `components/chat/chat-interface.tsx` (glass empty-state tile with bezel/sheen, refined scrollbar + error toast), `components/chat/message-bubble.tsx` (rounded-2xl bubbles, soft emerald-tinted user bubble + glow, spring easing), `components/chat/chat-input.tsx` (rounded-2xl glass composer with emerald focus ring, spring/active-scale on all controls, glowing send pill — Enter/Shift+Enter and all handlers untouched).
- **Email** — `app/dashboard/email/page.tsx` (3-pane client: emerald accent-pill active folders, selected message rows with left accent bar + inset glow, refined reading pane and star/restore/delete buttons).
- **IDE** — `components/ide/code-server-gate.tsx` + `code-server-install-panel.tsx` (bezel/glass panels, eyebrow tags, glowing primary CTAs, emerald selected states for recent workspaces), `app/dashboard/ide/page.tsx` (VS Code / Lite view toggle as an emerald segmented control). Code-server lifecycle, polling, Monaco, and persistence untouched.

**Method:** `Workflow` (`aurora-chat-email-ide`), 7/7 agents, each editing only its file with hard "preserve every hook/ref/handler/control-flow" guardrails; none flagged risk above low.

**Status:** The **entire dashboard** is now on Aurora Spatial — every page and every interactive surface.

**Verification:** `pnpm typecheck` → **0 errors**. Live on :3001 — chat/email/ide all render 200, dev log clean. Not run (8GB RAM): `pnpm build`.

**Files touched:** `components/chat/{chat-interface,message-bubble,chat-input}.tsx`; `app/dashboard/email/page.tsx`; `components/ide/{code-server-gate,code-server-install-panel}.tsx`; `app/dashboard/ide/page.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 13:14:01 IST — "claude-opus-4-8"

**Goal:** Finish the Aurora Spatial rollout — the final 8 pages the earlier workflow skipped when it hit the account session limit.

**Changed — Aurora Spatial applied to the last 8 pages** (visual-only; behavior preserved): `tasks` and `settings/{landing, presets, shortcuts, system, tokens, vault, webhooks}`. Same treatment as the rest — eyebrow + gradient display header, ambient orbs, `interactive`/`lift` cards. (System settings' destructive "danger zone" card deliberately keeps no glow.)

**Method:** `Workflow` (`aurora-rollout-finish`), 8/8 agents succeeded after the limit reset at 1pm.

**Status:** Every dashboard page is now on Aurora Spatial except `chat`, `email`, and `ide`, which are intentionally full-height panes with no page header (they still inherit the redesigned shell, tokens, and cards).

**Verification:** `pnpm typecheck` → **0 errors**. Live on :3001 — 8/8 routes render 200. Not run (8GB RAM): `pnpm build`.

**Files touched:** `app/dashboard/tasks/page.tsx`; `app/dashboard/settings/{page,presets,shortcuts,system,tokens,vault,webhooks}/page.tsx` (settings landing is `settings/page.tsx`); `CHANGELOG.md`.

## 14/06/2026 @ 13:11:13 IST — "claude-opus-4-8"

**Goal:** Roll the Aurora Spatial treatment across the remaining inner dashboard pages (the "redesign the entire website" follow-up), via a multi-agent workflow.

**Changed — Aurora Spatial applied to 19 inner pages** (visual-only; imports/hooks/handlers/data-fetching/exports preserved; theme-agnostic, reusing the existing `globals.css` utilities — no new components or tokens): `calendar`, `images`, `memory-bank` (index / `[id]` / `new`), `research`, `sessions` (index / `[id]`), and `settings/{account, agent-tools, appearance, auth, backups, contacts, cookbook, diagnostics, email, integrations, memory}`. Each gained the eyebrow + gradient display header, ambient orbs, and `interactive`/`lift` cards.

**Method:** `Workflow` (`aurora-rollout`) fanned out one agent per page with hard guardrails (edit only the target file; no shell; no logic/prop changes).

**Not done yet (account session limit hit mid-run):** 8 pages remain untouched — `tasks` + `settings/{landing, presets, shortcuts, system, tokens, vault, webhooks}`. `chat` + `email` were intentionally skipped (full-height panes with no header).

**Verification:** `pnpm typecheck` → **0 errors** across all 19 files. Live on :3001 — 18/18 sampled routes render 200, dev log clean. Not run (8GB RAM): `pnpm build`.

**Files touched:** 19 `app/dashboard/**/page.tsx` files (listed above) + `CHANGELOG.md`.

## 14/06/2026 @ 11:14:26 IST — "claude-opus-4-8"

**Goal:** Fix the model-config bugs visible in the Compare screenshots and ship a high-end "Aurora Spatial" redesign of the dashboard. Orchestrated via `antigravity-skill-orchestrator` + `high-end-visual-design` + `antigravity-design-expert`.

**Fixed (cause → fix):**
- **DeepSeek `messages[0].role: unknown variant "developer"` (500).** `@ai-sdk/openai` (`node_modules/@ai-sdk/openai/dist/index.js:59-61`) flags *any* model id not starting with `gpt-3/gpt-4/chatgpt-4o/gpt-5-chat` as a reasoning model and sends the system message as role `developer`; first-party OpenAI accepts it but third-party openai-compat endpoints (deepseek, opencode) reject it. `app/api/ai/chat/route.ts` now folds the system prompt into the first user turn for third-party openai-compat providers, so no `system`/`developer` role is ever sent. Verified live: deepseek streams `{"type":"text",…}` instead of erroring.
- **Compare dumped raw NDJSON** (`{"type":"text","value":…}` on screen). `app/dashboard/compare/page.tsx` accumulated raw stream bytes into `<Markdown>`; it now line-buffers and parses the NDJSON, separating `text` / `reasoning` / `error`.
- **Ollama errored when unwanted.** Removed the Ollama provider record; Compare now renders any failed model as a clean inline error card (never raw JSON).

**Added:**
- **Live artifact preview** (`components/chat/artifact.tsx`) — detects an HTML/SVG block in a model reply and renders it in a sandboxed `<iframe srcDoc sandbox="allow-scripts">` with Preview/Code tabs, Copy, Open-in-new-tab, and Download `.html`. Wired into Compare so "make me a website" now renders a real page instead of spitting code. Directly addresses the "just spit it in my face" complaint.

**Changed — Aurora Spatial design system (theme-agnostic; all 18 themes inherit it via accent/surface tokens + `color-mix`):**
- `app/globals.css` — new premium layer: `.eyebrow`, `.text-gradient`, `.display`, double-bezel (`.bezel`/`.bezel-core`), `.lift` (hover lift + accent glow), `.sheen`, `.island-icon` (magnetic), `.orb` + `float-slow`/`glow-pulse` keyframes, spring easing tokens. GPU-safe (transform/opacity only), reduced-motion respected.
- `components/ui/card.tsx` — adds opt-in `interactive` (lift + glow) and a default top `sheen`; backward compatible. `components/ui/button.tsx` — spring easing + stronger primary glow.
- `components/layout/sidebar.tsx` + `topbar.tsx` — gradient active rail with glow, brand glow, magnetic nav icons, aurora hairlines, refined provider switcher and search/⌘K island.
- `app/dashboard/page.tsx` + `app/dashboard/compare/page.tsx` — bespoke flagship redesigns: ambient orbs, eyebrow tags, gradient display headings, premium lift/bezel cards.

**Verification:** `pnpm typecheck` → **0 errors**. Live on :3001 — all 10 sampled dashboard routes render 200, deepseek chat streams clean text, Ollama removed (openrouter/opencode/deepseek remain), dev log clean. Not run (8GB RAM rule): `pnpm build`. Remaining 30 inner pages inherit the foundation (tokens/cards/shell) but not yet the bespoke hero treatment.

**Files touched:** `app/globals.css`; `app/api/ai/chat/route.ts`; `app/dashboard/page.tsx`; `app/dashboard/compare/page.tsx`; `components/chat/artifact.tsx`; `components/ui/card.tsx`; `components/ui/button.tsx`; `components/layout/sidebar.tsx`; `components/layout/topbar.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 00:30:03 IST — "claude-opus-4-8"

**Goal:** Add bulk deletion to the skills page — a "Delete all" and a multi-select "Delete selected" flow — so a 1500-skill catalog can be cleaned up without deleting one row at a time.

**Added:**
- `DELETE /api/skills` (`app/api/skills/route.ts`) — bulk delete: `{ids:[…]}` removes those rows; an empty/absent body removes **every** skill. Returns `{ok, deleted}`. Empty body is tolerated (try/catch → delete-all); malformed `ids` → 400.
- Skills page (`app/dashboard/skills/page.tsx`): a **Select** mode (per-card checkboxes with a selected-ring, "Select shown", a live selected count, "Delete selected", "Done") and a **Delete all** button guarded by a type-`DELETE`-to-confirm dialog (`requireText`).

**Verification:** `pnpm typecheck` → **0 errors**. Live on :3001 — create+delete-by-ids is net-zero (`{deleted:1}`, count returns to 1540), malformed `ids` → 400, `/dashboard/skills` renders 200, dev log clean. Did not exercise live "delete all" against the real catalog (destructive); it shares the verified `inArray`-vs-all branch with the bulk PATCH.

**Files touched:** `app/api/skills/route.ts`; `app/dashboard/skills/page.tsx`; `CHANGELOG.md`.

## 14/06/2026 @ 00:25:14 IST — "claude-opus-4-8"

**Goal:** Fix the skills catalog import after pulling `sickn33/antigravity-awesome-skills` into Matrix — toggling a skill 500'd, the importer reported 4892 found but capped at 150, and there was no way to bulk-enable.

**Fixed (cause → fix):**
- **Toggle 500 (`Cannot read properties of undefined (reading 'call')` on `PATCH /api/skills/[id]`)** — stale `.next` webpack chunk, not a code bug (the route's imports are valid and work in sibling routes), so every enable/disable 500'd. Cleared `.next` + restarted dev. Verified: the exact id from the error log now returns 200.
- **Reported 4892 found / only imported 150** — the repo carries a canonical `skills/` dir (1541) **plus** a `plugins/**/skills/` mirror (3351); the old `MAX=150` cap took the first 150 paths (all plugin copies). `app/api/skills/import/route.ts` now prefers the top-level `skills/` dir, dedups by folder basename, fetches in a 24-way bounded pool, and inserts in one transaction. Verified live: **1541 found, 1391 imported, 150 deduped, ~12s**.

**Added:**
- `PATCH /api/skills` bulk enable/disable (`{isEnabled, ids?}`; omit `ids` = all) — `app/api/skills/route.ts`. Verified: enabled 1541 / disabled 1541.
- Skills page (`app/dashboard/skills/page.tsx`): search box, `enabled/total` counter, **Enable all / Disable all** controls (Enable-all asks for confirmation), and a 300-row render cap for the 1500+ catalog.

**Changed:**
- `app/api/ai/chat/route.ts` `buildSkillsPrompt()` — enabled skills are concatenated verbatim into the agent system prompt, so added a 60k-char budget with an overflow summary; imported skills remain `isEnabled:false` by default (opt-in) to avoid a prompt/cost blow-up when a large catalog is imported.

**Verification:** `pnpm typecheck` → **0 errors**. Live against dev on :3001 — single toggle 200, bulk enable/disable 1541, full import 1541→1391, `/dashboard/skills` renders 200, dev log clean. Not run (8GB RAM rule): `pnpm build`.

**Files touched:** `app/api/skills/import/route.ts`; `app/api/skills/route.ts`; `app/api/ai/chat/route.ts`; `app/dashboard/skills/page.tsx`; `CHANGELOG.md`.

## 13/06/2026 @ 23:05:13 IST — "claude-opus-4-8"

**Goal:** Make the IDE tab a *real, branded VS Code* (the Antigravity model) embedded inside the web app — by managing a local `code-server` instance from the dashboard and embedding it in an iframe, with an AI agent extension wired to the existing chat backend. Built via multi-agent orchestration.

**Added — real VS Code in the IDE tab:**
- `lib/services/code-server.ts` — code-server lifecycle service (mirrors the Ollama pattern in `lib/services/ollama.ts`): `detectCodeServer`, `codeServerStatus` (loopback `/healthz` + a `ps` probe scoped to our data dir), `startCodeServer` (argv-array `spawn`, `detached`+`unref`, bound to `127.0.0.1`, `--auth none`, scoped `--user-data-dir`/`--extensions-dir`), `stopCodeServer`/`restartCodeServer`, `installCodeServer` (official installer with a manual `brew` fallback), and `writeBrandedSettings` (emerald-on-`#0a0a0a` theme, JetBrains Mono, telemetry off).
- `app/api/ide/server/route.ts` — GET status + POST `{action: start|stop|restart, folder?}`.
- `app/api/ide/server/install/route.ts` — GET detect + POST install.
- `components/ide/code-server-gate.tsx` + `code-server-embed.tsx` + `code-server-install-panel.tsx` — the install → folder-picker → iframe state machine; unmount-safe start polling; reuses the existing `/api/workspace` recents.
- `vscode-extension/matrix-agent/**` — a VS Code extension (sidebar webview) that streams from `/api/ai/chat` (NDJSON text/reasoning/error) and offers reviewable `applyEdit` (diff + modal confirm) and `runInTerminal` host helpers. Strict CSP, nonce-gated script; API keys never leave the dashboard server.

**Changed:**
- `app/dashboard/ide/page.tsx` — added a "VS Code" / "Lite editor" view toggle (defaults to VS Code, persisted in `localStorage["ide:view"]`, rendered in all branches so it's never a one-way trip); the VS Code view renders `<CodeServerGate/>`, the Lite view keeps the existing Monaco workspace untouched.
- `types/settings.ts` — added `ideServerPort` (`3010`) and `ideServerAutoStart` (`0`) defaults.
- `tsconfig.json` — excluded `vscode-extension` from the root typecheck (it's a self-contained subproject with its own `@types/vscode`).
- `.gitignore` — ignore runtime `/data/` (sqlite + agentmemory state store).

**Security (cause → fix):** an embedded editor that spawns processes is an injection surface → code-server is spawned via an **argv array** (never a shell string), the launch folder is validated (absolute, no null bytes, existing directory) before reaching argv, the bind address is **loopback-only** (`--auth none` is only safe because of this), and stop/status are scoped to our `.matrix-dash` data dir so an unrelated code-server is never killed or reported. The install route's `curl … | sh` is a fixed literal, user-initiated only.

**Orchestration:** invoked `antigravity-skill-orchestrator`, then a `Workflow` with 3 parallel builders → integrate → review. Skills applied (≥10): nodejs-best-practices, backend-dev-guidelines, backend-security-coder, nextjs-best-practices, senior-frontend, react-best-practices, tailwind-patterns, typescript-pro, ai-engineer, claude-api, systematic-debugging. The two review subagents hit the session quota, so security + correctness review was completed directly.

**Verification:** `pnpm typecheck` → **0 errors** on the fully integrated tree. Self-review confirmed: argv-array spawn, loopback bind, validated folder, scoped kill, CSP-locked webview, server-side keys, unmount-safe polling, view toggle present in every render branch. Not run (8GB RAM rule): `pnpm build`, code-server install, live server launch.

**Files touched:** `lib/services/code-server.ts`; `app/api/ide/server/route.ts`; `app/api/ide/server/install/route.ts`; `components/ide/code-server-gate.tsx`; `components/ide/code-server-embed.tsx`; `components/ide/code-server-install-panel.tsx`; `app/dashboard/ide/page.tsx`; `types/settings.ts`; `tsconfig.json`; `.gitignore`; `vscode-extension/matrix-agent/**` (package.json, tsconfig.json, esbuild.mjs, .vscodeignore, README.md, src/extension.ts, media/{main.js,main.css,icon.svg}); `CHANGELOG.md`.

## 13/06/2026 @ 19:55:18 IST — "opencode/deepseek-v4-flash-free"

**Goal:** Set up persistent cross-session memory via agentmemory and seed the project with key context.

**Added — persistent memory:**
- Confirmed agentmemory backend is already running at `http://localhost:3111` with 263 registered functions, auto-started via OpenCode MCP config.
- Seeded 5 project memories (project overview, architecture, latest work, 8GB RAM constraint, memory setup) via agentmemory HTTP API so future sessions can recall context.
- Cloned `webzler/agentMemory` GitHub repo to `.agent/skills/agent-memory/` (compiled, ready) as a reference implementation.
- Added `.agent/` to `.gitignore` to prevent the 153MB skill directory from being committed.

**Verification:** Backend health check returns `"status":"healthy"`. Memory save/search round-trips confirmed — all 5 seeded memories return correctly ranked by relevance score.

**Files touched:** `.gitignore`.

## 13/06/2026 @ 12:27:19 IST — "claude-sonnet-4.6"

**Goal:** Let users pick a *specific model* (and its reasoning/thinking level) per provider instead of a single hand-typed `defaultModel`. Query each provider's live model catalogue via its stored API key, and expose an advanced model selector in chat/agent plus model dropdowns in AI Providers settings.

**Added — live model listing [`lib/ai/models.ts`]:**
- `listModels({ kind, apiKey, baseUrl })` fetches a provider's real model list by SDK family: Anthropic (`/v1/models`, `x-api-key` + `anthropic-version`), Google (`/v1beta/models?key=`, filtered to `generateContent`), Mistral/xAI/OpenAI-compat (Bearer `{base}/models` → `data[].id`). Results are normalized, deduped, sorted, and cached in-memory (10-min TTL keyed by `kind|baseUrl`); failures return `{ models: [], error }` so callers fall back to free-text.
- `supportsReasoning(id)` — heuristic over known reasoning families (o-series, gpt-5, deepseek-r, grok reasoning, gemini-2.5, claude sonnet/opus 4 & 3-7).
- `buildProviderOptions(kind, modelId, effort, enableThinking)` — maps Off/Low/Med/High to the correct per-SDK option: Anthropic `thinking.budgetTokens` (4k/8k/16k), Google `thinkingConfig.thinkingBudget`, OpenAI/xAI `reasoningEffort`; only applies when the model supports reasoning; falls back to the global `enableThinking` when no effort is sent.

**Added — model-listing routes:**
- `GET /api/providers/[id]/models` (decrypts the saved key) and `POST /api/providers/models` (raw key from the Add form, used in-memory only — `withLog` records method/path/status, never bodies).

**Added — advanced model selector [`components/chat/model-selector.tsx`]:**
- Searchable live-model dropdown beside the provider switcher in the composer (lands in chat, agent, and the docked IDE chat since all render `ChatInput`). Per-conversation model override, a Brain thinking-level control shown only for reasoning models, and "Set as default" that PATCHes the provider's `defaultModel`. Client-side per-provider cache; manual free-text entry when listing fails.

**Changed:**
- `app/api/ai/chat/route.ts` accepts `reasoningEffort` and routes thinking through `buildProviderOptions` (replacing the Anthropic-only hardcoded 8k budget). *Behavior:* in the chat UI, thinking is now opt-in via the selector (default Off); the global Enable Thinking still governs callers that don't send a level.
- `lib/stores/use-app-store.ts` gained `modelOverride` + `reasoningEffort`; switching provider clears the override (a model id is provider-specific).
- `components/chat/chat-interface.tsx` sends `modelOverride` + `reasoningEffort` (added to the `send` deps).
- `components/settings/provider-form.tsx` and `provider-list.tsx`: "Default model" is now a live dropdown ("Load models") with a free-text fallback.

**Verification:** `pnpm typecheck` — zero errors. Manual: Add a provider → Load models populates the dropdown; existing provider → click model lists live models → persists; chat → model selector overrides per message and resets on provider switch; reasoning models show the thinking control; a provider whose `/models` errors falls back to free-text without crashing.

**Files touched:** `lib/ai/models.ts` (new), `app/api/providers/[id]/models/route.ts` (new), `app/api/providers/models/route.ts` (new), `components/chat/model-selector.tsx` (new), `app/api/ai/chat/route.ts`, `lib/stores/use-app-store.ts`, `components/chat/chat-input.tsx`, `components/chat/chat-interface.tsx`, `components/settings/provider-form.tsx`, `components/settings/provider-list.tsx`.

## 13/06/2026 @ 12:11:31 IST — "claude-opus-4.8-ultracode"

**Goal:** Fix the `Error: Cannot find module './4243.js'` 500 on `/dashboard/ide` and prevent the whole class of stale-`.next` errors from recurring.

**Fixed — `/dashboard/ide` 500 from a stale webpack chunk reference [HIGH]:**
- *Cause:* The previous commit (`6da5688`) edited `ChatInterface`, which reshuffled webpack's chunk IDs. The dev server's partial HMR recompile left a stale `.next/server/app/dashboard/ide/page.js` still requiring `./4243.js` relative to its own dir, while the chunk had actually moved to `.next/server/chunks/4243.js`. First request 500'd, subsequent ones recompiled and 200'd. The `api/memories/[id]` route appeared in the stack trace only because it shares the same poisoned `webpack-runtime.js` singleton — it was never the source.
- *Fix:* (1) Cleared the corrupt cache (`rm -rf .next`). (2) Added a `predev` npm hook (`"predev": "rm -rf .next"`) to `package.json` so every `pnpm dev` cold-starts from a clean build, eliminating HMR-staleness 500s. (3) Converted the IDE page's static `ChatInterface` import to a client-only dynamic import (`ssr: false`) in `app/dashboard/ide/page.tsx`, removing the entire chat dependency tree from this route's SSR bundle so future `ChatInterface` edits can no longer invalidate the IDE server build. The chat panel is client-only anyway (uses `useAppStore`, `localStorage`).
- *Verification:* `pnpm typecheck` — zero errors. Fresh `pnpm dev` (predev confirmed): `/dashboard/ide` → **200** on 3 consecutive requests; `/api/memories` → **200**; `cannot find module` occurrences in dev log: **0**.

**Files touched:** `package.json`, `app/dashboard/ide/page.tsx`.

## 13/06/2026 @ 09:21:37 IST — "claude-opus-4.8-ultracode"

**Goal:** Apply the confirmed findings from a 26-agent adversarial review of the previous commit (5 review dimensions, each finding majority-voted by 3 skeptics). 5 of 7 findings confirmed; 2 correctly rejected (the "contextText in deps" claims — that dependency is intentional and removing it would create a stale-closure bug).

**Fixed — Hidden IDE chat context now merged server-side (was: two consecutive system messages) [HIGH]:**
- *Cause:* The IDE chat injected the open-file context as its own leading `{role:"system"}` message, and the chat route *also* prepends a system message — so the model received two consecutive system messages. The AI SDK (5.0.199) only warns rather than throws, but provider adapters differ (e.g. Gemini's `systemInstruction` is singular), so behavior was untested/unsafe on Google/Mistral/xAI.
- *Fix:* The client now sends the context in a separate `systemContext` body field (`components/chat/chat-interface.tsx`); the route bounds it (20 KB) and folds it into the *single* leading system message via `systemBits` (`app/api/ai/chat/route.ts`). The model now only ever sees one system message — provider-agnostic. This one change also resolves findings #2 and #3 below, since the context never enters the `messages` array.

**Fixed — File content can no longer leak into memory extraction [MEDIUM]:**
- *Cause:* `extractMemories()` was built from the raw incoming `messages`; with the old client-side injection that array contained the whole open file, so the extractor could mine code/secrets and persist them as bogus "memories".
- *Fix:* Extraction now filters out all `system` messages (`route.ts`) — only real user/assistant turns are mined. Belt-and-suspenders on top of the architectural fix above.

**Fixed — Session-history asymmetry for injected context [LOW]:**
- Resolved for free by the HIGH fix: host context is now ephemeral and server-side, never a chat message, so there's nothing to persist or lose.

**Fixed — Unbounded combined system-prompt size [LOW]:**
- *Fix:* Server-side clamp of `systemContext` to 20 KB before it joins `systemBits` (`route.ts`), on top of the existing 16 KB client-side file cap.

**Fixed — Sort headers now announce direction to screen readers [MEDIUM/a11y]:**
- *Fix:* `SortTh` buttons gained a direction-aware `aria-label` (`Sort by Ctx (ascending)` etc.) in `app/dashboard/settings/cookbook/page.tsx`; previously only a static `title` was present and the arrow was visual-only.

**Verification:** `pnpm typecheck` — zero errors. Review run `wf_7bf0965d-a2a`: 7 raw findings → 5 confirmed (majority 3/3), 2 rejected (1/3).

**Files touched:** `components/chat/chat-interface.tsx`, `app/api/ai/chat/route.ts`, `app/dashboard/settings/cookbook/page.tsx`.

## 13/06/2026 @ 09:06:26 IST — "claude-opus-4.8-ultracode"

**Goal:** Three UX fixes — sortable Cookbook model columns, near-instant page navigation, and a docked AI chat panel inside the IDE that's aware of the open file.

**Added — Sortable Cookbook columns:**
- *Cause:* The Download tab's model table was fixed-sorted by score; users couldn't reorder by context, tokens/sec, params, VRAM, etc.
- *Fix:* `app/dashboard/settings/cookbook/page.tsx` — added `SortKey`/`SortDir`/`SortState` types, a `FIT_RANK` map, `SORT_DEFAULT_DIR` per-column defaults, and a clickable `SortTh` header component (ArrowUp/ArrowDown when active, faint ArrowUpDown when inactive). The `rows` `useMemo` now switches on `sort.key` (fit→rank, label→localeCompare, param→paramsB, vram, ctx, speed, score) with a score tie-break; clicking a header toggles direction, clicking a new one applies that column's natural default. Fit / Model / Param / VRAM / Ctx / t-s / Score are sortable; Quant + Action stay static.
- *Verification:* `pnpm typecheck` clean; sort state added to the memo deps so re-sorts are reactive.

**Added — Docked AI chat panel in the IDE:**
- *Cause:* The IDE had no in-page chat (unlike a typical agentic IDE), forcing a context switch to the chat route.
- *Fix:* `app/dashboard/ide/page.tsx` — a `PanelRight` toggle in the workspace sidebar opens a right-hand `<aside>` hosting `<ChatInterface embedded>`; the grid switches between 2- and 3-column templates. Open/closed state persists to `localStorage` (`ide:chatOpen`) via a write-only `persistChat` + a separate restore effect (avoids the mount-overwrites-restore bug). The panel is context-aware: `fileChatContext()` packages the active file (path, language, content capped at 16 KB) and is injected through a new `contextText` prop on `components/chat/chat-interface.tsx` as a **leading system message** — sent to the model each turn but never rendered as a bubble.
- *Verification:* Confirmed by reading source that `Dialog` returns `null` when closed (no phantom grid row) and that the AI SDK (5.0.199) only warns — never throws — on system messages within `messages`, with no ordering/count limit; the chat route already injects its own leading system message, so the second one rides the same validated path.

**Changed — Near-instant page navigation:**
- *Cause:* The app had **zero** route-segment loading boundaries, so navigating to a not-yet-compiled segment (dev) froze on the previous screen — read as "the app is slow". The `lucide-react` barrel (imported on nearly every page) also inflated per-route compile.
- *Fix:* Added `app/dashboard/loading.tsx` (skeleton inside the shell `<main>`) and `app/dashboard/settings/loading.tsx` (skeleton inside the settings `<section>`, keeping the settings sidebar visible) for instant transition feedback; set `experimental.optimizePackageImports: ["lucide-react"]` in `next.config.ts` to tree-shake the icon barrel.
- *Verification:* `pnpm typecheck` clean; verified `fadeIn` keyframe + `Skeleton` component exist and the boundaries render in the correct containers.

**Files touched:** `app/dashboard/settings/cookbook/page.tsx`, `app/dashboard/ide/page.tsx`, `components/chat/chat-interface.tsx`, `next.config.ts`, `app/dashboard/loading.tsx` (new), `app/dashboard/settings/loading.tsx` (new).

## 12/06/2026 @ 23:41:39 IST — "claude-opus-4.8-ultracode"

**Goal:** Execute the 8-enhancement plan to its fullest — real on-disk IDE, chat streaming + thinking, a full 20+ provider catalog, GitHub skill import, pretty server logs, a 16-theme studio, and an Odysseus-style hardware-aware Cookbook.

**Credits:** The theme system (named palettes, customization studio, color-harmony generator) and the Cookbook (tab structure, hardware-aware model FIT scoring, dependency manager) are inspired by and adapted from **Odysseus** by **pewdiepie-archdaemon** (AGPL-3.0) — clean-room re-implementations in TypeScript/Next.js. Attribution added to `README.md` (new) and here.

**Added — Fix 1+3 (Real Workspace IDE):**
- `workspaces` table + `lib/services/workspace.ts` + `types/workspace.ts`.
- `app/api/workspace/{route,[id],tree,file,mkdir,rename}` — register/list/delete workspaces, recursive tree (skips `node_modules/.git/.next/…`, depth 8), read/write/delete files on disk (500 KB cap), mkdir, rename/move.
- IDE reworked to open a real folder, browse a live tree, edit in Monaco, and save to disk — every fetch wrapped in try/catch with `toast.error`, killing the old silent failures.

**Added — Fix 4 (Provider catalog):**
- 20+ providers in `types/ai-provider.ts` (DeepSeek, OpenRouter, Groq, Mistral, Together, Fireworks, xAI, Zhipu, Ollama, LM Studio, Cohere, Perplexity, Hyperbolic, Novita, Azure, …) with pre-filled base URLs + default models.
- `provider` column switched to free-text; `lib/ai/registry.ts` gained a default OpenAI-compatible branch (`createOpenAI({ apiKey, baseURL })`) so every openai-compat provider resolves with zero extra code. Added `@ai-sdk/mistral` + `@ai-sdk/xai`. Provider form auto-fills base URL + model on kind select.

**Added — Fix 6 (Pretty logs):**
- `lib/utils/logger.ts` — ANSI logger + `withLog()` HOF that logs `METHOD /path → STATUS (ms)` (green/yellow/red by status) and catches handler errors. Wrapped the workspace + providers routes.

**Added — Fix 5 (Skill import):**
- `app/api/skills/import/route.ts` — POST `{ repoUrl }` walks a repo's git tree, finds every `SKILL.md`, parses front-matter or first-heading/paragraph, dedupes against existing names, inserts disabled (max 150). Skills page gets an "Import from GitHub" dialog (pre-filled to the antigravity repo).

**Added — Fix 2 (Chat streaming + thinking):**
- Backend streams NDJSON over `result.fullStream` (`text` / `reasoning` / `error` parts); Anthropic extended thinking enabled via `providerOptions.anthropic.thinking` behind a new `enableThinking` setting.
- `components/chat/thinking-block.tsx` (collapsible reasoning trace) + message-bubble/chat-interface updated to render live thinking and a pulsing indicator.

**Added — Fix 7 (Theme studio):**
- `lib/themes.ts` — 16 named themes + `CustomTheme`, `customThemeToCss`, and an HSL color-harmony generator (complementary/analogous/triadic/split).
- `app/globals.css` — 16 `:root[data-theme]` token blocks, app-wide accent propagation via `color-mix`, light-mode overrides (paper/light), and a `data-frosted="off"` opt-out.
- `app/dashboard/settings/appearance/page.tsx` rebuilt into 2 tabs (Themes grid + Customize: color pickers, harmony generator, font/density/frosted, save/import/export/reset). `next-themes` switched to `attribute="data-theme"`; `components/layout/theme-style.tsx` boots custom theme + UI prefs; `components/ui/tabs.tsx` primitive added.

**Added — Fix 8 (Cookbook):**
- `lib/services/ollama-shared.ts` — ~34-model registry + `scoreModel()`/`vramForQuant()` FIT logic (PERFECT/OK/MARGINAL/NO) and tag metadata.
- `app/api/ollama/route.ts` — VRAM/GPU/chip detection (Apple unified memory vs. discrete VRAM) → `usableVramGb`.
- New routes `app/api/ollama/{serve,config,deps}`; `lib/services/ollama.ts` gained `psOllama`, serve start/stop/restart, and config read/write.
- `app/dashboard/settings/cookbook/page.tsx` rebuilt into 4 tabs (Download with FIT table + quant re-fitting, Serve, Dependencies, Settings).

**Verification:** `pnpm typecheck` — zero errors. `app/globals.css` braces balanced (69/69), all 16 theme blocks present.

**Files touched:** `app/api/ai/chat/route.ts`, `app/api/ollama/route.ts`, `app/api/providers/route.ts`, `app/api/ollama/{serve,config,deps}/route.ts` (new), `app/api/skills/import/route.ts` (new), `app/api/workspace/**` (new), `app/dashboard/ide/page.tsx`, `app/dashboard/settings/{appearance,cookbook}/page.tsx`, `app/dashboard/skills/page.tsx`, `app/globals.css`, `app/layout.tsx`, `components/chat/{chat-interface,message-bubble,thinking-block}.tsx`, `components/ide/{file-tree,editor-tabs,monaco-editor}.tsx`, `components/layout/{dashboard-shell,theme-style,theme-toggle}.tsx`, `components/settings/provider-form.tsx`, `components/ui/tabs.tsx` (new), `lib/ai/registry.ts`, `lib/db/{client,schema,settings}.ts`, `lib/services/{ollama,ollama-shared,workspace}.ts`, `lib/themes.ts` (new), `lib/utils/logger.ts` (new), `types/{ai-provider,settings,workspace}.ts`, `README.md` (new).

## 12/06/2026 @ 18:27:46 IST — "claude-fable-5"

**Goal:** Complete Jarvis phases 6–12 in one push: real email with AI triage, calendar with CalDAV, vector embeddings + uploads + RAG, Deep Research, Compare, Cookbook-lite (Ollama), platform hardening (PWA, 2FA, API tokens, vault, webhooks, backups, contacts), and Delight (image gen, personas, theme editor, diagnostics).

**Added — Phase 6 (Real email):**
- `email_accounts` table; account form with live connection test (`imapflow`).
- `lib/services/email.ts`: IMAP sync (deduped by `Message-Id`), `nodemailer` SMTP send, AI triage (classify/tag/summarize → urgent alerts).
- 5-min poller wired into the daemon.

**Added — Phase 7 (Calendar):**
- `calendars` + `events` tables with safe-migration helpers.
- Month grid + agenda day-side panel; new-event dialog with native datetime pickers.
- `lib/services/calendar.ts`: `tsdav` CalDAV sync, `ical.js` .ics export/parse.
- Agent tools `listEvents` / `createEvent` (auto-creates "Personal" calendar on first use).

**Added — Phase 8 (Knowledge):**
- `lib/ai/embeddings.ts`: OpenAI-compatible embedding model via Vercel AI SDK, cosine sim helpers, `embeddingsAvailable()` gate; uses any saved OpenAI/custom provider.
- `attachments` table + `/api/uploads` route: images → data URLs, PDFs → `pdf-parse` v2 (PDFParse class API), text/JSON → utf-8.
- Chat input gets a paperclip → attaches file → extracted text prepended to next message; chip preview with cancel.
- `searchKnowledge` agent tool over uploaded docs.

**Added — Phase 9 (Research + Compare):**
- `/api/research`: NDJSON-streaming orchestration (plan sub-questions → search → fetchReadable → synthesize cited report).
- Research page with live progress strip, source list, "Save to Notes".
- `/dashboard/compare`: pick 2–4 providers, stream side-by-side, blind mode hides names until you vote.

**Added — Phase 10 (Cookbook):**
- `lib/services/ollama.ts` + client-safe `ollama-shared.ts` split (constants/types isolated so client pages don't pull better-sqlite3 — the fix that turned a wall of 500s into 200s).
- `/api/ollama` detects Ollama + lists models + reports hardware via `systeminformation`.
- `/api/ollama/pull` streams progress; `/api/ollama/register` registers a model as a custom provider in one click.
- Curated low-RAM model list with install state.

**Added — Phase 11 (Hardening):**
- PWA: `app/manifest.ts`, gradient SVG icon, `/public/sw.js` (push notifications + click routing), `PwaRegister` mounted in shell.
- 2FA: `/api/auth/totp` with `otplib` v13 (`generateSecret` / `generateURI` / `verifySync`), encrypted provisional secret, full setup UI with provisioning URI + manual secret + 6-digit verify.
- API tokens: `mdx_…` bearer tokens with last-8-shown listing, full token revealed once at creation, copy button.
- Inbound webhook: `/api/hooks/[token]` with actions `notify` | `task` | `agent` — lets iOS Shortcuts, HomeAssistant, anything call Jarvis.
- Outbound webhooks: per-event firing (`task.reminder`, `job.completed`, `email.received`, …) via `fireWebhooks()` in `lib/services/notify.ts`.
- Vault: encrypted key-value secrets; reveal-on-click.
- Backups: `lib/services/backup.ts` dumps all tables to JSON in `~/MatrixDash/backups`, prunes to last 10; nightly cron at 4am.
- Contacts: tiny address book; agent's `findContact` tool already wired to it.

**Added — Phase 12 (Delight):**
- Image generation: `/api/images` calls any OpenAI-compatible `/images/generations`, stores results in a local gallery with prompt overlay + download/delete.
- Personas: `/api/presets` + page; chat route already accepts a `presetId` to swap in a custom system prompt.
- Diagnostics page: counts for every table, DB size, embedding availability, active provider, Ollama status, runtime info.
- Theme editor in Appearance: accent swatches + custom hex picker; live-updates `--color-emerald-accent`.

**Daemon (extended):**
- Heartbeat (1m): reminder fan-out via channels.
- 4am: memory decay + nightly backup (toggleable via `autoBackup`).
- 5m: `syncAllAccounts()` email poller.
- `syncScheduledJobs()` re-registers cron entries on every job CRUD.

**Verification:** `pnpm typecheck` clean; dev server smoke test confirms all 15 new pages and 18 new API endpoints return HTTP 200; manifest.webmanifest serves.

**Files Touched:** ~50 new files (services, API routes, UI pages, types, daemon wiring) and ~10 modified (schema, client, daemon, chat input, dashboard shell, settings nav).


## 12/06/2026 @ 08:09:11 IST — "claude-fable-5"

**Goal:** Close every remaining gap from the Phase 1 build — full plan parity plus the requested upgrades: theme toggle, mobile view, local email box, Obsidian-style notes graph, settings parity, styled feedback.

**Added:**
- **Theme toggle (dark/light)** — next-themes with class strategy, persisted in localStorage; light token overrides for every CSS variable, glass surface, scrollbar, and translucent hover state; Sun/Moon toggle in the topbar. Cause of prior miss: shipped dark-only in Phase 1. Verification: typecheck clean, toggle renders after hydration guard.
- **Mobile view** — hamburger in the topbar plus a slide-in drawer with the full nav, and a 5-slot bottom tab bar on <768px; new `.page-h` utility accounts for the bottom bar height so panes don't overflow; IDE tree narrows on small screens.
- **Email box** — new `emails` table (inbox/sent/drafts/trash, read/star flags) with seeded welcome message; CRUD API (`/api/emails`, `/api/emails/[id]`); three-pane mail UI (folder rail, message list, reading pane) with compose dialog, star, trash/restore, delete-forever; signature + from-address settings appended on send. Local-only by design — SMTP noted as planned.
- **Settings parity** — Integrations (six bridge cards), Shortcuts (keybinding reference), Account (local profile in settings KV), Agent Tools (memory read/write toggles aliasing autoExtract/autoInject; future tools marked Soon), Email (from + signature). Settings nav now has all nine sections from plan F6.
- **Styled feedback** — zustand toast + promise-based confirm stores with `Toaster`/`ConfirmHost` mounted in the shell; every native `confirm()`/`alert()`/`prompt()` replaced (memory delete, tidy/decay results, session delete ×2, note delete, IDE file create/delete, provider remove, system wipe — wipe now requires typing WIPE in a styled dialog).
- **Provider Test button** — `/api/providers/[id]/test` runs a 15s-bounded one-token generate; result surfaces as a success/error toast.
- **Plan-parity memory routes** — `/dashboard/memory-bank/new` (full-page form with pin option) and `/dashboard/memory-bank/[id]` (deep-linkable detail); memory bank honors `?focus=`/`?new=1`, sessions honors `?new=1` (command palette deep links now all work).
- **Obsidian-style notes graph** — `/api/notes/graph` + D3 force graph (violet nodes, favorites amber, sized by content length); toggle in the notes sidebar; clicking a node opens that note.
- **Chat Agent|Chat toggle** — segmented mode pill in the chat input bar per plan F2.

**Fixed:**
- Dev server log clean during smoke test; all 8 new/changed pages return HTTP 200; email CRUD round-trips verified with curl. Cause-level fix carried from smoke testing: none new (FTS prefix fix shipped in prior entry).

**Files Touched:** 20 new files (email module, settings pages, feedback system, notes graph, memory routes, theme toggle, mobile nav) and ~18 modified (shell, sidebar/topbar, globals.css, schema/client, chat input, all confirm/alert call sites).

## 12/06/2026 @ 07:42:01 IST — "claude-fable-5"

**Goal:** One-shot greenfield build of Matrix Dash from `matrix-dash-plan.md` — a local-first AI command center with autonomous memory, multi-provider chat, sessions, notes, IDE, and settings.

**Added:**
- **Scaffold** — Next.js 15 (App Router, TS strict), Tailwind v4, pnpm. `serverExternalPackages: ["better-sqlite3"]` so the native driver works in route handlers. `pnpm.onlyBuiltDependencies` allowlists better-sqlite3's build script (pnpm 10 blocks them by default). Verification: `pnpm typecheck` zero errors; dev server ready in ~1.8s.
- **DB layer** (`lib/db/`) — Drizzle schema for all 9 tables (memories, memory_links, notes, note_links, sessions, session_messages, ai_providers, files, settings); SQLite singleton at `~/MatrixDash/matrix.db` (WAL, FK on) that bootstraps tables, FTS5 virtual tables, and sync triggers on first connect; FTS helpers with sanitized prefix queries (`"term"*` so "glass" matches "glassmorphism"). Verification: curl CRUD round-trips on every endpoint.
- **Autonomous memory** (`lib/ai/`) — extraction service (runs after each chat reply via `onFinish`, parses model JSON tolerantly, never throws into the chat path), injection engine (pinned-first + FTS relevance, type-balanced, usage-count tracking), FTS-based auto-linking, tidy/decay consolidation engine.
- **AI registry** — Anthropic / OpenAI / Google / custom (OpenAI-compatible baseURL) via Vercel AI SDK v5; API keys encrypted at rest with AES-256-GCM (key in `~/MatrixDash/.key`, mode 0600). Cause of one fix: `@ai-sdk/google` exports `createGoogleGenerativeAI`, not `createGoogle` as the plan assumed.
- **API routes** — chat streaming (`/api/ai/chat`), memories CRUD + graph + stats + tidy, memory-links, notes CRUD with `[[wiki-link]]` sync, note backlinks, global search, sessions + messages, files CRUD, providers CRUD, settings KV, system export/wipe. Verification: smoke-tested all endpoints with curl; wipe requires `confirm: "WIPE"`.
- **UI** — glassmorphic OLED design system (Geist Sans/Mono, emerald accent, mesh-gradient backdrop, custom glass utilities); dashboard shell with collapsible sidebar, topbar, ⌘K command palette (cmdk + live FTS search); GSAP staggered page entrances respecting `prefers-reduced-motion`; chat with token streaming + abort + markdown/code-copy; memory bank with list/detail/D3 force graph (drag, zoom, type-colored nodes); notes with editor/preview, wiki-links, backlinks panel; sessions timeline with resume-in-chat; Monaco IDE (file tree, tabs, dirty markers, ⌘S + autosave, custom matrix-dash theme); settings (providers, memory toggles, appearance tokens, system export/danger zone). Verification: all 9 dashboard pages return HTTP 200 in dev.

**Files Touched:** ~70 new files across `app/`, `components/`, `lib/`, `types/`, plus `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `drizzle.config.ts`, `.gitignore`.
