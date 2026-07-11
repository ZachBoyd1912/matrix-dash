import { cookies, headers } from "next/headers";
import { z } from "zod";
import { resolveInvite, consumeInvite } from "@/lib/db/invites";
import { setUserPassword, getUserById, touchLogin } from "@/lib/db/users";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET ?token= → validate the invite and return the account email (for the UI). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const target = resolveInvite(token);
  if (!target) return Response.json({ valid: false }, { status: 200 });
  return Response.json({ valid: true, email: target.email, name: target.name });
}

const bodySchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(400),
  name: z.string().max(200).optional(),
});

/** POST: member sets their own password via the invite, then is signed in. */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "An 8+ character password is required" }, { status: 400 });
  }

  // Same launch gate as login: accepting an invite creates a session, so it must
  // also respect members_enabled — otherwise an invite sent before cutover would
  // bypass the gate. The invite is NOT consumed here, so it stays valid until the
  // owner opens member sign-in.
  if (getSetting("members_enabled") !== "1") {
    return Response.json(
      { error: "Member sign-in isn't enabled on this instance yet." },
      { status: 403 }
    );
  }

  const userId = consumeInvite(parsed.data.token);
  if (!userId) return Response.json({ error: "Invalid or expired invite" }, { status: 401 });

  setUserPassword(userId, parsed.data.password);
  const user = getUserById(userId)!;

  const h = await headers();
  const { token, expiresAt } = createSession(userId, {
    userAgent: h.get("user-agent") ?? undefined,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    mfaSatisfied: true,
  });
  touchLogin(userId);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });

  return Response.json({ ok: true, user: { email: user.email, name: user.name, role: user.role } });
}
