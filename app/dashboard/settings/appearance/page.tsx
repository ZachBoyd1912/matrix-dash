"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Check,
  Palette,
  SlidersHorizontal,
  Wand2,
  Download,
  Upload,
  RotateCcw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import {
  THEMES,
  DEFAULT_THEME,
  DEFAULT_CUSTOM,
  generateHarmony,
  type CustomTheme,
  type Harmony,
} from "@/lib/themes";
import {
  applyCustomThemeStyle,
  applyUiPrefs,
  type UiFont,
  type UiDensity,
} from "@/components/layout/theme-style";

const COLOR_FIELDS: { key: keyof CustomTheme; label: string }[] = [
  { key: "bgBase", label: "Background" },
  { key: "bgSurface", label: "Surface" },
  { key: "bgElevated", label: "Elevated" },
  { key: "bgOverlay", label: "Overlay" },
  { key: "textPrimary", label: "Text" },
  { key: "textSecondary", label: "Text dim" },
  { key: "textMuted", label: "Text muted" },
  { key: "accent", label: "Accent" },
];

async function patchSettings(patch: Record<string, string>) {
  await fetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export default function AppearancePage() {
  const ref = useGsapEntrance();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState("themes");

  // Customize state
  const [custom, setCustom] = useState<CustomTheme>(DEFAULT_CUSTOM);
  const [name, setName] = useState("My theme");
  const [harmony, setHarmony] = useState<Harmony>("complementary");
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [font, setFont] = useState<UiFont>("sans");
  const [density, setDensity] = useState<UiDensity>("comfortable");
  const [frosted, setFrosted] = useState(true);
  const [importText, setImportText] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Record<string, string>) => {
        if (s.customTheme) {
          try {
            setCustom({ ...DEFAULT_CUSTOM, ...JSON.parse(s.customTheme) });
          } catch {
            /* ignore */
          }
        }
        if (s.customThemeName) setName(s.customThemeName);
        if (s.uiFont) setFont(s.uiFont as UiFont);
        if (s.uiDensity) setDensity(s.uiDensity as UiDensity);
        if (s.uiFrosted) setFrosted(s.uiFrosted !== "0");
      })
      .catch(() => {});
  }, []);

  const applyNamedTheme = (id: string) => {
    setTheme(id);
    void patchSettings({ activeTheme: id });
    toast.success("Theme applied", THEMES.find((t) => t.id === id)?.label);
  };

  // Live-preview a custom edit (without persisting yet).
  const editColor = (key: keyof CustomTheme, value: string) => {
    const next = { ...custom, [key]: value };
    setCustom(next);
    applyCustomThemeStyle(next);
    if (theme !== "custom") setTheme("custom");
  };

  const runHarmony = () => {
    const generated = generateHarmony(custom.accent, harmony, mode);
    setCustom(generated);
    applyCustomThemeStyle(generated);
    setTheme("custom");
    toast.success("Palette generated", `${harmony} · ${mode}`);
  };

  const saveCustom = async () => {
    applyCustomThemeStyle(custom);
    setTheme("custom");
    await patchSettings({
      customTheme: JSON.stringify(custom),
      customThemeName: name,
      activeTheme: "custom",
    });
    toast.success("Custom theme saved");
  };

  const changeFont = (f: UiFont) => {
    setFont(f);
    applyUiPrefs({ font: f });
    void patchSettings({ uiFont: f });
  };
  const changeDensity = (d: UiDensity) => {
    setDensity(d);
    applyUiPrefs({ density: d });
    void patchSettings({ uiDensity: d });
  };
  const changeFrosted = (v: boolean) => {
    setFrosted(v);
    applyUiPrefs({ frosted: v });
    void patchSettings({ uiFrosted: v ? "1" : "0" });
  };

  const exportTheme = () => {
    const blob = new Blob([JSON.stringify({ name, ...custom }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "-").toLowerCase() || "theme"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTheme = () => {
    try {
      const parsed = JSON.parse(importText) as Partial<CustomTheme> & { name?: string };
      const next = { ...DEFAULT_CUSTOM, ...parsed };
      setCustom(next);
      if (parsed.name) setName(parsed.name);
      applyCustomThemeStyle(next);
      setTheme("custom");
      setImportText("");
      toast.success("Theme imported", "Click Save to keep it.");
    } catch {
      toast.error("Invalid theme JSON");
    }
  };

  const resetDefault = () => {
    setCustom(DEFAULT_CUSTOM);
    applyCustomThemeStyle(DEFAULT_CUSTOM);
    setTheme(DEFAULT_THEME);
    void patchSettings({ activeTheme: DEFAULT_THEME });
    toast.success("Reset to Matrix");
  };

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-10 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <Palette size={11} /> Appearance
          </span>
          <h2 className="display text-gradient mt-3 text-4xl md:text-5xl">Appearance</h2>
          <p className="text-text-secondary mt-3 max-w-xl text-sm">
            16 named themes plus a full custom theme studio.
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "themes", label: "Themes", icon: <Palette size={13} /> },
          { value: "customize", label: "Customize", icon: <SlidersHorizontal size={13} /> },
        ]}
      />

      {tab === "themes" ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {THEMES.map((t) => {
            const active = (theme ?? DEFAULT_THEME) === t.id;
            return (
              <button
                key={t.id}
                onClick={() => applyNamedTheme(t.id)}
                className="lift rounded-2xl border p-3.5 text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                  background: t.bg,
                  borderColor: active ? t.accent : "rgba(255,255,255,0.08)",
                  boxShadow: active ? `0 0 0 2px ${t.accent}` : "none",
                }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: t.accent }}>
                    {t.label}
                  </span>
                  {active && <Check size={13} style={{ color: t.accent }} aria-label="Active" />}
                </div>
                <div className="flex gap-1.5">
                  <span
                    className="h-6 w-6 rounded-md border border-white/10"
                    style={{ background: t.bg }}
                  />
                  <span
                    className="h-6 w-6 rounded-md border border-white/10"
                    style={{ background: t.surface }}
                  />
                  <span
                    className="h-6 w-6 rounded-md border border-white/10"
                    style={{ background: t.accent }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Colors */}
          <Card interactive className="rounded-2xl">
            <p className="mb-3 text-sm font-medium">Colors</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {COLOR_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="text-text-muted mb-1 block text-[10px] uppercase">
                    {f.label}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={custom[f.key]}
                      onChange={(e) => editColor(f.key, e.target.value)}
                      className="h-8 w-8 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent"
                      aria-label={f.label}
                    />
                    <Input
                      value={custom[f.key]}
                      onChange={(e) => editColor(f.key, e.target.value)}
                      className="px-1.5 font-mono text-[11px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Color harmony */}
          <Card interactive className="rounded-2xl">
            <div className="mb-3 flex items-center gap-2">
              <Wand2 size={14} className="text-violet-300" />
              <p className="text-sm font-medium">Color harmony generator</p>
            </div>
            <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
              <div>
                <label className="text-text-muted mb-1 block text-[10px] uppercase">Accent</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={custom.accent}
                    onChange={(e) => editColor("accent", e.target.value)}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent"
                    aria-label="Harmony accent"
                  />
                  <Input
                    value={custom.accent}
                    onChange={(e) => editColor("accent", e.target.value)}
                    className="px-1.5 font-mono text-[11px]"
                  />
                </div>
              </div>
              <div>
                <label className="text-text-muted mb-1 block text-[10px] uppercase">Harmony</label>
                <Select
                  value={harmony}
                  onChange={(e) => setHarmony(e.target.value as Harmony)}
                  className="w-full"
                >
                  <option value="complementary">Complementary</option>
                  <option value="analogous">Analogous</option>
                  <option value="triadic">Triadic</option>
                  <option value="split">Split-Comp</option>
                </Select>
              </div>
              <div>
                <label className="text-text-muted mb-1 block text-[10px] uppercase">Mode</label>
                <Select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "dark" | "light")}
                  className="w-full"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </Select>
              </div>
              <Button variant="primary" onClick={runHarmony}>
                <Wand2 size={14} /> Generate
              </Button>
            </div>
          </Card>

          {/* Font & layout */}
          <Card interactive className="rounded-2xl">
            <p className="mb-3 text-sm font-medium">Font &amp; layout</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="text-text-muted mb-1 block text-[10px] uppercase">Font</label>
                <Select
                  value={font}
                  onChange={(e) => changeFont(e.target.value as UiFont)}
                  className="w-full"
                >
                  <option value="sans">Geist Sans</option>
                  <option value="mono">Geist Mono</option>
                  <option value="system">System</option>
                </Select>
              </div>
              <div>
                <label className="text-text-muted mb-1 block text-[10px] uppercase">Density</label>
                <Select
                  value={density}
                  onChange={(e) => changeDensity(e.target.value as UiDensity)}
                  className="w-full"
                >
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                  <option value="spacious">Spacious</option>
                </Select>
              </div>
              <div>
                <label className="text-text-muted mb-1 block text-[10px] uppercase">
                  Frosted glass
                </label>
                <div className="flex h-9 items-center">
                  <Switch checked={frosted} onCheckedChange={changeFrosted} label="Frosted glass" />
                  <span className="text-text-secondary ml-2 text-xs">{frosted ? "On" : "Off"}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Save / share */}
          <Card interactive className="rounded-2xl">
            <p className="mb-3 text-sm font-medium">Save &amp; share</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1">
                <label className="text-text-muted mb-1 block text-[10px] uppercase">
                  Theme name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My theme"
                />
              </div>
              <Button variant="primary" onClick={saveCustom}>
                <Check size={14} /> Save
              </Button>
              <Button variant="ghost" onClick={exportTheme}>
                <Download size={14} /> Export
              </Button>
              <Button variant="ghost" onClick={resetDefault}>
                <RotateCcw size={14} /> Reset
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <label className="text-text-muted mb-1 block text-[10px] uppercase">
                  Import JSON
                </label>
                <Input
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='{"accent":"#34d399", ...}'
                  className="font-mono text-[11px]"
                />
              </div>
              <Button variant="ghost" onClick={importTheme} disabled={!importText.trim()}>
                <Upload size={14} /> Import
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
