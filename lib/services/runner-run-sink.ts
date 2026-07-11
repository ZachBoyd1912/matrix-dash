import { eq } from "drizzle-orm";
import { runWithUser } from "@/lib/db/context";
import { getDb, getSystemDb } from "@/lib/db/client";
import { agentRuns, users } from "@/lib/db/schema";
import { appendEvent, serializeBlocksForStorage, type Block } from "@/lib/chat/blocks";
import { publishRunEvent } from "./run-bus";
import type { StreamEvent } from "@/lib/chat/blocks";

/* ------------------------------------------------------------------ *
 * Server-side sink for a runner-executed agent run. The device streams
 * StreamEvents over POST /api/runner/events; this rebuilds the Block[]
 * incrementally (batches arrive across many POSTs), fans out to the live
 * run view (run-bus, unchanged), and throttle-persists into the OWNER's
 * per-account agent_runs.blocks — the mirror image of executeRun's in-
 * process emit(), which stays untouched on the server-legacy path.
 * ------------------------------------------------------------------ */

interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  numTurns: number;
}

interface RunAccum {
  blocks: Block[];
  idMap: Map<string, number>;
  lastFlush: number;
  userId: string;
  usage?: RunUsage;
  result?: string;
}

interface Sink {
  runs: Map<string, RunAccum>;
}

const KEY = Symbol.for("matrix-dash.runner-run-sink");

function sink(): Sink {
  const g = globalThis as unknown as Record<symbol, Sink | undefined>;
  if (!g[KEY]) g[KEY] = { runs: new Map() };
  return g[KEY]!;
}

function accum(runId: string, userId: string): RunAccum {
  const s = sink();
  let a = s.runs.get(runId);
  if (!a) {
    a = { blocks: [], idMap: new Map(), lastFlush: 0, userId };
    s.runs.set(runId, a);
  }
  return a;
}

function isOwnerUser(userId: string): boolean {
  const row = getSystemDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.role === "owner";
}

function persist(a: RunAccum, runId: string): void {
  runWithUser({ userId: a.userId, isOwner: isOwnerUser(a.userId) }, () => {
    try {
      getDb()
        .update(agentRuns)
        .set({ blocks: serializeBlocksForStorage(a.blocks) })
        .where(eq(agentRuns.id, runId))
        .run();
    } catch {
      /* transient; a later batch retries */
    }
  });
}

/** Ingest a batch of StreamEvents the device reported for a run. */
export function ingestRunEvents(runId: string, userId: string, events: StreamEvent[]): void {
  const a = accum(runId, userId);
  for (const ev of events) {
    appendEvent(a.blocks, a.idMap, ev);
    publishRunEvent(runId, ev); // live UI fan-out (same channel as in-process runs)
  }
  const now = Date.now();
  if (now - a.lastFlush >= 1000) {
    a.lastFlush = now;
    persist(a, runId);
  }
}

/** Stash the latest usage report for a run (survives across event batches). */
export function recordRunnerUsage(runId: string, userId: string, usage: RunUsage): void {
  accum(runId, userId).usage = usage;
}

/** Stash the run's final result text (from the SDK result message). */
export function recordRunnerResult(runId: string, userId: string, result: string): void {
  accum(runId, userId).result = result;
}

/** Terminal update: final block flush + run row status/usage, in owner context. */
export function finalizeRunnerRun(
  runId: string,
  userId: string,
  patch: { status: string; error?: string | null }
): void {
  const a = accum(runId, userId);
  const usage = a.usage;
  runWithUser({ userId, isOwner: isOwnerUser(userId) }, () => {
    try {
      getDb()
        .update(agentRuns)
        .set({
          status: patch.status,
          ...(a.blocks.length ? { blocks: serializeBlocksForStorage(a.blocks) } : {}),
          ...(a.result !== undefined ? { result: a.result.slice(0, 8000) } : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(usage
            ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                costUsd: usage.costUsd,
                numTurns: usage.numTurns,
              }
            : {}),
          endedAt: new Date().toISOString(),
        })
        .where(eq(agentRuns.id, runId))
        .run();
    } catch {
      /* best-effort terminal persistence */
    }
  });
  sink().runs.delete(runId);
}

/** Mark a run "running" + started when the device begins it. */
export function markRunnerRunStarted(runId: string, userId: string): void {
  runWithUser({ userId, isOwner: isOwnerUser(userId) }, () => {
    try {
      getDb()
        .update(agentRuns)
        .set({ status: "running", startedAt: new Date().toISOString() })
        .where(eq(agentRuns.id, runId))
        .run();
    } catch {
      /* ignore */
    }
  });
}
