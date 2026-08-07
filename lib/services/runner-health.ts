import { and, eq, isNull } from "drizzle-orm";
import { getSystemDb } from "@/lib/db/client";
import { runnerDevices } from "@/lib/db/schema";
import { getSetting, setSetting } from "@/lib/db/settings";
import { getOwner } from "@/lib/db/users";
import { isRunnerOnline } from "./runner-bus";
import { notify } from "./notify";

/**
 * Device liveness alerting.
 *
 * A silently dead device is the most expensive failure this system has: the
 * runner once sat with a dropped connection for 8 hours while production,
 * unable to verify anything through it, reported all of the owner's projects
 * as deleted. Nothing surfaced that until someone went looking.
 *
 * But a laptop legitimately sleeps many times a day. Alerting on every drop
 * trains the owner to ignore the alert, which is worse than not having one —
 * hence the delay and the once-per-outage latch.
 */
export const OFFLINE_ALERT_AFTER_MS = 5 * 60_000;
const ALERT_FLAG = "runner_offline_alerted";

export function shouldAlertOffline(input: {
  anyOnline: boolean;
  lastSeenAt: string | null;
  alreadyAlerted: boolean;
  now: number;
  thresholdMs?: number;
}): boolean {
  if (input.anyOnline) return false;
  if (input.alreadyAlerted) return false; // once per outage, not per check
  if (!input.lastSeenAt) return false; // never connected — nothing has broken yet
  const threshold = input.thresholdMs ?? OFFLINE_ALERT_AFTER_MS;
  return input.now - new Date(input.lastSeenAt).getTime() > threshold;
}

/**
 * Called from the daemon heartbeat, inside the owner's DB context. Latches on
 * `runner_offline_alerted` so a long outage produces exactly one notification,
 * and clears the latch as soon as a device comes back.
 */
export function checkDeviceHealth(): void {
  const owner = getOwner();
  if (!owner) return;

  const devices = getSystemDb()
    .select()
    .from(runnerDevices)
    .where(and(eq(runnerDevices.userId, owner.id), isNull(runnerDevices.revokedAt)))
    .all();
  if (devices.length === 0) {
    // Nothing paired is not an outage. Clear any latch left over from a device
    // that was revoked mid-outage — otherwise it stays set forever and silently
    // suppresses the first alert for whatever device gets paired next.
    if (getSetting(ALERT_FLAG) === "1") setSetting(ALERT_FLAG, "0");
    return;
  }

  const anyOnline = devices.some((d) => isRunnerOnline(d.id));
  const lastSeenAt =
    devices
      .map((d) => d.lastSeenAt)
      .filter((s): s is string => !!s)
      .sort()
      .pop() ?? null;

  if (anyOnline) {
    if (getSetting(ALERT_FLAG) === "1") setSetting(ALERT_FLAG, "0");
    return;
  }

  if (
    !shouldAlertOffline({
      anyOnline,
      lastSeenAt,
      alreadyAlerted: getSetting(ALERT_FLAG) === "1",
      now: Date.now(),
    })
  ) {
    return;
  }

  setSetting(ALERT_FLAG, "1");
  void notify({
    title: "Matrix Runner offline",
    body: "Your device has been unreachable for over 5 minutes. Vault and project data may be stale.",
    kind: "info",
    href: "/dashboard/settings/devices",
  });
}
