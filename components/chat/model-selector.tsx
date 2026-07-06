"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Search, RefreshCw, Star, Brain } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppStore } from "@/lib/stores/use-app-store";
import { toast } from "@/lib/stores/use-feedback";
import { supportsReasoning, type ModelInfo, type ReasoningEffort } from "@/lib/ai/models";

// Module-level cache so reopening the dropdown (or remounting) doesn't refetch.
const modelCache = new Map<string, ModelInfo[]>();

const EFFORTS: { value: ReasoningEffort; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

/**
 * Advanced model selector for the chat/agent composer. Lists the active
 * provider's live models (via its stored key), lets the user override the model
 * per-conversation, set it as the provider default, and pick a thinking level
 * for reasoning-capable models. Lives beside the provider switcher in ChatInput.
 */
export function ModelSelector() {
  const providers = useAppStore((s) => s.providers);
  const activeId = useAppStore((s) => s.activeProviderId);
  const setProviders = useAppStore((s) => s.setProviders);
  const modelOverride = useAppStore((s) => s.modelOverride);
  const setModelOverride = useAppStore((s) => s.setModelOverride);
  const reasoningEffort = useAppStore((s) => s.reasoningEffort);
  const setReasoningEffort = useAppStore((s) => s.setReasoningEffort);

  const active = providers.find((p) => p.id === activeId);
  const currentModel = modelOverride ?? active?.defaultModel ?? "";

  const [open, setOpen] = useState(false);
  const modelSelectorOpen = useAppStore((s) => s.modelSelectorOpen);
  const setModelSelectorOpen = useAppStore((s) => s.setModelSelectorOpen);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (force = false) => {
      if (!activeId) return;
      if (!force && modelCache.has(activeId)) {
        setModels(modelCache.get(activeId)!);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/providers/${activeId}/models${force ? "?force=1" : ""}`);
        const data = (await res.json()) as { models: ModelInfo[]; error?: string };
        setModels(data.models ?? []);
        modelCache.set(activeId, data.models ?? []);
        if (data.error) setError(data.error);
        else if ((data.models ?? []).length === 0)
          setError("No models returned — type a model id manually.");
      } catch {
        setError("Couldn't reach the provider — type a model id manually.");
      } finally {
        setLoading(false);
      }
    },
    [activeId]
  );

  // Fetch when the dropdown opens.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // The /model slash command pulses this flag to open the dropdown.
  useEffect(() => {
    if (modelSelectorOpen) {
      setOpen(true);
      setModelSelectorOpen(false);
    }
  }, [modelSelectorOpen, setModelSelectorOpen]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!active) return null;

  const filtered = query.trim()
    ? models.filter((m) => m.id.toLowerCase().includes(query.toLowerCase()))
    : models;

  const pick = (id: string) => {
    setModelOverride(id === active.defaultModel ? null : id);
    setQuery("");
    setOpen(false);
  };

  const setDefault = async () => {
    if (!currentModel) return;
    try {
      await fetch(`/api/providers/${active.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultModel: currentModel }),
      });
      const refreshed = await fetch("/api/providers").then((r) => r.json());
      setProviders(refreshed);
      setModelOverride(null);
      toast.success("Default model set", currentModel);
    } catch {
      toast.error("Couldn't set default model");
    }
  };

  const reasoningOn = !!currentModel && supportsReasoning(currentModel);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="glass-input text-text-secondary hover:text-text-primary flex h-7 max-w-[180px] items-center gap-1 rounded-md px-2 text-xs"
        aria-label="Select model"
        title={currentModel || "Select a model"}
      >
        {reasoningOn && reasoningEffort !== "off" && (
          <Brain size={11} className="shrink-0 text-emerald-400" />
        )}
        <span className="truncate">{currentModel || "default model"}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="glass-strong absolute right-0 bottom-full z-50 mb-2 w-72 rounded-xl border border-white/10 p-2 shadow-2xl">
          {/* Search + refresh */}
          <div className="mb-2 flex items-center gap-1">
            <div className="glass-input flex flex-1 items-center gap-1.5 rounded-md px-2">
              <Search size={12} className="text-text-muted shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search or type a model id…"
                className="text-text-primary placeholder:text-text-muted w-full bg-transparent py-1.5 text-xs focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) pick(query.trim());
                }}
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => load(true)}
              className="text-text-muted hover:text-text-primary grid h-7 w-7 place-items-center rounded-md hover:bg-white/5"
              aria-label="Refresh models"
              title="Refresh models"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Reasoning level */}
          {reasoningOn && (
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-text-muted flex items-center gap-1 text-[10px] uppercase">
                <Brain size={11} /> Thinking
              </span>
              <div className="glass-input flex items-center rounded-full p-0.5 text-[10px]">
                {EFFORTS.map((e) => (
                  <button
                    key={e.value}
                    onClick={() => setReasoningEffort(e.value)}
                    className={cn(
                      "h-5 rounded-full px-2 transition-colors",
                      reasoningEffort === e.value
                        ? "bg-emerald-400/20 text-emerald-300"
                        : "text-text-muted hover:text-text-secondary"
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Model list */}
          <div className="-mx-1 max-h-60 overflow-y-auto px-1">
            {loading && models.length === 0 ? (
              <p className="text-text-muted px-2 py-3 text-center text-[11px]">Loading models…</p>
            ) : filtered.length === 0 ? (
              <p className="text-text-muted px-2 py-3 text-center text-[11px]">
                {error ?? "No matching models."}
              </p>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => pick(m.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/5",
                    m.id === currentModel ? "text-emerald-300" : "text-text-secondary"
                  )}
                >
                  <span className="truncate">{m.label || m.id}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {m.reasoning && <Brain size={11} className="text-text-muted" />}
                    {m.id === active.defaultModel && (
                      <Star size={10} className="text-amber-400" fill="currentColor" />
                    )}
                  </span>
                </button>
              ))
            )}
          </div>

          {error && filtered.length > 0 && (
            <p className="px-2 pt-1 text-[10px] text-amber-400/80">{error}</p>
          )}

          {/* Set as default */}
          {currentModel && currentModel !== active.defaultModel && (
            <button
              type="button"
              onClick={setDefault}
              className="text-text-secondary mt-2 flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-white/5 text-[11px] hover:bg-white/10"
            >
              <Star size={11} /> Set “{currentModel}” as default
            </button>
          )}
        </div>
      )}
    </div>
  );
}
