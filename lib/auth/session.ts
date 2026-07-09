import crypto from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users, authSessions } from "@/lib/db/schema";
import { SESSION_COOKIE } from "./constants";

/**
 * App-level login sessions. A high-entropy opaque token lives in an httpOnly
 * cookie and maps to an auth_sessions row (server-side, so sessions are
 * revocable). Resolving a request's user goes through getSessionUser().
 */

export { SESSION_COOKIE };
const SESSION_TTL_DAYS = 30;

export type SessionUser = typeof users.$inferSelect;
export interface ResolvedSession {
  user: SessionUser;
  sessionId: string;
  mfaSatisfied: boolean;
}

export function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string; mfaSatisfied?: boolean } = {}
): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  getDb()
    .insert(authSessions)
    .values({
      id: token,
      userId,
      mfaSatisfied: meta.mfaSatisfied ?? false,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ip: meta.ip ?? null,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt,
    })
    .run();
  return { token, expiresAt };
}

/** Resolve a session token to its user, or null if missing/expired/revoked. */
export function getSessionUser(token: string | undefined | null): ResolvedSession | null {
  if (!token) return null;
  const nowIso = new Date().toISOString();
  const row = getDb()
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.id, token), gt(authSessions.expiresAt, nowIso)))
    .get();
  if (!row) return null;
  const user = getDb().select().from(users).where(eq(users.id, row.userId)).get();
  if (!user || !user.isActive) return null;
  // Touch lastSeenAt (best-effort; not on the hot path critical section).
  try {
    getDb()
      .update(authSessions)
      .set({ lastSeenAt: nowIso })
      .where(eq(authSessions.id, token))
      .run();
  } catch {
    /* ignore */
  }
  return { user, sessionId: row.id, mfaSatisfied: !!row.mfaSatisfied };
}

export function markSessionMfaSatisfied(token: string): void {
  getDb().update(authSessions).set({ mfaSatisfied: true }).where(eq(authSessions.id, token)).run();
}

export function destroySession(token: string): void {
  getDb().delete(authSessions).where(eq(authSessions.id, token)).run();
}

/** Revoke every session for a user (e.g. password change, account disable). */
export function destroyAllSessions(userId: string): void {
  getDb().delete(authSessions).where(eq(authSessions.userId, userId)).run();
}
