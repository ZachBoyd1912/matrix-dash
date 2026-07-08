import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isCrossSiteMutation, selfOrigin } from "@/middleware";

function req(url: string, headers: Record<string, string>) {
  return new NextRequest(url, { headers });
}

describe("selfOrigin", () => {
  it("prefers X-Forwarded-Proto/Host behind a TLS-terminating reverse proxy", () => {
    // Regression: Caddy proxies https://matrix.zbautomations.ie to plain
    // http://localhost:3000 — req.nextUrl alone would report "http", not
    // the scheme the browser actually connected with.
    const r = req("http://localhost:3000/api/workspace", {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "matrix.zbautomations.ie",
    });
    expect(selfOrigin(r)).toBe("https://matrix.zbautomations.ie");
  });

  it("falls back to nextUrl when there's no reverse proxy (local dev)", () => {
    const r = req("http://localhost:3000/api/workspace", {});
    expect(selfOrigin(r)).toBe("http://localhost:3000");
  });
});

describe("isCrossSiteMutation", () => {
  it("does not flag a real same-origin production request as cross-site", () => {
    // Exact scenario captured from a production HAR: POST /api/workspace
    // from the IDE page was wrongly 403'd as "Cross-site request blocked"
    // even though Origin/Referer both genuinely match the site.
    const r = req("http://localhost:3000/api/workspace", {
      origin: "https://matrix.zbautomations.ie",
      referer: "https://matrix.zbautomations.ie/dashboard/ide",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "matrix.zbautomations.ie",
    });
    expect(isCrossSiteMutation(r)).toBe(false);
  });

  it("still flags a genuinely mismatched Origin as cross-site", () => {
    const r = req("http://localhost:3000/api/workspace", {
      origin: "https://evil.example.com",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "matrix.zbautomations.ie",
    });
    expect(isCrossSiteMutation(r)).toBe(true);
  });

  it("allows requests with neither Origin nor Referer (direct API/CLI use)", () => {
    const r = req("http://localhost:3000/api/workspace", {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "matrix.zbautomations.ie",
    });
    expect(isCrossSiteMutation(r)).toBe(false);
  });
});
