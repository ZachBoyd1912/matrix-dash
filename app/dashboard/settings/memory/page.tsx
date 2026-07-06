"use client";

import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { toast } from "@/lib/stores/use-feedback";

export default function MemorySettingsPage() {
  const ref = useGsapEntrance();
  const [settings, setSettings] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const res = await fetch("/api/settings");
    setSettings(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = async (next: Record<string, string | boolean | number>) => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    setSettings(await res.json());
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Memory & extraction</h2>
        <p className="text-text-secondary mt-1 text-sm">
          Tune what the autonomous memory system does in the background.
        </p>
      </div>

      <Card>
        <Row
          title="Auto-extract memories"
          description="After every reply, the active provider extracts facts to remember."
        >
          <Switch
            checked={settings.autoExtract !== "0"}
            onCheckedChange={(v) => update({ autoExtract: v })}
          />
        </Row>
      </Card>

      <Card>
        <Row
          title="Auto-inject memories"
          description="Inject relevant memories into the system prompt before each turn."
        >
          <Switch
            checked={settings.autoInject !== "0"}
            onCheckedChange={(v) => update({ autoInject: v })}
          />
        </Row>
      </Card>

      <Card>
        <Row
          title="Max memories per turn"
          description="Upper bound on injected memories. Higher = more context, more tokens."
        >
          <Input
            type="number"
            min={1}
            max={50}
            value={settings.maxInjectedMemories ?? "10"}
            onChange={(e) => update({ maxInjectedMemories: parseInt(e.target.value, 10) || 10 })}
            className="w-20 text-right"
          />
        </Row>
      </Card>

      <Card>
        <p className="mb-1 text-sm font-medium">System prompt</p>
        <p className="text-text-secondary mb-3 text-xs">
          Prepended to every conversation, after auto-injected memories.
        </p>
        <textarea
          value={settings.systemPrompt ?? ""}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          rows={4}
          className="glass-input w-full resize-y rounded-md p-3 text-sm"
          placeholder="You are a helpful AI assistant…"
        />
      </Card>

      <Card>
        <Row
          title="Maintenance"
          description="Tidy merges near-duplicates; decay slowly lowers importance for unused memories."
        >
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const res = await fetch("/api/memories/tidy", { method: "POST" });
                const data = await res.json();
                toast.success(
                  "Tidy complete",
                  `${data.tidy.merged} merged, ${data.tidy.deleted} removed.`
                );
              }}
            >
              Tidy now
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const res = await fetch("/api/memories/tidy?decay=1", { method: "POST" });
                const data = await res.json();
                toast.success(
                  "Decay complete",
                  `${data.decay.adjusted} adjusted, ${data.decay.pruned} pruned.`
                );
              }}
            >
              Run decay
            </Button>
          </div>
        </Row>
      </Card>
    </div>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-text-primary text-sm font-medium">{title}</p>
        <p className="text-text-secondary mt-0.5 text-xs">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
