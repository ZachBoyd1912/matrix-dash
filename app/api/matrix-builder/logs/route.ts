import {
  readBuilderLogTail,
  readBuilderLogSince,
  clearBuilderLog,
} from "@/lib/services/matrix-builder";
import { inferLevel, makeLogId, stripAnsi, type LogLine } from "@/lib/console/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Split a raw blob from dev.log into normalized LogLines (skip blanks). */
function toLines(text: string): LogLine[] {
  const out: LogLine[] = [];
  for (const raw of text.split("\n")) {
    const t = stripAnsi(raw).replace(/\s+$/, "");
    if (!t) continue;
    const ts = Date.now();
    out.push({
      id: makeLogId(ts),
      ts,
      level: inferLevel(t, "log"),
      source: "builder-server",
      text: t,
    });
  }
  return out;
}

/**
 * Streams the Matrix Builder dev-server log (`~/.matrix-dash/matrix-builder/dev.log`)
 * as NDJSON: a 64KB tail snapshot, then new lines polled from the file. Emits a
 * `{__control:"reset"}` marker if the file is truncated (Clear) or rotated.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
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
          controller.close();
        } catch {
          /* already closed */
        }
      };
      if (req.signal.aborted) return finish();
      req.signal.addEventListener("abort", finish);

      const snap = readBuilderLogTail();
      let offset = snap.offset;
      for (const line of toLines(snap.text)) send(line);

      while (!closed && !req.signal.aborted) {
        await sleep(POLL_MS);
        if (closed || req.signal.aborted) break;
        const upd = readBuilderLogSince(offset);
        offset = upd.offset;
        if (upd.reset) send({ __control: "reset" });
        if (upd.text) for (const line of toLines(upd.text)) send(line);
      }
      finish();
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
  clearBuilderLog();
  return Response.json({ ok: true });
}
