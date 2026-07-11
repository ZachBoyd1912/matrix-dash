import type { StreamEvent } from "@/lib/chat/blocks";

/* ------------------------------------------------------------------ *
 * Matrix Runner wire protocol — shared between the control plane (this
 * app) and the runner process on a user's device. Transport is two
 * HTTP legs, both through Cloudflare + Caddy:
 *
 *   runner ──GET  /api/runner/connect──►  long-lived NDJSON response;
 *          ◄── ServerFrame per line ──    server pushes work + control
 *   runner ──POST /api/runner/events──►  batched RunnerFrame[] uploads
 *
 * The runner dials OUT (works behind NAT, no ports on user devices).
 * Heartbeats are LOAD-BEARING: Cloudflare reaps idle responses around
 * ~100s, so the server pings every HEARTBEAT_MS and the runner reports
 * in at the same cadence; silence past OFFLINE_AFTER_MS marks the
 * device offline. Bump PROTOCOL_VERSION on any breaking frame change —
 * the server rejects mismatched runners with `update_required` so the
 * auto-updater can catch them up.
 * ------------------------------------------------------------------ */

export const PROTOCOL_VERSION = 1;
export const HEARTBEAT_MS = 20_000;
export const OFFLINE_AFTER_MS = 45_000;

export type JobKind = "agent_run" | "fs_op" | "console_stream" | "ide_ctl" | "ping";

export type JobStatus =
  "queued" | "dispatched" | "running" | "done" | "error" | "skipped_offline" | "cancelled";

export interface DeviceInfo {
  name: string;
  platform: string; // darwin|linux|win32
  arch: string;
  appVersion: string;
}

/* ── server → runner (NDJSON lines on /api/runner/connect) ── */

export type ServerFrame =
  | { type: "hello"; deviceId: string; protocolVersion: number; serverTime: string }
  | { type: "ping"; t: number }
  | { type: "job_dispatch"; jobId: string; kind: JobKind; payload: Record<string, unknown> }
  | { type: "job_cancel"; jobId: string }
  | { type: "approval_decision"; approvalId: string; approved: boolean }
  | { type: "update_available"; version: string }
  | { type: "update_required"; minProtocol: number }
  | { type: "kill_switch" };

/* ── runner → server (batched in POST /api/runner/events) ── */

export type RunnerFrame =
  | { type: "pong"; t: number }
  | {
      type: "job_status";
      jobId: string;
      status: JobStatus;
      error?: string;
      // For agent_run jobs, the device-computed final agent-run status
      // (succeeded|needs_review|failed|timeout|cancelled|interrupted) — the git
      // finalize that decides succeeded-vs-needs_review runs on the device.
      runStatus?: string;
      result?: string;
    }
  | { type: "run_event"; jobId: string; runId: string; events: StreamEvent[] }
  | {
      type: "approval_request";
      jobId: string;
      runId: string;
      approvalId: string;
      toolName: string;
      input: Record<string, unknown>;
      summary: string;
      tier: "gated" | "break_glass";
      justification?: string;
    }
  | {
      type: "usage";
      jobId: string;
      runId: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      numTurns: number;
    }
  | { type: "fs_result"; jobId: string; ok: boolean; data?: unknown; error?: string }
  | { type: "log_lines"; lines: string[] };

export interface EventsRequestBody {
  protocolVersion: number;
  frames: RunnerFrame[];
}

export interface PairRequestBody {
  code: string;
  protocolVersion: number;
  device: DeviceInfo;
}

export interface PairResponseBody {
  deviceId: string;
  runnerToken: string;
}

export function encodeFrame(frame: ServerFrame): string {
  return JSON.stringify(frame) + "\n";
}
