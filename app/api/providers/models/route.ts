import { z } from "zod";
import { listModels } from "@/lib/ai/models";
import { LOCAL_API_KEY } from "@/types/ai-provider";

export const dynamic = "force-dynamic";

const schema = z.object({
  provider: z.string().min(1),
  // Optional: local providers list models from an unauthenticated local endpoint.
  apiKey: z.string().optional(),
  baseUrl: z.string().nullable().optional(),
});

/**
 * List models for an *unsaved* provider (the Add-provider form), where no record
 * exists yet. The raw key arrives in the body and is used in-memory only — never
 * persisted, and `withLog`-style logging records method/path/status, not bodies.
 */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ models: [], error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ models: [], error: "provider is required" }, { status: 400 });
  }
  const result = await listModels({
    kind: parsed.data.provider,
    apiKey: parsed.data.apiKey?.trim() || LOCAL_API_KEY,
    baseUrl: parsed.data.baseUrl ?? null,
  });
  return Response.json(result);
}
