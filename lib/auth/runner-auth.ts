import crypto from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getSystemDb } from "@/lib/db/client";
import { runnerDevices, users } from "@/lib/db/schema";

/**
 * Machine-credential auth for Matrix Runner devices. A runner token is a
 * high-entropy secret minted once at pairing; only its sha256 lives in
 * runner_devices.token_hash. It is a device-takeover credential — treat like a
 * password: shown once, revocable from Settings → Devices, never logged.
 */

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function mintSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export type DeviceRow = typeof runnerDevices.$inferSelect;

export interface RunnerIdentity {
  device: DeviceRow;
  user: { id: string; role: string };
}

/**
 * Resolve the runner token on a request to its device + owning user, or null.
 * Rejects revoked devices and disabled accounts.
 */
export function resolveRunnerToken(req: Request): RunnerIdentity | null {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token.length < 32) return null;

  const db = getSystemDb();
  const device = db
    .select()
    .from(runnerDevices)
    .where(and(eq(runnerDevices.tokenHash, sha256Hex(token)), isNull(runnerDevices.revokedAt)))
    .get();
  if (!device) return null;

  const user = db
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, device.userId))
    .get();
  if (!user || !user.isActive) return null;

  return { device, user: { id: user.id, role: user.role } };
}

/** Route guard: 401 Response or the resolved identity. */
/**
 * Keep runner_devices.app_version current from the version the runner reports
 * on every request. It used to be written only at pair time, so a device that
 * self-updated still showed its original version in Settings → Devices — which
 * is actively misleading precisely when you are checking whether a fix landed.
 * Only writes on change, so this is a no-op on the overwhelming majority of
 * requests. An older runner sends no header and simply keeps its stored value.
 */
function recordReportedVersion(req: Request, device: DeviceRow): void {
  const reported = req.headers.get("x-runner-version");
  if (!reported || reported === device.appVersion) return;
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(reported)) return; // ignore anything malformed
  try {
    getSystemDb()
      .update(runnerDevices)
      .set({ appVersion: reported })
      .where(eq(runnerDevices.id, device.id))
      .run();
    device.appVersion = reported;
  } catch {
    /* version display is cosmetic — never fail a request over it */
  }
}

export function requireRunner(req: Request): RunnerIdentity | { response: Response } {
  const identity = resolveRunnerToken(req);
  if (!identity) {
    return {
      response: Response.json({ error: "Invalid or revoked runner token" }, { status: 401 }),
    };
  }
  recordReportedVersion(req, identity.device);
  return identity;
}
