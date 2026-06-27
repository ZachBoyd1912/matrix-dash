import { z } from "zod";
import { webSearch } from "@/lib/services/web";
import { setSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

const testSchema = z.object({
  query: z.string().min(1),
  tavilyKey: z.string().optional(),
  searxngUrl: z.string().optional(),
});

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = testSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Save provided keys
  if (parsed.data.tavilyKey) {
    setSetting("tavilyKey", parsed.data.tavilyKey);
  }
  if (parsed.data.searxngUrl) {
    setSetting("searxngUrl", parsed.data.searxngUrl);
  }

  try {
    const results = await webSearch(parsed.data.query);
    return Response.json({ ok: true, results });
  } catch (e) {
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
