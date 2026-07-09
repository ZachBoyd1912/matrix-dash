import { resolveSttEndpoint } from "@/lib/ai/voice-provider";
import { getSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Whisper speech-to-text. Accepts an audio blob (multipart form field `audio`),
 * forwards it to an OpenAI-compatible /audio/transcriptions endpoint, and returns
 * { text }. The audio is never persisted — transcribed and discarded.
 */
export async function POST(req: Request) {
  if (getSetting("voice_enabled") !== "1") {
    return Response.json({ error: "Voice is disabled" }, { status: 403 });
  }
  const endpoint = resolveSttEndpoint();
  if (!endpoint) {
    return Response.json({ error: "No STT provider configured", fallback: true }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json({ error: "Missing `audio` blob" }, { status: 400 });
  }

  const model = endpoint.kind === "groq" ? "whisper-large-v3" : "whisper-1";
  const upstream = new FormData();
  upstream.append("file", audio, "speech.webm");
  upstream.append("model", model);
  upstream.append("response_format", "json");

  try {
    const res = await fetch(`${endpoint.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${endpoint.apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        { error: "Transcription failed", detail: detail.slice(0, 500), fallback: true },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { text?: string };
    return Response.json({ text: (data.text ?? "").trim() });
  } catch {
    return Response.json({ error: "STT provider unreachable", fallback: true }, { status: 502 });
  }
}
