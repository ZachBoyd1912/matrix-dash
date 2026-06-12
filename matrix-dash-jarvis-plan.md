# Matrix Dash → Jarvis — Full Parity & Beyond Plan

**Date:** 12 June 2026
**Source audit:** `pewdiepie-archdaemon/odysseus` @ `dev` (shallow clone, read-only)
**End goal:** A personal Jarvis — an always-on, voice-capable, tool-using assistant that knows Zach, runs locally, and acts across email, calendar, tasks, files, and the web.

---

## 0. Licensing ground rule

Odysseus is **AGPL-3.0** (Python/FastAPI + vanilla JS). We do **not** copy any code, prompts, or assets from it. This plan is a *feature-level* clean-room spec: we re-implement equivalent capabilities natively in the Matrix Dash stack (Next.js 15 / TypeScript / SQLite / Vercel AI SDK). This keeps your repo unencumbered.

---

## 1. Gap analysis

### Already at parity (Matrix Dash has it)
| Capability | Notes |
|---|---|
| Multi-provider chat w/ streaming | Anthropic / OpenAI / Google / any OpenAI-compatible (→ Ollama, vLLM, llama.cpp, OpenRouter already work via Custom + baseURL) |
| Persistent memory + extraction + injection | Ours adds the auto-linked knowledge graph (Odysseus has no graph) |
| Sessions / history | Parity |
| Notes + wiki-links + backlinks + graph | Parity-plus (Obsidian layout) |
| Editor (Monaco IDE) | Odysseus "Documents" is closer to a writing tool — see §3.8 |
| Local email box UI | Ours is local-only; theirs is real IMAP/SMTP — see §3.3 |
| Settings, themes (dark/light), mobile responsive | Parity (PWA install still missing) |
| Export / wipe / encrypted API keys | Parity (theirs adds scheduled backups, vault, 2FA) |

### Odysseus has, Matrix Dash doesn't (the build list)
1. **Agent mode with real tools** — web, files, shell, memory, MCP, skills; multi-step autonomous runs
2. **Voice** — STT (speech→text) and TTS (text→speech)
3. **Real email** — IMAP/SMTP accounts, pollers, AI triage (auto-tag, summary, reply drafts, spam)
4. **Notes & Tasks engine** — todos, reminders, cron-scheduled tasks the agent executes, notification channels (ntfy / browser / email)
5. **Calendar** — local calendar, CalDAV sync, .ics import/export, agent-aware
6. **Vector memory** — embeddings + semantic retrieval (they use ChromaDB + fastembed; we use FTS5 only)
7. **Skills system** — reusable instruction/capability packs the agent loads on demand
8. **Deep Research** — multi-step gather→read→synthesize runs producing a visual report
9. **Compare** — blind multi-model side-by-side arena with synthesis
10. **Cookbook** — hardware scan, model recommendation, download & serve local models
11. **File uploads in chat** — vision images + PDF extraction into context
12. **Web search grounding** in chat
13. **Image generation + gallery + image editor**
14. **Presets/personas** for chat
15. **Auth** — login, 2FA, API tokens, admin (matters once exposed on LAN/Tailscale)
16. **PWA** — installable on phone, plus companion pairing
17. **Platform extras** — vault (encrypted secrets), scheduled backups, webhooks, contacts, MCP server/client, theme editor, diagnostics

---

## 2. Architecture decisions (one-time, unlock everything else)

| Decision | Choice | Why |
|---|---|---|
| **Agent loop** | Vercel AI SDK v5 `streamText` + `tools` + `stopWhen: stepCountIs(N)` | Native multi-step tool calling in our existing chat route; no framework change |
| **Background runtime** | A Node singleton "daemon" module (globalThis-cached, like our DB) hosting `node-cron` jobs: schedulers, email pollers, memory decay | Next.js dev/start keeps one process alive locally — good enough for personal use; can later split into a tiny standalone worker |
| **Embeddings** | `@huggingface/transformers` (ONNX, all-MiniLM-L6-v2, ~80MB, runs on CPU) writing into the existing `memories.embedding` column; cosine in JS, upgrade to `sqlite-vec` if corpus grows | Local-first, zero API cost, the schema already reserved the column |
| **Notifications** | In-app notification center (DB table + polling) + Web Push (PWA) + optional ntfy HTTP + email channel | Mirrors Odysseus channels with web-native equivalents |
| **Tool safety** | Every destructive tool call (shell, file write, email send) requires explicit approval in the UI unless the user has allowlisted it per-tool | Their own roadmap flags prompt-injection risk; we bake approval in from day one |

---

## 3. Phased implementation

### Phase 3 — The Agent (Jarvis brain) `[BIGGEST WIN]`
Make Agent mode real instead of cosmetic.

- **3.1 Tool runtime**: extend `/api/ai/chat` — when `mode: "agent"`, attach tools and allow up to N steps. Tools (AI SDK `tool()` with zod schemas):
  - `searchMemories` / `saveMemory` (wraps existing services)
  - `searchNotes` / `readNote` / `writeNote`
  - `listFiles` / `readFile` / `writeFile` (IDE workspace tables)
  - `webSearch` (SearXNG URL or Tavily/Brave key from settings) + `fetchPage` (readability extraction)
  - `runShell` (child_process, **approval-gated**, output truncated)
  - `createTask` / `listTasks` / `completeTask` (Phase 5 tables, stub until then)
  - `composeEmail` (drafts only until Phase 4)
- **3.2 Tool-call UI**: expandable tool-call cards in the message stream (name, args, result, duration); approval prompt cards for gated tools (approve / deny / always-allow).
- **3.3 Agent Tools settings**: the existing page's toggles become real — each toggle gates a tool's availability; per-tool allowlist for auto-approve.
- **3.4 Skills**: `skills` table (name, description, instructions, enabled). Agent gets a `loadSkill` tool + skill summaries in its system prompt; CRUD UI under Memory Bank or its own tab. Import/export as markdown.
- **DB**: `skills`, `tool_approvals`. **Est:** L (1–2 sessions)

### Phase 4 — Voice + Notifications (Jarvis voice & presence)
- **4.1 STT**: mic button in chat input → Web Speech API (instant, free); fallback path: POST audio to `/api/stt` for local whisper.cpp server if configured.
- **4.2 TTS**: speaker toggle → `speechSynthesis` for instant playback; optional engine setting (local Kokoro/edge-compatible HTTP endpoint) via `/api/tts`.
- **4.3 Hands-free mode**: push-to-talk + auto-speak-replies toggle = talking to Jarvis.
- **4.4 Notification center**: `notifications` table + bell dropdown in topbar (the bell exists, dead today); channels: in-app, Web Push, ntfy URL, email.
- **Est:** M (1 session)

### Phase 5 — Tasks, Reminders & Scheduler (Jarvis acts on time)
- **5.1 Todos**: `tasks` table (title, notes, due, done, recurrence); checklist UI on a new Tasks page (merged into Notes nav as "Notes & Tasks").
- **5.2 Reminders**: note/task `remindAt` → daemon cron fires notification through chosen channels.
- **5.3 Scheduled agent tasks**: cron-style jobs ("every morning at 8, summarize unread email + today's calendar") = stored prompt + schedule; daemon runs it through the agent loop, writes result to a session + notification. **This is the Jarvis "morning briefing".**
- **DB**: `tasks`, `scheduled_jobs`, `notifications`. **Est:** M–L (1 session)

### Phase 6 — Real Email (IMAP/SMTP + AI triage)
- **6.1 Accounts**: `email_accounts` table (IMAP/SMTP host/port/user, AES-256-GCM-encrypted creds — reuse `crypto.ts`); settings UI with connection test.
- **6.2 Sync**: daemon poller via `imapflow` + `mailparser` → upserts into existing `emails` table (add `accountId`, `messageId`, `tags` columns); real send via `nodemailer` (approval-gated when agent-initiated).
- **6.3 AI triage**: on new mail, active provider classifies (urgent/normal/spam), auto-tags, one-line summary, optional reply draft saved to Drafts. Toggles per account.
- **Est:** L (1–2 sessions)

### Phase 7 — Calendar
- **7.1 Local calendar**: `calendars` + `events` tables; month/week/agenda views (custom grid, glass design); event CRUD.
- **7.2 CalDAV sync** via `tsdav` (Radicale / Nextcloud / Apple / Fastmail); `.ics` import/export via `ical.js`.
- **7.3 Agent tools**: `listEvents` / `createEvent` — feeds the morning briefing.
- **Est:** L (1–2 sessions)

### Phase 8 — Knowledge upgrade (vector memory, uploads, RAG)
- **8.1 Embeddings**: backfill + embed-on-write for memories and notes; hybrid retrieval (FTS5 ∪ cosine) in injection/auto-link — better recall than keywords alone.
- **8.2 Chat uploads**: attachment button → images go to vision-capable models as image parts; PDFs extracted (`pdf-parse`) and chunked; `attachments` table.
- **8.3 RAG**: embedded chunks of uploads/notes retrievable by a `searchKnowledge` agent tool.
- **Est:** M–L (1 session)

### Phase 9 — Research & Compare
- **9.1 Deep Research**: orchestrated run (plan → iterative webSearch/fetchPage → notes → synthesis) with live progress UI (steps, sources found, reading) and a final report saved as a Note with citations.
- **9.2 Compare**: pick 2–4 providers/models, same prompt streams side-by-side; blind mode (anonymized columns, reveal after vote); optional judge-model synthesis.
- **Est:** M each (1 session combined)

### Phase 10 — Model ops ("Cookbook lite")
- Ollama-first: detect `localhost:11434`, list installed models, pull with progress, one-click register as provider; hardware note (RAM/VRAM via `systeminformation`) with model size warnings. Skip vLLM/llama.cpp process management — on 8GB RAM, recommend small models explicitly.
- **Est:** M

### Phase 11 — Platform hardening
- **PWA**: manifest + service worker + icons → installable on phone; Web Push lands here.
- **Auth**: single-user password + TOTP 2FA (`otplib`) + API tokens table (for webhooks/companion calls); only enforced when bind ≠ localhost.
- **Vault**: encrypted key-value secrets UI (reuse AES-GCM).
- **Backups**: daemon cron → JSON export to `~/MatrixDash/backups`, retention setting.
- **Webhooks**: outbound webhooks for events (new memory, task done); inbound `/api/hooks/<token>` to inject a message/task — lets HomeAssistant/Shortcuts talk to Jarvis.
- **MCP client**: AI SDK `experimental_createMCPClient` → connect external MCP servers as extra agent tools (their MCP feature, our stack).
- **Contacts**: simple `contacts` table feeding email autocomplete + agent context.
- **Est:** L (split across sessions)

### Phase 12 — Delight (optional parity tail)
- Image generation (OpenAI Images or local ComfyUI endpoint) + gallery page; presets/personas (system-prompt bundles selectable in chat input); theme editor (custom accent/track tokens); diagnostics page (provider probes, daemon job health, DB size).

---

## 4. Priority order toward "Jarvis custom to me"

| Priority | Phases | Outcome |
|---|---|---|
| **P0** | 3 → 4 → 5 | An agent that does things, speaks/listens, remembers, and acts on schedule (morning briefing works) |
| **P1** | 6 → 7 → 8 | Jarvis manages email + calendar and has deep personal knowledge |
| **P2** | 9 → 10 | Research-grade answers, local model freedom |
| **P3** | 11 → 12 | Phone-installable, secure on LAN, extensible, pretty |

New dependencies (all permissively licensed): `@huggingface/transformers`, `node-cron`, `imapflow`, `mailparser`, `nodemailer`, `tsdav`, `ical.js`, `pdf-parse`, `otplib`, `systeminformation`, `web-push`.

**Machine constraint note (8GB RAM):** local embeddings (MiniLM) and whisper/TTS endpoints are optional toggles; every AI feature degrades gracefully to API providers. Never run heavyweight local model serving on this machine — Cookbook-lite will warn.
