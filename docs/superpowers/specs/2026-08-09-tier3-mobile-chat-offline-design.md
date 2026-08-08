# Tier 3: Mobile-Optimized Chat & Offline Queuing — Design Spec

> **Status:** Design approved. Awaiting implementation plan.

**Goal:** Redesign the AI chat interface for phones (currently desktop-only) with proper touch targets, keyboard handling, and responsive layout. Add offline queuing so prompts typed while disconnected are sent when connectivity returns.

---

## SP6: Mobile-Optimized Chat

### Current State (from codebase explore)

The chat interface (`chat-interface.tsx`, 846 lines) has **zero mobile-specific adaptations** beyond a single `md:px-6` class. Key issues:

| Issue | Current | Target |
|---|---|---|
| Message container width | `max-w-3xl` (768px + padding = ~280px on 375px iPhone) | Full-width on mobile |
| Empty state hero | Fixed-size logo/heading | Scale proportionally on mobile |
| Hover-revealed actions | `opacity-0 group-hover:opacity-100` (useless on touch) | Always visible on mobile or long-press |
| Keyboard overlap | No `visualViewport` handling | Adjust input position when keyboard opens |
| Claude Code pills | `hidden sm:inline-flex` (hidden on mobile, no alternative) | Simplified mode selector |
| Input toolbar | 6+ items in a single row | Wrap to 2 rows or use overflow menu |
| Footer text | Always visible | Hidden on mobile (saves ~40px) |

### Layout Changes

**1. Message Container**
```
Desktop: max-w-3xl mx-auto px-4
Mobile:  max-w-full px-3
```
Messages use full phone width with 12px side padding. The `max-w-[78%]` on bubbles keeps them from touching screen edges.

**2. Empty State**
```
Desktop: Logo(64px) + Heading(4xl) + Subtitle + Input
Mobile:  Logo(48px) + Heading(2xl)  + Input only (subtitle hidden)
```
Reduces hero height so the input is visible without scrolling on iPhone SE.

**3. Claude Code / Plan Mode**
Currently two toggle pills (hidden on mobile). Replace with a single dropdown or segmented control above the input that shows: "Chat" | "Claude Code" | "Plan". Compact on mobile (3 small pills in a row).

**4. Keyboard Handling**
Add a `visualViewport` resize listener in `chat-interface.tsx`:
- When keyboard opens → scroll the last message into view
- When keyboard opens → input stays at bottom of visible area
- Use `scrollIntoView({ block: "end" })` on the messages container

### Touch Fixes

**1. Message Actions (Regenerate, Fork, Variant)**
Desktop: appear on hover (`group-hover:opacity-100`)
Mobile: always visible with `opacity-40`, full opacity on tap. Alternatively: long-press on a message bubble opens a context menu with Regenerate/Fork/Delete.

**Design choice:** Always-visible approach is simpler and avoids the long-press discoverability problem. Three small icon buttons below the message text, `opacity-40` normally, `opacity-100` on tap.

**2. Code Block Copy Button**
Same fix: always visible on mobile (`opacity-50`), full opacity on tap.

**3. Swipe-to-Go-Back**
From session detail → sessions list: swipe right from left edge triggers `router.back()`. Uses a simple `touchstart/touchend` delta check (>80px horizontal = back). Only active on mobile.

**4. Pull-to-Refresh on Message List**
Pull down at top of message list → reload session messages via `GET /api/sessions/[id]/messages`. Shows a subtle spinner. Only triggers when scrolled to top.

### Input Fixes

**1. Toolbar Reflow**
```
Desktop: [📎] [🎤] [🔊] ........ [CC] [Plan] [Model▼] [Send↑]
Mobile:  [📎] [🎤] [Model▼] [🔊] [Send↑]
         (CC/Plan pills hidden, model selector compact)
```
Collapse to 5 items on mobile. The Model selector keeps its dropdown but uses a compact label (model short name).

**2. Send Button Size**
Desktop: 32px icon button
Mobile: 44px icon button with prominent touch feedback (scale + background flash)

**3. Slash Commands**
The floating dropdown already works on mobile (`bottom-full left-4 right-4`). Keep as-is — it scrolls within itself and doesn't cover the keyboard.

### Voice Input

Already works on mobile via `useSpeechInput`. The microphone button in `chat-input.tsx` is a 7×7 grid — covered by the global `min-h-[44px]` rule. No changes needed beyond verifying it works on iOS Safari (requires HTTPS + user gesture, both satisfied in PWA context).

**Auto-speak** (reading assistant replies aloud): already works via `speak(replyText)` in chat-interface. On mobile, add a subtle "Speaking..." indicator in the topbar so the user knows the assistant is still talking.

### Files

| File | Action | Purpose |
|---|---|---|
| `components/chat/chat-interface.tsx` | Modify | Full-width mobile layout, keyboard handling, pull-to-refresh, swipe-back, scaled hero |
| `components/chat/chat-input.tsx` | Modify | Toolbar reflow, mobile mode selector, send button size, footer hide |
| `components/chat/message-bubble.tsx` | Modify | Always-visible actions on mobile, long-press context menu |
| `components/chat/markdown.tsx` | Modify | Always-visible code copy button on mobile |
| `app/dashboard/sessions/[id]/page.tsx` | Modify | Minor — mobile header padding tweaks |

---

## SP7: Offline Queuing

### Architecture

When the iPhone loses connectivity mid-conversation, the user should still be able to type and "send" messages. They're queued locally and flushed when the network returns.

```
User taps Send while offline:
1. check: navigator.onLine === false
2. Store prompt in localStorage:
   offlineQueue.push({ sessionId, content, timestamp })
3. Show toast: "Queued — will send when online"
4. Add a "pending" indicator next to the queued message bubble
5. When 'online' event fires:
   a. Flush queue: for each queued prompt, POST /api/ai/chat
   b. Stream response into the chat (same as normal send)
   c. Remove from queue on success
   d. Retry once on failure, then show error
```

**Storage: localStorage (not IndexedDB)**
- Queue is small (a few text prompts — <10KB total)
- localStorage is synchronous and simpler
- Cleared on successful send
- Survives page reloads

### Implementation

**`lib/hooks/use-offline-queue.ts`**
```typescript
interface QueuedMessage {
  id: string;
  sessionId: string;
  content: string;
  timestamp: string;
}

export function useOfflineQueue() {
  // Returns { queue, enqueue, dequeue, flush, isFlushing }
  // queue: QueuedMessage[] — current pending messages
  // enqueue(sessionId, content) — add to queue + localStorage
  // dequeue(id) — remove from queue + localStorage
  // flush() — send all queued messages in order
  // isFlushing: boolean — true while flushing
}
```

On mount, the hook reads existing queue from localStorage. On `online` event, it auto-flushes. On `offline` event, it sets a flag that the chat input checks before sending.

**Chat Integration**
In `chat-interface.tsx`, the send function:
1. Checks `navigator.onLine` before POSTing
2. If offline: calls `enqueue(sessionId, content)`, adds a local-only "pending" user message to the chat
3. If online: normal send flow
4. On reconnect (`online` event): calls `flush()`, which sends each queued message and streams the reply

**Service Worker Enhancement**
The SW already has a `StaleWhileRevalidate` strategy for API routes. When the network is down, API fetches return cached responses. The offline queue doesn't need SW changes — it's a client-side queue that waits for real connectivity.

However, the SW can help detect reconnection faster. Add a `message` event in `sw.js` that posts to all clients when the SW detects network restoration (SW fetches succeeding again after a period of failures).

### Edge Cases

- **User closes the app while queued:** Queue persists in localStorage → restored on next open → auto-flush if online
- **Queue contains messages for a deleted session:** Skip and warn on flush
- **Multiple tabs open:** Only the active tab flushes (use `navigator.locks` or a simple flag in localStorage)
- **Very old queued messages (>24h):** Show a confirmation before sending ("You queued this message yesterday. Send it now?")

### Files

| File | Action | Purpose |
|---|---|---|
| `lib/hooks/use-offline-queue.ts` | Create | Queue management (localStorage + flush) |
| `components/chat/chat-interface.tsx` | Modify | Check online before send, enqueue offline, show pending messages |
| `lib/hooks/use-online-status.ts` | Modify | Dispatch custom event on reconnect for the queue to listen |
| `public/sw.js` | Modify | Post message to clients when network restored |

---

## Global Constraints (apply to SP6-SP7)

- No new npm dependencies
- All touch targets ≥44px on mobile
- Offline queue clears on successful send (no unbounded localStorage growth)
- Keyboard handling uses `visualViewport` API (not deprecated `window.innerHeight` hacks)
- `pnpm typecheck` must pass with zero errors
- Chat scroll performance: use `will-change: transform` sparingly, prefer CSS containment
