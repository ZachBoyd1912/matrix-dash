import type { ModelMessage } from "ai";
import { getProvider, getActiveProvider } from "@/lib/ai/registry";
import { summarizeOlderMessages } from "@/lib/ai/summarizer";

export const dynamic = "force-dynamic";

interface CompactPayload {
  messages: ModelMessage[];
  providerId?: string;
  modelOverride?: string;
}

// Backs the `/compact` slash command: forces a summarization pass right now,
// rather than waiting for the chat route's own 70%-usage auto-trigger. A
// dedicated endpoint reusing the same summarizer is simpler than threading a
// "force" flag through the chat route's streaming cascade for an action that
// doesn't need a model reply of its own.
export async function POST(req: Request) {
  let body: CompactPayload;
  try {
    body = (await req.json()) as CompactPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  const provider = body.providerId ? getProvider(body.providerId) : getActiveProvider();
  if (!provider) {
    return Response.json(
      { error: "No AI provider configured. Add one in Settings → Add Models." },
      { status: 404 }
    );
  }

  const result = await summarizeOlderMessages(body.messages, provider, body.modelOverride);
  if (!result) {
    return Response.json(
      { error: "Nothing to compact yet, or the summarization call failed." },
      { status: 422 }
    );
  }
  return Response.json(result);
}
