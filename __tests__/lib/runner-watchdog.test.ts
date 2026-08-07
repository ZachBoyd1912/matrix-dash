import { describe, it, expect } from "vitest";
import { isStreamStale, STALE_AFTER_MS } from "@/runner/src/connect";

/**
 * The runner used to await reader.read() forever on a silently-dropped
 * connection. The server pings every 20s, so 60s of silence means three
 * missed pings and a dead stream.
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

  it("defaults to three missed 20s heartbeats", () => {
    expect(STALE_AFTER_MS).toBe(60_000);
  });
});
