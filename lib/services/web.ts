import { getSetting } from "@/lib/db/settings";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Web search with graceful provider selection:
 *  1. Tavily (if `tavilyKey` set) — best quality
 *  2. SearXNG JSON endpoint (if `searxngUrl` set) — self-hosted
 *  3. DuckDuckGo Instant Answer (no key, limited) — fallback
 */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const tavilyKey = getSetting("tavilyKey");
  if (tavilyKey) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: tavilyKey, query, max_results: 8 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
      return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
    }
  }

  const searxng = getSetting("searxngUrl");
  if (searxng) {
    const url = new URL(searxng.replace(/\/$/, "") + "/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
      return (data.results ?? []).slice(0, 8).map((r) => ({ title: r.title, url: r.url, snippet: r.content ?? "" }));
    }
  }

  // DuckDuckGo Instant Answer — keyless but shallow.
  const ddg = new URL("https://api.duckduckgo.com/");
  ddg.searchParams.set("q", query);
  ddg.searchParams.set("format", "json");
  ddg.searchParams.set("no_html", "1");
  const res = await fetch(ddg, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: { Text?: string; FirstURL?: string }[];
  };
  const out: SearchResult[] = [];
  if (data.AbstractText) {
    out.push({ title: data.Heading ?? query, url: data.AbstractURL ?? "", snippet: data.AbstractText });
  }
  for (const topic of data.RelatedTopics ?? []) {
    if (topic.Text && topic.FirstURL) {
      out.push({ title: topic.Text.slice(0, 80), url: topic.FirstURL, snippet: topic.Text });
    }
  }
  return out.slice(0, 8);
}

/** Fetch a URL and strip it down to readable plain text. */
export async function fetchReadable(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 MatrixDash/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const html = await res.text();
  return htmlToText(html);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
