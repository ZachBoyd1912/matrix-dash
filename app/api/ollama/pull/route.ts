import { pullOllamaModel } from "@/lib/services/ollama";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: Request) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name) return Response.json({ error: "name required" }, { status: 400 });

  const upstream = await pullOllamaModel(body.name);
  if (!upstream.body) return Response.json({ error: "no stream" }, { status: 500 });

  return new Response(upstream.body, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache" },
  });
}
