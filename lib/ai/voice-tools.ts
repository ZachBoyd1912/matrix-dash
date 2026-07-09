import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import { desc, eq, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agents, agentRuns } from "@/lib/db/schema";
import { startRun } from "@/lib/services/agent-runner";
import { getSetting } from "@/lib/db/settings";

/**
 * Agent-control tools for the voice/Jarvis chat pipeline. Let Jarvis trigger
 * agents, report status, and draft new agents by voice. Trigger/create actions
 * still go through the runner + policy engine (no privilege shortcut for voice).
 */
export function buildVoiceTools(): ToolSet {
  const toolset: ToolSet = {};

  toolset.listAgents = tool({
    description: "List the user's agents and whether each is enabled.",
    inputSchema: z.object({}),
    execute: async () => {
      const rows = getDb()
        .select({
          id: agents.id,
          name: agents.name,
          isEnabled: agents.isEnabled,
          mode: agents.mode,
        })
        .from(agents)
        .all();
      return rows.map((r) => ({ ...r, isEnabled: !!r.isEnabled }));
    },
  });

  toolset.triggerAgent = tool({
    description: "Start a run for an agent by id or name. Returns the run id.",
    inputSchema: z.object({
      agent: z.string().describe("Agent id or name"),
      prompt: z.string().optional().describe("Optional task prompt"),
    }),
    execute: async ({ agent, prompt }) => {
      if (getSetting("agents_kill_switch") === "1") return { error: "Kill switch is on." };
      const target = getDb()
        .select({ id: agents.id, isEnabled: agents.isEnabled, name: agents.name })
        .from(agents)
        .where(or(eq(agents.id, agent), eq(agents.name, agent)))
        .get();
      if (!target) return { error: `No agent found matching "${agent}".` };
      if (!target.isEnabled) return { error: `${target.name} is disabled.` };
      const runId = startRun(target.id, { trigger: "voice", prompt });
      return { started: true, runId, agent: target.name };
    },
  });

  toolset.agentStatus = tool({
    description: "Report the most recent agent runs and their outcomes.",
    inputSchema: z.object({ limit: z.number().optional() }),
    execute: async ({ limit }) => {
      const rows = getDb()
        .select({
          status: agentRuns.status,
          agentId: agentRuns.agentId,
          createdAt: agentRuns.createdAt,
        })
        .from(agentRuns)
        .orderBy(desc(agentRuns.createdAt))
        .limit(Math.min(10, Math.max(1, limit ?? 5)))
        .all();
      return rows;
    },
  });

  // ── Native Apple Reminders + Calendar (Mac-only) ──────────────────────
  toolset.listReminders = tool({
    description: "List the user's open (incomplete) Apple Reminders.",
    inputSchema: z.object({}),
    execute: async () => {
      const { listReminders } = await import("@/lib/services/apple-eventkit");
      const r = await listReminders();
      return r.ok ? { reminders: r.data } : { error: r.error, unavailable: r.unavailable };
    },
  });

  toolset.createReminder = tool({
    description: "Create an Apple Reminder, optionally with a due date/time (ISO 8601).",
    inputSchema: z.object({
      title: z.string(),
      due: z.string().optional().describe("ISO 8601 datetime, e.g. 2026-07-10T09:00:00"),
    }),
    execute: async ({ title, due }) => {
      const { createReminder } = await import("@/lib/services/apple-eventkit");
      const r = await createReminder(title, due);
      return r.ok ? { created: true, title } : { error: r.error, unavailable: r.unavailable };
    },
  });

  toolset.completeReminder = tool({
    description: "Mark an Apple Reminder complete by its exact title.",
    inputSchema: z.object({ title: z.string() }),
    execute: async ({ title }) => {
      const { completeReminder } = await import("@/lib/services/apple-eventkit");
      const r = await completeReminder(title);
      return r.ok ? { completed: true, title } : { error: r.error, unavailable: r.unavailable };
    },
  });

  toolset.listTodayEvents = tool({
    description: "List today's Apple Calendar events.",
    inputSchema: z.object({}),
    execute: async () => {
      const { listTodayEvents } = await import("@/lib/services/apple-eventkit");
      const r = await listTodayEvents();
      return r.ok ? { events: r.data } : { error: r.error, unavailable: r.unavailable };
    },
  });

  toolset.createAgent = tool({
    description:
      "Create a new agent from a spoken description. ALWAYS summarize the config and get the user's spoken confirmation BEFORE calling this. The agent is created DISABLED so it never runs until the user enables it.",
    inputSchema: z.object({
      name: z.string(),
      description: z.string().optional(),
      instructions: z.string(),
      schedule: z.string().nullable().optional(),
      writeAllowlist: z.array(z.string()).optional(),
    }),
    execute: async ({ name, description, instructions, schedule, writeAllowlist }) => {
      const id = randomUUID();
      const now = new Date().toISOString();
      getDb()
        .insert(agents)
        .values({
          id,
          name,
          description: description ?? "",
          instructions,
          schedule: schedule ?? null,
          scheduleEnabled: false,
          isEnabled: false, // created disabled — the user must enable it
          writeAllowlist: JSON.stringify(writeAllowlist ?? []),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return {
        created: true,
        id,
        name,
        note: "Created disabled — enable it in the dashboard to run it.",
      };
    },
  });

  return toolset;
}
