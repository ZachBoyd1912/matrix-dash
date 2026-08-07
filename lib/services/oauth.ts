import { randomUUID } from "crypto";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { oauthStates } from "@/lib/db/schema";

/**
 * The origin to hand a third-party OAuth provider as `redirect_uri`.
 *
 * NOT `new URL(req.url).origin`. Behind Caddy the app only ever sees its own
 * internal bind address, so that produced a literally unusable authorize URL
 * in production — `redirect_uri=https://0.0.0.0:3000/...`, which every
 * provider rejects. It broke all five integrations (GitHub, Drive, Gmail,
 * Calendar, Slack) identically and silently.
 *
 * Authorize and callback MUST derive this the same way: providers compare the
 * redirect_uri sent at authorize against the one sent at token exchange and
 * reject any mismatch. That is why this lives in one place.
 */
export function publicOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  // Caddy sets these; trust them only as a fallback when nothing is configured.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${req.headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  return new URL(req.url).origin; // local dev — same thing anyway
}

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
