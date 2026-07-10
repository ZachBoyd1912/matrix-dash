import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { calendars } from "@/lib/db/schema";
import { syncCaldav } from "@/lib/services/calendar";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const POST = withUser(async (_req: Request, ctx: Ctx) => {
  // Trigger CalDAV sync.
  const { id } = await ctx.params;
  const cal = getDb().select().from(calendars).where(eq(calendars.id, id)).get();
  if (!cal) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const count = await syncCaldav(cal);
    return Response.json({ ok: true, imported: count });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
});

export const DELETE = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  getDb().delete(calendars).where(eq(calendars.id, id)).run();
  return Response.json({ ok: true });
});
