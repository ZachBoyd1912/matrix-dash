import { describe, it, expect } from "vitest";
import { executeAgentRun, type QueryFn, type ExecuteDeps } from "@/lib/runner/execute-core";
import type { StreamEvent } from "@/lib/chat/blocks";
import type { AgentConfig } from "@/types/agents";

/**
 * Device execution engine + approval bridge, driven by a FAKE SDK query (the
 * plan's integration seam). Covers: happy path, a gated tool approved, a gated
 * tool denied, and abort-mid-run — the correctness core of P2.
 */

const AGENT = {
  id: "a1",
  name: "T",
  instructions: "do the thing",
  model: null,
  cwd: "/tmp/work",
  writeAllowlist: ["/tmp/work"],
  learnedRules: { paths: [], commands: [] },
  skillIds: [],
  maxTurns: 5,
  maxChainDepth: null,
} as unknown as AgentConfig;

function baseDeps(over: Partial<ExecuteDeps> = {}): ExecuteDeps {
  return {
    query: (async function* () {})() as unknown as QueryFn,
    emit: () => {},
    reportUsage: () => {},
    requestApproval: async () => true,
    callServerTool: async () => "",
    policyPaths: { selfPaths: [], dbPaths: [], extraDenylist: [] },
    maxChainDepthDefault: 3,
    abortSignal: new AbortController().signal,
    ...over,
  };
}

describe("execute-core device agent execution", () => {
  it("runs a simple agent turn to success, emitting events + usage", async () => {
    const events: StreamEvent[] = [];
    let usage: { costUsd: number } | null = null;
    const query: QueryFn = async function* () {
      yield { type: "system", subtype: "init", session_id: "s1" };
      yield { type: "assistant", message: { content: [{ type: "text", text: "hello" }] } };
      yield {
        type: "result",
        subtype: "success",
        result: "all done",
        num_turns: 1,
        total_cost_usd: 0.02,
        usage: { input_tokens: 100, output_tokens: 20 },
      };
    };
    const res = await executeAgentRun(
      AGENT,
      "go",
      "run1",
      baseDeps({ query, emit: (e) => events.push(e), reportUsage: (u) => (usage = u) })
    );
    expect(res.status).toBe("succeeded");
    expect(res.result).toBe("all done");
    expect(events.some((e) => e.type === "text" && e.value === "hello")).toBe(true);
    expect(usage!.costUsd).toBe(0.02);
  });

  it("a gated tool is allowed when the approval resolves true", async () => {
    let asked = 0;
    // The fake SDK asks permission for a Write outside the allowlist (policy → queue).
    const query: QueryFn = async function* (opts) {
      const o = opts.options as {
        canUseTool: (n: string, i: Record<string, unknown>) => Promise<{ behavior: string }>;
      };
      const perm = await o.canUseTool("Write", { file_path: "/tmp/other/f.txt", content: "x" });
      yield { type: "assistant", message: { content: [{ type: "text", text: perm.behavior }] } };
      yield { type: "result", subtype: "success", result: perm.behavior, num_turns: 1 };
    };
    const res = await executeAgentRun(
      AGENT,
      "go",
      "run2",
      baseDeps({
        query,
        requestApproval: async () => {
          asked++;
          return true;
        },
      })
    );
    expect(asked).toBe(1);
    expect(res.result).toBe("allow");
    expect(res.status).toBe("succeeded");
  });

  it("a gated tool is denied when the approval resolves false", async () => {
    const query: QueryFn = async function* (opts) {
      const o = opts.options as {
        canUseTool: (
          n: string,
          i: Record<string, unknown>
        ) => Promise<{ behavior: string; message?: string }>;
      };
      const perm = await o.canUseTool("Write", { file_path: "/tmp/other/f.txt", content: "x" });
      yield {
        type: "result",
        subtype: "success",
        result: `${perm.behavior}:${perm.message ?? ""}`,
        num_turns: 1,
      };
    };
    const res = await executeAgentRun(
      AGENT,
      "go",
      "run3",
      baseDeps({ query, requestApproval: async () => false })
    );
    expect(res.result).toContain("deny");
    expect(res.result).toContain("Denied by user");
  });

  it("aborting mid-run yields cancelled", async () => {
    const ac = new AbortController();
    const query: QueryFn = async function* () {
      yield { type: "assistant", message: { content: [{ type: "text", text: "working" }] } };
      ac.abort();
      yield { type: "assistant", message: { content: [{ type: "text", text: "more" }] } };
      yield { type: "result", subtype: "success", result: "x", num_turns: 1 };
    };
    const res = await executeAgentRun(
      AGENT,
      "go",
      "run4",
      baseDeps({ query, abortSignal: ac.signal })
    );
    expect(res.status).toBe("cancelled");
  });
});
