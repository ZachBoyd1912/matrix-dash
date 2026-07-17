import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
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

/**
 * List invocable slash commands: user + project skills/commands on disk. The
 * CLI resolves `/name` itself — this listing only powers the input palette.
 */
function listSlashCommands(): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = [];
  const seen = new Set<string>();
  const home = os.homedir();
  const roots = [
    path.join(home, ".claude", "skills"),
    path.join(home, ".claude", "commands"),
    path.join(process.cwd(), ".claude", "skills"),
    path.join(process.cwd(), ".claude", "commands"),
  ];
  for (const root of roots) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const name = e.isDirectory() ? e.name : e.name.replace(/\.md$/, "");
      if (!name || name.startsWith(".") || seen.has(name)) continue;
      // First line of SKILL.md/command file → description (best-effort).
      let description = "";
      try {
        const file = e.isDirectory() ? path.join(root, name, "SKILL.md") : path.join(root, e.name);
        const head = fs.readFileSync(file, "utf8").slice(0, 2000);
        const m = head.match(/^description:\s*(.+)$/m) ?? head.match(/^#\s*(.+)$/m);
        if (m) description = m[1].trim().slice(0, 120);
      } catch {
        /* no description */
      }
      seen.add(name);
      out.push({ name, description });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Status probe + slash-command listing for the chat UI. */
export const GET = withUser(async () => {
  const status = await detectClaude();
  return Response.json({ ...status, commands: status.installed ? listSlashCommands() : [] });
});

interface Payload {
  messages?: { role: string; content: unknown }[];
  sessionId?: string;
  modelOverride?: string;
  planMode?: boolean;
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

  const userMsgId = randomUUID();
  if (sessionId) {
    try {
      getDb()
        .insert(sessionMessages)
        .values({
          id: userMsgId,
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
      if (sessionId) emit({ type: "message_persisted", role: "user", id: userMsgId });
      try {
        await runClaudeTurn({
          prompt,
          matrixSessionId: sessionId,
          matrixOrigin: new URL(req.url).origin,
          model: body.modelOverride,
          signal: req.signal,
          emit,
          planMode: body.planMode === true,
        });
      } catch (e) {
        emit({ type: "error", value: e instanceof Error ? e.message : String(e) });
      } finally {
        if (sessionId && blocks.length) {
          const assistantMsgId = randomUUID();
          try {
            getDb()
              .insert(sessionMessages)
              .values({
                id: assistantMsgId,
                sessionId,
                role: "assistant",
                content: blocksToText(blocks),
                blocks: serializeBlocksForStorage(blocks),
                createdAt: new Date().toISOString(),
              })
              .run();
            emit({ type: "message_persisted", role: "assistant", id: assistantMsgId });
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
