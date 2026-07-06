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

export async function readRepoFile(connectionId: string, repo: string, path: string, ref?: string) {
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
export async function listFiles(connectionId: string, repo: string, path = "", ref?: string) {
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
  const res = await request(`/repos/${repo}/contents/${path}?ref=${ref}`, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
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
  return issues
    .filter((i) => !i.pull_request)
    .map((i: any) => ({
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
  const res = await request(`/repos/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`, {
    method: "DELETE",
  });
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
  q += "+is:issue";

  const res = await request(`/search/issues?q=${q}&per_page=${options?.perPage ?? 20}`);
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

// ─── PHASE 3: PULL REQUEST OPERATIONS ────────────────────

/** List pull requests for a repository with filters. */
export async function listPRs(
  connectionId: string,
  repo: string,
  options?: {
    state?: "open" | "closed" | "all";
    sort?: "created" | "updated" | "popularity" | "long-running";
    direction?: "asc" | "desc";
    perPage?: number;
    page?: number;
  }
) {
  const { request } = api(connectionId);
  const params = new URLSearchParams();
  params.set("state", options?.state ?? "open");
  params.set("sort", options?.sort ?? "updated");
  params.set("direction", options?.direction ?? "desc");
  params.set("per_page", String(options?.perPage ?? 20));
  params.set("page", String(options?.page ?? 1));

  const res = await request(`/repos/${repo}/pulls?${params}`);
  if (!res.ok) return [];
  const prs: any[] = await res.json();
  return prs.map((p: any) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.draft ?? false,
    head: p.head?.ref,
    base: p.base?.ref,
    user: p.user?.login,
    labels: (p.labels ?? []).map((l: any) => l.name),
    htmlUrl: p.html_url,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

/** Get full details of a single pull request. */
export async function getPR(connectionId: string, repo: string, number: number) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/pulls/${number}`);
  if (!res.ok) return null;
  const p = await res.json();
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.draft ?? false,
    body: p.body,
    head: p.head?.ref,
    base: p.base?.ref,
    user: p.user?.login,
    labels: (p.labels ?? []).map((l: any) => l.name),
    assignees: (p.assignees ?? []).map((a: any) => a.login),
    requestedReviewers: (p.requested_reviewers ?? []).map((r: any) => r.login),
    mergeable: p.mergeable,
    merged: p.merged ?? false,
    additions: p.additions,
    deletions: p.deletions,
    changedFiles: p.changed_files,
    comments: p.comments,
    reviewComments: p.review_comments,
    commits: p.commits,
    htmlUrl: p.html_url,
    diffUrl: p.diff_url,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    mergedAt: p.merged_at,
    closedAt: p.closed_at,
  };
}

/** Update a PR's title, body, state, or base branch. */
export async function updatePR(
  connectionId: string,
  repo: string,
  number: number,
  updates: { title?: string; body?: string; state?: "open" | "closed"; base?: string }
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/pulls/${number}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!res.ok) return { error: `Failed to update PR: ${res.status}` };
  const p = await res.json();
  return { number: p.number, title: p.title, state: p.state, htmlUrl: p.html_url };
}

/** Merge a pull request. */
export async function mergePR(
  connectionId: string,
  repo: string,
  number: number,
  options?: {
    commitTitle?: string;
    commitMessage?: string;
    mergeMethod?: "merge" | "squash" | "rebase";
  }
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/pulls/${number}/merge`, {
    method: "PUT",
    body: JSON.stringify({
      commit_title: options?.commitTitle,
      commit_message: options?.commitMessage,
      merge_method: options?.mergeMethod ?? "merge",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.message || `Merge failed: ${res.status}`, merged: false };
  }
  const m = await res.json();
  return { merged: m.merged ?? true, message: m.message, sha: m.sha };
}

/** Request reviewers for a PR. */
export async function requestReview(
  connectionId: string,
  repo: string,
  number: number,
  reviewers: string[]
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/pulls/${number}/requested_reviewers`, {
    method: "POST",
    body: JSON.stringify({ reviewers }),
  });
  if (!res.ok) return { error: `Review request failed: ${res.status}` };
  const r = await res.json();
  return { requested: (r.requested_reviewers ?? []).map((u: any) => u.login) };
}

/** List reviews on a pull request. */
export async function listReviews(
  connectionId: string,
  repo: string,
  number: number,
  options?: { perPage?: number; page?: number }
) {
  const { request } = api(connectionId);
  const params = new URLSearchParams();
  params.set("per_page", String(options?.perPage ?? 30));
  params.set("page", String(options?.page ?? 1));

  const res = await request(`/repos/${repo}/pulls/${number}/reviews?${params}`);
  if (!res.ok) return [];
  const reviews: any[] = await res.json();
  return reviews.map((r: any) => ({
    id: r.id,
    state: r.state,
    body: r.body?.slice(0, 1000),
    user: r.user?.login,
    htmlUrl: r.html_url,
    submittedAt: r.submitted_at,
  }));
}

/** Submit a review (approve, request changes, or comment). */
export async function reviewPR(
  connectionId: string,
  repo: string,
  number: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body?: string
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/pulls/${number}/reviews`, {
    method: "POST",
    body: JSON.stringify({ event, body }),
  });
  if (!res.ok) return { error: `Review failed: ${res.status}` };
  const r = await res.json();
  return { id: r.id, state: r.state, htmlUrl: r.html_url };
}

/** Get inline review comments on a PR. */
export async function listPRComments(
  connectionId: string,
  repo: string,
  number: number,
  options?: { perPage?: number; page?: number }
) {
  const { request } = api(connectionId);
  const params = new URLSearchParams();
  params.set("per_page", String(options?.perPage ?? 30));
  params.set("page", String(options?.page ?? 1));

  const res = await request(`/repos/${repo}/pulls/${number}/comments?${params}`);
  if (!res.ok) return [];
  const comments: any[] = await res.json();
  return comments.map((c: any) => ({
    id: c.id,
    body: c.body,
    user: c.user?.login,
    path: c.path,
    line: c.line,
    htmlUrl: c.html_url,
    createdAt: c.created_at,
  }));
}

/** Add a general or inline review comment to a PR. */
export async function commentOnPR(
  connectionId: string,
  repo: string,
  number: number,
  body: string,
  options?: { path?: string; line?: number; side?: "LEFT" | "RIGHT" }
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/pulls/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body,
      commit_id: options?.line ? "HEAD" : undefined,
      path: options?.path,
      line: options?.line,
      side: options?.side,
    }),
  });
  if (!res.ok) return { error: `Comment failed: ${res.status}` };
  const c = await res.json();
  return { id: c.id, body: c.body, user: c.user?.login, path: c.path, htmlUrl: c.html_url };
}

/** Get CI/CD check runs for a PR's head commit. */
export async function getPRChecks(connectionId: string, repo: string, sha: string) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/commits/${sha}/check-runs`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.check_runs ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
    htmlUrl: r.html_url,
    detailsUrl: r.details_url,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  }));
}

// ─── PHASE 4: REPOSITORY ADMINISTRATION ──────────────────

/** Create a new repository. */
export async function createRepo(
  connectionId: string,
  name: string,
  options?: {
    description?: string;
    private?: boolean;
    autoInit?: boolean;
    gitignoreTemplate?: string;
    licenseTemplate?: string;
  }
) {
  const { request } = api(connectionId);
  const res = await request("/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name,
      description: options?.description,
      private: options?.private ?? false,
      auto_init: options?.autoInit ?? false,
      gitignore_template: options?.gitignoreTemplate,
      license_template: options?.licenseTemplate,
    }),
  });
  if (!res.ok) return { error: `Failed to create repo: ${res.status}` };
  const r = await res.json();
  return {
    fullName: r.full_name,
    name: r.name,
    private: r.private,
    htmlUrl: r.html_url,
    cloneUrl: r.clone_url,
  };
}

/** Delete a repository. Requires confirmation. */
export async function deleteRepo(connectionId: string, repo: string) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}`, { method: "DELETE" });
  return { ok: res.ok || res.status === 404 };
}

/** Update repository settings. */
export async function updateRepo(
  connectionId: string,
  repo: string,
  updates: {
    name?: string;
    description?: string;
    private?: boolean;
    hasIssues?: boolean;
    hasProjects?: boolean;
    hasWiki?: boolean;
    defaultBranch?: string;
    homepage?: string;
    topics?: string[];
  }
) {
  const { request } = api(connectionId);
  const body: any = { ...updates };
  if (updates.topics) body.has_topics = true;
  const res = await request(`/repos/${repo}`, {
    method: "PATCH",
    body: JSON.stringify({ ...body, topics: undefined }),
    headers: { Accept: "application/vnd.github.mercy-preview+json" },
  });
  if (!res.ok) return { error: `Failed to update repo: ${res.status}` };

  // Set topics separately
  if (updates.topics) {
    await request(`/repos/${repo}/topics`, {
      method: "PUT",
      body: JSON.stringify({ names: updates.topics }),
      headers: { Accept: "application/vnd.github.mercy-preview+json" },
    });
  }

  const r = await res.json();
  return { fullName: r.full_name, name: r.name, private: r.private, htmlUrl: r.html_url };
}

/** Fork a repository. */
export async function forkRepo(connectionId: string, repo: string, organization?: string) {
  const { request } = api(connectionId);
  const body = organization ? JSON.stringify({ organization }) : undefined;
  const res = await request(`/repos/${repo}/forks`, { method: "POST", body });
  if (!res.ok) return { error: `Failed to fork: ${res.status}` };
  const r = await res.json();
  return { fullName: r.full_name, htmlUrl: r.html_url, cloneUrl: r.clone_url };
}

/** Create a new branch from any ref. */
export async function createBranch(
  connectionId: string,
  repo: string,
  branch: string,
  fromRef = "main"
) {
  const { request } = api(connectionId);
  // Get SHA of fromRef
  const refRes = await request(`/repos/${repo}/git/refs/heads/${fromRef}`);
  if (!refRes.ok) return { error: `Source branch not found: ${fromRef}` };
  const ref = await refRes.json();
  const sha = ref.object?.sha;

  const res = await request(`/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
  if (!res.ok) return { error: `Failed to create branch: ${res.status}` };
  const b = await res.json();
  return { ref: b.ref, sha: b.object?.sha };
}

/** Delete a branch. */
export async function deleteBranch(connectionId: string, repo: string, branch: string) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "DELETE",
  });
  return { ok: res.ok || res.status === 404 };
}

/** Get file contents (for updating) or create/update a file with a commit. */
export async function commitFile(
  connectionId: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  options?: { branch?: string; sha?: string }
) {
  const { request } = api(connectionId);
  const body: any = {
    message,
    content: Buffer.from(content).toString("base64"),
    branch: options?.branch,
  };
  if (options?.sha) body.sha = options.sha;

  const res = await request(`/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.message || `Commit failed: ${res.status}` };
  }
  const c = await res.json();
  return {
    path: c.content?.path,
    sha: c.content?.sha,
    commit: {
      sha: c.commit?.sha?.slice(0, 7),
      message: c.commit?.message,
      htmlUrl: c.commit?.html_url,
    },
  };
}

// ─── PHASE 5: WORKFLOWS & ACTIONS ────────────────────────

/** List GitHub Actions workflows in a repo. */
export async function listWorkflows(connectionId: string, repo: string) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/actions/workflows`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.workflows ?? []).map((w: any) => ({
    id: w.id,
    name: w.name,
    state: w.state,
    path: w.path,
    htmlUrl: w.html_url,
    badgeUrl: w.badge_url,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }));
}

/** Get recent workflow runs with optional status/branch filters. */
export async function getWorkflowRuns(
  connectionId: string,
  repo: string,
  workflowId?: number,
  options?: { branch?: string; status?: string; perPage?: number; page?: number }
) {
  const { request } = api(connectionId);
  const path = workflowId
    ? `/repos/${repo}/actions/workflows/${workflowId}/runs`
    : `/repos/${repo}/actions/runs`;
  const params = new URLSearchParams();
  if (options?.branch) params.set("branch", options.branch);
  if (options?.status) params.set("status", options.status);
  params.set("per_page", String(options?.perPage ?? 10));
  params.set("page", String(options?.page ?? 1));

  const res = await request(`${path}?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.workflow_runs ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
    branch: r.head_branch,
    event: r.event,
    htmlUrl: r.html_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Trigger a workflow_dispatch event. */
export async function triggerWorkflow(
  connectionId: string,
  repo: string,
  workflowId: number,
  ref: string,
  inputs?: Record<string, string>
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref, inputs }),
  });
  return { ok: res.ok || res.status === 204 };
}

/** Cancel a running workflow run. */
export async function cancelWorkflowRun(connectionId: string, repo: string, runId: number) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/actions/runs/${runId}/cancel`, {
    method: "POST",
  });
  return { ok: res.ok };
}

/** Get logs URL for a workflow run. */
export async function getWorkflowLogs(connectionId: string, repo: string, runId: number) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/actions/runs/${runId}/logs`, {
    redirect: "manual",
  });
  // GitHub returns 302 redirect to log archive
  return {
    downloadUrl: res.headers.get("location"),
    expiresAt: res.headers.get("expires"),
  };
}

// ─── PHASE 6: EXTENDED GITHUB ────────────────────────────

/** Get any GitHub user's public profile. */
export async function getUserProfile(connectionId: string, username: string) {
  const { request } = api(connectionId);
  const res = await request(`/users/${username}`);
  if (!res.ok) return null;
  const u = await res.json();
  return {
    login: u.login,
    name: u.name,
    bio: u.bio,
    company: u.company,
    blog: u.blog,
    location: u.location,
    email: u.email,
    followers: u.followers,
    following: u.following,
    publicRepos: u.public_repos,
    publicGists: u.public_gists,
    avatarUrl: u.avatar_url,
    htmlUrl: u.html_url,
    createdAt: u.created_at,
  };
}

/** List organizations the authenticated user belongs to. */
export async function listOrganizations(connectionId: string) {
  const { request } = api(connectionId);
  const res = await request("/user/orgs");
  if (!res.ok) return [];
  const orgs: any[] = await res.json();
  return orgs.map((o: any) => ({
    login: o.login,
    id: o.id,
    description: o.description,
    avatarUrl: o.avatar_url,
  }));
}

/** Star a repository. */
export async function starRepo(connectionId: string, repo: string) {
  const { request } = api(connectionId);
  const res = await request(`/user/starred/${repo}`, { method: "PUT" });
  return { ok: res.ok || res.status === 204 };
}

/** Unstar a repository. */
export async function unstarRepo(connectionId: string, repo: string) {
  const { request } = api(connectionId);
  const res = await request(`/user/starred/${repo}`, { method: "DELETE" });
  return { ok: res.ok || res.status === 204 };
}

/** Check remaining API rate limit. */
export async function getRateLimit(connectionId: string) {
  const { request } = api(connectionId);
  const res = await request("/rate_limit");
  if (!res.ok) return null;
  const data = await res.json();
  const core = data.resources?.core;
  return {
    limit: core?.limit,
    remaining: core?.remaining,
    used: core?.used,
    reset: core?.reset ? new Date(core.reset * 1000).toISOString() : null,
    search: { remaining: data.resources?.search?.remaining, limit: data.resources?.search?.limit },
  };
}

/** List milestones for a repository. */
export async function listMilestones(
  connectionId: string,
  repo: string,
  options?: { state?: "open" | "closed" | "all"; perPage?: number; page?: number }
) {
  const { request } = api(connectionId);
  const params = new URLSearchParams();
  params.set("state", options?.state ?? "open");
  params.set("per_page", String(options?.perPage ?? 30));
  params.set("page", String(options?.page ?? 1));

  const res = await request(`/repos/${repo}/milestones?${params}`);
  if (!res.ok) return [];
  const milestones: any[] = await res.json();
  return milestones.map((m: any) => ({
    number: m.number,
    title: m.title,
    description: m.description,
    state: m.state,
    dueOn: m.due_on,
    openIssues: m.open_issues,
    closedIssues: m.closed_issues,
    htmlUrl: m.html_url,
    createdAt: m.created_at,
  }));
}

/** Create a milestone. */
export async function createMilestone(
  connectionId: string,
  repo: string,
  title: string,
  options?: { description?: string; dueOn?: string; state?: "open" | "closed" }
) {
  const { request } = api(connectionId);
  const res = await request(`/repos/${repo}/milestones`, {
    method: "POST",
    body: JSON.stringify({
      title,
      description: options?.description,
      due_on: options?.dueOn,
      state: options?.state,
    }),
  });
  if (!res.ok) return { error: `Failed to create milestone: ${res.status}` };
  const m = await res.json();
  return {
    number: m.number,
    title: m.title,
    state: m.state,
    dueOn: m.due_on,
    htmlUrl: m.html_url,
  };
}

/** List a user's gists. */
export async function listGists(connectionId: string, perPage = 20) {
  const { request } = api(connectionId);
  const res = await request(`/gists?per_page=${perPage}`);
  if (!res.ok) return [];
  const gists: any[] = await res.json();
  return gists.map((g: any) => ({
    id: g.id,
    description: g.description,
    files: Object.keys(g.files ?? {}),
    public: g.public,
    htmlUrl: g.html_url,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  }));
}

/** Create a gist. */
export async function createGist(
  connectionId: string,
  files: Record<string, { content: string }>,
  options?: { description?: string; public?: boolean }
) {
  const { request } = api(connectionId);
  const res = await request("/gists", {
    method: "POST",
    body: JSON.stringify({
      description: options?.description,
      public: options?.public ?? false,
      files,
    }),
  });
  if (!res.ok) return { error: `Failed to create gist: ${res.status}` };
  const g = await res.json();
  return {
    id: g.id,
    description: g.description,
    files: Object.keys(g.files ?? {}),
    htmlUrl: g.html_url,
    public: g.public,
  };
}

/** List unread notifications. */
export async function listNotifications(
  connectionId: string,
  options?: { all?: boolean; perPage?: number; page?: number }
) {
  const { request } = api(connectionId);
  const params = new URLSearchParams();
  if (options?.all) params.set("all", "true");
  params.set("per_page", String(options?.perPage ?? 20));
  params.set("page", String(options?.page ?? 1));

  const res = await request(`/notifications?${params}`);
  if (!res.ok) return [];
  const notifications: any[] = await res.json();
  return notifications.map((n: any) => ({
    id: n.id,
    reason: n.reason,
    unread: n.unread,
    subject: { title: n.subject?.title, type: n.subject?.type, url: n.subject?.url },
    repository: n.repository?.full_name,
    htmlUrl: n.subject?.url
      ?.replace("api.github.com/repos", "github.com")
      .replace("/pulls/", "/pull/")
      .replace("/issues/", "/issues/"),
    updatedAt: n.updated_at,
  }));
}

/** Mark a notification as read. */
export async function markNotificationRead(connectionId: string, threadId?: number) {
  const { request } = api(connectionId);
  const url = threadId ? `/notifications/threads/${threadId}` : "/notifications";
  const res = await request(url, { method: "PATCH" });
  return { ok: res.ok || res.status === 205 };
}
