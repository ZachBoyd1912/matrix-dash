"use client";

import { useEffect, useState } from "react";
import {
  GitCompare,
  Loader2,
  Eye,
  EyeOff,
  Send,
  Trophy,
  AlertTriangle,
  BrainCircuit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/chat/markdown";
import { ArtifactPanel, extractArtifact } from "@/components/chat/artifact";
import { EmptyState } from "@/components/ui/empty";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { cn } from "@/lib/utils/cn";
import type { AiProviderPublic } from "@/types/ai-provider";

interface Column {
  providerId: string;
  providerName: string;
  text: string;
  reasoning: string;
  error: string;
  done: boolean;
  revealed: boolean;
  voted: boolean;
}

export default function ComparePage() {
  const ref = useGsapEntrance();
  const [providers, setProviders] = useState<AiProviderPublic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [running, setRunning] = useState(false);
  const [blind, setBlind] = useState(true);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data: AiProviderPublic[]) => {
        setProviders(data);
        setSelected(data.slice(0, 2).map((p) => p.id));
      })
      .catch(() => {});
  }, []);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(0, 4)));

  const run = async () => {
    if (!prompt.trim() || selected.length < 2 || running) return;
    setRunning(true);
    const cols: Column[] = selected.map((id) => ({
      providerId: id,
      providerName: providers.find((p) => p.id === id)?.name ?? "Model",
      text: "",
      reasoning: "",
      error: "",
      done: false,
      revealed: !blind,
      voted: false,
    }));
    setColumns(cols);

    await Promise.all(
      cols.map(async (col, idx) => {
        let text = "";
        let reasoning = "";
        let error = "";
        const patch = () =>
          setColumns((prev) =>
            prev.map((c, i) => (i === idx ? { ...c, text, reasoning, error } : c))
          );

        // Parse one NDJSON object: {type:"text"|"reasoning"|"error", value} or {error}.
        const consume = (line: string) => {
          const t = line.trim();
          if (!t) return;
          try {
            const obj = JSON.parse(t) as { type?: string; value?: string; error?: string };
            if (obj.type === "text") text += obj.value ?? "";
            else if (obj.type === "reasoning") reasoning += obj.value ?? "";
            else if (obj.type === "error") error = String(obj.value ?? "Error");
            else if (obj.error) error = String(obj.error);
          } catch {
            /* partial / non-JSON line — wait for more bytes */
          }
        };

        try {
          const res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: prompt }],
              providerId: col.providerId,
              mode: "chat",
            }),
          });
          if (!res.body) {
            try {
              const j = (await res.json()) as { error?: string };
              error = j?.error || `Request failed (HTTP ${res.status})`;
            } catch {
              error = `Request failed (HTTP ${res.status})`;
            }
            patch();
            return;
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const ln of lines) consume(ln);
            patch();
          }
          if (buf) consume(buf);
          patch();
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          patch();
        } finally {
          setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, done: true } : c)));
        }
      })
    );
    setRunning(false);
  };

  const vote = (idx: number) =>
    setColumns((prev) => prev.map((c, i) => ({ ...c, revealed: true, voted: i === idx })));

  return (
    <div ref={ref} className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-8">
      {/* Header */}
      <div className="relative">
        <div className="orb -top-16 -left-10 h-56 w-56 bg-emerald-500/20" />
        <div
          className="orb -top-10 right-10 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative flex items-end justify-between gap-4">
          <div>
            <span className="eyebrow mb-4">
              <GitCompare size={11} /> Model Arena
            </span>
            <h1 className="display text-gradient mt-4 text-5xl md:text-6xl">Compare</h1>
            <p className="text-text-secondary mt-3 max-w-md text-sm">
              Run one prompt across up to four models, side by side. Generated sites render{" "}
              <span className="text-text-primary">live</span>. Blind mode hides names until you
              vote.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 rounded-full"
            onClick={() => setBlind((b) => !b)}
          >
            {blind ? <EyeOff size={13} /> : <Eye size={13} />} {blind ? "Blind" : "Open"}
          </Button>
        </div>
      </div>

      {providers.length < 2 ? (
        <EmptyState
          icon={<GitCompare size={16} />}
          title="Need at least two providers"
          description="Add more AI providers in Settings → Add Models to compare them head to head."
        />
      ) : (
        <>
          {/* Composer */}
          <div className="bezel">
            <div className="bezel-core space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                {providers.map((p) => {
                  const on = selected.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle(p.id)}
                      className={cn(
                        "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        on
                          ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]"
                          : "text-text-secondary border-white/10 hover:border-white/20 hover:bg-white/5"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full transition-colors",
                          on
                            ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                            : "bg-white/25"
                        )}
                      />
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Build a landing page that shows off parallax scrolling for business sites…"
                className="border-0 bg-transparent px-0 text-[15px] focus:!shadow-none focus:!ring-0"
              />
              <div className="flex items-center justify-between">
                <span className="text-text-muted text-[11px]">
                  {selected.length} selected · ⌘↵ to run
                </span>
                <Button
                  variant="primary"
                  className="group rounded-full"
                  onClick={run}
                  disabled={running || !prompt.trim() || selected.length < 2}
                >
                  {running ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} className="island-icon" />
                  )}
                  {running ? "Running…" : `Run on ${selected.length} models`}
                </Button>
              </div>
            </div>
          </div>

          {/* Results */}
          {columns.length > 0 && (
            <div
              className={cn("grid gap-4", columns.length === 1 ? "grid-cols-1" : "md:grid-cols-2")}
            >
              {columns.map((col, idx) => {
                const label = col.revealed
                  ? col.providerName
                  : `Model ${String.fromCharCode(65 + idx)}`;
                const artifact = col.done && col.text ? extractArtifact(col.text) : null;
                return (
                  <Card key={idx} className="flex min-h-[220px] flex-col">
                    <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold",
                            col.voted
                              ? "bg-emerald-400 text-black"
                              : "text-text-secondary bg-white/[0.06]"
                          )}
                        >
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-text-primary truncate text-sm font-semibold">
                          {label}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!col.done && (
                          <Loader2 size={12} className="animate-spin text-emerald-400" />
                        )}
                        {col.voted && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                            <Trophy size={11} /> your pick
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex-1">
                      {col.error ? (
                        <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs">
                          <AlertTriangle size={14} className="mt-px shrink-0 text-rose-400" />
                          <div className="min-w-0">
                            <p className="font-medium text-rose-300">
                              Couldn&apos;t get a response
                            </p>
                            <p className="text-text-secondary mt-1 break-words">{col.error}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {col.reasoning && (
                            <details className="group mb-2 rounded-lg border border-white/5 bg-white/[0.02]">
                              <summary className="text-text-muted hover:text-text-secondary flex cursor-pointer items-center gap-1.5 px-3 py-2 text-[11px] select-none">
                                <BrainCircuit size={12} /> Thinking
                              </summary>
                              <div className="text-text-muted max-h-40 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                                {col.reasoning}
                              </div>
                            </details>
                          )}
                          {col.text ? (
                            <Markdown content={col.text} />
                          ) : (
                            <div className="text-text-muted flex items-center gap-2 text-xs">
                              <Loader2 size={12} className="animate-spin" /> thinking…
                            </div>
                          )}
                          {artifact && <ArtifactPanel artifact={artifact} title={label} />}
                        </>
                      )}
                    </div>

                    {col.done && !col.voted && !col.error && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3 rounded-full"
                        onClick={() => vote(idx)}
                      >
                        <Trophy size={12} /> Pick this one
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
