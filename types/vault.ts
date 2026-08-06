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
