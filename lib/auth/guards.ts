import { getCurrentSession } from "./current-user";
import type { SessionUser } from "./session";

/**
 * Route guard for owner-only operations (account management). These routes live
 * under /api/accounts (non-public → middleware already requires a session
 * cookie) and operate on the cross-account users table via getSystemDb, so they
 * are deliberately NOT withUser-wrapped — they must never be scoped to one
 * account's workspace. They enforce the owner role themselves, here.
 *
 * Usage:
 *   const g = await requireOwner();
 *   if ("response" in g) return g.response;
 *   const actor = g.user; // guaranteed owner
 */
export type OwnerGuard = { user: SessionUser } | { response: Response };

export async function requireOwner(): Promise<OwnerGuard> {
  const session = await getCurrentSession();
  if (!session) {
    return { response: Response.json({ error: "Authentication required" }, { status: 401 }) };
  }
  if (session.user.role !== "owner") {
    return { response: Response.json({ error: "Owner access required" }, { status: 403 }) };
  }
  return { user: session.user };
}
