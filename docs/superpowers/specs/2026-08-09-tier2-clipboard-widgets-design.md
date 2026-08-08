# Tier 2: Clipboard Bridge & Home Screen Widgets — Design Spec

> **Status:** Design approved. Awaiting implementation plan.

**Goal:** Two novel mobile-only capabilities: copy text on iPhone and paste it instantly on MacBook through the dashboard, and iOS 17+ PWA Home Screen widgets showing agent status, task counts, and recent files.

---

## SP4: Clipboard Bridge

### Architecture

```
iPhone                               MacBook (Matrix Dashboard)
──────                               ──────────────────────────
Copy text                            Server:
  │                                    GET  /api/clipboard → returns latest entry
  │  POST /api/clipboard/set           POST /api/clipboard/set
  ├─ { text: "hello" }               └─ child_process.exec("pbcopy", input)
  │                                    → macOS clipboard updated
  │  Return: { ok: true }
  ▼
Toast: "Copied to Mac"
```

Two endpoints, one SQLite table:

**Schema:** `clipboard_entries(id TEXT PK, text TEXT NOT NULL, created_at TEXT NOT NULL, fetched_at TEXT)`

**`POST /api/clipboard/set`**
- Auth: `withUser`
- Body: `{ text: string }` — max 50,000 characters (enough for code blocks, not novels)
- Inserts new row with `created_at = now()`
- Dedup: if text matches the latest entry, skip insert (no duplicate noise)
- Returns `{ ok: true }`

**`GET /api/clipboard`**
- Auth: `withUser`
- Returns latest unfetched entry: `{ text: string, createdAt: string }`
- Marks as fetched: `UPDATE clipboard_entries SET fetched_at = now() WHERE id = ?`
- If no unfetched entries: `{ text: null }`
- **Auto-writes to macOS clipboard:** On the server (local Node.js on MacBook), after returning the response, spawn `child_process.exec("pbcopy")` with the text piped to stdin. This is fire-and-forget — the response is already sent.

### iPhone UI

Two entry points:
1. **Files page topbar:** Clipboard icon next to Camera/Upload/Share. Tap → "Copy to Mac" text area appears. Type or paste text, hit Send.
2. **Long-press context:** Any text element in the dashboard (memory content, note body, chat message) → long-press → "Copy to Mac" option in the context menu. Uses `navigator.clipboard.readText()` to get selected text.

### Safety

- Text is stored in SQLite (local, same machine). No cloud transmission.
- Old entries auto-cleaned: a daemon task deletes entries older than 24 hours with `fetched_at IS NOT NULL`
- Max 50KB per entry to prevent abuse
- Rate limit: 20 req/min on POST

### Files

| File | Action | Purpose |
|---|---|---|
| `app/api/clipboard/route.ts` | Create | GET latest + POST set endpoint |
| `lib/services/clipboard-daemon.ts` | Create | pbcopy integration + cleanup daemon |
| `lib/db/schema.ts` | Modify | Add `clipboard_entries` table |
| `components/layout/topbar.tsx` | Modify | Clipboard icon button (sends current selection) |
| `components/files/clipboard-send.tsx` | Create | Modal for typing/pasting text to send to Mac |

---

## SP5: Home Screen Widgets (iOS 17+ PWA)

### Architecture

iOS 17.4+ supports PWA widgets via the `"widgets"` key in the Web App Manifest. The widget content is static HTML served at dedicated routes — iOS caches this and renders it on the Home Screen. Updates require the widget content to change at its source URL (iOS re-caches periodically).

**Approach: Static widget pages (Recommended)**
Each widget is a server-rendered HTML page at a dedicated route. iOS fetches these and renders them as Home Screen widgets. Updates happen when the user views the widget (iOS periodically refreshes) or when the underlying data changes (widget re-caches).

**Why not live widgets?** The Service Worker `periodicsync` event would allow background refresh, but it's not supported on iOS (as of iOS 18). Live widgets would require a native app via WidgetKit — not viable for a PWA. Static widgets with periodic iOS refresh are the practical ceiling for PWAs today.

### Widgets to Ship

**1. Agent Status Widget** (`/widgets/agent-status`)
```
┌──────────────────────┐
│ Matrix ──── 3 active │
│                        │
│ 🟢 2 agents running    │
│ 🟡 1 approval pending  │
│ 🔵 5 tasks due today   │
└──────────────────────┘
```
- Route: `GET /widgets/agent-status` returns self-contained HTML (inline CSS, no external deps)
- Data: queries `agentRuns` for active runs, `agentApprovals` for pending, `tasks` for today's due
- Styling: matches dashboard theme tokens (dark bg, emerald accent)
- iOS renders this at widget-native sizes (small/medium/large)

**2. Tasks Widget** (`/widgets/tasks`)
```
┌──────────────────────┐
│ Tasks ─── Today      │
│                        │
│ ☐ Deploy matrix-dash  │
│ ☐ Review PR #42      │
│ ☐ Update dependencies │
│ + 2 more              │
└──────────────────────┘
```
- Shows today's incomplete tasks (up to 3, then "+N more")
- Each with checkbox state (read-only in widget)

**3. Quick Files Widget** (`/widgets/quick-files`)
```
┌──────────────────────┐
│ Files ── Recent      │
│                        │
│ 📄 package.json  3m   │
│ 📄 .env.local   12m   │
│ 🖼 screenshot.png 1h  │
└──────────────────────┘
```
- Shows 3 most recently modified files from the workspace
- Tap opens the Files page to that folder (widgets support URL navigation)

### Manifest Changes

Add to `app/manifest.ts`:
```typescript
widgets: [
  {
    name: "Agent Status",
    description: "Active agents and pending approvals",
    tag: "agent-status",
    template: "today",
    screenshots: [{ src: "/screenshots/widget-agent-status.png", sizes: "..." }],
  },
  {
    name: "Tasks",
    description: "Today's tasks at a glance",
    tag: "tasks",
    template: "today",
  },
  {
    name: "Quick Files",
    description: "Recently modified files",
    tag: "quick-files",
    template: "today",
  },
],
```

### Files

| File | Action | Purpose |
|---|---|---|
| `app/widgets/agent-status/route.ts` | Create | Agent status widget HTML |
| `app/widgets/tasks/route.ts` | Create | Tasks widget HTML |
| `app/widgets/quick-files/route.ts` | Create | Quick files widget HTML |
| `app/manifest.ts` | Modify | Add `widgets` array |

---

## Global Constraints (apply to SP4-SP5)

- Clipboard entries auto-cleaned after 24h (fetched) or 7 days (unfetched)
- Widget HTML must be fully self-contained (inline CSS, no external JS, no fonts)
- Widget routes return `text/html` with `Cache-Control: public, max-age=3600`
- `pnpm typecheck` must pass with zero errors
