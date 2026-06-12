import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { notifications, webhooks } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";

interface NotifyInput {
  title: string;
  body?: string;
  kind?: "info" | "success" | "warning" | "error" | "reminder";
  href?: string;
}

/**
 * Central notification sink. Writes to the in-app center and fans out to any
 * configured channels (ntfy HTTP, browser Web Push are handled client-side via
 * polling the unread feed). Never throws — notifications are best-effort.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    getDb()
      .insert(notifications)
      .values({
        id: randomUUID(),
        title: input.title,
        body: input.body ?? "",
        kind: input.kind ?? "info",
        href: input.href ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch {
    /* ignore */
  }

  // ntfy channel (optional).
  const ntfyUrl = getSetting("ntfyUrl");
  if (ntfyUrl) {
    try {
      await fetch(ntfyUrl, {
        method: "POST",
        headers: { Title: input.title, Priority: input.kind === "error" ? "high" : "default" },
        body: input.body ?? input.title,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* ignore */
    }
  }
}

/** Fire outbound webhooks matching an event name. Best-effort, fire-and-forget. */
export async function fireWebhooks(event: string, payload: unknown): Promise<void> {
  let hooks: { url: string; event: string }[] = [];
  try {
    hooks = getDb()
      .select({ url: webhooks.url, event: webhooks.event })
      .from(webhooks)
      .where(eq(webhooks.isEnabled, true))
      .all();
  } catch {
    return;
  }
  await Promise.allSettled(
    hooks
      .filter((h) => h.event === "*" || h.event === event)
      .map((h) =>
        fetch(h.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event, payload, at: new Date().toISOString() }),
          signal: AbortSignal.timeout(5000),
        })
      )
  );
}

export function listNotifications(limit = 50) {
  return getDb()
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .all()
    .map((n) => ({ ...n, isRead: !!n.isRead }));
}
