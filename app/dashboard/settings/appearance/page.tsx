"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

const ACCENTS = [
  { name: "Emerald", value: "#34d399" },
  { name: "Sky", value: "#38bdf8" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Lime", value: "#a3e635" },
];

export default function AppearancePage() {
  const ref = useGsapEntrance();
  const [accent, setAccent] = useState("#34d399");
  const [custom, setCustom] = useState("#34d399");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Record<string, string>) => {
        const stored = s.accentColor || "#34d399";
        setAccent(stored);
        setCustom(stored);
        document.documentElement.style.setProperty("--color-emerald-accent", stored);
      });
  }, []);

  const save = async (value: string) => {
    setAccent(value);
    document.documentElement.style.setProperty("--color-emerald-accent", value);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accentColor: value }),
    });
    toast.success("Theme updated");
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Appearance</h2>
        <p className="text-text-secondary text-sm mt-1">
          OLED Ethereal Glass with light/dark toggle + customizable accent.
        </p>
      </div>

      <Card>
        <p className="text-sm font-medium mb-3">Accent color</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              onClick={() => save(a.value)}
              className="flex flex-col items-center gap-1.5"
              aria-label={a.name}
            >
              <div
                className="h-10 w-10 rounded-lg border border-white/10"
                style={{
                  background: a.value,
                  boxShadow: accent === a.value ? `0 0 24px -4px ${a.value}aa` : "none",
                  outline: accent === a.value ? "2px solid white" : "none",
                  outlineOffset: 2,
                }}
              />
              <span className="text-[10px] text-text-muted">{a.name}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-3 border-t border-white/5">
          <span className="text-xs text-text-muted">Custom:</span>
          <input
            type="color"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="h-8 w-12 rounded cursor-pointer bg-transparent border border-white/10"
          />
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="#34d399" className="font-mono w-32" />
          <Button size="sm" variant="primary" onClick={() => save(custom)}>Apply</Button>
        </div>
      </Card>

      <Card>
        <div className="flex gap-3">
          {[
            { name: "Base", value: "#050505" },
            { name: "Surface", value: "#0d0d0d" },
            { name: "Elevated", value: "#141414" },
            { name: "Overlay", value: "#1a1a1a" },
          ].map((t) => (
            <div key={t.name} className="flex flex-col items-center gap-1">
              <div className="h-12 w-12 rounded-lg border border-white/10" style={{ background: t.value }} />
              <span className="text-[10px] text-text-muted">{t.name}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-sm font-medium text-text-primary">Typography</p>
        <p className="text-xs text-text-secondary mt-1">Geist Sans + Geist Mono.</p>
        <div className="mt-4 space-y-2">
          <p className="text-3xl font-extrabold tracking-tight">Display 32 · 800</p>
          <p className="text-2xl font-bold">Heading 24 · 700</p>
          <p className="text-sm">Body 14 · 400</p>
          <p className="font-mono text-[13px] text-emerald-300">const code = &quot;Geist Mono 13&quot;;</p>
        </div>
      </Card>
    </div>
  );
}
