import { describe, it, expect, vi } from "vitest";
import { EventUplink } from "@/runner/src/api";
import type { RunnerConfig } from "@/runner/src/config";

const cfg: RunnerConfig = {
  serverUrl: "https://example.invalid",
  deviceId: "device-1",
  runnerToken: "test-token",
  deviceName: "test-device",
};

/**
 * The uplink is what keeps a device marked online: it carries the pong for
 * every server ping. `flushing` is a latch, so a fetch that never settles
 * leaves it true forever and the device goes permanently silent — while the
 * DOWNLINK watchdog stays perfectly happy, because pings keep arriving and
 * keep resetting it. Nothing notices.
 *
 * This is not hypothetical: after the 07/08/2026 production deploy the runner
 * logged "connected", the server showed the device offline for eight minutes,
 * and only restarting the process cleared it.
 */
describe("EventUplink flush timeout", () => {
  it("recovers from a flush whose request never settles", async () => {
    vi.useFakeTimers();
    try {
      const logs: string[] = [];
      let attempts = 0;
      let secondAttemptSent = false;

      const mockFetch = vi.fn((_url: unknown, init?: RequestInit) => {
        attempts++;
        if (attempts === 1) {
          // A connection that hangs: no response, no error, forever. Only the
          // abort signal can end it — which is the whole point.
          return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            signal?.addEventListener("abort", () =>
              reject(new DOMException("The operation was aborted.", "TimeoutError"))
            );
          });
        }
        secondAttemptSent = true;
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      });
      vi.stubGlobal("fetch", mockFetch);

      const uplink = new EventUplink(
        cfg,
        () => {},
        (m) => logs.push(m)
      );
      uplink.start();

      uplink.push({ type: "pong", t: 1 });
      await vi.advanceTimersByTimeAsync(1_100);
      expect(attempts).toBe(1);

      // Every tick during the hang must be a no-op — that is the latch working
      // as designed, and why the timeout is the only way out.
      uplink.push({ type: "pong", t: 2 });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(attempts).toBe(1);

      // Past the flush timeout the request aborts, the latch clears, and the
      // next tick actually sends. Without the timeout this stays at 1 forever.
      await vi.advanceTimersByTimeAsync(25_000);
      expect(secondAttemptSent).toBe(true);
      expect(attempts).toBeGreaterThan(1);

      uplink.stop();
      expect(logs.some((l) => l.includes("uplink failing"))).toBe(true);
      expect(logs.some((l) => l.includes("uplink recovered"))).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("requeues a rejected batch rather than dropping frames", async () => {
    vi.useFakeTimers();
    try {
      const logs: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response("nope", { status: 500 })))
      );

      const uplink = new EventUplink(
        cfg,
        () => {},
        (m) => logs.push(m)
      );
      uplink.start();
      uplink.push({ type: "pong", t: 1 });
      await vi.advanceTimersByTimeAsync(1_100);

      expect(uplink.pending).toBe(1);
      // A failing uplink must say so. Silence here is indistinguishable from
      // a healthy idle runner, which is how the outage went unnoticed.
      expect(logs.some((l) => l.includes("uplink failing (1x): HTTP 500"))).toBe(true);
      uplink.stop();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("drops the queue and reports auth failure on a revoked token", async () => {
    vi.useFakeTimers();
    try {
      let authError = false;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response("revoked", { status: 401 })))
      );

      const uplink = new EventUplink(cfg, () => {
        authError = true;
      });
      uplink.start();
      uplink.push({ type: "pong", t: 1 });
      await vi.advanceTimersByTimeAsync(1_100);

      expect(authError).toBe(true);
      expect(uplink.pending).toBe(0);
      uplink.stop();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
