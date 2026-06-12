"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cpu,
  Download,
  Trash2,
  Check,
  AlertCircle,
  ServerCog,
  Plus,
  Play,
  Square,
  RotateCw,
  RefreshCw,
  Search,
  HardDrive,
  Boxes,
  Wrench,
  Loader2,
  Gauge,
  Save,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import {
  fmtBytes,
  MODEL_REGISTRY,
  scoreModel,
  FIT_META,
  TAG_META,
  QUANTS,
  type Quant,
  type ModelTag,
  type OllamaModel,
} from "@/lib/services/ollama-shared";

interface Hardware {
  totalRamGb: number | null;
  freeRamGb: number | null;
  cpu: string | null;
  cores: number | null;
  gpu: string | null;
  vramGb: number | null;
  unified: boolean;
  usableVramGb: number;
  chip: "apple" | "nvidia" | "amd" | "intel" | "cpu";
}

interface CookbookData {
  status: { ok: boolean; version?: string; error?: string };
  models: OllamaModel[];
  hardware: Hardware;
}

interface LoadedModel {
  name: string;
  size: number;
  sizeVram?: number;
  expiresAt?: string;
}
interface ServeData {
  status: { running: boolean; pid?: number; memMb?: number; cpu?: number; startedAt?: string; version?: string };
  loaded: LoadedModel[];
}

interface Dep {
  name: string;
  kind: "system" | "python";
  type: string;
  group: "app" | "server";
  description: string;
  install: string;
  installed: boolean;
}

interface OllamaConfig {
  numCtx: number;
  numGpu: number;
  keepAlive: string;
  numThread: number;
}

const TABS = [
  { value: "download", label: "Download", icon: <Download size={13} /> },
  { value: "serve", label: "Serve", icon: <ServerCog size={13} /> },
  { value: "deps", label: "Dependencies", icon: <Boxes size={13} /> },
  { value: "settings", label: "Settings", icon: <Wrench size={13} /> },
];

const CHIP_LABEL: Record<Hardware["chip"], string> = {
  apple: "Apple Silicon",
  nvidia: "NVIDIA",
  amd: "AMD",
  intel: "Intel",
  cpu: "CPU only",
};

function fmtCtx(n: number): string {
  if (n >= 1024) return `${Math.round(n / 1024)}K`;
  return String(n);
}

export default function CookbookPage() {
  const ref = useGsapEntrance();
  const [tab, setTab] = useState("download");
  const [data, setData] = useState<CookbookData | null>(null);
  const [pulling, setPulling] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ollama");
      setData(await res.json());
    } catch {
      toast.error("Could not reach the Cookbook API");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // --- shared pull (used by Download tab) ---
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
    try {
      const res = await fetch("/api/ollama/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (res.ok) toast.success(`Registered ${model}`, "Activate it in AI Providers.");
      else toast.error("Could not register");
    } catch {
      toast.error("Could not register");
    }
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
        <h2 className="text-xl font-bold tracking-tight">Cookbook</h2>
        <p className="text-text-secondary text-sm mt-1">
          Hardware-aware model downloads, server control, and dependencies for local LLMs via Ollama.
        </p>
      </div>

      <HardwareBanner data={data} onRescan={refresh} />

      <Tabs value={tab} onValueChange={setTab} tabs={TABS} />

      {tab === "download" && (
        <DownloadTab
          data={data}
          pulling={pulling}
          progress={progress}
          onPull={pull}
          onRegister={register}
          onRemove={remove}
        />
      )}
      {tab === "serve" && <ServeTab connected={!!data?.status?.ok} />}
      {tab === "deps" && <DepsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

/* ----------------------------- Hardware banner ----------------------------- */

function HardwareBanner({ data, onRescan }: { data: CookbookData | null; onRescan: () => void }) {
  const hw = data?.hardware;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-2">
            <Cpu size={13} /> Detected hardware
          </p>
          {hw ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Badge className="bg-violet-400/10 border-violet-400/20 text-violet-300">{CHIP_LABEL[hw.chip]}</Badge>
              <span className="text-text-secondary">{hw.cpu ?? "Unknown CPU"} · {hw.cores ?? "?"} cores</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-secondary">{hw.totalRamGb ?? "?"} GB RAM ({hw.freeRamGb ?? "?"} free)</span>
              {hw.gpu && (
                <>
                  <span className="text-text-muted">·</span>
                  <span className="text-text-secondary">{hw.gpu}</span>
                </>
              )}
              <span className="text-text-muted">·</span>
              <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-300">
                <HardDrive size={10} /> {hw.usableVramGb} GB usable {hw.unified ? "(unified)" : "VRAM"}
              </Badge>
            </div>
          ) : (
            <p className="text-xs text-text-muted">Scanning…</p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onRescan} className="shrink-0">
          <RefreshCw size={12} /> Rescan
        </Button>
      </div>
      {data && !data.status.ok && (
        <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-3">
          <AlertCircle size={11} /> Ollama not reachable{data.status.error && ` · ${data.status.error}`}
          <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-sky-400 ml-1 hover:underline">
            Install Ollama
          </a>
        </p>
      )}
    </Card>
  );
}

/* ------------------------------ Download tab ------------------------------ */

const TAG_OPTIONS: (ModelTag | "all")[] = ["all", "general", "coding", "reasoning", "vision", "embed"];

function DownloadTab({
  data,
  pulling,
  progress,
  onPull,
  onRegister,
  onRemove,
}: {
  data: CookbookData | null;
  pulling: string | null;
  progress: string;
  onPull: (name: string) => void;
  onRegister: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<ModelTag | "all">("all");
  const [quant, setQuant] = useState<Quant>("Q4_K_M");
  const [showAll, setShowAll] = useState(false);

  const usable = data?.hardware?.usableVramGb ?? 8;
  const installedNames = useMemo(() => new Set((data?.models ?? []).map((m) => m.name)), [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MODEL_REGISTRY.map((m) => ({ m, s: scoreModel(m, usable, quant) }))
      .filter(({ m, s }) => {
        if (tag !== "all" && !m.tags.includes(tag)) return false;
        if (!showAll && s.fit === "NO") return false;
        if (q && !(`${m.label} ${m.name}`.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => b.s.score - a.s.score);
  }, [search, tag, quant, showAll, usable]);

  const isInstalled = (name: string) =>
    installedNames.has(name) ||
    // tagless registry ids (e.g. "nomic-embed-text") match "nomic-embed-text:latest"
    (!name.includes(":") && [...installedNames].some((n) => n.split(":")[0] === name));

  return (
    <div className="space-y-4">
      {/* Installed models */}
      {data?.models?.length ? (
        <Card>
          <p className="text-xs font-semibold text-text-primary mb-3">Installed ({data.models.length})</p>
          <div className="space-y-2">
            {data.models.map((m) => (
              <div key={m.name} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-white/[0.02] border border-white/5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{m.name}</p>
                  <p className="text-[10px] text-text-muted">
                    {fmtBytes(m.size)}
                    {m.details?.parameter_size && ` · ${m.details.parameter_size}`}
                    {m.details?.quantization_level && ` · ${m.details.quantization_level}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => onRegister(m.name)}>
                    <Plus size={11} /> Register
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onRemove(m.name)} aria-label="Remove">
                    <Trash2 size={12} className="text-rose-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models…" className="pl-8" />
          </div>
          <Select value={tag} onChange={(e) => setTag(e.target.value as ModelTag | "all")}>
            {TAG_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All types" : TAG_META[t].label}
              </option>
            ))}
          </Select>
          <Select value={quant} onChange={(e) => setQuant(e.target.value as Quant)}>
            {QUANTS.map((qq) => (
              <option key={qq} value={qq}>
                {qq}
              </option>
            ))}
          </Select>
          <Button size="sm" variant={showAll ? "secondary" : "ghost"} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "All models" : "Fits this machine"}
          </Button>
        </div>

        {/* Model table */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                <th className="py-2 pr-2 font-medium">Fit</th>
                <th className="py-2 pr-2 font-medium">Model</th>
                <th className="py-2 pr-2 font-medium">Param</th>
                <th className="py-2 pr-2 font-medium">Quant</th>
                <th className="py-2 pr-2 font-medium">VRAM</th>
                <th className="py-2 pr-2 font-medium">Ctx</th>
                <th className="py-2 pr-2 font-medium">t/s</th>
                <th className="py-2 pr-2 font-medium">Score</th>
                <th className="py-2 pr-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, s }) => {
                const installed = isInstalled(m.name);
                const busy = pulling === m.name;
                return (
                  <tr key={m.name} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 pr-2">
                      <Badge className={FIT_META[s.fit].cls}>{FIT_META[s.fit].label}</Badge>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-text-primary">{m.label}</span>
                        {m.tags.map((t) => (
                          <span key={t} className={`text-[9px] uppercase ${TAG_META[t].cls}`}>
                            {TAG_META[t].label}
                          </span>
                        ))}
                      </div>
                      <span className="text-[10px] font-mono text-text-muted">{m.name}</span>
                    </td>
                    <td className="py-2 pr-2 text-[11px] text-text-secondary whitespace-nowrap">{m.paramLabel}</td>
                    <td className="py-2 pr-2 text-[11px] text-text-secondary whitespace-nowrap">{quant}</td>
                    <td className="py-2 pr-2 text-[11px] text-text-secondary whitespace-nowrap">{s.vramGb} GB</td>
                    <td className="py-2 pr-2 text-[11px] text-text-secondary whitespace-nowrap">{fmtCtx(m.ctx)}</td>
                    <td className="py-2 pr-2 text-[11px] text-text-secondary whitespace-nowrap">~{s.speed}</td>
                    <td className="py-2 pr-2 text-[11px] font-semibold text-text-primary whitespace-nowrap">{s.score}</td>
                    <td className="py-2 pr-0 text-right">
                      {installed ? (
                        <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400">
                          <Check size={10} /> Installed
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant={s.fit === "NO" ? "ghost" : "primary"}
                          onClick={() => onPull(m.name)}
                          disabled={pulling !== null || !data?.status?.ok}
                        >
                          {busy ? (
                            <>
                              <Loader2 size={11} className="animate-spin" /> {progress || "Pulling…"}
                            </>
                          ) : (
                            <>
                              <Download size={11} /> Pull
                            </>
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-xs text-text-muted">
                    No models match. Try “All models”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------- Serve tab ------------------------------- */

function ServeTab({ connected }: { connected: boolean }) {
  const [serve, setServe] = useState<ServeData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ollama/serve");
      setServe(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setUrl(s.ollamaUrl ?? "http://localhost:11434"))
      .catch(() => {});
  }, [load]);

  const act = async (action: "start" | "stop" | "restart") => {
    setBusy(action);
    try {
      const res = await fetch("/api/ollama/serve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      toast.success(`Ollama ${action} ok`);
      setServe((prev) => (prev ? { ...prev, status: json.status } : prev));
      load();
    } catch (err) {
      toast.error(`Could not ${action}`, err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const saveUrl = async () => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ollamaUrl: url }),
    });
    toast.success("Ollama URL saved");
    load();
  };

  const st = serve?.status;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs font-semibold text-text-primary flex items-center gap-2">
            <ServerCog size={13} /> Server status
          </p>
          {st?.running ? (
            <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400">
              <Check size={10} /> Running{st.version && ` · v${st.version}`}
            </Badge>
          ) : (
            <Badge className="bg-rose-500/10 border-rose-500/20 text-rose-300">Stopped</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] text-text-secondary mb-3">
          <div>PID: <span className="text-text-primary">{st?.pid ?? "—"}</span></div>
          <div>Memory: <span className="text-text-primary">{st?.memMb ? `${st.memMb} MB` : "—"}</span></div>
          <div>CPU: <span className="text-text-primary">{st?.cpu != null ? `${st.cpu}%` : "—"}</span></div>
          {st?.startedAt && <div className="col-span-2 md:col-span-3">Started: <span className="text-text-primary">{st.startedAt}</span></div>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => act("start")} disabled={busy !== null || st?.running}>
            {busy === "start" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Start
          </Button>
          <Button size="sm" variant="danger" onClick={() => act("stop")} disabled={busy !== null || !st?.running}>
            {busy === "stop" ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />} Stop
          </Button>
          <Button size="sm" variant="secondary" onClick={() => act("restart")} disabled={busy !== null}>
            {busy === "restart" ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />} Restart
          </Button>
          <Button size="sm" variant="ghost" onClick={load} className="ml-auto">
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
        {!connected && (
          <p className="text-[10px] text-amber-400 mt-2">Start may require Ollama installed on PATH.</p>
        )}
      </Card>

      <Card>
        <p className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-2">
          <Boxes size={13} /> Loaded in memory
        </p>
        {serve?.loaded?.length ? (
          <div className="space-y-1.5">
            {serve.loaded.map((m) => (
              <div key={m.name} className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded bg-white/[0.02]">
                <span className="text-text-primary font-medium">{m.name}</span>
                <span className="text-text-muted">
                  {fmtBytes(m.size)}
                  {m.sizeVram ? ` · ${fmtBytes(m.sizeVram)} VRAM` : ""}
                  {m.expiresAt ? ` · until ${new Date(m.expiresAt).toLocaleTimeString()}` : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No models currently loaded.</p>
        )}
      </Card>

      <Card>
        <p className="text-xs font-semibold text-text-primary mb-2">Ollama URL</p>
        <div className="flex items-center gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:11434" className="font-mono text-xs" />
          <Button size="sm" variant="secondary" onClick={saveUrl}>Save</Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------- Dependencies tab ---------------------------- */

function DepsTab() {
  const [deps, setDeps] = useState<Dep[] | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ollama/deps");
      const json = await res.json();
      setDeps(json.deps);
    } catch {
      toast.error("Could not probe dependencies");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const install = async (d: Dep) => {
    setInstalling(d.name);
    try {
      const res = await fetch("/api/ollama/deps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: d.name }),
      });
      const json = await res.json();
      if (json.manual) {
        toast.info(`Install ${d.name} manually`, json.instruction);
      } else if (json.installed) {
        toast.success(`Installed ${d.name}`);
        load();
      } else {
        toast.error(`Install failed`, json.error || "Unknown error");
      }
    } catch (err) {
      toast.error("Install failed", err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(null);
    }
  };

  const groups: { key: "app" | "server"; label: string }[] = [
    { key: "app", label: "App dependencies" },
    { key: "server", label: "Server dependencies" },
  ];

  const typeCls: Record<string, string> = {
    System: "bg-sky-400/10 border-sky-400/20 text-sky-300",
    LLM: "bg-violet-400/10 border-violet-400/20 text-violet-300",
    Image: "bg-amber-400/10 border-amber-400/20 text-amber-300",
    Tools: "bg-emerald-400/10 border-emerald-400/20 text-emerald-300",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw size={12} /> Re-scan
        </Button>
      </div>
      {groups.map((g) => (
        <Card key={g.key}>
          <p className="text-xs font-semibold text-text-primary mb-3">{g.label}</p>
          {!deps ? (
            <p className="text-xs text-text-muted">Probing…</p>
          ) : (
            <div className="space-y-2">
              {deps
                .filter((d) => d.group === g.key)
                .map((d) => (
                  <div key={d.name} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-white/[0.02] border border-white/5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-text-primary">{d.name}</span>
                        <Badge className={typeCls[d.type] ?? ""}>{d.type}</Badge>
                        <span className="text-[9px] uppercase text-text-muted">{d.kind}</span>
                      </div>
                      <p className="text-[10px] text-text-muted">{d.description}</p>
                    </div>
                    {d.installed ? (
                      <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400 shrink-0">
                        <Check size={10} /> Installed
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant={d.kind === "python" ? "primary" : "outline"}
                        onClick={() => install(d)}
                        disabled={installing !== null}
                        className="shrink-0"
                      >
                        {installing === d.name ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Download size={11} />
                        )}
                        {d.kind === "python" ? "Install" : "How to"}
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------ Settings tab ------------------------------ */

function SettingsTab() {
  const [cfg, setCfg] = useState<OllamaConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ollama/config")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => toast.error("Could not load Ollama config"));
  }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ollama/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      toast.success("Ollama config saved", "Applied on next server start.");
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) return <Card><p className="text-xs text-text-muted">Loading…</p></Card>;

  const num = (k: keyof OllamaConfig) => cfg[k] as number;
  const setNum = (k: keyof OllamaConfig, v: string) => setCfg({ ...cfg, [k]: parseInt(v, 10) || 0 });

  return (
    <Card>
      <p className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-2">
        <Gauge size={13} /> Runtime configuration
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Context window (num_ctx)" hint="Tokens held in the model's context">
          <Input type="number" value={num("numCtx")} onChange={(e) => setNum("numCtx", e.target.value)} />
        </Field>
        <Field label="GPU layers (num_gpu)" hint="999 = offload all layers to GPU">
          <Input type="number" value={num("numGpu")} onChange={(e) => setNum("numGpu", e.target.value)} />
        </Field>
        <Field label="Keep alive" hint="How long an idle model stays loaded (e.g. 5m, 1h, -1 = forever)">
          <Input value={cfg.keepAlive} onChange={(e) => setCfg({ ...cfg, keepAlive: e.target.value })} />
        </Field>
        <Field label="Threads (num_thread)" hint="0 = auto-detect CPU threads">
          <Input type="number" value={num("numThread")} onChange={(e) => setNum("numThread", e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save config
        </Button>
        <p className="text-[10px] text-text-muted">
          num_ctx &amp; keep_alive are injected as env vars (OLLAMA_CONTEXT_LENGTH / OLLAMA_KEEP_ALIVE) on next start.
        </p>
      </div>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-text-secondary block mb-1">{label}</label>
      {children}
      <p className="text-[10px] text-text-muted mt-1">{hint}</p>
    </div>
  );
}
