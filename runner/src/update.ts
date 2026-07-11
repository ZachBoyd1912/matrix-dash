import fs from "fs";
import path from "path";
import { authHeaders } from "./api";
import type { RunnerConfig } from "./config";
import { RUNNER_VERSION } from "./version";

/**
 * Self-update: compare our version against the server's manifest, download the
 * new bundle, atomically swap it over this script's own path, and exit — the
 * OS service (KeepAlive / Restart=always / logon task) brings up the new
 * version. Foreground (non-service) runs just log that a restart is needed.
 */

interface UpdateManifest {
  version: string;
  protocolVersion: number;
  downloadPath: string;
}

/** true when a > b (dotted numeric versions; unequal lengths padded with 0). */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export async function checkAndApplyUpdate(
  cfg: RunnerConfig,
  log: (m: string) => void,
  opts: { exitOnUpdate?: boolean } = {}
): Promise<boolean> {
  let manifest: UpdateManifest;
  try {
    const res = await fetch(new URL("/api/runner/update", cfg.serverUrl), {
      headers: authHeaders(cfg),
    });
    if (!res.ok) return false;
    manifest = (await res.json()) as UpdateManifest;
  } catch {
    return false; // update checks are best-effort, never fatal
  }

  if (!isNewerVersion(manifest.version, RUNNER_VERSION)) return false;
  log(`update available: v${RUNNER_VERSION} → v${manifest.version}`);

  const self = path.resolve(process.argv[1]);
  const staging = `${self}.next`;
  try {
    const res = await fetch(new URL(manifest.downloadPath, cfg.serverUrl), {
      headers: authHeaders(cfg),
    });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Sanity floor: an error page is not a runner bundle.
    if (buf.length < 1000 || !buf.subarray(0, 200).toString("utf8").includes("node")) {
      throw new Error("downloaded artifact doesn't look like the runner bundle");
    }
    fs.writeFileSync(staging, buf, { mode: 0o755 });
    fs.renameSync(staging, self); // atomic on same filesystem
    log(`updated bundle on disk to v${manifest.version}`);
    if (opts.exitOnUpdate) {
      log("exiting so the service restarts on the new version");
      process.exit(0);
    }
    log("restart the runner to apply the update");
    return true;
  } catch (err) {
    fs.rmSync(staging, { force: true });
    log(
      `update failed (staying on v${RUNNER_VERSION}): ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}
