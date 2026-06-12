"use client";

import { Card } from "@/components/ui/card";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

export default function AppearancePage() {
  const ref = useGsapEntrance();
  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Appearance</h2>
        <p className="text-text-secondary text-sm mt-1">
          Matrix Dash ships in OLED Ethereal Glass — a permanent dark, glassmorphic palette.
        </p>
      </div>
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
        <div className="flex gap-3">
          {[
            { name: "Emerald", value: "#34d399" },
            { name: "Sky", value: "#38bdf8" },
            { name: "Amber", value: "#fbbf24" },
            { name: "Rose", value: "#f43f5e" },
          ].map((t) => (
            <div key={t.name} className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 rounded-lg"
                style={{
                  background: t.value,
                  boxShadow: `0 0 24px -4px ${t.value}66`,
                }}
              />
              <span className="text-[10px] text-text-muted">{t.name}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <p className="text-sm font-medium text-text-primary">Typography</p>
        <p className="text-xs text-text-secondary mt-1">
          Geist Sans (display + body) · Geist Mono (code).
        </p>
        <div className="mt-4 space-y-2 font-sans">
          <p className="text-3xl font-extrabold tracking-tight">Display 32 · 800</p>
          <p className="text-2xl font-bold">Heading 24 · 700</p>
          <p className="text-lg font-medium">Subheading 18 · 500</p>
          <p className="text-sm">Body 14 · 400 — Matrix Dash is your AI command center.</p>
          <p className="text-xs text-text-secondary">Small 12 · 400 · secondary</p>
          <p className="font-mono text-[13px] text-emerald-300">const code = "Geist Mono 13";</p>
        </div>
      </Card>
    </div>
  );
}
