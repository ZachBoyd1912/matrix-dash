import { settleBySignedToken } from "@/lib/services/agent-approvals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Single-use signed approve/deny endpoint for ntfy / Telegram action buttons.
 * Lives under /api/hooks/ so it inherits the CSRF exemption (non-browser callers).
 * The token is a high-entropy capability minted per approval and burned on use.
 *
 *   GET/POST /api/hooks/approval/<token>?d=approve|deny
 */
interface Ctx {
  params: Promise<{ token: string }>;
}

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { token } = await ctx.params;
  const d = new URL(req.url).searchParams.get("d");
  if (d !== "approve" && d !== "deny") {
    return Response.json(
      { error: "Missing or invalid decision (?d=approve|deny)" },
      { status: 400 }
    );
  }
  const res = settleBySignedToken(token, d);
  if (!res.ok) {
    return htmlResponse(
      res.reason === "already_decided" ? "Already decided." : "Invalid or used link.",
      409
    );
  }
  return htmlResponse(d === "approve" ? "✓ Approved." : "✗ Denied.", 200);
}

export const GET = handle;
export const POST = handle;

/** A tiny HTML acknowledgement so a phone tap shows something friendly. */
function htmlResponse(message: string, status: number): Response {
  const body = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f4ecdd;color:#2b2b2b">
<div style="text-align:center"><h2 style="font-weight:600">${message}</h2>
<p style="color:#666">You can close this tab.</p></div></body>`;
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}
