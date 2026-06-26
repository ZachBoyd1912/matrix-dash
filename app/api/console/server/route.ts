import {
  snapshotServerLogs,
  subscribeServerLogs,
  clearServerLogs,
} from "@/lib/services/log-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Streams Matrix Dashboard's OWN backend logs as NDJSON: first the ring-buffer
 * snapshot, then live lines as the server prints them. The connection stays
 * open until the client aborts (panel unmount / navigation).
 */
export async function GET(req: Request) {
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

      if (req.signal.aborted) return finish();
      req.signal.addEventListener("abort", finish);

      for (const line of snapshotServerLogs()) send(line);
      unsub = subscribeServerLogs(send);
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
      "x-accel-buffering": "no",
    },
  });
}

export async function DELETE() {
  clearServerLogs();
  return Response.json({ ok: true });
}
