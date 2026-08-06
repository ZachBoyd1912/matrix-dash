"use client";

import { useRef, useState } from "react";
import { FlaskConical, Loader2, ExternalLink, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/chat/markdown";
import { EmptyState } from "@/components/ui/empty";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { ResearchEvent } from "@/lib/ai/research";

export default function ResearchPage() {
  const ref = useGsapEntrance();
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [report, setReport] = useState("");
  const reportRef = useRef("");

  const run = async () => {
    if (!question.trim() || running) return;
    setRunning(true);
    setStatuses([]);
    setSources([]);
    setReport("");
    reportRef.current = "";

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ResearchEvent;
          if (event.type === "status" && event.message) setStatuses((s) => [...s, event.message!]);
          if (event.type === "source" && event.source) setSources((s) => [...s, event.source!]);
          if (event.type === "report" && event.report) {
            reportRef.current = event.report;
            setReport(event.report);
          }
          if (event.type === "error") toast.error("Research failed", event.message);
        }
      }
    } catch (err) {
      toast.error("Research failed", err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const saveAsNote = async () => {
    await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `Research: ${question.slice(0, 60)}`,
        content: reportRef.current,
      }),
    });
    toast.success("Saved to Notes");
  };

  return (
    <div ref={ref} className="mx-auto max-w-3xl space-y-6 px-4 py-10 md:px-8">
      <div className="relative overflow-hidden">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-10 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <FlaskConical size={11} /> Deep Research
          </span>
          <h1 className="display text-gradient mt-3 text-4xl tracking-tight md:text-5xl">
            Deep Research
          </h1>
          <p className="text-text-secondary mt-2 text-sm">
            The agent plans sub-questions, searches the web, reads sources, and synthesizes a cited
            report.
          </p>
        </div>
      </div>

      <Card interactive className="space-y-3 rounded-2xl">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="What do you want researched? e.g. 'Compare the best local LLM runtimes for an 8GB Mac in 2026.'"
        />
        <div className="flex justify-end">
          <Button variant="primary" onClick={run} disabled={running || !question.trim()}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {running ? "Researching…" : "Start research"}
          </Button>
        </div>
      </Card>

      {(running || statuses.length > 0) && (
        <Card interactive className="rounded-2xl">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-text-primary text-xs font-semibold">Progress</p>
            {running && <Loader2 size={12} className="animate-spin text-emerald-400" />}
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {statuses.map((s, i) => (
              <p key={i} className="text-text-secondary flex items-center gap-1.5 text-[11px]">
                <span className="h-1 w-1 rounded-full bg-emerald-400/60" /> {s}
              </p>
            ))}
          </div>
          {sources.length > 0 && (
            <div className="mt-3 border-t border-white/5 pt-3">
              <p className="text-text-muted mb-1.5 text-[10px] uppercase">
                Sources ({sources.length})
              </p>
              <div className="space-y-1">
                {sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 truncate text-[11px] text-sky-400 hover:underline"
                  >
                    <ExternalLink size={9} className="shrink-0" />{" "}
                    <span className="truncate">{s.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {report ? (
        <Card interactive className="rounded-2xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-text-primary text-sm font-semibold">Report</p>
            <Button size="sm" variant="secondary" onClick={saveAsNote}>
              <Save size={12} /> Save to Notes
            </Button>
          </div>
          <Markdown content={report} />
        </Card>
      ) : (
        !running &&
        statuses.length === 0 && (
          <EmptyState
            icon={<FlaskConical size={16} />}
            title="No research yet"
            description="Ask a question above to generate a cited report."
          />
        )
      )}
    </div>
  );
}
