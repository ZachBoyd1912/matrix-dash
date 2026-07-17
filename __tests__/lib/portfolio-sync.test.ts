import { describe, it, expect, vi, afterEach } from "vitest";
import {
  slugify,
  reconcile,
  probeSites,
  type LocalRepo,
  type RemoteRepo,
} from "@/lib/services/portfolio-sync";
import { getSqlite } from "@/lib/db/client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("slugify", () => {
  it("normalizes underscores, spaces and case to the GitHub-style slug", () => {
    expect(slugify("fansly_ai_automation")).toBe("fansly-ai-automation");
    expect(slugify("TGF Landing Page")).toBe("tgf-landing-page");
    expect(slugify("bolt.new-custom")).toBe("bolt-new-custom");
  });
});

describe("reconcile", () => {
  const local = (over: Partial<LocalRepo> = {}): LocalRepo => ({
    name: "fansly_ai_automation",
    path: "/tmp/fansly_ai_automation",
    branch: "main",
    lastCommitAt: "2026-07-01T00:00:00Z",
    lastCommitMessage: "feat: x",
    dirtyFiles: 2,
    ...over,
  });
  const remote = (over: Partial<RemoteRepo> = {}): RemoteRepo => ({
    fullName: "ZachBoyd1912/fansly-ai-automation",
    name: "fansly-ai-automation",
    isPrivate: true,
    pushedAt: "2026-07-02T00:00:00Z",
    openIssuesCount: 3,
    ...over,
  });

  it("merges a local dir and its slug-variant GitHub repo into one local+github row", () => {
    const rows = reconcile([local()], [remote()], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].presence).toBe("local+github");
    expect(rows[0].slug).toBe("fansly-ai-automation");
    expect(rows[0].visibility).toBe("private");
    expect(rows[0].githubRepo).toBe("ZachBoyd1912/fansly-ai-automation");
    expect(rows[0].dirtyFiles).toBe(2);
    expect(rows[0].openIssues).toBe(3);
  });

  it("keeps github-only and local-only rows distinct", () => {
    const rows = reconcile(
      [local({ name: "fincept-terminal", path: "/tmp/fincept-terminal" })],
      [remote({ fullName: "ZachBoyd1912/job-hunter", name: "job-hunter", isPrivate: true })],
      []
    );
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    expect(bySlug.get("fincept-terminal")?.presence).toBe("local-only");
    expect(bySlug.get("fincept-terminal")?.visibility).toBe("local");
    expect(bySlug.get("job-hunter")?.presence).toBe("github-only");
  });

  it("marks an existing row whose recorded path vanished as missing (never deletes)", () => {
    const rows = reconcile(
      [],
      [],
      [
        {
          id: "p1",
          slug: "youtube-pipeline",
          path: "/nonexistent/youtube-pipeline",
          githubRepo: null,
        },
      ]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].presence).toBe("missing");
  });

  it("honors a manual githubRepo override over the slug heuristic", () => {
    const rows = reconcile(
      [local({ name: "weird_local_name", path: "/tmp/weird_local_name" })],
      [remote({ fullName: "ZachBoyd1912/totally-different", name: "totally-different" })],
      [
        {
          id: "p2",
          slug: "weird-local-name",
          path: "/tmp/weird_local_name",
          githubRepo: "ZachBoyd1912/totally-different",
        },
      ]
    );
    const merged = rows.find((r) => r.githubRepo === "ZachBoyd1912/totally-different");
    expect(merged?.presence).toBe("local+github");
  });
});

describe("probeSites", () => {
  it("treats an exact expected-status match (302, redirect not followed) as OK", async () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        "INSERT OR REPLACE INTO site_health (id, url, label, expected_status) VALUES ('test-probe-302','https://probe-test.invalid','probe-test',302)"
      )
      .run();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 302 }));

    await probeSites(["test-probe-302"]);

    // The probe MUST NOT follow redirects — a followed redirect would report
    // the Cloudflare Access login page, not the 302 that means "healthy".
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://probe-test.invalid",
      expect.objectContaining({ redirect: "manual", method: "HEAD" })
    );
    const row = sqlite
      .prepare(
        "SELECT last_status AS s, consecutive_failures AS f, last_ok_at AS ok FROM site_health WHERE id='test-probe-302'"
      )
      .get() as { s: number; f: number; ok: string | null };
    expect(row.s).toBe(302);
    expect(row.f).toBe(0);
    expect(row.ok).toBeTruthy();
  });

  it("counts a mismatched status as a failure", async () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        "INSERT OR REPLACE INTO site_health (id, url, label, expected_status) VALUES ('test-probe-500','https://probe-test-2.invalid','probe-test-2',200)"
      )
      .run();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    await probeSites(["test-probe-500"]);

    const row = sqlite
      .prepare(
        "SELECT last_status AS s, consecutive_failures AS f FROM site_health WHERE id='test-probe-500'"
      )
      .get() as { s: number; f: number };
    expect(row.s).toBe(500);
    expect(row.f).toBe(1);
  });
});
