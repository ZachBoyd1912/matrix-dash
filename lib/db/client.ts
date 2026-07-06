import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { getDbPath } from "@/lib/utils/db-path";

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  importance REAL NOT NULL DEFAULT 0.5,
  usage_count INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  embedding TEXT,
  is_pinned INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS memory_links (
  id TEXT PRIMARY KEY,
  source_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  target_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  strength REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  folder_id TEXT,
  is_favorite INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_links (
  id TEXT PRIMARY KEY,
  source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  label TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'New Session',
  context TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provider_id TEXT,
  model_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  base_url TEXT,
  default_model TEXT,
  is_active INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'plaintext',
  session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  folder TEXT NOT NULL DEFAULT 'inbox',
  from_addr TEXT NOT NULL DEFAULT '',
  to_addr TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_read INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'info',
  href TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  is_done INTEGER DEFAULT 0,
  due_at TEXT,
  remind_at TEXT,
  reminded INTEGER DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal',
  kind TEXT NOT NULL DEFAULT 'task',
  kanban_status TEXT NOT NULL DEFAULT 'backlog',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  kanban_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  purpose TEXT NOT NULL,
  frontend TEXT,
  backend TEXT,
  database TEXT,
  badge TEXT NOT NULL,
  path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  cron TEXT NOT NULL,
  is_enabled INTEGER DEFAULT 1,
  last_run_at TEXT,
  last_result TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 465,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  use_tls INTEGER DEFAULT 1,
  triage_enabled INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  last_sync_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#34d399',
  caldav_url TEXT,
  caldav_user TEXT,
  caldav_pass_encrypted TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  uid TEXT,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  all_day INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'file',
  data_url TEXT,
  extracted_text TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  token TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  event TEXT NOT NULL DEFAULT '*',
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL DEFAULT '',
  data_url TEXT NOT NULL,
  provider TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  last_opened TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  redirect_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS github_connections (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'GitHub',
  access_token TEXT NOT NULL,
  github_user TEXT NOT NULL,
  avatar_url TEXT,
  scopes TEXT NOT NULL DEFAULT 'repo,user,notifications',
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS github_repos (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  stars INTEGER DEFAULT 0,
  language TEXT,
  is_private INTEGER DEFAULT 0,
  default_branch TEXT DEFAULT 'main',
  html_url TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS github_issues (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  state TEXT NOT NULL,
  labels TEXT,
  assignee TEXT,
  html_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS github_pull_requests (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  state TEXT NOT NULL,
  author TEXT,
  base_ref TEXT,
  head_ref TEXT,
  html_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  merged_at TEXT
);

CREATE TABLE IF NOT EXISTS slack_workspaces (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'Slack',
  access_token TEXT NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  bot_user_id TEXT,
  scopes TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS slack_channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES slack_workspaces(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  name TEXT NOT NULL,
  topic TEXT,
  member_count INTEGER,
  is_private INTEGER DEFAULT 0,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drive_connections (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'Google Drive',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  google_email TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'drive.readonly',
  is_active INTEGER DEFAULT 1,
  token_expires TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drive_docs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES drive_connections(id) ON DELETE CASCADE,
  drive_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  parent_folder TEXT,
  extracted_text TEXT,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id TEXT PRIMARY KEY,
  google_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gmail_connections (
  id TEXT PRIMARY KEY,
  google_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires TEXT NOT NULL,
  imap_enabled INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_links_source ON memory_links(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_links_target ON memory_links(target_memory_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, tags, content=memories, content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, content, content=notes, content_rowid=rowid
);

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

CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  name, description, instructions, content=skills, content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, description, instructions) VALUES (new.rowid, new.name, new.description, new.instructions);
END;
CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, description, instructions) VALUES('delete', old.rowid, old.name, old.description, old.instructions);
END;
CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, description, instructions) VALUES('delete', old.rowid, old.name, old.description, old.instructions);
  INSERT INTO skills_fts(rowid, name, description, instructions) VALUES (new.rowid, new.name, new.description, new.instructions);
END;
`;

type DB = BetterSQLite3Database<typeof schema>;

// Cached on globalThis so Next.js HMR doesn't leak connections.
const g = globalThis as unknown as {
  __matrixSqlite?: Database.Database;
  __matrixDb?: DB;
};

export function getSqlite(): Database.Database {
  if (g.__matrixSqlite) {
    ensureIntegrationTables(g.__matrixSqlite);
    return g.__matrixSqlite;
  }
  const sqlite = new Database(getDbPath(), { timeout: 5000 });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(INIT_SQL);
  runColumnMigrations(sqlite);
  ensureIntegrationTables(sqlite);
  seedWelcomeEmail(sqlite);
  seedProjects(sqlite);
  backfillSkillsFts(sqlite);
  g.__matrixSqlite = sqlite;
  return sqlite;
}

/** Idempotently create integration tables that may not exist yet (hot-reload safe). */
function ensureIntegrationTables(sqlite: Database.Database) {
  const hasTable = (name: string) => {
    const row = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(name) as { name: string } | undefined;
    return !!row;
  };
  const exec = (ddl: string, name: string) => {
    if (!hasTable(name)) sqlite.exec(ddl);
  };

  exec(
    `CREATE TABLE oauth_states (
      id TEXT PRIMARY KEY, state TEXT NOT NULL UNIQUE, provider TEXT NOT NULL,
      redirect_to TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    "oauth_states"
  );

  exec(
    `CREATE TABLE github_connections (
      id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT 'GitHub', access_token TEXT NOT NULL,
      github_user TEXT NOT NULL, avatar_url TEXT, scopes TEXT NOT NULL DEFAULT 'repo,user,notifications',
      is_active INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_synced_at TEXT
    )`,
    "github_connections"
  );

  exec(
    `CREATE TABLE github_repos (
      id TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL, owner TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
      stars INTEGER DEFAULT 0, language TEXT, is_private INTEGER DEFAULT 0,
      default_branch TEXT DEFAULT 'main', html_url TEXT NOT NULL, synced_at TEXT NOT NULL
    )`,
    "github_repos"
  );

  exec(
    `CREATE TABLE github_issues (
      id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, repo_full_name TEXT NOT NULL,
      issue_number INTEGER NOT NULL, title TEXT NOT NULL, body TEXT, state TEXT NOT NULL,
      labels TEXT, assignee TEXT, html_url TEXT, created_at TEXT NOT NULL, updated_at TEXT
    )`,
    "github_issues"
  );

  exec(
    `CREATE TABLE github_pull_requests (
      id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL, title TEXT NOT NULL, body TEXT, state TEXT NOT NULL,
      author TEXT, base_ref TEXT, head_ref TEXT, html_url TEXT,
      created_at TEXT NOT NULL, updated_at TEXT, merged_at TEXT
    )`,
    "github_pull_requests"
  );

  exec(
    `CREATE TABLE slack_workspaces (
      id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT 'Slack', access_token TEXT NOT NULL,
      team_id TEXT NOT NULL, team_name TEXT NOT NULL, bot_user_id TEXT, scopes TEXT NOT NULL,
      is_active INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    "slack_workspaces"
  );

  exec(
    `CREATE TABLE slack_channels (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES slack_workspaces(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL, name TEXT NOT NULL, topic TEXT, member_count INTEGER,
      is_private INTEGER DEFAULT 0, synced_at TEXT NOT NULL
    )`,
    "slack_channels"
  );

  exec(
    `CREATE TABLE drive_connections (
      id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT 'Google Drive', access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL, google_email TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT 'drive.readonly', is_active INTEGER DEFAULT 1,
      token_expires TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    "drive_connections"
  );

  exec(
    `CREATE TABLE drive_docs (
      id TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES drive_connections(id) ON DELETE CASCADE,
      drive_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL,
      parent_folder TEXT, extracted_text TEXT, synced_at TEXT NOT NULL
    )`,
    "drive_docs"
  );

  exec(
    `CREATE TABLE google_calendar_connections (
      id TEXT PRIMARY KEY, google_email TEXT NOT NULL, access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL, token_expires TEXT NOT NULL,
      is_active INTEGER DEFAULT 1, created_at TEXT NOT NULL
    )`,
    "google_calendar_connections"
  );

  exec(
    `CREATE TABLE gmail_connections (
      id TEXT PRIMARY KEY, google_email TEXT NOT NULL, access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL, token_expires TEXT NOT NULL,
      imap_enabled INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1, created_at TEXT NOT NULL
    )`,
    "gmail_connections"
  );
}

/** Idempotently add columns introduced after a DB may already exist. */
function runColumnMigrations(sqlite: Database.Database) {
  const ensureColumn = (table: string, column: string, ddl: string) => {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };
  ensureColumn("emails", "account_id", "account_id TEXT");
  ensureColumn("emails", "message_id", "message_id TEXT");
  ensureColumn("emails", "tags", "tags TEXT NOT NULL DEFAULT ''");
  ensureColumn("emails", "summary", "summary TEXT");
  ensureColumn("session_messages", "blocks", "blocks TEXT");
  // Kanban columns on tasks table
  ensureColumn("tasks", "kanban_status", "kanban_status TEXT NOT NULL DEFAULT 'backlog'");
  ensureColumn("tasks", "project_id", "project_id TEXT REFERENCES projects(id) ON DELETE SET NULL");
  ensureColumn("tasks", "kanban_order", "kanban_order INTEGER NOT NULL DEFAULT 0");
  ensureColumn("tasks", "kind", "kind TEXT NOT NULL DEFAULT 'task'");

  // Remap old kanban column names to new ones
  const remap: [string, string][] = [
    ["todo", "planned"],
    ["review", "developed"],
    ["done", "completed"],
    ["ab-test", "completed"],
  ];
  for (const [oldVal, newVal] of remap) {
    sqlite.exec(`UPDATE tasks SET kanban_status = '${newVal}' WHERE kanban_status = '${oldVal}'`);
  }
}

function seedWelcomeEmail(sqlite: Database.Database) {
  const count = sqlite.prepare("SELECT COUNT(*) AS c FROM emails").get() as { c: number };
  if (count.c > 0) return;
  sqlite
    .prepare(
      `INSERT INTO emails (id, folder, from_addr, to_addr, subject, body, is_read, is_starred, created_at)
       VALUES (?, 'inbox', 'matrix@dash.local', 'you@dash.local', ?, ?, 0, 1, ?)`
    )
    .run(
      crypto.randomUUID(),
      "Welcome to your local mailbox",
      "This inbox lives entirely in ~/MatrixDash/matrix.db.\n\nUse Compose to draft messages, star what matters, and organize across Inbox, Sent, Drafts, and Trash. Connect a real provider later from Settings → Email.",
      new Date().toISOString()
    );
}

function seedProjects(sqlite: Database.Database) {
  const count = sqlite.prepare("SELECT COUNT(*) AS c FROM projects").get() as { c: number };
  if (count.c > 0) return;
  const now = new Date().toISOString();
  const stmt = sqlite.prepare(`
    INSERT INTO projects (id, name, description, purpose, frontend, backend, database, badge, path, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);
  const projects: [
    string,
    string,
    string,
    string,
    string | null,
    string | null,
    string | null,
    string,
    string | null,
    string,
    string,
  ][] = [
    [
      "antigravity-awesome-skills",
      "antigravity-awesome-skills",
      "Open-source ecosystem of 1,465+ reusable agent prompt skill packages for Claude, Gemini, and Cursor AI coding assistants featuring a community CLI installer and companion skill discovery web app.",
      "Monetizes through platform ecosystem lock-in effects, premium skill distribution marketplaces, and enterprise catalog licensing agreements. Solves fragmented AI agent capability discovery across diverse developer communities worldwide.",
      "React 19, Vite, Tailwind CSS v4, Framer Motion",
      "Supabase BaaS, Python validation tooling",
      "Supabase PostgreSQL",
      "platform",
      "/Users/zach/Desktop/antigravity-awesome-skills",
      now,
      now,
    ],
    [
      "bolt-new-original",
      "bolt.new original",
      "Browser-based AI agent from StackBlitz generating full-stack web applications entirely from natural language descriptions running inside secure WebContainer sandbox environments with real-time live preview.",
      "Monetizes through SaaS subscription tiers and usage-based compute pricing for AI-powered app generation. Solves the fundamental accessibility gap between idea conception and functional software prototype globally.",
      "Remix v2, Vite, UnoCSS, CodeMirror",
      "Cloudflare Pages, AI SDK (OpenAI)",
      "None (ephemeral / Cloudflare KV)",
      "platform",
      "/Users/zach/Desktop/bolt.new original",
      now,
      now,
    ],
    [
      "bolt-new-custom",
      "bolt.new-custom",
      "Custom branded fork of bolt.new called Matrix Builder with full Firebase backend, multi-provider AI model integrations including Google and OpenAI, PostHog analytics, and comprehensive telemetry systems.",
      "Monetizes through Firebase service resale margins and custom enterprise deployment contracts for AI-generated applications. Solves the critical production gap between AI prototypes and real-world shippable software.",
      "Remix v2, React 18, Vite, UnoCSS, Radix UI",
      "Firebase Functions, Express, AI SDK",
      "Firestore, Realtime DB, SQLite",
      "fullstack",
      "/Users/zach/Desktop/bolt.new-custom",
      now,
      now,
    ],
    [
      "bolt-projects",
      "Bolt-Projects",
      "Collection of nineteen individually exported bolt.new AI-generated Vite React frontend applications each containing its own project files, dependencies, and complete build history for future reuse.",
      "Demonstrates rapid AI-assisted frontend development velocity as portfolio proof-of-work for global freelance and agency client acquisition. Serves as reusable component library accelerating future project bootstrapping.",
      "React 18, Vite, Tailwind CSS, GSAP, Framer Motion",
      null,
      null,
      "frontend",
      "/Users/zach/Desktop/Bolt-Projects",
      now,
      now,
    ],
    [
      "fansly-ai-automation",
      "fansly_ai_automation",
      "Multi-account AI-powered NSFW creator automation platform managing chat conversations, content scheduling, subscriber analytics, and earnings tracking through integrated Gemini and DeepSeek language models.",
      "Monetizes through recurring SaaS subscription revenue models, per-creator commission percentages, and white-label platform licensing for larger agencies. Solves creator burnout by fully automating fan engagement at global scale.",
      "Next.js 16, React 19, Tailwind CSS v4, TanStack Query",
      "Next.js API routes, NextAuth v5, Drizzle ORM",
      "Turso (libSQL / SQLite)",
      "fullstack",
      "/Users/zach/Desktop/fansly_ai_automation",
      now,
      now,
    ],
    [
      "forevergrateful",
      "forevergrateful",
      "Immersive 3D interactive brand artist website built with Three.js featuring a detailed animated bear character model with GSAP-driven scroll animations, lookbook gallery, and newsletter signup system.",
      "Monetizes as premium agency showcase portfolio piece and brand licensing asset for merchandise or NFT conversion funnels. Solves the need for memorable digital brand identity in saturated global attention markets.",
      "React 18, Vite, Three.js (r3f/drei), GSAP",
      null,
      null,
      "frontend",
      "/Users/zach/Desktop/forevergrateful",
      now,
      now,
    ],
    [
      "matrix-dash",
      "matrix-dash",
      "Comprehensive all-in-one personal productivity command center with AI copilot featuring autonomous memory management, email and calendar sync, file management, task scheduling, IDE integration, and system monitoring.",
      "Monetizes through paid SaaS subscription model with premium feature tiers and local-first enterprise tooling deployment licenses. Solves personal information fragmentation across dozens of disconnected digital services globally.",
      "Next.js 15, React 19, Tailwind CSS v4, GSAP, D3.js, Radix UI",
      "Next.js API routes, Drizzle ORM, AI SDK (multi-provider)",
      "SQLite (better-sqlite3 via Drizzle)",
      "fullstack",
      "/Users/zach/Desktop/matrix-dash",
      now,
      now,
    ],
    [
      "odysseus",
      "odysseus",
      "Self-hosted open-source AI assistant platform with multi-LLM chat, RAG vector document search, calendar and email integration, code execution sandbox, MCP protocol support, and PWA companion phone app.",
      "Monetizes through managed enterprise hosting tiers, white-label deployment services, and premium on-premise support and maintenance contracts. Solves data sovereignty privacy concerns of cloud-only AI for security-conscious users.",
      "Vanilla JS SPA, PWA service workers",
      "Python FastAPI, SQLAlchemy, ChromaDB",
      "SQLite, ChromaDB (vector embeddings)",
      "fullstack",
      "/Users/zach/Desktop/odysseus",
      now,
      now,
    ],
    [
      "youtube-pipeline",
      "youtube-pipeline",
      "Fully automated staged YouTube content production pipeline handling topic research via Gemini AI, script writing, OpenAI asset generation, YouTube platform upload, and scheduled weekly analytics reporting.",
      "Monetizes through managed automated channel network agency services and recurring content production subscription packages for global creators. Solves labor-intensive content bottleneck in consistent high-volume YouTube publishing.",
      null,
      "Python Flask, Google APIs, Gemini, OpenAI, Twilio",
      "Google Sheets (lightweight operational store)",
      "automation",
      "/Users/zach/Desktop/youtube-pipeline",
      now,
      now,
    ],
    [
      "make-blueprints-ready",
      "make_blueprints_ready",
      "Set of five structured JSON blueprint configuration files defining Make.com automation workflow scenarios for daily briefing, content editing, asset generation, scheduled uploading, and weekly analytics.",
      "Serves as deployable reusable automation templates for rapid marketing operations infrastructure across multiple distribution channels. Solves repetitive manual workflow inefficiencies in global multi-platform content distribution at scale.",
      null,
      null,
      null,
      "automation",
      "/Users/zach/Desktop/make_blueprints_ready",
      now,
      now,
    ],
    [
      "tgf-landing-page",
      "TGF Landing Page",
      "Band artist promotional landing page website featuring brutalist 3D Three.js canvas background, YouTube and Spotify video embeds, gallery lightbox, show listings, news section, and contact submission form.",
      "Monetizes as reusable agency landing page template product and music-marketing industry vertical prototype for client acquisition. Solves indie artists' need for professional web presence without technical coding skills.",
      "React 19, Vite 8, Three.js (r3f/drei), GSAP, Tailwind CSS v4",
      null,
      null,
      "frontend",
      "/Users/zach/Desktop/TGF Landing Page",
      now,
      now,
    ],
    [
      "the-greater-flaw",
      "The Greater Flaw (empty)",
      "Currently empty project directory on disk containing no source code, configuration, or application content yet requiring strategic business direction or formal project initiation planning decision.",
      "Pending strategic decision regarding expansion into full band management platform or complete archival deprecation of this placeholder directory. No immediate monetization model or global problem-solving purpose identified at this stage.",
      null,
      null,
      null,
      "empty",
      "/Users/zach/Desktop/The Greater Flaw",
      now,
      now,
    ],
  ];
  for (const p of projects) stmt.run(...p);
}

/**
 * that already holds imported skills (or one upgraded to this version) starts
 * with an empty index. Rebuild from the content table whenever the counts drift.
 */
function backfillSkillsFts(sqlite: Database.Database) {
  try {
    const base = (sqlite.prepare("SELECT COUNT(*) AS c FROM skills").get() as { c: number }).c;
    if (base === 0) return;
    // A corrupt FTS index throws SQLITE_CORRUPT_VTAB on read/write — which breaks
    // every skills insert/update/delete (the triggers write to it). Treat any read
    // failure as "needs rebuild" so the index self-heals on boot.
    let indexed = -1;
    try {
      indexed = (sqlite.prepare("SELECT COUNT(*) AS c FROM skills_fts").get() as { c: number }).c;
    } catch {
      indexed = -1;
    }
    if (indexed === base) return;
    try {
      sqlite.exec("INSERT INTO skills_fts(skills_fts) VALUES('rebuild')");
    } catch {
      // Index is corrupt: recreate the virtual table, then rebuild from content.
      sqlite.exec(
        "DROP TABLE IF EXISTS skills_fts;" +
          "CREATE VIRTUAL TABLE skills_fts USING fts5(name, description, instructions, content=skills, content_rowid=rowid);" +
          "INSERT INTO skills_fts(skills_fts) VALUES('rebuild');"
      );
    }
  } catch {
    /* best-effort; retrieval falls back to recent skills */
  }
}

export function getDb(): DB {
  if (g.__matrixDb) return g.__matrixDb;
  g.__matrixDb = drizzle(getSqlite(), { schema });
  return g.__matrixDb;
}
