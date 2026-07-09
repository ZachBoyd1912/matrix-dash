import { describe, expect, it, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  beforeCopy,
  undoSnapshots,
  hasSnapshots,
  snapshotDirFor,
} from "@/lib/services/agent-snapshots";

const RUN_ID = "test-snapshot-run-fixed";

afterAll(() => {
  try {
    fs.rmSync(snapshotDirFor(RUN_ID), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("agent-snapshots before-copy + undo", () => {
  it("restores a modified file and deletes a created file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-test-"));
    const existing = path.join(dir, "existing.txt");
    const created = path.join(dir, "created.txt");
    fs.writeFileSync(existing, "ORIGINAL");

    // Capture before states.
    beforeCopy(RUN_ID, existing);
    beforeCopy(RUN_ID, created); // does not exist yet → recorded as created

    expect(hasSnapshots(RUN_ID)).toBe(true);

    // Agent mutates both.
    fs.writeFileSync(existing, "MODIFIED");
    fs.writeFileSync(created, "NEW CONTENT");

    const result = undoSnapshots(RUN_ID);

    expect(fs.readFileSync(existing, "utf-8")).toBe("ORIGINAL");
    expect(fs.existsSync(created)).toBe(false);
    expect(result.restored).toBe(1);
    expect(result.deleted).toBe(1);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("is idempotent — a second beforeCopy of the same path keeps the first version", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-test2-"));
    const f = path.join(dir, "f.txt");
    const runId = "test-snapshot-idempotent";
    fs.writeFileSync(f, "V1");
    beforeCopy(runId, f);
    fs.writeFileSync(f, "V2");
    beforeCopy(runId, f); // must NOT overwrite the V1 capture
    fs.writeFileSync(f, "V3");
    undoSnapshots(runId);
    expect(fs.readFileSync(f, "utf-8")).toBe("V1");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(snapshotDirFor(runId), { recursive: true, force: true });
  });
});
