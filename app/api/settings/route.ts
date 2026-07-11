import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/db/settings";
import { withUser } from "@/lib/auth/with-user";

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

const TELEGRAM_KEYS = new Set(["telegram_bot_token", "telegram_chat_id"]);

export const GET = withUser(async () => {
  return Response.json(getAllSettings());
});

export const PATCH = withUser(async (req: Request) => {
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
  let killSwitchEngaged = false;
  let touchedTelegram = false;
  for (const [key, value] of Object.entries(parsed.data)) {
    let str: string;
    if (typeof value === "boolean") str = value ? "1" : "0";
    else if (typeof value === "number") str = String(value);
    else str = value;
    setSetting(key, str);
    if (OBSIDIAN_WATCHER_KEYS.has(key)) touchedWatcherSettings = true;
    if (key === "agents_kill_switch" && str === "1") killSwitchEngaged = true;
    if (TELEGRAM_KEYS.has(key)) touchedTelegram = true;
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
  if (killSwitchEngaged) {
    // Hard-abort every active run immediately (emergency stop).
    try {
      const { killAllRuns } = await import("@/lib/services/agent-runner");
      killAllRuns();
    } catch (err) {
      console.error("[settings] failed to engage agent kill switch:", err);
    }
  }
  if (touchedTelegram) {
    try {
      const { initTelegramBot } = await import("@/lib/services/telegram-bot");
      initTelegramBot();
    } catch (err) {
      console.error("[settings] failed to re-init telegram bridge:", err);
    }
  }
  return Response.json(getAllSettings());
});
