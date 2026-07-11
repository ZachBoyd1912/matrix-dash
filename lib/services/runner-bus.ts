import { eq } from "drizzle-orm";
import { getSystemDb } from "@/lib/db/client";
import { runnerDevices, runnerJobs } from "@/lib/db/schema";
import {
  type ServerFrame,
  type JobKind,
  OFFLINE_AFTER_MS,
  HEARTBEAT_MS,
} from "@/lib/runner/protocol";

/* ------------------------------------------------------------------ *
 * Device connection registry + job dispatch for Matrix Runner.
 *
 * A runner's GET /api/runner/connect registers a send() here for its
 * deviceId; anything server-side (agent dispatch, approvals, cancel,
 * kill switch) pushes ServerFrames through it. In-memory + globalThis
 * (one long-lived Node process — same trust model as run-bus/log-bus);
 * a server restart drops connections and runners reconnect with
 * backoff, at which point queued work re-dispatches.
 *
 * Liveness: connection presence is the fast signal; last_seen_at in
 * runner_devices is the durable one (survives restarts, feeds the UI).
 * ------------------------------------------------------------------ */

type SendFn = (frame: ServerFrame) => void;

interface DeviceConn {
  send: SendFn;
  connectedAt: number;
  lastPongAt: number;
  heartbeat: ReturnType<typeof setInterval>;
}

interface Bus {
  conns: Map<string, DeviceConn>; // deviceId → live connection
}

const KEY = Symbol.for("matrix-dash.runner-bus");

function bus(): Bus {
  const g = globalThis as unknown as Record<symbol, Bus | undefined>;
  if (!g[KEY]) g[KEY] = { conns: new Map() };
  return g[KEY]!;
}

function touchLastSeen(deviceId: string): void {
  try {
    getSystemDb()
      .update(runnerDevices)
      .set({ lastSeenAt: new Date().toISOString() })
      .where(eq(runnerDevices.id, deviceId))
      .run();
  } catch {
    /* liveness bookkeeping must never break the stream */
  }
}

/**
 * Register a live runner connection. Replaces any previous connection for the
 * device (a reconnect wins). Returns an unregister fn for the route's cleanup.
 */
export function registerRunner(deviceId: string, send: SendFn): () => void {
  const b = bus();
  const prev = b.conns.get(deviceId);
  if (prev) {
    clearInterval(prev.heartbeat);
    b.conns.delete(deviceId);
  }
  const conn: DeviceConn = {
    send,
    connectedAt: Date.now(),
    lastPongAt: Date.now(),
    // Load-bearing: Cloudflare reaps idle responses (~100s). Ping on a fixed
    // cadence; the runner answers with a pong frame via POST /api/runner/events.
    heartbeat: setInterval(() => {
      try {
        send({ type: "ping", t: Date.now() });
      } catch {
        /* the route's abort handler unregisters us */
      }
    }, HEARTBEAT_MS),
  };
  b.conns.set(deviceId, conn);
  touchLastSeen(deviceId);
  return () => {
    const cur = b.conns.get(deviceId);
    if (cur === conn) {
      clearInterval(conn.heartbeat);
      b.conns.delete(deviceId);
      touchLastSeen(deviceId); // record the disconnect moment
    }
  };
}

/** Record a pong (or any inbound activity) from a device. */
export function markRunnerActivity(deviceId: string): void {
  const conn = bus().conns.get(deviceId);
  if (conn) conn.lastPongAt = Date.now();
  touchLastSeen(deviceId);
}

/** Fast liveness: an open connection that ponged recently. */
export function isRunnerOnline(deviceId: string): boolean {
  const conn = bus().conns.get(deviceId);
  return !!conn && Date.now() - conn.lastPongAt < OFFLINE_AFTER_MS;
}

/** Push a frame to a device. Returns false when the device isn't connected. */
export function sendToRunner(deviceId: string, frame: ServerFrame): boolean {
  const conn = bus().conns.get(deviceId);
  if (!conn) return false;
  try {
    conn.send(frame);
    return true;
  } catch {
    return false;
  }
}

/** Broadcast to every connected runner (kill switch, protocol notices). */
export function broadcastToRunners(frame: ServerFrame): number {
  let n = 0;
  for (const [id] of bus().conns) if (sendToRunner(id, frame)) n++;
  return n;
}

export function connectedDeviceIds(): string[] {
  return [...bus().conns.keys()];
}

/* ── Request/reply (workspace fs ops, IDE control) over the connection ── */

interface PendingReq {
  resolve: (r: { ok: boolean; data?: unknown; error?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}
const REQ_KEY = Symbol.for("matrix-dash.runner-reqs");
function pending(): Map<string, PendingReq> {
  const g = globalThis as unknown as Record<symbol, Map<string, PendingReq> | undefined>;
  if (!g[REQ_KEY]) g[REQ_KEY] = new Map();
  return g[REQ_KEY]!;
}

/** Send an fs_op to a device and await its fs_result (rejects on timeout/offline). */
export function runnerFsRequest(
  deviceId: string,
  op: string,
  args: Record<string, unknown>,
  timeoutMs = 15_000
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending().delete(requestId);
      resolve({ ok: false, error: "Device did not respond (timeout)." });
    }, timeoutMs);
    pending().set(requestId, { resolve, timer });
    const sent = sendToRunner(deviceId, { type: "fs_op", requestId, op, args });
    if (!sent) {
      clearTimeout(timer);
      pending().delete(requestId);
      resolve({ ok: false, error: "Device offline." });
    }
  });
}

/** Resolve a pending fs request from an inbound fs_result frame. */
export function resolveFsResult(
  requestId: string,
  result: { ok: boolean; data?: unknown; error?: string }
): void {
  const p = pending().get(requestId);
  if (!p) return;
  clearTimeout(p.timer);
  pending().delete(requestId);
  p.resolve(result);
}

/**
 * Create a runner_jobs row and dispatch it if the device is online.
 * Returns the job id; status is "dispatched" when pushed, else "queued"
 * (callers with skip-on-offline semantics — cron — check online first).
 */
export function enqueueJob(opts: {
  userId: string;
  deviceId: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  agentRunId?: string;
}): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getSystemDb()
    .insert(runnerJobs)
    .values({
      id,
      userId: opts.userId,
      deviceId: opts.deviceId,
      kind: opts.kind,
      payload: JSON.stringify(opts.payload),
      status: "queued",
      agentRunId: opts.agentRunId ?? null,
      createdAt: now,
    })
    .run();
  dispatchJob(id);
  return id;
}

/**
 * Optional hook to merge memory-only fields (e.g. the Claude subscription
 * token) into a dispatch frame at SEND time without persisting them to
 * runner_jobs. Registered by runner-dispatch.
 */
type DispatchAugmenter = (job: {
  id: string;
  userId: string;
  deviceId: string;
  kind: string;
}) => Record<string, unknown> | undefined;
let dispatchAugmenter: DispatchAugmenter | null = null;
export function setDispatchAugmenter(fn: DispatchAugmenter): void {
  dispatchAugmenter = fn;
}

/** Attempt to push a queued job to its device. Safe to call repeatedly. */
export function dispatchJob(jobId: string): boolean {
  const db = getSystemDb();
  const job = db.select().from(runnerJobs).where(eq(runnerJobs.id, jobId)).get();
  if (!job || job.status !== "queued") return false;
  const stored = JSON.parse(job.payload) as Record<string, unknown>;
  const transient = dispatchAugmenter?.({
    id: job.id,
    userId: job.userId,
    deviceId: job.deviceId,
    kind: job.kind,
  });
  const ok = sendToRunner(job.deviceId, {
    type: "job_dispatch",
    jobId: job.id,
    kind: job.kind as JobKind,
    payload: transient ? { ...stored, ...transient } : stored,
  });
  if (ok) {
    db.update(runnerJobs)
      .set({ status: "dispatched", dispatchedAt: new Date().toISOString() })
      .where(eq(runnerJobs.id, jobId))
      .run();
  }
  return ok;
}

/** On (re)connect: push any still-queued jobs for this device. */
export function dispatchQueuedJobs(deviceId: string): number {
  const rows = getSystemDb()
    .select({ id: runnerJobs.id })
    .from(runnerJobs)
    .where(eq(runnerJobs.deviceId, deviceId))
    .all();
  let n = 0;
  for (const r of rows) if (dispatchJob(r.id)) n++;
  return n;
}

export function updateJobStatus(jobId: string, status: string, error?: string): void {
  const terminal = ["done", "error", "cancelled", "skipped_offline"].includes(status);
  getSystemDb()
    .update(runnerJobs)
    .set({
      status,
      error: error ?? null,
      ...(terminal ? { completedAt: new Date().toISOString() } : {}),
    })
    .where(eq(runnerJobs.id, jobId))
    .run();
}
