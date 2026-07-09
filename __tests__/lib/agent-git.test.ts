import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { prepareWrite } from "@/lib/services/agent-git";
import type { AgentConfig } from "@/types/agents";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function makeAgent(): AgentConfig {
  return {
    id: "agent-git-test",
    name: "Repo Custodian",
    description: "",
    instructions: "",
    model: null,
    cwd: null,
    writeAllowlist: [],
    learnedRules: { paths: [], commands: [] },
    skillIds: [],
    mcpServers: [],
    allowSubagents: false,
    mode: "triggered",
    pushMode: null,
    gitAuthorName: null,
    gitAuthorEmail: null,
    schedule: null,
    scheduleEnabled: false,
    isEnabled: true,
    consecutiveFailures: 0,
    maxTurns: null,
    timeoutMs: null,
    perRunCostUsd: null,
    perRunTokens: null,
    maxChainDepth: null,
    deliverables: { postToChat: false, fileNote: false, inDigest: true },
    lastRunAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("agent-git prepareWrite", () => {
  it("creates a per-run branch on a clean repo before a write", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-test-"));
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "test@test.local"]);
    git(dir, ["config", "user.name", "Test"]);
    fs.writeFileSync(path.join(dir, "README.md"), "hello");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "init"]);

    const runId = "run-abcd1234-branch";
    prepareWrite(runId, makeAgent(), path.join(dir, "src.ts"));

    const branch = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    expect(branch).toBe(`agent/repo-custodian/${runId.slice(0, 8)}`);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does NOT branch a dirty repo (falls back to before-copies)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-dirty-"));
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "test@test.local"]);
    git(dir, ["config", "user.name", "Test"]);
    fs.writeFileSync(path.join(dir, "README.md"), "hello");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "init"]);
    // Leave an uncommitted change → dirty tree.
    fs.writeFileSync(path.join(dir, "README.md"), "hello dirty");

    const before = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    prepareWrite("run-dirty-5678", makeAgent(), path.join(dir, "other.ts"));
    const after = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);

    expect(after).toBe(before); // no branch switch on a dirty tree

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
