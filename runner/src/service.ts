import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

/**
 * Per-user (no admin) background-service install for the three platforms:
 *   macOS   → launchd LaunchAgent (~/Library/LaunchAgents), KeepAlive restarts
 *   Linux   → systemd --user unit (~/.config/systemd/user), Restart=always
 *   Windows → Task Scheduler ONLOGON task for the current user
 * All point at: node <this bundle> run. KeepAlive/Restart also completes the
 * auto-update story: the updater swaps the bundle and exits, the service
 * brings the new version up.
 */

const LABEL = "com.matrixdash.runner";

function selfPath(): string {
  return path.resolve(process.argv[1]);
}

function nodePath(): string {
  return process.execPath;
}

interface ServicePaths {
  nodePath: string;
  selfPath: string;
  logFile: string;
}

/* ── Pure config generators (testable on any platform, no side effects) ── */

/** macOS launchd LaunchAgent plist — KeepAlive restarts on crash/update-swap. */
export function launchdPlist(p: ServicePaths): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${p.nodePath}</string>
    <string>${p.selfPath}</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${p.logFile}</string>
  <key>StandardErrorPath</key><string>${p.logFile}</string>
</dict></plist>
`;
}

/** Linux systemd --user unit — Restart=always. */
export function systemdUnit(p: ServicePaths): string {
  return `[Unit]
Description=Matrix Runner
After=network-online.target

[Service]
ExecStart=${p.nodePath} ${p.selfPath} run
Restart=always
RestartSec=5
StandardOutput=append:${p.logFile}
StandardError=append:${p.logFile}

[Install]
WantedBy=default.target
`;
}

/** Windows Task Scheduler ONLOGON args (no admin) for the current user. */
export function windowsTaskArgs(p: ServicePaths): string[] {
  return [
    "/Create",
    "/F",
    "/SC",
    "ONLOGON",
    "/TN",
    "MatrixRunner",
    "/TR",
    `"${p.nodePath}" "${p.selfPath}" run`,
  ];
}

export function installService(log: (m: string) => void): void {
  const logDir = path.join(os.homedir(), ".matrix-runner", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "runner.log");
  const paths: ServicePaths = { nodePath: nodePath(), selfPath: selfPath(), logFile };

  if (process.platform === "darwin") {
    const plist = launchdPlist(paths);
    const dir = path.join(os.homedir(), "Library", "LaunchAgents");
    fs.mkdirSync(dir, { recursive: true });
    const plistPath = path.join(dir, `${LABEL}.plist`);
    fs.writeFileSync(plistPath, plist);
    try {
      execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
    } catch {
      /* not loaded yet */
    }
    execFileSync("launchctl", ["load", plistPath]);
    log(`launchd agent installed (${plistPath}) — starts at login, auto-restarts`);
    return;
  }

  if (process.platform === "linux") {
    const unit = systemdUnit(paths);
    const dir = path.join(os.homedir(), ".config", "systemd", "user");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "matrix-runner.service"), unit);
    execFileSync("systemctl", ["--user", "daemon-reload"]);
    execFileSync("systemctl", ["--user", "enable", "--now", "matrix-runner.service"]);
    log("systemd user service installed and started (matrix-runner.service)");
    return;
  }

  if (process.platform === "win32") {
    // ONLOGON task for the current user — no admin elevation required.
    execFileSync("schtasks", windowsTaskArgs(paths));
    try {
      execFileSync("schtasks", ["/Run", "/TN", "MatrixRunner"]);
    } catch {
      log("task created — it starts at next logon (couldn't start it immediately)");
    }
    log("Windows scheduled task installed (MatrixRunner) — starts at logon");
    return;
  }

  throw new Error(`Unsupported platform for service install: ${process.platform}`);
}

export function uninstallService(log: (m: string) => void): void {
  if (process.platform === "darwin") {
    const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
    try {
      execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
    } catch {
      /* not loaded */
    }
    fs.rmSync(plistPath, { force: true });
    log("launchd agent removed");
    return;
  }
  if (process.platform === "linux") {
    try {
      execFileSync("systemctl", ["--user", "disable", "--now", "matrix-runner.service"], {
        stdio: "ignore",
      });
    } catch {
      /* not enabled */
    }
    fs.rmSync(path.join(os.homedir(), ".config", "systemd", "user", "matrix-runner.service"), {
      force: true,
    });
    log("systemd user service removed");
    return;
  }
  if (process.platform === "win32") {
    execFileSync("schtasks", ["/Delete", "/F", "/TN", "MatrixRunner"]);
    log("Windows scheduled task removed");
    return;
  }
}
