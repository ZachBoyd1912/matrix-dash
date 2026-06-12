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
}

export interface FileReadResult {
  path: string;
  content: string;
  language: string;
  truncated: boolean;
  bytes: number;
}
