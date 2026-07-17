import { eq, gte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns, agents } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/settings";
import { notify } from "./notify";

/**
 * Compose and deliver the daily agent digest: last-24h run summary (incl.
 * needs_review), total estimated cost, pending approvals, and any agent-opened
 * PR still open past the staleness threshold. Delivered in-app + email.
 */
export async function sendDailyDigest(): Promise<void> {
  if (getSetting("agents_digest_enabled") === "0") return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const runs = getDb()
    .select({
      status: agentRuns.status,
      costUsd: agentRuns.costUsd,
      agentId: agentRuns.agentId,
      prUrl: agentRuns.prUrl,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, since))
    .orderBy(desc(agentRuns.createdAt))
    .all();

  const byStatus = new Map<string, number>();
  let cost = 0;
  for (const r of runs) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    cost += r.costUsd;
  }

  const staleDays = Math.max(1, parseFloat(getSetting("agents_stale_pr_days") ?? "7"));
  const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  const openPrs = getDb()
    .select({ prUrl: agentRuns.prUrl, createdAt: agentRuns.createdAt, agentId: agentRuns.agentId })
    .from(agentRuns)
    .all()
    .filter((r) => r.prUrl && new Date(r.createdAt).getTime() < staleCutoff);

  const nameOf = (id: string) =>
    getDb().select({ name: agents.name }).from(agents).where(eq(agents.id, id)).get()?.name ?? id;

  const lines: string[] = [];
  lines.push(`Runs in the last 24h: ${runs.length}`);
  for (const [status, n] of byStatus) lines.push(`  ${status.replace(/_/g, " ")}: ${n}`);
  lines.push(`Estimated cost: $${cost.toFixed(2)}`);
  if (openPrs.length > 0) {
    lines.push("", `Agent PRs open > ${staleDays}d:`);
    for (const p of openPrs) lines.push(`  ${nameOf(p.agentId)}: ${p.prUrl}`);
  }
  const body = lines.join("\n");

  await notify({ title: "Agent daily digest", body, kind: "info", href: "/dashboard/agents" });

  const to = getSetting("agents_notify_email");
  if (to) {
    const mod = (await import("./email").catch(() => null)) as {
      sendMailBestEffort?: (to: string, subject: string, body: string) => Promise<void>;
    } | null;
    await mod?.sendMailBestEffort?.(to, "Matrix agents — daily digest", body).catch(() => {});
  }
}

/**
 * A short, spoken-friendly overnight briefing. Creates one notification the voice
 * announcer will read aloud (title matched by its agent/run/digest/briefing filter,
 * body sliced at 300 chars — renderSpoken stays ≤280 for that reason).
 *
 * Built on the shared composer (lib/services/briefing.ts) so this and the
 * Overview page can never drift; the daemon chains a portfolio sync ahead of
 * this call so the data is fresh.
 */
export async function sendMorningBriefing(): Promise<void> {
  const { composeBriefing, renderSpoken } = await import("./briefing");
  const briefing = composeBriefing();

  await notify({
    title: "Good morning — daily briefing",
    body: renderSpoken(briefing),
    kind: "info",
    href: "/dashboard",
  });
}
