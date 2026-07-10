import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { parseBlocksJson, type StreamEvent } from "@/lib/chat/blocks";
import { snapshotRunEvents, subscribeRunEvents } from "@/lib/services/run-bus";
import { isRunActive } from "@/lib/services/agent-runner";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ runId: string }>;
}

/**
 * NDJSON stream for one agent run: emits a `hydrate` frame with the persisted
 * block snapshot + current status, then live StreamEvents from the run-bus. If
 * the run is already terminal, it hydrates and closes immediately.
 */
export const GET = withUser(async (req: Request, ctx: Ctx) => {
  const { runId } = await ctx.params;
  const row = getDb().select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

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

      // 1. Hydrate: persisted blocks + status.
      send({
        __control: "hydrate",
        status: row.status,
        blocks: parseBlocksJson(row.blocks) ?? [],
        costUsd: row.costUsd,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        numTurns: row.numTurns,
      });

      // 2. Replay any buffered events, then subscribe live.
      for (const ev of snapshotRunEvents(runId)) send(ev);

      const terminal = !isRunActive(runId) && row.status !== "queued" && row.status !== "running";
      if (terminal) return finish();

      if (req.signal.aborted) return finish();
      req.signal.addEventListener("abort", finish);
      unsub = subscribeRunEvents(runId, (ev: StreamEvent) => send(ev));
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
});
