"use client";

import { useEffect, useRef, useState } from "react";
import { GitCompare, Loader2, Eye, EyeOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/chat/markdown";
import { EmptyState } from "@/components/ui/empty";
import { cn } from "@/lib/utils/cn";
import type { AiProviderPublic } from "@/types/ai-provider";

interface Column {
  providerId: string;
  providerName: string;
  text: string;
  done: boolean;
  revealed: boolean;
  voted: boolean;
}

export default function ComparePage() {
  const [providers, setProviders] = useState<AiProviderPublic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [running, setRunning] = useState(false);
  const [blind, setBlind] = useState(true);
  const startedRef = useRef(false);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data: AiProviderPublic[]) => {
        setProviders(data);
        setSelected(data.slice(0, 2).map((p) => p.id));
      });
  }, []);

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(0, 4)));
  };

  const run = async () => {
    if (!prompt.trim() || selected.length < 2 || running) return;
    startedRef.current = true;
    setRunning(true);
    const cols: Column[] = selected.map((id) => ({
      providerId: id,
      providerName: providers.find((p) => p.id === id)?.name ?? "Model",
      text: "",
      done: false,
      revealed: !blind,
      voted: false,
    }));
    setColumns(cols);

    await Promise.all(
      cols.map(async (col, idx) => {
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
          if (!res.body) throw new Error("no stream");
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let acc = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += decoder.decode(value, { stream: true });
            setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, text: acc } : c)));
          }
        } catch (err) {
          setColumns((prev) =>
            prev.map((c, i) => (i === idx ? { ...c, text: `Error: ${err instanceof Error ? err.message : String(err)}` } : c))
          );
        } finally {
          setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, done: true } : c)));
        }
      })
    );
    setRunning(false);
  };

  const vote = (idx: number) => {
    setColumns((prev) => prev.map((c, i) => ({ ...c, revealed: true, voted: i === idx })));
  };

  return (
    <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitCompare size={20} className="text-emerald-400" /> Compare
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Run one prompt across models side by side. Blind mode hides names until you vote.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setBlind((b) => !b)}>
          {blind ? <EyeOff size={13} /> : <Eye size={13} />} {blind ? "Blind" : "Open"}
        </Button>
      </div>

      {providers.length < 2 ? (
        <EmptyState
          icon={<GitCompare size={16} />}
          title="Need at least two providers"
          description="Add more AI providers in Settings to compare them."
        />
      ) : (
        <>
          <Card className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "px-3 h-8 rounded-md text-xs transition-colors border",
                    selected.includes(p.id)
                      ? "bg-emerald-400/15 border-emerald-400/30 text-emerald-300"
                      : "border-white/10 text-text-secondary hover:bg-white/5"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Prompt to send to all selected models…"
            />
            <div className="flex justify-end">
              <Button variant="primary" onClick={run} disabled={running || !prompt.trim() || selected.length < 2}>
                {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {running ? "Running…" : `Run on ${selected.length} models`}
              </Button>
            </div>
          </Card>

          {columns.length > 0 && (
            <div className={cn("grid gap-3", columns.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3")}>
              {columns.map((col, idx) => (
                <Card key={idx} className="flex flex-col min-h-[200px]">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                    <span className="text-xs font-semibold text-text-primary">
                      {col.revealed ? col.providerName : `Model ${String.fromCharCode(65 + idx)}`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!col.done && <Loader2 size={11} className="animate-spin text-emerald-400" />}
                      {col.voted && <span className="text-[10px] text-emerald-400">★ your pick</span>}
                    </div>
                  </div>
                  <div className="flex-1 text-xs">
                    {col.text ? <Markdown content={col.text} /> : <span className="text-text-muted">…</span>}
                  </div>
                  {col.done && !col.voted && (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => vote(idx)}>
                      Pick this one
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
