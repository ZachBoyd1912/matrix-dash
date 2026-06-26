// Shared log model for the unified Console page. Used by the server log bus,
// the streaming API routes, the client capture store, and the UI. Kept pure
// (no React / no Node) so it can be imported from any layer.

export type LogLevel = "debug" | "log" | "info" | "warn" | "error";

export type LogSource =
  | "dash-server" // Matrix Dashboard — Next server stdout/stderr
  | "dash-browser" // Matrix Dashboard — its own client console
  | "builder-server" // Matrix Builder — dev-server (dev.log) output
  | "builder-browser"; // Matrix Builder — running app's console (via postMessage bridge)

export interface LogLine {
  id: string;
  ts: number; // epoch ms
  level: LogLevel;
  source: LogSource;
  text: string;
}

/** Which project a source belongs to (the two top-level Console sections). */
export type LogProject = "dashboard" | "builder";

export function projectOf(source: LogSource): LogProject {
  return source === "dash-server" || source === "dash-browser" ? "dashboard" : "builder";
}

export const SOURCE_LABEL: Record<LogSource, string> = {
  "dash-server": "Backend",
  "dash-browser": "Browser",
  "builder-server": "Dev server",
  "builder-browser": "App console",
};

export const LEVELS: LogLevel[] = ["debug", "log", "info", "warn", "error"];

/** Tailwind text-color class per level (used by the prettified log row). */
export function levelColor(level: LogLevel): string {
  switch (level) {
    case "error":
      return "text-rose-400";
    case "warn":
      return "text-amber-400";
    case "info":
      return "text-sky-400";
    case "debug":
      return "text-text-muted";
    default:
      return "text-text-secondary";
  }
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;

/** Drop ANSI SGR color codes — dev servers emit plenty; we colorize ourselves. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

/** "HH:MM:SS.mmm" in local time. */
export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

let _seq = 0;
/** Monotonic-ish id that stays unique even within the same millisecond. */
export function makeLogId(ts: number): string {
  _seq = (_seq + 1) % 1_000_000;
  return `${ts}-${_seq}`;
}

/** Cheap level inference from a raw line (for sources without explicit levels). */
export function inferLevel(text: string, fallback: LogLevel = "log"): LogLevel {
  const t = text.toLowerCase();
  if (/\b(error|err!|✗|⨯|failed|exception|unhandled)\b/.test(t)) return "error";
  if (/\b(warn|warning|deprecat|⚠)\b/.test(t)) return "warn";
  return fallback;
}
