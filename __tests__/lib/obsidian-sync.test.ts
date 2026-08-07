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
});
