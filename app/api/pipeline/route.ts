import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { pipelineItems } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const VALID_KINDS = new Set(["blocker", "lead", "enquiry", "action"]);
const VALID_STATUSES = new Set(["open", "done", "dropped"]);

export const GET = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const status = url.searchParams.get("status");

  const conditions = [];
  if (kind && VALID_KINDS.has(kind)) conditions.push(eq(pipelineItems.kind, kind as "blocker"));
  if (status && VALID_STATUSES.has(status))
    conditions.push(eq(pipelineItems.status, status as "open"));

  const rows = getDb()
    .select()
    .from(pipelineItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(pipelineItems.createdAt))
    .all();

  return Response.json(rows);
});
