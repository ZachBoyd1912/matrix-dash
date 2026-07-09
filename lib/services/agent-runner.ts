import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import { eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agents, agentRuns, agentSecretReads, skills } from "@/lib/db/schema";
import { getAgent } from "@/lib/db/agents";
import { getWorkspaceRoot } from "@/lib/ai/power";
import { getSetting } from "@/lib/db/settings";
import { getDbPath } from "@/lib/utils/db-path";
import { evaluatePolicy } from "@/lib/ai/agent-policy";
import { redactResult } from "@/lib/ai/redact";
import {
  appendEvent,
  serializeBlocksForStorage,
  type Block,
  type StreamEvent,
} from "@/lib/chat/blocks";
import { publishRunEvent } from "./run-bus";
import type { AgentConfig, RunStatus, RunTrigger } from "@/types/agents";
import type {
  CanUseTool,
  McpServerConfig,
  PermissionResult,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

// ── Singleton runtime state (survives HMR) ────────────────────────────────
interface ActiveRun {
  runId: string;
  agentId: string;
  paths: string[]; // cwd + allowlist, for overlap locking
  abort: AbortController;
  reason?: "timeout" | "budget" | "kill" | "cancel";
}

interface RunnerState {
  active: Map<string, ActiveRun>;
  queue: string[];
  processing: boolean;
}

const KEY = Symbol.for("matrix-dash.agent-runner");
function state(): RunnerState {
  const g = globalThis as unknown as Record<symbol, RunnerState | undefined>;
  if (!g[KEY]) g[KEY] = { active: new Map(), queue: [], processing: false };
  return g[KEY]!;
}

// ── Settings helpers ──────────────────────────────────────────────────────
function numSetting(key: string, fallback: number): number {
  const v = parseFloat(getSetting(key) ?? "");
  return Number.isFinite(v) ? v : fallback;
}

function killSwitchOn(): boolean {
  return getSetting("agents_kill_switch") === "1";
}

/** Concurrency, clamped to 1 on low-memory hosts (e2-micro). */
function maxConcurrent(): number {
  const configured = Math.max(1, Math.floor(numSetting("agents_max_concurrent", 1)));
  const lowMem = os.totalmem() < 1.5 * 1024 * 1024 * 1024;
  return lowMem ? 1 : configured;
}

function dbPaths(): string[] {
  const base = getDbPath();
  return [base, `${base}-wal`, `${base}-shm`];
}

function selfPaths(): string[] {
  const configured = getSetting("agents_self_path") || "";
  const roots = [process.cwd()];
  if (configured) roots.push(path.resolve(configured));
  return roots;
}

function extraDenylist(): string[] {
  try {
    const parsed = JSON.parse(getSetting("agents_denylist_extra") ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// ── Daily budget check (SUM over today's runs) ────────────────────────────
function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function dailySpend(): { cost: number; tokens: number } {
  const row = getDb()
    .select({
      cost: sql<number>`COALESCE(SUM(${agentRuns.costUsd}), 0)`,
      inTok: sql<number>`COALESCE(SUM(${agentRuns.inputTokens}), 0)`,
      outTok: sql<number>`COALESCE(SUM(${agentRuns.outputTokens}), 0)`,
    })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, todayStartIso()))
    .get();
  return { cost: row?.cost ?? 0, tokens: (row?.inTok ?? 0) + (row?.outTok ?? 0) };
}

function dailyBudgetExceeded(): boolean {
  const { cost, tokens } = dailySpend();
  return (
    cost >= numSetting("agents_daily_cost_budget_usd", 10) ||
    tokens >= numSetting("agents_daily_token_budget", 2_000_000)
  );
}

// ── Public API ────────────────────────────────────────────────────────────
export interface StartRunOpts {
  trigger?: RunTrigger;
  prompt?: string;
  dryRun?: boolean;
  sourceSessionId?: string;
  chainDepth?: number;
  parentRunId?: string;
}

/** Queue a run for an agent and kick the processor. Returns the new run id. */
export function startRun(agentId: string, opts: StartRunOpts = {}): string {
  const agent = getAgent(agentId);
  if (!agent) throw new Error("Agent not found");
  const runId = randomUUID();
  getDb()
    .insert(agentRuns)
    .values({
      id: runId,
      agentId,
      status: "queued",
      trigger: opts.trigger ?? "manual",
      dryRun: opts.dryRun ?? false,
      chainDepth: opts.chainDepth ?? 0,
      parentRunId: opts.parentRunId ?? null,
      prompt: opts.prompt ?? agent.instructions,
      sourceSessionId: opts.sourceSessionId ?? null,
      createdAt: new Date().toISOString(),
    })
    .run();
  const s = state();
  s.queue.push(runId);
  void processQueue();
  return runId;
}

/** Abort a running run (or drop it from the queue if not started yet). */
export function cancelRun(runId: string): void {
  const s = state();
  const act = s.active.get(runId);
  if (act) {
    act.reason = "cancel";
    act.abort.abort();
    return;
  }
  // Not started yet — remove from queue and mark cancelled.
  const idx = s.queue.indexOf(runId);
  if (idx >= 0) s.queue.splice(idx, 1);
  getDb()
    .update(agentRuns)
    .set({ status: "cancelled", endedAt: new Date().toISOString() })
    .where(eq(agentRuns.id, runId))
    .run();
}

/** Hard-abort every active run (kill switch). */
export function killAllRuns(): void {
  const s = state();
  for (const act of s.active.values()) {
    act.reason = "kill";
    act.abort.abort();
  }
  // Drop the queue too.
  for (const runId of s.queue.splice(0)) {
    getDb()
      .update(agentRuns)
      .set({ status: "cancelled", endedAt: new Date().toISOString() })
      .where(eq(agentRuns.id, runId))
      .run();
  }
}

/** Boot cleanup: nothing survives a server restart, so mark orphans. */
export function recoverInterruptedRuns(): void {
  try {
    getDb()
      .update(agentRuns)
      .set({ status: "interrupted", endedAt: new Date().toISOString() })
      .where(inArray(agentRuns.status, ["queued", "running", "awaiting_approval"]))
      .run();
  } catch {
    /* table may not exist on a very old DB; ignored */
  }
  void import("./agent-approvals").then((m) => m.orphanPendingApprovals()).catch(() => {});
}

// ── Queue processor ───────────────────────────────────────────────────────
async function processQueue(): Promise<void> {
  const s = state();
  if (s.processing) return;
  s.processing = true;
  try {
    while (s.queue.length > 0) {
      if (killSwitchOn()) break;
      if (s.active.size >= maxConcurrent()) break;
      if (dailyBudgetExceeded()) break;

      const runId = s.queue[0];
      const agentId = runAgentId(runId);
      if (!agentId) {
        s.queue.shift();
        continue;
      }
      const agent = getAgent(agentId);
      if (!agent) {
        s.queue.shift();
        continue;
      }

      // Usage-window soft pause: cron/webhook runs yield when near the buffer.
      const trigger = runTrigger(runId);
      if ((trigger === "cron" || trigger === "webhook") && usageBufferReached()) break;

      // Path-overlap lock: don't run two agents against overlapping paths.
      const paths = agentPaths(agent);
      if (overlapsActive(paths)) break;

      s.queue.shift();
      const abort = new AbortController();
      s.active.set(runId, { runId, agentId, paths, abort });
      // Fire-and-forget; each run cleans up + re-pumps the queue on completion.
      void executeRun(runId, agent, abort).finally(() => {
        s.active.delete(runId);
        void processQueue();
      });
    }
  } finally {
    s.processing = false;
  }
}

function runAgentId(runId: string): string | null {
  const row = getDb()
    .select({ agentId: agentRuns.agentId })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get();
  return row?.agentId ?? null;
}

function runTrigger(runId: string): string {
  const row = getDb()
    .select({ trigger: agentRuns.trigger })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get();
  return row?.trigger ?? "manual";
}

function agentPaths(agent: AgentConfig): string[] {
  const cwd = agent.cwd ?? getWorkspaceRoot();
  return [path.resolve(cwd), ...agent.writeAllowlist.map((p) => path.resolve(p))];
}

function overlapsActive(paths: string[]): boolean {
  const s = state();
  for (const act of s.active.values()) {
    for (const a of act.paths) {
      for (const b of paths) {
        if (a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep)) return true;
      }
    }
  }
  return false;
}

/** Rolling-5h usage proxy vs the configured buffer percentage. */
function usageBufferReached(): boolean {
  const pct = numSetting("agents_usage_buffer_pct", 80) / 100;
  const fiveHAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const row = getDb()
    .select({
      cost: sql<number>`COALESCE(SUM(${agentRuns.costUsd}), 0)`,
    })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, fiveHAgo))
    .get();
  const dailyBudget = numSetting("agents_daily_cost_budget_usd", 10);
  return (row?.cost ?? 0) >= dailyBudget * pct;
}

// ── Skills injection ──────────────────────────────────────────────────────
function skillsBlock(skillIds: string[]): string {
  if (skillIds.length === 0) return "";
  const rows = getDb()
    .select({ name: skills.name, instructions: skills.instructions })
    .from(skills)
    .where(inArray(skills.id, skillIds))
    .all();
  if (rows.length === 0) return "";
  return (
    "\n\n## Assigned skills\n" + rows.map((r) => `### ${r.name}\n${r.instructions}`).join("\n\n")
  );
}

// ── MCP servers (matrix agent tools + per-agent servers) ──────────────────
function buildMcpServers(
  agent: AgentConfig,
  matrixServer: unknown
): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {
    "matrix-agent": matrixServer as McpServerConfig,
  };
  for (const s of agent.mcpServers) {
    if (!s.name) continue;
    if (s.url) {
      servers[s.name] = { type: "http", url: s.url };
    } else if (s.command) {
      servers[s.name] = { type: "stdio", command: s.command, args: s.args ?? [] };
    }
  }
  return servers;
}

// ── Environment scrubbing (subscription auth must not see a proxy key) ────
function scrubbedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k === "ANTHROPIC_API_KEY" || k === "ANTHROPIC_AUTH_TOKEN" || k === "ANTHROPIC_BASE_URL")
      continue;
    env[k] = v;
  }
  return env;
}

// ── Core execution ────────────────────────────────────────────────────────
async function executeRun(
  runId: string,
  agent: AgentConfig,
  abort: AbortController
): Promise<void> {
  const startedAt = new Date().toISOString();
  getDb()
    .update(agentRuns)
    .set({ status: "running", startedAt })
    .where(eq(agentRuns.id, runId))
    .run();

  const blocks: Block[] = [];
  const idMap = new Map<string, number>();
  let lastFlush = 0;

  const emit = (ev: StreamEvent) => {
    appendEvent(blocks, idMap, ev);
    publishRunEvent(runId, ev);
    const now = Date.now();
    if (now - lastFlush >= 1000) {
      lastFlush = now;
      flushBlocks(runId, blocks);
    }
  };

  // Per-run limits.
  const timeoutMs = agent.timeoutMs ?? numSetting("agents_run_timeout_min", 30) * 60_000;
  const maxTurns = agent.maxTurns ?? Math.floor(numSetting("agents_default_max_turns", 30));
  const perRunCost = agent.perRunCostUsd ?? numSetting("agents_daily_cost_budget_usd", 10);
  const perRunTokens = agent.perRunTokens ?? numSetting("agents_daily_token_budget", 2_000_000);

  const active = state().active.get(runId);
  const dryRun = runDryRun(runId);
  const chainDepth = runChainDepth(runId);

  const timer = setTimeout(() => {
    if (active) active.reason = "timeout";
    abort.abort();
  }, timeoutMs);

  let usdCost = 0;
  let inTok = 0;
  let outTok = 0;
  let numTurns = 0;
  let resultText = "";
  let errorText: string | null = null;
  let sdkSessionId: string | null = null;

  // Policy-gated permission callback.
  const canUseTool: CanUseTool = async (toolName, input): Promise<PermissionResult> => {
    const verdict = evaluatePolicy({
      toolName,
      input,
      writeAllowlist: agent.writeAllowlist,
      learnedRules: agent.learnedRules,
      maxChainDepth: agent.maxChainDepth,
      dryRun,
      chainDepth,
      selfPaths: selfPaths(),
      dbPaths: dbPaths(),
      extraDenylist: extraDenylist(),
      maxChainDepthDefault: Math.floor(numSetting("agents_max_chain_depth", 3)),
    });

    let decisionResult: PermissionResult;
    switch (verdict.decision) {
      case "auto_allow":
        decisionResult = { behavior: "allow", updatedInput: input };
        break;
      case "redact":
        if (verdict.secretPath) logSecretRead(runId, agent.id, verdict.secretPath, toolName);
        decisionResult = { behavior: "allow", updatedInput: input };
        break;
      case "simulate":
        emit({ type: "notice", value: `Dry run — would run ${toolName}: ${verdict.reason}` });
        return { behavior: "deny", message: `Dry run: ${toolName} was simulated, not executed.` };
      case "hard_deny":
        return { behavior: "deny", message: `Denied (no override): ${verdict.reason}` };
      case "queue":
      case "break_glass":
        decisionResult = await requestApprovalDecision({
          runId,
          agent,
          toolName,
          input,
          verdict,
          emit,
          justification: lastTextBlock(blocks),
        });
        break;
      default:
        return { behavior: "deny", message: "Unclassified action denied." };
    }

    // Before a write is actually allowed, ensure it's on a run branch (clean repo)
    // or before-copied (dirty repo / non-repo) so the run stays reversible.
    if (decisionResult.behavior === "allow" && !dryRun) {
      const tp = writeTargetPath(toolName, input);
      if (tp) {
        try {
          const { prepareWrite } = await import("./agent-git");
          prepareWrite(runId, agent, tp);
        } catch {
          /* snapshotting is best-effort */
        }
      }
    }
    return decisionResult;
  };

  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const { buildAgentToolServer } = await import("@/lib/ai/agent-tools");
    const matrixServer = await buildAgentToolServer({ runId, agent, chainDepth });

    // Subagents multiply memory + token use; force off on low-RAM hosts.
    const lowMem = os.totalmem() < 1.5 * 1024 * 1024 * 1024;
    const allowSubagents = agent.allowSubagents && !lowMem;

    const mcpServers = buildMcpServers(agent, matrixServer);

    const iterator = query({
      prompt: runPrompt(runId) || agent.instructions,
      options: {
        cwd: agent.cwd ?? getWorkspaceRoot(),
        model: agent.model ?? undefined,
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: agent.instructions + skillsBlock(agent.skillIds),
        },
        maxTurns,
        permissionMode: "default",
        canUseTool,
        abortController: abort,
        settingSources: [],
        env: scrubbedEnv(),
        includePartialMessages: false,
        mcpServers,
        ...(allowSubagents ? {} : { disallowedTools: ["Task"] }),
      },
    });

    for await (const msg of iterator as AsyncIterable<SDKMessage>) {
      mapMessage(msg, emit, {
        onSession: (id) => (sdkSessionId = id),
      });
      if (msg.type === "result") {
        numTurns = msg.num_turns;
        resultText = msg.subtype === "success" ? msg.result : "";
        usdCost = msg.total_cost_usd ?? usdCost;
        inTok = msg.usage?.input_tokens ?? inTok;
        outTok = msg.usage?.output_tokens ?? outTok;
        if (msg.subtype !== "success") errorText = `Run ended: ${msg.subtype}`;
      } else if (msg.type === "assistant") {
        const u = msg.message?.usage;
        if (u) {
          inTok = u.input_tokens ?? inTok;
          outTok = u.output_tokens ?? outTok;
        }
      }

      // Budget enforcement mid-run.
      if (usdCost >= perRunCost || inTok + outTok >= perRunTokens) {
        if (active) active.reason = "budget";
        abort.abort();
        break;
      }
    }
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }

  // Resolve terminal status.
  const reason = active?.reason;
  let status: RunStatus = "succeeded";
  if (reason === "cancel") status = "cancelled";
  else if (reason === "kill") status = "interrupted";
  else if (reason === "timeout") status = "timeout";
  else if (reason === "budget") status = "failed";
  else if (errorText) status = "failed";

  // Git finalize: verify → commit → push (may downgrade success to needs_review).
  try {
    const { finalizeRun, recordGitOutcome } = await import("./agent-git");
    const gitResult = await finalizeRun(runId, agent, status, resultText.slice(0, 500));
    status = gitResult.status;
    recordGitOutcome(runId, gitResult);
  } catch (err) {
    console.error("[agent-runner] git finalize failed:", err);
  }

  // Record the before-copy snapshot dir if any non-repo writes occurred.
  let snapshotDir: string | null = null;
  try {
    const snaps = await import("./agent-snapshots");
    if (snaps.hasSnapshots(runId)) snapshotDir = snaps.snapshotDirFor(runId);
  } catch {
    /* ignore */
  }

  flushBlocks(runId, blocks);
  getDb()
    .update(agentRuns)
    .set({
      status,
      result: resultText.slice(0, 8000) || null,
      error: errorText,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: usdCost,
      numTurns,
      sdkSessionId,
      snapshotDir,
      endedAt: new Date().toISOString(),
    })
    .where(eq(agentRuns.id, runId))
    .run();

  // Success/failure streak bookkeeping.
  applyFailureStreak(agent.id, status);
  await notifyCompletion(runId, agent, status, resultText).catch(() => {});
  await onRunComplete(runId, agent, status).catch(() => {});
}

async function notifyCompletion(
  runId: string,
  agent: AgentConfig,
  status: RunStatus,
  resultText: string
): Promise<void> {
  const { notifyAgentEvent } = await import("./agent-notify");
  if (status === "succeeded") {
    await notifyAgentEvent("agent.run.completed", {
      agentId: agent.id,
      runId,
      body: resultText.slice(0, 240),
    });
  } else if (status === "needs_review") {
    await notifyAgentEvent("agent.run.needs_review", { agentId: agent.id, runId });
  } else if (status === "failed" || status === "timeout") {
    await notifyAgentEvent("agent.run.failed", { agentId: agent.id, runId });
  }
}

// Placeholder hooks the later phases fill in (approval wait, deliverables,
// failure auto-disable). Defined here so executeRun is complete on its own.
async function requestApprovalDecision(args: {
  runId: string;
  agent: AgentConfig;
  toolName: string;
  input: Record<string, unknown>;
  verdict: { decision: string; reason: string };
  emit: (ev: StreamEvent) => void;
  justification?: string;
}): Promise<PermissionResult> {
  const { awaitApproval } = await import("./agent-approvals");
  return awaitApproval(args);
}

function lastTextBlock(blocks: Block[]): string | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === "text" && b.text.trim()) return b.text.slice(0, 1000);
  }
  return undefined;
}

const WRITE_TOOL_NAMES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Absolute target path for a write tool (null for non-write tools). */
function writeTargetPath(toolName: string, input: Record<string, unknown>): string | null {
  if (!WRITE_TOOL_NAMES.has(toolName)) return null;
  const raw = (input.file_path ?? input.notebook_path ?? input.path) as string | undefined;
  if (typeof raw !== "string" || !raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function applyFailureStreak(agentId: string, status: RunStatus): void {
  const success = status === "succeeded" || status === "needs_review";
  if (success) {
    getDb().update(agents).set({ consecutiveFailures: 0 }).where(eq(agents.id, agentId)).run();
    return;
  }
  if (status !== "failed" && status !== "timeout") return;
  const row = getDb()
    .select({ n: agents.consecutiveFailures })
    .from(agents)
    .where(eq(agents.id, agentId))
    .get();
  const next = (row?.n ?? 0) + 1;
  const threshold = Math.floor(numSetting("agents_failure_disable_threshold", 3));
  const disable = next >= threshold;
  getDb()
    .update(agents)
    .set({ consecutiveFailures: next, ...(disable ? { scheduleEnabled: false } : {}) })
    .where(eq(agents.id, agentId))
    .run();
  if (disable) {
    void notifyScheduleDisabled(agentId).catch(() => {});
  }
}

async function notifyScheduleDisabled(agentId: string): Promise<void> {
  const mod = (await import("./agent-notify").catch(() => null)) as {
    notifyAgentEvent?: (kind: string, payload: unknown) => Promise<void>;
  } | null;
  await mod?.notifyAgentEvent?.("agent.schedule.disabled", { agentId });
}

async function onRunComplete(runId: string, agent: AgentConfig, status: RunStatus): Promise<void> {
  const mod = (await import("./agent-deliver").catch(() => null)) as {
    deliverRunResult?: (runId: string, agent: AgentConfig, status: RunStatus) => Promise<void>;
  } | null;
  await mod?.deliverRunResult?.(runId, agent, status);
}

// ── Message → StreamEvent mapping ─────────────────────────────────────────
interface MapHandlers {
  onSession: (sessionId: string) => void;
}

function mapMessage(msg: SDKMessage, emit: (ev: StreamEvent) => void, h: MapHandlers): void {
  if (msg.type === "system" && msg.subtype === "init") {
    h.onSession(msg.session_id);
    return;
  }
  if (msg.type === "assistant") {
    const content = (msg.message?.content ?? []) as unknown as Array<Record<string, unknown>>;
    for (const block of content) {
      const t = block.type as string;
      if (t === "text" && typeof block.text === "string") {
        emit({ type: "text", value: block.text });
      } else if (t === "thinking" && typeof block.thinking === "string") {
        emit({ type: "reasoning", value: block.thinking });
      } else if (t === "tool_use") {
        emit({
          type: "tool_call",
          id: String(block.id ?? randomUUID()),
          name: String(block.name ?? "tool"),
          args: block.input,
        });
      }
    }
    return;
  }
  if (msg.type === "user") {
    const content = (msg.message?.content ?? []) as unknown as Array<Record<string, unknown>>;
    for (const block of content) {
      if (block.type === "tool_result") {
        const isError = block.is_error === true;
        emit({
          type: "tool_result",
          id: String(block.tool_use_id ?? ""),
          result: isError ? undefined : redactResult(block.content),
          error: isError ? String(block.content ?? "error") : undefined,
        });
      }
    }
    return;
  }
}

// ── Small DB helpers ──────────────────────────────────────────────────────
function flushBlocks(runId: string, blocks: Block[]): void {
  try {
    getDb()
      .update(agentRuns)
      .set({ blocks: serializeBlocksForStorage(blocks) })
      .where(eq(agentRuns.id, runId))
      .run();
  } catch {
    /* transient; next flush retries */
  }
}

function logSecretRead(runId: string, agentId: string, secretPath: string, toolName: string): void {
  try {
    getDb()
      .insert(agentSecretReads)
      .values({
        id: randomUUID(),
        runId,
        agentId,
        path: secretPath,
        toolName,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch {
    /* audit is best-effort */
  }
}

function runPrompt(runId: string): string {
  const row = getDb()
    .select({ prompt: agentRuns.prompt })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get();
  return row?.prompt ?? "";
}

function runDryRun(runId: string): boolean {
  const row = getDb()
    .select({ dryRun: agentRuns.dryRun })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get();
  return !!row?.dryRun;
}

function runChainDepth(runId: string): number {
  const row = getDb()
    .select({ chainDepth: agentRuns.chainDepth })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get();
  return row?.chainDepth ?? 0;
}

/** Exported for the agent detail/list views. */
export function isRunActive(runId: string): boolean {
  return state().active.has(runId);
}
