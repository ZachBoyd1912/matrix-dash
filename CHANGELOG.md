# Changelog

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
