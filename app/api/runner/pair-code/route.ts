import { getCurrentSession } from "@/lib/auth/current-user";
import { getSystemDb } from "@/lib/db/client";
import { runnerPairCodes } from "@/lib/db/schema";
import { sha256Hex, mintSecret } from "@/lib/auth/runner-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAIR_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Mint a one-time pair code for the logged-in user (session-authed — this is
 * the dashboard side of pairing; the runner side is /api/runner/pair). The raw
 * code is returned exactly once; only its hash is stored.
 */
export async function POST() {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  // Short + typeable but high-entropy enough for a 10-minute single-use window.
  const code = mintSecret(16);
  const now = new Date();
  getSystemDb()
    .insert(runnerPairCodes)
    .values({
      codeHash: sha256Hex(code),
      userId: session.user.id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PAIR_CODE_TTL_MS).toISOString(),
    })
    .run();

  return Response.json({ code, expiresInMinutes: PAIR_CODE_TTL_MS / 60_000 });
}
