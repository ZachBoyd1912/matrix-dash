# Matrix Dash — Complete Build Plan

**Handoff to:** Claude Fable
**Project:** `/Users/zach/Desktop/matrix-dash`
**Date:** 11 June 2026
**Type:** Greenfield build (empty directory)

---

## A. What We're Building

A local-first AI command center — a Next.js web app that mimics PewDiePie's Odysseus but with a premium, glassmorphic design and an autonomous memory system that learns from every conversation.

**Core Features:**
1. **Autonomous Memory Bank** — AI extracts facts from every conversation, auto-links them, builds a knowledge graph, injects context silently into every chat
2. **Chat with Multi-Provider AI** — streaming, Claude/OpenAI/Gemini + any OpenAI-compatible endpoint
3. **Persistent Sessions** — timeline, context injection, export/import
4. **Full IDE** — Monaco Editor, file tree, multi-tab
5. **Settings** — model config, toggles, appearance, data management

**Key Differentiators from Odysseus:**
- Glassmorphism design (not flat dark)
- Geist Sans typography (not monospace everywhere)
- Autonomous memory with knowledge graph (not manual list)
- Full IDE (not just document editor)
- GSAP motion design (staggered entrances, hover physics)

---

## B. Tech Stack

| Layer | Package |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Animation | GSAP + ScrollTrigger |
| Editor | @monaco-editor/react |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| AI | Vercel AI SDK (ai, @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/google) |
| State | Zustand |
| Icons | lucide-react |
| Panels | react-resizable-panels |
| CMD Palette | cmdk |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Graph | d3-force + d3-selection |
| Forms | react-hook-form + zod |
| Theme | next-themes |

---

## C. Design System

### Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#050505` | Deepest background |
| `--bg-surface` | `#0d0d0d` | Sidebar, panels |
| `--bg-elevated` | `#141414` | Cards, modals |
| `--bg-overlay` | `#1a1a1a` | Dropdowns, popovers |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Card borders |
| `--border-default` | `rgba(255,255,255,0.1)` | Active borders |
| `--text-primary` | `#e8e8e8` | Main text |
| `--text-secondary` | `#888888` | Labels, hints |
| `--text-muted` | `#555555` | Disabled text |
| `--accent-emerald` | `#34d399` | Primary accent |
| `--accent-amber` | `#fbbf24` | Warning, secondary |
| `--accent-rose` | `#f43f5e` | Danger |
| `--accent-sky` | `#38bdf8` | Info, links |

### Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Display | Geist Sans | 800 | 24px |
| H1 | Geist Sans | 700 | 32px |
| H2 | Geist Sans | 600 | 24px |
| H3 | Geist Sans | 500 | 18px |
| Body | Geist Sans | 400 | 14px |
| Small | Geist Sans | 400 | 12px |
| Code | JetBrains Mono | 400 | 13px |

### Shadows (Antigravity)

```css
--shadow-card: 0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05);
--shadow-elevated: 0 16px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
--shadow-modal: 0 32px 128px rgba(0,0,0,0.7);
--shadow-inset: inset 0 1px 1px rgba(255,255,255,0.06);
```

### Design Archetype

**"Ethereal Glass" + "Z-Axis Cascade"**

- Deepest OLED black backgrounds
- Radial mesh gradient orbs (subtle emerald/teal glows) in background
- Glassmorphic cards with `backdrop-blur-2xl` and `rgba(255,255,255,0.1)` hairlines
- Elements stacked like physical cards with varying depths
- Some cards with slight `-1deg` to `2deg` rotation

---

## D. Database Schema (Drizzle ORM + SQLite)

```typescript
// lib/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ─── MEMORIES (Autonomous Memory System) ───────────────────
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  type: text('type', { enum: ['identity', 'project', 'global', 'lesson'] }).notNull(),
  tags: text('tags').notNull().default(''),
  importance: real('importance').notNull().default(0.5),
  usageCount: integer('usage_count').notNull().default(0),
  source: text('source'),
  embedding: text('embedding'),  // JSON array of floats
  isPinned: integer('is_pinned', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
});

// ─── MEMORY LINKS (auto-generated wiki-links) ─────────────
export const memoryLinks = sqliteTable('memory_links', {
  id: text('id').primaryKey(),
  sourceMemoryId: text('source_memory_id').notNull().references(() => memories.id, { onDelete: 'cascade' }),
  targetMemoryId: text('target_memory_id').notNull().references(() => memories.id, { onDelete: 'cascade' }),
  strength: real('strength').notNull().default(0.5),
  createdAt: text('created_at').notNull(),
});

// ─── NOTES (manual Obsidian-style notes) ──────────────────
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default(''),
  tags: text('tags').notNull().default(''),
  folderId: text('folder_id'),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── NOTE LINKS (manual wiki-links) ──────────────────────
export const noteLinks = sqliteTable('note_links', {
  id: text('id').primaryKey(),
  sourceNoteId: text('source_note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  targetNoteId: text('target_note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  label: text('label'),
});

// ─── SESSIONS ─────────────────────────────────────────────
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('New Session'),
  context: text('context').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── SESSION MESSAGES ─────────────────────────────────────
export const sessionMessages = sqliteTable('session_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  providerId: text('provider_id'),
  modelName: text('model_name'),
  createdAt: text('created_at').notNull(),
});

// ─── AI PROVIDERS ─────────────────────────────────────────
export const aiProviders = sqliteTable('ai_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider', { enum: ['openai', 'anthropic', 'google', 'custom'] }).notNull(),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  baseUrl: text('base_url'),
  defaultModel: text('default_model'),
  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull(),
});

// ─── FILES (IDE) ──────────────────────────────────────────
export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  content: text('content').notNull().default(''),
  language: text('language').notNull().default('plaintext'),
  sessionId: text('session_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── SETTINGS ─────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
```

### FTS5 Virtual Tables

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, tags, content=memories, content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, content, content=notes, content_rowid=rowid
);
```

### FTS5 Triggers

```sql
-- Memories triggers
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;

-- Notes triggers (same pattern)
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
  INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
```

---

## E. Autonomous Memory System (Detailed)

### E1. Extraction Pipeline

Runs automatically after every AI response in chat.

**Flow:**
1. AI finishes responding
2. Background job triggers (non-blocking)
3. Takes last 4 messages as context
4. Sends to cheap model (GPT-4o-mini or Haiku) with extraction prompt
5. Parses JSON response, stores new memories
6. Auto-links to similar existing memories via vector search
7. No user interaction required

**Extraction Prompt:**
```
You are a memory extractor. Given this conversation, extract any new
factual information worth remembering. For each fact output JSON:
{
  "content": "concise fact statement",
  "type": "identity" | "project" | "global" | "lesson",
  "tags": ["keyword1", "keyword2"],
  "importance": 0.0-1.0
}

Rules:
- Only extract NEW information not already known
- Be concise — one sentence per memory
- identity: user preferences, name, habits
- project: tech stack, architecture, decisions
- global: API patterns, documentation, general knowledge
- lesson: errors, debugging notes, "don't do X again"
- If nothing worth remembering, return []
```

### E2. Auto-Linking System

When a new memory is stored:
1. Embed the memory content (local or API)
2. Search `memories` table for top-5 most similar (cosine similarity)
3. If similarity > 0.7, auto-create a `memory_link` entry
4. Graph organically builds over time

### E3. Injection Engine

Runs before every AI response.

**Flow:**
1. User sends message
2. Embed the message
3. Search `memories_fts` (full-text) + vector similarity
4. Select top-10 most relevant memories
5. Inject into system prompt:
```
[Autonomous Memory Context]
The following memories are relevant to this conversation:
- User's name is Zach (identity, used 31x)
- Matrix Dash uses Next.js 15 + SQLite (project, used 12x)
- Never run pnpm build on 8GB RAM (lesson, used 8x)
[/Autonomous Memory Context]
```

**Rules:**
- Max 500 tokens of injected context
- Always inject pinned memories
- Don't inject same type twice
- Track usage_count for used memories

### E4. Consolidation Engine

**Tidy (on-demand):**
1. Find memories with similarity > 0.9
2. Merge: combine content, sum usage_count, keep higher importance
3. Update links to point to merged memory
4. Delete old duplicates

**Decay (daily cron):**
1. `importance = importance * 0.99` per day
2. If importance < 0.1 and not pinned → soft-delete
3. High usage_count memories decay slower

### E5. Memory Types

| Type | Icon | Color | Auto-learned from |
|---|---|---|---|
| Identity | User icon | Emerald | User statements, introductions |
| Project | Folder icon | Sky | Project conversations, file reads |
| Global | Globe icon | Amber | Web research, docs, Q&A |
| Lesson | Alert icon | Rose | Errors, debugging, corrections |

---

## F. Page Layouts

### F1. Dashboard Shell

```
┌──────────────────────────────────────────────────────────┐
│ [Sidebar 240px] │ [Main Content Area]                     │
│                 │                                         │
│ Logo            │  Topbar (search, theme, settings, user) │
│ ─────────       │  ──────────────────────────────────────  │
│ Nav items       │                                         │
│                 │  Content switches based on route         │
│                 │                                         │
│ ─────────       │                                         │
│ Model selector  │                                         │
│ ─────────       │                                         │
│ User            │                                         │
└──────────────────────────────────────────────────────────┘
```

**Sidebar (240px, collapsible to 60px):**
- Background: `--bg-surface` + `backdrop-blur-xl`
- Border-right: `1px solid var(--border-subtle)`
- Logo: Geometric "M" icon + "Matrix Dash" (Geist 800)
- Nav items: Chat, Memory Bank, Sessions, IDE, AI Hub, Settings
- Each with lucide-react icon + label
- Hover: `bg-white/5`, text turns emerald
- Active: `bg-white/8`, left border 2px emerald
- Model selector: collapsible list of configured providers
- User: avatar + name + settings gear

**Topbar (56px, sticky):**
- Left: current page title
- Right: theme toggle, notifications, user dropdown
- Background: `--bg-surface` + `backdrop-blur-xl`

### F2. Chat View

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│              M  (logo mark)                            │
│           Matrix Dash                                  │
│         "Your AI command center."                      │
│                                                        │
│     ┌──────────────────────────────────────────┐      │
│     │ Message Matrix Dash...                    │      │
│     │                                          │      │
│     │ [🎤] [📎] [🔍]   [Provider ▾] [Agent|Chat] [↑]│      │
│     └──────────────────────────────────────────┘      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Chat Input Bar:**
- Max-width: 720px, centered
- Background: `--bg-elevated` + `backdrop-blur-xl`
- Border: `1px solid var(--border-subtle)`
- Border-radius: `--radius-xl`
- Row 1: Auto-expanding textarea (48px-200px)
- Row 2: Tool buttons | Provider selector | Agent/Chat toggle + Send
- Send: emerald circle, disabled when empty, `scale(0.95)` on press

**During Chat:**
- User messages: right-aligned, emerald-tinted bubble
- Assistant messages: left-aligned, dark glass bubble
- Streaming: character-by-character with cursor blink
- Code blocks: dark with syntax highlighting + copy button
- Tool calls: expandable cards

### F3. Memory Bank

```
┌──────────────────────────────────────────────────────────┐
│ [Search memories...] [All|Identity|Project|Global|Lesson] │
│ [Graph View] [New Memory]                                 │
├──────────────────────────────────────┬───────────────────┤
│ Memory List / Graph View             │ Memory Detail     │
│                                      │                   │
│ ┌──────────────────────────────┐    │ Content: ...      │
│ │ User's name is Zach.         │    │ Type: identity    │
│ │ [pinned] [identity] · 31x   │    │ Tags: user, name  │
│ └──────────────────────────────┘    │ Importance: 0.95  │
│                                      │ Used: 31 times    │
│ ┌──────────────────────────────┐    │ Created: 5d ago   │
│ │ Matrix Dash uses Next.js 15  │    │                   │
│ │ [project] · 12x              │    │ [Edit] [Pin] [Del]│
│ └──────────────────────────────┘    │                   │
│                                      │ Linked:           │
│ [Tidy] [Export] [Import]            │ → Drizzle uses    │
│                                      │   better-sqlite3  │
└──────────────────────────────────────┴───────────────────┘
```

**Graph View:**
- D3 force-directed graph
- Nodes: memories (sized by importance, colored by type)
- Edges: auto-links (width by strength)
- Click node → opens memory detail
- Hover → content tooltip
- Zoom/pan
- Filter by type toggles

### F4. Sessions

```
┌────────────────────────────────────────────────────────┐
│ [Search] [New Session] [Export]                        │
├────────────────────────────┬───────────────────────────┤
│ Session Timeline            │ Session Detail             │
│                            │                           │
│ ┌─────────────────────┐   │ Session Name              │
│ │ Session Name        │   │ Context: {...}            │
│ │ 12 messages · 2h ago│   │                           │
│ └─────────────────────┘   │ [Messages...]             │
│                            │                           │
│ ┌─────────────────────┐   │ [AI Input]                │
│ │ Another Session     │   │                           │
│ └─────────────────────┘   │                           │
└────────────────────────────┴───────────────────────────┘
```

### F5. IDE

```
┌────────────────────────────────────────────────────────┐
│ [File Tree]  [Editor Tabs]                              │
├──────────────┼─────────────────────────────────────────┤
│ 📁 src       │ [file1.ts] [file2.ts] [file3.py]        │
│   📄 index.ts│                                         │
│   📄 app.ts  │  Monaco Editor                          │
│ 📁 lib       │                                         │
│   📄 utils.ts│  // Syntax highlighting                 │
│ 📄 main.ts   │  // Intellisense                        │
│              │  // Multi-cursor                        │
├──────────────┴─────────────────────────────────────────┤
│ Status bar: language, line/col, encoding                │
└────────────────────────────────────────────────────────┘
```

### F6. Settings

```
┌────────────────────────────────────────────────────────┐
│ Toggle on/off visibility of tools and modules.          │
├──────────┬─────────────────────────────────────────────┤
│ Settings │  [Section Content]                           │
│ Nav      │                                             │
│          │  Add Models:                                 │
│ Add Models│  ┌─────────────────────────────────────┐   │
│ AI Defaul│  │ LOCAL: URL + API key + Test/Add      │   │
│ Search   │  │ API: URL + provider + key + Test/Add │   │
│ Memory   │  │ Added: DeepSeek, OpenRouter...       │   │
│ Integrat.│  └─────────────────────────────────────┘   │
│ Email    │                                             │
│ Appearan.│                                             │
│ Shortcuts│                                             │
│ Account  │                                             │
│ ──────── │                                             │
│ Agent Tls│                                             │
│ System   │                                             │
└──────────┴─────────────────────────────────────────────┘
```

---

## G. Motion Design (GSAP)

### Page Transitions
- Elements: `translateY(12px) opacity-0` → `translateY(0) opacity-100`
- Duration: 400ms, stagger: 50ms
- Easing: `cubic-bezier(0.32, 0.72, 0, 1)`

### Sidebar
- Active indicator slides (not jumps)
- Duration: 200ms, ease-out

### Chat Messages
- User: slide in from right (`translateX(20px)` → `0`)
- Assistant: slide in from left (`translateX(-20px)` → `0`)
- Duration: 300ms
- Streaming: subtle scale pulse per word

### Modals
- Open: backdrop 200ms fade, content 300ms scale 0.95→1.0
- Close: reverse, 200ms

### Hover States
- Cards: `translateY(-2px)` + border glow, 200ms
- Buttons: `scale(0.98)` on press, 100ms
- Nav items: bg transition, 150ms

### Reduced Motion
- All respect `prefers-reduced-motion: reduce`
- When reduced: instant state changes

---

## H. Responsive Breakpoints

| Breakpoint | Adaptation |
|---|---|
| `< 768px` | Mobile: sidebar hidden (hamburger), bottom nav, full-width panels |
| `768-1024px` | Tablet: sidebar icon-only, panels stack |
| `> 1024px` | Desktop: full sidebar, resizable panels |
| `> 1440px` | Wide: extra whitespace |

---

## I. Component List

### Layout
- `sidebar.tsx` — glassmorphism sidebar with nav
- `topbar.tsx` — sticky top bar
- `dashboard-shell.tsx` — main layout orchestrator
- `command-palette.tsx` — CMD+K palette

### Chat
- `chat-interface.tsx` — full chat UI
- `chat-input.tsx` — floating input bar
- `message-bubble.tsx` — user/assistant bubbles
- `provider-selector.tsx` — dropdown
- `model-selector.tsx` — model picker

### Memory Bank
- `memory-card.tsx` — list card
- `memory-detail.tsx` — detail panel
- `memory-graph.tsx` — D3 force graph
- `memory-extraction.tsx` — extraction status (optional UI)

### Notes
- `note-card.tsx` — list card
- `note-editor.tsx` — markdown editor
- `backlinks-panel.tsx` — backlinks
- `wiki-link.tsx` — inline link renderer

### IDE
- `monaco-editor.tsx` — wrapper
- `file-tree.tsx` — explorer
- `editor-tabs.tsx` — tab bar

### Sessions
- `session-card.tsx` — timeline card
- `session-detail.tsx` — detail view

### Settings
- `ai-provider-form.tsx` — add/edit provider
- `settings-card.tsx` — generic card
- `toggle-switch.tsx` — iOS-style toggle

### UI (shadcn)
- button, card, dialog, input, label, separator, sheet, tabs, toast, tooltip, dropdown-menu, command, badge, avatar, scroll-area, select, switch, textarea

---

## J. Directory Structure

```
matrix-dash/
├── package.json
├── tsconfig.json
├── next.config.ts
├── drizzle.config.ts
├── components.json
├── .env.local
│
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   │
│   ├── dashboard/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── memory-bank/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   └── new/page.tsx
│   │   ├── sessions/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── ide/
│   │   │   └── page.tsx
│   │   ├── ai-chat/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── general/page.tsx
│   │       ├── ai-providers/page.tsx
│   │       ├── memory-skills/page.tsx
│   │       ├── integrations/page.tsx
│   │       ├── appearance/page.tsx
│   │       └── system/page.tsx
│   │
│   └── api/
│       ├── memories/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── memory-links/route.ts
│       ├── memory-extract/route.ts
│       ├── memory-inject/route.ts
│       ├── notes/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── note-links/route.ts
│       ├── search/route.ts
│       ├── sessions/
│       │   ├── route.ts
│       │   ├── [id]/route.ts
│       │   └── [id]/messages/route.ts
│       ├── files/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── settings/
│       │   ├── route.ts
│       │   └── [key]/route.ts
│       └── ai/
│           └── chat/route.ts
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── chat/
│   ├── memory-bank/
│   ├── notes/
│   ├── ide/
│   ├── sessions/
│   └── settings/
│
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── migrations/
│   ├── ai/
│   │   ├── registry.ts
│   │   ├── chat.ts
│   │   ├── extraction.ts
│   │   └── injection.ts
│   ├── stores/
│   │   ├── use-settings.ts
│   │   ├── use-memories.ts
│   │   ├── use-notes.ts
│   │   ├── use-sessions.ts
│   │   └── use-ide.ts
│   ├── hooks/
│   │   ├── use-debounce.ts
│   │   ├── use-auto-save.ts
│   │   └── use-shortcuts.ts
│   └── utils/
│       ├── cn.ts
│       ├── crypto.ts
│       └── db-path.ts
│
└── types/
    ├── memory.ts
    ├── note.ts
    ├── session.ts
    ├── file.ts
    ├── ai-provider.ts
    └── settings.ts
```

---

## K. DB Client Singleton

```typescript
// lib/db/client.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;

  const dbDir = path.join(process.env.HOME || '', 'MatrixDash');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, 'matrix.db');
  const sqlite = new Database(dbPath, { timeout: 5000 });
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  _db = drizzle(sqlite, { schema });
  migrate(_db, { migrationsFolder: './lib/db/migrations' });

  return _db;
}
```

---

## L. AI Provider Registry

```typescript
// lib/ai/registry.ts
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { getDb } from '@/lib/db/client';
import { aiProviders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function decrypt(key: string): string {
  // Web Crypto API decryption
  return Buffer.from(key, 'base64').toString('utf-8');
}

export async function getActiveProvider() {
  const db = getDb();
  const provider = db.select().from(aiProviders)
    .where(eq(aiProviders.isActive, true))
    .get();
  if (!provider) throw new Error('No active AI provider configured');
  return provider;
}

export function createProviderInstance(provider: typeof aiProviders.$inferSelect) {
  const apiKey = decrypt(provider.apiKeyEncrypted);

  switch (provider.provider) {
    case 'anthropic':
      return {
        sdk: createAnthropic({ apiKey }),
        model: provider.defaultModel || 'claude-sonnet-4-20250514'
      };
    case 'openai':
      return {
        sdk: createOpenAI({ apiKey }),
        model: provider.defaultModel || 'gpt-4o'
      };
    case 'google':
      return {
        sdk: createGoogle({ apiKey }),
        model: provider.defaultModel || 'gemini-2.5-pro'
      };
    case 'custom':
      return {
        sdk: createOpenAI({ apiKey, baseURL: provider.baseUrl }),
        model: provider.defaultModel || ''
      };
    default:
      throw new Error(`Unknown provider type: ${provider.provider}`);
  }
}
```

---

## M. Chat API Route

```typescript
// app/api/ai/chat/route.ts
import { streamText } from 'ai';
import { getDb } from '@/lib/db/client';
import { getActiveProvider, createProviderInstance } from '@/lib/ai/registry';
import { injectMemories } from '@/lib/ai/injection';

export async function POST(req: Request) {
  const { messages, providerId } = await req.json();

  const db = getDb();
  const provider = providerId
    ? db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).get()
    : await getActiveProvider();

  if (!provider) return new Response('Provider not found', { status: 404 });

  const instance = createProviderInstance(provider);

  // Inject relevant memories into system context
  const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
  const memoryContext = lastUserMessage
    ? await injectMemories(lastUserMessage.content)
    : '';

  const systemMessage = memoryContext
    ? [{ role: 'system' as const, content: memoryContext }, ...messages]
    : messages;

  const result = streamText({
    model: instance.sdk(instance.model),
    messages: systemMessage,
    onFinish: async () => {
      // Trigger memory extraction in background
      extractMemories(messages).catch(console.error);
    },
  });

  return result.toTextStreamResponse();
}
```

---

## N. Memory Extraction Service

```typescript
// lib/ai/extraction.ts
import { getDb } from '@/lib/db/client';
import { memories, memoryLinks } from '@/lib/db/schema';
import { createProviderInstance, getActiveProvider } from './registry';
import { v4 as uuid } from 'uuid';

interface ExtractedMemory {
  content: string;
  type: 'identity' | 'project' | 'global' | 'lesson';
  tags: string[];
  importance: number;
}

export async function extractMemories(messages: any[]) {
  const provider = await getActiveProvider();
  const instance = createProviderInstance(provider);

  const { generateText } = await import('ai');

  const { text } = await generateText({
    model: instance.sdk(instance.model),
    prompt: `You are a memory extractor. Given this conversation, extract any new
factual information worth remembering. For each fact output JSON array:
[{"content": "concise fact", "type": "identity|project|global|lesson",
"tags": ["kw1"], "importance": 0.5}]

Rules: Only extract NEW info. Be concise. One sentence per memory.
If nothing worth remembering, return [].

Conversation:
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`,
  });

  try {
    const extracted: ExtractedMemory[] = JSON.parse(text);
    const db = getDb();

    for (const mem of extracted) {
      if (!mem.content || !mem.type) continue;

      const id = uuid();
      db.insert(memories).values({
        id,
        content: mem.content,
        type: mem.type,
        tags: mem.tags?.join(',') || '',
        importance: mem.importance || 0.5,
        createdAt: new Date().toISOString(),
      }).run();

      // Auto-link to similar memories
      await autoLink(id, mem.content);
    }
  } catch (e) {
    console.error('Memory extraction parse error:', e);
  }
}

async function autoLink(memoryId: string, content: string) {
  // FTS5 search for similar memories
  const db = getDb();
  const similar = db.all(`
    SELECT rowid, rank FROM memories_fts
    WHERE memories_fts MATCH ?
    ORDER BY rank LIMIT 5
  `, [content.replace(/['"]/g, '')]) as any[];

  for (const sim of similar) {
    const targetId = db.get(
      'SELECT id FROM memories WHERE rowid = ?', [sim.rowid]
    ) as any;
    if (targetId && targetId.id !== memoryId) {
      const linkId = uuid();
      db.insert(memoryLinks).values({
        id: linkId,
        sourceMemoryId: memoryId,
        targetMemoryId: targetId.id,
        strength: Math.min(1, Math.abs(sim.rank) / 10),
        createdAt: new Date().toISOString(),
      }).run();
    }
  }
}
```

---

## O. Memory Injection Service

```typescript
// lib/ai/injection.ts
import { getDb } from '@/lib/db/client';
import { memories } from '@/lib/db/schema';
import { desc, sql, eq } from 'drizzle-orm';

export async function injectMemories(userMessage: string): Promise<string> {
  const db = getDb();

  // FTS5 search for relevant memories
  const ftsResults = db.all(`
    SELECT rowid, rank FROM memories_fts
    WHERE memories_fts MATCH ?
    ORDER BY rank LIMIT 10
  `, [userMessage.replace(/['"]/g, '')]) as any[];

  // Get pinned memories always
  const pinned = db.select().from(memories)
    .where(eq(memories.isPinned, true))
    .all();

  // Get FTS results
  const ftsMemories = ftsResults
    .map((r: any) => {
      const mem = db.get('SELECT * FROM memories WHERE rowid = ?', [r.rowid]) as any;
      return mem;
    })
    .filter(Boolean);

  // Merge: pinned first, then FTS, deduplicate
  const seen = new Set<string>();
  const all = [...pinned, ...ftsMemories].filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  }).slice(0, 10);

  if (all.length === 0) return '';

  // Build context
  const context = all.map(m =>
    `- ${m.content} (${m.type}, used ${m.usage_count}x)`
  ).join('\n');

  // Update usage counts
  for (const m of all) {
    db.update(memories)
      .set({
        usageCount: m.usage_count + 1,
        lastUsedAt: new Date().toISOString(),
      })
      .where(eq(memories.id, m.id))
      .run();
  }

  return `[Autonomous Memory Context]\n${context}\n[/Autonomous Memory Context]`;
}
```

---

## P. Implementation Phases

### Phase 1: Scaffold & DB
1. Create Next.js project
2. Install all deps
3. Init shadcn, add components
4. Create Drizzle schema (all tables)
5. Create DB client singleton
6. Create utility files (cn, crypto, db-path)
7. Generate migrations
8. `pnpm typecheck` passes

### Phase 2: Dashboard Shell
1. Sidebar with glassmorphism
2. Topbar
3. Resizable panels
4. CMD+K palette
5. Theme toggle
6. All page stubs
7. GSAP page entrance animations

### Phase 3: Chat + Multi-Provider AI
1. AI provider registry
2. Chat API route with streaming
3. Chat UI (input bar, messages, streaming)
4. Provider/model selector
5. Settings: Add Models section

### Phase 4: Autonomous Memory
1. Memory extraction service
2. Memory injection service
3. Auto-linking service
4. Consolidation/tidy service
5. Memory API routes (CRUD)
6. Memory Bank UI (list, detail, graph)
7. Settings: Memory & Skills section

### Phase 5: Notes + Sessions
1. Notes CRUD + wiki-links
2. Notes editor with preview
3. Backlinks panel
4. Sessions CRUD + timeline
5. Session detail + messages

### Phase 6: IDE
1. File tree
2. Monaco editor wrapper
3. Multi-tab support
4. File CRUD API

### Phase 7: Settings (All Sections)
1. AI Defaults
2. Search
3. Integrations
4. Appearance (toggles)
5. Shortcuts
6. Account
7. Agent Tools
8. System (backup/wipe)

### Phase 8: Polish
1. GSAP hover states
2. Responsive design
3. Error boundaries
4. Empty states
5. Loading skeletons
6. Keyboard shortcuts

---

## Q. Acceptance Criteria

- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm dev` starts on port 3000
- [ ] Dashboard sidebar navigation works
- [ ] Chat streams from configured provider
- [ ] Memory extraction runs after AI response
- [ ] Memories auto-link to similar existing memories
- [ ] Memory graph renders with force-directed layout
- [ ] Memory injection works (memories appear in AI context)
- [ ] Notes CRUD + wiki-links work
- [ ] IDE Monaco editor opens/saves files
- [ ] Settings: add/edit/delete providers
- [ ] Settings: toggle sidebar/chat elements
- [ ] Theme toggle persists
- [ ] DB at ~/MatrixDash/matrix.db persists across restarts
- [ ] GSAP animations play on page load
- [ ] Responsive at 768px and 1024px breakpoints

---

## R. Skills to Activate

| Skill | Phase |
|---|---|
| @antigravity-design-expert | Phase 2 — glassmorphism, GSAP |
| @senior-frontend | Phase 1 — scaffolding |
| @ai-engineer | Phase 3, 4 — AI + memory |
| @shadcn | All — components |
| @tailwind-patterns | All — styling |
| @database | Phase 1 — Drizzle schema |
| @frontend-design | Phase 2 — visual design |
| @high-end-visual-design | Phase 2 — premium aesthetic |
