// Shared types for the autonomous agent system. Runtime rows come from Drizzle
// (lib/db/schema.ts); these are the parsed/typed shapes used across services + UI.

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timeout"
  | "interrupted"
  | "needs_review";

export type RunTrigger = "manual" | "cron" | "webhook" | "chat" | "voice";

export type AgentMode = "triggered" | "standing_watch";

export type PushMode = "direct" | "pr";

export type ApprovalTier = "gated" | "break_glass";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "orphaned";

/** What the policy engine decides for a single tool invocation. */
export type PolicyDecision =
  "auto_allow" | "queue" | "break_glass" | "hard_deny" | "redact" | "simulate";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
  /** For redact decisions: the secret path that was hit (logged to the audit table). */
  secretPath?: string;
}

export interface LearnedRules {
  paths: string[];
  commands: string[];
}

export interface AgentDeliverables {
  postToChat: boolean;
  fileNote: boolean;
  inDigest: boolean;
}

/** MCP server attachment config (kept loose — mirrors the SDK's own shape). */
export interface AgentMcpServer {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
}

/** Parsed agent config as the runner + policy engine consume it. */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model: string | null;
  cwd: string | null;
  writeAllowlist: string[];
  learnedRules: LearnedRules;
  skillIds: string[];
  mcpServers: AgentMcpServer[];
  allowSubagents: boolean;
  mode: AgentMode;
  pushMode: PushMode | null;
  gitAuthorName: string | null;
  gitAuthorEmail: string | null;
  schedule: string | null;
  scheduleEnabled: boolean;
  isEnabled: boolean;
  consecutiveFailures: number;
  maxTurns: number | null;
  timeoutMs: number | null;
  perRunCostUsd: number | null;
  perRunTokens: number | null;
  maxChainDepth: number | null;
  deliverables: AgentDeliverables;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Scope attached to an approval decision to teach the agent a standing rule. */
export interface AlwaysAllowScope {
  pathPrefix?: string;
  commandPattern?: string;
}
