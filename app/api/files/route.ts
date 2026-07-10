import { randomUUID } from "crypto";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { files } from "@/lib/db/schema";
import { languageFromPath } from "@/lib/utils/language";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(500),
  path: z.string().min(1).max(500),
  content: z.string().max(100000).optional(),
  language: z.string().max(200).optional(),
  sessionId: z.string().max(200).nullable().optional(),
});

export const GET = withUser(async () => {
  // Strip content for the list endpoint — IDE pulls full content per file.
  const rows = getDb()
    .select({
      id: files.id,
      name: files.name,
      path: files.path,
      language: files.language,
      sessionId: files.sessionId,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
    })
    .from(files)
    .orderBy(asc(files.path))
    .all();
  return Response.json(rows);
});

export const POST = withUser(async (req: Request) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(files)
    .values({
      id,
      name: parsed.data.name,
      path: parsed.data.path,
      content: parsed.data.content ?? "",
      language: parsed.data.language || languageFromPath(parsed.data.path),
      sessionId: parsed.data.sessionId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return Response.json({ id });
});
