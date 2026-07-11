import { describe, it, expect } from "vitest";
import { handleIde } from "@/runner/src/ide-manager";

/**
 * IDE manager state machine — the paths that don't spawn a real code-server
 * (spawning a full VS Code server belongs in on-device testing, not unit tests).
 */

describe("runner IDE manager", () => {
  it("reports not-running before start", async () => {
    const s = await handleIde("status");
    expect(s.ok).toBe(true);
    expect(s.running).toBe(false);
  });

  it("stop is a safe no-op when nothing is running", async () => {
    const s = await handleIde("stop");
    expect(s.ok).toBe(true);
    expect(s.running).toBe(false);
  });

  it("rejects an unknown action", async () => {
    const s = await handleIde("frobnicate");
    expect(s.ok).toBe(false);
    expect(s.error).toContain("Unknown IDE action");
  });
});
