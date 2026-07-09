import type { StreamEvent } from "@/lib/chat/blocks";

/* ------------------------------------------------------------------ *
 * Per-run event bus for autonomous agent runs. The runner publishes
 * StreamEvents here as an SDK run progresses; the run-stream route
 * (/api/agents/runs/[runId]/stream) subscribes for the live tail after
 * replaying the persisted blocks snapshot.
 *
 * A small ring buffer per run lets a late subscriber catch up on events
 * emitted just before it connected. Stored on globalThis so it survives
 * Next dev HMR, mirroring lib/services/log-bus.ts.
 * ------------------------------------------------------------------ */

const PER_RUN_CAP = 500;

type Sub = (ev: StreamEvent) => void;

interface RunChannel {
  buffer: StreamEvent[];
  subs: Set<Sub>;
}

interface Bus {
  channels: Map<string, RunChannel>;
}

const KEY = Symbol.for("matrix-dash.run-bus");

function bus(): Bus {
  const g = globalThis as unknown as Record<symbol, Bus | undefined>;
  if (!g[KEY]) g[KEY] = { channels: new Map() };
  return g[KEY]!;
}

function channel(runId: string): RunChannel {
  const b = bus();
  let ch = b.channels.get(runId);
  if (!ch) {
    ch = { buffer: [], subs: new Set<Sub>() };
    b.channels.set(runId, ch);
  }
  return ch;
}

/** Publish one event for a run — fans out to live subscribers and buffers it. */
export function publishRunEvent(runId: string, ev: StreamEvent): void {
  const ch = channel(runId);
  ch.buffer.push(ev);
  if (ch.buffer.length > PER_RUN_CAP) ch.buffer.splice(0, ch.buffer.length - PER_RUN_CAP);
  for (const s of ch.subs) {
    try {
      s(ev);
    } catch {
      /* a broken subscriber must never break the run */
    }
  }
}

/** Snapshot of buffered events for a run (for late-connecting subscribers). */
export function snapshotRunEvents(runId: string): StreamEvent[] {
  return channel(runId).buffer.slice();
}

export function subscribeRunEvents(runId: string, cb: Sub): () => void {
  const ch = channel(runId);
  ch.subs.add(cb);
  return () => {
    ch.subs.delete(cb);
  };
}

/** Drop a run's channel once it's terminal and nothing is listening. */
export function closeRunChannel(runId: string): void {
  const ch = bus().channels.get(runId);
  if (ch && ch.subs.size === 0) bus().channels.delete(runId);
}
