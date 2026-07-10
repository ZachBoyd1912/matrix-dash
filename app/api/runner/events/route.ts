import { z } from "zod";
import { requireRunner } from "@/lib/auth/runner-auth";
import { markRunnerActivity, updateJobStatus } from "@/lib/services/runner-bus";
import { publishRunEvent } from "@/lib/services/run-bus";
import { PROTOCOL_VERSION, type RunnerFrame } from "@/lib/runner/protocol";
import type { StreamEvent } from "@/lib/chat/blocks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  protocolVersion: z.number().int(),
  frames: z.array(z.record(z.string(), z.unknown())).max(500),
});

/**
 * The runner's uplink: batched RunnerFrames. Counterpart of the /connect
 * downlink. P0 handles liveness + job status + run-event fan-out to the live
 * UI; the P2 execution bridge adds transcript persistence, approvals and
 * usage accounting on top of the same frame stream.
 */
export async function POST(req: Request) {
  const auth = requireRunner(req);
  if ("response" in auth) return auth.response;
  const { device } = auth;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Invalid frame batch" }, { status: 400 });
  if (parsed.data.protocolVersion !== PROTOCOL_VERSION) {
    return Response.json(
      { error: "Protocol mismatch", minProtocol: PROTOCOL_VERSION },
      { status: 426 }
    );
  }

  // Any authenticated upload proves liveness.
  markRunnerActivity(device.id);

  let handled = 0;
  for (const raw of parsed.data.frames as unknown as RunnerFrame[]) {
    switch (raw.type) {
      case "pong":
        handled++;
        break;
      case "job_status":
        updateJobStatus(raw.jobId, raw.status, raw.error);
        handled++;
        break;
      case "run_event":
        // Live fan-out to any open run view. (P2 adds appendEvent persistence.)
        for (const ev of raw.events as StreamEvent[]) publishRunEvent(raw.runId, ev);
        handled++;
        break;
      case "approval_request":
      case "usage":
      case "fs_result":
      case "log_lines":
        // Accepted (protocol-stable) — wired up by the P2/P4 bridges.
        handled++;
        break;
      default:
        // Unknown frame types are ignored, not fatal — forward compatibility.
        break;
    }
  }

  return Response.json({ ok: true, handled });
}
