import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db/client";
import { getDataDir } from "@/lib/utils/db-path";
import {
  memories,
  memoryLinks,
  notes,
  noteLinks,
  sessions,
  sessionMessages,
  files,
  settings,
  emails,
  skills,
  tasks,
  scheduledJobs,
  emailAccounts,
  calendars,
  events,
  attachments,
  contacts,
  apiTokens,
  vault,
  webhooks,
  presets,
  images,
} from "@/lib/db/schema";

const TABLES = {
  memories,
  memoryLinks,
  notes,
  noteLinks,
  sessions,
  sessionMessages,
  files,
  settings,
  emails,
  skills,
  tasks,
  scheduledJobs,
  emailAccounts,
  calendars,
  events,
  attachments,
  contacts,
  apiTokens,
  vault,
  webhooks,
  presets,
  images,
};

export function getBackupDir(): string {
  const dir = path.join(getDataDir(), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function dumpAll(): Record<string, unknown[]> {
  const db = getDb();
  const out: Record<string, unknown[]> = {};
  for (const [key, table] of Object.entries(TABLES)) {
    out[key] = db.select().from(table).all();
  }
  return out;
}

export function writeBackup(): string {
  const data = { exportedAt: new Date().toISOString(), ...dumpAll() };
  const filename = `matrix-${Date.now()}.json`;
  const filepath = path.join(getBackupDir(), filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  pruneOldBackups();
  return filepath;
}

/** Keep the most recent N backups (default 10). */
export function pruneOldBackups(keep = 10) {
  const dir = getBackupDir();
  const entries = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const stale of entries.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, stale.name));
    } catch {
      /* ignore */
    }
  }
}

export function listBackups(): { name: string; size: number; createdAt: string }[] {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, createdAt: new Date(stat.mtimeMs).toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
