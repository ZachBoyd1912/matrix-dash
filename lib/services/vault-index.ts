import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getContextUserId } from "@/lib/db/context";
import { vaultFiles, vaultLinks } from "@/lib/db/schema";
import { getSetting, setSetting } from "@/lib/db/settings";
import { tryRemoteFs } from "./runner-fs";
import type { TreeEntry } from "@/types/workspace";
import type { VaultFreshness, VaultScanEntry, VaultScanResult } from "@/types/vault";

/**
 * The persisted mirror of the Obsidian vault. This module is the ONLY writer of
 * `vault_files` / `vault_links`; the sidebar, the graph and search all read the
 * index rather than the filesystem, which is what keeps the Vault page usable
 * while the owner's Mac is asleep.
 *
 * Reachability mirrors obsidian-sync.ts: this host's filesystem first (local
 * dev), the paired Matrix Runner device second (production, where the app runs
 * on a VM that can never see a Mac path).
 */

/** Extensions whose contents we store, making offline full-text search work. */
const TEXT_EXTS = new Set(["md", "markdown", "txt", "canvas", "json", "csv"]);

/** Files read per round of parallel reads — see scanVault's comment. */
const READ_CHUNK = 20;

/**
 * Wall-clock ceiling for the read phase. A route awaits scanVault() on page
 * load, and every bridge round-trip can burn runnerFsRequest's 15s timeout, so
 * a cold scan against a wedged device could otherwise block the page for
 * minutes. Overrunning returns partial:true and leaves the rest for the next
 * scan — the index is incremental, so the next pass resumes where this stopped.
 */
const SCAN_BUDGET_MS = 20_000;

/* ------------------------------------------------------------------ *
 * Link resolution
 * ------------------------------------------------------------------ */

/** `Note#Heading`, `Note^block`, a trailing `.md`, surrounding space. */
function normalizeLinkTarget(raw: string): string {
  const withoutAnchor = raw.split("#")[0].split("^")[0];
  return withoutAnchor.trim().replace(/\.md$/i, "").replace(/^\.\//, "").toLowerCase();
}

function basenameNoExt(relPath: string): string {
  const base = relPath.slice(relPath.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Resolve a [[target]] against every file in the vault the way Obsidian does:
 * an explicit vault-relative path wins, otherwise match on basename.
 *
 * Collisions are real — two projects each have a MEMORY.md — so the order is
 * deterministic at every step and never left to Map insertion: same folder
 * first (almost always what was meant), then the shallowest path, then
 * lexicographic. Returns null for a target that does not exist; the caller
 * stores that as a ghost link rather than dropping it, so the graph shows the
 * dangling reference the way Obsidian does.
 */
export function resolveLinkTarget(
  fromDir: string,
  raw: string,
  candidates: string[]
): string | null {
  const wanted = normalizeLinkTarget(raw);
  if (!wanted) return null;

  // An explicit path (`[[Claude Code/Memory/x/MEMORY]]`) is unambiguous by
  // definition — Obsidian emits this form precisely when a basename collides.
  if (wanted.includes("/")) {
    const exact = candidates.find((p) => {
      const lower = p.toLowerCase();
      return lower === wanted || lower.replace(/\.[^./]+$/, "") === wanted;
    });
    if (exact) return exact;
  }

  const matches = candidates.filter((p) => basenameNoExt(p).toLowerCase() === wanted);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const sameFolder = matches.filter((p) => p.slice(0, p.lastIndexOf("/")) === fromDir);
  const pool = sameFolder.length > 0 ? sameFolder : matches;
  return [...pool].sort((a, b) => {
    const depth = a.split("/").length - b.split("/").length;
    return depth !== 0 ? depth : a.localeCompare(b);
  })[0];
}

/**
 * Every `[[link]]` and `![[embed]]` in one pass.
 *
 * Deliberately NOT lib/utils/wiki.ts's extractWikiLinks: its regex also matches
 * the `[[b]]` inside `![[b]]`, so running a separate embed regex on top emits
 * two rows for one reference and draws a doubled edge. One regex with an
 * optional leading `!` is the only way to tell the two apart.
 */
export function extractVaultLinks(content: string): { raw: string; kind: "wikilink" | "embed" }[] {
  const out: { raw: string; kind: "wikilink" | "embed" }[] = [];
  const seen = new Set<string>();
  const regex = /(!?)\[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const raw = match[2].trim();
    if (!raw) continue;
    // Dedupe on the normalized target, not the literal text: `[[b]]` and
    // `![[b]]` in the same file are one edge in the graph, not two.
    const key = normalizeLinkTarget(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ raw, kind: match[1] === "!" ? "embed" : "wikilink" });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Vault listing
 * ------------------------------------------------------------------ */

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** `.obsidian`, `.trash`, `.git` — Obsidian's own machinery, never content. */
function isHidden(name: string): boolean {
  return name.startsWith(".");
}

function entryFor(relPath: string, mtimeMs: number | undefined): VaultScanEntry {
  const slash = relPath.lastIndexOf("/");
  const name = relPath.slice(slash + 1);
  return {
    relPath,
    name,
    ext: extOf(name),
    dirPath: slash === -1 ? "" : relPath.slice(0, slash),
    mtimeMs: mtimeMs ?? null,
  };
}

function walkLocal(absDir: string, relDir: string, out: VaultScanEntry[]): void {
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of dirents) {
    if (isHidden(d.name)) continue;
    const abs = path.join(absDir, d.name);
    const rel = relDir ? `${relDir}/${d.name}` : d.name;
    if (d.isDirectory()) {
      walkLocal(abs, rel, out);
    } else if (d.isFile()) {
      let mtimeMs: number | undefined;
      try {
        mtimeMs = fs.statSync(abs).mtimeMs;
      } catch {
        mtimeMs = undefined;
      }
      out.push(entryFor(rel, mtimeMs));
    }
  }
}

function flattenRemote(entries: TreeEntry[], root: string, out: VaultScanEntry[]): void {
  for (const e of entries) {
    const rel = toPosix(path.relative(root, e.path));
    // A path outside the reported root, or inside a dot-directory, is not vault
    // content — and a `..` relPath would poison the table's primary key.
    if (!rel || rel.startsWith("..") || rel.split("/").some(isHidden)) continue;
    if (e.type === "dir") flattenRemote(e.children ?? [], root, out);
    else out.push(entryFor(rel, e.mtimeMs));
  }
}

/**
 * Every file in the vault, with an mtime, as vault-relative POSIX paths.
 * Returns null when neither this host nor a paired device can see the vault.
 *
 * `root` comes back alongside the entries because relative paths must be
 * derived from the root the LISTER actually used, not from the stored setting:
 * the device resolves the path itself, and a trailing slash or `~` in the
 * setting would otherwise produce `../../..`-style keys.
 */
async function listVaultFiles(
  vaultPath: string
): Promise<{ root: string; entries: VaultScanEntry[] } | null> {
  if (fs.existsSync(vaultPath)) {
    const root = path.resolve(vaultPath);
    const entries: VaultScanEntry[] = [];
    walkLocal(root, "", entries);
    return { root, entries };
  }

  const remote = await tryRemoteFs("tree", { root: vaultPath });
  if (!remote.handled || !remote.result.ok) return null;
  const data = remote.result.data as { root?: string; tree?: TreeEntry[] } | undefined;
  const root = data?.root ?? vaultPath;
  const entries: VaultScanEntry[] = [];
  flattenRemote(data?.tree ?? [], root, entries);
  return { root, entries };
}

/** File contents, or null when the read failed — never an empty string. */
async function readVaultFile(
  root: string,
  relPath: string,
  local: boolean
): Promise<{ content: string; truncated: boolean } | null> {
  const abs = path.join(root, relPath);
  if (local) {
    try {
      return { content: fs.readFileSync(abs, "utf-8"), truncated: false };
    } catch {
      return null;
    }
  }
  const remote = await tryRemoteFs("read", { path: abs });
  if (!remote.handled || !remote.result.ok) return null;
  const data = remote.result.data as { content?: string; truncated?: boolean } | undefined;
  if (typeof data?.content !== "string") return null;
  return { content: data.content, truncated: !!data.truncated };
}

/* ------------------------------------------------------------------ *
 * Index writing
 * ------------------------------------------------------------------ */

function upsertFile(entry: VaultScanEntry, isText: boolean, content: string, now: string): void {
  const row = {
    relPath: entry.relPath,
    name: entry.name,
    ext: entry.ext,
    dirPath: entry.dirPath,
    mtimeMs: entry.mtimeMs,
    isText,
    content,
    indexedAt: now,
  };
  getDb()
    .insert(vaultFiles)
    .values(row)
    .onConflictDoUpdate({
      target: vaultFiles.relPath,
      set: {
        name: row.name,
        ext: row.ext,
        dirPath: row.dirPath,
        mtimeMs: row.mtimeMs,
        isText: row.isText,
        content: row.content,
        indexedAt: row.indexedAt,
      },
    })
    .run();
}

/**
 * Recompute every link in the vault from the INDEX, not from the files this
 * pass happened to re-read.
 *
 * This distinction is the whole correctness of the graph. Scanning is
 * incremental, so on the second and every later scan almost no file's content
 * is in memory; sourcing links from those would delete the rest and leave the
 * graph with a handful of edges — which is exactly the "no connecting lines"
 * symptom this work exists to fix.
 */
function rebuildLinks(): void {
  const rows = getDb()
    .select({ relPath: vaultFiles.relPath, isText: vaultFiles.isText, content: vaultFiles.content })
    .from(vaultFiles)
    .all();
  // Anything indexed is a legal link target, including attachments.
  const candidates = rows.map((r) => r.relPath);

  const inserts: (typeof vaultLinks.$inferInsert)[] = [];
  for (const row of rows) {
    if (!row.isText || !row.content) continue;
    const slash = row.relPath.lastIndexOf("/");
    const fromDir = slash === -1 ? "" : row.relPath.slice(0, slash);
    for (const link of extractVaultLinks(row.content)) {
      const target = resolveLinkTarget(fromDir, link.raw, candidates);
      if (target === row.relPath) continue; // a self-link is not an edge
      inserts.push({
        id: randomUUID(),
        sourcePath: row.relPath,
        targetPath: target,
        targetRaw: link.raw,
        kind: link.kind,
      });
    }
  }

  // One transaction so a reader never sees a half-empty link table — the graph
  // route reads this on every page load.
  getDb().transaction((tx) => {
    tx.delete(vaultLinks).run();
    for (let i = 0; i < inserts.length; i += 200) {
      tx.insert(vaultLinks)
        .values(inserts.slice(i, i + 200))
        .run();
    }
  });
}

/* ------------------------------------------------------------------ *
 * The scan
 * ------------------------------------------------------------------ */

const ZERO: VaultScanResult = {
  indexed: 0,
  skipped: 0,
  failed: 0,
  removed: 0,
  partial: false,
  unreachable: true,
};

// Concurrent page loads must not each start their own scan — they would race on
// the same rows and multiply the bridge traffic. Keyed by user because the
// index lives in the caller's own database.
const g = globalThis as unknown as { __matrixVaultScans?: Map<string, Promise<VaultScanResult>> };
function inFlight(): Map<string, Promise<VaultScanResult>> {
  g.__matrixVaultScans ??= new Map();
  return g.__matrixVaultScans;
}

export async function scanVault(): Promise<VaultScanResult> {
  const key = getContextUserId() ?? "owner";
  const existing = inFlight().get(key);
  if (existing) return existing;
  const run = runScan().finally(() => inFlight().delete(key));
  inFlight().set(key, run);
  return run;
}

async function runScan(): Promise<VaultScanResult> {
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return { ...ZERO };

  const listing = await listVaultFiles(vaultPath);
  // Nothing could see the vault. Return without touching the index: a stale
  // index is strictly better than an empty one, and "cannot verify" must never
  // be written down as "the vault is empty".
  if (!listing) return { ...ZERO };

  const local = fs.existsSync(vaultPath);
  const now = new Date().toISOString();
  const deadline = Date.now() + SCAN_BUDGET_MS;

  const known = new Map(
    getDb()
      .select({ relPath: vaultFiles.relPath, mtimeMs: vaultFiles.mtimeMs })
      .from(vaultFiles)
      .all()
      .map((r) => [r.relPath, r.mtimeMs])
  );

  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  let partial = false;
  const toRead: VaultScanEntry[] = [];

  for (const entry of listing.entries) {
    const isText = TEXT_EXTS.has(entry.ext);
    const prev = known.get(entry.relPath);
    // An unchanged mtime means the stored content is still accurate. `prev`
    // may be undefined (new file) or null (indexed without an mtime) — only a
    // real number matching a real number is proof of no change.
    if (prev != null && entry.mtimeMs != null && prev === entry.mtimeMs) {
      skipped++;
      continue;
    }
    if (isText) {
      toRead.push(entry);
    } else {
      upsertFile(entry, false, "", now);
      indexed++;
    }
  }

  // Read in parallel chunks rather than one at a time: on the remote path each
  // read is a full bridge round-trip, and ~95 sequential ones would take
  // minutes on a cold scan.
  for (let i = 0; i < toRead.length; i += READ_CHUNK) {
    if (Date.now() > deadline) {
      partial = true;
      break;
    }
    const batch = toRead.slice(i, i + READ_CHUNK);
    const results = await Promise.all(
      batch.map((e) => readVaultFile(listing.root, e.relPath, local))
    );
    batch.forEach((entry, n) => {
      const read = results[n];
      // A failed read is NOT an empty file. Writing "" here would wipe the
      // file's links and its full-text entry while looking like success, so
      // the previous row is left exactly as it was and counted separately.
      if (!read) {
        failed++;
        return;
      }
      upsertFile(entry, true, read.content, now);
      indexed++;
    });
  }

  // Files that vanished must leave the index, or deleted notes linger in the
  // sidebar and graph forever. Only safe because we know the listing succeeded.
  let removed = 0;
  const seen = new Set(listing.entries.map((e) => e.relPath));
  for (const relPath of known.keys()) {
    if (seen.has(relPath)) continue;
    getDb().delete(vaultFiles).where(eq(vaultFiles.relPath, relPath)).run();
    removed++;
  }

  rebuildLinks();
  setSetting("vaultIndexedAt", now);
  return { indexed, skipped, failed, removed, partial, unreachable: false };
}

/**
 * The vault's own name — its directory basename, which is exactly what
 * Obsidian uses in an `obsidian://open?vault=<name>` URI. Null when no vault
 * is configured, so the UI can omit the link rather than build a broken one.
 */
export function getVaultName(): string | null {
  const vaultPath = getSetting("obsidianVaultPath")?.trim();
  if (!vaultPath) return null;
  return path.basename(vaultPath.replace(/[\\/]+$/, "")) || null;
}

/** When the index was last successfully refreshed — drives the stale banner. */
export function getVaultIndexedAt(): string | null {
  return getSetting("vaultIndexedAt");
}

/**
 * Refresh the index and report how much to trust what comes back. Every vault
 * route calls this before reading, so a page load always reflects reality when
 * reality is reachable — and says so plainly when it is not, rather than
 * presenting a stale index as current.
 */
export async function refreshVault(): Promise<VaultFreshness> {
  const result = await scanVault();
  return {
    indexedAt: getVaultIndexedAt(),
    stale: result.unreachable,
    unreachable: result.unreachable,
    partial: result.partial,
  };
}
