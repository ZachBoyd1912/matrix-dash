import type { RunnerConfig } from "./config";
import type { RunnerFrame, EventsRequestBody } from "@/lib/runner/protocol";
import { PROTOCOL_VERSION } from "@/lib/runner/protocol";

/** Auth + CF Access headers for every call to the control plane. */
export function authHeaders(cfg: RunnerConfig): Record<string, string> {
  const h: Record<string, string> = { authorization: `Bearer ${cfg.runnerToken}` };
  if (cfg.cfAccessClientId && cfg.cfAccessClientSecret) {
    h["CF-Access-Client-Id"] = cfg.cfAccessClientId;
    h["CF-Access-Client-Secret"] = cfg.cfAccessClientSecret;
  }
  return h;
}

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

  constructor(
    private cfg: RunnerConfig,
    private onAuthError: () => void
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
    try {
      const body: EventsRequestBody = { protocolVersion: PROTOCOL_VERSION, frames: batch };
      const res = await fetch(new URL("/api/runner/events", this.cfg.serverUrl), {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(this.cfg) },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        // Revoked token — surface upward; retrying forever would be noise.
        this.queue.length = 0;
        this.onAuthError();
      } else if (!res.ok) {
        this.queue.unshift(...batch);
      }
    } catch {
      // Network hiccup: requeue and let the next tick retry.
      this.queue.unshift(...batch);
    } finally {
      this.flushing = false;
    }
  }

  get pending(): number {
    return this.queue.length;
  }
}
