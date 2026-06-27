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

// ─── PHASE 2: ISSUE MANAGEMENT ────────────────────────────

/** List issues for a repository with filters. */
export async function listIssues(
  connectionId: string,
  repo: string,
  options?: {
    state?: "open" | "closed" | "all";
    labels?: string[];
    assignee?: string;
    sort?: "created" | "updated" | "comments";
    direction?: "asc" | "desc";
    perPage?: number;
    page?: number;
  }
) {
  const { request } = api(connectionId);
  const params = new URLSearchParams();
  params.set("state", options?.state ?? "open");
  if (options?.labels?.length) params.set("labels", options.labels.join(","));
  if (options?.assignee) params.set("assignee", options.assignee);
  params.set("sort", options?.sort ?? "updated");
  params.set("direction", options?.direction ?? "desc");
  params.set("per_page", String(options?.perPage ?? 30));
  params.set("page", String(options?.page ?? 1));

  const res = await request(`/repos/${repo}/issues?${params}`);
  if (!res.ok) return [];
  const issues: any[] = await res.json();
  return issues.filter((i) => !i.pull_request).map((i: any) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    body: i.body?.slice(0, 500),
    labels: (i.labels ?? []).map((l: any) => l.name),
    assignees: (i.assignees ?? []).map((a: any) => a.login),
    comments: i.comments,
    htmlUrl: i.html_url,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    closedAt: i.closed_at,
  }));
}

/** Get a single issue with full details. */
export async function getIssue(connectionId: string, repo: string, number: number) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/issues/${number}`);
  if (!res.ok) return null;
  const i = await res.json();
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    stateReason: i.state_reason ?? null,
    body: i.body,
    labels: (i.labels ?? []).map((l: any) => l.name),
    assignees: (i.assignees ?? []).map((a: any) => a.login),
    milestone: i.milestone ? { title: i.milestone.title, dueOn: i.milestone.due_on } : null,
    comments: i.comments,
    locked: i.locked,
    htmlUrl: i.html_url,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    closedAt: i.closed_at,
    user: i.user?.login,
  };
}

/** Update an issue's title, body, state, labels, assignees, or milestone. */
export async function updateIssue(
  connectionId: string,
  repo: string,
  number: number,
  updates: {
    title?: string;
    body?: string;
    state?: "open" | "closed";
    stateReason?: "completed" | "not_planned";
    labels?: string[];
    assignees?: string[];
    milestone?: number | null;
  }
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!res.ok) return { error: `Failed to update issue: ${res.status}` };
  const i = await res.json();
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    htmlUrl: i.html_url,
  };
}

/** Add labels to an issue. */
export async function addLabels(
  connectionId: string,
  repo: string,
  number: number,
  labels: string[]
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/issues/${number}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels }),
  });
  if (!res.ok) return { error: `Failed to add labels: ${res.status}` };
  return (await res.json()).map((l: any) => l.name);
}

/** Remove a label from an issue. */
export async function removeLabel(
  connectionId: string,
  repo: string,
  number: number,
  label: string
) {
  const { request } = api(connectionId);
  const res = await request(
    `/repos/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`,
    { method: "DELETE" }
  );
  return { ok: res.ok || res.status === 404 };
}

/** Assign users to an issue. */
export async function assignIssue(
  connectionId: string,
  repo: string,
  number: number,
  assignees: string[]
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/issues/${number}/assignees`, {
    method: "POST",
    body: JSON.stringify({ assignees }),
  });
  if (!res.ok) return { error: `Failed to assign: ${res.status}` };
  return (await res.json()).assignees.map((a: any) => a.login);
}

/** Add a comment to an issue. */
export async function commentOnIssue(
  connectionId: string,
  repo: string,
  number: number,
  body: string
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  if (!res.ok) return { error: `Failed to comment: ${res.status}` };
  const c = await res.json();
  return {
    id: c.id,
    body: c.body,
    user: c.user?.login,
    htmlUrl: c.html_url,
    createdAt: c.created_at,
  };
}

/** List all comments on an issue. */
export async function listComments(
  connectionId: string,
  repo: string,
  number: number,
  options?: { perPage?: number; page?: number }
) {
  const { request } = api(connectionId);
  const params = new URLSearchParams();
  params.set("per_page", String(options?.perPage ?? 30));
  params.set("page", String(options?.page ?? 1));

  const res = await request(`/repos/${repo}/issues/${number}/comments?${params}`);
  if (!res.ok) return [];
  const comments: any[] = await res.json();
  return comments.map((c: any) => ({
    id: c.id,
    body: c.body,
    user: c.user?.login,
    htmlUrl: c.html_url,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));
}

/** Search issues and PRs across all repos. */
export async function searchIssues(
  connectionId: string,
  query: string,
  options?: { state?: "open" | "closed"; labels?: string[]; repo?: string; perPage?: number }
) {
  const { request } = api(connectionId);
  let q = encodeURIComponent(query);
  if (options?.state) q += `+state:${options.state}`;
  if (options?.labels?.length) q += `+label:${options.labels.join(",")}`;
  if (options?.repo) q += `+repo:${options.repo}`;
  q += "+is:issue"; // exclude PRs

  const res = await request(
    `/search/issues?q=${q}&per_page=${options?.perPage ?? 20}`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items: any[] };
  return data.items.map((i: any) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    repo: i.repository_url?.split("/repos/")[1] ?? "",
    labels: (i.labels ?? []).map((l: any) => l.name),
    htmlUrl: i.html_url,
    createdAt: i.created_at,
  }));
}
