import { z } from "zod";
import { requireOwner } from "@/lib/auth/guards";
import { getSetting, setSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The member-sign-in launch switch (owner-only). `members_enabled` gates
 * non-owner login (app/api/auth/login). It ships "0" so the platform stays
 * dark until the owner flips it at cutover — the big-bang launch control.
 * Read via getSetting in no-context (owner/primary DB); the login route reads
 * the same primary-DB setting.
 */
export async function GET() {
  const g = await requireOwner();
  if ("response" in g) return g.response;
  return Response.json({ enabled: getSetting("members_enabled") === "1" });
}

const bodySchema = z.object({ enabled: z.boolean() });

export async function POST(req: Request) {
  const g = await requireOwner();
  if ("response" in g) return g.response;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Invalid" }, { status: 400 });
  setSetting("members_enabled", parsed.data.enabled ? "1" : "0");
  return Response.json({ ok: true, enabled: parsed.data.enabled });
}
