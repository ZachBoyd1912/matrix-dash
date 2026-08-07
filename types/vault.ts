/** Client-safe vault types (no fs / DB imports) — see docs/obsidian-vault-layer.md. */

/* ─── Scanning (lib/services/vault-index.ts) ────────────────────────── */

/** One file discovered by a vault listing, before its content is read. */
export interface VaultScanEntry {
  /** Vault-relative POSIX path — the primary key of `vault_files`. */
  relPath: string;
  /** Basename including the extension. */
  name: string;
  /** Lowercase extension without the dot; "" for an extensionless file. */
  ext: string;
  /** Vault-relative POSIX directory; "" at the vault root. */
  dirPath: string;
  /** Null when the source could not report one — see TreeEntry.mtimeMs. */
  mtimeMs: number | null;
}

export interface VaultScanResult {
  /** Files written to the index this pass. */
  indexed: number;
  /** Files left alone because their mtime was unchanged. */
  skipped: number;
  /** Files whose read failed; their previous index row was left intact. */
  failed: number;
  /** Index rows dropped because the file no longer exists in the vault. */
  removed: number;
  /** True when the time budget ran out before every changed file was read. */
  partial: boolean;
  /** True when neither this host nor a paired device could see the vault. */
  unreachable: boolean;
}

/**
 * Whether what is being shown came from a live look at the vault or from the
 * stored index. Every vault response carries this so the UI can say so out
 * loud instead of presenting a stale index as current truth.
 */
export interface VaultFreshness {
  /** ISO timestamp of the last successful scan, or null if never scanned. */
  indexedAt: string | null;
  /** True when this response was served from the index without refreshing it. */
  stale: boolean;
  /** True when neither this host nor a paired device could see the vault. */
  unreachable: boolean;
  /** True when the last scan ran out of time before reading every change. */
  partial: boolean;
}

/* ─── Tree + files (lib/services/vault-query.ts) ────────────────────── */

export interface VaultTreeFile {
  /** Vault-relative POSIX path — the id for every vault surface. */
  relPath: string;
  /** Basename including the extension. */
  name: string;
  ext: string;
  /** False for attachments; they are listed but have no readable body. */
  isText: boolean;
  /** Set when this file is the vault copy of a matrix-dash note. */
  noteId: string | null;
  /** Set when this file is the vault copy of a matrix-dash memory. */
  memoryId: string | null;
  /**
   * True for a note or memory that exists in matrix-dash but has no file in
   * the vault yet — Obsidian sync is off, or hasn't written it. It is listed
   * anyway (and opens normally) so the page can never hide the user's own
   * notes behind an integration they may not have enabled.
   */
  notInVault: boolean;
}

export interface VaultTreeFolder {
  /** Vault-relative POSIX path of the folder itself. */
  path: string;
  name: string;
  folders: VaultTreeFolder[];
  files: VaultTreeFile[];
  /** Files at and below this folder. */
  fileCount: number;
}

export interface VaultIndexResponse extends VaultFreshness {
  folders: VaultTreeFolder[];
  /** Files sitting directly in the vault root, e.g. its README.md. */
  rootFiles: VaultTreeFile[];
  fileCount: number;
  /** The vault directory's basename — what `obsidian://open?vault=` wants. */
  vaultName: string | null;
}

export interface VaultBacklink {
  relPath: string;
  name: string;
}

export interface VaultOutgoingLink {
  /** Null when the [[target]] resolves to nothing — a ghost link. */
  relPath: string | null;
  raw: string;
}

export interface VaultFileDetail {
  relPath: string;
  name: string;
  dirPath: string;
  ext: string;
  isText: boolean;
  /** Best-effort flat key/value scan of the YAML frontmatter — not a parser. */
  frontmatter: Record<string, string>;
  body: string;
  raw: string;
  mtimeMs: number | null;
  indexedAt: string;
  noteId: string | null;
  memoryId: string | null;
  backlinks: VaultBacklink[];
  outgoing: VaultOutgoingLink[];
}

export interface VaultSearchHit {
  relPath: string;
  name: string;
  /** FTS5 snippet around the match; "" for a filename-only hit. */
  snippet: string;
}

/* ─── Graph ─────────────────────────────────────────────────────────── */

export interface VaultGraphNode {
  /** `vault:<relPath>` for a real file, `ghost:<target>` for a dangling link. */
  id: string;
  /** Null for a ghost node — there is no file behind it. */
  relPath: string | null;
  label: string;
  /** Top-level vault folder; "" for a file at the vault root. */
  folder: string;
  color: string;
  isGhost: boolean;
  isText: boolean;
  noteId: string | null;
  memoryId: string | null;
  /** Edges touching this node, used to size it. */
  degree: number;
}

export interface VaultGraphLink {
  id: string;
  source: string;
  target: string;
  kind: "wikilink" | "embed";
}

export interface VaultGraphFolder {
  name: string;
  color: string;
  count: number;
}

export interface VaultGraphData extends VaultFreshness {
  nodes: VaultGraphNode[];
  links: VaultGraphLink[];
  /** Legend entries, in the sidebar's own folder order. */
  folders: VaultGraphFolder[];
  /** True when the vault exceeded the node cap; `total` is the real count. */
  truncated: boolean;
  total: number;
}
