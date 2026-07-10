import fs from "fs";
import os from "os";
import path from "path";
import { getDb } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * First-run readiness for the agent system. The Agent SDK bundles its own
 * runtime, so a standalone `claude` CLI on PATH is NOT required — what matters is
 * whether it can authenticate. Agents run when a subscription token
 * (CLAUDE_CODE_OAUTH_TOKEN) or an API key is present, or the CLI has stored creds.
 */
export const GET = withUser(async () => {
  const hasToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  let cliCreds = false;
  try {
    cliCreds = fs.existsSync(path.join(os.homedir(), ".claude", ".credentials.json"));
  } catch {
    cliCreds = false;
  }
  const authReady = hasToken || hasApiKey || cliCreds;

  const enabled =
    (getDb()
      .select({ n: sql<number>`COUNT(*)` })
      .from(agents)
      .where(sql`is_enabled = 1`)
      .get()?.n ?? 0) > 0;

  const lowMem = os.totalmem() < 1.5 * 1024 * 1024 * 1024;

  return Response.json({
    authReady,
    authSource: hasToken
      ? "subscription-token"
      : hasApiKey
        ? "api-key"
        : cliCreds
          ? "cli-login"
          : null,
    hasEnabledAgent: enabled,
    lowMem,
    setupHint:
      "Set CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) or ANTHROPIC_API_KEY in the environment so agents can authenticate.",
  });
});
