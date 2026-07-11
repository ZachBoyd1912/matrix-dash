import { describe, it, expect } from "vitest";
import { isNewerVersion } from "@/runner/src/update";

describe("runner auto-update version compare", () => {
  it("detects newer versions", () => {
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("0.1.1", "0.1.0")).toBe(true);
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true); // numeric, not lexical
  });
  it("rejects same-or-older versions (no needless updates)", () => {
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(false);
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(false);
  });
  it("handles unequal segment counts", () => {
    expect(isNewerVersion("1.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.1", "1.0")).toBe(true);
  });
});
