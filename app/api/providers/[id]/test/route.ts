import { generateText } from "ai";
import { getProvider, resolveModel } from "@/lib/ai/registry";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const provider = getProvider(id);
  if (!provider) return Response.json({ ok: false, error: "Provider not found" }, { status: 404 });

  try {
    const model = resolveModel(provider);
    const { text } = await generateText({
      model,
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 16,
      abortSignal: AbortSignal.timeout(15_000),
    });
    return Response.json({ ok: true, message: text.trim().slice(0, 100) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message.slice(0, 300) });
  }
}
