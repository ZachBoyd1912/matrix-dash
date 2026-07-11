import { describe, it, expect } from "vitest";
import { launchdPlist, systemdUnit, windowsTaskArgs } from "@/runner/src/service";

/**
 * Cross-platform service-install CONFIG generation (macOS/Linux/Windows).
 * Validates the generated launchd plist, systemd unit, and Task Scheduler
 * command are well-formed and point at `node <bundle> run` with the right
 * auto-restart semantics — the part of Windows/Linux readiness that can be
 * verified without the actual machines (device execution still needs real HW).
 */

const paths = {
  nodePath: "/usr/local/bin/node",
  selfPath: "/home/u/.matrix-runner/bin/matrix-runner.cjs",
  logFile: "/home/u/.matrix-runner/logs/runner.log",
};

describe("macOS launchd plist", () => {
  const plist = launchdPlist(paths);
  it("is a valid plist pointing at node <bundle> run, with login+restart", () => {
    expect(plist).toContain("<!DOCTYPE plist");
    expect(plist).toContain("<key>Label</key><string>com.matrixdash.runner</string>");
    expect(plist).toContain(`<string>${paths.nodePath}</string>`);
    expect(plist).toContain(`<string>${paths.selfPath}</string>`);
    expect(plist).toContain("<string>run</string>");
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
    expect(plist).toContain("<key>KeepAlive</key><true/>"); // auto-restart + update-swap
    // Balanced plist/dict tags.
    expect((plist.match(/<dict>/g) || []).length).toBe((plist.match(/<\/dict>/g) || []).length);
  });
});

describe("Linux systemd user unit", () => {
  const unit = systemdUnit(paths);
  it("runs node <bundle> run with Restart=always under the user manager", () => {
    expect(unit).toContain(`ExecStart=${paths.nodePath} ${paths.selfPath} run`);
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("WantedBy=default.target"); // --user unit target
    expect(unit).toContain("[Unit]");
    expect(unit).toContain("[Service]");
    expect(unit).toContain("[Install]");
  });
});

describe("Windows Task Scheduler args", () => {
  const args = windowsTaskArgs(paths);
  it("creates a forced ONLOGON task named MatrixRunner running node <bundle> run", () => {
    expect(args).toContain("/Create");
    expect(args).toContain("/F");
    expect(args[args.indexOf("/SC") + 1]).toBe("ONLOGON");
    expect(args[args.indexOf("/TN") + 1]).toBe("MatrixRunner");
    expect(args[args.indexOf("/TR") + 1]).toBe(`"${paths.nodePath}" "${paths.selfPath}" run`);
  });
});
