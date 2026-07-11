import { cookies, headers } from "next/headers";
import { z } from "zod";
import { verifySync } from "otplib";
import { getUserByEmail, touchLogin } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { decrypt } from "@/lib/utils/crypto";
import { getSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(400),
  code: z.string().length(6).optional(),
});

/**
 * App-level login. Verifies email+password; if the account has TOTP enabled, a
 * valid 6-digit code must accompany the request (mfaRequired signals the client
 * to prompt). On success sets the httpOnly session cookie.
 */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Invalid credentials" }, { status: 400 });
  const { email, password, code } = parsed.data;

  const user = getUserByEmail(email);
  // Uniform failure to avoid user-enumeration timing/leaks.
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Member sign-in gate — now a launch flag, not a hard block. The capability
  // boundary exists (agents run only on the member's own device via the runner;
  // members never execute on the server — see runner-dispatch). `members_enabled`
  // opens member login at the big-bang cutover (P8); it stays "0" until then, so
  // accounts can be created/invited/paired but members can't sign in yet.
  if (user.role !== "owner" && getSetting("members_enabled") !== "1") {
    return Response.json(
      { error: "Member sign-in isn't enabled on this instance yet." },
      { status: 403 }
    );
  }

  if (user.totpEnabled && user.totpSecret) {
    if (!code) return Response.json({ mfaRequired: true }, { status: 200 });
    let ok = false;
    try {
      ok = verifySync({ token: code, secret: decrypt(user.totpSecret) }).valid;
    } catch {
      ok = false;
    }
    if (!ok)
      return Response.json({ error: "Invalid 2FA code", mfaRequired: true }, { status: 401 });
  }

  const h = await headers();
  const { token, expiresAt } = createSession(user.id, {
    userAgent: h.get("user-agent") ?? undefined,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    mfaSatisfied: true,
  });
  touchLogin(user.id);

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
