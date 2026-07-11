import { describe, it, expect } from "vitest";
import {
  pushDeviceLog,
  snapshotDeviceLog,
  subscribeDeviceLog,
} from "@/lib/services/runner-console";

/** Per-device console bus: snapshot, live fan-out, per-device isolation, cap. */

describe("runner console bus", () => {
  it("buffers + fans out lines per device, isolated between devices", () => {
    const got: string[] = [];
    const unsub = subscribeDeviceLog("dev-A", (l) => got.push(l.text));

    pushDeviceLog("dev-A", ["hello", "world  ", ""]); // trailing ws + blank stripped
    pushDeviceLog("dev-B", ["other device"]);

    // Live subscriber saw only dev-A's non-empty lines (trailing ws trimmed).
    expect(got).toEqual(["hello", "world"]);
    // Snapshot is per-device.
    expect(snapshotDeviceLog("dev-A").map((l) => l.text)).toEqual(["hello", "world"]);
    expect(snapshotDeviceLog("dev-B").map((l) => l.text)).toEqual(["other device"]);

    unsub();
    pushDeviceLog("dev-A", ["after-unsub"]);
    expect(got).toEqual(["hello", "world"]); // no longer receiving
    expect(snapshotDeviceLog("dev-A").map((l) => l.text)).toContain("after-unsub"); // still buffered
  });

  it("caps the ring buffer", () => {
    for (let i = 0; i < 1200; i++) pushDeviceLog("dev-cap", [`line-${i}`]);
    const snap = snapshotDeviceLog("dev-cap");
    expect(snap.length).toBeLessThanOrEqual(1000);
    expect(snap[snap.length - 1].text).toBe("line-1199"); // newest kept
  });
});
