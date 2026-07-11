import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { registerRunner, runnerFsRequest, resolveFsResult } from "@/lib/services/runner-bus";
import { handleFsOp } from "@/runner/src/fs-ops";
import type { ServerFrame } from "@/lib/runner/protocol";

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
});
