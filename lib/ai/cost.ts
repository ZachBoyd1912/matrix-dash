import { getSqlite } from "@/lib/db/client";
import { estimateCost } from "./pricing";

interface UsageRow {
  provider_kind: string | null;
  model_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface CostBreakdown {
  /** Sum of every tracked message's input tokens — includes re-sent prior-turn
   *  context, since that's genuinely what each request billed. Not deduped. */
  inputTokens: number;
  outputTokens: number;
  /** null when no row in this breakdown could be priced (unknown provider kind);
   *  0 when there's simply nothing tracked yet. Never a guess. */
  cost: number | null;
  /** How many assistant turns had usage recorded (older rows predate tracking). */
  messageCount: number;
}

function summarize(rows: UsageRow[]): CostBreakdown {
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let hasCost = false;
  let messageCount = 0;

  for (const r of rows) {
    if (r.input_tokens == null && r.output_tokens == null) continue;
    messageCount++;
    inputTokens += r.input_tokens ?? 0;
    outputTokens += r.output_tokens ?? 0;
    const rowCost = estimateCost(r.provider_kind, r.model_name, r.input_tokens, r.output_tokens);
    if (rowCost != null) {
      cost += rowCost;
      hasCost = true;
    }
  }
  return {
    inputTokens,
    outputTokens,
    cost: messageCount === 0 ? 0 : hasCost ? cost : null,
    messageCount,
  };
}

function assistantUsageRows(where: string, params: unknown[] = []): UsageRow[] {
  return getSqlite()
    .prepare(
      `SELECT provider_kind, model_name, input_tokens, output_tokens
       FROM session_messages
       WHERE role = 'assistant' ${where}`
    )
    .all(...params) as UsageRow[];
}

export function getLifetimeCost(): CostBreakdown & {
  byProvider: (CostBreakdown & { providerKind: string })[];
} {
  const rows = assistantUsageRows("");
  const byKind = new Map<string, UsageRow[]>();
  for (const r of rows) {
    const key = r.provider_kind ?? "unknown";
    let bucket = byKind.get(key);
    if (!bucket) {
      bucket = [];
      byKind.set(key, bucket);
    }
    bucket.push(r);
  }
  const byProvider = Array.from(byKind.entries())
    .map(([providerKind, rs]) => ({ providerKind, ...summarize(rs) }))
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  return { ...summarize(rows), byProvider };
}

export function getCostSince(isoStart: string): CostBreakdown {
  return summarize(assistantUsageRows("AND created_at >= ?", [isoStart]));
}

export function getSessionCost(sessionId: string): CostBreakdown {
  return summarize(assistantUsageRows("AND session_id = ?", [sessionId]));
}

export interface TopSession extends CostBreakdown {
  sessionId: string;
  sessionName: string;
}

export function getTopSessions(limit = 10): TopSession[] {
  const rows = getSqlite()
    .prepare(
      `SELECT sm.session_id as session_id, s.name as session_name, sm.provider_kind,
              sm.model_name, sm.input_tokens, sm.output_tokens
       FROM session_messages sm
       JOIN sessions s ON s.id = sm.session_id
       WHERE sm.role = 'assistant'`
    )
    .all() as (UsageRow & { session_id: string; session_name: string })[];

  const bySession = new Map<string, { name: string; rows: UsageRow[] }>();
  for (const r of rows) {
    let bucket = bySession.get(r.session_id);
    if (!bucket) {
      bucket = { name: r.session_name, rows: [] };
      bySession.set(r.session_id, bucket);
    }
    bucket.rows.push(r);
  }

  return Array.from(bySession.entries())
    .map(([sessionId, { name, rows: rs }]) => ({ sessionId, sessionName: name, ...summarize(rs) }))
    .filter((r) => r.messageCount > 0)
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
    .slice(0, limit);
}
