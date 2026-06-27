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

  // Use deterministic IDs so upserts work naturally
  for (const r of repos) {
    const id = `${connectionId}:${r.full_name}`;
    // Check if repo exists (by id)
    const existing = db
      .select({ id: githubRepos.id })
      .from(githubRepos)
      .where(eq(githubRepos.id, id))
      .get();

    if (existing) {
      db.update(githubRepos)
        .set({
          description: r.description ?? "",
          stars: r.stargazers_count,
          language: r.language ?? "",
          isPrivate: r.private,
          defaultBranch: r.default_branch,
          syncedAt: now,
        })
        .where(eq(githubRepos.id, id))
        .run();
    } else {
      db.insert(githubRepos)
        .values({
          id,
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
        .run();
    }
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
  return { content: await res.text(), path, repo };
}

// ─── PHASE 1: REPOSITORY INTELLIGENCE ───────────────────────

/** Get detailed metadata for a single repository. */
export async function getRepo(connectionId: string, repo: string) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}`);
  if (!res.ok) return null;
  const r = await res.json();
  return {
    fullName: r.full_name,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    language: r.language,
    topics: r.topics ?? [],
    license: r.license?.spdx_id ?? null,
    isPrivate: r.private,
    defaultBranch: r.default_branch,
    htmlUrl: r.html_url,
    cloneUrl: r.clone_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    pushedAt: r.pushed_at,
  };
}

/** Search code across all repositories the user has access to. */
export async function searchCode(connectionId: string, query: string, repo?: string) {
  const { request } = api(connectionId);
  let q = encodeURIComponent(query);
  if (repo) q += `+repo:${repo}`;
  const res = await request(`/search/code?q=${q}&per_page=20`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items: any[] };
  return data.items.map((item: any) => ({
    repo: item.repository.full_name,
    path: item.path,
    name: item.name,
    htmlUrl: item.html_url,
    score: item.score,
  }));
}

/** List directory contents at a given path in a repository. */
export async function listFiles(
  connectionId: string,
  repo: string,
  path = "",
  ref?: string
) {
  const { request } = api(connectionId);
  const qs = ref ? `?ref=${ref}` : "";
  const res = await request(`/repos/${repo}/contents/${path}${qs}`);
  if (!res.ok) return null;
  const items: any[] = await res.json();
  if (!Array.isArray(items)) return null; // single file, not directory
  return items.map((item: any) => ({
    name: item.name,
    path: item.path,
    type: item.type as "file" | "dir",
    size: item.size,
    htmlUrl: item.html_url,
  }));
}

/** Read a binary file (image, font, etc.) and return as base64. */
export async function getBlob(connectionId: string, repo: string, path: string, ref?: string) {
  const { request } = api(connectionId);
  const qs = ref ? `?ref=${ref}` : "";
  const res = await request(`/repos/${repo}/contents/${path}${qs}`, {
    headers: { Accept: "application/vnd.github.raw+json" },
  });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    content: buffer.toString("base64"),
    encoding: "base64" as const,
    path,
    repo,
    size: buffer.length,
  };
}

/** Read multiple files in parallel (efficient cross-file analysis). */
export async function readMultipleFiles(
  connectionId: string,
  repo: string,
  paths: string[],
  ref?: string
) {
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        return await readRepoFile(connectionId, repo, path, ref);
      } catch {
        return { path, content: null, error: "Failed to read" };
      }
    })
  );
  return results;
}

/** Get full commit details including diff and files changed. */
export async function getCommit(connectionId: string, repo: string, sha: string) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/commits/${sha}`);
  if (!res.ok) return null;
  const c = await res.json();
  return {
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? c.author?.login,
    date: c.commit.author?.date,
    htmlUrl: c.html_url,
    stats: c.stats,
    files: (c.files ?? []).map((f: any) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch?.slice(0, 2000), // truncated for context window
    })),
  };
}

/** Paginated commit history for a branch or path. */
export async function listCommits(
  connectionId: string,
  repo: string,
  options?: {
    branch?: string;
    path?: string;
    author?: string;
    since?: string;
    perPage?: number;
    page?: number;
  }
) {
  const { request } = api(connectionId);
  const params = new URLSearchParams();
  if (options?.branch) params.set("sha", options.branch);
  if (options?.path) params.set("path", options.path);
  if (options?.author) params.set("author", options.author);
  if (options?.since) params.set("since", options.since);
  params.set("per_page", String(options?.perPage ?? 20));
  params.set("page", String(options?.page ?? 1));

  const res = await request(`/repos/${repo}/commits?${params}`);
  if (!res.ok) return [];
  const commits: any[] = await res.json();
  return commits.map((c: any) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name ?? c.author?.login,
    date: c.commit.author?.date,
    htmlUrl: c.html_url,
  }));
}

/** Compare two commits, branches, or tags. */
export async function compareCommits(
  connectionId: string,
  repo: string,
  base: string,
  head: string
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/compare/${base}...${head}`);
  if (!res.ok) return null;
  const c = await res.json();
  return {
    status: c.status,
    aheadBy: c.ahead_by,
    behindBy: c.behind_by,
    totalCommits: c.total_commits,
    commits: (c.commits ?? []).map((cm: any) => ({
      sha: cm.sha.slice(0, 7),
      message: cm.commit.message.split("\n")[0],
      author: cm.commit.author?.name,
    })),
    files: (c.files ?? []).map((f: any) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
    htmlUrl: c.html_url,
    diffUrl: c.diff_url,
  };
}

/** Get line-by-line git blame for a file. */
export async function blame(
  connectionId: string,
  repo: string,
  path: string,
  options?: { ref?: string; lineStart?: number; lineEnd?: number }
) {
  const { request } = api(connectionId);
  // GitHub doesn't have a native blame endpoint, but we can use the content API
  // with the blame media type to get commit info per line
  const ref = options?.ref ?? "HEAD";
  const res = await request(
    `/repos/${repo}/contents/${path}?ref=${ref}`,
    { headers: { Accept: "application/vnd.github.v3+json" } }
  );
  if (!res.ok) return null;

  // Fall back to using the commits endpoint per file
  const commitRes = await request(
    `/repos/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1&sha=${ref}`
  );
  if (!commitRes.ok) return null;
  const commits: any[] = await commitRes.json();

  return {
    path,
    repo,
    lastCommit: commits[0]
      ? {
          sha: commits[0].sha.slice(0, 7),
          author: commits[0].commit.author?.name,
          date: commits[0].commit.author?.date,
          message: commits[0].commit.message.split("\n")[0],
        }
      : null,
    totalCommits: commits.length > 0 ? undefined : 0,
  };
}

/** Get the latest release for a repository. */
export async function getLatestRelease(connectionId: string, repo: string) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/releases/latest`);
  if (!res.ok) return null;
  const r = await res.json();
  return {
    tagName: r.tag_name,
    name: r.name,
    body: r.body?.slice(0, 1000),
    draft: r.draft,
    prerelease: r.prerelease,
    htmlUrl: r.html_url,
    createdAt: r.created_at,
    publishedAt: r.published_at,
    assets: (r.assets ?? []).map((a: any) => ({
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      url: a.browser_download_url,
    })),
  };
}
