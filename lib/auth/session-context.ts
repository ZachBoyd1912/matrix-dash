import { runWithUser } from "@/lib/db/context";
import { getCurrentSession } from "./current-user";

/**
 * Run `fn` in the current request's account context, resolved from the session
 * cookie. For OAuth callbacks: they're on the public path (no middleware
 * cookie-gate) but the browser still carries the initiating user's session, so
 * their connection writes land in that user's per-account DB — not always the
 * owner's. Falls back to no-context (owner/primary) when there's no session,
 * preserving prior behavior.
 */
export async function runInSessionContext<T>(fn: () => T | Promise<T>): Promise<T> {
  const session = await getCurrentSession();
  if (!session) return fn();
  return runWithUser(
    { userId: session.user.id, isOwner: session.user.role === "owner" },
    fn
  ) as Promise<T>;
}
