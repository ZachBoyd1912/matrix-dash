/**
 * Get the site's base URL for constructing absolute URLs (OAuth callbacks, redirects, etc.).
 * Uses request headers when available, falls back to env var, then dev default.
 */
export function getSiteUrl(req?: Request): string {
  if (req) {
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "https";
    if (host) return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
