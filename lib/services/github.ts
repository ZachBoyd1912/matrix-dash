import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { githubConnections, githubRepos } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";

interface GitHubRepo {
  full_name: string;
  owner: { login: string };
  name: string;
  description: string;
  stargazers_count: number;
  language: string;
  private: boolean;
  default_branch: string;
  html_url: string;
}

function api(connectionId: string) {
  const conn = getDb()
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.id, connectionId))
    .get();
  if (!conn) throw new Error("No GitHub connection found");
  const token = decrypt(conn.accessToken);
  return {
    token,
    request: (path: string, init?: RequestInit) =>
      fetch(`https://api.github.com${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          ...init?.headers,
        },
      }),
  };
}

export async function testGitHubConnection(connectionId: string): Promise<boolean> {
  try {
    const res = await api(connectionId).request("/user");
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncRepos(connectionId: string) {
  const { request } = api(connectionId);
  const repos: GitHubRepo[] = [];
  let page = 1;
  while (true) {
    const res = await request(`/user/repos?per_page=100&page=${page}&sort=updated`);
    if (!res.ok) break;
    const batch = (await res.json()) as GitHubRepo[];
    if (!batch.length) break;
    repos.push(...batch);
    page++;
  }
  const db = getDb();
  const now = new Date().toISOString();
  for (const r of repos) {
    db.insert(githubRepos)
      .values({
        id: randomUUID(),
        connectionId,
        fullName: r.full_name,
        owner: r.owner.login,
        name: r.name,
        description: r.description ?? "",
        stars: r.stargazers_count,
        language: r.language ?? "",
        isPrivate: r.private,
        defaultBranch: r.default_branch,
        htmlUrl: r.html_url,
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: [githubRepos.fullName, githubRepos.connectionId],
        set: { stars: r.stargazers_count, syncedAt: now },
      })
      .run();
  }
  db.update(githubConnections)
    .set({ lastSyncedAt: now, updatedAt: now })
    .where(eq(githubConnections.id, connectionId))
    .run();
  return repos.length;
}

export async function createIssue(
  connectionId: string,
  repo: string,
  title: string,
  body: string,
  labels?: string[]
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });
  return res.json();
}

export async function createPR(
  connectionId: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base = "main"
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, body, head, base }),
  });
  return res.json();
}

export async function searchRepos(connectionId: string, query: string) {
  const { request } = api(connectionId);
  const conn = getDb()
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.id, connectionId))
    .get();
  const res = await request(
    `/search/repositories?q=${encodeURIComponent(query)}+user:${conn?.githubUser}`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items: GitHubRepo[] };
  return data.items.map((r) => ({
    full_name: r.full_name,
    name: r.name,
    description: r.description,
    stars: r.stargazers_count,
    language: r.language,
  }));
}

export async function readRepoFile(
  connectionId: string,
  repo: string,
  path: string,
  ref?: string
) {
  const { request } = api(connectionId);
  const qs = ref ? `?ref=${ref}` : "";
  const res = await request(`/repos/${repo}/contents/${path}${qs}`, {
    headers: { Accept: "application/vnd.github.raw+json" },
  });
  if (!res.ok) return null;
  return { content: await res.text(), path };
}
