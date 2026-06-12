"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

const TOOLS = [
  {
    key: "toolMemoryWrite",
    name: "Memory write",
    description: "Allow the agent to store extracted memories automatically.",
    live: true,
  },
  {
    key: "toolMemoryRead",
    name: "Memory read",
    description: "Allow injection of relevant memories into every turn.",
    live: true,
  },
  {
    key: "toolWebSearch",
    name: "Web search",
    description: "Ground answers with live search results.",
    live: false,
  },
  {
    key: "toolCodeRunner",
    name: "Code runner",
    description: "Execute snippets from the IDE in a sandbox.",
    live: false,
  },
  {
    key: "toolFileAccess",
    name: "Workspace files",
    description: "Let the agent read and edit IDE files in agent mode.",
    live: false,
  },
];

export default function AgentToolsPage() {
  const ref = useGsapEntrance();
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  const toggle = async (key: string, value: boolean) => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    setSettings(await res.json());
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Agent tools</h2>
        <p className="text-text-secondary text-sm mt-1">
          Capabilities available to the AI when Agent mode is on. Memory tools map to the
          extraction/injection toggles.
        </p>
      </div>
      <div className="space-y-2">
        {TOOLS.map((tool) => {
          // Memory tools alias the real autoExtract/autoInject switches.
          const aliasKey =
            tool.key === "toolMemoryWrite"
              ? "autoExtract"
              : tool.key === "toolMemoryRead"
                ? "autoInject"
                : tool.key;
          const checked = settings[aliasKey] !== "0" && (tool.live || settings[aliasKey] === "1");
          return (
            <Card key={tool.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">{tool.name}</p>
                  {!tool.live && (
                    <Badge className="bg-amber-400/10 border-amber-400/20 text-amber-400">Soon</Badge>
                  )}
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{tool.description}</p>
              </div>
              <Switch
                checked={checked}
                disabled={!tool.live}
                onCheckedChange={(v) => toggle(aliasKey, v)}
                label={tool.name}
              />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
