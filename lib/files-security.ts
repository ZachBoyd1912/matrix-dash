import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

const HOME = os.homedir();

/**
 * Paths whose contents should never be listed or read from the mobile file
 * browser. These are checked as prefixes after the path is resolved to its
 * canonical form — so a symlink trick (ln -s ~/.ssh ~/Desktop/fake) still
 * resolves and matches.
 */
const SENSITIVE_PREFIXES = [
  path.join(HOME, ".ssh"),
  path.join(HOME, ".aws"),
  path.join(HOME, ".gnupg"),
  path.join(HOME, "Library", "Keychains"),
  path.join(HOME, "Library", "Application Support"),
  path.join(HOME, "Library", "Mail"),
  path.join(HOME, "Library", "Messages"),
  path.join(HOME, "Library", "Safari"),
  path.join(HOME, "Library", "Cookies"),
];

/** Max bytes for the text preview endpoint. Beyond this the file is download-only. */
export const MAX_READ_BYTES = 500_000;

/** Max bytes for the download endpoint. */
export const MAX_DOWNLOAD_BYTES = 500_000_000;

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  /** Bytes; absent for directories. */
  size?: number;
  /** ISO-8601 string from stat.mtime; absent for directories. */
  mtime?: string;
  /** Lowercase extension without the dot, e.g. "tsx"; absent for directories. */
  extension?: string;
  /** True for dot-prefixed entries (the UI dims them). */
  hidden: boolean;
}

export interface BrowseResult {
  path: string;
  name: string;
  entries: FileEntry[];
}

export interface ReadResult {
  path: string;
  content: string;
  /** Detected language tag for syntax highlighting. */
  language: string;
  /** True if the file was truncated at MAX_READ_BYTES. */
  truncated: boolean;
  /** Total file size in bytes. */
  size: number;
}

export interface DownloadMeta {
  path: string;
  filename: string;
  contentType: string;
  size: number;
}

/** Resolve and validate a requested path — returns the canonical absolute path
 *  or an error response. This is the single gate for every file route. */
export function resolvePath(requestedPath: string): string | Response {
  if (!requestedPath || requestedPath.length > 1000) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  // Resolve relative to home if not absolute.
  let resolved: string;
  try {
    resolved = path.resolve(
      requestedPath.startsWith("/") ? requestedPath : path.join(HOME, requestedPath)
    );
  } catch {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  // Resolve symlinks to their real path so ~/Desktop/link-to-ssh → ~/.ssh is caught.
  let real: string;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    // realpathSync fails if the path doesn't exist — that's fine for browse (it'll
    // fail later with ENOENT), but for read/download we need the real path.
    real = resolved;
  }

  // Must be within the home directory.
  if (!real.startsWith(HOME + path.sep) && real !== HOME) {
    return Response.json({ error: "Path is outside home directory" }, { status: 403 });
  }

  // Check sensitive prefixes.
  for (const prefix of SENSITIVE_PREFIXES) {
    if (real === prefix || real.startsWith(prefix + path.sep)) {
      return Response.json({ error: "This folder is private" }, { status: 403 });
    }
  }

  return real;
}

/** Map file extension to a human-readable language tag for syntax highlighting. */
export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".jsonc": "json",
    ".md": "markdown",
    ".mdx": "markdown",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".htm": "html",
    ".xml": "xml",
    ".svg": "xml",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".swift": "swift",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "toml",
    ".ini": "ini",
    ".cfg": "ini",
    ".env": "plaintext",
    ".gitignore": "plaintext",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".prisma": "prisma",
    ".dockerfile": "dockerfile",
    ".vue": "html",
    ".svelte": "html",
    ".astro": "html",
    ".php": "php",
    ".lua": "lua",
    ".r": "r",
    ".dart": "dart",
    ".ex": "elixir",
    ".exs": "elixir",
    ".elm": "elm",
    ".hs": "haskell",
    ".scala": "scala",
    ".clj": "clojure",
    ".erl": "erlang",
    ".tf": "hcl",
    ".hcl": "hcl",
  };
  return map[ext] || "plaintext";
}

/** Map file extension to MIME type for the download endpoint. */
export function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".xml": "application/xml",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".bz2": "application/x-bzip2",
    ".xz": "application/x-xz",
    ".7z": "application/x-7z-compressed",
    ".rar": "application/vnd.rar",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".otf": "font/otf",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".ics": "text/calendar",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".wasm": "application/wasm",
    ".dmg": "application/x-apple-diskimage",
    ".pkg": "application/x-newton-compatible-pkg",
    ".app": "application/octet-stream",
  };
  return map[ext] || "application/octet-stream";
}

/** Whether a file extension suggests binary content (not human-readable). */
export function isBinaryExtension(filePath: string): boolean {
  const textExtensions = new Set([
    "",
    ".txt",
    ".md",
    ".mdx",
    ".html",
    ".htm",
    ".css",
    ".scss",
    ".less",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".json",
    ".jsonc",
    ".xml",
    ".svg",
    ".yml",
    ".yaml",
    ".toml",
    ".ini",
    ".cfg",
    ".env",
    ".gitignore",
    ".editorconfig",
    ".py",
    ".rb",
    ".rs",
    ".go",
    ".java",
    ".kt",
    ".swift",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".sh",
    ".bash",
    ".zsh",
    ".sql",
    ".graphql",
    ".gql",
    ".prisma",
    ".vue",
    ".svelte",
    ".astro",
    ".php",
    ".lua",
    ".r",
    ".dart",
    ".ex",
    ".exs",
    ".elm",
    ".hs",
    ".scala",
    ".clj",
    ".erl",
    ".tf",
    ".hcl",
    ".csv",
    ".tsv",
    ".ics",
    ".log",
    ".diff",
    ".patch",
    ".lock",
  ]);
  return !textExtensions.has(path.extname(filePath).toLowerCase());
}
