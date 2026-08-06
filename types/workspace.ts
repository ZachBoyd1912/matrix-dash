/** Client-safe workspace types (no fs / DB imports). */

export interface WorkspaceRecord {
  id: string;
  path: string;
  name: string;
  lastOpened: string;
}

export interface TreeEntry {
  name: string;
  /** Absolute path on disk. */
  path: string;
  type: "file" | "dir";
  /** Present only for directories. */
  children?: TreeEntry[];
  /**
   * Last-modified time in epoch ms, when the source could report one.
   * Optional so an older unpatched runner (no mtimeMs support) degrades to
   * "can't determine staleness" rather than crashing a consumer that assumes
   * it's always present.
   */
  mtimeMs?: number;
}

export interface FileReadResult {
  path: string;
  content: string;
  language: string;
  truncated: boolean;
  bytes: number;
}
