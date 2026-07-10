import { z } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getSystemDb } from "@/lib/db/client";
import { runnerDevices, runnerPairCodes } from "@/lib/db/schema";
import { sha256Hex, mintSecret } from "@/lib/auth/runner-auth";
import { PROTOCOL_VERSION, type PairResponseBody } from "@/lib/runner/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(6).max(200),
  protocolVersion: z.number().int(),
  device: z.object({
    name: z.string().max(200).default(""),
    platform: z.string().max(40).default(""),
    arch: z.string().max(40).default(""),
    appVersion: z.string().max(40).default(""),
  }),
});

/**
 * Exchange a one-time pair code (minted in the dashboard by a logged-in user)
 * for a long-lived runner token. Public route (the runner has no session);
 * the code itself is the credential — single-use, 10-minute expiry.
 */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Invalid pairing request" }, { status: 400 });

  if (parsed.data.protocolVersion !== PROTOCOL_VERSION) {
    return Response.json(
      { error: "Runner is out of date — update and retry", minProtocol: PROTOCOL_VERSION },
      { status: 426 }
    );
  }

  const db = getSystemDb();
  const nowIso = new Date().toISOString();

  // Atomic claim: mark the code used only if it is unused and unexpired —
  // a second racer's UPDATE matches zero rows and is rejected.
  const claim = db
    .update(runnerPairCodes)
    .set({ usedAt: nowIso })
    .where(
      and(
        eq(runnerPairCodes.codeHash, sha256Hex(parsed.data.code)),
        isNull(runnerPairCodes.usedAt),
        gt(runnerPairCodes.expiresAt, nowIso)
      )
    )
    .run();
  if (claim.changes !== 1) {
    return Response.json({ error: "Invalid or expired pair code" }, { status: 401 });
  }
  const codeRow = db
    .select()
    .from(runnerPairCodes)
    .where(eq(runnerPairCodes.codeHash, sha256Hex(parsed.data.code)))
    .get()!;

  const token = mintSecret();
  const deviceId = crypto.randomUUID();
  const existing = db
    .select({ id: runnerDevices.id })
    .from(runnerDevices)
    .where(and(eq(runnerDevices.userId, codeRow.userId), isNull(runnerDevices.revokedAt)))
    .all();

  db.insert(runnerDevices)
    .values({
      id: deviceId,
      userId: codeRow.userId,
      name: parsed.data.device.name || `${parsed.data.device.platform} device`,
      platform: parsed.data.device.platform,
      arch: parsed.data.device.arch,
      appVersion: parsed.data.device.appVersion,
      tokenHash: sha256Hex(token),
      // First (non-revoked) device becomes the default dispatch target.
      isDefault: existing.length === 0,
      createdAt: nowIso,
      lastSeenAt: nowIso,
    })
    .run();

  const body: PairResponseBody = { deviceId, runnerToken: token };
  return Response.json(body, { status: 201 });
}
