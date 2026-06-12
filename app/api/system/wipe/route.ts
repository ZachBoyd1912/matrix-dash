import { z } from "zod";
import { getSqlite } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const schema = z.object({
  confirm: z.literal("WIPE"),
  scope: z.enum(["memories", "notes", "sessions", "files", "all"]).default("all"),
});

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Send { confirm: 'WIPE', scope: 'all'|'memories'|'notes'|'sessions'|'files' }" },
      { status: 400 }
    );
  }
  const db = getSqlite();
  const t = db.transaction(() => {
    if (parsed.data.scope === "memories" || parsed.data.scope === "all") {
      db.prepare("DELETE FROM memory_links").run();
      db.prepare("DELETE FROM memories").run();
    }
    if (parsed.data.scope === "notes" || parsed.data.scope === "all") {
      db.prepare("DELETE FROM note_links").run();
      db.prepare("DELETE FROM notes").run();
    }
    if (parsed.data.scope === "sessions" || parsed.data.scope === "all") {
      db.prepare("DELETE FROM session_messages").run();
      db.prepare("DELETE FROM sessions").run();
    }
    if (parsed.data.scope === "files" || parsed.data.scope === "all") {
      db.prepare("DELETE FROM files").run();
    }
  });
  t();
  return Response.json({ ok: true, scope: parsed.data.scope });
}
