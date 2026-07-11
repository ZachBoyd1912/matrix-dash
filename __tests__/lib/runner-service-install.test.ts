import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Exercises the ACTUAL win32 branch of installService/uninstallService — the
 * real `schtasks` invocation and its graceful `/Run`-failure fallback — by
 * mocking process.platform + the fs/os/child_process syscalls. This is the
 * maximum Windows confidence achievable without a Windows machine: it proves
 * the code drives schtasks correctly and never throws when the task can't be
 * started immediately (no interactive session). Real device execution still
 * needs real hardware; the pure arg generator is covered in runner-service.test.ts.
 */

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  homedir: vi.fn(() => "/home/testuser"),
}));

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  const patched = { ...actual, execFileSync: mocks.execFileSync };
  return { ...patched, default: patched };
});
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const patched = {
    ...actual,
    mkdirSync: mocks.mkdirSync,
    writeFileSync: mocks.writeFileSync,
    rmSync: mocks.rmSync,
  };
  return { ...patched, default: patched };
});
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  const patched = { ...actual, homedir: mocks.homedir };
  return { ...patched, default: patched };
});

import { installService, uninstallService } from "@/runner/src/service";

const originalPlatform = process.platform;
function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

beforeEach(() => {
  mocks.execFileSync.mockReset();
  mocks.mkdirSync.mockReset();
  mocks.writeFileSync.mockReset();
  mocks.rmSync.mockReset();
});
afterEach(() => setPlatform(originalPlatform));

describe("installService — Windows (win32) branch", () => {
  it("creates the MatrixRunner ONLOGON scheduled task via schtasks", () => {
    setPlatform("win32");
    const logs: string[] = [];
    installService((m) => logs.push(m));

    const createCall = mocks.execFileSync.mock.calls.find(
      (c) => c[0] === "schtasks" && Array.isArray(c[1]) && (c[1] as string[]).includes("/Create")
    );
    expect(createCall).toBeTruthy();
    expect(createCall![1] as string[]).toEqual(
      expect.arrayContaining(["/Create", "/F", "/SC", "ONLOGON", "/TN", "MatrixRunner"])
    );
    expect(logs.join("\n")).toContain("Windows scheduled task installed");
  });

  it("still completes (no throw) when schtasks /Run fails — task starts at next logon", () => {
    setPlatform("win32");
    mocks.execFileSync.mockImplementation((cmd: string, a: string[]) => {
      if (cmd === "schtasks" && a.includes("/Run")) throw new Error("no interactive session");
      return Buffer.from("");
    });
    const logs: string[] = [];
    expect(() => installService((m) => logs.push(m))).not.toThrow();
    expect(logs.join("\n")).toContain("starts at next logon");
  });
});

describe("uninstallService — Windows (win32) branch", () => {
  it("removes the MatrixRunner task via schtasks /Delete", () => {
    setPlatform("win32");
    const logs: string[] = [];
    uninstallService((m) => logs.push(m));

    const delCall = mocks.execFileSync.mock.calls.find(
      (c) => c[0] === "schtasks" && Array.isArray(c[1]) && (c[1] as string[]).includes("/Delete")
    );
    expect(delCall).toBeTruthy();
    expect(delCall![1] as string[]).toEqual(
      expect.arrayContaining(["/Delete", "/F", "/TN", "MatrixRunner"])
    );
    expect(logs.join("\n")).toContain("Windows scheduled task removed");
  });
});
