import { generateText } from "ai";
import { getActiveProvider, resolveModel } from "./registry";
import { webSearch, fetchReadable } from "@/lib/services/web";

export interface ResearchEvent {
  type: "status" | "source" | "report" | "error";
  message?: string;
  source?: { title: string; url: string };
  report?: string;
}

/**
 * Multi-step research: plan sub-questions → search each → read top sources →
 * synthesize a cited report. Yields progress events as it goes.
 */
export async function* runResearch(question: string): AsyncGenerator<ResearchEvent> {
  const provider = getActiveProvider();
  if (!provider) {
    yield { type: "error", message: "No active AI provider configured." };
    return;
  }
  const model = resolveModel(provider);

  yield { type: "status", message: "Planning sub-questions…" };
  let subQuestions: string[] = [question];
  try {
    const { text } = await generateText({
      model,
      prompt: `Break this research question into 3-4 focused web-search queries. Return ONLY a JSON array of strings.\n\nQuestion: ${question}`,
    });
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed) && parsed.length) subQuestions = parsed.slice(0, 4).map(String);
    }
  } catch {
    /* fall back to the single question */
  }

  const gathered: { title: string; url: string; content: string }[] = [];

  for (const sq of subQuestions) {
    yield { type: "status", message: `Searching: ${sq}` };
    let results: { title: string; url: string; snippet: string }[] = [];
    try {
      results = await webSearch(sq);
    } catch (err) {
      yield { type: "status", message: `Search failed: ${err instanceof Error ? err.message : String(err)}` };
      continue;
    }

    // Read the top 2 sources per sub-question.
    for (const r of results.slice(0, 2)) {
      if (!r.url) continue;
      yield { type: "source", source: { title: r.title, url: r.url } };
      yield { type: "status", message: `Reading: ${r.title}` };
      try {
        const text = await fetchReadable(r.url);
        gathered.push({ title: r.title, url: r.url, content: text.slice(0, 4000) });
      } catch {
        gathered.push({ title: r.title, url: r.url, content: r.snippet });
      }
    }
  }

  yield { type: "status", message: "Synthesizing report…" };
  const sourcesBlock = gathered
    .map((g, i) => `[${i + 1}] ${g.title} (${g.url})\n${g.content}`)
    .join("\n\n");

  try {
    const { text } = await generateText({
      model,
      prompt: `You are a research analyst. Using the sources below, write a thorough, well-structured markdown report answering the question. Use ## headings, be specific, and cite sources inline as [n]. End with a "## Sources" list.

Question: ${question}

Sources:
${sourcesBlock}`,
    });
    yield { type: "report", report: text };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
