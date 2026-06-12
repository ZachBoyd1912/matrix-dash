import { z } from "zod";
import { getOllamaConfig, setOllamaConfig } from "@/lib/services/ollama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(getOllamaConfig());
}

const Patch = z.object({
  numCtx: z.number().int().min(512).max(131072).optional(),
  numGpu: z.number().int().min(0).max(999).optional(),
  keepAlive: z.string().min(1).max(16).optional(),
  numThread: z.number().int().min(0).max(256).optional(),
});

export async function PATCH(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Patch.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid config" }, { status: 400 });
  }
  const config = setOllamaConfig(parsed.data);
  return Response.json({ config });
}
