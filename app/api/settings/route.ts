import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

const patchSchema = z.record(z.string(), z.union([z.string(), z.boolean(), z.number()]));

// The watcher is only (re)started here, on a settings change, or once at server
// boot (instrumentation.ts) — it's a long-lived process, not something that
// re-evaluates itself on every request the way the rest of this route's
// generic key/value settings do.
const OBSIDIAN_WATCHER_KEYS = new Set([
  "obsidianSyncEnabled",
  "obsidianVaultPath",
  "obsidianSyncDirection",
]);

export async function GET() {
  return Response.json(getAllSettings());
}

export async function PATCH(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let touchedWatcherSettings = false;
  for (const [key, value] of Object.entries(parsed.data)) {
    let str: string;
    if (typeof value === "boolean") str = value ? "1" : "0";
    else if (typeof value === "number") str = String(value);
    else str = value;
    setSetting(key, str);
    if (OBSIDIAN_WATCHER_KEYS.has(key)) touchedWatcherSettings = true;
  }
  if (touchedWatcherSettings) {
    try {
      const { stopWatcher, initWatcher } = await import("@/lib/services/obsidian-sync");
      stopWatcher();
      initWatcher();
    } catch (err) {
      console.error("[settings] failed to re-evaluate obsidian watcher:", err);
    }
  }
  return Response.json(getAllSettings());
}
