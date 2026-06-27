import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── MEMORIES (Autonomous Memory System) ───────────────────
export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  type: text("type", { enum: ["identity", "project", "global", "lesson"] }).notNull(),
  tags: text("tags").notNull().default(""),
  importance: real("importance").notNull().default(0.5),
  usageCount: integer("usage_count").notNull().default(0),
  source: text("source"),
  embedding: text("embedding"), // JSON array of floats
  isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
});

// ─── MEMORY LINKS (auto-generated wiki-links) ─────────────
export const memoryLinks = sqliteTable("memory_links", {
  id: text("id").primaryKey(),
  sourceMemoryId: text("source_memory_id")
    .notNull()
    .references(() => memories.id, { onDelete: "cascade" }),
  targetMemoryId: text("target_memory_id")
    .notNull()
    .references(() => memories.id, { onDelete: "cascade" }),
  strength: real("strength").notNull().default(0.5),
  createdAt: text("created_at").notNull(),
});

// ─── NOTES (manual Obsidian-style notes) ──────────────────
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  content: text("content").notNull().default(""),
  tags: text("tags").notNull().default(""),
  folderId: text("folder_id"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── NOTE LINKS (manual wiki-links) ──────────────────────
export const noteLinks = sqliteTable("note_links", {
  id: text("id").primaryKey(),
  sourceNoteId: text("source_note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  targetNoteId: text("target_note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  label: text("label"),
});

// ─── SESSIONS ─────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("New Session"),
  context: text("context").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── SESSION MESSAGES ─────────────────────────────────────
export const sessionMessages = sqliteTable("session_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  // JSON-encoded Block[] (the structured transcript). Nullable: legacy rows and
  // plain user turns keep blocks NULL and render from `content`.
  blocks: text("blocks"),
  providerId: text("provider_id"),
  modelName: text("model_name"),
  createdAt: text("created_at").notNull(),
});

// ─── AI PROVIDERS ─────────────────────────────────────────
export const aiProviders = sqliteTable("ai_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Plain text (no enum constraint) so new provider kinds need no migration.
  provider: text("provider").notNull(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  baseUrl: text("base_url"),
  defaultModel: text("default_model"),
  isActive: integer("is_active", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
});

// ─── FILES (IDE) ──────────────────────────────────────────
export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  content: text("content").notNull().default(""),
  language: text("language").notNull().default("plaintext"),
  sessionId: text("session_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── EMAILS (local mailbox) ───────────────────────────────
export const emails = sqliteTable("emails", {
  id: text("id").primaryKey(),
  folder: text("folder", { enum: ["inbox", "sent", "drafts", "trash"] }).notNull().default("inbox"),
  fromAddr: text("from_addr").notNull().default(""),
  toAddr: text("to_addr").notNull().default(""),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  isRead: integer("is_read", { mode: "boolean" }).default(false),
  isStarred: integer("is_starred", { mode: "boolean" }).default(false),
  accountId: text("account_id"),
  messageId: text("message_id"),
  tags: text("tags").notNull().default(""),
  summary: text("summary"),
  createdAt: text("created_at").notNull(),
});

// ─── SETTINGS ─────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── SKILLS (agent capability packs) ──────────────────────
export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── NOTIFICATIONS ────────────────────────────────────────
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  kind: text("kind").notNull().default("info"),
  href: text("href"),
  isRead: integer("is_read", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
});

// ─── PROJECTS (portfolio catalog) ─────────────────────────
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  purpose: text("purpose").notNull(),
  frontend: text("frontend"),
  backend: text("backend"),
  database: text("database"),
  badge: text("badge").notNull(),
  path: text("path"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── TASKS / TODOS ────────────────────────────────────────
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  isDone: integer("is_done", { mode: "boolean" }).default(false),
  dueAt: text("due_at"),
  remindAt: text("remind_at"),
  reminded: integer("reminded", { mode: "boolean" }).default(false),
  priority: text("priority").notNull().default("normal"),
  // task | bug | error | feature — the kind of work item on the kanban board
  kind: text("kind").notNull().default("task"),
  kanbanStatus: text("kanban_status").notNull().default("backlog"),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  kanbanOrder: integer("kanban_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── SCHEDULED JOBS (cron agent runs) ─────────────────────
export const scheduledJobs = sqliteTable("scheduled_jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  cron: text("cron").notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
  lastRunAt: text("last_run_at"),
  lastResult: text("last_result"),
  createdAt: text("created_at").notNull(),
});

// ─── EMAIL ACCOUNTS (IMAP/SMTP) ───────────────────────────
export const emailAccounts = sqliteTable("email_accounts", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  address: text("address").notNull(),
  imapHost: text("imap_host").notNull(),
  imapPort: integer("imap_port").notNull().default(993),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(465),
  username: text("username").notNull(),
  passwordEncrypted: text("password_encrypted").notNull(),
  useTls: integer("use_tls", { mode: "boolean" }).default(true),
  triageEnabled: integer("triage_enabled", { mode: "boolean" }).default(false),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  lastSyncAt: text("last_sync_at"),
  createdAt: text("created_at").notNull(),
});

// ─── CALENDARS + EVENTS ───────────────────────────────────
export const calendars = sqliteTable("calendars", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#34d399"),
  caldavUrl: text("caldav_url"),
  caldavUser: text("caldav_user"),
  caldavPassEncrypted: text("caldav_pass_encrypted"),
  createdAt: text("created_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  calendarId: text("calendar_id")
    .notNull()
    .references(() => calendars.id, { onDelete: "cascade" }),
  uid: text("uid"),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  location: text("location").notNull().default(""),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  allDay: integer("all_day", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── ATTACHMENTS (chat uploads) ───────────────────────────
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mime: text("mime").notNull().default(""),
  kind: text("kind").notNull().default("file"),
  dataUrl: text("data_url"),
  extractedText: text("extracted_text"),
  createdAt: text("created_at").notNull(),
});

// ─── CONTACTS ─────────────────────────────────────────────
export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

// ─── API TOKENS ───────────────────────────────────────────
export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  token: text("token").notNull(),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull(),
});

// ─── VAULT (encrypted secrets) ────────────────────────────
export const vault = sqliteTable("vault", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  valueEncrypted: text("value_encrypted").notNull(),
  createdAt: text("created_at").notNull(),
});

// ─── WEBHOOKS ─────────────────────────────────────────────
export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  event: text("event").notNull().default("*"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
});

// ─── PRESETS (personas) ───────────────────────────────────
export const presets = sqliteTable("presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

// ─── IMAGES (generated gallery) ───────────────────────────
export const images = sqliteTable("images", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull().default(""),
  dataUrl: text("data_url").notNull(),
  provider: text("provider"),
  createdAt: text("created_at").notNull(),
});

// ─── WORKSPACES (real on-disk project roots for the IDE) ──
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
  name: text("name").notNull(),
  lastOpened: text("last_opened").notNull(),
});

// ─── OAUTH STATES (ephemeral, 10-min TTL) ─────────────────
export const oauthStates = sqliteTable("oauth_states", {
  id: text("id").primaryKey(),
  state: text("state").notNull().unique(),
  provider: text("provider").notNull(),
  redirectTo: text("redirect_to").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

// ─── GITHUB CONNECTIONS ────────────────────────────────────
export const githubConnections = sqliteTable("github_connections", {
  id: text("id").primaryKey(),
  label: text("label").notNull().default("GitHub"),
  accessToken: text("access_token").notNull(),
  githubUser: text("github_user").notNull(),
  avatarUrl: text("avatar_url"),
  scopes: text("scopes").notNull().default("repo,user,notifications"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastSyncedAt: text("last_synced_at"),
});

export const githubRepos = sqliteTable("github_repos", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id")
    .notNull()
    .references(() => githubConnections.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  stars: integer("stars").default(0),
  language: text("language"),
  isPrivate: integer("is_private", { mode: "boolean" }).default(false),
  defaultBranch: text("default_branch").default("main"),
  htmlUrl: text("html_url").notNull(),
  syncedAt: text("synced_at").notNull(),
});

export const githubIssues = sqliteTable("github_issues", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  issueNumber: integer("issue_number").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  state: text("state").notNull(),
  labels: text("labels"),
  assignee: text("assignee"),
  htmlUrl: text("html_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const githubPullRequests = sqliteTable("github_pull_requests", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  prNumber: integer("pr_number").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  state: text("state").notNull(),
  author: text("author"),
  baseRef: text("base_ref"),
  headRef: text("head_ref"),
  htmlUrl: text("html_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  mergedAt: text("merged_at"),
});

// ─── SLACK WORKSPACES + CHANNELS ───────────────────────────
export const slackWorkspaces = sqliteTable("slack_workspaces", {
  id: text("id").primaryKey(),
  label: text("label").notNull().default("Slack"),
  accessToken: text("access_token").notNull(),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull(),
  botUserId: text("bot_user_id"),
  scopes: text("scopes").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const slackChannels = sqliteTable("slack_channels", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => slackWorkspaces.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  name: text("name").notNull(),
  topic: text("topic"),
  memberCount: integer("member_count"),
  isPrivate: integer("is_private", { mode: "boolean" }).default(false),
  syncedAt: text("synced_at").notNull(),
});

// ─── GOOGLE DRIVE CONNECTIONS + DOCS ───────────────────────
export const driveConnections = sqliteTable("drive_connections", {
  id: text("id").primaryKey(),
  label: text("label").notNull().default("Google Drive"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  googleEmail: text("google_email").notNull(),
  scopes: text("scopes").notNull().default("drive.readonly"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  tokenExpires: text("token_expires").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const driveDocs = sqliteTable("drive_docs", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id")
    .notNull()
    .references(() => driveConnections.id, { onDelete: "cascade" }),
  driveId: text("drive_id").notNull(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  parentFolder: text("parent_folder"),
  extractedText: text("extracted_text"),
  syncedAt: text("synced_at").notNull(),
});
