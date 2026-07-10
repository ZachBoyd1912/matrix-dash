import { and, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/current-user";
import { getSystemDb } from "@/lib/db/client";
import { runnerDevices } from "@/lib/db/schema";
import { isRunnerOnline } from "@/lib/services/runner-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The logged-in user's paired devices (never anyone else's — decision 9). */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  const rows = getSystemDb()
    .select()
    .from(runnerDevices)
    .where(and(eq(runnerDevices.userId, session.user.id), isNull(runnerDevices.revokedAt)))
    .all();

  return Response.json(
    rows.map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      arch: d.arch,
      appVersion: d.appVersion,
      isDefault: !!d.isDefault,
      online: isRunnerOnline(d.id),
      lastSeenAt: d.lastSeenAt,
      createdAt: d.createdAt,
    }))
  );
}
