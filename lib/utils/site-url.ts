/**
 * The site's base URL, for building absolute URLs (OAuth redirect_uri, redirects).
 *
 * Order matters and is deliberate:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — configured, and NOT attacker-controllable. It
 *    wins because this value is handed to third-party OAuth providers as
 *    `redirect_uri`; deriving that from a request header an attacker can set
 *    is how Host-header injection turns into token theft.
 * 2. Forwarded/Host headers — behind Caddy these are correct, and this keeps
 *    non-production hosts working without configuration.
 * 3. localhost — dev default.
 *
 * Explicitly NOT `new URL(req.url).origin`: inside the standalone server that
 * is the internal bind address, which produced
 * `redirect_uri=https://0.0.0.0:3000/...` in production and was rejected by
 * every provider.
 */
export function getSiteUrl(req?: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (req) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "https";
    if (host) return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}
