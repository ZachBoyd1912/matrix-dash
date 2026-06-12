import { generateSecret, generateURI, verifySync } from "otplib";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/db/settings";
import { encrypt, decrypt } from "@/lib/utils/crypto";

export const dynamic = "force-dynamic";

/** Generate a new secret + provisioning URI; saves provisional secret in settings. */
export async function POST() {
  const secret = generateSecret();
  setSetting("totpProvisional", encrypt(secret));
  const accountName = getSetting("userEmail") || "you@dash.local";
  const uri = generateURI({ issuer: "Matrix Dash", label: accountName, secret });
  return Response.json({ secret, uri });
}

const verifySchema = z.object({ code: z.string().length(6) });

/** Verify the user typed the 6-digit code, then commit secret + enable 2FA. */
export async function PUT(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = verifySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const provisional = getSetting("totpProvisional");
  if (!provisional) return Response.json({ error: "No provisional secret" }, { status: 400 });
  const secret = decrypt(provisional);
  const verified = verifySync({ token: parsed.data.code, secret });
  if (!verified) {
    return Response.json({ ok: false, error: "Invalid code" }, { status: 400 });
  }
  setSetting("totpSecret", provisional);
  setSetting("totpEnabled", "1");
  setSetting("totpProvisional", "");
  return Response.json({ ok: true });
}

export async function DELETE() {
  setSetting("totpSecret", "");
  setSetting("totpEnabled", "0");
  setSetting("totpProvisional", "");
  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({
    enabled: getSetting("totpEnabled") === "1",
  });
}
