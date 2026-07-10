import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { githubConnections } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ owner: string; repo: string; n: string }>;
}

export const GET = withUser(async (_req: Request, ctx: Ctx) => {
  const { owner, repo, n } = await ctx.params;
  const conn = getDb()
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.isActive, true))
    .get();
  if (!conn) {
    return Response.json({ error: "No active GitHub connection" }, { status: 400 });
  }
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${n}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_CLIENT_ID || ""}`,
      Accept: "application/vnd.github+json",
    },
  });
  const data = await res.json();
  return Response.json(data);
});

export const PATCH = withUser(async (req: Request, ctx: Ctx) => {
  const { owner, repo, n } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const conn = getDb()
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.isActive, true))
    .get();
  if (!conn) {
    return Response.json({ error: "No active GitHub connection" }, { status: 400 });
  }
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${n}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_CLIENT_ID || ""}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return Response.json(data);
});
