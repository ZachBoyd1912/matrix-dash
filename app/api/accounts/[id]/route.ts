import { z } from "zod";
import { requireOwner } from "@/lib/auth/guards";
import {
  getUserById,
  getUserByEmail,
  setUserActive,
  setUserRole,
  setUserPassword,
  updateUserProfile,
  deleteUser,
  countActiveOwners,
} from "@/lib/db/users";
import { destroyAllSessions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  name: z.string().max(200).optional(),
  email: z.string().email().max(320).optional(),
  password: z.string().min(8).max(400).optional(),
  role: z.enum(["owner", "member"]).optional(),
  isActive: z.boolean().optional(),
});

/** Would this change strip admin capability from the last remaining active owner? */
function wouldOrphanInstance(
  target: { role: string; isActive: boolean },
  next: { role?: "owner" | "member"; isActive?: boolean }
): boolean {
  const wasActiveOwner = target.role === "owner" && target.isActive;
  if (!wasActiveOwner) return false;
  const stillActiveOwner = (next.role ?? "owner") === "owner" && (next.isActive ?? true) !== false;
  return !stillActiveOwner && countActiveOwners() <= 1;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await requireOwner();
  if ("response" in g) return g.response;
  const { id } = await ctx.params;

  const target = getUserById(id);
  if (!target) return Response.json({ error: "Account not found" }, { status: 404 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const patch = parsed.data;

  // Invariant: never let the last active owner lose admin (lockout protection).
  if (
    (patch.role !== undefined || patch.isActive !== undefined) &&
    wouldOrphanInstance(
      { role: target.role, isActive: !!target.isActive },
      { role: patch.role, isActive: patch.isActive }
    )
  ) {
    return Response.json(
      { error: "This is the last active owner — promote another owner first." },
      { status: 409 }
    );
  }

  if (patch.email && patch.email.toLowerCase().trim() !== target.email) {
    const clash = getUserByEmail(patch.email);
    if (clash && clash.id !== id) {
      return Response.json({ error: "Another account already uses that email" }, { status: 409 });
    }
  }

  if (patch.name !== undefined || patch.email !== undefined) {
    updateUserProfile(id, { name: patch.name, email: patch.email });
  }
  if (patch.password !== undefined) setUserPassword(id, patch.password);
  if (patch.role !== undefined) setUserRole(id, patch.role);
  if (patch.isActive !== undefined) setUserActive(id, patch.isActive);

  // Force re-auth when access or credentials change materially.
  if (patch.isActive === false || patch.role !== undefined || patch.password !== undefined) {
    destroyAllSessions(id);
  }

  const updated = getUserById(id)!;
  return Response.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    isActive: !!updated.isActive,
    totpEnabled: !!updated.totpEnabled,
    lastLoginAt: updated.lastLoginAt,
    createdAt: updated.createdAt,
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await requireOwner();
  if ("response" in g) return g.response;
  const { id } = await ctx.params;

  const target = getUserById(id);
  if (!target) return Response.json({ error: "Account not found" }, { status: 404 });

  if (id === g.user.id) {
    return Response.json({ error: "You can't delete your own account" }, { status: 409 });
  }
  if (target.role === "owner" && !!target.isActive && countActiveOwners() <= 1) {
    return Response.json({ error: "Can't delete the last active owner" }, { status: 409 });
  }

  destroyAllSessions(id);
  deleteUser(id);
  return Response.json({ ok: true });
}
