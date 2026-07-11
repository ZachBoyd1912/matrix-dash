import { describe, it, expect, vi } from "vitest";

// The accept-invite POST sets a session cookie (needs a Next request scope).
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => {}, get: () => undefined }),
  headers: async () => new Headers(),
}));

import { createInvite, resolveInvite, consumeInvite } from "@/lib/db/invites";
import { createUser, getUserById } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/password";
import { POST as acceptInvite, GET as checkInvite } from "@/app/api/auth/accept-invite/route";

/**
 * Member invite lifecycle: mint → resolve (no mutation) → single-use consume,
 * plus the accept-invite route setting the member's own password.
 */

function mkMember() {
  return createUser({ email: `inv-${crypto.randomUUID()}@x.com`, role: "member" }).id;
}

describe("account invites", () => {
  it("mints a token that resolves to the account, then consumes single-use", () => {
    const id = mkMember();
    const token = createInvite(id, "owner-1");

    const target = resolveInvite(token);
    expect(target?.userId).toBe(id);

    // First consume succeeds; second fails (single-use).
    expect(consumeInvite(token)).toBe(id);
    expect(consumeInvite(token)).toBeNull();
    expect(resolveInvite(token)).toBeNull();
  });

  it("rejects an unknown token", () => {
    expect(resolveInvite("0".repeat(64))).toBeNull();
    expect(consumeInvite("0".repeat(64))).toBeNull();
  });

  it("minting a new invite supersedes the previous unused one", () => {
    const id = mkMember();
    const t1 = createInvite(id, "o");
    const t2 = createInvite(id, "o");
    expect(resolveInvite(t1)).toBeNull(); // superseded
    expect(resolveInvite(t2)?.userId).toBe(id);
  });

  it("accept-invite route sets the member's own password (GET validates, POST commits)", async () => {
    const id = mkMember();
    const token = createInvite(id, "o");

    const check = await checkInvite(new Request(`http://t/api/auth/accept-invite?token=${token}`));
    expect((await check.json()).valid).toBe(true);

    const res = await acceptInvite(
      new Request("http://t/api/auth/accept-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: "member-chosen-pw" }),
      })
    );
    expect(res.status).toBe(200);
    const user = getUserById(id)!;
    expect(verifyPassword("member-chosen-pw", user.passwordHash)).toBe(true);
    // Token is now spent.
    expect(resolveInvite(token)).toBeNull();
  });
});
