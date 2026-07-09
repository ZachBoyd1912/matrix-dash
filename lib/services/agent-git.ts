import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { agentGitIdentity } from "@/lib/db/agents";
import { beforeCopy } from "./agent-snapshots";
import type { AgentConfig, PushMode, RunStatus } from "@/types/agents";

/**
 * Git hygiene for autonomous runs. Repo writes happen on a per-run branch (when
 * the tree is clean), and — only on success and only if the repo's own verify
 * commands pass — get a changelog entry, an agent-identity commit, and a push
 * that matches the repo's convention (direct-to-main or branch + PR). Dirty trees
 * fall back to before-copies so the user's uncommitted work is never touched.
 */

interface RepoState {
  root: string;
  mode: "branch" | "copy";
  branch?: string;
  originalBranch?: string;
}

interface RunGitState {
  repos: Map<string, RepoState>;
}

const KEY = Symbol.for("matrix-dash.agent-git");
function state(): Map<string, RunGitState> {
  const g = globalThis as unknown as Record<symbol, Map<string, RunGitState> | undefined>;
  if (!g[KEY]) g[KEY] = new Map();
  return g[KEY]!;
}

function runState(runId: string): RunGitState {
  const s = state();
  let rs = s.get(runId);
  if (!rs) {
    rs = { repos: new Map() };
    s.set(runId, rs);
  }
  return rs;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGit(cwd: string, args: string[]): string | null {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

function repoRoot(filePath: string): string | null {
  const dir =
    fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
      ? filePath
      : path.dirname(filePath);
  return tryGit(dir, ["rev-parse", "--show-toplevel"]);
}

function isClean(root: string): boolean {
  const out = tryGit(root, ["status", "--porcelain"]);
  return out === "";
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "agent"
  );
}

/**
 * Called from canUseTool before a write is allowed. Ensures the target repo is on
 * a run branch (clean tree) or that a before-copy exists (dirty tree / non-repo).
 */
export function prepareWrite(runId: string, agent: AgentConfig, absPath: string): void {
  const root = repoRoot(absPath);
  if (!root) {
    beforeCopy(runId, absPath);
    return;
  }
  const rs = runState(runId);
  let repo = rs.repos.get(root);
  if (!repo) {
    if (isClean(root)) {
      const originalBranch = tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? "main";
      const branch = `agent/${slugify(agent.name)}/${runId.slice(0, 8)}`;
      const created = tryGit(root, ["checkout", "-b", branch]);
      repo =
        created !== null
          ? { root, mode: "branch", branch, originalBranch }
          : { root, mode: "copy" };
    } else {
      repo = { root, mode: "copy" };
    }
    rs.repos.set(root, repo);
  }
  if (repo.mode === "copy") beforeCopy(runId, absPath);
}

/** Detect a repo's push convention from recent history. */
function detectPushMode(root: string): PushMode {
  const log = tryGit(root, ["log", "--merges", "--oneline", "-20"]) ?? "";
  const total = tryGit(root, ["log", "--oneline", "-20"]) ?? "";
  const merges = log.split("\n").filter(Boolean).length;
  const commits = total.split("\n").filter(Boolean).length;
  // Mostly merge commits on the mainline → PR workflow.
  return commits > 0 && merges / commits > 0.4 ? "pr" : "direct";
}

/** Run the repo's own verify commands. Returns true if all pass (or none found). */
function verifyRepo(root: string): { ok: boolean; ran: string[] } {
  const pkgPath = path.join(root, "package.json");
  const ran: string[] = [];
  if (!fs.existsSync(pkgPath)) return { ok: true, ran };
  let scripts: Record<string, string> = {};
  try {
    scripts = (JSON.parse(fs.readFileSync(pkgPath, "utf-8")).scripts ?? {}) as Record<
      string,
      string
    >;
  } catch {
    return { ok: true, ran };
  }
  // Never run `build` here — it OOMs the constrained host by project policy.
  const candidates = ["typecheck", "lint", "test"].filter((s) => scripts[s]);
  for (const script of candidates) {
    ran.push(script);
    try {
      execFileSync("pnpm", ["run", script], {
        cwd: root,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10 * 60_000,
      });
    } catch {
      return { ok: false, ran };
    }
  }
  return { ok: true, ran };
}

const MODEL_LABEL = "claude-agent-sdk (autonomous run, unattended)";

function writeChangelogEntry(root: string, agent: AgentConfig, summary: string): void {
  const changelogPath = path.join(root, "CHANGELOG.md");
  if (!fs.existsSync(changelogPath)) return; // only follow an existing convention
  try {
    const existing = fs.readFileSync(changelogPath, "utf-8");
    const stamp = new Date().toISOString();
    const entry =
      `\n## ${stamp} — "${MODEL_LABEL}"\n\n` +
      `**Agent:** ${agent.name}\n\n` +
      `**Changed:** ${summary || "Autonomous agent run."}\n`;
    // Insert right after the first heading line if present.
    const lines = existing.split("\n");
    const headingIdx = lines.findIndex((l) => l.startsWith("# "));
    if (headingIdx >= 0) {
      lines.splice(headingIdx + 1, 0, entry);
      fs.writeFileSync(changelogPath, lines.join("\n"));
    } else {
      fs.writeFileSync(changelogPath, entry + existing);
    }
  } catch {
    /* best-effort */
  }
}

export interface FinalizeResult {
  status: RunStatus;
  repoPath?: string;
  branch?: string;
  pushMode?: PushMode;
  prUrl?: string;
}

/**
 * At run end: for each branched repo, verify → commit → push (on success), else
 * commit locally and force needs_review. Always restores the original branch.
 */
export async function finalizeRun(
  runId: string,
  agent: AgentConfig,
  status: RunStatus,
  summary: string
): Promise<FinalizeResult> {
  const rs = state().get(runId);
  if (!rs || rs.repos.size === 0) return { status };
  const shouldPublish = status === "succeeded";

  let effectiveStatus: RunStatus = status;
  let firstRepo: RepoState | undefined;
  let prUrl: string | undefined;
  let pushMode: PushMode | undefined;

  for (const repo of rs.repos.values()) {
    if (repo.mode !== "branch" || !repo.branch) continue;
    firstRepo = firstRepo ?? repo;
    try {
      if (!shouldPublish) {
        // Leave the work committed locally on the branch for inspection.
        git(repo.root, ["add", "-A"]);
        commit(repo.root, agent, `agent: ${agent.name} (${status})`);
        continue;
      }

      const verify = verifyRepo(repo.root);
      git(repo.root, ["add", "-A"]);
      if (!verify.ok) {
        commit(repo.root, agent, `agent: ${agent.name} (needs review — verify failed)`);
        effectiveStatus = "needs_review";
        continue;
      }

      writeChangelogEntry(repo.root, agent, summary);
      git(repo.root, ["add", "-A"]);
      commit(repo.root, agent, `agent: ${agent.name}\n\n${summary}`.slice(0, 2000));

      const mode = agent.pushMode ?? detectPushMode(repo.root);
      pushMode = mode;
      if (mode === "direct") {
        const original = repo.originalBranch ?? "main";
        // Fast-forward the original branch to the agent branch, then push it.
        tryGit(repo.root, ["checkout", original]);
        tryGit(repo.root, ["merge", "--ff-only", repo.branch]);
        tryGit(repo.root, ["push", "origin", original]);
      } else {
        tryGit(repo.root, ["push", "-u", "origin", repo.branch]);
        prUrl = openPullRequest(repo.root, repo.branch, agent, summary) ?? undefined;
      }
    } finally {
      // Always return to where the user was.
      if (repo.originalBranch) tryGit(repo.root, ["checkout", repo.originalBranch]);
    }
  }

  state().delete(runId);
  return {
    status: effectiveStatus,
    repoPath: firstRepo?.root,
    branch: firstRepo?.branch,
    pushMode,
    prUrl,
  };
}

function commit(root: string, agent: AgentConfig, message: string): void {
  const staged = tryGit(root, ["diff", "--cached", "--name-only"]);
  if (!staged) return; // nothing to commit
  const id = agentGitIdentity(agent);
  tryGit(root, [
    "-c",
    `user.name=${id.name}`,
    "-c",
    `user.email=${id.email}`,
    "commit",
    "-m",
    message,
  ]);
}

/** Open a PR via the gh CLI if available; returns the PR URL or null. */
function openPullRequest(
  root: string,
  branch: string,
  agent: AgentConfig,
  summary: string
): string | null {
  try {
    const url = execFileSync(
      "gh",
      [
        "pr",
        "create",
        "--head",
        branch,
        "--title",
        `agent: ${agent.name}`,
        "--body",
        summary || "Autonomous agent run.",
      ],
      { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    return url || null;
  } catch {
    return null;
  }
}

/** Persist the git outcome onto the run row. */
export function recordGitOutcome(runId: string, r: FinalizeResult): void {
  getDb()
    .update(agentRuns)
    .set({
      gitRepoPath: r.repoPath ?? null,
      gitBranch: r.branch ?? null,
      pushModeUsed: r.pushMode ?? null,
      prUrl: r.prUrl ?? null,
    })
    .where(eq(agentRuns.id, runId))
    .run();
}
