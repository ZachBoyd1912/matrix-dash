import { randomUUID } from "crypto";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { pipelineItems } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(7).max(25),
  email: z.string().email().max(200),
  message: z.string().min(20).max(4000),
  meeting: z.enum(["in-person", "zoom"]),
});

export async function POST(req: Request) {
  const token = process.env.MATRIX_INGEST_TOKEN;
  if (!token) return Response.json({ error: "not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const id = randomUUID();
  // No withUser/runWithUser wrapper on purpose: with no ALS context, resolveDbPath()
  // (lib/db/client.ts:515) falls through to the primary matrix.db — the same mechanic
  // /api/hooks/* relies on. Wrapping would add plumbing for no behavioural gain.
  getDb()
    .insert(pipelineItems)
    .values({
      id,
      // `kind: "enquiry"` is what briefing.ts counts in its lead tally
      // (`kind === "lead" || kind === "enquiry"`), which is what drives the
      // "N leads" line on the dashboard's Path-to-first-sale card.
      kind: "enquiry",
      status: "open",
      source: "contact-form",
      title: `${d.name} — ${d.meeting === "zoom" ? "Zoom" : "In person"}`,
      notes: `${d.email} · ${d.phone}\n\n${d.message}`,
      createdAt: new Date().toISOString(),
    })
    .run();

  return Response.json({ ok: true, id });
}
