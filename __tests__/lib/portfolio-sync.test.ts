import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  slugify,
  reconcile,
  probeSites,
  upsertProjects,
  localPathStatus,
  classifyRemoteFsResult,
  type LocalRepo,
  type RemoteRepo,
} from "@/lib/services/portfolio-sync";
import { getSqlite } from "@/lib/db/client";

const TMP_REAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-pathstatus-"));
afterAll(() => {
  fs.rmSync(TMP_REAL_DIR, { recursive: true, force: true });
});

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

describe("localPathStatus", () => {
  it("reports exists for a real directory", () => {
    expect(localPathStatus(TMP_REAL_DIR)).toBe("exists");
  });

  it("reports gone when the parent is readable but the child is absent", () => {
    expect(localPathStatus(path.join(TMP_REAL_DIR, "definitely-not-here"))).toBe("gone");
  });

  it("reports unknown when the parent itself is not visible from this host", () => {
    // Exactly the production case: a VM asked about a Mac path.
    expect(localPathStatus("/Users/someone/Desktop/whatever")).toBe("unknown");
  });
});

describe("classifyRemoteFsResult", () => {
  it("treats a successful listing as exists", () => {
    expect(classifyRemoteFsResult(true, true)).toBe("exists");
  });

  it("treats ENOENT from the device as genuinely gone", () => {
    expect(
      classifyRemoteFsResult(true, false, "ENOENT: no such file or directory, scandir '/x'")
    ).toBe("gone");
  });

  it("treats any other device error as unknown, not gone", () => {
    // A sandbox rejection must never be read as "the user deleted this".
    expect(classifyRemoteFsResult(true, false, "Path escapes the workspace root")).toBe("unknown");
  });

  it("treats an unreachable device as unknown", () => {
    expect(classifyRemoteFsResult(false, false)).toBe("unknown");
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
          path: path.join(TMP_REAL_DIR, "vanished"),
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

  it("never marks a project missing when the path cannot be verified (the VM case)", () => {
    const rows = reconcile(
      [],
      [],
      [
        {
          id: "p1",
          slug: "matrix-dash",
          path: "/Users/zach/Desktop/matrix-dash",
          githubRepo: null,
        },
      ],
      () => "unknown"
    );
    expect(rows.find((r) => r.slug === "matrix-dash")).toBeUndefined();
  });
});

describe("reconcile — local scan availability", () => {
  const ghRepo = {
    fullName: "ZachBoyd1912/matrix-dash",
    name: "matrix-dash",
    isPrivate: false,
    pushedAt: "2026-08-01T00:00:00Z",
    openIssuesCount: 0,
  };
  const knownLocalRow = {
    id: "p1",
    slug: "matrix-dash",
    path: "/Users/zach/Desktop/matrix-dash",
    githubRepo: null,
  };

  it("does NOT downgrade a known-local project to github-only when the scan could not run", () => {
    // Exactly what happened in production: the device dropped for ~20s during a
    // deploy, the local scan returned [], and every real local project was
    // rewritten as github-only. An empty scan there meant "could not look".
    const rows = reconcile([], [ghRepo], [knownLocalRow], () => "unknown", false);
    const row = rows.find((r) => r.slug === "matrix-dash");
    expect(row?.presence).toBe("local+github");
    expect(row?.path).toBe("/Users/zach/Desktop/matrix-dash");
    expect(row?.presenceOnly).toBe(true); // must not null out real git metadata
  });

  it("DOES mark github-only when the scan genuinely ran and found nothing local", () => {
    const rows = reconcile([], [ghRepo], [knownLocalRow], () => "unknown", true);
    expect(rows.find((r) => r.slug === "matrix-dash")?.presence).toBe("github-only");
  });

  it("treats a repo with no prior local path as github-only even when the scan did not run", () => {
    const rows = reconcile([], [ghRepo], [], () => "unknown", false);
    expect(rows.find((r) => r.slug === "matrix-dash")?.presence).toBe("github-only");
  });
});

describe("upsertProjects", () => {
  it("never lets a null reconciled path overwrite an existing non-null path", () => {
    const sqlite = getSqlite();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO projects
           (id, name, description, purpose, badge, status, slug, path, github_repo,
            visibility, presence, created_at, updated_at)
         VALUES
           ('null-path-guard', 'null-path-guard', '', '', 'code', 'active',
            'null-path-guard', '/tmp/real-checkout', NULL,
            'local', 'local-only', ?, ?)`
      )
      .run(now, now);

    // Simulates a run where the local scan missed the repo (e.g. transient fs
    // hiccup) but the GitHub cache still has it — reconcile() emits path:null.
    upsertProjects([
      {
        slug: "null-path-guard",
        name: "null-path-guard",
        path: null,
        githubRepo: "ZachBoyd1912/null-path-guard",
        visibility: "public",
        presence: "github-only",
        branch: null,
        lastCommitAt: null,
        lastCommitMessage: null,
        dirtyFiles: 0,
        openIssues: 0,
      },
    ]);

    const row = sqlite.prepare("SELECT path FROM projects WHERE id = 'null-path-guard'").get() as {
      path: string | null;
    };
    expect(row.path).toBe("/tmp/real-checkout");
  });

  it("repairs a row stuck at missing when its path is confirmed to exist", () => {
    const rows = reconcile(
      [],
      [],
      [{ id: "p1", slug: "matrix-dash", path: "/x/matrix-dash", githubRepo: null }],
      () => "exists"
    );
    const row = rows.find((r) => r.slug === "matrix-dash");
    expect(row?.presence).toBe("local-only");
    expect(row?.presenceOnly).toBe(true);
  });

  it("repairs to local+github when the row already has a github repo", () => {
    const rows = reconcile(
      [],
      [],
      [{ id: "p2", slug: "thing", path: "/x/thing", githubRepo: "ZachBoyd1912/thing" }],
      () => "exists"
    );
    expect(rows.find((r) => r.slug === "thing")?.presence).toBe("local+github");
  });

  it("presence-only repair does not overwrite stored git metadata with nulls", () => {
    const sqlite = getSqlite();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO projects
           (id, name, description, purpose, badge, status, slug, path, presence,
            branch, dirty_files, created_at, updated_at)
         VALUES ('repair-me','repair-me','','','code','active','repair-me',
                 '/x/repair-me','missing','main',7,?,?)`
      )
      .run(now, now);

    upsertProjects([
      {
        slug: "repair-me",
        name: "repair-me",
        path: "/x/repair-me",
        githubRepo: null,
        visibility: "local",
        presence: "local-only",
        branch: null,
        lastCommitAt: null,
        lastCommitMessage: null,
        dirtyFiles: 0,
        openIssues: 0,
        presenceOnly: true,
      },
    ]);

    const row = sqlite
      .prepare(
        "SELECT presence, branch, dirty_files AS dirtyFiles FROM projects WHERE id='repair-me'"
      )
      .get() as { presence: string; branch: string | null; dirtyFiles: number };
    expect(row.presence).toBe("local-only");
    expect(row.branch).toBe("main"); // preserved, not nulled
    expect(row.dirtyFiles).toBe(7);
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
