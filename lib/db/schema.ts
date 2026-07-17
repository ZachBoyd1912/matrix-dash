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
  vaultRelPath: text("vault_rel_path"),
  vaultSyncedAt: text("vault_synced_at"),
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
  vaultRelPath: text("vault_rel_path"),
  vaultSyncedAt: text("vault_synced_at"),
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
  // Set when this session was created via "Fork from here" / "Duplicate" on
  // another session. Self-referencing (not a DB-level FK — sessions can be
  // deleted independently of their forks; a dangling parentSessionId is fine,
  // it just stops resolving in the branch tree view).
  parentSessionId: text("parent_session_id"),
  // The message (in the parent session) this fork branched from. Null for a
  // full duplicate (fork with no cut point).
  forkedFromMessageId: text("forked_from_message_id"),
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
  // Denormalized from ai_providers.provider at write time (not just providerId) so
  // lifetime/per-provider cost stays attributable after a provider is deleted —
  // a real scenario in an app built around swapping experimental providers.
  providerKind: text("provider_kind"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  // JSON-encoded array of regenerated variants for this assistant turn (each a
  // snapshot of {content, blocks, providerId, providerKind, modelName,
  // inputTokens, outputTokens, createdAt}). Null until a message is regenerated
  // at least once. The row's own `content`/`blocks`/provider*/*Tokens columns
  // always mirror `variants[activeVariantIndex]` — kept in sync deliberately so
  // every other query in this codebase (cost.ts's SQL aggregates, the context
  // estimator, extraction, plain rendering) reads the active variant with zero
  // changes, instead of needing to know about variants at all.
  variants: text("variants"),
  activeVariantIndex: integer("active_variant_index").notNull().default(0),
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
  folder: text("folder", { enum: ["inbox", "sent", "drafts", "trash"] })
    .notNull()
    .default("inbox"),
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
  // Truth-sync columns — written only by lib/services/portfolio-sync.ts.
  // slug is the reconciliation join key (local dir names and GitHub repo
  // names drift, e.g. fansly_ai_automation vs fansly-ai-automation);
  // githubRepo ("owner/name") is a manual override for when the slug
  // heuristic misses.
  slug: text("slug"),
  githubRepo: text("github_repo"),
  visibility: text("visibility", { enum: ["public", "private", "local"] }),
  presence: text("presence", { enum: ["local+github", "local-only", "github-only", "missing"] }),
  lastCommitAt: text("last_commit_at"),
  lastCommitMessage: text("last_commit_message"),
  branch: text("branch"),
  dirtyFiles: integer("dirty_files").notNull().default(0),
  openIssues: integer("open_issues").notNull().default(0),
  lastSyncedAt: text("last_synced_at"),
  isArchived: integer("is_archived", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── SITE HEALTH (deployed-site probes for the briefing) ──
export const siteHealth = sqliteTable("site_health", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  label: text("label").notNull(),
  // 302 IS the healthy status for Cloudflare-Access-gated hosts — probes
  // must fetch with redirect:"manual" or they'd report the login page.
  expectedStatus: integer("expected_status").notNull().default(200),
  lastStatus: integer("last_status"),
  lastCheckedAt: text("last_checked_at"),
  lastOkAt: text("last_ok_at"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
});

// ─── PIPELINE (path to first sale — blockers, leads, enquiries) ──
export const pipelineItems = sqliteTable("pipeline_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["blocker", "lead", "enquiry", "action"] }).notNull(),
  status: text("status", { enum: ["open", "done", "dropped"] })
    .notNull()
    .default("open"),
  notes: text("notes"),
  // "contact-form" is reserved for the future zbautomations.ie enquiry
  // endpoint (monetization plan) to write leads in directly.
  source: text("source", { enum: ["manual", "contact-form"] })
    .notNull()
    .default("manual"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
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
  // JSON-encoded GenerationParams — a single column for a small optional config
  // object, same choice as fallbackProviderIds, rather than one column per field.
  generationParams: text("generation_params"),
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

// ─── GOOGLE CALENDAR CONNECTIONS ──────────────────────────
export const googleCalendarConnections = sqliteTable("google_calendar_connections", {
  id: text("id").primaryKey(),
  googleEmail: text("google_email").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpires: text("token_expires").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
});

// ─── GMAIL CONNECTIONS ────────────────────────────────────
export const gmailConnections = sqliteTable("gmail_connections", {
  id: text("id").primaryKey(),
  googleEmail: text("google_email").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpires: text("token_expires").notNull(),
  imapEnabled: integer("imap_enabled", { mode: "boolean" }).default(true),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
});

// ─── USERS (multi-tenant accounts) ────────────────────────
// Each user is an isolated workspace owner. All user-data tables carry an
// owner_id referencing users.id; queries scope to the authenticated user.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  // scrypt: "<saltHex>:<hashHex>". Null when the account is CF-Access-only (no password set yet).
  passwordHash: text("password_hash"),
  // Encrypted TOTP secret; totpEnabled gates the 2FA step at login.
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).default(false),
  // "owner" can manage other accounts; "member" is a normal isolated workspace.
  role: text("role", { enum: ["owner", "member"] })
    .notNull()
    .default("member"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  lastLoginAt: text("last_login_at"),
  // Set when the user finishes (or skips) the onboarding tour; null → auto-launch it.
  tutorialCompletedAt: text("tutorial_completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── AUTH SESSIONS (app-level login sessions) ─────────────
export const authSessions = sqliteTable("auth_sessions", {
  // The opaque session token stored in the httpOnly cookie (random, high-entropy).
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // When true the second factor (TOTP) has been satisfied for this session.
  mfaSatisfied: integer("mfa_satisfied", { mode: "boolean" }).default(false),
  userAgent: text("user_agent"),
  ip: text("ip"),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// ─── AGENTS (autonomous agent system) ─────────────────────
// A user-defined autonomous agent driven by the Claude Agent SDK. Config here is
// read once at run start (runs don't hot-reload edits); see agentVersions for the
// pre-edit history and agentRuns for execution records.
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  // null → the system default model (Sonnet). Free-text SDK model id otherwise.
  model: text("model"),
  // Working directory the SDK runs in. null → getWorkspaceRoot() (~/MatrixDash).
  cwd: text("cwd"),
  // JSON string[] of absolute path prefixes/globs the agent may write to without
  // approval (its safe zone). Everything else is queued/denied by the policy engine.
  writeAllowlist: text("write_allowlist").notNull().default("[]"),
  // JSON of learned "always allow" rules ({ paths: string[], commands: string[] })
  // appended when an approval is granted with scope. Merged into policy evaluation.
  learnedRules: text("learned_rules").notNull().default('{"paths":[],"commands":[]}'),
  // JSON string[] of skill ids injected into this agent's system prompt.
  skillIds: text("skill_ids").notNull().default("[]"),
  // JSON of MCP server configs attached to the SDK session.
  mcpServers: text("mcp_servers").notNull().default("[]"),
  allowSubagents: integer("allow_subagents", { mode: "boolean" }).default(false),
  // "triggered" (default) | "standing_watch" (tight check-in interval).
  mode: text("mode").notNull().default("triggered"),
  // "direct" | "pr" | null (auto-detect from repo commit history).
  pushMode: text("push_mode"),
  // Distinct git author for autonomous commits (null → derived per-agent default).
  gitAuthorName: text("git_author_name"),
  gitAuthorEmail: text("git_author_email"),
  // Cron expression; only fires when scheduleEnabled.
  schedule: text("schedule"),
  scheduleEnabled: integer("schedule_enabled", { mode: "boolean" }).default(false),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
  // Reset to 0 on success; auto-disables the schedule at the failure threshold.
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  // Per-agent overrides of the global limits (null → use the global setting).
  maxTurns: integer("max_turns"),
  timeoutMs: integer("timeout_ms"),
  perRunCostUsd: real("per_run_cost_usd"),
  perRunTokens: integer("per_run_tokens"),
  maxChainDepth: integer("max_chain_depth"),
  // JSON { postToChat: bool, fileNote: bool, inDigest: bool }.
  deliverables: text("deliverables")
    .notNull()
    .default('{"postToChat":false,"fileNote":false,"inDigest":true}'),
  lastRunAt: text("last_run_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── AGENT RUNS (execution records + transcripts) ─────────
export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  // queued|running|awaiting_approval|succeeded|failed|cancelled|timeout|interrupted|needs_review
  status: text("status").notNull().default("queued"),
  // manual|cron|webhook|chat|voice
  trigger: text("trigger").notNull().default("manual"),
  dryRun: integer("dry_run", { mode: "boolean" }).default(false),
  chainDepth: integer("chain_depth").notNull().default(0),
  parentRunId: text("parent_run_id"),
  urgent: integer("urgent", { mode: "boolean" }).default(false),
  prompt: text("prompt").notNull().default(""),
  sdkSessionId: text("sdk_session_id"),
  sourceSessionId: text("source_session_id"),
  // JSON-encoded Block[] (same shape as session_messages.blocks).
  blocks: text("blocks"),
  result: text("result"),
  error: text("error"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  numTurns: integer("num_turns").notNull().default(0),
  gitRepoPath: text("git_repo_path"),
  gitBranch: text("git_branch"),
  pushModeUsed: text("push_mode_used"),
  prUrl: text("pr_url"),
  snapshotDir: text("snapshot_dir"),
  // Matrix Runner: which paired device executed this run ("local" execution =
  // legacy in-process, "runner" = dispatched to the device below).
  execution: text("execution").notNull().default("local"),
  deviceId: text("device_id"),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  createdAt: text("created_at").notNull(),
});

// ─── AGENT APPROVALS (persistent gated-action queue) ──────
export const agentApprovals = sqliteTable("agent_approvals", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull(),
  toolName: text("tool_name").notNull(),
  input: text("input").notNull().default("{}"),
  summary: text("summary").notNull().default(""),
  // "gated" | "break_glass"
  tier: text("tier").notNull().default("gated"),
  justification: text("justification"),
  // pending|approved|denied|expired|orphaned
  status: text("status").notNull().default("pending"),
  // HMAC token for single-use ntfy/Telegram approve/deny action URLs.
  signedToken: text("signed_token"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  decidedAt: text("decided_at"),
});

// ─── AGENT SECRET READS (queryable audit of masked reads) ─
export const agentSecretReads = sqliteTable("agent_secret_reads", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  agentId: text("agent_id").notNull(),
  path: text("path").notNull(),
  toolName: text("tool_name").notNull(),
  createdAt: text("created_at").notNull(),
});

// ─── AGENT VERSIONS (config history for diff/revert) ──────
export const agentVersions = sqliteTable("agent_versions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  // JSON snapshot of the full agent config as it was BEFORE this edit.
  snapshot: text("snapshot").notNull(),
  changeNote: text("change_note"),
  createdAt: text("created_at").notNull(),
});

// ─── MATRIX RUNNER (local-first execution devices) ────────
// A paired device running the Matrix Runner process. These live in the SYSTEM
// DB (cross-account, like users/auth_sessions): pairing + dispatch must resolve
// a token to its owner before any per-account context exists. Job payloads
// carry ids/params only — transcripts stay in the user's per-account DB.

export const runnerDevices = sqliteTable("runner_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  platform: text("platform").notNull().default(""), // darwin|linux|win32
  arch: text("arch").notNull().default(""),
  appVersion: text("app_version").notNull().default(""),
  // sha256 hex of the runner token; the raw token is shown exactly once at pairing.
  tokenHash: text("token_hash").notNull().unique(),
  // The device agent runs dispatch to when the user has several paired.
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at"),
  revokedAt: text("revoked_at"),
});

// Short-lived one-time codes minted in the dashboard; the runner exchanges one
// for a long-lived device token at POST /api/runner/pair.
export const runnerPairCodes = sqliteTable("runner_pair_codes", {
  // sha256 hex of the pair code (never stored raw).
  codeHash: text("code_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

// One-time member invite links: owner mints, member opens /invite/[token] to
// set their own password. (Phase 5 flow; table lands with the platform DDL.)
export const accountInvites = sqliteTable("account_invites", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

// Dispatchable work for a device. Payload is ids/params only, NEVER content.
export const runnerJobs = sqliteTable("runner_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceId: text("device_id")
    .notNull()
    .references(() => runnerDevices.id, { onDelete: "cascade" }),
  // agent_run|fs_op|console_stream|ide_ctl|ping
  kind: text("kind").notNull(),
  payload: text("payload").notNull().default("{}"),
  // queued|dispatched|running|done|error|skipped_offline|cancelled
  status: text("status").notNull().default("queued"),
  // Links agent_run jobs to the run row in the user's per-account DB.
  agentRunId: text("agent_run_id"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  dispatchedAt: text("dispatched_at"),
  completedAt: text("completed_at"),
});
