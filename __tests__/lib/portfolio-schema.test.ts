import { describe, it, expect } from "vitest";
import { getSqlite } from "@/lib/db/client";

// The temp DB is shared across the whole vitest run (vitest.setup.ts mocks
// db-path), so these tests assert schema shape and seed guards — never
// global row counts on tables other suites write to.
describe("portfolio schema", () => {
  it("projects table has the truth-sync columns", () => {
    const cols = (
      getSqlite().prepare("PRAGMA table_info(projects)").all() as { name: string }[]
    ).map((c) => c.name);
    for (const col of [
      "slug",
      "github_repo",
      "visibility",
      "presence",
      "last_commit_at",
      "last_commit_message",
      "branch",
      "dirty_files",
      "open_issues",
      "last_synced_at",
      "is_archived",
    ]) {
      expect(cols, `projects.${col}`).toContain(col);
    }
  });

  it("seedProjects is neutered — a fresh DB gets no fiction catalog", () => {
    // The old seeder inserted 12 hardcoded rows with these ids; sync is now
    // the only author of project rows.
    const relics = getSqlite()
      .prepare(
        "SELECT COUNT(*) AS c FROM projects WHERE id IN ('antigravity-awesome-skills','bolt-new-original','the-greater-flaw')"
      )
      .get() as { c: number };
    expect(relics.c).toBe(0);
  });

  it("site_health seeds the three production sites with correct expected statuses", () => {
    const rows = getSqlite()
      .prepare("SELECT id, url, expected_status AS s FROM site_health ORDER BY id")
      .all() as { id: string; url: string; s: number }[];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const byId = new Map(rows.map((r) => [r.id, r]));
    // 302 IS healthy for the Cloudflare-Access-gated hosts
    expect(byId.get("site-landing")?.s).toBe(200);
    expect(byId.get("site-matrix")?.s).toBe(302);
    expect(byId.get("site-builder")?.s).toBe(302);
  });

  it("pipeline_items seeds the open blockers to first sale", () => {
    const rows = getSqlite()
      .prepare("SELECT id, kind, status FROM pipeline_items WHERE kind = 'blocker'")
      .all() as { id: string; kind: string; status: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const r of rows) expect(r.status).toBe("open");
  });
});
