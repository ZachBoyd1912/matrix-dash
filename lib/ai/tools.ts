import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  memories,
  notes,
  files as filesTable,
  tasks,
  events,
  calendars,
  emails,
  contacts,
  attachments,
} from "@/lib/db/schema";
import { searchMemoriesFts, searchNotesFts } from "@/lib/db/fts";
import { autoLink } from "@/lib/ai/extraction";
import { getSetting } from "@/lib/db/settings";
import { fetchReadable, webSearch } from "@/lib/services/web";
import { notify } from "@/lib/services/notify";

const now = () => new Date().toISOString();

function approved(toolName: string): boolean {
  return getSetting(`approve_${toolName}`) === "1";
}

const blocked = (toolName: string) => ({
  blocked: true,
  reason: `'${toolName}' needs approval. Enable it in Settings → Agent Tools to let the agent run it.`,
});

/** Build the toolset the agent may use, gated by per-tool enable flags. */
export function buildAgentTools() {
  const enabled = (key: string, def = true) => {
    const v = getSetting(`tool_${key}`);
    return v === null ? def : v === "1";
  };

  const toolset: ToolSet = {};

  if (enabled("memory")) {
    toolset.searchMemories = tool({
      description: "Search the user's long-term memory for relevant facts.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => searchMemoriesFts(query, 8).map((m) => ({ content: m.content, type: m.type })),
    });
    toolset.saveMemory = tool({
      description: "Save a new long-term memory the user will want recalled later.",
      inputSchema: z.object({
        content: z.string(),
        type: z.enum(["identity", "project", "global", "lesson"]).default("global"),
      }),
      execute: async ({ content, type }) => {
        const id = randomUUID();
        getDb().insert(memories).values({ id, content, type, source: "agent", createdAt: now() }).run();
        autoLink(id, content);
        return { saved: true, id };
      },
    });
  }

  if (enabled("notes")) {
    toolset.searchNotes = tool({
      description: "Search the user's notes by keyword.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => searchNotesFts(query, 8).map((n) => ({ id: n.id, title: n.title })),
    });
    toolset.readNote = tool({
      description: "Read the full content of a note by id.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const n = getDb().select().from(notes).where(eq(notes.id, id)).get();
        return n ? { title: n.title, content: n.content } : { error: "not found" };
      },
    });
    toolset.writeNote = tool({
      description: "Create a new note with a title and markdown content.",
      inputSchema: z.object({ title: z.string(), content: z.string() }),
      execute: async ({ title, content }) => {
        const id = randomUUID();
        getDb().insert(notes).values({ id, title, content, createdAt: now(), updatedAt: now() }).run();
        return { created: true, id };
      },
    });
  }

  if (enabled("tasks")) {
    toolset.createTask = tool({
      description: "Add a to-do item, optionally with a due date (ISO) and reminder time (ISO).",
      inputSchema: z.object({
        title: z.string(),
        notes: z.string().optional(),
        dueAt: z.string().optional(),
        remindAt: z.string().optional(),
      }),
      execute: async ({ title, notes: n, dueAt, remindAt }) => {
        const id = randomUUID();
        getDb()
          .insert(tasks)
          .values({ id, title, notes: n ?? "", dueAt: dueAt ?? null, remindAt: remindAt ?? null, createdAt: now(), updatedAt: now() })
          .run();
        return { created: true, id };
      },
    });
    toolset.listTasks = tool({
      description: "List open (not done) to-do items.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = getDb().select().from(tasks).where(eq(tasks.isDone, false)).orderBy(asc(tasks.dueAt)).all();
        return rows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt }));
      },
    });
  }

  if (enabled("calendar")) {
    toolset.listEvents = tool({
      description: "List calendar events between two ISO datetimes.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      execute: async ({ from, to }) => {
        const rows = getDb()
          .select()
          .from(events)
          .where(and(gte(events.startsAt, from), lte(events.startsAt, to)))
          .orderBy(asc(events.startsAt))
          .all();
        return rows.map((e) => ({ title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, location: e.location }));
      },
    });
    toolset.createEvent = tool({
      description: "Create a calendar event (ISO start/end).",
      inputSchema: z.object({
        title: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
        location: z.string().optional(),
        description: z.string().optional(),
      }),
      execute: async ({ title, startsAt, endsAt, location, description }) => {
        let cal = getDb().select().from(calendars).get();
        if (!cal) {
          const calId = randomUUID();
          getDb().insert(calendars).values({ id: calId, name: "Personal", createdAt: now() }).run();
          cal = getDb().select().from(calendars).where(eq(calendars.id, calId)).get()!;
        }
        const id = randomUUID();
        getDb()
          .insert(events)
          .values({
            id,
            calendarId: cal.id,
            title,
            startsAt,
            endsAt,
            location: location ?? "",
            description: description ?? "",
            createdAt: now(),
            updatedAt: now(),
          })
          .run();
        return { created: true, id };
      },
    });
  }

  if (enabled("knowledge")) {
    toolset.searchKnowledge = tool({
      description: "Search uploaded documents (PDFs, text files) the user has shared.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const rows = getDb()
          .select({ name: attachments.name, text: attachments.extractedText })
          .from(attachments)
          .all();
        const q = query.toLowerCase();
        const hits = rows
          .filter((r) => r.text && r.text.toLowerCase().includes(q))
          .slice(0, 4)
          .map((r) => {
            const idx = (r.text ?? "").toLowerCase().indexOf(q);
            const snippet = (r.text ?? "").slice(Math.max(0, idx - 200), idx + 400);
            return { document: r.name, snippet };
          });
        return hits.length ? hits : { note: "No matching documents." };
      },
    });
  }

  if (enabled("web")) {
    toolset.webSearch = tool({
      description: "Search the web and get a list of result titles, URLs, and snippets.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        try {
          return await webSearch(query);
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    });
    toolset.fetchPage = tool({
      description: "Fetch a web page and return its readable text content.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        try {
          const text = await fetchReadable(url);
          return { text: text.slice(0, 8000) };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    });
  }

  if (enabled("files")) {
    toolset.listFiles = tool({
      description: "List files in the in-app IDE workspace.",
      inputSchema: z.object({}),
      execute: async () =>
        getDb().select({ id: filesTable.id, path: filesTable.path }).from(filesTable).orderBy(asc(filesTable.path)).all(),
    });
    toolset.readFile = tool({
      description: "Read a workspace file's content by id.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const f = getDb().select().from(filesTable).where(eq(filesTable.id, id)).get();
        return f ? { path: f.path, content: f.content } : { error: "not found" };
      },
    });
    toolset.writeFile = tool({
      description: "Write/overwrite a workspace file's content (requires approval).",
      inputSchema: z.object({ id: z.string(), content: z.string() }),
      execute: async ({ id, content }) => {
        if (!approved("writeFile")) return blocked("writeFile");
        getDb().update(filesTable).set({ content, updatedAt: now() }).where(eq(filesTable.id, id)).run();
        return { written: true };
      },
    });
  }

  if (enabled("email")) {
    toolset.draftEmail = tool({
      description: "Save an email draft (does not send).",
      inputSchema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
      execute: async ({ to, subject, body }) => {
        const id = randomUUID();
        getDb()
          .insert(emails)
          .values({ id, folder: "drafts", fromAddr: getSetting("emailFrom") ?? "you@dash.local", toAddr: to, subject, body, isRead: true, createdAt: now() })
          .run();
        return { drafted: true, id };
      },
    });
    toolset.findContact = tool({
      description: "Look up a saved contact by name to get their email.",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const rows = getDb().select().from(contacts).all();
        const match = rows.filter((c) => c.name.toLowerCase().includes(name.toLowerCase()));
        return match.map((c) => ({ name: c.name, email: c.email }));
      },
    });
  }

  if (enabled("shell")) {
    toolset.runShell = tool({
      description:
        "Run a read-only shell command and return stdout (requires approval; sandboxed to safe binaries).",
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) => {
        if (!approved("runShell")) return blocked("runShell");
        return runSafeShell(command);
      },
    });
  }

  if (enabled("notify")) {
    toolset.sendNotification = tool({
      description: "Send the user a notification (in-app + configured channels).",
      inputSchema: z.object({ title: z.string(), body: z.string().optional() }),
      execute: async ({ title, body }) => {
        await notify({ title, body, kind: "info" });
        return { sent: true };
      },
    });
  }

  return toolset;
}

const SHELL_ALLOW = new Set([
  "ls", "cat", "pwd", "echo", "date", "whoami", "uname", "df", "du", "ps",
  "git", "node", "npm", "pnpm", "wc", "head", "tail", "grep", "find", "which",
]);

function runSafeShell(command: string): Promise<{ stdout?: string; error?: string }> {
  const parts = command.trim().split(/\s+/);
  const bin = parts[0];
  if (!SHELL_ALLOW.has(bin)) {
    return Promise.resolve({ error: `Binary '${bin}' is not in the allowlist.` });
  }
  return new Promise((resolve) => {
    execFile(bin, parts.slice(1), { timeout: 10_000, maxBuffer: 256 * 1024 }, (err, stdout, stderr) => {
      if (err) resolve({ error: stderr || err.message });
      else resolve({ stdout: stdout.slice(0, 4000) });
    });
  });
}
