# Tier 1: File Upload, Mobile Agent Control, Push 2.0 — Design Spec

> **Status:** Design approved. Awaiting implementation plan.

**Goal:** Three features that build directly on the PWA and mobile file browser already shipped: upload files from iPhone to MacBook (including camera capture), control agents end-to-end from iPhone, and upgrade push notifications with lock-screen actions, an in-app center, and grouping.

---

## SP1: File Upload from iPhone + Camera to MacBook

### Decisions Made

| Decision | Choice |
|---|---|
| Upload destination | User chooses folder per upload (folder picker modal) |
| Camera capture | Camera button on Files page → `<input capture="environment">` |
| Multi-file | Yes — iPhone file picker allows multiple selection |
| Max file size | 500MB (mirrors download limit from `lib/files-security.ts`) |

### Architecture

```
Files Page (app/dashboard/files/page.tsx)
├── Top bar: [Camera] [Upload] [Share]
├── Directory listing (existing)
├── Upload queue (slide-up panel)
│   ├── File name + size
│   ├── Progress bar per file
│   └── Cancel button
├── Folder picker modal (when destination unset)
│   ├── Current folder shown as default
│   ├── Breadcrumb to navigate
│   └── "Upload here" button
└── POST /api/files/upload
    ├── Multipart form: destinationPath + files[]
    ├── resolvePath() validation (reuse lib/files-security.ts)
    ├── fs.writeFileSync per file
    └── Response: { uploaded: [{ name, path, size }] }
```

### Camera Capture

Uses `<input type="file" capture="environment" accept="image/*">`. On iOS Safari this opens the native camera directly — no `getUserMedia()` permissions dialog. After capture, the file enters the same upload pipeline as a regular file pick. The camera button is a visible icon in the Files page topbar, distinct from the upload button (camera icon vs upload icon).

### Upload Queue UI

When multiple files are selected:
1. A panel slides up from the bottom showing each file with name and size
2. Files are uploaded sequentially (not parallel — avoids saturating the connection)
3. Progress is tracked via `XMLHttpRequest.upload.onprogress` (fetch doesn't support progress events)
4. Completed files show a checkmark; failed files show an error with retry
5. On completion, the file listing refreshes automatically

### API Route

**`POST /api/files/upload`**
- Auth: `withUser` (session cookie)
- Rate limit: 10 req/min
- Body: `multipart/form-data` with fields:
  - `destinationPath` (string, required) — absolute path to target folder
  - `files` (File[], required) — one or more file blobs
- Path validation via `resolvePath(destinationPath)` from `lib/files-security.ts`
- For each file: `fs.writeFileSync(path.join(destination, sanitizeFilename(file.name)), buffer)`
- Filename sanitization: strip path separators, null bytes, limit to 255 chars
- Conflict resolution: if file exists, append ` (1)`, ` (2)`, etc. before extension
- Returns: `{ uploaded: [{ name: string, path: string, size: number }], destination: string }`
- Errors: 400 (invalid path), 403 (sensitive path), 413 (file too large), 500 (disk full/IO error)

### Files

| File | Action | Purpose |
|---|---|---|
| `app/api/files/upload/route.ts` | Create | Upload endpoint |
| `app/dashboard/files/page.tsx` | Modify | Add camera + upload buttons, upload queue panel, folder picker trigger |
| `components/files/upload-queue.tsx` | Create | Upload progress panel (sequential, progress bars) |
| `components/files/folder-picker.tsx` | Create | Modal folder browser to choose upload destination |
| `components/files/camera-button.tsx` | Create | Camera capture button with `<input capture="environment">` |
| `e2e/files-upload.spec.ts` | Create | Upload tests |

---

## SP2: Mobile Agent Control

### Decisions Made

| Decision | Choice |
|---|---|
| Scope | Full lifecycle: start, monitor live transcript, approve/reject |
| API changes | None needed — all agent APIs already exist and are auth-gated |

### Architecture

The existing agent infrastructure is fully API-driven. The mobile UI needs to render the same data with touch-optimized components.

**Agents List Page (mobile):**
```
┌─────────────────────────────┐
│ Agents           [New] [⚙] │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ 🟢 morning-briefing     │ │
│ │ Status: idle · 5m ago   │ │
│ │ [Enable] [Run now] [···]│ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 🔴 site-monitor         │ │
│ │ Status: running · live  │ │
│ │ [Cancel] [View]         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

Changes from desktop:
- Cards are full-width (no grid), compact, swipeable
- "Run now" and "Cancel" are prominent buttons (not icon-only)
- Agent detail slides in as a new page rather than inline
- Mode badge (watching/scheduled/manual) shown as colored pill

**Agent Run Monitor (mobile):**
```
┌─────────────────────────────┐
│ ← Back    morning-briefing  │
├─────────────────────────────┤
│ ● live · 3.2k tokens        │
│                             │
│ ┌─────────────────────────┐ │
│ │ User: "Check sites..."  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Assistant:              │ │
│ │ I'll check the health   │ │
│ │ of all three sites...   │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ ● site_check(site=...)  │ │
│ │   Running... ████████░░ │ │
│ └─────────────────────────┘ │
│                             │
│ [Cancel run]                │
└─────────────────────────────┘
```

- Full-width transcript (no sidebar)
- Live streaming via existing `useRunStream` hook (already works)
- Cancel button always visible at bottom
- Git meta card shown after completion (collapsed by default)

**Approvals Page (mobile):**
```
┌─────────────────────────────┐
│ Approvals             (3)   │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ 🟡 site-monitor         │ │
│ │ Bash: curl https://...  │ │
│ │ [Always allow]          │ │
│ │ [Approve]   [Deny]      │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

- Approval cards are full-width with large Approve/Deny buttons (48px tall)
- "Always allow" is a toggle switch (not checkbox — more touch-friendly)
- Badge count shown in page header and on the bottom nav
- Swipe left on card → quick-deny; swipe right → quick-approve (optional gesture)

### Files

| File | Action | Purpose |
|---|---|---|
| `app/dashboard/agents/page.tsx` | Modify | Responsive layout, compact cards, mobile actions |
| `app/dashboard/agents/approvals/page.tsx` | Modify | Touch-optimized approve/deny, swipe gestures |
| `app/dashboard/agents/runs/[runId]/page.tsx` | Modify | Mobile transcript view, sticky cancel button |

---

## SP3: Push Notifications 2.0

### Decisions Made

| Decision | Choice |
|---|---|
| Scope | Actionable lock-screen actions, in-app notification center, grouping by source |

### 1. Actionable Lock-Screen Notifications

Modify `sw.js` push handler to attach `actions` to notifications:

```javascript
self.registration.showNotification(title, {
  body,
  icon: "/icon.svg",
  badge: "/icon.svg",
  tag: sourceTag,                        // groups by source
  actions: approvalId ? [
    { action: "approve", title: "Approve" },
    { action: "deny",   title: "Deny" },
  ] : [],
  data: { url, approvalId, runId },
});
```

On `notificationclick` with `event.action`:
- `"approve"` → `fetch("/api/agents/approvals/${approvalId}", { method: "POST", body: JSON.stringify({ decision: "approve" }) })` — fires in the SW, no window needed
- `"deny"` → same with `{ decision: "deny" }`
- Default (tap notification body) → open the dashboard at the relevant URL

SW already has `clients.openWindow()` for default taps. The approval POST is a background fetch — the user doesn't leave the lock screen.

### 2. In-App Notification Center

New page at `/dashboard/notifications`:

```
Notifications
├── Filter tabs: All | Agents | Tasks | System
├── Notification cards grouped by date ("Today", "Yesterday", "Earlier")
│   ├── Icon + title + body + time
│   ├── Tap → navigate to href
│   └── Swipe → dismiss
├── [Mark all read] button
└── Empty state when no notifications
```

Data comes from existing `GET /api/notifications` (returns last 50). The `notifications` table already has `isRead`, `kind`, `href`. Unread badge count shown on the notification bell in topbar and the nav item.

### 3. Notification Grouping

Tag notifications in `lib/services/notify.ts`:
- Agent: `tag: "agent-${agentId}"`
- Task: `tag: "task-${taskId}"`  
- System: `tag: "system-${eventType}"`
- Email: `tag: "email-${accountId}"`

iOS groups notifications by `tag` — same tag replaces the previous notification for that source rather than creating a new one.

Also add `renotify: true` to agent approval notifications so they always surface even if the previous one for that agent hasn't been dismissed.

### Files

| File | Action | Purpose |
|---|---|---|
| `public/sw.js` | Modify | Notification actions (approve/deny), source-based tagging, renotify |
| `app/dashboard/notifications/page.tsx` | Create | In-app notification center page |
| `components/notifications/notification-list.tsx` | Create | Notification card list with group headers, swipe-to-dismiss |
| `components/layout/notification-bell.tsx` | Modify | Unread count badge (already polls, add badge number) |
| `components/layout/nav-items.ts` | Modify | Add Notifications to NAV_ITEMS |
| `components/layout/mobile-nav.tsx` | Modify | Optionally add Notifications to bottom tab or More drawer |

---

## Global Constraints (apply to all SP1-SP3)

- No new npm dependencies unless absolutely necessary
- All API routes use existing `withUser` auth guard
- All file paths validated through `resolvePath()` from `lib/files-security.ts`
- TypeScript strict mode enforced (`pnpm typecheck` must pass)
- E2E tests written for every new API route (Playwright)
- Named functions in `useEffect` per `frontend-react-best-practices` skill
- Touch targets ≥44px on mobile per Apple HIG
