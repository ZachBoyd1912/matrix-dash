import { randomUUID } from "crypto";
import { generateText, stepCountIs } from "ai";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sessions, sessionMessages, presets, agentApprovals } from "@/lib/db/schema";
import { getActiveProvider, resolveModel } from "@/lib/ai/registry";
import { getSetting, setSetting } from "@/lib/db/settings";
import { buildVoiceTools } from "@/lib/ai/voice-tools";
import { settleApproval } from "@/lib/services/agent-approvals";

/**
 * Core Jarvis turn shared by the voice route and the Telegram bridge: spoken
 * approvals shortcut, canonical-session continuity, persona, and agent tools.
 */

const FALLBACK_PERSONA =
  "You are Jarvis, a spoken assistant. Reply conversationally and concisely — you are heard, not read. Avoid code blocks and long lists. Be confident and economical.";

const APPROVE_WORDS = /^\s*(approve|approve it|yes|yep|confirm|go ahead|do it)\s*$/i;
const DENY_WORDS = /^\s*(deny|no|nope|reject|cancel|don'?t)\s*$/i;
const OVERRIDE_PHRASE = /confirm override/i;

export interface JarvisResult {
  reply: string;
  sessionId: string | null;
}

export async function runJarvisTurn(
  text: string,
  opts: { ephemeral?: boolean } = {}
): Promise<JarvisResult> {
  const spoken = handleSpokenApproval(text);
  if (spoken) return { reply: spoken, sessionId: null };

  const provider = getActiveProvider();
  if (!provider) return { reply: "No AI provider is configured.", sessionId: null };
  const model = resolveModel(provider);

  const sessionId = opts.ephemeral ? null : ensureJarvisSession();
  const persona = jarvisPersona();

  const history = sessionId
    ? getDb()
        .select({ role: sessionMessages.role, content: sessionMessages.content })
        .from(sessionMessages)
        .where(eq(sessionMessages.sessionId, sessionId))
        .orderBy(asc(sessionMessages.createdAt))
        .all()
        .slice(-16)
    : [];

  if (sessionId) {
    getDb()
      .insert(sessionMessages)
      .values({
        id: randomUUID(),
        sessionId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const { text: reply } = await generateText({
    model,
    system: persona,
    messages: [
      ...history.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
      { role: "user" as const, content: text },
    ],
    tools: buildVoiceTools(),
    stopWhen: stepCountIs(6),
  });

  if (sessionId) {
    getDb()
      .insert(sessionMessages)
      .values({
        id: randomUUID(),
        sessionId,
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
      })
      .run();
    getDb()
      .update(sessions)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(sessions.id, sessionId))
      .run();
  }

  return { reply, sessionId };
}

export function ensureJarvisSession(): string {
  const existing = getSetting("voice_jarvis_session_id");
  if (existing) {
    const row = getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, existing))
      .get();
    if (row) return existing;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb().insert(sessions).values({ id, name: "Jarvis", createdAt: now, updatedAt: now }).run();
  setSetting("voice_jarvis_session_id", id);
  return id;
}

function jarvisPersona(): string {
  const presetId = getSetting("voice_jarvis_preset_id") || "preset-jarvis";
  const row = getDb()
    .select({ systemPrompt: presets.systemPrompt })
    .from(presets)
    .where(eq(presets.id, presetId))
    .get();
  return row?.systemPrompt?.trim() || FALLBACK_PERSONA;
}

/** Resolve a single pending approval by voice/text; null falls through to the model. */
function handleSpokenApproval(text: string): string | null {
  const pending = getDb()
    .select({ id: agentApprovals.id, tier: agentApprovals.tier, summary: agentApprovals.summary })
    .from(agentApprovals)
    .where(eq(agentApprovals.status, "pending"))
    .all();
  if (pending.length !== 1) return null;
  const approval = pending[0];

  if (DENY_WORDS.test(text)) {
    settleApproval(approval.id, "deny");
    return "Denied.";
  }
  if (approval.tier === "break_glass") {
    if (OVERRIDE_PHRASE.test(text)) {
      settleApproval(approval.id, "approve");
      return "Override confirmed and approved.";
    }
    if (APPROVE_WORDS.test(text)) {
      return `That's a break-glass action: ${approval.summary}. Say "confirm override" to approve.`;
    }
    return null;
  }
  if (APPROVE_WORDS.test(text)) {
    settleApproval(approval.id, "approve");
    return "Approved.";
  }
  return null;
}
