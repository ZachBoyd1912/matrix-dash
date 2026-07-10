import { describe, expect, it, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { runWithUser } from "@/lib/db/context";
import { getDb, getSystemDb } from "@/lib/db/client";
import { notes } from "@/lib/db/schema";
import { getDataDir } from "@/lib/utils/db-path";

const MEMBER = "iso-test-member-fixed";
const OWNER_NOTE = "iso-owner-note";
const MEMBER_NOTE = "iso-member-note";

function note(id: string, title: string) {
  const now = new Date().toISOString();
  return { id, title, content: "", tags: "", createdAt: now, updatedAt: now };
}

afterAll(() => {
  // Remove the owner test note from the real primary DB.
  try {
    getDb().delete(notes).where(eq(notes.id, OWNER_NOTE)).run();
  } catch {
    /* ignore */
  }
  // Delete the member's isolated DB files.
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(path.join(getDataDir(), "users", `${MEMBER}.db${suffix}`));
    } catch {
      /* ignore */
    }
  }
});

describe("per-account database isolation", () => {
  it("member context cannot see owner data and vice-versa", () => {
    // Owner (no context) writes a note into the primary DB.
    getDb().insert(notes).values(note(OWNER_NOTE, "OWNER")).run();

    runWithUser({ userId: MEMBER, isOwner: false }, () => {
      // The member's isolated DB must NOT contain the owner's note.
      expect(getDb().select().from(notes).where(eq(notes.id, OWNER_NOTE)).get()).toBeUndefined();
      // Member writes their own note into their own DB.
      getDb().insert(notes).values(note(MEMBER_NOTE, "MEMBER")).run();
      // But auth/system queries always hit the primary DB (owner note visible there).
      expect(getSystemDb().select().from(notes).where(eq(notes.id, OWNER_NOTE)).get()?.title).toBe(
        "OWNER"
      );
    });

    // Back in owner context: the member's note is NOT visible; owner's note is.
    expect(getDb().select().from(notes).where(eq(notes.id, MEMBER_NOTE)).get()).toBeUndefined();
    expect(getDb().select().from(notes).where(eq(notes.id, OWNER_NOTE)).get()?.title).toBe("OWNER");
  });

  it("owner context resolves to the primary DB (backward compatible)", () => {
    // With no user context, getDb() and getSystemDb() are the same primary DB.
    // (OWNER_NOTE was written by the previous test into that same primary DB.)
    const viaDb = getDb().select().from(notes).where(eq(notes.id, OWNER_NOTE)).get();
    const viaSystem = getSystemDb().select().from(notes).where(eq(notes.id, OWNER_NOTE)).get();
    expect(viaDb?.title).toBe("OWNER");
    expect(viaSystem?.title).toBe("OWNER");
  });
});
