import { randomUUID } from "crypto";
import { DAVClient } from "tsdav";
import ICAL from "ical.js";
import { eq } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import { calendars, events } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";

type Cal = typeof calendars.$inferSelect;

/** Parse a VEVENT-bearing ICS string into normalized event rows. */
function parseIcs(ics: string): {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}[] {
  const out: ReturnType<typeof parseIcs> = [];
  try {
    const jcal = ICAL.parse(ics);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents("vevent");
    for (const ve of vevents) {
      const event = new ICAL.Event(ve);
      const start = event.startDate;
      const end = event.endDate ?? event.startDate;
      out.push({
        uid: event.uid || randomUUID(),
        title: event.summary || "(untitled)",
        description: event.description || "",
        location: event.location || "",
        startsAt: start.toJSDate().toISOString(),
        endsAt: end.toJSDate().toISOString(),
        allDay: start.isDate,
      });
    }
  } catch {
    /* ignore malformed ICS */
  }
  return out;
}

/** Pull events from a CalDAV-backed calendar into the local DB. */
export async function syncCaldav(cal: Cal): Promise<number> {
  if (!cal.caldavUrl || !cal.caldavUser || !cal.caldavPassEncrypted) {
    throw new Error("Calendar has no CalDAV credentials");
  }
  const client = new DAVClient({
    serverUrl: cal.caldavUrl,
    credentials: { username: cal.caldavUser, password: decrypt(cal.caldavPassEncrypted) },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  await client.login();
  const remoteCalendars = await client.fetchCalendars();
  const db = getDb();
  let imported = 0;

  for (const remote of remoteCalendars) {
    const objects = await client.fetchCalendarObjects({ calendar: remote });
    for (const obj of objects) {
      if (!obj.data) continue;
      for (const parsed of parseIcs(obj.data)) {
        const exists = getSqlite()
          .prepare("SELECT id FROM events WHERE uid = ? LIMIT 1")
          .get(parsed.uid) as { id: string } | undefined;
        const now = new Date().toISOString();
        if (exists) {
          db.update(events)
            .set({
              title: parsed.title,
              description: parsed.description,
              location: parsed.location,
              startsAt: parsed.startsAt,
              endsAt: parsed.endsAt,
              allDay: parsed.allDay,
              updatedAt: now,
            })
            .where(eq(events.id, exists.id))
            .run();
        } else {
          db.insert(events)
            .values({
              id: randomUUID(),
              calendarId: cal.id,
              uid: parsed.uid,
              title: parsed.title,
              description: parsed.description,
              location: parsed.location,
              startsAt: parsed.startsAt,
              endsAt: parsed.endsAt,
              allDay: parsed.allDay,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          imported++;
        }
      }
    }
  }
  return imported;
}

/** Export a calendar's events as an .ics string. */
export function exportIcs(calendarId: string): string {
  const rows = getDb().select().from(events).where(eq(events.calendarId, calendarId)).all();
  const cal = new ICAL.Component(["vcalendar", [], []]);
  cal.updatePropertyWithValue("prodid", "-//Matrix Dash//EN");
  cal.updatePropertyWithValue("version", "2.0");
  for (const row of rows) {
    const ve = new ICAL.Component("vevent");
    const event = new ICAL.Event(ve);
    event.uid = row.uid || row.id;
    event.summary = row.title;
    event.description = row.description;
    event.location = row.location;
    event.startDate = ICAL.Time.fromJSDate(new Date(row.startsAt), false);
    event.endDate = ICAL.Time.fromJSDate(new Date(row.endsAt), false);
    cal.addSubcomponent(ve);
  }
  return cal.toString();
}
