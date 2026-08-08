import { randomUUID } from "crypto";
import { desc, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { clipboardEntries } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/clipboard — returns the latest unfetched clipboard entry.
 * Also writes it to macOS clipboard via pbcopy.
 */
export const GET = withUser(async () => {
  const db = getDb();
  const row = db
    .select()
    .from(clipboardEntries)
    .where(isNull(clipboardEntries.fetchedAt))
    .orderBy(desc(clipboardEntries.createdAt))
    .get();

  if (!row) return Response.json({ text: null });

  // Mark as fetched
  db.update(clipboardEntries)
    .set({ fetchedAt: new Date().toISOString() })
    .where({ id: row.id } as never)
    .run();

  // Write to macOS clipboard asynchronously
  try {
    const { execFile } = await import("node:child_process");
    const child = execFile("pbcopy", [], { timeout: 3000 });
    child.stdin?.write(row.text);
    child.stdin?.end();
  } catch {
    /* pbcopy unavailable — probably not macOS. Silently skip. */
  }

  return Response.json({ text: row.text, createdAt: row.createdAt });
});

/**
 * POST /api/clipboard — stores text from iPhone.
 * Deduplicates: if the new text matches the latest entry, skips insert.
 */
export const POST = withUser(async (req) => {
  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.text || typeof body.text !== "string") {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  const text = body.text.slice(0, 50_000);

  const db = getDb();

  // Dedup: skip if same as latest entry
  const latest = db
    .select({ text: clipboardEntries.text })
    .from(clipboardEntries)
    .orderBy(desc(clipboardEntries.createdAt))
    .get();
  if (latest && latest.text === text) {
    return Response.json({ ok: true, deduped: true });
  }

  const id = randomUUID();
  db.insert(clipboardEntries)
    .values({
      id,
      text,
      createdAt: new Date().toISOString(),
    })
    .run();

  return Response.json({ ok: true, id });
});

/**
 * DELETE /api/clipboard — cleanup old entries (daemon endpoint).
 * Removes fetched entries older than 24h, unfetched older than 7d.
 */
export const DELETE = withUser(async () => {
  const db = getDb();
  const cutoffFetched = new Date(Date.now() - 24 * 3600_000).toISOString();
  const cutoffUnfetched = new Date(Date.now() - 7 * 86400_000).toISOString();

  const deleted = db.run(
    `DELETE FROM clipboard_entries WHERE (fetched_at IS NOT NULL AND created_at < '${cutoffFetched}') OR (fetched_at IS NULL AND created_at < '${cutoffUnfetched}')`
  );

  return Response.json({ cleaned: deleted.changes });
});
