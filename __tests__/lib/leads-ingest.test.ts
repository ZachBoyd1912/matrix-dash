import { describe, expect, it } from "vitest";
import { isPublicApi } from "@/lib/auth/constants";

describe("lead ingest route exposure", () => {
  it("is reachable without a session cookie", () => {
    expect(isPublicApi("/api/leads/ingest")).toBe(true);
  });

  it("does not open the whole /api/leads prefix", () => {
    expect(isPublicApi("/api/leads")).toBe(false);
    expect(isPublicApi("/api/leads/list")).toBe(false);
  });
});
