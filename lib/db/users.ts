import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
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
