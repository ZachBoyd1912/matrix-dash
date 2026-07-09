/** Auth constants safe to import from the edge/middleware (no DB imports). */
export const SESSION_COOKIE = "matrix_session";

/**
 * API path prefixes reachable without an app session — the login flow itself,
 * token-authed webhooks, and OAuth provider callbacks (validated by state).
 */
export const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/hooks/"];

export function isPublicApi(pathname: string): boolean {
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // OAuth callbacks come from external providers before an app session exists.
  if (/^\/api\/oauth\/[^/]+\/callback/.test(pathname)) return true;
  return false;
}
