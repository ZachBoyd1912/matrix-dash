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
  providerId: text("provider_id"),
  modelName: text("model_name"),
  createdAt: text("created_at").notNull(),
});

// ─── AI PROVIDERS ─────────────────────────────────────────
export const aiProviders = sqliteTable("ai_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider", { enum: ["openai", "anthropic", "google", "custom"] }).notNull(),
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

// ─── SETTINGS ─────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
