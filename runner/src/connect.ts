import type { RunnerConfig } from "./config";
import { authHeaders, EventUplink } from "./api";
import { runJob, cancelJob, cancelAllJobs } from "./jobs";
import type { ServerFrame } from "@/lib/runner/protocol";

/**
 * The runner's main loop: hold GET /api/runner/connect open, act on each
 * NDJSON ServerFrame, reconnect forever with jittered exponential backoff.
 * The uplink (POST /api/runner/events) runs alongside and answers pings —
 * those pong frames are what keep the device marked online server-side.
 */

const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;

export interface ConnectLoopOptions {
  cfg: RunnerConfig;
  log: (msg: string) => void;
  /** Called when the server says our token is dead — stop, don't hammer. */
  onAuthError: () => void;
  /** Test hook: resolve to stop the loop after the current connection drops. */
  stopSignal?: AbortSignal;
}

export async function connectLoop(opts: ConnectLoopOptions): Promise<void> {
  const { cfg, log } = opts;
  const uplink = new EventUplink(cfg, opts.onAuthError);
  uplink.start();
  let backoff = BACKOFF_MIN_MS;
  let stopped = false;
  opts.stopSignal?.addEventListener("abort", () => {
    stopped = true;
  });

  while (!stopped) {
    try {
      const res = await fetch(new URL("/api/runner/connect", cfg.serverUrl), {
        headers: authHeaders(cfg),
        signal: opts.stopSignal,
      });
      if (res.status === 401) {
        log("token rejected (revoked?) — stopping");
        opts.onAuthError();
        break;
      }
      if (!res.ok || !res.body) throw new Error(`connect failed: HTTP ${res.status}`);

      log("connected");
      backoff = BACKOFF_MIN_MS;
      await consumeFrames(res.body, uplink, log);
      log("connection closed by server");
    } catch (err) {
      if (stopped) break;
      log(`connection error: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (stopped) break;
    const jitter = Math.random() * 0.3 + 0.85;
    const wait = Math.min(backoff * jitter, BACKOFF_MAX_MS);
    log(`reconnecting in ${Math.round(wait / 1000)}s`);
    await new Promise((r) => setTimeout(r, wait));
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
  }

  // Drain what we can before exiting.
  await uplink.flush();
  uplink.stop();
}

async function consumeFrames(
  body: ReadableStream<Uint8Array>,
  uplink: EventUplink,
  log: (msg: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let frame: ServerFrame;
      try {
        frame = JSON.parse(line) as ServerFrame;
      } catch {
        continue; // never die on a malformed line
      }
      handleFrame(frame, uplink, log);
    }
  }
}

function handleFrame(frame: ServerFrame, uplink: EventUplink, log: (msg: string) => void): void {
  switch (frame.type) {
    case "hello":
      log(`hello: device ${frame.deviceId} (protocol v${frame.protocolVersion})`);
      break;
    case "ping":
      uplink.push({ type: "pong", t: frame.t });
      // Answer promptly — this is the liveness signal.
      void uplink.flush();
      break;
    case "job_dispatch":
      log(`job ${frame.jobId} (${frame.kind})`);
      void runJob(frame.jobId, frame.kind, frame.payload, uplink);
      break;
    case "job_cancel":
      cancelJob(frame.jobId);
      break;
    case "kill_switch":
      log("KILL SWITCH received — aborting all jobs");
      cancelAllJobs();
      break;
    case "approval_decision":
      // P2: resolved by the agent-run handler's approval bridge.
      break;
    case "update_available":
    case "update_required":
      // P1b: auto-updater picks these up.
      log(`server signals update (${frame.type})`);
      break;
    default:
      break; // forward compatibility
  }
}
