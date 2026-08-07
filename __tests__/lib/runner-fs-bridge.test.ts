import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { registerRunner, runnerFsRequest, resolveFsResult } from "@/lib/services/runner-bus";
import { handleFsOp } from "@/runner/src/fs-ops";
import { handleFrame } from "@/runner/src/connect";
import type { ServerFrame, RunnerFrame } from "@/lib/runner/protocol";
import type { EventUplink } from "@/runner/src/api";
import type { RunnerConfig } from "@/runner/src/config";

/**
 * The workspace file bridge: the server's request/reply over a device
 * connection (fs_op → fs_result, with timeout), and the device's local fs-op
 * handler (confined to the workspace root).
 */

describe("runner fs request/reply (server side)", () => {
  it("resolves when the device answers with a matching fs_result", async () => {
    // A mock device connection that echoes fs_op back as a successful fs_result.
    const unregister = registerRunner("dev-fs-1", (frame: ServerFrame) => {
      if (frame.type === "fs_op") {
        resolveFsResult(frame.requestId, { ok: true, data: { echoed: frame.op } });
      }
    });
    const res = await runnerFsRequest("dev-fs-1", "list", { path: "." });
    expect(res.ok).toBe(true);
    expect((res.data as { echoed: string }).echoed).toBe("list");
    unregister();
  });

  it("returns an offline error when the device isn't connected", async () => {
    const res = await runnerFsRequest("nope", "list", {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain("offline");
  });

  it("times out if the device never answers", async () => {
    const unregister = registerRunner("dev-fs-2", () => {
      /* deliberately ignore the request */
    });
    const res = await runnerFsRequest("dev-fs-2", "list", {}, 80);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("timeout");
    unregister();
  });
});

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-fsops-"));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** Minimal EventUplink stand-in: fs_op dispatch only ever calls push()/flush(). */
function fakeUplink(): { uplink: EventUplink; nextPush: () => Promise<RunnerFrame> } {
  const pushed: RunnerFrame[] = [];
  const waiters: Array<(f: RunnerFrame) => void> = [];
  const uplink = {
    push: (frame: RunnerFrame) => {
      const waiter = waiters.shift();
      if (waiter) waiter(frame);
      else pushed.push(frame);
    },
    flush: async () => {},
  } as unknown as EventUplink;
  const nextPush = () =>
    pushed.length > 0
      ? Promise.resolve(pushed.shift()!)
      : new Promise<RunnerFrame>((resolve) => waiters.push(resolve));
  return { uplink, nextPush };
}

describe("device fs-op handler", () => {
  const env = process.env.MATRIX_RUNNER_WORKSPACE;
  process.env.MATRIX_RUNNER_WORKSPACE = TMP;
  afterAll(() => {
    if (env === undefined) delete process.env.MATRIX_RUNNER_WORKSPACE;
    else process.env.MATRIX_RUNNER_WORKSPACE = env;
  });

  it("writes, reads, lists, and confines to the workspace root", async () => {
    expect((await handleFsOp("write", { path: "sub/a.txt", content: "hi" })).ok).toBe(true);
    const read = await handleFsOp("read", { path: "sub/a.txt" });
    expect((read.data as { content: string }).content).toBe("hi");

    const list = await handleFsOp("list", { path: "sub" });
    expect(
      (list.data as { entries: { name: string }[] }).entries.some((e) => e.name === "a.txt")
    ).toBe(true);

    // Escaping the root is rejected.
    const escape = await handleFsOp("read", { path: "../../../etc/passwd" });
    expect(escape.ok).toBe(false);
    expect(escape.error).toContain("escapes");
  });

  it("tree returns the readTree-compatible shape the workspace UI expects", async () => {
    await handleFsOp("write", { path: "proj/index.ts", content: "export {}" });
    const tree = await handleFsOp("tree", { root: TMP });
    expect(tree.ok).toBe(true);
    const data = tree.data as {
      root: string;
      name: string;
      tree: Array<{ name: string; type: string }>;
    };
    expect(data.root).toBe(TMP);
    expect(typeof data.name).toBe("string");
    expect(data.tree.some((e) => e.name === "proj" && e.type === "dir")).toBe(true);

    const read = await handleFsOp("read", { path: "proj/index.ts" });
    const fr = read.data as { language: string; truncated: boolean; bytes: number };
    expect(fr.language).toBe("typescript");
    expect(fr.truncated).toBe(false);
    expect(fr.bytes).toBeGreaterThan(0);
  });

  it("git-status reports branch/dirty state for a real repo checkout", async () => {
    const repoDir = path.join(TMP, "gitrepo");
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hi");

    const { execFileSync } = await import("child_process");
    const opts = { cwd: repoDir } as const;
    execFileSync("git", ["init", "-q"], opts);
    execFileSync("git", ["config", "user.email", "t@t.com"], opts);
    execFileSync("git", ["config", "user.name", "t"], opts);
    execFileSync("git", ["add", "a.txt"], opts);
    execFileSync("git", ["commit", "-q", "-m", "initial"], opts);

    const status = await handleFsOp("git-status", { path: "gitrepo" });
    expect(status.ok).toBe(true);
    const data = status.data as {
      branch: string | null;
      lastCommitMessage: string | null;
      dirtyFiles: number;
    };
    expect(data.lastCommitMessage).toBe("initial");
    expect(data.dirtyFiles).toBe(0);
  });

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
    const data = res.data as {
      repos: { name: string; path: string; lastCommitMessage: string | null }[];
    };
    const found = data.repos.find((r) => r.name === "proj-a");
    expect(found).toBeTruthy();
    expect(found!.lastCommitMessage).toBe("initial");
  });

  it("forwards handleFsOp's data directly — regression for the double-wrap bug (connect.ts:134)", async () => {
    const { uplink, nextPush } = fakeUplink();
    handleFrame(
      { type: "fs_op", requestId: "req-1", op: "tree", args: { root: TMP } },
      uplink,
      () => {},
      {} as RunnerConfig
    );
    const frame = await nextPush();
    expect(frame.type).toBe("fs_result");
    if (frame.type !== "fs_result") throw new Error("wrong frame type");
    expect(frame.requestId).toBe("req-1");
    expect(frame.ok).toBe(true);
    const data = frame.data as { root: string; tree: unknown[]; data?: unknown };
    // Real bug shape was {ok, data: {ok, data: {root,...}, error}} — one level
    // too deep. Assert the tree payload is directly on frame.data, and that
    // there's no nested .data (which would mean the bug is back).
    expect(data.root).toBe(TMP);
    expect(Array.isArray(data.tree)).toBe(true);
    expect(data.data).toBeUndefined();
  });

  it("still wraps the whole IdeResult in data for ide ops (unchanged, flat-shape branch)", async () => {
    const { uplink, nextPush } = fakeUplink();
    handleFrame(
      { type: "fs_op", requestId: "req-2", op: "ide", args: { action: "status" } },
      uplink,
      () => {},
      {} as RunnerConfig
    );
    const frame = await nextPush();
    expect(frame.type).toBe("fs_result");
    if (frame.type !== "fs_result") throw new Error("wrong frame type");
    // IdeResult has no separate .data field — running/url/port live at the
    // top level, so the whole result belongs in frame.data (route.ts reads
    // remote.result.data directly as the IdeResult).
    const data = frame.data as { ok: boolean; running?: boolean };
    expect(data.ok).toBe(true);
    expect(data.running).toBe(false);
  });
});
