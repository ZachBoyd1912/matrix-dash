import cron, { type ScheduledTask } from "node-cron";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { scheduledJobs, tasks } from "@/lib/db/schema";
import { runAgent } from "@/lib/ai/runner";
import { notify, fireWebhooks } from "./notify";
import { decayMemories } from "@/lib/ai/consolidation";
import { syncAllAccounts } from "./email";
import { writeBackup } from "./backup";
import { getSetting } from "@/lib/db/settings";

// The daemon is a singleton background loop, cached on globalThis so Next.js
// HMR / multiple route imports don't spawn duplicates.
const g = globalThis as unknown as {
  __matrixDaemon?: {
    started: boolean;
    jobs: Map<string, ScheduledTask>;
    heartbeat?: ScheduledTask;
    emailPoll?: ScheduledTask;
  };
};

function state() {
  if (!g.__matrixDaemon) g.__matrixDaemon = { started: false, jobs: new Map() };
  return g.__matrixDaemon;
}

/** Run any reminders whose remindAt has passed. */
async function processReminders() {
  const nowIso = new Date().toISOString();
  let due: (typeof tasks.$inferSelect)[] = [];
  try {
    due = getDb()
      .select()
      .from(tasks)
      .where(and(isNotNull(tasks.remindAt), eq(tasks.reminded, false), lte(tasks.remindAt, nowIso)))
      .all();
  } catch {
    return;
  }
  for (const task of due) {
    await notify({
      title: "Reminder",
      body: task.title,
      kind: "reminder",
      href: "/dashboard/tasks",
    });
    void fireWebhooks("task.reminder", { id: task.id, title: task.title });
    getDb().update(tasks).set({ reminded: true }).where(eq(tasks.id, task.id)).run();
  }
}

/** Execute one scheduled agent job and store its result. */
async function runScheduledJob(jobId: string) {
  const job = getDb().select().from(scheduledJobs).where(eq(scheduledJobs.id, jobId)).get();
  if (!job || !job.isEnabled) return;
  try {
    const result = await runAgent(job.prompt);
    getDb()
      .update(scheduledJobs)
      .set({ lastRunAt: new Date().toISOString(), lastResult: result.slice(0, 4000) })
      .where(eq(scheduledJobs.id, jobId))
      .run();
    await notify({ title: `Job: ${job.name}`, body: result.slice(0, 280), kind: "info", href: "/dashboard/tasks" });
    void fireWebhooks("job.completed", { id: job.id, name: job.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    getDb()
      .update(scheduledJobs)
      .set({ lastRunAt: new Date().toISOString(), lastResult: `Error: ${message}` })
      .where(eq(scheduledJobs.id, jobId))
      .run();
  }
}

/** (Re)register cron entries for all enabled jobs. */
export function syncScheduledJobs() {
  const s = state();
  // Clear existing.
  for (const task of s.jobs.values()) task.stop();
  s.jobs.clear();

  let jobs: (typeof scheduledJobs.$inferSelect)[] = [];
  try {
    jobs = getDb().select().from(scheduledJobs).where(eq(scheduledJobs.isEnabled, true)).all();
  } catch {
    return;
  }
  for (const job of jobs) {
    if (!cron.validate(job.cron)) continue;
    const task = cron.schedule(job.cron, () => void runScheduledJob(job.id));
    s.jobs.set(job.id, task);
  }
}

/** Idempotent daemon start. Safe to call from any server entry point. */
export function startDaemon() {
  const s = state();
  if (s.started) return;
  s.started = true;

  // Heartbeat every minute: reminders + (once a day) memory decay.
  s.heartbeat = cron.schedule("* * * * *", () => {
    void processReminders();
    const minute = new Date().getMinutes();
    const hour = new Date().getHours();
    if (hour === 4 && minute === 0) {
      try {
        decayMemories();
      } catch {
        /* ignore */
      }
      // Nightly backup (toggleable).
      if (getSetting("autoBackup") !== "0") {
        try {
          writeBackup();
        } catch {
          /* ignore */
        }
      }
    }
  });

  // Email polling every 5 minutes (no-op when no accounts configured).
  s.emailPoll = cron.schedule("*/5 * * * *", () => {
    void syncAllAccounts().catch(() => {});
  });

  syncScheduledJobs();
  console.log("[daemon] started");
}

/** Run a job immediately (manual trigger). */
export async function triggerJobNow(jobId: string) {
  await runScheduledJob(jobId);
}
