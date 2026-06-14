"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { Wrench, ShieldCheck, ShieldAlert, Zap } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ToolDef {
  key: string;
  name: string;
  description: string;
  /** When true, also exposes an auto-approve switch (destructive tool). */
  gated?: string;
}

const POWER_LEVELS = [
  {
    value: "sandboxed",
    name: "Sandboxed",
    Icon: ShieldCheck,
    accent: "emerald",
    desc: "Read-only filesystem. No file writes, no shell. The safest surface.",
  },
  {
    value: "approval",
    name: "Approval",
    Icon: ShieldAlert,
    accent: "amber",
    desc: "Real edits & shell — but every mutating action asks you first.",
  },
  {
    value: "unrestricted",
    name: "Unrestricted",
    Icon: Zap,
    accent: "rose",
    desc: "Real edits & shell, auto-approved. Maximum power — use with care.",
  },
] as const;

const TOOLS: ToolDef[] = [
  { key: "memory", name: "Memory", description: "Search and save long-term memories." },
  { key: "skills", name: "Skills", description: "Discover and load relevant capability packs on demand." },
  { key: "notes", name: "Notes", description: "Search, read, and create notes." },
  { key: "tasks", name: "Tasks", description: "Create and list to-do items." },
  { key: "calendar", name: "Calendar", description: "List and create calendar events." },
  { key: "web", name: "Web", description: "Search the web and read pages." },
  { key: "email", name: "Email", description: "Draft email and look up contacts." },
  { key: "files", name: "Workspace files", description: "Read and write IDE files.", gated: "writeFile" },
  { key: "shell", name: "Shell", description: "Run allowlisted read-only commands.", gated: "runShell" },
  { key: "coding", name: "Coding tools", description: "Read/write real files, run shell, grep & glob — scoped by the power level above." },
  { key: "notify", name: "Notifications", description: "Send you notifications." },
];

export default function AgentToolsPage() {
  const ref = useGsapEntrance();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [root, setRoot] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings);
  }, []);

  useEffect(() => {
    setRoot(settings.agent_workspace_root ?? "");
  }, [settings.agent_workspace_root]);

  const update = async (key: string, value: boolean | string) => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    setSettings(await res.json());
  };

  // Tools default ON unless explicitly disabled ("0").
  const toolOn = (key: string) => settings[`tool_${key}`] !== "0";
  // Approvals default OFF unless explicitly "1".
  const approveOn = (name: string) => settings[`approve_${name}`] === "1";
  const power = settings.agent_power_level || "approval";

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div className="orb top-4 right-16 h-44 w-44 bg-sky-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow"><Wrench size={11} /> Agent capabilities</span>
          <h2 className="display text-gradient text-4xl md:text-5xl font-extrabold mt-3">Agent tools</h2>
          <p className="text-text-secondary text-sm mt-3 max-w-2xl">
            Capabilities the agent may use in <span className="text-emerald-400">Agent</span> mode. Build reusable
            instruction packs on the <Link href="/dashboard/skills" className="text-emerald-400 hover:underline">Skills</Link> page.
          </p>
        </div>
      </div>
      <Card className="space-y-4 rounded-2xl">
        <div>
          <p className="text-sm font-semibold text-text-primary">Coding power level</p>
          <p className="text-xs text-text-secondary mt-0.5">
            How much the agent&apos;s coding tools (read/write files, run shell) can do on your machine.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {POWER_LEVELS.map((lvl) => {
            const active = power === lvl.value;
            const Icon = lvl.Icon;
            return (
              <button
                key={lvl.value}
                type="button"
                onClick={() => update("agent_power_level", lvl.value)}
                className={cn(
                  "text-left rounded-xl border p-3 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99]",
                  active && lvl.accent === "emerald" && "border-emerald-400/40 bg-emerald-400/10 shadow-[0_0_22px_-8px_rgba(52,211,153,0.7)]",
                  active && lvl.accent === "amber" && "border-amber-400/40 bg-amber-400/10 shadow-[0_0_22px_-8px_rgba(251,191,36,0.7)]",
                  active && lvl.accent === "rose" && "border-rose-400/40 bg-rose-400/10 shadow-[0_0_22px_-8px_rgba(244,63,94,0.7)]",
                  !active && "border-white/5 bg-white/[0.02] hover:border-white/10"
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    size={14}
                    className={cn(
                      !active && "text-text-muted",
                      active && lvl.accent === "emerald" && "text-emerald-300",
                      active && lvl.accent === "amber" && "text-amber-300",
                      active && lvl.accent === "rose" && "text-rose-300"
                    )}
                  />
                  <span className="text-sm font-medium text-text-primary">{lvl.name}</span>
                </div>
                <p className="text-[11px] text-text-secondary mt-1.5 leading-relaxed">{lvl.desc}</p>
              </button>
            );
          })}
        </div>
        <div>
          <label className="text-[10px] uppercase text-text-muted block mb-1">Workspace root</label>
          <Input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            onBlur={() => {
              if (root !== (settings.agent_workspace_root ?? "")) update("agent_workspace_root", root);
            }}
            placeholder="~/MatrixDash (default)"
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-text-muted mt-1">
            The folder the agent can read, edit, and run commands in. Paths are confined to this root.
          </p>
        </div>
      </Card>
      <div className="space-y-3">
        {TOOLS.map((tool) => (
          <Card key={tool.key} interactive className="space-y-3 rounded-2xl">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">{tool.name}</p>
                  {tool.gated && (
                    <Badge className="bg-rose-400/10 border-rose-400/20 text-rose-300">Needs approval</Badge>
                  )}
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{tool.description}</p>
              </div>
              <Switch checked={toolOn(tool.key)} onCheckedChange={(v) => update(`tool_${tool.key}`, v)} label={tool.name} />
            </div>
            {tool.gated && toolOn(tool.key) && (
              <div className="flex items-center justify-between gap-4 pl-3 border-l-2 border-rose-400/20">
                <p className="text-xs text-text-secondary">
                  Auto-approve <span className="font-mono text-text-primary">{tool.gated}</span> without asking
                </p>
                <Switch
                  checked={approveOn(tool.gated)}
                  onCheckedChange={(v) => update(`approve_${tool.gated}`, v)}
                  label={`Auto-approve ${tool.gated}`}
                />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
