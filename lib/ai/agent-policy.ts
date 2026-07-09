import path from "path";
import os from "os";
import type { PolicyDecision, PolicyResult, LearnedRules } from "@/types/agents";

/**
 * The pure permission policy for autonomous agent runs. Given a single tool
 * invocation and the agent's config, it returns one decision:
 *
 *   auto_allow  – run it, no human in the loop
 *   queue       – pause the run and ask the human (ordinary gated write/command)
 *   break_glass – pause and ask, flagged as a denylisted/high-risk override
 *   hard_deny   – refuse outright, no override (secret writes, raw key reads)
 *   redact      – allow a read of a secret/config file but mask values + audit it
 *   simulate    – dry-run: don't mutate, show what WOULD happen
 *
 * Kept pure (no DB, no settings reads) so it is exhaustively unit-testable; the
 * runner passes in the resolved settings (selfPaths, extraDenylist, dbPaths).
 */

// Claude Code / Agent SDK native tool names.
const READ_ONLY_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "NotebookRead",
  "Task", // subagent spawn — read-only from the policy's view; its children are policed on their own runs
]);

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

// Bash commands considered destructive → always break_glass.
const DESTRUCTIVE_BASH = [
  /\brm\s+-rf?\b/, // rm -rf / rm -r
  /\bsudo\b/,
  /\bdd\b\s+if=/,
  /\bmkfs\b/,
  /\bgit\s+push\s+.*--force\b/,
  /\bgit\s+push\s+-f\b/,
  /\bsystemctl\s+(stop|disable|mask)\b/,
  /\b(gcloud|aws)\s+.*\bdelete\b/,
  /\bcurl\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/, // curl … | sh
  /\bwget\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/,
  />\s*\/dev\/sd[a-z]/,
  /\bDROP\s+TABLE\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
];

// Bash commands considered inherently safe → auto_allow (read/inspection only).
const SAFE_BASH = [
  /^\s*ls(\s|$)/,
  /^\s*pwd\s*$/,
  /^\s*cat\s+/, // path safety is checked separately against secret paths
  /^\s*echo\s+/,
  /^\s*git\s+(status|log|diff|show|branch|remote|rev-parse)\b/,
  /^\s*(pnpm|npm|yarn)\s+(run\s+)?(typecheck|lint|test)\b/,
  /^\s*node\s+--version/,
  /^\s*which\s+/,
  /^\s*head\s+/,
  /^\s*tail\s+/,
  /^\s*wc\s+/,
];

const MUTATING_TOOL_NAMES = new Set([...WRITE_TOOLS, "Bash"]);

export interface PolicyInput {
  toolName: string;
  input: Record<string, unknown>;
  writeAllowlist: string[];
  learnedRules: LearnedRules;
  /** Per-agent chain-depth cap (falls back to maxChainDepthDefault). */
  maxChainDepth?: number | null;
  dryRun?: boolean;
  chainDepth?: number;
  /** Roots whose agent-system source files + the DB are self-modification-guarded. */
  selfPaths?: string[];
  /** DB file paths (matrix.db + WAL/SHM) — hard-denied writes, redacted reads. */
  dbPaths?: string[];
  /** Extra denylist globs/patterns from settings. */
  extraDenylist?: string[];
  maxChainDepthDefault?: number;
}

function homeExpand(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function absolute(p: string, cwd?: string): string {
  const expanded = homeExpand(p);
  const abs = path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(cwd ?? process.cwd(), expanded);
  return canonicalizeMac(abs);
}

/**
 * Collapse the macOS /private symlink so allowlist comparisons are stable:
 * /private/var, /private/tmp, /private/etc all normalize to their /var, /tmp,
 * /etc form. Without this, an allowlisted /var/folders/... dir wouldn't match a
 * tool's /private/var/folders/... write path and every write would falsely queue.
 */
function canonicalizeMac(p: string): string {
  return p.replace(/^\/private\/(var|tmp|etc)(\/|$)/, "/$1$2");
}

/** Raw key material — reads hard-denied (masking is meaningless for a private key). */
function isSecretHardDeny(abs: string): boolean {
  const base = path.basename(abs);
  if (/^id_(rsa|ed25519|dsa|ecdsa)$/.test(base)) return true;
  if (/\.(pem|key|p12|pfx|keystore)$/i.test(base)) return true;
  if (abs.includes("/Library/Keychains/")) return true;
  if (
    /\/\.ssh\//.test(abs) &&
    !base.endsWith(".pub") &&
    base !== "config" &&
    base !== "known_hosts"
  )
    return true;
  return false;
}

/** Config files that hold secret values — reads allowed but masked + audited. */
function isSecretRedact(abs: string, dbPaths: string[]): boolean {
  const base = path.basename(abs);
  if (/^\.env($|\.)/.test(base)) return true;
  if (abs.includes("/.aws/")) return true;
  if (abs.includes("/.config/gcloud/")) return true;
  if (abs.includes("/.claude/") && /credential/i.test(base)) return true;
  if (dbPaths.some((d) => abs === d || abs.startsWith(d))) return true;
  return false;
}

const AGENT_SELF_FRAGMENTS = [
  "/lib/services/agent-runner",
  "/lib/services/agent-approvals",
  "/lib/services/agent-git",
  "/lib/services/agent-snapshots",
  "/lib/services/run-bus",
  "/lib/ai/agent-policy",
  "/lib/db/agents.",
  "/app/api/agents/",
  "/app/dashboard/agents/",
];

/** The agent system's own source (self-modification guard) — narrower than "the whole repo". */
function isAgentSelf(abs: string, selfPaths: string[]): boolean {
  if (!selfPaths.some((root) => abs === root || abs.startsWith(root + path.sep))) return false;
  return AGENT_SELF_FRAGMENTS.some((frag) => abs.includes(frag));
}

/** Production infrastructure — always human-approved. */
function isProdInfra(abs: string): boolean {
  const base = path.basename(abs);
  if (base === "Caddyfile") return true;
  if (abs.includes("/etc/systemd/") || /\.service$/.test(base)) return true;
  if (/\/deploy\//.test(abs) && /\.(sh|service|ya?ml)$/.test(base)) return true;
  return false;
}

function underAllowlist(abs: string, allow: string[]): boolean {
  return allow.some((prefix) => {
    const root = absolute(prefix);
    return abs === root || abs.startsWith(root + path.sep);
  });
}

function matchesExtraDenylist(value: string, extra: string[]): boolean {
  return extra.some((pattern) => {
    if (!pattern) return false;
    try {
      // Treat a plain string as a substring match; `/regex/` as a regex.
      if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
        return new RegExp(pattern.slice(1, -1)).test(value);
      }
      return value.includes(pattern);
    } catch {
      return value.includes(pattern);
    }
  });
}

function targetPath(toolName: string, input: Record<string, unknown>): string | null {
  const raw =
    (input.file_path as string | undefined) ??
    (input.path as string | undefined) ??
    (input.notebook_path as string | undefined);
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function result(decision: PolicyDecision, reason: string, secretPath?: string): PolicyResult {
  return { decision, reason, secretPath };
}

export function evaluatePolicy(p: PolicyInput): PolicyResult {
  const selfPaths = (p.selfPaths ?? []).map((s) => path.normalize(homeExpand(s)));
  const dbPaths = (p.dbPaths ?? []).map((s) => path.normalize(homeExpand(s)));
  const extra = p.extraDenylist ?? [];
  const isMutating = MUTATING_TOOL_NAMES.has(p.toolName);

  // ── Runtime agent chaining (runAgent tool, incl. mcp__matrix-agent__runAgent) ──
  if (/(^|_)runagent(tool)?$/i.test(p.toolName)) {
    const depth = (p.chainDepth ?? 0) + 1;
    const cap = p.maxChainDepth ?? p.maxChainDepthDefault ?? 3;
    return depth > cap
      ? result("break_glass", `Chain depth ${depth} exceeds cap ${cap}.`)
      : result("auto_allow", `Chain depth ${depth} within cap ${cap}.`);
  }

  // ── Read-only tools ────────────────────────────────────────────────────
  if (READ_ONLY_TOOLS.has(p.toolName)) {
    const tp = targetPath(p.toolName, p.input);
    if (tp) {
      const abs = absolute(tp);
      if (isSecretHardDeny(abs)) {
        return result("hard_deny", "Read of raw key material is never permitted.", abs);
      }
      if (isSecretRedact(abs, dbPaths)) {
        return result("redact", "Secret file read — values masked and audited.", abs);
      }
    }
    return result("auto_allow", "Read-only tool.");
  }

  // ── Dry-run: intercept every mutating action ───────────────────────────
  if (isMutating && p.dryRun) {
    return result("simulate", "Dry run — mutation simulated, not applied.");
  }

  // ── Write tools ────────────────────────────────────────────────────────
  if (WRITE_TOOLS.has(p.toolName)) {
    const tp = targetPath(p.toolName, p.input);
    if (!tp) return result("queue", "Write with no resolvable target path.");
    const abs = absolute(tp);

    if (isSecretHardDeny(abs) || isSecretRedact(abs, dbPaths)) {
      return result("hard_deny", "Writing to a secret/credential path is never permitted.", abs);
    }
    if (matchesExtraDenylist(abs, extra)) {
      return result("break_glass", "Path matches a configured denylist rule.", abs);
    }
    // Self-modification + prod-infra guards win even over the allowlist.
    if (isAgentSelf(abs, selfPaths)) {
      return result("break_glass", "Write to the agent system's own source.");
    }
    if (isProdInfra(abs)) {
      return result("break_glass", "Write to production infrastructure.");
    }
    if (underAllowlist(abs, [...p.writeAllowlist, ...p.learnedRules.paths])) {
      return result("auto_allow", "Path is inside the agent's write allowlist.");
    }
    return result("queue", "Write outside the safe zone.");
  }

  // ── Bash ───────────────────────────────────────────────────────────────
  if (p.toolName === "Bash") {
    const cmd = typeof p.input.command === "string" ? p.input.command : "";
    if (!cmd) return result("queue", "Empty or non-string bash command.");

    if (matchesExtraDenylist(cmd, extra)) {
      return result("break_glass", "Command matches a configured denylist rule.");
    }
    if (DESTRUCTIVE_BASH.some((re) => re.test(cmd))) {
      return result("break_glass", "Destructive shell command.");
    }
    // Reading a secret path via cat/head/tail → redact + audit.
    const secretHit = extractPathsFromCommand(cmd).find(
      (ap) => isSecretHardDeny(ap) || isSecretRedact(ap, dbPaths)
    );
    if (secretHit) {
      if (isSecretHardDeny(secretHit)) {
        return result("hard_deny", "Command reads raw key material.", secretHit);
      }
      return result("redact", "Command reads a secret file — output masked + audited.", secretHit);
    }
    if (p.learnedRules.commands.some((pat) => commandMatchesLearned(cmd, pat))) {
      return result("auto_allow", "Command matches a learned always-allow rule.");
    }
    if (SAFE_BASH.some((re) => re.test(cmd))) {
      return result("auto_allow", "Recognized safe inspection command.");
    }
    return result("queue", "Unclassified shell command.");
  }

  // ── Everything else (unknown/custom tools) ─────────────────────────────
  return result("auto_allow", "Non-mutating tool.");
}

/** Crude path extraction from a shell command for secret-path scanning. */
function extractPathsFromCommand(cmd: string): string[] {
  const tokens = cmd
    .split(/\s+/)
    .filter((t) => t.includes("/") || t.startsWith("~") || t.startsWith("."));
  return tokens.map((t) => absolute(t.replace(/^["']|["']$/g, "")));
}

function commandMatchesLearned(cmd: string, pattern: string): boolean {
  if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
    try {
      return new RegExp(pattern.slice(1, -1)).test(cmd);
    } catch {
      return false;
    }
  }
  return cmd.trim().startsWith(pattern.trim());
}

export const _internal = {
  isSecretHardDeny,
  isSecretRedact,
  isAgentSelf,
  isProdInfra,
  underAllowlist,
};
