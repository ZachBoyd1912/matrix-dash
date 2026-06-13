# Changelog

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
