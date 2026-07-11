import { z } from "zod";
import { requireOwner } from "@/lib/auth/guards";
import { listUsers, getUserByEmail, createUser, type UserRow } from "@/lib/db/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Owner-only account management. Operates on the cross-account users table
 * (system DB) — NOT withUser-wrapped by design (see lib/auth/guards).
 *
 * NOTE (multi-tenant boundary): creating a member here does NOT yet let them
 * sign in — member login is hard-gated until the host/agent capability boundary
 * exists (Phase 4). DB isolation alone doesn't isolate the shared host (agent
 * runner, filesystem, subscription token), so a member session would be
 * over-privileged. Accounts can be set up now; sign-in opens later.
 */

// Never expose passwordHash / totpSecret to the client.
function toSafe(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: !!u.isActive,
    totpEnabled: !!u.totpEnabled,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export async function GET() {
  const g = await requireOwner();
  if ("response" in g) return g.response;
  return Response.json(listUsers().map(toSafe));
}

const createSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
  // Optional: an invite-only account is created with no password; the member
  // sets their own via the invite link. When provided, min 8 chars.
  password: z.string().min(8).max(400).optional(),
});

export async function POST(req: Request) {
  const g = await requireOwner();
  if ("response" in g) return g.response;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "A valid email is required (password, if set, must be 8+ characters)" },
      { status: 400 }
    );
  }

  if (getUserByEmail(parsed.data.email)) {
    return Response.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  // Creation is restricted to members; promoting to owner is a deliberate,
  // separate PATCH (guarded) so a co-owner is never minted by accident.
  const user = createUser({
    email: parsed.data.email,
    name: parsed.data.name ?? "",
    password: parsed.data.password,
    role: "member",
  });
  return Response.json(toSafe(user), { status: 201 });
}
