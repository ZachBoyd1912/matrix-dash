import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { listNotifications } from "@/lib/services/notify";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listNotifications(50));
}

export async function PATCH() {
  // Mark all as read.
  getDb().update(notifications).set({ isRead: true }).run();
  return Response.json({ ok: true });
}

export async function DELETE() {
  getDb().delete(notifications).run();
  return Response.json({ ok: true });
}
