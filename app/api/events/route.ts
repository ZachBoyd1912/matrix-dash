import { randomUUID } from "crypto";
import { and, asc, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { events, calendars } from "@/lib/db/schema";
import type { CalendarEvent } from "@/types/jarvis";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

function toEvent(row: typeof events.$inferSelect): CalendarEvent {
  return { ...row, allDay: !!row.allDay };
}

const createSchema = z.object({
  calendarId: z.string().max(200).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(50000).optional(),
  location: z.string().max(500).optional(),
  startsAt: z.string().max(200),
  endsAt: z.string().max(200),
  allDay: z.boolean().optional(),
});

export const GET = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const db = getDb();
  const rows =
    from && to
      ? db
          .select()
          .from(events)
          .where(and(gte(events.startsAt, from), lte(events.startsAt, to)))
          .orderBy(asc(events.startsAt))
          .all()
      : db.select().from(events).orderBy(asc(events.startsAt)).all();
  return Response.json(rows.map(toEvent));
});

export const POST = withUser(async (req: Request) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = getDb();
  let calId = parsed.data.calendarId;
  if (!calId) {
    const cal = db.select().from(calendars).get();
    if (!cal) {
      const id = randomUUID();
      db.insert(calendars)
        .values({ id, name: "Personal", createdAt: new Date().toISOString() })
        .run();
      calId = id;
    } else {
      calId = cal.id;
    }
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(events)
    .values({
      id,
      calendarId: calId,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      location: parsed.data.location ?? "",
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      allDay: parsed.data.allDay ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return Response.json({ id });
});
