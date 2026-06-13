import { getProvider } from "@/lib/ai/registry";
import { listModels } from "@/lib/ai/models";
import { decrypt } from "@/lib/utils/crypto";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** List the live models a saved provider's key grants. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const provider = getProvider(id);
  if (!provider) return Response.json({ models: [], error: "Provider not found" }, { status: 404 });

  const force = new URL(req.url).searchParams.get("force") === "1";
  const result = await listModels({
    kind: provider.provider,
    apiKey: decrypt(provider.apiKeyEncrypted),
    baseUrl: provider.baseUrl,
    force,
  });
  return Response.json(result);
}
