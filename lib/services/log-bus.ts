import { inferLevel, makeLogId, type LogLine } from "@/lib/console/types";

/* ------------------------------------------------------------------ *
 * Server-side log bus for Matrix Dashboard's OWN backend output.
 *
 * `instrumentation.ts` tees process.stdout/stderr in here; the
 * /api/console/server route reads the snapshot + subscribes for live
 * tail. A capped ring buffer keeps memory bounded; a Set of subscribers
 * fans new lines out to any open streams.
 *
 * Stored on globalThis so it survives Next dev HMR (the module may be
 * re-evaluated, but the buffer/subscribers must persist).
 * ------------------------------------------------------------------ */

const CAP = 2000;

type Sub = (line: LogLine) => void;

interface Bus {
  buffer: LogLine[];
  subs: Set<Sub>;
}

const KEY = Symbol.for("matrix-dash.log-bus");

function bus(): Bus {
  const g = globalThis as unknown as Record<symbol, Bus | undefined>;
  if (!g[KEY]) g[KEY] = { buffer: [], subs: new Set<Sub>() };
  return g[KEY]!;
}

/** Push one raw line from a server stream. Text should already be ANSI-stripped. */
export function pushServerLog(stream: "stdout" | "stderr", rawText: string): void {
  const text = rawText.replace(/\s+$/, "");
  if (!text) return;
  const ts = Date.now();
  const line: LogLine = {
    id: makeLogId(ts),
    ts,
    level: inferLevel(text, stream === "stderr" ? "warn" : "log"),
    source: "dash-server",
    text,
  };
  const b = bus();
  b.buffer.push(line);
  if (b.buffer.length > CAP) b.buffer.splice(0, b.buffer.length - CAP);
  for (const s of b.subs) {
    try {
      s(line);
    } catch {
      /* a broken subscriber must never break logging */
    }
  }
}

export function snapshotServerLogs(): LogLine[] {
  return bus().buffer.slice();
}

export function subscribeServerLogs(cb: Sub): () => void {
  const b = bus();
  b.subs.add(cb);
  return () => {
    b.subs.delete(cb);
  };
}

export function clearServerLogs(): void {
  bus().buffer.length = 0;
}
