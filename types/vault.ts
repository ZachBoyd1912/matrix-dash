/** Client-safe vault types (no fs / DB imports) — see docs/obsidian-vault-layer.md. */

export type VaultSource = "note" | "memory" | "claude-code";

export interface ClaudeCodeFileSummary {
  project: string;
  /** e.g. "matrix-runner-platform.md" — includes the .md extension. */
  relPath: string;
  /** Filename sans extension. */
  name: string;
  mtimeMs?: number;
}

export interface ClaudeCodeProjectSummary {
  name: string;
  files: ClaudeCodeFileSummary[];
}

export interface ClaudeCodeTree {
  projects: ClaudeCodeProjectSummary[];
  /** True when neither the local filesystem nor a paired device could reach the vault. */
  unreachable: boolean;
}

export interface ClaudeCodeFileContent {
  project: string;
  relPath: string;
  name: string;
  /** Best-effort flat key/value scan of the YAML frontmatter block — not a real YAML parser. */
  frontmatter: Record<string, string>;
  body: string;
  raw: string;
  mtimeMs?: number;
}

/* ─── Vault index (lib/services/vault-index.ts) ─────────────────────── */

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

export interface VaultGraphNode {
  id: string;
  source: VaultSource;
  label: string;
  /** Present for memory nodes only. */
  memoryType?: "identity" | "project" | "global" | "lesson";
  isPinned?: boolean;
  isFavorite?: boolean;
}

export interface VaultGraphLink {
  id: string;
  source: string;
  target: string;
  kind: "note-link" | "memory-link" | "wikilink";
}

export interface VaultGraphData {
  nodes: VaultGraphNode[];
  links: VaultGraphLink[];
  ccProjects: string[];
}
