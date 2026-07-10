import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { sessionMessages } from "@/lib/db/schema";
import { getAgent } from "@/lib/db/agents";
import { startRun } from "@/lib/services/agent-runner";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  agentId: z.string().min(1),
  instructions: z.string().max(20000).optional(),
});

/**
 * Escalate a chat conversation into a background agent run: builds a prompt from
 * the recent session transcript plus the user's extra instructions, and links the
 * run back to the session (source_session_id) so its result can post back.
 */
export const POST = withUser(async (req: Request) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const { sessionId, agentId, instructions } = parsed.data;

  const agent = getAgent(agentId);
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const msgs = getDb()
    .select({ role: sessionMessages.role, content: sessionMessages.content })
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, sessionId))
    .orderBy(asc(sessionMessages.createdAt))
    .all();

  // Keep the last ~20 turns as context; heavier summarization can be added later.
  const recent = msgs.slice(-20);
  const transcript = recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n")
    .slice(0, 16000);

  const prompt =
    `You are taking over a task from a chat conversation. Context follows.\n\n` +
    `--- Conversation ---\n${transcript}\n--- End conversation ---\n\n` +
    (instructions
      ? `Your specific task: ${instructions}\n`
      : "Continue the task the conversation was working toward.\n");

  const runId = startRun(agentId, { trigger: "chat", prompt, sourceSessionId: sessionId });
  return Response.json({ runId });
});
