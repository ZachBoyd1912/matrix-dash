import { requireRunner } from "@/lib/auth/runner-auth";
import { registerRunner, dispatchQueuedJobs, markRunnerActivity } from "@/lib/services/runner-bus";
import { PROTOCOL_VERSION, encodeFrame, type ServerFrame } from "@/lib/runner/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The runner's long-lived downlink: an NDJSON response held open for the life
 * of the connection. Server pushes ServerFrames (job dispatch, approvals,
 * cancel, updates, kill switch) as lines; heartbeat pings keep Cloudflare from
 * reaping the idle response. Uplink is POST /api/runner/events.
 */
export async function GET(req: Request) {
  const auth = requireRunner(req);
  if ("response" in auth) return auth.response;
  const { device } = auth;

  const encoder = new TextEncoder();
  let unregister: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: ServerFrame) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeFrame(frame)));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          unregister?.();
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      if (req.signal.aborted) return finish();
      req.signal.addEventListener("abort", finish);

      send({
        type: "hello",
        deviceId: device.id,
        protocolVersion: PROTOCOL_VERSION,
        serverTime: new Date().toISOString(),
      });
      unregister = registerRunner(device.id, send);
      markRunnerActivity(device.id);
      // Anything queued while the device was offline goes out immediately.
      dispatchQueuedJobs(device.id);
    },
    cancel() {
      closed = true;
      try {
        unregister?.();
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
