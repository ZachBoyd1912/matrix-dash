import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { sessionMessages } from "@/lib/db/schema";
import { runClaudeTurn, detectClaude } from "@/lib/services/claude-code";
import {
  appendEvent,
  blocksToText,
  serializeBlocksForStorage,
  type Block,
  type StreamEvent,
} from "@/lib/chat/blocks";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

/** Status probe for the chat UI's engine switch. */
export const GET = withUser(async () => {
  return Response.json(await detectClaude());
});

interface Payload {
  messages?: { role: string; content: unknown }[];
  sessionId?: string;
  modelOverride?: string;
}

/** Run a chat turn through the real Claude Code CLI, streaming the block protocol. */
export const POST = withUser(async (req: Request) => {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const sessionId = body.sessionId;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const prompt = lastUser && typeof lastUser.content === "string" ? lastUser.content : "";
  if (!prompt) return Response.json({ error: "messages required" }, { status: 400 });

  if (sessionId) {
    try {
      getDb()
        .insert(sessionMessages)
        .values({
          id: randomUUID(),
          sessionId,
          role: "user",
          content: prompt,
          createdAt: new Date().toISOString(),
        })
        .run();
    } catch {
      /* best-effort */
    }
  }

  const encoder = new TextEncoder();
  const line = (o: object) => encoder.encode(JSON.stringify(o) + "\n");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const blocks: Block[] = [];
      const idMap = new Map<string, number>();
      const emit = (ev: StreamEvent) => {
        appendEvent(blocks, idMap, ev);
        controller.enqueue(line(ev));
      };
      try {
        await runClaudeTurn({
          prompt,
          matrixSessionId: sessionId,
          matrixOrigin: new URL(req.url).origin,
          model: body.modelOverride,
          signal: req.signal,
          emit,
        });
      } catch (e) {
        emit({ type: "error", value: e instanceof Error ? e.message : String(e) });
      } finally {
        if (sessionId && blocks.length) {
          try {
            getDb()
              .insert(sessionMessages)
              .values({
                id: randomUUID(),
                sessionId,
                role: "assistant",
                content: blocksToText(blocks),
                blocks: serializeBlocksForStorage(blocks),
                createdAt: new Date().toISOString(),
              })
              .run();
          } catch {
            /* best-effort */
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
});
