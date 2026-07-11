/** Auth constants safe to import from the edge/middleware (no DB imports). */
export const SESSION_COOKIE = "matrix_session";

/**
 * API path prefixes reachable without an app session — the login flow itself,
 * token-authed webhooks, and OAuth provider callbacks (validated by state).
 */
export const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/hooks/"];

/**
 * Matrix Runner machine-credential routes: authenticated by the runner token
 * (Authorization: Bearer) or a one-time pair code — never a session cookie.
 * Deliberately EXACT paths, not the whole /api/runner/ prefix: the management
 * routes (/api/runner/devices, /api/runner/pair-code) are session-authed and
 * must stay behind the cookie gate.
 */
export const RUNNER_TOKEN_API_PATHS = [
  "/api/runner/pair",
  "/api/runner/connect",
  "/api/runner/events",
  "/api/runner/approvals",
  "/api/runner/tool-call",
  "/api/runner/update",
  "/api/runner/download",
  // Install scripts run via curl on a fresh, sessionless device; the embedded
  // one-time pair code is the credential that makes the script useful.
  "/api/runner/install",
];

export function isRunnerTokenApi(pathname: string): boolean {
  return RUNNER_TOKEN_API_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * KNOWN PER-ACCOUNT GAP (multi-tenant Phase 2b → 3/4): these public/session-less
 * routes are intentionally NOT wrapped in withUser(), so any DB writes they make
 * land in the primary (owner) database rather than a per-account workspace:
 *   - /api/oauth/&#42;/callback — stores provider connections; a member connecting
 *     their own Gmail/GitHub would currently write to the owner DB.
 *   - /api/hooks/[token] + /api/hooks/approval — webhook-triggered agent runs
 *     execute in owner context (per-user agent scoping is Phase 4).
 * Safe today because member accounts can't be created until Phase 3 gates open.
 * Revisit both when enabling members: the OAuth callback carries the initiating
 * user's session cookie and can be scoped; webhook runs need the agent's owner.
 */

export function isPublicApi(pathname: string): boolean {
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Runner machine-credential routes carry their own Bearer-token auth.
  if (isRunnerTokenApi(pathname)) return true;
  // OAuth callbacks come from external providers before an app session exists.
  if (/^\/api\/oauth\/[^/]+\/callback/.test(pathname)) return true;
  return false;
}
