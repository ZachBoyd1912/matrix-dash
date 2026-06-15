# Changelog

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
