import { describe, it, expect } from "vitest";
import { shouldAlertOffline, OFFLINE_ALERT_AFTER_MS } from "@/lib/services/runner-health";

/**
 * A laptop lid closing is not an outage. If every brief drop raised an alert
 * the signal would be learned-ignored within a day, which is worse than no
 * alert at all — so the threshold and the once-per-outage latch are the whole
 * point of this function, not incidental detail.
 */
const NOW = 1_700_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("shouldAlertOffline", () => {
  it("never alerts while a device is online", () => {
    expect(
      shouldAlertOffline({ anyOnline: true, lastSeenAt: iso(0), alreadyAlerted: false, now: NOW })
    ).toBe(false);
  });

  it("stays quiet for a brief drop — a closing lid is not an outage", () => {
    expect(
      shouldAlertOffline({
        anyOnline: false,
        lastSeenAt: iso(60_000),
        alreadyAlerted: false,
        now: NOW,
      })
    ).toBe(false);
  });

  it("alerts once the device has been down past the threshold", () => {
    expect(
      shouldAlertOffline({
        anyOnline: false,
        lastSeenAt: iso(OFFLINE_ALERT_AFTER_MS + 1),
        alreadyAlerted: false,
        now: NOW,
      })
    ).toBe(true);
  });

  it("does not alert twice for the same outage", () => {
    expect(
      shouldAlertOffline({
        anyOnline: false,
        lastSeenAt: iso(OFFLINE_ALERT_AFTER_MS + 1),
        alreadyAlerted: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("does not alert for a device that has never connected", () => {
    // Freshly paired but never started — nothing has gone wrong yet.
    expect(
      shouldAlertOffline({ anyOnline: false, lastSeenAt: null, alreadyAlerted: false, now: NOW })
    ).toBe(false);
  });

  it("does not fire at exactly the threshold, only past it", () => {
    expect(
      shouldAlertOffline({
        anyOnline: false,
        lastSeenAt: iso(OFFLINE_ALERT_AFTER_MS),
        alreadyAlerted: false,
        now: NOW,
      })
    ).toBe(false);
  });
});
