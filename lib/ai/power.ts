import os from "os";
import path from "path";
import { getSetting } from "@/lib/db/settings";

/**
 * The agent's filesystem/shell capability, chosen in Settings → Agent Tools:
 * - sandboxed:     read-only real FS; no writes, no bash (the safe default surface).
 * - approval:      real writes + bash, but every mutating action needs approval.
 * - unrestricted:  real writes + bash, auto-approved.
 */
export type PowerLevel = "sandboxed" | "approval" | "unrestricted";

const LEVELS: PowerLevel[] = ["sandboxed", "approval", "unrestricted"];

/** Tools that write to disk or execute commands — gated by the power level. */
export const MUTATING_TOOLS = new Set(["writeFileFs", "editFile", "multiEdit", "bash"]);

/** Current power level. Fails closed to `sandboxed` for any unknown/unset value. */
export function getPowerLevel(): PowerLevel {
  const v = getSetting("agent_power_level");
  return v && LEVELS.includes(v as PowerLevel) ? (v as PowerLevel) : "sandboxed";
}

/** The directory the coding tools operate within (default ~/MatrixDash). */
export function getWorkspaceRoot(): string {
  const v = getSetting("agent_workspace_root");
  if (v && v.trim()) return path.resolve(v.trim());
  return path.join(os.homedir(), "MatrixDash");
}

/** Whether a tool may run at all at this level (mutating tools are off in sandboxed). */
export function isToolAllowed(toolName: string, level: PowerLevel): boolean {
  if (level === "sandboxed" && MUTATING_TOOLS.has(toolName)) return false;
  return true;
}

/** Whether a tool must be approved before running at this level. */
export function requiresApproval(toolName: string, level: PowerLevel): boolean {
  return level === "approval" && MUTATING_TOOLS.has(toolName);
}
