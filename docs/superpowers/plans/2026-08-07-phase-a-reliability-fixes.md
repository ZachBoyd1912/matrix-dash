# Phase A — Reliability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Matrix Dashboard reporting data it cannot actually verify — fix the Overview marking all 12 projects "missing", make the Matrix Runner reconnect when its connection silently dies, and move production builds to CI artifacts so deploys stop costing a VM resize cycle.

**Architecture:** Three independent fixes plus a deploy-pipeline change. Path verification becomes tri-state (`exists`/`gone`/`unknown`) so "cannot verify" never means "deleted", with an active repair pass that clears rows already stuck at `missing`. The runner gains a watchdog that aborts a stalled stream and reconnects. Repo scanning moves onto the device via one new `scan-repos` op. CI already builds every push; it starts uploading that build for the VM to download.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + better-sqlite3, Vitest, esbuild (runner bundle), GitHub Actions, GCE + systemd.

## Global Constraints

- **Never run `pnpm build` locally** — it locks up the 8GB dev machine. `pnpm typecheck` is the verification gate.
- Verification order after every change: `pnpm typecheck` (must be 0 errors) → `pnpm lint` (0 errors; 66 pre-existing warnings are expected and must not grow) → `pnpm test --run`.
- Test count baseline is **160 passing**. Every task adds tests; the count only goes up.
- `~/MatrixDash/matrix.db` on the dev Mac is **real operator data**, not scratch. Tests must never write to it — use the existing in-test SQLite fixtures.
- Production DB path on the VM is `/home/zach/MatrixDash/matrix.db`.
- Never mark a project `missing` on an unverifiable path. This is the entire point of the plan; any code path that guesses is a bug.
- Commit after every task. Do not batch commits.

---

### Task 1: Tri-state path verification

Replaces the boolean `pathExists` with a three-state result so an unverifiable path can never be reported as deleted. Authority for a *negative* answer requires the parent directory to be readable from wherever the check runs — on the VM, `/Users/zach/Desktop` does not exist, so all 12 rows correctly return `unknown`.

**Files:**
- Modify: `lib/services/portfolio-sync.ts`
- Test: `__tests__/lib/portfolio-sync.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `export type PathStatus = "exists" | "gone" | "unknown"`, `export function localPathStatus(p: string): PathStatus`, and `reconcile(local, remote, existing, pathStatus?: (p: string) => PathStatus)` — the 4th parameter's type changes from `(p: string) => boolean`.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/lib/portfolio-sync.test.ts`:

```ts
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
```

Add these imports at the top of the file:

```ts
import fs from "fs";
import os from "os";
import path from "path";
import { localPathStatus } from "@/lib/services/portfolio-sync";

const TMP_REAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-pathstatus-"));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run __tests__/lib/portfolio-sync.test.ts`
Expected: FAIL — `localPathStatus is not a function` (it is not exported yet).

- [ ] **Step 3: Implement `localPathStatus` and switch `reconcile` to tri-state**

In `lib/services/portfolio-sync.ts`, add above `reconcile`:

```ts
export type PathStatus = "exists" | "gone" | "unknown";

/**
 * Whether a path exists, as seen from THIS host. A negative answer is only
 * trustworthy when the parent directory is readable here — otherwise we are
 * being asked about a filesystem we cannot see (the production VM asked about
 * a Mac path) and must say so rather than guessing "deleted".
 */
export function localPathStatus(p: string): PathStatus {
  if (fs.existsSync(p)) return "exists";
  const parent = path.dirname(p);
  if (parent === p) return "unknown";
  return fs.existsSync(parent) ? "gone" : "unknown";
}
```

Change the `reconcile` signature's 4th parameter from:

```ts
  pathExists: (p: string) => boolean = fs.existsSync
```

to:

```ts
  pathStatus: (p: string) => PathStatus = localPathStatus
```

Replace the existing missing-detection block at the end of `reconcile` with:

```ts
  // Rows whose recorded path we can actually confirm is gone become "missing".
  // An unverifiable path is left completely alone — never guessed at.
  for (const row of existing) {
    const slug = row.slug ?? "";
    if (!slug || out.has(slug) || !row.path) continue;
    if (pathStatus(row.path) !== "gone") continue;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test --run __tests__/lib/portfolio-sync.test.ts`
Expected: PASS. The pre-existing `"marks an existing row whose recorded path vanished as missing"` test still passes because `/nonexistent/youtube-pipeline`'s parent `/nonexistent` is also absent — update that test's path to `path.join(TMP_REAL_DIR, "vanished")` so it exercises a genuine `gone`, and re-run.

- [ ] **Step 5: Add the regression test that reproduces the production bug**

```ts
it("never marks a project missing when the path cannot be verified (the VM case)", () => {
  const rows = reconcile(
    [],
    [],
    [{ id: "p1", slug: "matrix-dash", path: "/Users/zach/Desktop/matrix-dash", githubRepo: null }],
    () => "unknown"
  );
  expect(rows.find((r) => r.slug === "matrix-dash")).toBeUndefined();
});
```

- [ ] **Step 6: Run the full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test --run`
Expected: 0 type errors, 0 lint errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/services/portfolio-sync.ts __tests__/lib/portfolio-sync.test.ts
git commit -m "fix(portfolio-sync): tri-state path verification, never guess deleted"
```

---

### Task 2: Active repair of rows stuck at "missing"

Task 1 stops *new* false positives but leaves the 12 existing rows wrong, because a row that is never added to the reconcile output is never written. This task repairs them, updating presence only so real git metadata is not overwritten with nulls.

**Files:**
- Modify: `lib/services/portfolio-sync.ts`
- Test: `__tests__/lib/portfolio-sync.test.ts`

**Interfaces:**
- Consumes: `PathStatus`, `reconcile(...)` from Task 1.
- Produces: `ReconciledProject.presenceOnly?: boolean` — `upsertProjects` writes only `presence`/`lastSyncedAt`/`updatedAt` for rows carrying it.

- [ ] **Step 1: Write the failing test**

```ts
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
    .prepare("SELECT presence, branch, dirty_files AS dirtyFiles FROM projects WHERE id='repair-me'")
    .get() as { presence: string; branch: string | null; dirtyFiles: number };
  expect(row.presence).toBe("local-only");
  expect(row.branch).toBe("main"); // preserved, not nulled
  expect(row.dirtyFiles).toBe(7);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test --run __tests__/lib/portfolio-sync.test.ts`
Expected: FAIL — `presenceOnly` does not exist and no repair row is produced.

- [ ] **Step 3: Add `presenceOnly` to the type**

In `lib/services/portfolio-sync.ts`, add to the `ReconciledProject` interface:

```ts
  /**
   * Update presence + sync timestamps ONLY. Set when we know a project still
   * exists but could not scan it from here, so we have no fresh branch/commit
   * data — writing the full row would null out real stored metadata.
   */
  presenceOnly?: boolean;
```

- [ ] **Step 4: Emit repair rows from `reconcile`**

Replace the loop written in Task 1 Step 3 with:

```ts
  for (const row of existing) {
    const slug = row.slug ?? "";
    if (!slug || out.has(slug) || !row.path) continue;
    const status = pathStatus(row.path);
    if (status === "unknown") continue; // cannot verify — leave the row untouched

    if (status === "gone") {
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
      continue;
    }

    // Confirmed to exist but no local scan matched it — this host cannot see
    // the repo itself (production VM). Repair presence, touch nothing else.
    out.set(slug, {
      slug,
      name: slug,
      path: row.path,
      githubRepo: row.githubRepo,
      visibility: "local",
      presence: row.githubRepo ? "local+github" : "local-only",
      branch: null,
      lastCommitAt: null,
      lastCommitMessage: null,
      dirtyFiles: 0,
      openIssues: 0,
      presenceOnly: true,
    });
  }
```

- [ ] **Step 5: Honour `presenceOnly` in `upsertProjects`**

Replace the `if (existing) { ... }` branch inside `upsertProjects` with:

```ts
    if (existing) {
      if (p.presenceOnly) {
        db.update(projects)
          .set({ presence: p.presence, lastSyncedAt: now, updatedAt: now })
          .where(eq(projects.id, existing.id))
          .run();
      } else {
        db.update(projects).set(common).where(eq(projects.id, existing.id)).run();
      }
    } else {
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test --run __tests__/lib/portfolio-sync.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test --run
git add lib/services/portfolio-sync.ts __tests__/lib/portfolio-sync.test.ts
git commit -m "fix(portfolio-sync): actively repair rows stuck at missing"
```

---

### Task 3: Device-backed path verification, in parallel

Wires the tri-state check to the paired device. Today's version probes paths **serially** with a 15s timeout each — 12 paths could take three minutes. This runs them concurrently and distinguishes "device says not found" (`gone`) from "device errored or is absent" (`unknown`).

**Files:**
- Modify: `lib/services/portfolio-sync.ts`
- Test: `__tests__/lib/portfolio-sync.test.ts`

**Interfaces:**
- Consumes: `PathStatus` (Task 1), `tryRemoteFs` from `lib/services/runner-fs.ts`.
- Produces: `export function classifyRemoteFsResult(handled: boolean, ok: boolean, error?: string): PathStatus`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

Import it: add `classifyRemoteFsResult` to the existing `@/lib/services/portfolio-sync` import.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run __tests__/lib/portfolio-sync.test.ts`
Expected: FAIL — `classifyRemoteFsResult is not a function`.

- [ ] **Step 3: Implement the classifier and the parallel resolver**

Replace the whole existing `resolveRemotePathExists` function in `lib/services/portfolio-sync.ts` with:

```ts
/** Map a device fs-op outcome onto a PathStatus. Only a real ENOENT means gone. */
export function classifyRemoteFsResult(
  handled: boolean,
  ok: boolean,
  error?: string
): PathStatus {
  if (!handled) return "unknown";
  if (ok) return "exists";
  const msg = (error ?? "").toLowerCase();
  return msg.includes("enoent") || msg.includes("no such file") ? "gone" : "unknown";
}

/**
 * Resolve path existence on the OWNER'S device. Returns null when no device is
 * reachable at all, so the caller falls back to localPathStatus. Probes run
 * concurrently — serially this was 12 paths x a 15s timeout ceiling.
 */
async function resolveRemotePathStatus(
  paths: string[]
): Promise<((p: string) => PathStatus) | null> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return null;

  const probe = await tryRemoteFs("list", { path: unique[0] });
  if (!probe.handled) return null; // no online device — caller uses local fs

  const status = new Map<string, PathStatus>();
  status.set(
    unique[0],
    classifyRemoteFsResult(probe.handled, probe.result.ok, probe.result.error)
  );

  const rest = await Promise.all(
    unique.slice(1).map(async (p) => {
      const res = await tryRemoteFs("list", { path: p });
      return [p, classifyRemoteFsResult(res.handled, res.handled && res.result.ok, res.handled ? res.result.error : undefined)] as const;
    })
  );
  for (const [p, s] of rest) status.set(p, s);

  return (p: string) => status.get(p) ?? "unknown";
}
```

- [ ] **Step 4: Update the call site in `syncPortfolio`**

Replace:

```ts
    const remotePathExists = await resolveRemotePathExists(
      existing.map((r) => r.path).filter((p): p is string => !!p)
    );
    upsertProjects(reconcile(local, remote, existing, remotePathExists ?? undefined));
```

with:

```ts
    const remotePathStatus = await resolveRemotePathStatus(
      existing.map((r) => r.path).filter((p): p is string => !!p)
    );
    upsertProjects(reconcile(local, remote, existing, remotePathStatus ?? undefined));
```

- [ ] **Step 5: Run tests and the full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test --run`
Expected: 0 errors, all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/services/portfolio-sync.ts __tests__/lib/portfolio-sync.test.ts
git commit -m "fix(portfolio-sync): parallel device path checks, ENOENT-only means gone"
```

---

### Task 4: `scan-repos` device op

Production has never had real git metadata, because the VM cannot see the disk. **The spec's original approach does not work:** it proposed finding `.git` directories via the `tree` op, but `runner/src/fs-ops.ts` filters `.git` out of every walk (`IGNORED_DIRS`, line 19). Instead the device does the whole scan in one op and returns finished `LocalRepo` rows — one round trip instead of N+1.

**Files:**
- Modify: `runner/src/fs-ops.ts`
- Modify: `lib/services/portfolio-sync.ts`
- Test: `__tests__/lib/runner-fs-bridge.test.ts`

**Interfaces:**
- Consumes: the existing `git()` helper and `confine()` in `runner/src/fs-ops.ts`.
- Produces: fs op `"scan-repos"` taking `{ roots: string[] }` and returning `{ repos: { name, path, branch, lastCommitAt, lastCommitMessage, dirtyFiles }[] }` — the exact shape of `LocalRepo` in `lib/services/portfolio-sync.ts`.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/lib/runner-fs-bridge.test.ts`, inside the `describe("device fs-op handler")` block:

```ts
it("scan-repos finds git checkouts under a root and returns their status", async () => {
  const root = path.join(TMP, "scanroot");
  const repo = path.join(root, "proj-a");
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, "a.txt"), "hi");

  const { execFileSync } = await import("child_process");
  const opts = { cwd: repo } as const;
  execFileSync("git", ["init", "-q"], opts);
  execFileSync("git", ["config", "user.email", "t@t.com"], opts);
  execFileSync("git", ["config", "user.name", "t"], opts);
  execFileSync("git", ["add", "a.txt"], opts);
  execFileSync("git", ["commit", "-q", "-m", "initial"], opts);

  const res = await handleFsOp("scan-repos", { roots: [root] });
  expect(res.ok).toBe(true);
  const data = res.data as { repos: { name: string; path: string; lastCommitMessage: string | null }[] };
  const found = data.repos.find((r) => r.name === "proj-a");
  expect(found).toBeTruthy();
  expect(found!.lastCommitMessage).toBe("initial");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run __tests__/lib/runner-fs-bridge.test.ts`
Expected: FAIL — `Unknown fs op: scan-repos`.

- [ ] **Step 3: Implement the op**

In `runner/src/fs-ops.ts`, add this helper above `handleFsOp`:

```ts
/**
 * Walk a root looking for git checkouts. Mirrors scanLocalRepos() in
 * lib/services/portfolio-sync.ts — same depth limit, same "don't descend into
 * a repo" rule — but runs on the device, which is the only host that can
 * actually see these paths in production.
 */
function walkRepos(dir: string, depth: number, out: Record<string, unknown>[]): void {
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
    out.push({
      name: path.basename(dir),
      path: dir,
      branch: git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]),
      lastCommitAt: lastCommitAt ?? null,
      lastCommitMessage: msg.join("\n") || null,
      dirtyFiles: status ? status.split("\n").filter(Boolean).length : 0,
    });
    return; // don't descend into a repo
  }
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
      walkRepos(path.join(dir, e.name), depth + 1, out);
    }
  }
}
```

Add this case inside `handleFsOp`'s switch, next to `"git-status"`:

```ts
      case "scan-repos": {
        const roots = Array.isArray(args.roots) ? args.roots.filter((r) => typeof r === "string") : [];
        const repos: Record<string, unknown>[] = [];
        for (const root of roots as string[]) {
          walkRepos(confine(root), 0, repos);
        }
        return { ok: true, data: { repos } };
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test --run __tests__/lib/runner-fs-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it from `syncPortfolio`**

In `lib/services/portfolio-sync.ts`, add above `syncPortfolio`:

```ts
/**
 * Scan the configured roots on the owner's device. Returns null when no device
 * answered, so the caller falls back to the local execFileSync scan.
 */
async function scanReposViaDevice(): Promise<LocalRepo[] | null> {
  const rootsRaw = getSetting("portfolio_scan_roots") ?? "~/Desktop";
  const roots = rootsRaw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  if (roots.length === 0) return null;

  const res = await tryRemoteFs("scan-repos", { roots });
  if (!res.handled || !res.result.ok) return null;
  const data = res.result.data as { repos?: LocalRepo[] } | undefined;
  return data?.repos ?? [];
}
```

Then in `syncPortfolio`, replace the local-scan block:

```ts
  let local: LocalRepo[] = [];
  try {
    local = scanLocalRepos();
    sources.local = true;
  } catch {
    /* degraded */
  }
```

with:

```ts
  let local: LocalRepo[] = [];
  try {
    // Prefer the device — in production it is the only host that can see these
    // paths at all. Falls back to this host's own disk (local dev).
    const remoteRepos = await scanReposViaDevice();
    local = remoteRepos ?? scanLocalRepos();
    sources.local = true;
  } catch {
    /* degraded */
  }
```

Note: `~` in a root is expanded by the device's own `confine()` only if absolute; the runner resolves relative paths against the device home, so `~/Desktop` must be sent as-is and the device's `confine()` will resolve `~/Desktop` literally. To avoid that ambiguity, strip a leading `~/` before sending:

```ts
    .map((r) => r.trim().replace(/^~\//, ""))
```

Apply that to the `.map()` in `scanReposViaDevice` — `confine()` resolves relative paths against the device's home directory, which is exactly the intent.

- [ ] **Step 6: Run the full gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test --run
git add runner/src/fs-ops.ts lib/services/portfolio-sync.ts __tests__/lib/runner-fs-bridge.test.ts
git commit -m "feat(runner): scan-repos op so production gets real git metadata"
```

---

### Task 5: Runner connection watchdog

`consumeFrames()` awaits `reader.read()` with no timeout. When the downlink is dropped without a clean close, that read never settles — the runner believes it is connected forever. This is what left the device offline from 20:50 to 04:30 and caused Task 1's bug to fire.

**Files:**
- Modify: `runner/src/connect.ts`
- Test: `__tests__/lib/runner-watchdog.test.ts` (create)

**Interfaces:**
- Consumes: `ConnectLoopOptions` in `runner/src/connect.ts`.
- Produces: `export function isStreamStale(lastFrameAt: number, now: number, staleAfterMs: number): boolean`, and `ConnectLoopOptions.staleAfterMs?: number` (test seam; defaults to 60000).

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/runner-watchdog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isStreamStale, STALE_AFTER_MS } from "@/runner/src/connect";

/**
 * The runner used to await reader.read() forever on a silently-dropped
 * connection. The server pings every 20s, so 60s of silence means three
 * missed pings and a dead stream.
 */
describe("isStreamStale", () => {
  it("is not stale while frames are arriving", () => {
    const now = 1_000_000;
    expect(isStreamStale(now - 5_000, now, STALE_AFTER_MS)).toBe(false);
  });

  it("is not stale at exactly the threshold", () => {
    const now = 1_000_000;
    expect(isStreamStale(now - STALE_AFTER_MS, now, STALE_AFTER_MS)).toBe(false);
  });

  it("is stale past the threshold", () => {
    const now = 1_000_000;
    expect(isStreamStale(now - (STALE_AFTER_MS + 1), now, STALE_AFTER_MS)).toBe(true);
  });

  it("defaults to three missed 20s heartbeats", () => {
    expect(STALE_AFTER_MS).toBe(60_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run __tests__/lib/runner-watchdog.test.ts`
Expected: FAIL — no export named `isStreamStale`.

- [ ] **Step 3: Add the staleness helper**

In `runner/src/connect.ts`, add below the existing backoff constants:

```ts
/** Server pings every HEARTBEAT_MS (20s); three missed pings means dead. */
export const STALE_AFTER_MS = 60_000;
const WATCHDOG_TICK_MS = 5_000;

export function isStreamStale(lastFrameAt: number, now: number, staleAfterMs: number): boolean {
  return now - lastFrameAt > staleAfterMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test --run __tests__/lib/runner-watchdog.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the watchdog into the connect loop**

Add to the `ConnectLoopOptions` interface:

```ts
  /** Test seam — silence threshold before assuming the stream is dead. */
  staleAfterMs?: number;
```

Change `consumeFrames`'s signature to accept a frame callback:

```ts
async function consumeFrames(
  body: ReadableStream<Uint8Array>,
  uplink: EventUplink,
  log: (msg: string) => void,
  cfg: RunnerConfig,
  onUpdateSignal?: () => void,
  onFrame?: () => void
): Promise<void> {
```

and call it immediately after a frame parses successfully — inside the `while ((nl = buf.indexOf("\n")) >= 0)` loop, right before `handleFrame(...)`:

```ts
      onFrame?.();
      handleFrame(frame, uplink, log, cfg, onUpdateSignal);
```

Then in `connectLoop`, replace the body of the `try` block with:

```ts
    const staleAfterMs = opts.staleAfterMs ?? STALE_AFTER_MS;
    const watchdog = new AbortController();
    let lastFrameAt = Date.now();
    // AbortSignal.any() requires a real array — [undefined] throws.
    const signals: AbortSignal[] = [watchdog.signal];
    if (opts.stopSignal) signals.push(opts.stopSignal);
    const timer = setInterval(() => {
      if (isStreamStale(lastFrameAt, Date.now(), staleAfterMs)) {
        log(`no frames for ${Math.round(staleAfterMs / 1000)}s — assuming dead, reconnecting`);
        watchdog.abort();
      }
    }, WATCHDOG_TICK_MS);

    try {
      const res = await fetch(new URL("/api/runner/connect", cfg.serverUrl), {
        headers: authHeaders(cfg),
        signal: AbortSignal.any(signals),
      });
      if (res.status === 401) {
        log("token rejected (revoked?) — stopping");
        opts.onAuthError();
        break;
      }
      if (!res.ok || !res.body) throw new Error(`connect failed: HTTP ${res.status}`);

      log("connected");
      backoff = BACKOFF_MIN_MS;
      await consumeFrames(res.body, uplink, log, cfg, opts.onUpdateSignal, () => {
        lastFrameAt = Date.now();
      });
      log("connection closed by server");
    } finally {
      // Must clear, or every reconnect leaks a timer for the process lifetime.
      clearInterval(timer);
    }
```

Keep the existing `catch` block that follows unchanged — an aborted fetch surfaces there as a normal error and triggers the existing jittered-backoff reconnect.

- [ ] **Step 6: Verify the whole loop still typechecks and tests pass**

Run: `pnpm typecheck && pnpm test --run`
Expected: 0 errors; the existing `runner-fs-bridge` frame-dispatch tests still pass.

- [ ] **Step 7: Commit**

```bash
git add runner/src/connect.ts __tests__/lib/runner-watchdog.test.ts
git commit -m "fix(runner): watchdog reconnects a silently-dropped connection"
```

---

### Task 6: Delete vault files through the device bridge

Both delete routes call `fs.rmSync` directly, which silently no-ops on the VM. The vault file survives and is re-imported as a brand new note on the next reconcile — a deleted note resurrects itself.

**Files:**
- Modify: `app/api/notes/[id]/route.ts`
- Modify: `app/api/memories/[id]/route.ts`

**Interfaces:**
- Consumes: `tryRemoteFs` from `lib/services/runner-fs.ts`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the notes DELETE handler**

In `app/api/notes/[id]/route.ts`, add the import:

```ts
import { tryRemoteFs } from "@/lib/services/runner-fs";
```

Replace the vault-cleanup block inside `DELETE` with:

```ts
  if (existing?.vaultRelPath) {
    try {
      const vaultPath = getSetting("obsidianVaultPath");
      if (vaultPath) {
        const abs = path.join(vaultPath, NOTES_SUBDIR, existing.vaultRelPath);
        // Prefer the device — in production the vault is on the owner's Mac,
        // and a local rmSync here silently no-ops, leaving the file to be
        // re-imported as a new note on the next reconcile.
        const remote = await tryRemoteFs("delete", { path: abs });
        if (!remote.handled) fs.rmSync(abs, { force: true });
        else if (!remote.result.ok) {
          console.error("[notes] remote vault delete failed:", remote.result.error);
        }
      }
    } catch (err) {
      console.error("[notes] failed to delete vault file:", err);
    }
  }
```

- [ ] **Step 2: Apply the identical change to memories**

In `app/api/memories/[id]/route.ts`, add the same `tryRemoteFs` import and replace its vault-cleanup block with the same code, substituting `MEMORIES_SUBDIR` for `NOTES_SUBDIR` and `[memories]` for `[notes]` in the log messages.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test --run`
Expected: 0 errors, 160+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/notes/\[id\]/route.ts app/api/memories/\[id\]/route.ts
git commit -m "fix(vault): delete vault files through the device bridge"
```

---

### Task 7: Device status indicator and offline alert

Last night's outage was invisible until someone went looking — stale data presented itself as confident, correct data. A topbar dot makes it glanceable; a server-side check alerts only after a real outage, so a closing laptop lid does not generate noise.

**Files:**
- Create: `lib/services/runner-health.ts`
- Create: `components/layout/device-status.tsx`
- Modify: `components/layout/topbar.tsx`
- Modify: `lib/services/daemon.ts`
- Test: `__tests__/lib/runner-health.test.ts` (create)

**Interfaces:**
- Consumes: `isRunnerOnline` from `lib/services/runner-bus.ts`, `getSetting`/`setSetting` from `lib/db/settings.ts`, `runAsOwner` from `lib/services/daemon.ts`.
- Produces: `export function shouldAlertOffline(input: { anyOnline: boolean; lastSeenAt: string | null; alreadyAlerted: boolean; now: number; thresholdMs?: number }): boolean` and `export function checkDeviceHealth(): void`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/runner-health.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldAlertOffline, OFFLINE_ALERT_AFTER_MS } from "@/lib/services/runner-health";

const NOW = 1_700_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("shouldAlertOffline", () => {
  it("never alerts while a device is online", () => {
    expect(
      shouldAlertOffline({ anyOnline: true, lastSeenAt: iso(0), alreadyAlerted: false, now: NOW })
    ).toBe(false);
  });

  it("stays quiet for a brief drop — a closing laptop lid is not an outage", () => {
    expect(
      shouldAlertOffline({ anyOnline: false, lastSeenAt: iso(60_000), alreadyAlerted: false, now: NOW })
    ).toBe(false);
  });

  it("alerts once the device has been down past the threshold", () => {
    expect(
      shouldAlertOffline({
        anyOnline: false,
        lastSeenAt: iso(OFFLINE_ALERT_AFTER_MS + 1),
        alreadyAlerted: false,
        now: NOW,
      })
    ).toBe(true);
  });

  it("does not alert twice for the same outage", () => {
    expect(
      shouldAlertOffline({
        anyOnline: false,
        lastSeenAt: iso(OFFLINE_ALERT_AFTER_MS + 1),
        alreadyAlerted: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("does not alert for a device that has never connected", () => {
    expect(
      shouldAlertOffline({ anyOnline: false, lastSeenAt: null, alreadyAlerted: false, now: NOW })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run __tests__/lib/runner-health.test.ts`
Expected: FAIL — cannot resolve `@/lib/services/runner-health`.

- [ ] **Step 3: Implement the service**

Create `lib/services/runner-health.ts`:

```ts
import { and, eq, isNull } from "drizzle-orm";
import { getSystemDb } from "@/lib/db/client";
import { runnerDevices } from "@/lib/db/schema";
import { getSetting, setSetting } from "@/lib/db/settings";
import { getOwner } from "@/lib/db/users";
import { isRunnerOnline } from "./runner-bus";
import { notify } from "./notify";

/** A laptop lid closing must not raise an alert, or the signal becomes noise. */
export const OFFLINE_ALERT_AFTER_MS = 5 * 60_000;
const ALERT_FLAG = "runner_offline_alerted";

export function shouldAlertOffline(input: {
  anyOnline: boolean;
  lastSeenAt: string | null;
  alreadyAlerted: boolean;
  now: number;
  thresholdMs?: number;
}): boolean {
  if (input.anyOnline) return false;
  if (input.alreadyAlerted) return false; // once per outage
  if (!input.lastSeenAt) return false; // never connected — nothing to report
  const threshold = input.thresholdMs ?? OFFLINE_ALERT_AFTER_MS;
  return input.now - new Date(input.lastSeenAt).getTime() > threshold;
}

/** Called from the daemon heartbeat, inside the owner's context. */
export function checkDeviceHealth(): void {
  const owner = getOwner();
  if (!owner) return;

  const devices = getSystemDb()
    .select()
    .from(runnerDevices)
    .where(and(eq(runnerDevices.userId, owner.id), isNull(runnerDevices.revokedAt)))
    .all();
  if (devices.length === 0) return;

  const anyOnline = devices.some((d) => isRunnerOnline(d.id));
  const lastSeenAt =
    devices
      .map((d) => d.lastSeenAt)
      .filter((s): s is string => !!s)
      .sort()
      .pop() ?? null;

  if (anyOnline) {
    if (getSetting(ALERT_FLAG) === "1") setSetting(ALERT_FLAG, "0");
    return;
  }

  if (
    !shouldAlertOffline({
      anyOnline,
      lastSeenAt,
      alreadyAlerted: getSetting(ALERT_FLAG) === "1",
      now: Date.now(),
    })
  ) {
    return;
  }

  setSetting(ALERT_FLAG, "1");
  void notify({
    title: "Matrix Runner offline",
    body: "Your device has been unreachable for over 5 minutes. Vault and project data may be stale.",
    kind: "info",
    href: "/dashboard/settings/devices",
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test --run __tests__/lib/runner-health.test.ts`
Expected: PASS.

- [ ] **Step 5: Call it from the daemon heartbeat**

In `lib/services/daemon.ts`, inside the existing `s.heartbeat = cron.schedule("* * * * *", () => {` body, add as the first statement:

```ts
    runAsOwner(() => {
      void import("./runner-health")
        .then((m) => m.checkDeviceHealth())
        .catch(() => {});
    });
```

- [ ] **Step 6: Build the indicator component**

Create `components/layout/device-status.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type State = "loading" | "online" | "offline" | "none";

const META: Record<Exclude<State, "loading">, { dot: string; label: string }> = {
  online: { dot: "bg-emerald-400", label: "Device online" },
  offline: { dot: "bg-rose-400", label: "Device offline — data may be stale" },
  none: { dot: "bg-white/25", label: "No device paired" },
};

/** Glanceable device liveness. A silent outage previously looked identical to healthy data. */
export function DeviceStatus() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await (await fetch("/api/runner/devices")).json();
        if (cancelled) return;
        if (!Array.isArray(rows) || rows.length === 0) setState("none");
        else setState(rows.some((d: { online?: boolean }) => d.online) ? "online" : "offline");
      } catch {
        if (!cancelled) setState("offline");
      }
    };
    void poll();
    const t = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (state === "loading") return null;
  const meta = META[state];

  return (
    <Link
      href="/dashboard/settings/devices"
      title={meta.label}
      aria-label={meta.label}
      className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/5"
    >
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
    </Link>
  );
}
```

- [ ] **Step 7: Mount it in the topbar**

In `components/layout/topbar.tsx`, add the import:

```tsx
import { DeviceStatus } from "./device-status";
```

and render `<DeviceStatus />` immediately before the notifications bell in the right-hand control cluster.

- [ ] **Step 8: Run the full gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test --run
git add lib/services/runner-health.ts components/layout/device-status.tsx components/layout/topbar.tsx lib/services/daemon.ts __tests__/lib/runner-health.test.ts
git commit -m "feat(runner): device status indicator and offline alert"
```

---

### Task 8: CI-artifact deploy pipeline

CI already runs the full `pnpm build` on a 16GB runner every push, then throws the output away — while the VM rebuilds the identical thing on hardware that must be resized first. This uploads the build and has the deploy download it. **This ships in the deploy it cannot itself accelerate;** the following deploy is the first fast one.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `deploy/apply-artifact.sh`
- Create: `deploy/deploy.sh`
- Modify: `deploy/setup-server.sh`
- Modify: `.claude/skills/matrix-dash-deploy-verify/SKILL.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `deploy/deploy.sh` as the documented deploy entry point, run from the Mac.

- [ ] **Step 1: Upload the build from CI**

In `.github/workflows/ci.yml`, after the existing `- name: Build` step, append:

```yaml
      - name: Build runner bundle
        run: pnpm build:runner

      - name: Package deploy artifact
        run: |
          set -euo pipefail
          cp -r .next/static .next/standalone/.next/static
          cp -r public .next/standalone/public
          cp runner/dist/matrix-runner.cjs .next/standalone/matrix-runner.cjs
          tar -czf deploy-artifact.tar.gz -C .next standalone

      - name: Upload deploy artifact
        uses: actions/upload-artifact@v4
        with:
          name: standalone-${{ github.sha }}
          path: deploy-artifact.tar.gz
          retention-days: 14
```

- [ ] **Step 2: Write the VM-side apply script**

Create `deploy/apply-artifact.sh`:

```bash
#!/usr/bin/env bash
# Runs ON THE VM. Swaps in a standalone build downloaded from CI.
# node_modules is still installed here so native modules (better-sqlite3)
# are built against this host's Node, not the CI runner's.
set -euo pipefail

APP_DIR="/opt/matrix-dash"
STANDALONE="$APP_DIR/.next/standalone"
ARTIFACT="/tmp/deploy-artifact.tar.gz"

[ -f "$ARTIFACT" ] || { echo "missing $ARTIFACT"; exit 1; }

echo "=== extracting ==="
rm -rf /tmp/md-extract && mkdir -p /tmp/md-extract
tar -xzf "$ARTIFACT" -C /tmp/md-extract

echo "=== stopping service ==="
systemctl stop matrix-dash

echo "=== swapping standalone ==="
rm -rf "$STANDALONE"
mkdir -p "$APP_DIR/.next"
mv /tmp/md-extract/standalone "$STANDALONE"

# Real secrets live here and must survive every deploy.
cp "$APP_DIR/.env.production" "$STANDALONE/.env.production"
chmod 600 "$STANDALONE/.env.production"
cp "$APP_DIR/package.json" "$APP_DIR/pnpm-lock.yaml" "$STANDALONE/"

echo "=== production install (native modules) ==="
cd "$STANDALONE"
CI=true pnpm install --frozen-lockfile --prod

echo "=== restarting ==="
systemctl restart matrix-dash
sleep 4
systemctl status matrix-dash --no-pager | head -5
curl -s -o /dev/null -w 'localhost:3000 -> %{http_code}\n' localhost:3000/
```

- [ ] **Step 3: Write the Mac-side deploy driver**

Create `deploy/deploy.sh`:

```bash
#!/usr/bin/env bash
# Runs ON THE MAC. Downloads the CI build for a commit and applies it.
# No VM resize: the e2-micro never builds anything.
set -euo pipefail

REPO="ZachBoyd1912/matrix-dash"
ZONE="us-east1-b"
PROJECT="matrix-dashboard-id"
SHA="${1:-$(git rev-parse origin/main)}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "=== downloading artifact for $SHA ==="
gh run download --repo "$REPO" --name "standalone-$SHA" --dir "$WORK"

echo "=== uploading to VM ==="
gcloud compute scp "$WORK/deploy-artifact.tar.gz" \
  "matrix-dash:/tmp/deploy-artifact.tar.gz" --zone="$ZONE" --project="$PROJECT"

echo "=== pulling source + applying ==="
gcloud compute ssh matrix-dash --zone="$ZONE" --project="$PROJECT" \
  --command="cd /opt/matrix-dash && sudo git pull --ff-only && sudo bash deploy/apply-artifact.sh"
```

Make both executable:

```bash
chmod +x deploy/deploy.sh deploy/apply-artifact.sh
```

- [ ] **Step 4: Remove the 90-second shutdown stall**

In `deploy/setup-server.sh`, inside the systemd unit heredoc, add below `RestartSec=5`:

```
TimeoutStopSec=10
```

Apply it to the running VM without a full setup run:

```bash
gcloud compute ssh matrix-dash --zone=us-east1-b --project=matrix-dashboard-id \
  --command="sudo sed -i '/^RestartSec=5$/a TimeoutStopSec=10' /etc/systemd/system/matrix-dash.service && sudo systemctl daemon-reload && grep -A1 RestartSec /etc/systemd/system/matrix-dash.service"
```

Expected output includes `TimeoutStopSec=10`.

- [ ] **Step 5: Update the deploy skill so the old procedure is not followed by mistake**

In `.claude/skills/matrix-dash-deploy-verify/SKILL.md`, insert this immediately after the opening paragraph:

```markdown
## Deploying (current procedure)

Run `./deploy/deploy.sh [sha]` from the Mac. It downloads the build CI already
produced for that commit, copies it to the VM, and swaps it in. **No resize
cycle — the e2-micro never builds anything.** Takes ~2-3 minutes.

The resize procedure described further down is now a FALLBACK, for when CI is
unavailable or the artifact has expired (14-day retention). Do not reach for it
by default; it costs ~40 minutes and exists only as a break-glass path.

Post-deploy verification below is unchanged and still mandatory — a deploy
script exiting 0 is still not evidence the live site changed.
```

Leave the entire post-deploy verification section untouched.

- [ ] **Step 6: Verify the workflow file is valid and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test --run`
Expected: unchanged, 0 errors (no app code touched).

```bash
git add .github/workflows/ci.yml deploy/apply-artifact.sh deploy/deploy.sh deploy/setup-server.sh .claude/skills/matrix-dash-deploy-verify/SKILL.md
git commit -m "build(deploy): ship CI-built artifacts instead of rebuilding on the VM"
```

---

### Task 9: Deploy Phase A and verify against production

Every bug in this plan passed typecheck, lint and tests while being wrong at runtime. Live verification is not optional here.

**Files:** none — this task is execution and verification.

- [ ] **Step 1: Bump the runner version BEFORE building**

The device self-updates only when the served bundle reports a higher version, so this must be committed before the build that produces the bundle — bumping afterwards would ship a watchdog the device never picks up.

Edit `runner/src/version.ts`:

```ts
export const RUNNER_VERSION = "0.1.3";
```

```bash
pnpm build:runner && node runner/dist/matrix-runner.cjs version
```

Expected: prints `0.1.3`.

```bash
git add runner/src/version.ts
git commit -m "chore(runner): bump RUNNER_VERSION to 0.1.3 for the watchdog"
```

- [ ] **Step 2: Push and wait for CI**

```bash
git push origin main
gh run watch --repo ZachBoyd1912/matrix-dash
```

Expected: the run succeeds and lists a `standalone-<sha>` artifact.

- [ ] **Step 3: Deploy using the old resize procedure**

This deploy predates the artifact pipeline existing on the VM, so it uses the resize cycle from the `matrix-dash-deploy-verify` skill: stop → `set-machine-type e2-standard-2` → start → `git pull` → `pnpm install` → `pnpm build` → `pnpm build:runner` → copy the bundle to `.next/standalone/matrix-runner.cjs` → standalone swap → restart → stop → `set-machine-type e2-micro` → start.

Confirm the served bundle reports the new version before moving on:

```bash
gcloud compute ssh matrix-dash --zone=us-east1-b --project=matrix-dashboard-id \
  --command="curl -s localhost:3000/api/runner/download | grep -a -o 'RUNNER_VERSION = \"[0-9.]*\"' | head -1"
```

Expected: `RUNNER_VERSION = "0.1.3"`.

- [ ] **Step 4: Force the device onto the new bundle and confirm**

```bash
launchctl kickstart -k gui/$(id -u)/com.matrixdash.runner
sleep 8
tail -6 ~/.matrix-runner/logs/runner.log
node ~/.matrix-runner/bin/matrix-runner.cjs version
```

Expected: log shows `update available: v0.1.2 → v0.1.3` then reconnect; version prints `0.1.3`.

- [ ] **Step 5: Confirm the device is online, then trigger a portfolio sync**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://matrix.zbautomations.ie
```

Then from the authenticated browser session, `POST /api/portfolio/sync` and re-read the projects table:

```bash
gcloud compute ssh matrix-dash --zone=us-east1-b --project=matrix-dashboard-id \
  --command="python3 -c \"
import sqlite3
c = sqlite3.connect('/home/zach/MatrixDash/matrix.db')
for r in c.execute('SELECT presence, COUNT(*) FROM projects GROUP BY presence'): print(r)
\""
```

Expected: **zero rows with `presence='missing'`.** Before this plan, all 12 were missing. Any remaining `missing` row must correspond to a path that genuinely no longer exists on the Mac — verify individually with `ls` before accepting it.

- [ ] **Step 6: Verify the watchdog actually recovers a dead connection**

Kill the connection at the network layer rather than stopping the process, so the runner sees a silent drop rather than a clean close:

```bash
# Confirm online first, then simulate a silent drop by suspending the process
# (SIGSTOP freezes it mid-read without closing the socket), wait past the
# 60s threshold, resume, and watch it notice.
PID=$(pgrep -f "matrix-runner.cjs run" | head -1)
kill -STOP "$PID"; sleep 75; kill -CONT "$PID"
sleep 15
tail -8 ~/.matrix-runner/logs/runner.log
```

Expected: a line containing `no frames for 60s — assuming dead, reconnecting`, followed by `connected`.

- [ ] **Step 7: Verify the offline alert and topbar dot**

With the device stopped for over 5 minutes, confirm a notification appears in the dashboard and the topbar dot is red; restart the runner and confirm the dot returns to green and no duplicate notification is raised.

- [ ] **Step 8: Verify all three domains and the builder are healthy**

```bash
curl -s -o /dev/null -w "matrix: %{http_code}\n" https://matrix.zbautomations.ie
curl -s -o /dev/null -w "builder: %{http_code}\n" https://builder.zbautomations.ie
curl -s -o /dev/null -w "landing: %{http_code}\n" https://zbautomations.ie
```

Expected: `302`, `302`, `200`.

- [ ] **Step 9: Prove the new deploy path works, end to end**

Make a trivial no-op commit, push, wait for CI, then:

```bash
./deploy/deploy.sh
```

Expected: completes in roughly 2–3 minutes with no VM resize, and `systemctl status matrix-dash` shows a fresh `Active: active (running) since <just now>`.

- [ ] **Step 10: Write the CHANGELOG entry and commit**

Follow the project's changelog rules: fresh `TZ=Europe/Dublin date "+%d/%m/%Y @ %H:%M:%S IST"` timestamp, new entry at line 2, a real `**Project completion: xx.xx%**` figure derived from the task count in this plan, Goal / Fixed / Added / Changed with cause-fix-verification, and Files Touched.

---

## Self-Review

**Spec coverage.** Every Phase A item in the spec maps to a task: tri-state verification → Task 1; active repair → Task 2; parallel device checks → Task 3; `git-status`/repo scanning → Task 4; watchdog → Task 5; delete-through-bridge → Task 6; status indicator and 5-minute once-per-outage alert → Task 7; CI artifact and `TimeoutStopSec` → Task 8; live verification → Task 9.

**One spec correction, made deliberately.** The spec proposed finding repos with the `tree` op then calling `git-status` per repo. That cannot work — `runner/src/fs-ops.ts` filters `.git` out of every walk via `IGNORED_DIRS`, so `tree` never reveals a repository. Task 4 adds a single `scan-repos` op that does the walk and the git calls on-device instead, which is also one round trip rather than N+1. The `git-status` op added previously stays in place and remains usable standalone.

**Two ordering traps the plan resolves explicitly.** Task 1 Step 4 flags that the existing `"marks an existing row whose recorded path vanished as missing"` test will start failing — its fixture path `/nonexistent/youtube-pipeline` has an equally absent parent, so it now correctly returns `unknown` rather than `gone` — and gives the fix. Task 9 Step 1 puts the `RUNNER_VERSION` bump before the build rather than after; bumping afterwards would ship a watchdog no device ever downloads, which is exactly the failure mode hit twice in the previous session.

**Not in this plan, by design.** Everything in spec Phase B — the persisted vault index, FTS search, dynamic sidebar, vault-wide graph with edges/ghosts/folder colours, backlinks, and `obsidian://` links — is deferred to its own plan, written once Phase A has shipped. Phase B depends on Phase A having made the device connection reliable, and would be untestable while the device still drops silently.

**Known limitation, stated rather than hidden.** `github_connections` has zero rows in production, so no project can resolve to `local+github` until that integration is reconnected in Settings → Integrations → GitHub. Task 2's `local+github` branch is correct but will not fire until then. This is configuration, not code, and no task in this plan can fix it.
