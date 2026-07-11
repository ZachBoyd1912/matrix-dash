import { eq, and } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/current-user";
import { getSystemDb } from "@/lib/db/client";
import { runnerDevices } from "@/lib/db/schema";
import { snapshotDeviceLog, subscribeDeviceLog } from "@/lib/services/runner-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ deviceId: string }>;
}

/**
 * Live NDJSON stream of a device's runner console — the member's own machine
 * activity. Session-authed and scoped: the device must belong to the requester
 * (so one account can't read another's console). Snapshot first, then live tail.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const { deviceId } = await ctx.params;

  const device = getSystemDb()
    .select({ id: runnerDevices.id })
    .from(runnerDevices)
    .where(and(eq(runnerDevices.id, deviceId), eq(runnerDevices.userId, session.user.id)))
    .get();
  if (!device) return Response.json({ error: "Device not found" }, { status: 404 });

  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          unsub?.();
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      if (_req.signal.aborted) return finish();
      _req.signal.addEventListener("abort", finish);
      for (const line of snapshotDeviceLog(deviceId)) send(line);
      unsub = subscribeDeviceLog(deviceId, send);
    },
    cancel() {
      closed = true;
      try {
        unsub?.();
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
