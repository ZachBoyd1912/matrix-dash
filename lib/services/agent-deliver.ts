import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns, sessionMessages, notes } from "@/lib/db/schema";
import type { AgentConfig, RunStatus } from "@/types/agents";

/**
 * Route a finished run's result to its configured deliverables:
 *  - postToChat: append the result as an assistant message in the originating session
 *  - fileNote:   file the result as a Note (Obsidian-synced by the existing watcher)
 *  - inDigest:   handled implicitly by the daily digest query — no action here
 */
export async function deliverRunResult(
  runId: string,
  agent: AgentConfig,
  status: RunStatus
): Promise<void> {
  if (status !== "succeeded" && status !== "needs_review") return;

  const run = getDb()
    .select({ result: agentRuns.result, sourceSessionId: agentRuns.sourceSessionId })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .get();
  const result = run?.result?.trim();
  if (!result) return;

  const now = new Date().toISOString();

  if (agent.deliverables.postToChat && run?.sourceSessionId) {
    try {
      getDb()
        .insert(sessionMessages)
        .values({
          id: randomUUID(),
          sessionId: run.sourceSessionId,
          role: "assistant",
          content: `**${agent.name}** finished:\n\n${result}`,
          createdAt: now,
        })
        .run();
    } catch {
      /* session may have been deleted */
    }
  }

  if (agent.deliverables.fileNote) {
    try {
      const day = now.slice(0, 10);
      getDb()
        .insert(notes)
        .values({
          id: randomUUID(),
          title: `${agent.name} — ${day}`,
          content: result,
          tags: "agent-report",
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } catch {
      /* best-effort */
    }
  }
}
