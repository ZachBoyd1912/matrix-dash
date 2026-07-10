import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { listNotifications } from "@/lib/services/notify";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

export const GET = withUser(async () => {
  return Response.json(listNotifications(50));
});

export const PATCH = withUser(async () => {
  // Mark all as read.
  getDb().update(notifications).set({ isRead: true }).run();
  return Response.json({ ok: true });
});

export const DELETE = withUser(async () => {
  getDb().delete(notifications).run();
  return Response.json({ ok: true });
});
