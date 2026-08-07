import type { RunnerConfig } from "./config";
import type { RunnerFrame, EventsRequestBody } from "@/lib/runner/protocol";
import { PROTOCOL_VERSION } from "@/lib/runner/protocol";
import { RUNNER_VERSION } from "./version";

/** Auth + CF Access headers for every call to the control plane. */
export function authHeaders(cfg: RunnerConfig): Record<string, string> {
  const h: Record<string, string> = {
    authorization: `Bearer ${cfg.runnerToken}`,
    // Reported on every request so the server can keep runner_devices.app_version
    // current. It was previously written only at pair time, so a device that
    // self-updated kept showing its original version in Settings → Devices
    // forever — actively misleading when diagnosing whether a fix had landed.
    "x-runner-version": RUNNER_VERSION,
  };
  if (cfg.cfAccessClientId && cfg.cfAccessClientSecret) {
    h["CF-Access-Client-Id"] = cfg.cfAccessClientId;
    h["CF-Access-Client-Secret"] = cfg.cfAccessClientSecret;
  }
  return h;
}

/**
 * How long a single flush may take before it is abandoned.
 *
 * Load-bearing, not a nicety. `flushing` is a latch: a fetch that never
 * settles leaves it true forever, so every later flush returns immediately
 * and the device goes permanently silent while still receiving pings — the
 * downlink watchdog stays happy because frames keep arriving, so nothing
 * notices. That is exactly what happened after a production deploy on
 * 07/08/2026: the runner logged "connected", the server showed it offline
 * for eight minutes, and only a process restart cleared it. Same failure as
 * the downlink's own missing timeout, in the other direction.
 */
const FLUSH_TIMEOUT_MS = 20_000;

/**
 * Batched uplink to POST /api/runner/events. Frames queue locally and flush
 * every second (or at 100 frames, or on demand) — one HTTP round trip carries
 * many frames, keeping the runner well inside the server's rate budget.
 * Failed flushes requeue at the front; frames are never silently dropped.
 */
export class EventUplink {
  private queue: RunnerFrame[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  /** Consecutive failed flushes, so repeated failure is reported once. */
  private consecutiveFailures = 0;

  constructor(
    private cfg: RunnerConfig,
    private onAuthError: () => void,
    /** Optional logger — a silently failing uplink is indistinguishable from a healthy idle one. */
    private log: (msg: string) => void = () => {}
  ) {}

  start(): void {
    if (!this.timer) this.timer = setInterval(() => void this.flush(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  push(frame: RunnerFrame): void {
    this.queue.push(frame);
    if (this.queue.length >= 100) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, 500);
    // An explicit controller rather than AbortSignal.timeout(): that helper is
    // backed by a native timer no test clock can advance, and this deserves a
    // test that actually exercises the hang.
    const abort = new AbortController();
    const deadline = setTimeout(
      () => abort.abort(new Error(`flush timed out after ${FLUSH_TIMEOUT_MS}ms`)),
      FLUSH_TIMEOUT_MS
    );
    try {
      const body: EventsRequestBody = { protocolVersion: PROTOCOL_VERSION, frames: batch };
      const res = await fetch(new URL("/api/runner/events", this.cfg.serverUrl), {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(this.cfg) },
        body: JSON.stringify(body),
        // Without this a hung connection never settles and `flushing` latches
        // on forever — see FLUSH_TIMEOUT_MS.
        signal: abort.signal,
      });
      if (res.status === 401) {
        // Revoked token — surface upward; retrying forever would be noise.
        this.queue.length = 0;
        this.onAuthError();
      } else if (!res.ok) {
        this.queue.unshift(...batch);
        this.noteFailure(`HTTP ${res.status}`);
      } else {
        this.noteSuccess();
      }
    } catch (err) {
      // Network hiccup or the timeout above: requeue and let the next tick retry.
      this.queue.unshift(...batch);
      this.noteFailure(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(deadline);
      this.flushing = false;
    }
  }

  // Report the first failure and then every 30th (~30s apart), so a real
  // outage is visible in the log without a healthy reconnect spamming it.
  private noteFailure(reason: string): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures === 1 || this.consecutiveFailures % 30 === 0) {
      this.log(
        `uplink failing (${this.consecutiveFailures}x): ${reason} — ${this.queue.length} frames queued`
      );
    }
  }

  private noteSuccess(): void {
    if (this.consecutiveFailures > 0) {
      this.log(`uplink recovered after ${this.consecutiveFailures} failed flush(es)`);
      this.consecutiveFailures = 0;
    }
  }

  get pending(): number {
    return this.queue.length;
  }
}
