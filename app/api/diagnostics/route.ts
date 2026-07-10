import fs from "fs";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { memories, notes, emails, sessions, scheduledJobs, emailAccounts } from "@/lib/db/schema";
import { getDbPath } from "@/lib/utils/db-path";
import { detectOllama } from "@/lib/services/ollama";
import { embeddingsAvailable } from "@/lib/ai/embeddings";
import { getActiveProvider } from "@/lib/ai/registry";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

export const GET = withUser(async () => {
  const db = getDb();

  const counts = {
    memories:
      db
        .select({ c: sql<number>`count(*)` })
        .from(memories)
        .get()?.c ?? 0,
    notes:
      db
        .select({ c: sql<number>`count(*)` })
        .from(notes)
        .get()?.c ?? 0,
    emails:
      db
        .select({ c: sql<number>`count(*)` })
        .from(emails)
        .get()?.c ?? 0,
    sessions:
      db
        .select({ c: sql<number>`count(*)` })
        .from(sessions)
        .get()?.c ?? 0,
    scheduledJobs:
      db
        .select({ c: sql<number>`count(*)` })
        .from(scheduledJobs)
        .get()?.c ?? 0,
    emailAccounts:
      db
        .select({ c: sql<number>`count(*)` })
        .from(emailAccounts)
        .get()?.c ?? 0,
  };

  let dbSize = 0;
  try {
    dbSize = fs.statSync(getDbPath()).size;
  } catch {
    /* ignore */
  }

  const [ollama] = await Promise.all([detectOllama()]);

  return Response.json({
    counts,
    dbSize,
    dbPath: getDbPath(),
    ollama,
    embeddings: embeddingsAvailable(),
    activeProvider: getActiveProvider()?.name ?? null,
    nodeVersion: process.version,
    platform: process.platform,
  });
});
