import { requireRunner } from "@/lib/auth/runner-auth";
import { decisionsForDevice } from "@/lib/services/runner-approvals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Durable approval reconcile: the runner polls this (on connect + periodically)
 * for decisions on its in-flight agent-run jobs, so a decision made while the
 * device was mid-reconnect is never lost. Runner-token authed.
 */
export async function GET(req: Request) {
  const auth = requireRunner(req);
  if ("response" in auth) return auth.response;
  const { device } = auth;
  return Response.json({ decisions: decisionsForDevice(device.id, device.userId) });
}
