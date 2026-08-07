import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getSqlite, getDb } from "@/lib/db/client";
import { vaultFiles, vaultLinks } from "@/lib/db/schema";
import { setSetting } from "@/lib/db/settings";
import { resolveLinkTarget, scanVault, getVaultIndexedAt } from "@/lib/services/vault-index";

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

describe("resolveLinkTarget", () => {
  const candidates = [
    "Claude Code/Memory/matrix-dash/MEMORY.md",
    "Claude Code/Memory/bolt.new-custom/MEMORY.md",
    "Matrix Notes/Deep/Thing.md",
  ];

  it("prefers a match in the same folder as the source", () => {
    expect(resolveLinkTarget("Claude Code/Memory/matrix-dash", "MEMORY", candidates)).toBe(
      "Claude Code/Memory/matrix-dash/MEMORY.md"
    );
  });

  it("falls back to the shallowest path when no same-folder match exists", () => {
    expect(resolveLinkTarget("Somewhere/Else", "Thing", candidates)).toBe(
      "Matrix Notes/Deep/Thing.md"
    );
  });

  it("returns null for a target that does not exist — a ghost link", () => {
    expect(resolveLinkTarget("Matrix Notes", "does-not-exist", candidates)).toBeNull();
  });

  it("is case-insensitive, matching Obsidian", () => {
    expect(resolveLinkTarget("Matrix Notes/Deep", "thing", candidates)).toBe(
      "Matrix Notes/Deep/Thing.md"
    );
  });

  it("strips a #heading anchor before matching", () => {
    // Obsidian writes [[Thing#Some Section]]; without stripping, the basename
    // compare never matches and every anchored link silently becomes a ghost.
    expect(resolveLinkTarget("Matrix Notes", "Thing#Some Section", candidates)).toBe(
      "Matrix Notes/Deep/Thing.md"
    );
  });

  it("strips a ^block reference before matching", () => {
    expect(resolveLinkTarget("Matrix Notes", "Thing^abc123", candidates)).toBe(
      "Matrix Notes/Deep/Thing.md"
    );
  });

  it("resolves a full vault-relative path, not just a basename", () => {
    // Obsidian emits the full path when a basename is ambiguous — exactly the
    // MEMORY.md case. Basename matching alone would pick the wrong project.
    expect(
      resolveLinkTarget("Matrix Notes", "Claude Code/Memory/bolt.new-custom/MEMORY", candidates)
    ).toBe("Claude Code/Memory/bolt.new-custom/MEMORY.md");
  });

  it("is deterministic when two equally deep candidates collide", () => {
    const twins = ["B/dup.md", "A/dup.md"];
    expect(resolveLinkTarget("Elsewhere", "dup", twins)).toBe("A/dup.md");
    expect(resolveLinkTarget("Elsewhere", "dup", [...twins].reverse())).toBe("A/dup.md");
  });
});

// ─── scanVault ────────────────────────────────────────────────────────────
// Every test builds a throwaway vault with fs.mkdtempSync. The operator's real
// vault at ~/Desktop/Obsidian Vault is never touched.

const VAULTS: string[] = [];
function makeVault(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-vaultidx-"));
  VAULTS.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf-8");
  }
  return root;
}
afterAll(() => {
  for (const v of VAULTS) fs.rmSync(v, { recursive: true, force: true });
});

function indexRows() {
  return getDb().select().from(vaultFiles).all();
}
function linkRows() {
  return getDb().select().from(vaultLinks).all();
}

describe("scanVault", () => {
  beforeEach(() => {
    getDb().delete(vaultFiles).run();
    getDb().delete(vaultLinks).run();
  });

  it("indexes every text file in the vault, at any depth", async () => {
    const root = makeVault({
      "README.md": "top level",
      "Memory Bank/one.md": "a memory",
      "Claude Code/Memory/matrix-dash/deep.md": "nested three levels down",
    });
    setSetting("obsidianVaultPath", root);

    const result = await scanVault();
    expect(result.unreachable).toBe(false);
    expect(result.indexed).toBe(3);

    const paths = indexRows()
      .map((r) => r.relPath)
      .sort();
    expect(paths).toEqual([
      "Claude Code/Memory/matrix-dash/deep.md",
      "Memory Bank/one.md",
      "README.md",
    ]);
    expect(getVaultIndexedAt()).toBeTruthy();
  });

  it("ignores dot-directories such as .obsidian", async () => {
    const root = makeVault({
      "note.md": "real",
      ".obsidian/workspace.json": "{}",
      ".trash/deleted.md": "gone",
    });
    setSetting("obsidianVaultPath", root);

    await scanVault();
    expect(indexRows().map((r) => r.relPath)).toEqual(["note.md"]);
  });

  it("skips files whose mtime has not changed", async () => {
    const root = makeVault({ "a.md": "one", "b.md": "two" });
    setSetting("obsidianVaultPath", root);

    const first = await scanVault();
    expect(first.indexed).toBe(2);

    const second = await scanVault();
    expect(second.indexed).toBe(0);
    expect(second.skipped).toBe(2);
  });

  it("keeps every link across repeated scans, not just links from changed files", async () => {
    // The failure this guards: rebuilding links from only the files re-read
    // this pass. Because an unchanged file is skipped, its content never
    // enters memory, so the second scan would wipe its links and the graph
    // would collapse to almost no edges — the exact symptom being fixed.
    const root = makeVault({
      "a.md": "links to [[b]] and [[c]]",
      "b.md": "links back to [[a]]",
      "c.md": "no links here",
    });
    setSetting("obsidianVaultPath", root);

    await scanVault();
    const after1 = linkRows().length;
    expect(after1).toBe(3);

    await scanVault();
    expect(linkRows().length).toBe(after1);
  });

  it("records an unresolved [[target]] as a ghost link rather than dropping it", async () => {
    const root = makeVault({ "a.md": "points at [[nowhere]]" });
    setSetting("obsidianVaultPath", root);

    await scanVault();
    const links = linkRows();
    expect(links).toHaveLength(1);
    expect(links[0].targetPath).toBeNull();
    expect(links[0].targetRaw).toBe("nowhere");
  });

  it("counts an embed and a plain link to the same file as one edge", async () => {
    // extractWikiLinks' regex also matches the [[b]] inside ![[b]], so running
    // a separate embed pass on top double-counts every embed into two rows and
    // draws two edges between the same pair of nodes.
    const root = makeVault({ "a.md": "![[b]]\n\nand also [[b]]", "b.md": "target" });
    setSetting("obsidianVaultPath", root);

    await scanVault();
    const links = linkRows().filter((l) => l.sourcePath === "a.md");
    expect(links).toHaveLength(1);
    expect(links[0].targetPath).toBe("b.md");
  });

  it("removes index rows for files deleted from the vault", async () => {
    const root = makeVault({ "keep.md": "stays", "drop.md": "goes" });
    setSetting("obsidianVaultPath", root);

    await scanVault();
    expect(indexRows()).toHaveLength(2);

    fs.rmSync(path.join(root, "drop.md"));
    await scanVault();
    expect(indexRows().map((r) => r.relPath)).toEqual(["keep.md"]);
  });

  it("leaves the existing index untouched when the vault is unreachable", async () => {
    const root = makeVault({ "a.md": "content" });
    setSetting("obsidianVaultPath", root);
    await scanVault();
    expect(indexRows()).toHaveLength(1);

    // The production shape: app on the VM, vault on a Mac that is asleep, no
    // device answering. A stale index is strictly better than an empty one.
    setSetting("obsidianVaultPath", "/Users/nobody/Desktop/Obsidian Vault");
    const result = await scanVault();
    expect(result.unreachable).toBe(true);
    expect(indexRows()).toHaveLength(1);
  });

  it("reports unreachable when no vault path is configured", async () => {
    setSetting("obsidianVaultPath", "");
    await expect(scanVault()).resolves.toMatchObject({ unreachable: true });
  });

  it("keeps the previous content when a file cannot be read", async () => {
    // A failed read must not be written as empty content: that silently wipes
    // the file's links and its full-text entry, and looks identical to an
    // empty file. Same "cannot verify is not a fact" rule as the path checks.
    const root = makeVault({ "secret.md": "the original body" });
    setSetting("obsidianVaultPath", root);
    await scanVault();

    const abs = path.join(root, "secret.md");
    // Change the mtime so the scanner tries to re-read it, then block the read.
    fs.writeFileSync(abs, "a replacement body");
    fs.chmodSync(abs, 0o000);
    let readable = true;
    try {
      fs.readFileSync(abs, "utf-8");
    } catch {
      readable = false;
    }
    if (readable) {
      // Running as root (chmod cannot block us) — nothing to assert.
      fs.chmodSync(abs, 0o644);
      return;
    }

    const result = await scanVault();
    fs.chmodSync(abs, 0o644);

    expect(result.failed).toBe(1);
    const row = indexRows().find((r) => r.relPath === "secret.md");
    expect(row?.content).toBe("the original body");
  });

  it("indexes a non-text file as metadata with no content", async () => {
    const root = makeVault({ "note.md": "text", "Attachments/pic.png": "not really a png" });
    setSetting("obsidianVaultPath", root);

    await scanVault();
    const png = indexRows().find((r) => r.relPath === "Attachments/pic.png");
    expect(png?.isText).toBe(false);
    expect(png?.content).toBe("");
  });
});
