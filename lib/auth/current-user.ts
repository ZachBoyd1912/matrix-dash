import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, getSessionUser, type ResolvedSession } from "./session";

/**
 * Resolve the authenticated user for the current request (server-side).
 * Reads the app session cookie; the Cloudflare Access email header is available
 * as a fallback/enrichment (the edge already verified it).
 */
export async function getCurrentSession(): Promise<ResolvedSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return getSessionUser(token);
}

export async function getCurrentUser() {
  return (await getCurrentSession())?.user ?? null;
}

/** The Cloudflare-Access-verified email for this request, if present. */
export async function getCloudflareAccessEmail(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-access-authenticated-user-email") || null;
}
