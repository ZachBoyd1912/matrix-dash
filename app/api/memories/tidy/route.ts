import { tidyMemories, decayMemories } from "@/lib/ai/consolidation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const decay = url.searchParams.get("decay") === "1";
  const tidy = tidyMemories();
  const decayResult = decay ? decayMemories() : null;
  return Response.json({ tidy, decay: decayResult });
}
