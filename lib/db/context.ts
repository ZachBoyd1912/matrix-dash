import { AsyncLocalStorage } from "async_hooks";

/**
 * Per-request/per-job identity context for multi-tenant data isolation.
 *
 * getDb() resolves the *current* account's database from the userId stashed here.
 * With no context set, it falls back to the primary (owner) database — so the
 * existing single-user code paths and boot-time work behave exactly as before
 * until a route/job explicitly enters a user's context via runWithUser().
 */
interface DbContext {
  userId: string;
  /** True for the owner account, whose workspace IS the primary matrix.db. */
  isOwner: boolean;
}

const als = new AsyncLocalStorage<DbContext>();

/** Run `fn` with the given account as the active workspace. */
export function runWithUser<T>(ctx: DbContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getDbContext(): DbContext | undefined {
  return als.getStore();
}

/** The active account's user id, or null when unscoped (owner/boot context). */
export function getContextUserId(): string | null {
  return als.getStore()?.userId ?? null;
}
