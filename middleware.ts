import { NextResponse, type NextRequest } from "next/server";

/**
 * Self-hosted, single-instance app — an in-memory sliding window is fine
 * (no need for Redis/distributed state). Runs in the Node.js middleware
 * runtime below so this Map persists across requests in the one long-lived
 * process, the same way it would for any other self-hosted Node server.
 */
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 100;
// /api/hooks/[token] is the one endpoint designed for external, non-browser
// callers (see route comment) and triggers agent execution — tighter budget.
const WEBHOOK_LIMIT = 20;

// Opportunistic eviction on access rather than a timer — keeps this portable
// across middleware runtimes without relying on setInterval semantics.
function checkRateLimit(key: string, limit: number, now: number): boolean {
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Inbound webhook: authenticated by the token in the URL itself, and called
// by non-browser clients that won't send a matching (or any) Origin header.
function isCsrfExempt(pathname: string): boolean {
  return pathname.startsWith("/api/hooks/");
}

/**
 * Blocks a cross-site request from silently mutating state via the victim's
 * browser session. Only fires when Origin/Referer is present AND mismatched —
 * requests with neither header (direct API/CLI use against your own instance,
 * which this app is explicitly designed to support — see /api/hooks) pass
 * through untouched. That's the same lenient same-origin check most
 * frameworks use instead of per-request CSRF tokens.
 */
function isCrossSiteMutation(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const self = req.nextUrl.origin;

  if (origin) return origin !== self;
  if (referer) {
    try {
      return new URL(referer).origin !== self;
    } catch {
      return false;
    }
  }
  return false;
}

const DEFAULT_BODY_LIMIT = 1_000_000; // 1MB
const LARGE_BODY_LIMIT = 10_000_000; // 10MB
const LARGE_BODY_PREFIXES = ["/api/ai/chat", "/api/images", "/api/uploads", "/api/workspace/file"];

function bodyLimitFor(pathname: string): number {
  return LARGE_BODY_PREFIXES.some((p) => pathname.startsWith(p))
    ? LARGE_BODY_LIMIT
    : DEFAULT_BODY_LIMIT;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const now = Date.now();
  const ip = clientIp(req);
  const limit = pathname.startsWith("/api/hooks/") ? WEBHOOK_LIMIT : DEFAULT_LIMIT;
  const bucketKey = pathname.startsWith("/api/hooks/") ? `hook:${ip}` : `api:${ip}`;

  if (!checkRateLimit(bucketKey, limit, now)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (MUTATING_METHODS.has(req.method)) {
    if (!isCsrfExempt(pathname) && isCrossSiteMutation(req)) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }

    // A body without Content-Length (chunked transfer) would bypass the size
    // gate entirely — middleware can't buffer the stream to measure it, so
    // require the header on any request that carries a body (411 is the
    // standard status for exactly this). GET/HEAD-style bodyless mutations
    // (some DELETEs send no body and no header) stay allowed.
    const contentLength = req.headers.get("content-length");
    if (!contentLength && req.headers.get("transfer-encoding")) {
      return NextResponse.json({ error: "Length required" }, { status: 411 });
    }
    if (contentLength && Number(contentLength) > bodyLimitFor(pathname)) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
  runtime: "nodejs",
};
