import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * P0 integration test for the Matrix Runner control-plane spine, driving the
 * REAL route handlers with a mock runner client:
 *   mint pair code → pair (one-time, expiring) → connect (NDJSON downlink:
 *   hello + queued-job dispatch) → events uplink (pong/job_status) →
 *   job lifecycle → revoke kills auth.
 */

let fakeSession: {
  user: { id: string; role: string };
  sessionId: string;
  mfaSatisfied: boolean;
} | null = null;

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentSession: async () => fakeSession,
  getCurrentUser: async () => fakeSession?.user ?? null,
  getCloudflareAccessEmail: async () => null,
}));

import { POST as mintPairCode } from "@/app/api/runner/pair-code/route";
import { POST as pair } from "@/app/api/runner/pair/route";
import { GET as connect } from "@/app/api/runner/connect/route";
import { POST as postEvents } from "@/app/api/runner/events/route";
import { GET as listDevices } from "@/app/api/runner/devices/route";
import { DELETE as revokeDevice } from "@/app/api/runner/devices/[id]/route";
import { enqueueJob, isRunnerOnline, dispatchQueuedJobs } from "@/lib/services/runner-bus";
import { getSystemDb } from "@/lib/db/client";
import { runnerJobs } from "@/lib/db/schema";
import { createUser } from "@/lib/db/users";
import { PROTOCOL_VERSION, type ServerFrame } from "@/lib/runner/protocol";

const DEVICE_INFO = { name: "Test Mac", platform: "darwin", arch: "arm64", appVersion: "0.0.1" };

function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Read NDJSON ServerFrames from the connect response until `count` arrive. */
async function readFrames(res: Response, count: number, timeoutMs = 4000): Promise<ServerFrame[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const frames: ServerFrame[] = [];
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (frames.length < count && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) frames.push(JSON.parse(line) as ServerFrame);
    }
  }
  reader.cancel().catch(() => {});
  return frames;
}

let userId: string;
let runnerToken: string;
let deviceId: string;

beforeAll(() => {
  userId = createUser({
    email: `runner-p0-${crypto.randomUUID()}@x.com`,
    password: "pw12345678",
    role: "owner",
  }).id;
  fakeSession = { user: { id: userId, role: "owner" }, sessionId: "s", mfaSatisfied: true };
});

describe("Matrix Runner P0 spine", () => {
  it("pairs with a one-time code and rejects reuse", async () => {
    const mint = await mintPairCode();
    expect(mint.status).toBe(200);
    const { code } = await mint.json();

    const res = await pair(
      jsonReq("http://t/api/runner/pair", {
        code,
        protocolVersion: PROTOCOL_VERSION,
        device: DEVICE_INFO,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    runnerToken = body.runnerToken;
    deviceId = body.deviceId;
    expect(runnerToken).toHaveLength(64);

    // Reuse must fail (single-use).
    const again = await pair(
      jsonReq("http://t/api/runner/pair", {
        code,
        protocolVersion: PROTOCOL_VERSION,
        device: DEVICE_INFO,
      })
    );
    expect(again.status).toBe(401);
  });

  it("rejects a protocol-mismatched pair", async () => {
    const mint = await mintPairCode();
    const { code } = await mint.json();
    const res = await pair(
      jsonReq("http://t/api/runner/pair", { code, protocolVersion: 999, device: DEVICE_INFO })
    );
    expect(res.status).toBe(426);
  });

  it("connect streams hello + dispatches a queued job; events update its status", async () => {
    // Queue a job while "offline" — it must dispatch on connect.
    const jobId = enqueueJob({ userId, deviceId, kind: "ping", payload: { hello: true } });
    const queued = getSystemDb().select().from(runnerJobs).where(eq(runnerJobs.id, jobId)).get();
    expect(queued?.status).toBe("queued");

    const res = await connect(
      new Request("http://t/api/runner/connect", {
        headers: { authorization: `Bearer ${runnerToken}` },
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("ndjson");

    // Device is online while the stream is open (registerRunner ran in start()).
    expect(isRunnerOnline(deviceId)).toBe(true);

    // Reading drains hello + the dispatched job, then cancels (→ unregisters).
    const frames = await readFrames(res, 2);
    expect(frames[0]).toMatchObject({ type: "hello", deviceId, protocolVersion: PROTOCOL_VERSION });
    const dispatch = frames.find((f) => f.type === "job_dispatch");
    expect(dispatch).toMatchObject({ type: "job_dispatch", jobId, kind: "ping" });

    // Runner reports the job done via the uplink.
    const ev = await postEvents(
      jsonReq(
        "http://t/api/runner/events",
        {
          protocolVersion: PROTOCOL_VERSION,
          frames: [
            { type: "pong", t: Date.now() },
            { type: "job_status", jobId, status: "done" },
          ],
        },
        { authorization: `Bearer ${runnerToken}` }
      )
    );
    expect(ev.status).toBe(200);
    const row = getSystemDb().select().from(runnerJobs).where(eq(runnerJobs.id, jobId)).get();
    expect(row?.status).toBe("done");
    expect(row?.completedAt).toBeTruthy();
  });

  it("device list shows the paired device; bad tokens are rejected", async () => {
    const list = await listDevices();
    const devices = await list.json();
    expect(devices.some((d: { id: string }) => d.id === deviceId)).toBe(true);

    const bad = await postEvents(
      jsonReq(
        "http://t/api/runner/events",
        { protocolVersion: PROTOCOL_VERSION, frames: [] },
        { authorization: `Bearer ${"0".repeat(64)}` }
      )
    );
    expect(bad.status).toBe(401);
  });

  it("revocation kills the token immediately", async () => {
    const del = await revokeDevice(new Request("http://t", { method: "DELETE" }), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(del.status).toBe(200);

    const after = await postEvents(
      jsonReq(
        "http://t/api/runner/events",
        { protocolVersion: PROTOCOL_VERSION, frames: [] },
        { authorization: `Bearer ${runnerToken}` }
      )
    );
    expect(after.status).toBe(401);

    // Queued work for a revoked device stays undispatched.
    const jobId = enqueueJob({ userId, deviceId, kind: "ping", payload: {} });
    dispatchQueuedJobs(deviceId);
    const row = getSystemDb().select().from(runnerJobs).where(eq(runnerJobs.id, jobId)).get();
    expect(row?.status).toBe("queued");
  });
});
