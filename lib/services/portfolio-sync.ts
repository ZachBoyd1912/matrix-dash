import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projects, githubConnections, githubRepos, siteHealth } from "@/lib/db/schema";
import { getSetting, setSetting } from "@/lib/db/settings";

/**
 * Portfolio truth-sync — the only writer of project rows.
 *
 * Reconciles three sources into the projects table so the briefing never
 * reads fiction (the old hardcoded seed catalog had 8 of 12 paths dead on
 * disk while every row claimed "active"):
 *   1. local git checkouts under the configured scan roots
 *   2. the GitHub repo cache (populated by github.ts syncRepos)
 *   3. deployed-site probes (site_health)
 *
 * Local dir names and GitHub repo names drift (fansly_ai_automation vs
 * fansly-ai-automation), so the join key is a normalized slug, overridable
 * per-row via projects.github_repo.
 */

export interface LocalRepo {
  name: string;
  path: string;
  branch: string | null;
  lastCommitAt: string | null;
  lastCommitMessage: string | null;
  dirtyFiles: number;
}

export interface RemoteRepo {
  fullName: string;
  name: string;
  isPrivate: boolean;
  pushedAt: string | null;
  openIssuesCount: number;
}

interface ExistingRow {
  id: string;
  slug: string | null;
  path: string | null;
  githubRepo: string | null;
}

export interface ReconciledProject {
  slug: string;
  name: string;
  path: string | null;
  githubRepo: string | null;
  visibility: "public" | "private" | "local";
  presence: "local+github" | "local-only" | "github-only" | "missing";
  branch: string | null;
  lastCommitAt: string | null;
  lastCommitMessage: string | null;
  dirtyFiles: number;
  openIssues: number;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[_\s.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/** Find git checkouts (depth-limited) under the configured scan roots. */
export function scanLocalRepos(): LocalRepo[] {
  const rootsRaw = getSetting("portfolio_scan_roots") ?? "~/Desktop";
  const roots = rootsRaw
    .split(",")
    .map((r) => r.trim().replace(/^~(?=$|\/)/, os.homedir()))
    .filter(Boolean);

  const repos: LocalRepo[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === ".git")) {
      const last = git(dir, ["log", "-1", "--format=%cI%n%s"]);
      const [lastCommitAt, ...msg] = last ? last.split("\n") : [null];
      const status = git(dir, ["status", "--porcelain"]);
      repos.push({
        name: path.basename(dir),
        path: dir,
        branch: git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]),
        lastCommitAt: lastCommitAt ?? null,
        lastCommitMessage: msg.join("\n") || null,
        dirtyFiles: status ? status.split("\n").filter(Boolean).length : 0,
      });
      return; // don't descend into a repo (submodules/nested checkouts stay out of v1)
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
        walk(path.join(dir, e.name), depth + 1);
      }
    }
  };
  for (const root of roots) walk(root, 0);
  return repos;
}

/**
 * Pure reconciliation — exported for tests. Merges local checkouts, the
 * GitHub cache, and pre-existing rows (for path-vanished detection + manual
 * githubRepo overrides) into upsertable project rows.
 */
export function reconcile(
  local: LocalRepo[],
  remote: RemoteRepo[],
  existing: ExistingRow[]
): ReconciledProject[] {
  const overrideByPath = new Map<string, string>();
  for (const row of existing) {
    if (row.path && row.githubRepo) overrideByPath.set(row.path, row.githubRepo);
  }
  const remoteByFullName = new Map(remote.map((r) => [r.fullName, r]));
  const remoteBySlug = new Map(remote.map((r) => [slugify(r.name), r]));

  const out = new Map<string, ReconciledProject>();
  const claimedRemotes = new Set<string>();

  for (const l of local) {
    const slug = slugify(l.name);
    const override = overrideByPath.get(l.path);
    const match = override ? remoteByFullName.get(override) : remoteBySlug.get(slug);
    if (match) claimedRemotes.add(match.fullName);
    out.set(slug, {
      slug,
      name: l.name,
      path: l.path,
      githubRepo: match?.fullName ?? null,
      visibility: match ? (match.isPrivate ? "private" : "public") : "local",
      presence: match ? "local+github" : "local-only",
      branch: l.branch,
      lastCommitAt: l.lastCommitAt ?? match?.pushedAt ?? null,
      lastCommitMessage: l.lastCommitMessage,
      dirtyFiles: l.dirtyFiles,
      openIssues: match?.openIssuesCount ?? 0,
    });
  }

  for (const r of remote) {
    if (claimedRemotes.has(r.fullName)) continue;
    const slug = slugify(r.name);
    if (out.has(slug)) continue;
    out.set(slug, {
      slug,
      name: r.name,
      path: null,
      githubRepo: r.fullName,
      visibility: r.isPrivate ? "private" : "public",
      presence: "github-only",
      branch: null,
      lastCommitAt: r.pushedAt,
      lastCommitMessage: null,
      dirtyFiles: 0,
      openIssues: r.openIssuesCount,
    });
  }

  // Rows whose recorded path vanished and that matched nothing above become
  // "missing" — never deleted; the user archives them from the Overview.
  for (const row of existing) {
    const slug = row.slug ?? "";
    if (!slug || out.has(slug)) continue;
    if (row.path && !fs.existsSync(row.path)) {
      out.set(slug, {
        slug,
        name: slug,
        path: row.path,
        githubRepo: row.githubRepo,
        visibility: "local",
        presence: "missing",
        branch: null,
        lastCommitAt: null,
        lastCommitMessage: null,
        dirtyFiles: 0,
        openIssues: 0,
      });
    }
  }

  return [...out.values()];
}

function upsertProjects(rows: ReconciledProject[]) {
  const db = getDb();
  const now = new Date().toISOString();
  for (const p of rows) {
    const existing = db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, p.slug))
      .get();
    const common = {
      path: p.path,
      githubRepo: p.githubRepo,
      visibility: p.visibility,
      presence: p.presence,
      branch: p.branch,
      lastCommitAt: p.lastCommitAt,
      lastCommitMessage: p.lastCommitMessage,
      dirtyFiles: p.dirtyFiles,
      openIssues: p.openIssues,
      lastSyncedAt: now,
      updatedAt: now,
    };
    if (existing) {
      db.update(projects).set(common).where(eq(projects.id, existing.id)).run();
    } else {
      db.insert(projects)
        .values({
          id: p.slug,
          name: p.name,
          description: "",
          purpose: "",
          badge: p.presence === "github-only" ? "github" : "code",
          status: p.presence === "missing" ? "archived" : "active",
          slug: p.slug,
          createdAt: now,
          ...common,
        })
        .run();
    }
  }
}

/** Reconcile pre-existing legacy rows (no slug yet) by backfilling slugs once. */
function backfillSlugs() {
  const db = getDb();
  const rows = db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .all();
  for (const r of rows) {
    if (!r.slug)
      db.update(projects)
        .set({ slug: slugify(r.name) })
        .where(eq(projects.id, r.id))
        .run();
  }
}

async function syncGithub(): Promise<RemoteRepo[]> {
  const db = getDb();
  const conn = db.select({ id: githubConnections.id }).from(githubConnections).get();
  if (!conn) return [];
  try {
    const { syncRepos } = await import("./github");
    await syncRepos(conn.id);
    setSetting("github_sync_warning", "");
  } catch (err) {
    // Token may be revoked or missing `repo` scope (private repos invisible).
    // Degrade to whatever the cache holds and surface the warning in the
    // briefing instead of blanking the GitHub picture.
    setSetting("github_sync_warning", err instanceof Error ? err.message : String(err));
  }
  return db
    .select({
      fullName: githubRepos.fullName,
      name: githubRepos.name,
      isPrivate: githubRepos.isPrivate,
      pushedAt: githubRepos.pushedAt,
      openIssuesCount: githubRepos.openIssuesCount,
    })
    .from(githubRepos)
    .all()
    .map((r) => ({ ...r, isPrivate: !!r.isPrivate, openIssuesCount: r.openIssuesCount ?? 0 }));
}

/**
 * Probe deployed sites. 302 (not followed!) IS the healthy response for the
 * Cloudflare-Access-gated hosts, hence redirect:"manual". After two straight
 * exact-status mismatches, any 2xx/3xx counts as "up" — Cloudflare bot-fight
 * can challenge HEADs, and a challenged-but-serving site must degrade to
 * "degraded", never lie "down".
 */
export async function probeSites(onlyIds?: string[]): Promise<void> {
  const db = getDb();
  let rows = db.select().from(siteHealth).all();
  if (onlyIds?.length) rows = rows.filter((r) => onlyIds.includes(r.id));
  if (onlyIds?.length === 0) rows = [];
  const now = new Date().toISOString();
  for (const site of rows) {
    let status: number | null = null;
    try {
      const res = await fetch(site.url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
    } catch {
      status = null;
    }
    const exactOk = status !== null && status === site.expectedStatus;
    const softOk =
      status !== null && status >= 200 && status < 400 && site.consecutiveFailures >= 2;
    const ok = exactOk || softOk;
    db.update(siteHealth)
      .set({
        lastStatus: status,
        lastCheckedAt: now,
        ...(ok ? { lastOkAt: now, consecutiveFailures: 0 } : {}),
        ...(!ok ? { consecutiveFailures: site.consecutiveFailures + 1 } : {}),
      })
      .where(eq(siteHealth.id, site.id))
      .run();
  }
}

/**
 * Full portfolio sync. Each source is independently fallible — one failure
 * degrades the picture, never blanks it. Stamps portfolio_last_synced_at so
 * the briefing can flag its own staleness.
 */
export async function syncPortfolio(): Promise<{
  ok: boolean;
  sources: Record<"local" | "github" | "sites", boolean>;
}> {
  const sources = { local: false, github: false, sites: false };

  let local: LocalRepo[] = [];
  try {
    local = scanLocalRepos();
    sources.local = true;
  } catch {
    /* degraded */
  }

  let remote: RemoteRepo[] = [];
  try {
    remote = await syncGithub();
    sources.github = true;
  } catch {
    /* degraded */
  }

  try {
    backfillSlugs();
    const db = getDb();
    const existing = db
      .select({
        id: projects.id,
        slug: projects.slug,
        path: projects.path,
        githubRepo: projects.githubRepo,
      })
      .from(projects)
      .all();
    upsertProjects(reconcile(local, remote, existing));
  } catch {
    sources.local = false;
    sources.github = false;
  }

  try {
    await probeSites();
    sources.sites = true;
  } catch {
    /* degraded */
  }

  setSetting("portfolio_last_synced_at", new Date().toISOString());
  return { ok: sources.local || sources.github || sources.sites, sources };
}
