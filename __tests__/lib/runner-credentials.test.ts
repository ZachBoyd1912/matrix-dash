import { describe, it, expect, beforeAll } from "vitest";
import { runWithUser } from "@/lib/db/context";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { encrypt } from "@/lib/utils/crypto";
import { createUser } from "@/lib/db/users";
import { resolveSubscriptionToken } from "@/lib/services/runner-credentials";

/**
 * The per-user Claude subscription token resolves + decrypts from the user's
 * OWN provider row, and is isolated between accounts (never leaks the owner's).
 */

let ownerId: string;
let memberId: string;

beforeAll(() => {
  ownerId = createUser({
    email: `cred-o-${crypto.randomUUID()}@x.com`,
    password: "pw12345678",
    role: "owner",
  }).id;
  memberId = createUser({
    email: `cred-m-${crypto.randomUUID()}@x.com`,
    password: "pw12345678",
    role: "member",
  }).id;

  // Owner stores their subscription token in the primary DB.
  runWithUser({ userId: ownerId, isOwner: true }, () => {
    getDb()
      .insert(aiProviders)
      .values({
        id: crypto.randomUUID(),
        name: "Claude Sub",
        provider: "claude-subscription",
        apiKeyEncrypted: encrypt("sk-ant-oat01-OWNER-TOKEN-abcdefghij"),
        isActive: true,
        createdAt: new Date().toISOString(),
      } as never)
      .run();
  });
  // Member stores a DIFFERENT token in their isolated DB.
  runWithUser({ userId: memberId, isOwner: false }, () => {
    getDb()
      .insert(aiProviders)
      .values({
        id: crypto.randomUUID(),
        name: "Claude Sub",
        provider: "claude-subscription",
        apiKeyEncrypted: encrypt("sk-ant-oat01-MEMBER-TOKEN-klmnopqrst"),
        isActive: true,
        createdAt: new Date().toISOString(),
      } as never)
      .run();
  });
});

describe("resolveSubscriptionToken", () => {
  it("returns the owner's decrypted token", () => {
    expect(resolveSubscriptionToken(ownerId)).toBe("sk-ant-oat01-OWNER-TOKEN-abcdefghij");
  });

  it("returns the member's OWN token, isolated from the owner", () => {
    const t = resolveSubscriptionToken(memberId);
    expect(t).toBe("sk-ant-oat01-MEMBER-TOKEN-klmnopqrst");
    expect(t).not.toContain("OWNER");
  });

  it("returns null for a user with no subscription provider", () => {
    const noneId = createUser({
      email: `cred-n-${crypto.randomUUID()}@x.com`,
      password: "pw12345678",
      role: "member",
    }).id;
    expect(resolveSubscriptionToken(noneId)).toBeNull();
  });
});
