import { cookies, headers } from "next/headers";
import { z } from "zod";
import { countUsers, createUser } from "@/lib/db/users";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional(),
  password: z.string().min(8).max(400),
});

/**
 * First-run owner setup. Only permitted while no users exist. Creates the owner
 * account (which inherits all pre-multi-user data during the data-scoping
 * migration) and signs them in.
 */
export async function POST(req: Request) {
  if (countUsers() > 0) {
    return Response.json({ error: "Already set up" }, { status: 409 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Email and an 8+ character password are required" },
      { status: 400 }
    );
  }

  const user = createUser({
    email: parsed.data.email,
    name: parsed.data.name ?? "",
    password: parsed.data.password,
    role: "owner",
  });

  const h = await headers();
  const { token, expiresAt } = createSession(user.id, {
    userAgent: h.get("user-agent") ?? undefined,
    mfaSatisfied: true,
  });
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
