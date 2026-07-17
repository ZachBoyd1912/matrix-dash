import { describe, it, expect, beforeAll } from "vitest";
import { composeBriefing, renderSpoken } from "@/lib/services/briefing";
import { getSqlite } from "@/lib/db/client";
import { setSetting } from "@/lib/db/settings";

// Shared temp DB across the vitest run — use unique IDs, never global counts.
beforeAll(() => {
  const sqlite = getSqlite();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO projects (id, name, description, purpose, badge, status, slug, presence, dirty_files, last_commit_at, last_commit_message, created_at, updated_at)
       VALUES ('brief-p1','brief-proj-live','','','code','active','brief-proj-live','local+github',3,?, 'feat: y', ?, ?)`
    )
    .run(now, now, now);
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO projects (id, name, description, purpose, badge, status, slug, presence, created_at, updated_at)
       VALUES ('brief-p2','brief-proj-gone','','','code','active','brief-proj-gone','missing', ?, ?)`
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO tasks (id, title, is_done, due_at, created_at, updated_at)
       VALUES ('brief-t1','overdue thing',0,'2020-01-01T00:00:00Z', ?, ?)`
    )
    .run(now, now);
});

describe("composeBriefing", () => {
  it("flags a never-synced portfolio as stale and says so in attention", () => {
    setSetting("portfolio_last_synced_at", "");
    const b = composeBriefing();
    expect(b.staleness.isStale).toBe(true);
    expect(b.attention.some((a) => /never synced|stale/i.test(a))).toBe(true);
  });

  it("is fresh right after a sync stamp", () => {
    setSetting("portfolio_last_synced_at", new Date().toISOString());
    const b = composeBriefing();
    expect(b.staleness.isStale).toBe(false);
  });

  it("counts missing projects and overdue tasks into attention", () => {
    setSetting("portfolio_last_synced_at", new Date().toISOString());
    const b = composeBriefing();
    expect(b.projects.missing).toBeGreaterThanOrEqual(1);
    expect(b.tasks.overdue).toBeGreaterThanOrEqual(1);
    expect(b.attention.some((a) => /overdue/.test(a))).toBe(true);
    expect(b.attention.some((a) => /no longer exist/.test(a))).toBe(true);
  });

  it("surfaces open pipeline blockers (seeded from the monetization plan)", () => {
    const b = composeBriefing();
    expect(b.pipeline.openBlockers.length).toBeGreaterThanOrEqual(3);
  });

  it("includes dirty projects sorted by dirt", () => {
    const b = composeBriefing();
    const mine = b.projects.dirty.find((d) => d.name === "brief-proj-live");
    expect(mine?.dirtyFiles).toBe(3);
  });
});

describe("renderSpoken", () => {
  it("stays within the 280-char voice budget and leads with attention", () => {
    setSetting("portfolio_last_synced_at", "");
    const b = composeBriefing();
    const spoken = renderSpoken(b);
    expect(spoken.length).toBeLessThanOrEqual(280);
    expect(spoken.startsWith("Heads up:")).toBe(true);
  });

  it("says all-quiet when there is nothing to report", () => {
    const spoken = renderSpoken({
      generatedAt: new Date().toISOString(),
      staleness: { lastSyncedAt: new Date().toISOString(), isStale: false },
      attention: [],
      projects: { active: 0, missing: 0, dirty: [], recent: [] },
      github: { openIssues: 0, warning: null },
      sites: [],
      pipeline: { openBlockers: [], leads: 0 },
      agents: { overnightRuns: 0, succeeded: 0, failed: 0, needsReview: 0, pendingApprovals: 0 },
      tasks: { dueToday: 0, overdue: 0 },
    });
    // "No agent runs overnight." is still reported — the empty-everything case
    expect(spoken).toContain("No agent runs overnight");
  });
});
