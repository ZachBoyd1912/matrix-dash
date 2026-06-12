# Matrix-dash: 8-Enhancement Plan
# Context

- Matrix-dash is a fully-built local-first AI command center (Next.js 15 / SQLite / Tailwind v4). Eight user-identified gaps need fixing: IDE silent failures, chat streaming/thinking, IDE workspace model, provider expansion, bulk skill import, prettier logs, full theme system, and a richer Cookbook. Odysseus (AGPL-3.0, pewdiepie-archdaemon) code may be reused — must be credited in README.md and CHANGELOG.md.

- Fix 1+3 — Real Workspace IDE (merged)
Problem: Current IDE stores file content in SQLite (virtual files). There's no way to open a real project folder from disk, and all fetch calls have no error handling — failures are silently swallowed.

Architecture shift: Files for workspaces come from disk, not DB. The existing files table becomes scratch/virtual-only. A new workspaces table stores directory roots. The IDE reads/writes real files through server-side fs APIs.

New DB table (add to lib/db/schema.ts + bootstrapSchema()):

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  lastOpened TEXT NOT NULL DEFAULT (datetime('now'))
);
New API routes (all under app/api/workspace/):

GET /api/workspace — list saved workspaces (from DB)
POST /api/workspace { path } — register workspace (validates dir exists with fs.existsSync)
DELETE /api/workspace/[id] — remove from recents
GET /api/workspace/tree?root=<abs_path> — recursive directory listing as JSON, skips node_modules .git .next dist build __pycache__ .DS_Store, max depth 8
GET /api/workspace/file?path=<abs_path> — read file content from disk (cap 500 KB; return { content, language })
POST /api/workspace/file { path, content } — write file back to disk (fs.writeFileSync)
POST /api/workspace/mkdir { path } — create directory (fs.mkdirSync({ recursive: true }))
DELETE /api/workspace/file?path=<abs_path> — delete file from disk
POST /api/workspace/rename { from, to } — rename/move file or folder (fs.renameSync)
IDE page rework (app/dashboard/ide/page.tsx):

Two modes based on whether a workspace root is active:

Empty state (no workspace):

Center card: "Open a project folder" with path text input + "Open folder" button
Below that: recent workspaces list (from GET /api/workspace) as clickable cards showing folder name + path
Workspace open mode:

Sidebar header: workspace folder name + "×" close button + "+" new file button
File tree: reads from GET /api/workspace/tree (not from SQLite)
Folder nodes: click to collapse/expand, chevron icon
File nodes: icon by extension (.ts/.tsx sky, .py green, .json amber, .md violet, etc.)
Right-click context menu (absolute positioned div): Rename / Delete / Copy path / New file here / New folder here
Inline rename: double-click on name → <input> in-place → blur/Enter → calls POST /api/workspace/rename
Opening a file: reads GET /api/workspace/file?path=... → loads into Monaco; no DB write
Saving: POST /api/workspace/file { path, content } → saves directly to disk
Active workspace root stored in settings.activeWorkspace; restored on next IDE load
Error handling (all fetch calls): Every fetch wrapped in try/catch; every failure surfaces via toast.error(...). Silent returns are gone. saveActive shows toast.success("Saved") on success.

Status bar additions: workspace name | active file path | language | line:col | encoding

Files to modify/create:

lib/db/schema.ts — add workspaces table definition
app/api/workspace/route.ts — workspace list + register
app/api/workspace/[id]/route.ts — delete workspace
app/api/workspace/tree/route.ts — recursive dir listing
app/api/workspace/file/route.ts — read + write file
app/api/workspace/rename/route.ts — rename
app/api/workspace/mkdir/route.ts — mkdir
app/dashboard/ide/page.tsx — full rework
components/ide/file-tree.tsx — workspace-aware tree (disk paths, not DB ids)
Fix 2 — Chat: Live streaming + thinking indicator
Problem: The stream loop just concatenates raw bytes; no thinking/reasoning block display; no visual "thinking" state.

Files to modify:

components/chat/chat-interface.tsx — stream consumption loop (lines 113-123)
app/api/ai/chat/route.ts — streamText config
Changes:

Backend (app/api/ai/chat/route.ts):

For Anthropic providers, add experimental_thinking: { type: "enabled", budgetTokens: 8000 } to streamText options (behind a setting enableThinking).
The Vercel AI SDK v5 toTextStreamResponse() already streams tokens; no change needed to the HTTP response shape.
Frontend (components/chat/chat-interface.tsx):

Parse the incoming stream as NDJSON (data: ... SSE lines) rather than raw bytes — Vercel AI SDK sends data: {"type":"text-delta","textDelta":"..."} events.
Separate textDelta events (main reply) from reasoning events (thinking block).
Add thinking: string field to ChatMessage.
Show a collapsible <ThinkingBlock> component above the assistant reply when thinking is non-empty.
Add a pulsing <span> "Thinking…" indicator while streaming && !firstTokenReceived.
New component: components/chat/thinking-block.tsx

Collapsible <details> with <summary>Thinking ({N} chars)</summary> + pre-formatted thinking text.
Styled with glass opacity-70 and monospace text.
Fix 4 — Providers: Full provider catalog
Problem: Only 4 provider types. Need ~20+ named providers with pre-filled base URLs and suggested models.

Files to modify:

types/ai-provider.ts — expand ProviderKind union + PROVIDER_KINDS + DEFAULT_MODELS + new PROVIDER_BASE_URLS map
lib/db/schema.ts — expand provider enum (or switch to text() without enum constraint to avoid migration pain)
lib/ai/registry.ts — add resolution branches for new provider types
components/settings/provider-form.tsx — update dropdown, auto-fill baseUrl + defaultModel on kind select
app/api/providers/route.ts — accept new kind values
New provider kinds to add (all using @ai-sdk/openai with custom baseURL unless noted):

Kind	Label	Base URL	Default Model	SDK
deepseek	DeepSeek	https://api.deepseek.com/v1	deepseek-chat	openai-compat
openrouter	OpenRouter	https://openrouter.ai/api/v1	openai/gpt-4o	openai-compat
groq	Groq	https://api.groq.com/openai/v1	llama-3.3-70b-versatile	openai-compat
mistral	Mistral	https://api.mistral.ai/v1	mistral-large-latest	@ai-sdk/mistral
togetherai	Together AI	https://api.together.xyz/v1	meta-llama/Llama-3-70b	openai-compat
fireworks	Fireworks AI	https://api.fireworks.ai/inference/v1	accounts/fireworks/models/llama-v3p1-70b	openai-compat
xai	xAI Grok	https://api.x.ai/v1	grok-3	@ai-sdk/xai
zhipu	Z.AI (Zhipu)	https://open.bigmodel.cn/api/paas/v4	glm-4	openai-compat
opencode	OpenCode	https://api.opencode.ai/v1	opencode-latest	openai-compat
ollama	Ollama (Local)	http://localhost:11434/v1	llama3.2:3b	openai-compat
lmstudio	LM Studio	http://localhost:1234/v1	(user-set)	openai-compat
cohere	Cohere	https://api.cohere.com/v1	command-r-plus	openai-compat
perplexity	Perplexity	https://api.perplexity.ai	sonar-pro	openai-compat
hyperbolic	Hyperbolic	https://api.hyperbolic.xyz/v1	Qwen/Qwen2.5-72B	openai-compat
novita	Novita AI	https://api.novita.ai/v3/openai	meta-llama/llama-3.1-70b	openai-compat
azure	Azure OpenAI	(user-set)	gpt-4o	openai-compat
DB schema change: Switch provider column from { enum: [...] } to plain text("provider"). Add a runColumnMigrations-style migration that just confirms the column exists (no enum constraint in SQLite anyway — it's a check constraint the existing code may not enforce at DB level).

registry.ts resolution: Add a default branch — if provider is not anthropic/google/mistral/xai, use createOpenAI({ apiKey, baseURL }). This keeps all openai-compat providers working with zero extra code.

Install needed: pnpm add @ai-sdk/mistral @ai-sdk/xai

Fix 5 — Skills: Bulk import from GitHub
Problem: Skills can only be added one-by-one manually.

Files to modify:

app/dashboard/skills/page.tsx — add "Import from GitHub" button + dialog
app/api/skills/import/route.ts — new route
New route app/api/skills/import/route.ts:

POST /api/skills/import
Body: { repoUrl: string }  // e.g. "https://github.com/sickn33/antigravity-awesome-skills"
Extract owner/repo from URL.
Fetch https://api.github.com/repos/{owner}/{repo}/git/trees/main?recursive=1 — gets flat file tree (no auth needed for public repos).
Filter entries where path matches **/SKILL.md.
For each, fetch raw content from https://raw.githubusercontent.com/{owner}/{repo}/main/{path}.
Parse: first # Heading → skill name; first paragraph after heading → description; rest of content → instructions.
Upsert into skills table (skip if name already exists).
Return { imported: N, skipped: M }.
UI: "Import from GitHub" button on skills page → dialog with URL input pre-filled to the antigravity repo → progress indicator → success toast with count.

Fix 6 — Server logs: Pretty formatting
Problem: Default Next.js dev output is plain text and hard to scan.

Note: Next.js's own compile messages (✓ Compiled, ○ Compiling) cannot be overridden. We improve our own API route logs.

New file: lib/utils/logger.ts

Tiny logger using ANSI escape codes (no extra dep) or pino (already installed).
Methods: logger.req(method, path, status, ms), logger.info(msg), logger.warn(msg), logger.error(msg, err?).
Output format: [HH:MM:SS] METHOD /path → STATUS (Xms) with colors:
Method: cyan
2xx status: green, 4xx: yellow, 5xx: red
Route path: white
Latency: dim
New file: middleware.ts (Next.js middleware — runs on every request):

Log each API request: logger.req(req.method, req.nextUrl.pathname, ...).
Since middleware runs before response, use a start-time header approach — or just log on request arrival with method + path.
Alternatively: add a withLogger HOF wrapper that API routes can use, since middleware can't easily log response status.
Pragmatic approach: Since getting the response status in middleware is tricky, add logger.req() calls at the top of each major API route's handler. A helper withLog(handler) wrapper handles the timing and status logging — wrap existing route exports. Start with the 10 most-used routes.

Fix 7 — Themes: Full Odysseus-style theme system
Credits: Theme names, color palettes, and UI structure inspired by Odysseus by pewdiepie-archdaemon (AGPL-3.0). Credit in README.md and CHANGELOG.md.

Files to modify:

app/globals.css — add 16 named theme variable sets
app/dashboard/settings/appearance/page.tsx — full rebuild into 2-tab UI
lib/db/settings.ts (via /api/settings) — store activeTheme, full custom theme object
Theme definitions — add to globals.css as CSS classes on [data-theme="name"]:

Name	bg	accent	style
original	#1a1a2e	#7c6af0	deep purple/violet
midnight	#050507	#60a5fa	near-black/sky
paper	#f5f0e8	#b45309	cream/amber (light)
cyberpunk	#0a0a0f	#00ffcc	dark/cyan neon
retrowave	#0d0221	#ff2d78	dark purple/pink
forest	#0a1a0f	#4ade80	dark green
ocean	#051218	#38bdf8	deep ocean/sky
ume	#1a0826	#e879f9	dark/fuchsia
copper	#1a0e08	#c2652a	dark/copper
terminal	#000000	#22c55e	black/green
lavender	#1a1528	#a78bfa	dark/violet
claude	#141414	#d97706	dark/amber (Matrix default)
cute	#1f0a1f	#f472b6	dark/pink
gpt	#0d0d0d	#9ca3af	dark/grey
light	#f8f8f8	#34d399	white/emerald
matrix	#050505	#34d399	current default
Appearance page rebuild (2 tabs):

Tab 1 — Themes: Grid of named theme cards (3 per row). Each card shows 3 color swatches (bg, panel, accent) + name. Click to apply instantly. Active theme gets an orange ring.

Tab 2 — Customize:

Colors section: Color pickers for Background, Text, Panel, Sidebar, Border, Accent — each a <input type="color"> + hex display.
Color Harmony: Accent input + Harmony dropdown (Complementary, Analogous, Triadic, Split-Comp) + Mode (Dark/Light) + Generate button → auto-derives a full palette.
Font & Layout: Font select (Geist Sans / Geist Mono / System), Density select (Compact/Comfortable/Spacious), Frosted toggle (enables backdrop-filter globally).
Save/Share: Theme name input + Save button (stores to DB as JSON), Import button (paste JSON), Export button (downloads JSON), Reset to Default.
Implementation: Apply themes by setting document.documentElement.setAttribute("data-theme", name) and persisting to settings.activeTheme. CSS uses [data-theme="name"] { --color-bg-base: ...; ... } selectors. Custom theme stored as JSON in settings.customTheme and applied by injecting a <style> tag dynamically.

Fix 8 — Cookbook: Odysseus-style rebuild
Credits: Cookbook feature design, tab structure, and model fitting concepts from Odysseus by pewdiepie-archdaemon (AGPL-3.0). Clean-room re-implementation in TypeScript/Next.js.

Files to modify/replace:

app/dashboard/settings/cookbook/page.tsx — full rebuild with tabs
app/api/ollama/route.ts — add VRAM detection
lib/services/ollama.ts — add serve controls, config read/write
lib/services/ollama-shared.ts — add model scoring/fitting logic
New file: components/ui/tabs.tsx — generic Tabs primitive (tab list + tab panels, keyboard nav).

New API routes:

app/api/ollama/serve/route.ts — GET (status: running/stopped, PID, memory), POST {action: "start"|"stop"|"restart"}
app/api/ollama/config/route.ts — GET (read Ollama env config), PATCH (write env vars)
Tab 1 — Download:

Hardware banner: Detected CPU, RAM, VRAM (via systeminformation), chip (Apple M-series / NVIDIA / AMD). "Rescan" button.
Filters: Standard/All, Quant selector (All/Q4/Q8/F16), Context slider, search box.
Model table columns: FIT badge (PERFECT/OK/MARGINAL/NO), Model name + quant tag, PARAM, QUANT, VRAM needed, CTX, est. Speed (t/s), SCORE, MODE (llama.cpp/gguf).
Model scoring: score = (quality_index * 10) - (vram_needed_gb / available_vram_gb * 20). Fit: PERFECT if vram_needed ≤ available_vram * 0.7, OK if ≤ available_vram, MARGINAL if ≤ available_vram * 1.2 (uses unified memory on Apple), NO otherwise.
Pre-populated model registry (~30 models) stored in ollama-shared.ts with param count, quant, vram estimate, ctx, quality score.
Pull button on each row; progress bar replaces button during pull.
Tab 2 — Serve:

Status card: Running/Stopped badge, PID, memory usage, uptime.
Start/Stop/Restart buttons → call /api/ollama/serve.
Currently loaded models list (from GET /api/ollama/ps Ollama endpoint).
Ollama URL config (moved here from current page).
Tab 3 — Dependencies:

Two sections: "App dependencies" (playwright, rembg, etc.) and "Server dependencies" (tmux, docker, hf_transfer, llama_cpp, sglang, vllm, diffusers).
Each item: name, description, type badge (System/LLM/Image/Tools), Install/Installed button.
Detection: shell which <tool> or python3 -c "import <pkg>" via /api/ollama/deps endpoint.
Install: for Python pkgs, pip install <pkg>; for system tools, shows manual instruction (can't automate OS-level installs).
Tab 4 — Settings:

Ollama config form: num_ctx (context window), num_gpu (GPU layers), keep_alive, num_thread.
Reads from Ollama API /api/show and env variables.
Save button → writes to /api/ollama/config → stores as settings in DB (injected as env on next Ollama start).
Verification
# After all changes:
pnpm typecheck           # must be zero errors

# Smoke test new endpoints:
curl -X POST http://localhost:3000/api/workspace -H "content-type: application/json" -d '{"path":"/Users/zach/Desktop/matrix-dash"}'
curl "http://localhost:3000/api/workspace/tree?root=/Users/zach/Desktop/matrix-dash"
curl http://localhost:3000/api/ollama/serve
curl http://localhost:3000/api/skills/import -d '{"repoUrl":"https://github.com/sickn33/antigravity-awesome-skills"}'

# Visual checks:
# - IDE → empty state → enter path → folder tree populates with real files → click file → opens in Monaco
# - IDE → right-click file → context menu shows → rename works
# - Chat with Anthropic provider → streaming text appears token by token, thinking block shows
# - Settings → Appearance → 2 tabs, click "midnight" theme → page colors change immediately
# - Settings → Cookbook → 4 tabs visible, Download tab shows model table with FIT column
# - Settings → AI Providers → "Add provider" → dropdown shows 16+ options
# - Skills page → "Import from GitHub" → imports antigravity-awesome-skills
Execution order (minimize breakage)
Fix 1+3 (Real Workspace IDE) — new API routes first, then IDE page rework
Fix 4 (providers) — schema + registry + UI
Fix 6 (logger) — additive only
Fix 5 (skills import) — new route only
Fix 2 (chat streaming/thinking) — touches chat + API route
Fix 7 (themes) — globals.css + appearance page rebuild
Fix 8 (cookbook) — largest change, last