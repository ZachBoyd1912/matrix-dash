"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, Download, Trash2, Check, AlertCircle, ServerCog, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { RECOMMENDED_MODELS, fmtBytes, type OllamaModel } from "@/lib/services/ollama-shared";

interface CookbookData {
  status: { ok: boolean; version?: string; error?: string };
  models: OllamaModel[];
  hardware: { totalRamGb: number | null; freeRamGb: number | null; cpu: string | null; cores: number | null };
}

export default function CookbookPage() {
  const ref = useGsapEntrance();
  const [data, setData] = useState<CookbookData | null>(null);
  const [pulling, setPulling] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/ollama");
    setData(await res.json());
  }, []);

  useEffect(() => {
    refresh();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setOllamaUrl(s.ollamaUrl ?? "http://localhost:11434"));
  }, [refresh]);

  const saveUrl = async () => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ollamaUrl }),
    });
    toast.success("Ollama URL saved");
    refresh();
  };

  const pull = async (name: string) => {
    setPulling(name);
    setProgress("Starting…");
    try {
      const res = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { status?: string; completed?: number; total?: number };
            if (evt.completed && evt.total) {
              const pct = Math.round((evt.completed / evt.total) * 100);
              setProgress(`${evt.status ?? "downloading"} ${pct}%`);
            } else if (evt.status) {
              setProgress(evt.status);
            }
          } catch {
            /* ignore non-json line */
          }
        }
      }
      toast.success(`Pulled ${name}`);
      refresh();
    } catch (err) {
      toast.error("Pull failed", err instanceof Error ? err.message : String(err));
    } finally {
      setPulling(null);
      setProgress("");
    }
  };

  const register = async (model: string) => {
    const res = await fetch("/api/ollama/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (res.ok) toast.success(`Registered ${model} as provider`, "Activate it in AI Providers.");
    else toast.error("Could not register");
  };

  const remove = async (name: string) => {
    const ok = await confirm({ title: `Delete ${name}?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/ollama?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    toast.success("Removed");
    refresh();
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Cookbook (Ollama)</h2>
        <p className="text-text-secondary text-sm mt-1">
          Detect, download, and serve local models via Ollama — register them as providers in one click.
        </p>
      </div>

      <Card>
        <p className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-2">
          <ServerCog size={13} /> Ollama server
        </p>
        <div className="flex items-center gap-2 mb-3">
          <Input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://localhost:11434" className="font-mono text-xs" />
          <Button size="sm" variant="secondary" onClick={saveUrl}>Save</Button>
        </div>
        {data?.status?.ok ? (
          <p className="text-xs text-emerald-400 flex items-center gap-1">
            <Check size={11} /> Connected · v{data.status.version}
          </p>
        ) : (
          <p className="text-xs text-rose-400 flex items-center gap-1">
            <AlertCircle size={11} /> Not reachable {data?.status?.error && `· ${data.status.error}`}
            <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-sky-400 ml-1 hover:underline">Install Ollama</a>
          </p>
        )}
      </Card>

      {data?.hardware && (
        <Card>
          <p className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-2">
            <Cpu size={13} /> Your hardware
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
            <div>{data.hardware.cpu ?? "Unknown CPU"} · {data.hardware.cores} cores</div>
            <div>
              {data.hardware.totalRamGb ?? "?"} GB total · {data.hardware.freeRamGb ?? "?"} GB free
            </div>
          </div>
          {data.hardware.totalRamGb && data.hardware.totalRamGb <= 8 && (
            <p className="text-[10px] text-amber-400 mt-2 flex items-center gap-1">
              <AlertCircle size={10} /> Constrained RAM — stick to 3B-class models or smaller.
            </p>
          )}
        </Card>
      )}

      <Card>
        <p className="text-xs font-semibold text-text-primary mb-3">Installed models</p>
        {data?.models?.length ? (
          <div className="space-y-2">
            {data.models.map((m) => (
              <div key={m.name} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-white/[0.02] border border-white/5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{m.name}</p>
                  <p className="text-[10px] text-text-muted">
                    {fmtBytes(m.size)}{m.details?.parameter_size && ` · ${m.details.parameter_size}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => register(m.name)}>
                    <Plus size={11} /> Register
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(m.name)} aria-label="Remove">
                    <Trash2 size={12} className="text-rose-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No models installed.</p>
        )}
      </Card>

      <Card>
        <p className="text-xs font-semibold text-text-primary mb-3">Recommended for modest hardware</p>
        <div className="space-y-2">
          {RECOMMENDED_MODELS.map((rec) => {
            const installed = data?.models?.some((m) => m.name.startsWith(rec.name.split(":")[0]));
            return (
              <div key={rec.name} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-white/[0.02]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-text-primary">{rec.label}</p>
                    {installed && <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400">Installed</Badge>}
                  </div>
                  <p className="text-[10px] text-text-muted">{rec.note} · <span className="font-mono">{rec.name}</span></p>
                </div>
                <Button size="sm" variant={installed ? "ghost" : "primary"} onClick={() => pull(rec.name)} disabled={pulling !== null || !data?.status?.ok}>
                  <Download size={11} /> {pulling === rec.name ? progress || "Pulling…" : installed ? "Re-pull" : "Pull"}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
