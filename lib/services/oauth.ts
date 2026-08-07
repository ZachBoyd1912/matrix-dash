import { randomUUID } from "crypto";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { oauthStates } from "@/lib/db/schema";

export function generateOAuthState(provider: string, redirectTo: string): string {
  const state = randomUUID();
  getDb()
    .insert(oauthStates)
    .values({
      id: randomUUID(),
      state,
      provider,
      redirectTo,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    })
    .run();
  return state;
}

export function verifyOAuthState(state: string, provider: string): string | null {
  const row = getDb()
    .select()
    .from(oauthStates)
    .where(and(eq(oauthStates.state, state), eq(oauthStates.provider, provider)))
    .get();
  if (!row) return null;
  getDb().delete(oauthStates).where(eq(oauthStates.id, row.id)).run();
  if (new Date(row.expiresAt) < new Date()) return null;
  return row.redirectTo;
}

export function purgeExpiredOAuthStates(): void {
  getDb().delete(oauthStates).where(lte(oauthStates.expiresAt, new Date().toISOString())).run();
}
