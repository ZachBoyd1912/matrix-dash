import { count, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { notes, memories } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  const noteCount = db.select({ value: count() }).from(notes).get()?.value ?? 0;
  const memoryCount = db.select({ value: count() }).from(memories).get()?.value ?? 0;
  const syncedNoteCount =
    db.select({ value: count() }).from(notes).where(isNotNull(notes.vaultRelPath)).get()?.value ??
    0;
  const syncedMemoryCount =
    db.select({ value: count() }).from(memories).where(isNotNull(memories.vaultRelPath)).get()
      ?.value ?? 0;

  return Response.json({
    enabled: getSetting("obsidianSyncEnabled") === "1",
    vaultPath: getSetting("obsidianVaultPath") ?? "",
    direction: getSetting("obsidianSyncDirection") ?? "bidirectional",
    noteCount,
    memoryCount,
    syncedNoteCount,
    syncedMemoryCount,
  });
}
