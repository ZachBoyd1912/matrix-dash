import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { agents, agentRuns, agentVersions } from "./schema";
import type {
  AgentConfig,
  AgentDeliverables,
  AgentMcpServer,
  AgentMode,
  LearnedRules,
  PushMode,
} from "@/types/agents";

type AgentRow = typeof agents.$inferSelect;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseStringArray(raw: string | null | undefined): string[] {
  const parsed = parseJson<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
}

function parseLearnedRules(raw: string | null | undefined): LearnedRules {
  const parsed = parseJson<Partial<LearnedRules>>(raw, {});
  return {
    paths: Array.isArray(parsed.paths) ? parsed.paths.filter((v) => typeof v === "string") : [],
    commands: Array.isArray(parsed.commands)
      ? parsed.commands.filter((v) => typeof v === "string")
      : [],
  };
}

function parseDeliverables(raw: string | null | undefined): AgentDeliverables {
  const parsed = parseJson<Partial<AgentDeliverables>>(raw, {});
  return {
    postToChat: parsed.postToChat === true,
    fileNote: parsed.fileNote === true,
    inDigest: parsed.inDigest !== false,
  };
}

/** Map a raw DB row into the fully-parsed AgentConfig services + UI consume. */
export function rowToAgentConfig(row: AgentRow): AgentConfig {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    model: row.model ?? null,
    cwd: row.cwd ?? null,
    writeAllowlist: parseStringArray(row.writeAllowlist),
    learnedRules: parseLearnedRules(row.learnedRules),
    skillIds: parseStringArray(row.skillIds),
    mcpServers: parseJson<AgentMcpServer[]>(row.mcpServers, []),
    allowSubagents: !!row.allowSubagents,
    mode: (row.mode as AgentMode) ?? "triggered",
    pushMode: (row.pushMode as PushMode | null) ?? null,
    gitAuthorName: row.gitAuthorName ?? null,
    gitAuthorEmail: row.gitAuthorEmail ?? null,
    schedule: row.schedule ?? null,
    scheduleEnabled: !!row.scheduleEnabled,
    isEnabled: !!row.isEnabled,
    consecutiveFailures: row.consecutiveFailures ?? 0,
    maxTurns: row.maxTurns ?? null,
    timeoutMs: row.timeoutMs ?? null,
    perRunCostUsd: row.perRunCostUsd ?? null,
    perRunTokens: row.perRunTokens ?? null,
    maxChainDepth: row.maxChainDepth ?? null,
    deliverables: parseDeliverables(row.deliverables),
    lastRunAt: row.lastRunAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listAgents(): AgentConfig[] {
  return getDb().select().from(agents).orderBy(desc(agents.createdAt)).all().map(rowToAgentConfig);
}

export function getAgent(id: string): AgentConfig | null {
  const row = getDb().select().from(agents).where(eq(agents.id, id)).get();
  return row ? rowToAgentConfig(row) : null;
}

/** Effective git author for autonomous commits — falls back to a distinct per-agent identity. */
export function agentGitIdentity(agent: AgentConfig): { name: string; email: string } {
  const slug = agent.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return {
    name: agent.gitAuthorName ?? `${agent.name} (Matrix Agent)`,
    email: agent.gitAuthorEmail ?? `agent+${slug || agent.id}@zbautomations.ie`,
  };
}

/** Snapshot the current config into agent_versions before an edit is applied. */
export function snapshotAgentVersion(id: string, changeNote?: string): void {
  const row = getDb().select().from(agents).where(eq(agents.id, id)).get();
  if (!row) return;
  getDb()
    .insert(agentVersions)
    .values({
      id: randomUUID(),
      agentId: id,
      snapshot: JSON.stringify(row),
      changeNote: changeNote ?? null,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/** True when a run for this agent is currently active (blocks deletion). */
export function agentHasActiveRun(id: string): boolean {
  const active = getDb()
    .select({ id: agentRuns.id, status: agentRuns.status })
    .from(agentRuns)
    .where(eq(agentRuns.agentId, id))
    .all();
  return active.some((r) => ["queued", "running", "awaiting_approval"].includes(r.status));
}
