import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { getSystemDb } from "./client";
import { users } from "./schema";
import { hashPassword } from "@/lib/auth/password";

export type UserRow = typeof users.$inferSelect;

export function countUsers(): number {
  return (
    getSystemDb()
      .select({ n: sql<number>`COUNT(*)` })
      .from(users)
      .get()?.n ?? 0
  );
}

export function getUserByEmail(email: string): UserRow | undefined {
  return getSystemDb()
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .get();
}

export function getUserById(id: string): UserRow | undefined {
  return getSystemDb().select().from(users).where(eq(users.id, id)).get();
}

export function listUsers(): UserRow[] {
  return getSystemDb().select().from(users).all();
}

export interface CreateUserInput {
  email: string;
  name?: string;
  password?: string;
  role?: "owner" | "member";
}

export function createUser(input: CreateUserInput): UserRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  getSystemDb()
    .insert(users)
    .values({
      id,
      email: input.email.toLowerCase().trim(),
      name: input.name ?? "",
      passwordHash: input.password ? hashPassword(input.password) : null,
      role: input.role ?? "member",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getUserById(id)!;
}

export function setUserPassword(id: string, password: string): void {
  getSystemDb()
    .update(users)
    .set({ passwordHash: hashPassword(password), updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .run();
}

export function touchLogin(id: string): void {
  getSystemDb()
    .update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .run();
}

/** The first-created owner (the account that inherits pre-multi-user data). */
export function getOwner(): UserRow | undefined {
  return getSystemDb().select().from(users).where(eq(users.role, "owner")).get();
}

/**
 * Number of accounts that can still administer the instance. Used to enforce the
 * "there must always be at least one active owner" invariant so an owner can't
 * lock themselves (or everyone) out by deactivating/demoting/deleting the last
 * owner. Callers check this BEFORE applying a change that would reduce the count.
 */
export function countActiveOwners(): number {
  return (
    getSystemDb()
      .select({ n: sql<number>`COUNT(*)` })
      .from(users)
      .where(and(eq(users.role, "owner"), eq(users.isActive, true)))
      .get()?.n ?? 0
  );
}

export function setUserActive(id: string, isActive: boolean): void {
  getSystemDb()
    .update(users)
    .set({ isActive, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .run();
}

export function setUserRole(id: string, role: "owner" | "member"): void {
  getSystemDb()
    .update(users)
    .set({ role, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .run();
}

export function updateUserProfile(id: string, patch: { name?: string; email?: string }): void {
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.email !== undefined) set.email = patch.email.toLowerCase().trim();
  getSystemDb().update(users).set(set).where(eq(users.id, id)).run();
}

/** Permanently remove an account (its isolated workspace DB file is left on disk). */
export function deleteUser(id: string): void {
  getSystemDb().delete(users).where(eq(users.id, id)).run();
}

/** Mark the onboarding tour finished (or reset to null to replay on next login). */
export function setTutorialCompleted(id: string, at: string | null): void {
  getSystemDb()
    .update(users)
    .set({ tutorialCompletedAt: at, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .run();
}
