import { getDb, getSqlite } from "@/lib/db/client";

/**
 * Tests never touch the real ~/MatrixDash — vitest.setup.ts mocks
 * lib/utils/db-path so getDb()/getSqlite() resolve to a per-test-file
 * temp SQLite file, built from the same INIT_SQL schema as production.
 */
export { getDb, getSqlite };

/** Clears every row from the given tables (test isolation between cases in one file). */
export function resetTables(...tableNames: string[]): void {
  const sqlite = getSqlite();
  for (const name of tableNames) {
    sqlite.exec(`DELETE FROM ${name}`);
  }
}
