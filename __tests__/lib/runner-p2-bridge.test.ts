import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Server-side P2 bridges, real routes + a mock runner. Proves: the events
 * uplink persists a device run's transcript/usage/status into the OWNER's DB;
 * an approval_request creates a pending approval; and — the advisor's flagged
 * bug — a decision made while the device is "disconnected" is still delivered
 * via the durable /api/runner/approvals poll (reconcile), not just a pushed
 * frame.
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
import { POST as postEvents } from "@/app/api/runner/events/route";
import { GET as getApprovals } from "@/app/api/runner/approvals/route";
import { POST as decideApproval } from "@/app/api/agents/approvals/[id]/route";
import { enqueueJob } from "@/lib/services/runner-bus";
import { getDb, getSystemDb } from "@/lib/db/client";
import { agentRuns, agentApprovals, agents } from "@/lib/db/schema";
import { createUser } from "@/lib/db/users";
import { PROTOCOL_VERSION } from "@/lib/runner/protocol";

const jsonReq = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

let userId: string;
let token: string;
let deviceId: string;
let agentId: string;
let runId: string;
let jobId: string;

beforeAll(async () => {
  userId = createUser({
    email: `p2-${crypto.randomUUID()}@x.com`,
    password: "pw12345678",
    role: "owner",
  }).id;
  fakeSession = { user: { id: userId, role: "owner" }, sessionId: "s", mfaSatisfied: true };

  const code = (await (await mintPairCode()).json()).code;
  const pairRes = await pair(
    jsonReq("http://t/api/runner/pair", {
      code,
      protocolVersion: PROTOCOL_VERSION,
      device: { name: "d", platform: "darwin", arch: "arm64", appVersion: "0.1.0" },
    })
  );
  ({ runnerToken: token, deviceId } = await pairRes.json());

  // Seed an agent + a runner-executed run + its dispatched job (owner DB).
  agentId = crypto.randomUUID();
  runId = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(agents)
    .values({
      id: agentId,
      name: "TestAgent",
      instructions: "x",
      createdAt: now,
      updatedAt: now,
    } as never)
    .run();
  getDb()
    .insert(agentRuns)
    .values({
      id: runId,
      agentId,
      status: "queued",
      execution: "runner",
      deviceId,
      prompt: "go",
      createdAt: now,
    } as never)
    .run();
  jobId = enqueueJob({
    userId,
    deviceId,
    kind: "agent_run",
    agentRunId: runId,
    payload: { agentRunId: runId },
  });
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe("P2 server bridges", () => {
  it("events uplink persists transcript + usage + terminal status into the owner DB", async () => {
    const res = await postEvents(
      jsonReq(
        "http://t/api/runner/events",
        {
          protocolVersion: PROTOCOL_VERSION,
          frames: [
            { type: "job_status", jobId, status: "running" },
            { type: "run_event", jobId, runId, events: [{ type: "text", value: "working on it" }] },
            {
              type: "usage",
              jobId,
              runId,
              inputTokens: 50,
              outputTokens: 10,
              costUsd: 0.03,
              numTurns: 2,
            },
            {
              type: "job_status",
              jobId,
              status: "done",
              runStatus: "succeeded",
              result: "finished",
            },
          ],
        },
        auth()
      )
    );
    expect(res.status).toBe(200);
    const row = getDb().select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
    expect(row?.status).toBe("succeeded");
    expect(row?.result).toBe("finished");
    expect(row?.costUsd).toBe(0.03);
    expect(row?.blocks).toContain("working on it");
  });

  it("approval_request creates a pending approval; decision reconciles via poll", async () => {
    // Fresh in-flight job: the device reports it 'running' (reconcile reads
    // dispatched|running jobs). No live connection, so mark it via events.
    const job2 = enqueueJob({
      userId,
      deviceId,
      kind: "agent_run",
      agentRunId: runId,
      payload: {},
    });
    await postEvents(
      jsonReq(
        "http://t/api/runner/events",
        {
          protocolVersion: PROTOCOL_VERSION,
          frames: [{ type: "job_status", jobId: job2, status: "running" }],
        },
        auth()
      )
    );
    const approvalId = crypto.randomUUID();

    await postEvents(
      jsonReq(
        "http://t/api/runner/events",
        {
          protocolVersion: PROTOCOL_VERSION,
          frames: [
            {
              type: "approval_request",
              jobId: job2,
              runId,
              approvalId,
              toolName: "Bash",
              input: { command: "curl example.com" },
              summary: "run a command",
              tier: "gated",
            },
          ],
        },
        auth()
      )
    );
    const pending = getDb()
      .select()
      .from(agentApprovals)
      .where(eq(agentApprovals.id, approvalId))
      .get();
    expect(pending?.status).toBe("pending");

    // Before a decision, the reconcile poll returns nothing.
    let poll = await (
      await getApprovals(new Request("http://t/api/runner/approvals", { headers: auth() }))
    ).json();
    expect(
      poll.decisions.find((d: { approvalId: string }) => d.approvalId === approvalId)
    ).toBeUndefined();

    // The owner approves via the normal dashboard API (device "offline" — we
    // never deliver a frame; only the durable poll below must carry it).
    const dec = await decideApproval(jsonReq("http://t", { decision: "approve" }), {
      params: Promise.resolve({ id: approvalId }),
    });
    expect(dec.status).toBe(200);

    // Reconcile poll now delivers the decision durably.
    poll = await (
      await getApprovals(new Request("http://t/api/runner/approvals", { headers: auth() }))
    ).json();
    const hit = poll.decisions.find((d: { approvalId: string }) => d.approvalId === approvalId);
    expect(hit).toEqual({ approvalId, approved: true });
  });
});
