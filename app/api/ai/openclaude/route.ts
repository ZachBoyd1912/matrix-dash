import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { sessionMessages } from "@/lib/db/schema";
import { runOpenClaudeTurn, detectOpenClaude } from "@/lib/services/openclaude";
import {
  appendEvent,
  blocksToText,
  serializeBlocksForStorage,
  type Block,
  type StreamEvent,
} from "@/lib/chat/blocks";

export const dynamic = "force-dynamic";

/** Status probe for the chat UI's install banner. */
export async function GET() {
  return Response.json(await detectOpenClaude());
}

interface Payload {
  messages?: { role: string; content: unknown }[];
  sessionId?: string;
}

/** Run a chat turn through OpenClaude (on the active Matrix provider), streaming blocks. */
export async function POST(req: Request) {
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
        await runOpenClaudeTurn({ prompt, matrixSessionId: sessionId, signal: req.signal, emit });
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
}
