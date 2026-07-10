import { describe, it, expect, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDataDir } from "@/lib/utils/db-path";

/**
 * Proves the withUser() route wrapper (not just the underlying runWithUser
 * mechanism) actually enters the logged-in account's DB context: owner writes
 * land in the primary matrix.db, member writes land in an isolated per-account
 * file that the primary can't see, and a request with no session is rejected
 * before the handler runs. This closes the gap left by db-isolation.test.ts,
 * which exercises runWithUser directly and bypasses the wrapper.
 */

// Controllable fake session — set per test before invoking a wrapped handler.
let fakeSession: {
  user: { id: string; role: string };
  sessionId: string;
  mfaSatisfied: boolean;
} | null = null;

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentSession: vi.fn(async () => fakeSession),
  getCurrentUser: vi.fn(async () => fakeSession?.user ?? null),
  getCloudflareAccessEmail: vi.fn(async () => null),
}));

import { withUser } from "@/lib/auth/with-user";
import { getDb, getSystemDb } from "@/lib/db/client";
import { notes } from "@/lib/db/schema";

const OWNER = {
  user: { id: "with-user-owner", role: "owner" },
  sessionId: "s1",
  mfaSatisfied: true,
};
const MEMBER = {
  user: { id: "with-user-member", role: "member" },
  sessionId: "s2",
  mfaSatisfied: true,
};
const OWNER_NOTE = "with-user-owner-note";
const MEMBER_NOTE = "with-user-member-note";
const ORPHAN_NOTE = "with-user-orphan-note";

function note(id: string) {
  const now = new Date().toISOString();
  return { id, title: "X", content: "", tags: "", createdAt: now, updatedAt: now };
}

// A wrapped route handler that inserts a note into the *current account's* DB.
const insert = (id: string) =>
  withUser(async () => {
    getDb().insert(notes).values(note(id)).run();
    return Response.json({ ok: true });
  });

afterAll(() => {
  try {
    getSystemDb().delete(notes).where(eq(notes.id, OWNER_NOTE)).run();
  } catch {
    /* ignore */
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(path.join(getDataDir(), "users", `${MEMBER.user.id}.db${suffix}`));
    } catch {
      /* ignore */
    }
  }
});

describe("withUser route wrapper", () => {
  it("owner session writes to the primary database", async () => {
    fakeSession = OWNER;
    const res = await insert(OWNER_NOTE)();
    expect(res.status).toBe(200);
    // isOwner -> resolveDbPath() returns primary matrix.db, so getSystemDb sees it.
    expect(getSystemDb().select().from(notes).where(eq(notes.id, OWNER_NOTE)).get()?.title).toBe(
      "X"
    );
  });

  it("member session writes to an isolated file the primary DB can't see", async () => {
    fakeSession = MEMBER;
    const res = await insert(MEMBER_NOTE)();
    expect(res.status).toBe(200);

    // The member's own DB file was created and holds the note...
    const memberDbPath = path.join(getDataDir(), "users", `${MEMBER.user.id}.db`);
    expect(fs.existsSync(memberDbPath)).toBe(true);

    // ...and reading back in the member's context sees it,
    fakeSession = MEMBER;
    const readInMember = await withUser(async () =>
      Response.json(getDb().select().from(notes).where(eq(notes.id, MEMBER_NOTE)).get() ?? null)
    )();
    expect((await readInMember.json())?.title).toBe("X");

    // ...but the primary/system DB never received the member's write.
    expect(
      getSystemDb().select().from(notes).where(eq(notes.id, MEMBER_NOTE)).get()
    ).toBeUndefined();
  });

  it("rejects a request with no session before the handler runs", async () => {
    fakeSession = null;
    const res = await insert(ORPHAN_NOTE)();
    expect(res.status).toBe(401);
    // The handler body never executed, so nothing was written anywhere.
    expect(
      getSystemDb().select().from(notes).where(eq(notes.id, ORPHAN_NOTE)).get()
    ).toBeUndefined();
  });
});
