import fs from "fs";
import os from "os";
import path from "path";

/**
 * Runner-side persisted state: ~/.matrix-runner/config.json (0600).
 * The runner token is a device credential — never logged, never uploaded
 * anywhere except the Authorization header to the configured server.
 * MATRIX_RUNNER_DIR overrides the directory (tests, multi-profile).
 */

export interface RunnerConfig {
  serverUrl: string; // e.g. https://matrix.zbautomations.ie
  deviceId: string;
  runnerToken: string;
  deviceName: string;
  // Cloudflare Access service-token credentials (decision 3). Optional for
  // direct/dev servers; required when the server sits behind CF Access.
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
}

export function configDir(): string {
  return process.env.MATRIX_RUNNER_DIR || path.join(os.homedir(), ".matrix-runner");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function loadConfig(): RunnerConfig | null {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const cfg = JSON.parse(raw) as RunnerConfig;
    if (!cfg.serverUrl || !cfg.runnerToken || !cfg.deviceId) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: RunnerConfig): void {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}
