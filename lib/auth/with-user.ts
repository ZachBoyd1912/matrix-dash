import { runWithUser } from "@/lib/db/context";
import { getCurrentSession } from "./current-user";

/**
 * Wraps an API route handler so every DB access inside it resolves to the
 * *logged-in account's* workspace (see lib/db/context + resolveDbPath).
 *
 * Mechanics: resolve the app session, then run the handler inside
 * runWithUser(). getDb() called anywhere in the handler's synchronous body or
 * across its awaits then targets that account's database file. For the owner
 * (isOwner: true) this resolves to the primary matrix.db — byte-for-byte the
 * same behavior as before multi-tenancy — so wrapping is backward-compatible
 * for the existing single account.
 *
 * The middleware already 401s requests with no session cookie; this is the
 * authoritative check (a cookie can be present but expired/revoked) and the
 * point at which per-account isolation is actually established.
 *
 * NOTE: this does NOT cover DB work initiated in a *detached* continuation —
 * a ReadableStream pull() or a post-Response `.then()` runs outside the ALS
 * scope. Streaming routes that persist to the DB after returning their
 * Response must capture and re-enter the context explicitly. See the four
 * streaming DB routes (ai/chat, ai/claude-code, ai/openclaude,
 * agents/runs/[runId]/stream), which are wired by hand rather than via this.
 */
// Next passes (request, context) where context carries route params. Keep the
// wrapper transparent to that second arg so [id]/[token] routes work unchanged.
type RouteHandler = (req: Request, ctx: never) => Promise<Response> | Response;

export function withUser<H extends RouteHandler>(handler: H): H {
  return (async (req: Request, ctx: never) => {
    const session = await getCurrentSession();
    if (!session) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    const dbCtx = { userId: session.user.id, isOwner: session.user.role === "owner" };
    return runWithUser(dbCtx, () => handler(req, ctx));
  }) as H;
}
