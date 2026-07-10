import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/current-user";
import { getSystemDb } from "@/lib/db/client";
import { runnerDevices } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  name: z.string().max(200).optional(),
  isDefault: z.boolean().optional(),
});

/** A user can only ever touch their OWN devices (decision 9). */
function ownDevice(userId: string, deviceId: string) {
  return getSystemDb()
    .select()
    .from(runnerDevices)
    .where(and(eq(runnerDevices.id, deviceId), eq(runnerDevices.userId, userId)))
    .get();
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await ctx.params;
  const device = ownDevice(session.user.id, id);
  if (!device || device.revokedAt) {
    return Response.json({ error: "Device not found" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = getSystemDb();
  if (parsed.data.isDefault === true) {
    // Exactly one default per user.
    db.update(runnerDevices)
      .set({ isDefault: false })
      .where(and(eq(runnerDevices.userId, session.user.id), isNull(runnerDevices.revokedAt)))
      .run();
  }
  db.update(runnerDevices)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
    })
    .where(eq(runnerDevices.id, id))
    .run();
  return Response.json({ ok: true });
}

/** Revoke: the device's token stops authenticating immediately. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await ctx.params;
  const device = ownDevice(session.user.id, id);
  if (!device) return Response.json({ error: "Device not found" }, { status: 404 });

  getSystemDb()
    .update(runnerDevices)
    .set({ revokedAt: new Date().toISOString(), isDefault: false })
    .where(eq(runnerDevices.id, id))
    .run();
  return Response.json({ ok: true });
}
