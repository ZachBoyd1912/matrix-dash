import { z } from "zod";
import { resolveTtsEndpoint } from "@/lib/ai/voice-provider";
import { getSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  voice: z.string().max(40).optional(),
});

/**
 * OpenAI text-to-speech. Returns the synthesized audio (mp3) as the response body
 * so the client can play it back. Falls back (503) when no TTS provider exists.
 */
export async function POST(req: Request) {
  if (getSetting("voice_enabled") !== "1") {
    return Response.json({ error: "Voice is disabled" }, { status: 403 });
  }
  const endpoint = resolveTtsEndpoint();
  if (!endpoint) {
    return Response.json({ error: "No TTS provider configured", fallback: true }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const voice = parsed.data.voice || getSetting("voice_tts_voice") || "onyx";

  try {
    const res = await fetch(`${endpoint.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${endpoint.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: parsed.data.text,
        voice,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok || !res.body) {
      return Response.json({ error: "TTS failed", fallback: true }, { status: 502 });
    }
    return new Response(res.body, {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "TTS provider unreachable", fallback: true }, { status: 502 });
  }
}
