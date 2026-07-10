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
export function requireRunner(req: Request): RunnerIdentity | { response: Response } {
  const identity = resolveRunnerToken(req);
  if (!identity) {
    return {
      response: Response.json({ error: "Invalid or revoked runner token" }, { status: 401 }),
    };
  }
  return identity;
}
