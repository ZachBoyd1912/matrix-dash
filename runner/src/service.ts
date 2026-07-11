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

export function installService(log: (m: string) => void): void {
  const logDir = path.join(os.homedir(), ".matrix-runner", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "runner.log");

  if (process.platform === "darwin") {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${nodePath()}</string>
    <string>${selfPath()}</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${logFile}</string>
  <key>StandardErrorPath</key><string>${logFile}</string>
</dict></plist>
`;
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
    const unit = `[Unit]
Description=Matrix Runner
After=network-online.target

[Service]
ExecStart=${nodePath()} ${selfPath()} run
Restart=always
RestartSec=5
StandardOutput=append:${logFile}
StandardError=append:${logFile}

[Install]
WantedBy=default.target
`;
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
    const cmd = `"${nodePath()}" "${selfPath()}" run`;
    execFileSync("schtasks", [
      "/Create",
      "/F",
      "/SC",
      "ONLOGON",
      "/TN",
      "MatrixRunner",
      "/TR",
      cmd,
    ]);
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
