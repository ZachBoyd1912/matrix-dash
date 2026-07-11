import { eq } from "drizzle-orm";
import { runWithUser } from "@/lib/db/context";
import { getDb, getSystemDb } from "@/lib/db/client";
import { aiProviders, users } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";

/**
 * Resolve a user's Claude subscription OAuth token (decision 5: server-stored,
 * encrypted per-account). Returned only to be placed into a dispatch payload
 * IN MEMORY and injected into the device SDK env per job — never written to
 * runner_jobs or any log.
 */

function isOwnerUser(userId: string): boolean {
  return (
    getSystemDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).get()
      ?.role === "owner"
  );
}

export function resolveSubscriptionToken(userId: string): string | null {
  return runWithUser({ userId, isOwner: isOwnerUser(userId) }, () => {
    const row = getDb()
      .select({ enc: aiProviders.apiKeyEncrypted })
      .from(aiProviders)
      .where(eq(aiProviders.provider, "claude-subscription"))
      .get();
    if (!row?.enc) return null;
    try {
      const token = decrypt(row.enc);
      return token && token.length > 10 ? token : null;
    } catch {
      return null;
    }
  });
}
