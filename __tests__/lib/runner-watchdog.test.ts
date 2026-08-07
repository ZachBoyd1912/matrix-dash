import { describe, it, expect, vi } from "vitest";
import { isStreamStale, STALE_AFTER_MS, connectLoop } from "@/runner/src/connect";
import { OFFLINE_AFTER_MS } from "@/lib/runner/protocol";
import type { RunnerConfig } from "@/runner/src/config";

/**
 * The runner used to await reader.read() forever on a silently-dropped
 * connection. The server (runner-bus.ts isRunnerOnline) marks a device
 * offline after OFFLINE_AFTER_MS of silence, so the client must give up
 * no later than that or there's a window where the server has already
 * written the device off while the client still thinks it's connected.
 */
describe("isStreamStale", () => {
  it("is not stale while frames are arriving", () => {
    const now = 1_000_000;
    expect(isStreamStale(now - 5_000, now, STALE_AFTER_MS)).toBe(false);
  });

  it("is not stale at exactly the threshold", () => {
    const now = 1_000_000;
    expect(isStreamStale(now - STALE_AFTER_MS, now, STALE_AFTER_MS)).toBe(false);
  });

  it("is stale past the threshold", () => {
    const now = 1_000_000;
    expect(isStreamStale(now - (STALE_AFTER_MS + 1), now, STALE_AFTER_MS)).toBe(true);
  });

  it("is derived from the server's own offline threshold, not an independent literal", () => {
    // Tuning one without the other reopens the exact gap this watchdog
    // exists to close: server says offline, client still waiting.
    expect(STALE_AFTER_MS).toBe(OFFLINE_AFTER_MS);
  });
});

describe("connectLoop watchdog integration", () => {
  it("interrupts a stalled read and reconnects, cleaning up its timers", async () => {
    vi.useFakeTimers();
    try {
      const logs: string[] = [];
      const log = (msg: string) => logs.push(msg);

      const stopController = new AbortController();
      let fetchCallCount = 0;

      // Each connect attempt gets an NDJSON stream that delivers one `hello`
      // frame and then goes silent forever — never closes, never sends
      // another frame. That silence is exactly what a Cloudflare-reaped or
      // NAT-expired connection looks like to the client: no clean close, no
      // error, just a `reader.read()` that never settles on its own.
      const mockFetch = vi.fn((_url: unknown, init?: RequestInit) => {
        fetchCallCount++;
        const signal = init?.signal as AbortSignal | undefined;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "hello",
                  deviceId: "device-1",
                  protocolVersion: 1,
                  serverTime: new Date().toISOString(),
                }) + "\n"
              )
            );
            // Mirrors what the reviewer confirmed empirically in real Node:
            // aborting the signal passed to fetch() rejects an in-flight
            // body read. We model that same contract here rather than
            // simulating staleness by calling isStreamStale ourselves.
            signal?.addEventListener("abort", () => {
              controller.error(new DOMException("The operation was aborted.", "AbortError"));
            });
          },
        });
        return Promise.resolve(new Response(stream, { status: 200 }));
      });
      vi.stubGlobal("fetch", mockFetch);

      const cfg: RunnerConfig = {
        serverUrl: "https://example.invalid",
        deviceId: "device-1",
        runnerToken: "test-token",
        deviceName: "test-device",
      };

      const donePromise = connectLoop({
        cfg,
        log,
        onAuthError: () => {},
        stopSignal: stopController.signal,
        staleAfterMs: 1_000, // well under one 5s watchdog tick
      });

      // Let the first connect land and the hello frame process.
      await vi.advanceTimersByTimeAsync(50);
      expect(fetchCallCount).toBe(1);

      // One watchdog tick past the stale threshold: this is the moment the
      // regression this task exists for would hang forever instead.
      await vi.advanceTimersByTimeAsync(5_000);
      expect(logs.some((l) => l.includes("assuming dead, reconnecting"))).toBe(true);

      // Jittered backoff wait, then the loop must actually attempt a second
      // connection — bounded progress, not merely "didn't throw".
      await vi.advanceTimersByTimeAsync(2_000);
      expect(fetchCallCount).toBe(2);

      // Stop the loop (after the reconnect, per the review) so the test
      // terminates instead of running forever.
      stopController.abort();
      await vi.advanceTimersByTimeAsync(0);

      await donePromise; // must resolve — a real hang would time out the test

      // Proves the interval cleanup directly: no watchdog or uplink timer
      // survives the loop exiting, across either connection attempt.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
