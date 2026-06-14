"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { Wrench } from "lucide-react";

interface ToolDef {
  key: string;
  name: string;
  description: string;
  /** When true, also exposes an auto-approve switch (destructive tool). */
  gated?: string;
}

const TOOLS: ToolDef[] = [
  { key: "memory", name: "Memory", description: "Search and save long-term memories." },
  { key: "notes", name: "Notes", description: "Search, read, and create notes." },
  { key: "tasks", name: "Tasks", description: "Create and list to-do items." },
  { key: "calendar", name: "Calendar", description: "List and create calendar events." },
  { key: "web", name: "Web", description: "Search the web and read pages." },
  { key: "email", name: "Email", description: "Draft email and look up contacts." },
  { key: "files", name: "Workspace files", description: "Read and write IDE files.", gated: "writeFile" },
  { key: "shell", name: "Shell", description: "Run allowlisted read-only commands.", gated: "runShell" },
  { key: "notify", name: "Notifications", description: "Send you notifications." },
];

export default function AgentToolsPage() {
  const ref = useGsapEntrance();
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings);
  }, []);

  const update = async (key: string, value: boolean) => {
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
