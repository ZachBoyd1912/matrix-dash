import { randomUUID } from "crypto";
import { generateText, type ModelMessage } from "ai";
import { getDb } from "@/lib/db/client";
import { memories, memoryLinks } from "@/lib/db/schema";
import { searchMemoriesFts } from "@/lib/db/fts";
import { getActiveProvider, resolveModel } from "./registry";
import { getAppSettings } from "@/lib/db/settings";
import { MEMORY_TYPES, type MemoryType } from "@/types/memory";

interface ExtractedMemory {
  content: string;
  type: MemoryType;
  tags: string[];
  importance: number;
}

const EXTRACTION_PROMPT = `You are a memory extractor for an AI command center.
Given this conversation, extract any NEW factual information worth remembering for future conversations.

For each fact, output a JSON object with these fields:
- "content": one concise sentence
- "type": one of "identity" | "project" | "global" | "lesson"
- "tags": array of 1-4 lowercase keywords
- "importance": 0.0-1.0

Rules:
- ONLY extract NEW information. Don't restate things the AI already knew.
- Be concise — one sentence per memory.
- identity: user preferences, name, role, habits, goals
- project: tech stack, architecture, decisions, file paths
- global: API patterns, documentation, general knowledge worth keeping
- lesson: errors, debugging notes, "don't do X again", surprising gotchas
- If nothing is worth remembering, return [].

Respond with ONLY a JSON array. No prose. No markdown fences.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip code fences if the model wrapped them anyway.
  const cleaned = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // Find first '[' and last ']' to be tolerant of preamble/postamble.
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
}

function isExtractedMemory(value: unknown): value is ExtractedMemory {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.content === "string" &&
    v.content.trim().length > 0 &&
    typeof v.type === "string" &&
    MEMORY_TYPES.includes(v.type as MemoryType)
  );
}

/**
 * Background memory extraction. Never throws — failures are swallowed so
 * the chat response surface stays unaffected.
 */
export async function extractMemories(messages: ModelMessage[]): Promise<void> {
  const settings = getAppSettings();
  if (!settings.autoExtract) return;

  const provider = getActiveProvider();
  if (!provider) return;

  // Only need the last few turns for context.
  const recent = messages.slice(-4);
  const conversation = recent
    .map(
      (m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`
    )
    .join("\n");

  if (conversation.trim().length === 0) return;

  let text = "";
  try {
    const result = await generateText({
      model: resolveModel(provider),
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: `Conversation:\n${conversation}` },
      ],
    });
    text = result.text;
  } catch (err) {
    console.error("[extraction] generateText failed:", err);
    return;
  }

  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) return;

  const db = getDb();
  const now = new Date().toISOString();

  for (const raw of parsed) {
    if (!isExtractedMemory(raw)) continue;
    const item = raw;
    const importance = Math.max(0, Math.min(1, Number(item.importance) || 0.5));
    const tags = (Array.isArray(item.tags) ? item.tags : [])
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toLowerCase().trim())
      .filter(Boolean)
      .join(",");

    const id = randomUUID();
    try {
      db.insert(memories)
        .values({
          id,
          content: item.content.trim(),
          type: item.type,
          tags,
          importance,
          source: "extraction",
          createdAt: now,
        })
        .run();
      autoLink(id, item.content);
    } catch (err) {
      console.error("[extraction] insert failed:", err);
    }
  }
}

/** Auto-link a freshly inserted memory to similar existing ones via FTS5. */
export function autoLink(memoryId: string, content: string): void {
  const candidates = searchMemoriesFts(content, 5).filter((c) => c.id !== memoryId);
  if (candidates.length === 0) return;

  // FTS rank is negative; smaller (more negative) = closer match.
  const ranks = candidates.map((c) => Math.abs(c.rank));
  const maxRank = Math.max(...ranks, 1);

  const db = getDb();
  const now = new Date().toISOString();

  for (const cand of candidates) {
    const strength = Math.min(1, Math.abs(cand.rank) / maxRank);
    if (strength < 0.3) continue;
    try {
      db.insert(memoryLinks)
        .values({
          id: randomUUID(),
          sourceMemoryId: memoryId,
          targetMemoryId: cand.id,
          strength,
          createdAt: now,
        })
        .run();
    } catch {
      /* duplicate or constraint — fine */
    }
  }
}
