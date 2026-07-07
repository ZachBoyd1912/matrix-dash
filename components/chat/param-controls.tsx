"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import type { GenerationParams } from "@/types/settings";

interface SliderField {
  key: "temperature" | "topP" | "frequencyPenalty" | "presencePenalty";
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDER_FIELDS: SliderField[] = [
  { key: "temperature", label: "Temperature", min: 0, max: 2, step: 0.1 },
  { key: "topP", label: "Top P", min: 0, max: 1, step: 0.05 },
  { key: "frequencyPenalty", label: "Frequency penalty", min: -1, max: 1, step: 0.1 },
  { key: "presencePenalty", label: "Presence penalty", min: -1, max: 1, step: 0.1 },
];

interface Props {
  value: GenerationParams;
  onChange: (next: GenerationParams) => void;
  /** Collapsed by default; the chat composer wants this, a preset editor may not. */
  collapsible?: boolean;
}

/**
 * Sampling-parameter controls (temperature, top P, penalties, max tokens, seed,
 * stop sequences) — reused as-is by both the chat composer's Advanced panel
 * (bound to the Zustand store) and the persona/preset editor (bound to local
 * dialog state), via plain value/onChange props rather than being coupled to
 * either caller's state.
 */
export function ParamControls({ value, onChange, collapsible = true }: Props) {
  const [open, setOpen] = useState(!collapsible);

  const update = <K extends keyof GenerationParams>(key: K, next: GenerationParams[K]) => {
    onChange({ ...value, [key]: next });
  };

  const activeCount = Object.values(value).filter(
    (v) => v !== undefined && !(Array.isArray(v) && v.length === 0)
  ).length;

  const body = (
    <div className="space-y-3">
      {SLIDER_FIELDS.map((f) => (
        <div key={f.key}>
          <div className="text-text-muted mb-1 flex items-center justify-between text-[11px]">
            <span>{f.label}</span>
            <span className="font-mono">{value[f.key] ?? "default"}</span>
          </div>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={value[f.key] ?? (f.min + f.max) / 2}
            onChange={(e) => update(f.key, Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-400"
          />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-text-muted mb-1 block text-[11px]">Max output tokens</label>
          <Input
            type="number"
            min={1}
            placeholder="default"
            value={value.maxOutputTokens ?? ""}
            onChange={(e) =>
              update("maxOutputTokens", e.target.value ? Number(e.target.value) : undefined)
            }
            className="h-7 text-[11px]"
          />
        </div>
        <div>
          <label className="text-text-muted mb-1 block text-[11px]">Seed</label>
          <Input
            type="number"
            placeholder="random"
            value={value.seed ?? ""}
            onChange={(e) => update("seed", e.target.value ? Number(e.target.value) : undefined)}
            className="h-7 text-[11px]"
          />
        </div>
      </div>
      <div>
        <label className="text-text-muted mb-1 block text-[11px]">
          Stop sequences (comma-separated)
        </label>
        <Input
          placeholder="none"
          value={(value.stopSequences ?? []).join(", ")}
          onChange={(e) => {
            const list = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            update("stopSequences", list.length ? list : undefined);
          }}
          className="h-7 text-[11px]"
        />
      </div>
      {activeCount > 0 && (
        <Button size="sm" variant="ghost" onClick={() => onChange({})} className="w-full">
          <RotateCcw size={11} /> Reset to defaults
        </Button>
      )}
    </div>
  );

  if (!collapsible) return body;

  return (
    <div className="border-t border-white/5 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-text-muted hover:text-text-secondary flex w-full items-center justify-between px-1 py-1 text-[11px] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          Advanced
          {activeCount > 0 && (
            <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-1 pt-2 pb-1">{body}</div>}
    </div>
  );
}
