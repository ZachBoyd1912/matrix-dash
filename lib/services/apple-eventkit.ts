import { execFile } from "child_process";
import os from "os";

/**
 * Native macOS Reminders + Calendar access via `osascript` (AppleScript). Node
 * can't call EventKit directly, so this shells out. Mac-only — every function
 * returns an `unavailable` result on non-darwin hosts (e.g. the GCE VM) and
 * surfaces a clear error rather than hanging if Automation permission is revoked.
 *
 * First use triggers a one-time macOS Automation permission prompt for the
 * dashboard process (System Settings → Privacy & Security → Automation).
 */

export interface AppleResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  unavailable?: boolean;
}

function isMac(): boolean {
  return os.platform() === "darwin";
}

function runOsascript(script: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.trim() || err.message));
      resolve(stdout.trim());
    });
  });
}

/** Escape a string for embedding in an AppleScript double-quoted literal. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function listReminders(): Promise<AppleResult<string[]>> {
  if (!isMac()) return { ok: false, unavailable: true, error: "Reminders is macOS-only." };
  try {
    const out = await runOsascript(
      'tell application "Reminders" to get name of reminders whose completed is false'
    );
    const items = out
      ? out
          .split(", ")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    return { ok: true, data: items };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createReminder(title: string, dueISO?: string): Promise<AppleResult<null>> {
  if (!isMac()) return { ok: false, unavailable: true, error: "Reminders is macOS-only." };
  if (!title.trim()) return { ok: false, error: "Title required." };
  try {
    const props = dueISO
      ? `{name:"${esc(title)}", due date:(date "${esc(appleDate(dueISO))}")}`
      : `{name:"${esc(title)}"}`;
    await runOsascript(
      `tell application "Reminders" to make new reminder with properties ${props}`
    );
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function completeReminder(title: string): Promise<AppleResult<null>> {
  if (!isMac()) return { ok: false, unavailable: true, error: "Reminders is macOS-only." };
  try {
    await runOsascript(
      `tell application "Reminders" to set completed of (first reminder whose name is "${esc(title)}") to true`
    );
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listTodayEvents(): Promise<AppleResult<string[]>> {
  if (!isMac()) return { ok: false, unavailable: true, error: "Calendar is macOS-only." };
  try {
    const script = `set today to current date
set startOfDay to today - (time of today)
set endOfDay to startOfDay + (24 * 60 * 60)
set out to ""
tell application "Calendar"
  repeat with c in calendars
    repeat with e in (every event of c whose start date ≥ startOfDay and start date < endOfDay)
      set out to out & (summary of e) & " @ " & (start date of e as string) & linefeed
    end repeat
  end repeat
end tell
return out`;
    const out = await runOsascript(script, 30000);
    const items = out
      ? out
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    return { ok: true, data: items };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Convert an ISO timestamp to an AppleScript-friendly date string. */
function appleDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // AppleScript parses locale strings; "MM/DD/YYYY hh:mm:ss" is broadly accepted.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}
