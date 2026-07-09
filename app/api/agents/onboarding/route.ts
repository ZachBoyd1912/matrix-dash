import { execFileSync } from "child_process";
import os from "os";
import { getDb } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * First-run readiness for the agent system: is the Claude CLI available (the SDK
 * uses its subscription credentials), and does any enabled agent exist yet.
 */
export async function GET() {
  let cliFound = false;
  let cliPath = "";
  try {
    cliPath = execFileSync("which", ["claude"], { encoding: "utf-8" }).trim();
    cliFound = !!cliPath;
  } catch {
    cliFound = false;
  }

  const enabled =
    (getDb()
      .select({ n: sql<number>`COUNT(*)` })
      .from(agents)
      .where(sql`is_enabled = 1`)
      .get()?.n ?? 0) > 0;

  const lowMem = os.totalmem() < 1.5 * 1024 * 1024 * 1024;

  return Response.json({
    cliFound,
    cliPath,
    hasEnabledAgent: enabled,
    lowMem,
    setupTokenHint: "On a headless host, run `claude setup-token` to authenticate.",
  });
}
