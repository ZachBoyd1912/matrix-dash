import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { githubRepos } from "@/lib/db/schema";
import type { GitHubRepoPublic } from "@/types/jarvis";

export const dynamic = "force-dynamic";

function toPublic(row: typeof githubRepos.$inferSelect): GitHubRepoPublic {
  return {
    id: row.id,
    fullName: row.fullName,
    owner: row.owner,
    name: row.name,
    description: row.description,
    stars: row.stars,
    language: row.language,
    isPrivate: row.isPrivate,
    defaultBranch: row.defaultBranch ?? "main",
    htmlUrl: row.htmlUrl,
    syncedAt: row.syncedAt,
  };
}

export async function GET() {
  const rows = getDb().select().from(githubRepos).orderBy(desc(githubRepos.stars)).all();
  return Response.json(rows.map(toPublic));
}
