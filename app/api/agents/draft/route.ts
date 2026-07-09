import { generateText } from "ai";
import { z } from "zod";
import { getActiveProvider, resolveModel } from "@/lib/ai/registry";
import { shouldFoldSystemPrompt } from "@/types/ai-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  description: z.string().min(3).max(4000),
});

const DRAFT_SYSTEM = `You design autonomous agent configurations for a personal dashboard. Given a natural-language description, output ONLY a JSON object (no prose, no markdown fences) with these fields:
{
  "name": string,               // short, e.g. "Inbox Drafter"
  "description": string,        // one line
  "instructions": string,       // a clear system prompt telling the agent exactly what to do and what counts as urgent
  "mode": "triggered" | "standing_watch",
  "schedule": string | null,    // cron expression if it should run on a schedule, else null
  "writeAllowlist": string[]    // absolute path prefixes the agent may write to (empty if it only reads)
}
Prefer an empty writeAllowlist unless the task clearly requires writing files. Use a sensible cron only if the description implies a schedule.`;

/** Draft an agent config from a natural-language description for user review. */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const provider = getActiveProvider();
  if (!provider) return Response.json({ error: "No active AI provider" }, { status: 400 });

  const model = resolveModel(provider);
  // Some openai-compat endpoints (deepseek, openrouter…) reject a "system"/"developer"
  // role, so fold the instruction into the user turn for those (same as the chat route).
  const { text } = await generateText({
    model,
    ...(shouldFoldSystemPrompt(provider.provider)
      ? {
          messages: [
            { role: "user", content: `${DRAFT_SYSTEM}\n\n———\n\n${parsed.data.description}` },
          ],
        }
      : { system: DRAFT_SYSTEM, prompt: parsed.data.description }),
  });

  const draft = extractJson(text);
  if (!draft)
    return Response.json({ error: "Could not draft a valid config", raw: text }, { status: 502 });
  return Response.json({ draft });
}

/** Pull the first JSON object out of a model response, tolerant of stray prose/fences. */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
