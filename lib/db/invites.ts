import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getSystemDb } from "./client";
import { accountInvites, users } from "./schema";

/**
 * One-time member invite links. Owner mints a token for a member account; the
 * member opens /invite/<token> and sets their own password. Only the sha256
 * hash is stored; single-use, 7-day expiry.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

export function createInvite(userId: string, createdBy: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const db = getSystemDb();
  // One live invite per account — supersede any previous unused one.
  db.delete(accountInvites)
    .where(and(eq(accountInvites.userId, userId), isNull(accountInvites.usedAt)))
    .run();
  db.insert(accountInvites)
    .values({
      tokenHash: sha256(token),
      userId,
      createdBy,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
    })
    .run();
  return token;
}

export interface InviteTarget {
  userId: string;
  email: string;
  name: string;
}

/** Resolve an unexpired, unused invite token to its account (no mutation). */
export function resolveInvite(token: string): InviteTarget | null {
  const nowIso = new Date().toISOString();
  const row = getSystemDb()
    .select({ userId: accountInvites.userId })
    .from(accountInvites)
    .where(
      and(
        eq(accountInvites.tokenHash, sha256(token)),
        isNull(accountInvites.usedAt),
        gt(accountInvites.expiresAt, nowIso)
      )
    )
    .get();
  if (!row) return null;
  const user = getSystemDb()
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, row.userId))
    .get();
  return user ? { userId: user.id, email: user.email, name: user.name } : null;
}

/** Atomically consume an invite; returns the account id, or null if already used. */
export function consumeInvite(token: string): string | null {
  const nowIso = new Date().toISOString();
  const claim = getSystemDb()
    .update(accountInvites)
    .set({ usedAt: nowIso })
    .where(
      and(
        eq(accountInvites.tokenHash, sha256(token)),
        isNull(accountInvites.usedAt),
        gt(accountInvites.expiresAt, nowIso)
      )
    )
    .run();
  if (claim.changes !== 1) return null;
  return (
    getSystemDb()
      .select({ userId: accountInvites.userId })
      .from(accountInvites)
      .where(eq(accountInvites.tokenHash, sha256(token)))
      .get()?.userId ?? null
  );
}
