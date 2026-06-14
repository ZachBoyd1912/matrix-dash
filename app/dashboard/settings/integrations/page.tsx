"use client";

import { Github, HardDrive, Slack, Webhook, Calendar, Globe, Plug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

const INTEGRATIONS = [
  { name: "GitHub", icon: Github, description: "Sync repos into the IDE and reference code in chat." },
  { name: "Google Drive", icon: HardDrive, description: "Pull docs into notes and memory extraction." },
  { name: "Slack", icon: Slack, description: "Send session summaries to a channel." },
  { name: "Calendar", icon: Calendar, description: "Let the agent read and schedule events." },
  { name: "Webhooks", icon: Webhook, description: "Fire a webhook when memories or sessions change." },
  { name: "Web Search", icon: Globe, description: "Give chat live search grounding." },
];

export default function IntegrationsPage() {
  const ref = useGsapEntrance();
  return (
    <div ref={ref} className="space-y-8">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb top-0 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <Plug size={11} /> Integrations
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl font-extrabold mt-3">
            Integrations
          </h1>
          <p className="text-text-secondary text-sm mt-3 max-w-2xl">
            Matrix Dash is local-first — integrations are opt-in bridges to the outside world.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {INTEGRATIONS.map((integration) => {
          const Icon = integration.icon;
          return (
            <Card key={integration.name} className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg grid place-items-center bg-white/5 border border-white/10 shrink-0">
                <Icon size={16} className="text-text-secondary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">{integration.name}</p>
                  <Badge className="bg-amber-400/10 border-amber-400/20 text-amber-400">Soon</Badge>
                </div>
                <p className="text-xs text-text-secondary mt-1">{integration.description}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
