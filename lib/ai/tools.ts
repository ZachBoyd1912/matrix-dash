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
  skills,
} from "@/lib/db/schema";
import { searchMemoriesFts, searchNotesFts, searchSkillsFts } from "@/lib/db/fts";
import { autoLink } from "@/lib/ai/extraction";
import { getSetting } from "@/lib/db/settings";
import { fetchReadable, webSearch } from "@/lib/services/web";
import { notify } from "@/lib/services/notify";
import { buildCodingTools } from "@/lib/ai/coding-tools";
import { getPowerLevel, getWorkspaceRoot } from "@/lib/ai/power";
import { githubConnections, githubRepos, slackWorkspaces, slackChannels } from "@/lib/db/schema";
import {
  createIssue,
  createPR,
  readRepoFile,
  getRepo,
  searchCode,
  listFiles,
  readMultipleFiles,
  getCommit,
  listCommits,
  compareCommits,
  blame,
  getLatestRelease,
  searchRepos,
  listIssues,
  getIssue,
  updateIssue,
  addLabels,
  removeLabel,
  assignIssue,
  commentOnIssue,
  listComments,
  searchIssues,
  listPRs,
  getPR,
  updatePR,
  mergePR,
  requestReview,
  listReviews,
  reviewPR,
  listPRComments,
  commentOnPR,
  getPRChecks,
  createRepo,
  deleteRepo,
  updateRepo,
  forkRepo,
  createBranch,
  deleteBranch,
  commitFile,
  listWorkflows,
  getWorkflowRuns,
  triggerWorkflow,
  cancelWorkflowRun,
  getWorkflowLogs,
  getUserProfile,
  listOrganizations,
  starRepo,
  unstarRepo,
  getRateLimit,
  listMilestones,
  createMilestone,
  listGists,
  createGist,
  listNotifications,
  markNotificationRead,
} from "@/lib/services/github";
import {
  syncGmailEmails,
  sendGmailEmail,
  searchGmailEmails,
  listGmailLabels,
  getGmailEmail,
} from "@/lib/services/gmail";
import { sendMessage, searchMessages } from "@/lib/services/slack";

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
      execute: async ({ query }) =>
        searchMemoriesFts(query, 8).map((m) => ({ content: m.content, type: m.type })),
    });
    toolset.saveMemory = tool({
      description: "Save a new long-term memory the user will want recalled later.",
      inputSchema: z.object({
        content: z.string(),
        type: z.enum(["identity", "project", "global", "lesson"]).default("global"),
      }),
      execute: async ({ content, type }) => {
        const id = randomUUID();
        getDb()
          .insert(memories)
          .values({ id, content, type, source: "agent", createdAt: now() })
          .run();
        autoLink(id, content);
        return { saved: true, id };
      },
    });
  }

  if (enabled("skills")) {
    toolset.findSkills = tool({
      description:
        "Find skills (capability packs) relevant to the task at hand. Returns matching skill names and descriptions — call loadSkill to read a skill's full instructions before applying it.",
      inputSchema: z.object({
        query: z.string().describe("A short description of what you're trying to do"),
      }),
      execute: async ({ query }) =>
        searchSkillsFts(query, 8).map((s) => ({ name: s.name, description: s.description })),
    });
    toolset.loadSkill = tool({
      description:
        "Load the full instructions for a skill by its exact name (as returned by findSkills), then follow them.",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const s = getDb()
          .select({ name: skills.name, instructions: skills.instructions })
          .from(skills)
          .where(and(eq(skills.name, name), eq(skills.isEnabled, true)))
          .get();
        return (
          s ?? {
            error: `No enabled skill named "${name}". Use findSkills to discover available skills.`,
          }
        );
      },
    });
  }

  if (enabled("notes")) {
    toolset.searchNotes = tool({
      description: "Search the user's notes by keyword.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) =>
        searchNotesFts(query, 8).map((n) => ({ id: n.id, title: n.title })),
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
        getDb()
          .insert(notes)
          .values({ id, title, content, createdAt: now(), updatedAt: now() })
          .run();
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
          .values({
            id,
            title,
            notes: n ?? "",
            dueAt: dueAt ?? null,
            remindAt: remindAt ?? null,
            createdAt: now(),
            updatedAt: now(),
          })
          .run();
        return { created: true, id };
      },
    });
    toolset.listTasks = tool({
      description: "List open (not done) to-do items.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = getDb()
          .select()
          .from(tasks)
          .where(eq(tasks.isDone, false))
          .orderBy(asc(tasks.dueAt))
          .all();
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
        return rows.map((e) => ({
          title: e.title,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          location: e.location,
        }));
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
        getDb()
          .select({ id: filesTable.id, path: filesTable.path })
          .from(filesTable)
          .orderBy(asc(filesTable.path))
          .all(),
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
        getDb()
          .update(filesTable)
          .set({ content, updatedAt: now() })
          .where(eq(filesTable.id, id))
          .run();
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
          .values({
            id,
            folder: "drafts",
            fromAddr: getSetting("emailFrom") ?? "you@dash.local",
            toAddr: to,
            subject,
            body,
            isRead: true,
            createdAt: now(),
          })
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

    // ── Gmail Tools ──────────────────────────────────
    toolset.syncGmail = tool({
      description: "Sync recent emails from Gmail into the local mailbox.",
      inputSchema: z.object({ limit: z.number().default(50).describe("Max emails to fetch") }),
      execute: async ({ limit }) => {
        if (!approved("syncGmail")) return blocked("syncGmail");
        const count = await syncGmailEmails(limit);
        return { synced: true, imported: count };
      },
    });

    toolset.sendGmail = tool({
      description: "Send an email via Gmail. Requires approval.",
      inputSchema: z.object({
        to: z.string(),
        subject: z.string(),
        body: z.string(),
        cc: z.string().optional(),
        bcc: z.string().optional(),
      }),
      execute: async (opts) => {
        if (!approved("sendGmail")) return blocked("sendGmail");
        return sendGmailEmail(opts.to, opts.subject, opts.body, { cc: opts.cc, bcc: opts.bcc });
      },
    });

    toolset.searchGmail = tool({
      description:
        "Search Gmail using Gmail search syntax (e.g. 'from:john subject:report newer_than:7d').",
      inputSchema: z.object({
        query: z.string().describe("Gmail search query"),
        limit: z.number().default(20),
      }),
      execute: async ({ query, limit }) => searchGmailEmails(query, limit),
    });

    toolset.getGmailEmail = tool({
      description: "Get the full content of a single Gmail email by message ID.",
      inputSchema: z.object({ messageId: z.string() }),
      execute: async ({ messageId }) => getGmailEmail(messageId),
    });

    toolset.listGmailLabels = tool({
      description: "List Gmail labels (folders) with message counts.",
      inputSchema: z.object({}),
      execute: async () => listGmailLabels(),
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

  if (enabled("github")) {
    const ghConn = () => {
      const c = getDb()
        .select()
        .from(githubConnections)
        .where(eq(githubConnections.isActive, true))
        .get();
      if (!c) throw new Error("No active GitHub connection.");
      return c;
    };

    // ── Read ─────────────────────────────────────────
    toolset.listRepos = tool({
      description: "List your synced GitHub repositories (name, stars, language, private flag).",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = getDb().select().from(githubRepos).all();
        return rows.map((r) => ({
          full_name: r.fullName,
          stars: r.stars,
          language: r.language,
          private: r.isPrivate,
        }));
      },
    });

    toolset.getRepo = tool({
      description:
        "Get detailed metadata for a single GitHub repo (stars, forks, topics, license, default branch).",
      inputSchema: z.object({ repo: z.string().describe("e.g. ZachBoyd1912/matrix-dash") }),
      execute: async ({ repo }) => getRepo(ghConn().id, repo),
    });

    toolset.readRepoFile = tool({
      description:
        "Read the contents of a file in a GitHub repository. Returns the file content as text.",
      inputSchema: z.object({
        repo: z.string().describe("e.g. ZachBoyd1912/matrix-dash"),
        path: z.string().describe("File path from repo root, e.g. src/app.ts"),
        ref: z.string().optional().describe("Branch name or commit SHA (default: default branch)"),
      }),
      execute: async ({ repo, path, ref }) => readRepoFile(ghConn().id, repo, path, ref),
    });

    toolset.readMultipleFiles = tool({
      description:
        "Read multiple files from a repo in parallel. Use when you need to understand code across several files.",
      inputSchema: z.object({
        repo: z.string(),
        paths: z.array(z.string()).describe("List of file paths"),
        ref: z.string().optional(),
      }),
      execute: async ({ repo, paths, ref }) => readMultipleFiles(ghConn().id, repo, paths, ref),
    });

    toolset.listFiles = tool({
      description: "List files and directories at a path in a GitHub repository.",
      inputSchema: z.object({
        repo: z.string(),
        path: z.string().default("").describe("Directory path (empty = root)"),
        ref: z.string().optional(),
      }),
      execute: async ({ repo, path, ref }) => {
        const result = await listFiles(ghConn().id, repo, path, ref);
        return result ?? { error: `Not a directory or path not found: ${path || "/"}` };
      },
    });

    toolset.searchCode = tool({
      description: "Search code across GitHub repositories. Finds files containing a query string.",
      inputSchema: z.object({
        query: z.string().describe("Code to search for (e.g. 'useState', 'TODO', 'CREATE TABLE')"),
        repo: z.string().optional().describe("Limit search to a specific repo"),
      }),
      execute: async ({ query, repo }) => searchCode(ghConn().id, query, repo),
    });

    // ── History & Diff ──────────────────────────────
    toolset.listCommits = tool({
      description:
        "Get commit history for a repo (optionally filtered by branch, path, or author).",
      inputSchema: z.object({
        repo: z.string(),
        branch: z.string().optional(),
        path: z.string().optional(),
        author: z.string().optional(),
        perPage: z.number().default(20),
        page: z.number().default(1),
      }),
      execute: async (opts) => listCommits(ghConn().id, opts.repo, opts),
    });

    toolset.getCommit = tool({
      description: "Get full details of a single commit including diff and files changed.",
      inputSchema: z.object({
        repo: z.string(),
        sha: z.string().describe("Commit SHA (full or short)"),
      }),
      execute: async ({ repo, sha }) => getCommit(ghConn().id, repo, sha),
    });

    toolset.compareCommits = tool({
      description: "Compare two refs (branches, tags, or commits) and show the diff.",
      inputSchema: z.object({
        repo: z.string(),
        base: z.string().describe("Base ref (e.g. 'main')"),
        head: z.string().describe("Head ref to compare against base"),
      }),
      execute: async ({ repo, base, head }) => compareCommits(ghConn().id, repo, base, head),
    });

    toolset.blame = tool({
      description: "Show who last modified each line of a file (git blame).",
      inputSchema: z.object({
        repo: z.string(),
        path: z.string().describe("File path in the repo"),
        ref: z.string().optional(),
      }),
      execute: async ({ repo, path, ref }) => blame(ghConn().id, repo, path, { ref }),
    });

    toolset.getLatestRelease = tool({
      description: "Get the latest release for a repository (tag, notes, assets).",
      inputSchema: z.object({ repo: z.string() }),
      execute: async ({ repo }) => getLatestRelease(ghConn().id, repo),
    });

    // ── Search ──────────────────────────────────────
    toolset.searchRepos = tool({
      description: "Search across all GitHub repositories by keyword.",
      inputSchema: z.object({ query: z.string().describe("Repository search query") }),
      execute: async ({ query }) => searchRepos(ghConn().id, query),
    });

    // ── Write (gated) ───────────────────────────────
    toolset.createIssue = tool({
      description: "Create a GitHub issue. Requires approval.",
      inputSchema: z.object({
        repo: z.string().describe("e.g. ZachBoyd1912/matrix-dash"),
        title: z.string(),
        body: z.string(),
        labels: z.array(z.string()).optional(),
      }),
      execute: async ({ repo, title, body, labels }) => {
        if (!approved("createIssue")) return blocked("createIssue");
        return createIssue(ghConn().id, repo, title, body, labels);
      },
    });

    toolset.createPR = tool({
      description: "Create a GitHub pull request. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        title: z.string(),
        body: z.string(),
        head: z.string().describe("Branch with changes"),
        base: z.string().default("main"),
      }),
      execute: async ({ repo, title, body, head, base }) => {
        if (!approved("createPR")) return blocked("createPR");
        return createPR(ghConn().id, repo, title, body, head, base);
      },
    });

    // ── Issues (Phase 2) ────────────────────────────
    toolset.listIssues = tool({
      description: "List issues in a repository with filters (state, labels, assignee, sort).",
      inputSchema: z.object({
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
        labels: z.array(z.string()).optional(),
        assignee: z.string().optional(),
        sort: z.enum(["created", "updated", "comments"]).default("updated"),
        perPage: z.number().default(20),
        page: z.number().default(1),
      }),
      execute: async (opts) => listIssues(ghConn().id, opts.repo, opts),
    });

    toolset.getIssue = tool({
      description:
        "Get full details of a single GitHub issue including body, labels, assignees, and milestone.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number().describe("Issue number (e.g. 42)"),
      }),
      execute: async ({ repo, number }) => getIssue(ghConn().id, repo, number),
    });

    toolset.updateIssue = tool({
      description:
        "Update an issue's title, body, state, labels, assignees, or milestone. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        title: z.string().optional(),
        body: z.string().optional(),
        state: z.enum(["open", "closed"]).optional(),
        stateReason: z.enum(["completed", "not_planned"]).optional(),
        labels: z.array(z.string()).optional(),
        assignees: z.array(z.string()).optional(),
        milestone: z.number().nullable().optional(),
      }),
      execute: async ({ repo, number, ...updates }) => {
        if (!approved("updateIssue")) return blocked("updateIssue");
        return updateIssue(ghConn().id, repo, number, updates);
      },
    });

    toolset.addLabels = tool({
      description: "Add labels to a GitHub issue. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        labels: z.array(z.string()).describe("Label names to add"),
      }),
      execute: async ({ repo, number, labels }) => {
        if (!approved("addLabels")) return blocked("addLabels");
        return addLabels(ghConn().id, repo, number, labels);
      },
    });

    toolset.removeLabel = tool({
      description: "Remove a label from a GitHub issue. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        label: z.string(),
      }),
      execute: async ({ repo, number, label }) => {
        if (!approved("removeLabel")) return blocked("removeLabel");
        return removeLabel(ghConn().id, repo, number, label);
      },
    });

    toolset.assignIssue = tool({
      description: "Assign users to a GitHub issue. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        assignees: z.array(z.string()).describe("GitHub usernames to assign"),
      }),
      execute: async ({ repo, number, assignees }) => {
        if (!approved("assignIssue")) return blocked("assignIssue");
        return assignIssue(ghConn().id, repo, number, assignees);
      },
    });

    toolset.commentOnIssue = tool({
      description: "Add a comment to a GitHub issue (supports markdown). Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        body: z.string().describe("Comment body (markdown supported)"),
      }),
      execute: async ({ repo, number, body }) => {
        if (!approved("commentOnIssue")) return blocked("commentOnIssue");
        return commentOnIssue(ghConn().id, repo, number, body);
      },
    });

    toolset.listComments = tool({
      description: "List all comments on a GitHub issue.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        perPage: z.number().default(30),
        page: z.number().default(1),
      }),
      execute: async (opts) =>
        listComments(ghConn().id, opts.repo, opts.number, {
          perPage: opts.perPage,
          page: opts.page,
        }),
    });

    toolset.searchIssues = tool({
      description: "Search issues across all GitHub repositories by keyword.",
      inputSchema: z.object({
        query: z.string().describe("Search query (e.g. 'login bug', 'performance')"),
        state: z.enum(["open", "closed"]).optional(),
        labels: z.array(z.string()).optional(),
        repo: z.string().optional(),
      }),
      execute: async (opts) => searchIssues(ghConn().id, opts.query, opts),
    });

    // ── Pull Requests (Phase 3) ──────────────────────
    toolset.listPRs = tool({
      description: "List pull requests in a repo with filters.",
      inputSchema: z.object({
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
        sort: z.enum(["created", "updated", "popularity", "long-running"]).default("updated"),
        perPage: z.number().default(20),
        page: z.number().default(1),
      }),
      execute: async (opts) => listPRs(ghConn().id, opts.repo, opts),
    });

    toolset.getPR = tool({
      description:
        "Get full details of a single pull request (body, diff stats, review status, mergeability).",
      inputSchema: z.object({ repo: z.string(), number: z.number() }),
      execute: async ({ repo, number }) => getPR(ghConn().id, repo, number),
    });

    toolset.updatePR = tool({
      description: "Update a PR's title, body, state, or base branch. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        title: z.string().optional(),
        body: z.string().optional(),
        state: z.enum(["open", "closed"]).optional(),
        base: z.string().optional(),
      }),
      execute: async ({ repo, number, ...updates }) => {
        if (!approved("updatePR")) return blocked("updatePR");
        return updatePR(ghConn().id, repo, number, updates);
      },
    });

    toolset.mergePR = tool({
      description: "Merge a pull request. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        commitTitle: z.string().optional(),
        commitMessage: z.string().optional(),
        mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
      }),
      execute: async ({ repo, number, ...opts }) => {
        if (!approved("mergePR")) return blocked("mergePR");
        return mergePR(ghConn().id, repo, number, opts);
      },
    });

    toolset.requestReview = tool({
      description: "Request specific users to review a PR. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        reviewers: z.array(z.string()).describe("GitHub usernames"),
      }),
      execute: async ({ repo, number, reviewers }) => {
        if (!approved("requestReview")) return blocked("requestReview");
        return requestReview(ghConn().id, repo, number, reviewers);
      },
    });

    toolset.listReviews = tool({
      description: "List all reviews on a pull request.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        perPage: z.number().default(30),
      }),
      execute: async (opts) =>
        listReviews(ghConn().id, opts.repo, opts.number, { perPage: opts.perPage }),
    });

    toolset.reviewPR = tool({
      description: "Submit a PR review (approve, request changes, or comment). Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
        body: z.string().optional(),
      }),
      execute: async ({ repo, number, event, body }) => {
        if (!approved("reviewPR")) return blocked("reviewPR");
        return reviewPR(ghConn().id, repo, number, event, body);
      },
    });

    toolset.listPRComments = tool({
      description: "List inline review comments on a pull request.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        perPage: z.number().default(30),
      }),
      execute: async (opts) =>
        listPRComments(ghConn().id, opts.repo, opts.number, { perPage: opts.perPage }),
    });

    toolset.commentOnPR = tool({
      description:
        "Add a comment to a PR (general or inline on a specific file/line). Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        number: z.number(),
        body: z.string(),
        path: z.string().optional(),
        line: z.number().optional(),
        side: z.enum(["LEFT", "RIGHT"]).optional(),
      }),
      execute: async ({ repo, number, body, path, line, side }) => {
        if (!approved("commentOnPR")) return blocked("commentOnPR");
        return commentOnPR(ghConn().id, repo, number, body, { path, line, side });
      },
    });

    toolset.getPRChecks = tool({
      description: "Get CI/CD check run statuses for a commit (e.g., the head of a PR).",
      inputSchema: z.object({ repo: z.string(), sha: z.string().describe("Commit SHA to check") }),
      execute: async ({ repo, sha }) => getPRChecks(ghConn().id, repo, sha),
    });

    // ── Repo Admin (Phase 4) ─────────────────────────
    toolset.createRepo = tool({
      description: "Create a new GitHub repository. Requires approval.",
      inputSchema: z.object({
        name: z.string(),
        description: z.string().optional(),
        private: z.boolean().default(false),
        autoInit: z.boolean().default(false),
      }),
      execute: async (opts) => {
        if (!approved("createRepo")) return blocked("createRepo");
        return createRepo(ghConn().id, opts.name, opts);
      },
    });

    toolset.deleteRepo = tool({
      description: "Delete a GitHub repository. DANGER — requires approval.",
      inputSchema: z.object({ repo: z.string().describe("owner/repo to delete") }),
      execute: async ({ repo }) => {
        if (!approved("deleteRepo")) return blocked("deleteRepo");
        return deleteRepo(ghConn().id, repo);
      },
    });

    toolset.updateRepo = tool({
      description:
        "Update repository settings (name, description, visibility, topics). Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        private: z.boolean().optional(),
        hasIssues: z.boolean().optional(),
        hasWiki: z.boolean().optional(),
        topics: z.array(z.string()).optional(),
      }),
      execute: async ({ repo, ...updates }) => {
        if (!approved("updateRepo")) return blocked("updateRepo");
        return updateRepo(ghConn().id, repo, updates);
      },
    });

    toolset.forkRepo = tool({
      description: "Fork a repository to your account. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        organization: z.string().optional(),
      }),
      execute: async ({ repo, organization }) => {
        if (!approved("forkRepo")) return blocked("forkRepo");
        return forkRepo(ghConn().id, repo, organization);
      },
    });

    toolset.createBranch = tool({
      description: "Create a new branch from an existing ref. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        branch: z.string(),
        fromRef: z.string().default("main"),
      }),
      execute: async ({ repo, branch, fromRef }) => {
        if (!approved("createBranch")) return blocked("createBranch");
        return createBranch(ghConn().id, repo, branch, fromRef);
      },
    });

    toolset.deleteBranch = tool({
      description: "Delete a branch. Requires approval.",
      inputSchema: z.object({ repo: z.string(), branch: z.string() }),
      execute: async ({ repo, branch }) => {
        if (!approved("deleteBranch")) return blocked("deleteBranch");
        return deleteBranch(ghConn().id, repo, branch);
      },
    });

    toolset.commitFile = tool({
      description: "Create or update a file in a repo with a commit. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        path: z.string(),
        content: z.string(),
        message: z.string().describe("Commit message"),
        branch: z.string().optional(),
        sha: z.string().optional().describe("File blob SHA (required for updates)"),
      }),
      execute: async ({ repo, path, content, message, branch, sha }) => {
        if (!approved("commitFile")) return blocked("commitFile");
        return commitFile(ghConn().id, repo, path, content, message, { branch, sha });
      },
    });

    // ── Workflows (Phase 5) ─────────────────────────
    toolset.listWorkflows = tool({
      description: "List GitHub Actions workflows in a repository.",
      inputSchema: z.object({ repo: z.string() }),
      execute: async ({ repo }) => listWorkflows(ghConn().id, repo),
    });

    toolset.getWorkflowRuns = tool({
      description: "Get recent workflow runs with optional filters.",
      inputSchema: z.object({
        repo: z.string(),
        workflowId: z.number().optional(),
        branch: z.string().optional(),
        status: z.string().optional(),
        perPage: z.number().default(10),
      }),
      execute: async (opts) => {
        const { repo, workflowId, ...rest } = opts;
        return getWorkflowRuns(ghConn().id, repo, workflowId, rest);
      },
    });

    toolset.triggerWorkflow = tool({
      description: "Trigger a workflow_dispatch event. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        workflowId: z.number(),
        ref: z.string().describe("Branch or tag to run on"),
        inputs: z.record(z.string(), z.string()).optional(),
      }),
      execute: async ({ repo, workflowId, ref, inputs }) => {
        if (!approved("triggerWorkflow")) return blocked("triggerWorkflow");
        return triggerWorkflow(ghConn().id, repo, workflowId, ref, inputs);
      },
    });

    toolset.cancelWorkflowRun = tool({
      description: "Cancel a running workflow. Requires approval.",
      inputSchema: z.object({ repo: z.string(), runId: z.number() }),
      execute: async ({ repo, runId }) => {
        if (!approved("cancelWorkflowRun")) return blocked("cancelWorkflowRun");
        return cancelWorkflowRun(ghConn().id, repo, runId);
      },
    });

    toolset.getWorkflowLogs = tool({
      description: "Get a download URL for workflow run logs.",
      inputSchema: z.object({ repo: z.string(), runId: z.number() }),
      execute: async ({ repo, runId }) => getWorkflowLogs(ghConn().id, repo, runId),
    });

    // ── Extended (Phase 6) ──────────────────────────
    toolset.getUserProfile = tool({
      description: "Get a GitHub user's public profile.",
      inputSchema: z.object({ username: z.string() }),
      execute: async ({ username }) => getUserProfile(ghConn().id, username),
    });

    toolset.listOrganizations = tool({
      description: "List organizations the authenticated user belongs to.",
      inputSchema: z.object({}),
      execute: async () => listOrganizations(ghConn().id),
    });

    toolset.starRepo = tool({
      description: "Star a repository. Requires approval.",
      inputSchema: z.object({ repo: z.string() }),
      execute: async ({ repo }) => {
        if (!approved("starRepo")) return blocked("starRepo");
        return starRepo(ghConn().id, repo);
      },
    });

    toolset.unstarRepo = tool({
      description: "Unstar a repository. Requires approval.",
      inputSchema: z.object({ repo: z.string() }),
      execute: async ({ repo }) => {
        if (!approved("unstarRepo")) return blocked("unstarRepo");
        return unstarRepo(ghConn().id, repo);
      },
    });

    toolset.getRateLimit = tool({
      description: "Check remaining GitHub API rate limit.",
      inputSchema: z.object({}),
      execute: async () => getRateLimit(ghConn().id),
    });

    toolset.listMilestones = tool({
      description: "List milestones for a repository.",
      inputSchema: z.object({
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
        perPage: z.number().default(30),
      }),
      execute: async (opts) => listMilestones(ghConn().id, opts.repo, opts),
    });

    toolset.createMilestone = tool({
      description: "Create a milestone with optional due date. Requires approval.",
      inputSchema: z.object({
        repo: z.string(),
        title: z.string(),
        description: z.string().optional(),
        dueOn: z.string().optional(),
      }),
      execute: async ({ repo, title, ...opts }) => {
        if (!approved("createMilestone")) return blocked("createMilestone");
        return createMilestone(ghConn().id, repo, title, opts);
      },
    });

    toolset.listGists = tool({
      description: "List your GitHub gists.",
      inputSchema: z.object({ perPage: z.number().default(20) }),
      execute: async ({ perPage }) => listGists(ghConn().id, perPage),
    });

    toolset.createGist = tool({
      description: "Create a gist. Requires approval.",
      inputSchema: z.object({
        files: z.record(z.string(), z.object({ content: z.string() })),
        description: z.string().optional(),
        public: z.boolean().default(false),
      }),
      execute: async ({ files, description, public: isPublic }) => {
        if (!approved("createGist")) return blocked("createGist");
        return createGist(ghConn().id, files, { description, public: isPublic });
      },
    });

    toolset.listNotifications = tool({
      description: "List your unread GitHub notifications.",
      inputSchema: z.object({
        all: z.boolean().default(false),
        perPage: z.number().default(20),
      }),
      execute: async (opts) => listNotifications(ghConn().id, opts),
    });

    toolset.markNotificationRead = tool({
      description: "Mark a notification as read. Requires approval.",
      inputSchema: z.object({ threadId: z.number().optional() }),
      execute: async ({ threadId }) => {
        if (!approved("markNotificationRead")) return blocked("markNotificationRead");
        return markNotificationRead(ghConn().id, threadId);
      },
    });
  }

  if (enabled("slack")) {
    toolset.sendSlackMessage = tool({
      description: "Send a message to a Slack channel.",
      inputSchema: z.object({ channel: z.string(), text: z.string() }),
      execute: async ({ channel, text }) => {
        if (!approved("sendSlackMessage")) return blocked("sendSlackMessage");
        const ws = getDb()
          .select()
          .from(slackWorkspaces)
          .where(eq(slackWorkspaces.isActive, true))
          .get();
        if (!ws) return { error: "No active Slack workspace." };
        return sendMessage(ws.id, channel, text);
      },
    });
    toolset.listSlackChannels = tool({
      description: "List Slack channels in the connected workspace.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = getDb().select().from(slackChannels).all();
        return rows.map((c) => ({
          name: `#${c.name}`,
          topic: c.topic,
          members: c.memberCount,
        }));
      },
    });
    toolset.searchSlack = tool({
      description: "Search Slack messages across all channels.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const ws = getDb()
          .select()
          .from(slackWorkspaces)
          .where(eq(slackWorkspaces.isActive, true))
          .get();
        if (!ws) return { error: "No active Slack workspace." };
        const results = await searchMessages(ws.id, query);
        return results.map((r) => ({
          channel: `#${r.channel.name}`,
          user: r.username,
          text: r.text.slice(0, 300),
        }));
      },
    });
  }

  // Claude-Code-parity coding tools (Read/Write/Edit/Bash/Grep/Glob/Todo), scoped
  // to the configured workspace root and gated by the agent power level.
  if (enabled("coding")) {
    Object.assign(toolset, buildCodingTools(getPowerLevel(), getWorkspaceRoot()));
  }

  return toolset;
}

const SHELL_ALLOW = new Set([
  "ls",
  "cat",
  "pwd",
  "echo",
  "date",
  "whoami",
  "uname",
  "df",
  "du",
  "ps",
  "git",
  "node",
  "npm",
  "pnpm",
  "wc",
  "head",
  "tail",
  "grep",
  "find",
  "which",
]);

function runSafeShell(command: string): Promise<{ stdout?: string; error?: string }> {
  const parts = command.trim().split(/\s+/);
  const bin = parts[0];
  if (!SHELL_ALLOW.has(bin)) {
    return Promise.resolve({ error: `Binary '${bin}' is not in the allowlist.` });
  }
  return new Promise((resolve) => {
    execFile(
      bin,
      parts.slice(1),
      { timeout: 10_000, maxBuffer: 256 * 1024 },
      (err, stdout, stderr) => {
        if (err) resolve({ error: stderr || err.message });
        else resolve({ stdout: stdout.slice(0, 4000) });
      }
    );
  });
}
