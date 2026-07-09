import { describe, expect, it, afterAll } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createUser, getUserByEmail } from "@/lib/db/users";
import { createSession, getSessionUser, destroySession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users, authSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const TEST_EMAIL = `authtest-${Date.now()}@test.local`;
const createdUserIds: string[] = [];

afterAll(() => {
  for (const id of createdUserIds) {
    try {
      getDb().delete(authSessions).where(eq(authSessions.userId, id)).run();
      getDb().delete(users).where(eq(users.id, id)).run();
    } catch {
      /* ignore */
    }
  }
});

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong one", () => {
    const stored = hashPassword("s3cret-passw0rd");
    expect(verifyPassword("s3cret-passw0rd", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
    expect(verifyPassword("s3cret-passw0rd", null)).toBe(false);
  });

  it("produces a different salt/hash each time", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});

describe("session lifecycle", () => {
  it("creates a user + session, resolves it, and rejects after destroy", () => {
    const user = createUser({
      email: TEST_EMAIL,
      name: "Auth Test",
      password: "pw12345678",
      role: "owner",
    });
    createdUserIds.push(user.id);

    // Password persisted + verifiable.
    const fetched = getUserByEmail(TEST_EMAIL);
    expect(fetched?.id).toBe(user.id);
    expect(verifyPassword("pw12345678", fetched!.passwordHash)).toBe(true);

    // Session resolves to the user.
    const { token } = createSession(user.id, { mfaSatisfied: true });
    const resolved = getSessionUser(token);
    expect(resolved?.user.id).toBe(user.id);
    expect(resolved?.mfaSatisfied).toBe(true);

    // Bad token → null.
    expect(getSessionUser("not-a-real-token")).toBeNull();
    expect(getSessionUser(undefined)).toBeNull();

    // Destroyed session → null.
    destroySession(token);
    expect(getSessionUser(token)).toBeNull();
  });

  it("rejects an expired session", () => {
    const user = createUser({ email: `exp-${Date.now()}@test.local`, password: "pw12345678" });
    createdUserIds.push(user.id);
    const { token } = createSession(user.id);
    // Force expiry into the past.
    getDb()
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(authSessions.id, token))
      .run();
    expect(getSessionUser(token)).toBeNull();
  });
});
