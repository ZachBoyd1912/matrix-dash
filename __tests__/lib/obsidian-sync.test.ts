import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { deleteVaultFile, NOTES_SUBDIR } from "@/lib/services/obsidian-sync";
import { setSetting } from "@/lib/db/settings";

const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-vaultdel-"));
afterAll(() => fs.rmSync(VAULT, { recursive: true, force: true }));

describe("deleteVaultFile", () => {
  it("removes the file from the local vault when no device is paired", async () => {
    setSetting("obsidianVaultPath", VAULT);
    const dir = path.join(VAULT, NOTES_SUBDIR);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "doomed.md");
    fs.writeFileSync(file, "bye");

    await expect(deleteVaultFile(NOTES_SUBDIR, "doomed.md")).resolves.toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("returns false rather than throwing when no vault is configured", async () => {
    setSetting("obsidianVaultPath", "");
    await expect(deleteVaultFile(NOTES_SUBDIR, "whatever.md")).resolves.toBe(false);
  });

  it("reports failure — not false success — when the vault is not visible from this host", async () => {
    // The exact production case: app on the GCE VM, vault on the owner's Mac,
    // device offline. `rmSync({force:true})` does NOT throw for a path that
    // simply does not exist here, so a naive local fallback would return true
    // while the real file survives and gets re-imported as a new note on the
    // next reconcile — reintroducing the very bug this helper exists to fix.
    setSetting("obsidianVaultPath", "/Users/someone-else/Desktop/Obsidian Vault");
    await expect(deleteVaultFile(NOTES_SUBDIR, "ghost.md")).resolves.toBe(false);
  });

  it("still reports success for a file already absent from a vault it CAN see", async () => {
    // Distinguishes "already gone" (fine, idempotent) from "cannot see the
    // vault at all" (not fine) — the two must not collapse into one answer.
    setSetting("obsidianVaultPath", VAULT);
    await expect(deleteVaultFile(NOTES_SUBDIR, "never-existed.md")).resolves.toBe(true);
  });
});
