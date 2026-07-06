import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { aiProviders, images } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const generateSchema = z.object({
  prompt: z.string().min(1),
  providerId: z.string().optional(),
  model: z.string().optional(),
  size: z.string().optional(),
});

export async function GET() {
  return Response.json(
    getDb().select().from(images).orderBy(desc(images.createdAt)).limit(60).all()
  );
}

/** Generate via OpenAI Images API (works with OpenAI + OpenAI-compatible providers). */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = generateSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = getDb();
  let provider = parsed.data.providerId
    ? db.select().from(aiProviders).where(eq(aiProviders.id, parsed.data.providerId)).get()
    : undefined;
  if (!provider) {
    provider =
      db.select().from(aiProviders).where(eq(aiProviders.provider, "openai")).get() ??
      db.select().from(aiProviders).where(eq(aiProviders.provider, "custom")).get();
  }
  if (!provider) {
    return Response.json({ error: "No OpenAI-compatible provider configured." }, { status: 404 });
  }

  const baseURL = (provider.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = decrypt(provider.apiKeyEncrypted);
  const res = await fetch(`${baseURL}/images/generations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: parsed.data.model || "gpt-image-1",
      prompt: parsed.data.prompt,
      size: parsed.data.size || "1024x1024",
      response_format: "b64_json",
      n: 1,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: err.slice(0, 400) }, { status: res.status });
  }
  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = data.data?.[0];
  if (!item) return Response.json({ error: "No image returned" }, { status: 500 });

  let dataUrl = "";
  if (item.b64_json) dataUrl = `data:image/png;base64,${item.b64_json}`;
  else if (item.url) {
    const fetched = await fetch(item.url);
    const buf = Buffer.from(await fetched.arrayBuffer());
    dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  }

  const id = randomUUID();
  db.insert(images)
    .values({
      id,
      prompt: parsed.data.prompt,
      dataUrl,
      provider: provider.name,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Response.json({ id, dataUrl });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(images).where(eq(images.id, id)).run();
  return Response.json({ ok: true });
}
