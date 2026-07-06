import { randomUUID } from "crypto";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { skills } from "@/lib/db/schema";
import { withLog, logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Importing a large skill catalog fans out to many raw.githubusercontent fetches.
export const maxDuration = 300;

const schema = z.object({ repoUrl: z.string().min(1).max(2048) });

const GH_HEADERS = {
  // GitHub rejects unauthenticated API calls that omit a User-Agent.
  "User-Agent": "matrix-dash",
  Accept: "application/vnd.github+json",
};

// Hard ceiling so a pathological repo can't queue an unbounded import.
const MAX_SKILLS = 5000;
// raw.githubusercontent is a CDN (no 60/hr API limit) but still be polite.
const FETCH_CONCURRENCY = 24;

interface ParsedSkill {
  name: string;
  description: string;
  instructions: string;
}

/** owner/repo out of any github.com URL form (with or without trailing path/.git). */
function parseRepo(url: string): { owner: string; repo: string } | null {
  const cleaned = url.trim().replace(/\.git$/, "");
  const m = cleaned.match(/github\.com[/:]([^/]+)\/([^/?#]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * Pull name/description/instructions out of a SKILL.md. Handles two shapes:
 *  1. YAML-ish frontmatter (`--- name: x  description: y ---`) — Anthropic skill format.
 *  2. Plain markdown: first `# Heading` → name, first paragraph → description.
 * The full body (minus frontmatter) always becomes the instructions.
 */
function parseSkillMd(raw: string, fallbackName: string): ParsedSkill {
  let name = "";
  let description = "";
  let body = raw.replace(/^﻿/, "");

  const fm = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const kv = line.match(/^\s*(name|description|title)\s*:\s*(.+?)\s*$/i);
      if (!kv) continue;
      const key = kv[1].toLowerCase();
      const val = kv[2].replace(/^["']|["']$/g, "").trim();
      if ((key === "name" || key === "title") && !name) name = val;
      if (key === "description" && !description) description = val;
    }
    body = body.slice(fm[0].length);
  }

  if (!name) {
    const heading = body.match(/^#{1,3}\s+(.+?)\s*$/m);
    if (heading) name = heading[1].trim();
  }
  if (!description) {
    // First non-empty, non-heading line block becomes the description.
    const afterHeading = body.replace(/^#{1,6}\s+.+?(\n|$)/m, "");
    const para = afterHeading
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith("#") && !p.startsWith("---"));
    if (para) description = para.replace(/\s+/g, " ").slice(0, 280);
  }

  return {
    name: (name || fallbackName).slice(0, 120),
    description: description.slice(0, 500),
    instructions: body.trim(),
  };
}

/** Run an async fn over items with a bounded number of in-flight calls. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export const POST = withLog(async (req) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "A GitHub repo URL is required" }, { status: 400 });
  }

  const repo = parseRepo(parsed.data.repoUrl);
  if (!repo) {
    return Response.json(
      { error: "That doesn't look like a github.com repo URL" },
      { status: 400 }
    );
  }

  try {
    // 1. Resolve the default branch (main/master/whatever).
    const metaRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
      headers: GH_HEADERS,
    });
    if (metaRes.status === 404) {
      return Response.json({ error: "Repository not found (is it public?)" }, { status: 404 });
    }
    if (metaRes.status === 403) {
      return Response.json(
        { error: "GitHub rate limit reached — try again in a few minutes." },
        { status: 429 }
      );
    }
    if (!metaRes.ok) {
      return Response.json({ error: `GitHub error ${metaRes.status}` }, { status: 502 });
    }
    const meta = (await metaRes.json()) as { default_branch?: string };
    const branch = meta.default_branch || "main";

    // 2. Flat recursive tree of the whole repo.
    const treeRes = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${branch}?recursive=1`,
      { headers: GH_HEADERS }
    );
    if (!treeRes.ok) {
      return Response.json(
        { error: `Could not read repo tree (${treeRes.status})` },
        { status: 502 }
      );
    }
    const tree = (await treeRes.json()) as {
      tree?: { path: string; type: string }[];
      truncated?: boolean;
    };

    const allSkillMd = (tree.tree ?? [])
      .filter((e) => e.type === "blob" && /(^|\/)SKILL\.md$/i.test(e.path))
      .map((e) => e.path);

    // Many catalog repos vendor a second, packaged copy of every skill under
    // plugins/** (or vendor/**, dist/**). Those inflate the count and import
    // duplicates. Prefer a canonical top-level `skills/` directory when present;
    // only fall back to "everything" for repos that don't have one.
    const canonical = allSkillMd.filter((p) => /^skills\//i.test(p));
    let skillPaths = canonical.length ? canonical : allSkillMd;

    // Collapse paths that point at the same skill folder (same basename dir),
    // keeping the shortest path (the least-nested / canonical copy).
    const byFolder = new Map<string, string>();
    for (const p of skillPaths) {
      const folder = p.split("/").slice(-2, -1)[0] || p;
      const key = folder.toLowerCase();
      const prev = byFolder.get(key);
      if (!prev || p.length < prev.length) byFolder.set(key, p);
    }
    skillPaths = [...byFolder.values()];

    const found = skillPaths.length;
    if (found === 0) {
      return Response.json(
        { imported: 0, skipped: 0, found: 0, error: "No SKILL.md files found in that repo." },
        { status: 404 }
      );
    }

    const cappedPaths = skillPaths.slice(0, MAX_SKILLS);

    // 3. Existing names (case-insensitive) so we skip duplicates.
    const db = getDb();
    const existing = new Set(
      db
        .select({ name: skills.name })
        .from(skills)
        .all()
        .map((r) => r.name.toLowerCase())
    );

    // 4. Fetch every SKILL.md in parallel (bounded) and parse it.
    let fetchFailures = 0;
    const fetched = await mapPool(cappedPaths, FETCH_CONCURRENCY, async (path) => {
      try {
        const rawRes = await fetch(
          `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${branch}/${path}`,
          { headers: { "User-Agent": "matrix-dash" } }
        );
        if (!rawRes.ok) {
          fetchFailures++;
          return null;
        }
        const rawText = await rawRes.text();
        const folder = path.split("/").slice(-2, -1)[0] || path.replace(/\.md$/i, "");
        return parseSkillMd(rawText, folder);
      } catch {
        fetchFailures++;
        return null;
      }
    });

    // 5. Dedup by name and insert everything in one transaction (fast + atomic).
    const seenThisRun = new Set<string>();
    const now = new Date().toISOString();
    const toInsert: (typeof skills.$inferInsert)[] = [];
    let duplicates = 0;
    for (const skill of fetched) {
      if (!skill) continue;
      const key = skill.name.toLowerCase();
      if (existing.has(key) || seenThisRun.has(key)) {
        duplicates++;
        continue;
      }
      seenThisRun.add(key);
      toInsert.push({
        id: randomUUID(),
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        isEnabled: false, // imported skills start disabled — user opts in (see chat route)
        createdAt: now,
        updatedAt: now,
      });
    }

    if (toInsert.length > 0) {
      db.transaction((tx) => {
        for (const row of toInsert) tx.insert(skills).values(row).run();
      });
    }

    const imported = toInsert.length;
    const skipped = duplicates + fetchFailures;
    logger.ok(
      `Imported ${imported} skill(s) from ${repo.owner}/${repo.repo} ` +
        `(${found} found, ${duplicates} dup, ${fetchFailures} fetch-fail)`
    );
    return Response.json({
      imported,
      skipped,
      found,
      truncated: !!tree.truncated || found > MAX_SKILLS,
      repo: `${repo.owner}/${repo.repo}`,
    });
  } catch (err) {
    logger.error("Skill import failed", err);
    return Response.json(
      { error: "Import failed — check the URL and your connection." },
      { status: 500 }
    );
  }
});
