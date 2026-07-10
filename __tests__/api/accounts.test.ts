import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Security tests for owner-only account management + the member-login gate.
 * These are the authorization guardrails behind multi-account auth, so they get
 * explicit coverage: privilege enforcement, the last-active-owner invariant,
 * self-lockout protection, and the fact that members cannot sign in yet.
 */

type FakeSession = { user: { id: string; role: string }; sessionId: string; mfaSatisfied: boolean };
let fakeSession: FakeSession | null = null;

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentSession: async () => fakeSession,
  getCurrentUser: async () => fakeSession?.user ?? null,
  getCloudflareAccessEmail: async () => null,
}));

import { GET, POST } from "@/app/api/accounts/route";
import { PATCH, DELETE } from "@/app/api/accounts/[id]/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { createUser, getUserById } from "@/lib/db/users";
import { resetTables } from "@/lib/test-db";

const owner = () => ({ user: { id: ownerId, role: "owner" }, sessionId: "o", mfaSatisfied: true });
const member = (id: string) => ({
  user: { id, role: "member" },
  sessionId: "m",
  mfaSatisfied: true,
});

const postReq = (body: unknown) =>
  new Request("http://t/api/accounts", { method: "POST", body: JSON.stringify(body) });
const patchReq = (body: unknown) =>
  new Request("http://t", { method: "PATCH", body: JSON.stringify(body) });
const delReq = () => new Request("http://t", { method: "DELETE" });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let ownerId: string;
beforeEach(() => {
  resetTables("auth_sessions", "users");
  ownerId = createUser({ email: "owner@x.com", password: "ownerpass1", role: "owner" }).id;
  fakeSession = owner();
});

describe("account management authorization", () => {
  it("members cannot list or create accounts (403)", async () => {
    const m = createUser({ email: "m@x.com", password: "memberpass1", role: "member" });
    fakeSession = member(m.id);
    expect((await GET()).status).toBe(403);
    expect((await POST(postReq({ email: "new@x.com", password: "pass1234" }))).status).toBe(403);
  });

  it("an unauthenticated request is 401", async () => {
    fakeSession = null;
    expect((await GET()).status).toBe(401);
  });

  it("owner lists accounts and never leaks password hashes", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<Record<string, unknown>>;
    expect(list.some((u) => u.email === "owner@x.com")).toBe(true);
    expect(list.every((u) => !("passwordHash" in u) && !("totpSecret" in u))).toBe(true);
  });

  it("owner creates a member; duplicate email is rejected", async () => {
    const res = await POST(postReq({ email: "team@x.com", name: "T", password: "pass1234" }));
    expect(res.status).toBe(201);
    const created = (await res.json()) as { role: string; passwordHash?: string };
    expect(created.role).toBe("member");
    expect(created.passwordHash).toBeUndefined();
    expect((await POST(postReq({ email: "team@x.com", password: "pass1234" }))).status).toBe(409);
  });
});

describe("last-active-owner invariant", () => {
  it("blocks demoting or disabling the sole owner", async () => {
    expect((await PATCH(patchReq({ role: "member" }), ctx(ownerId))).status).toBe(409);
    expect((await PATCH(patchReq({ isActive: false }), ctx(ownerId))).status).toBe(409);
    // Sole owner is still an active owner afterward.
    expect(getUserById(ownerId)?.role).toBe("owner");
    expect(!!getUserById(ownerId)?.isActive).toBe(true);
  });

  it("allows disabling one owner once a second owner exists", async () => {
    const o2 = createUser({ email: "o2@x.com", password: "pass1234", role: "owner" });
    const res = await PATCH(patchReq({ isActive: false }), ctx(o2.id));
    expect(res.status).toBe(200);
    expect(!!getUserById(o2.id)?.isActive).toBe(false);
  });
});

describe("delete guards", () => {
  it("an owner cannot delete their own account", async () => {
    expect((await DELETE(delReq(), ctx(ownerId))).status).toBe(409);
    expect(getUserById(ownerId)).toBeTruthy();
  });

  it("an owner can remove a member", async () => {
    const m = createUser({ email: "gone@x.com", password: "pass1234", role: "member" });
    expect((await DELETE(delReq(), ctx(m.id))).status).toBe(200);
    expect(getUserById(m.id)).toBeUndefined();
  });
});

describe("member-login gate", () => {
  const login = (email: string, password: string) =>
    loginPOST(
      new Request("http://t/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
    );

  it("refuses a valid member sign-in (403) until the host boundary exists", async () => {
    createUser({ email: "member-login@x.com", password: "memberpass1", role: "member" });
    expect((await login("member-login@x.com", "memberpass1")).status).toBe(403);
  });

  it("a wrong password is still 401 (checked before the member gate)", async () => {
    createUser({ email: "m2@x.com", password: "memberpass1", role: "member" });
    expect((await login("m2@x.com", "nope-wrong")).status).toBe(401);
  });
});
