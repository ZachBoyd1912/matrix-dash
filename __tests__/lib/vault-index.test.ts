import { describe, it, expect } from "vitest";
import { getSqlite } from "@/lib/db/client";

describe("vault index schema", () => {
  it("creates vault_files, vault_links and the FTS table", () => {
    const names = getSqlite()
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toContain("vault_files");
    expect(names).toContain("vault_links");
    expect(names).toContain("vault_files_fts");
  });

  it("full-text searches indexed file content", () => {
    const db = getSqlite();
    db.prepare(
      `INSERT OR REPLACE INTO vault_files
         (rel_path, name, ext, dir_path, mtime_ms, is_text, content, indexed_at)
       VALUES ('X/hello.md','hello','md','X',1,1,'a distinctive phrase here','t')`
    ).run();
    const hit = db
      .prepare("SELECT rel_path FROM vault_files_fts WHERE vault_files_fts MATCH 'distinctive'")
      .all();
    expect(hit.length).toBeGreaterThan(0);
  });
});
