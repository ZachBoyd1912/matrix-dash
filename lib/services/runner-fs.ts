import { getContextUserId } from "@/lib/db/context";
import { getOwner } from "@/lib/db/users";
import { pickDevice } from "./runner-dispatch";
import { runnerFsRequest } from "./runner-bus";

/**
 * Route a workspace filesystem op to the current user's device when they have
 * one online. Returns { handled:false } to fall back to local (server) fs —
 * which only ever happens for the OWNER without a paired device (their VM).
 * Members always have a device (member login requires one at launch), so their
 * workspace browser always targets their own machine.
 */
export async function tryRemoteFs(
  op: string,
  args: Record<string, unknown>
): Promise<
  { handled: false } | { handled: true; result: { ok: boolean; data?: unknown; error?: string } }
> {
  const userId = getContextUserId() ?? getOwner()?.id ?? null;
  if (!userId) return { handled: false };
  const device = pickDevice(userId);
  if (!device) return { handled: false };
  const result = await runnerFsRequest(device.id, op, args);
  return { handled: true, result };
}
