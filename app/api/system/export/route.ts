import { getDb } from "@/lib/db/client";
import {
  memories,
  memoryLinks,
  notes,
  noteLinks,
  sessions,
  sessionMessages,
  files,
  settings,
} from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

export const GET = withUser(async () => {
  const db = getDb();
  const data = {
    exportedAt: new Date().toISOString(),
    memories: db.select().from(memories).all(),
    memoryLinks: db.select().from(memoryLinks).all(),
    notes: db.select().from(notes).all(),
    noteLinks: db.select().from(noteLinks).all(),
    sessions: db.select().from(sessions).all(),
    sessionMessages: db.select().from(sessionMessages).all(),
    files: db.select().from(files).all(),
    settings: db.select().from(settings).all(),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="matrix-dash-${Date.now()}.json"`,
    },
  });
});
