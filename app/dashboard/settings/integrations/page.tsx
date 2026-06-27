"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Github,
  MessageSquare,
  Globe,
  HardDrive,
  Calendar,
  Webhook,
  Plug,
  Clock,
  FileText,
  Gamepad2,
  Home,
} from "lucide-react";
import Link from "next/link";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

interface Integration {
  name: string;
  icon: typeof Github;
  href: string;
  color: string;
  status: "connected" | "available" | "soon";
  meta: string;
}

const CONNECTED: Integration[] = [
  {
    name: "GitHub",
    icon: Github,
    href: "/dashboard/settings/integrations/github",
    color: "emerald",
    status: "connected",
    meta: "ZachBoyd1912 · 12 repos synced",
  },
  {
    name: "Slack",
    icon: MessageSquare,
    href: "/dashboard/settings/integrations/slack",
    color: "violet",
    status: "connected",
    meta: "Matrix Labs · 23 channels",
  },
  {
    name: "Web Search",
    icon: Globe,
    href: "/dashboard/settings/search",
    color: "sky",
    status: "connected",
    meta: "Tavily · 920/1000 queries this month",
  },
  {
    name: "Google Drive",
    icon: HardDrive,
    href: "/dashboard/settings/integrations/drive",
    color: "amber",
    status: "connected",
    meta: "zboyd712@gmail.com · 23 docs synced",
  },
];

const AVAILABLE: Integration[] = [
  {
    name: "Calendar",
    icon: Calendar,
    href: "/dashboard/settings/calendar",
    color: "pink",
    status: "available",
    meta: "CalDAV · Personal · 12 events",
  },
  {
    name: "Webhooks",
    icon: Webhook,
    href: "/dashboard/settings/webhooks",
    color: "slate",
    status: "available",
    meta: "4 active · Outbound events on memory/task changes",
  },
];

const COMING_SOON: Integration[] = [
  {
    name: "Linear",
    icon: Clock,
    href: "#",
    color: "indigo",
    status: "soon",
    meta: "Sync issues and let the agent triage tickets",
  },
  {
    name: "Notion",
    icon: FileText,
    href: "#",
    color: "zinc",
    status: "soon",
    meta: "Pull databases and pages into searchable notes",
  },
  {
    name: "Discord",
    icon: Gamepad2,
    href: "#",
    color: "indigo",
    status: "soon",
    meta: "Post agent summaries to server channels",
  },
  {
    name: "Home Assistant",
    icon: Home,
    href: "#",
    color: "sky",
    status: "soon",
    meta: "Control smart home devices via agent commands",
  },
];

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-500/10 [&_svg]:text-emerald-400",
  violet: "bg-violet-500/10 [&_svg]:text-violet-400",
  sky: "bg-sky-500/10 [&_svg]:text-sky-400",
  amber: "bg-amber-500/10 [&_svg]:text-amber-400",
  pink: "bg-pink-500/10 [&_svg]:text-pink-400",
  slate: "bg-slate-500/10 [&_svg]:text-slate-400",
  indigo: "bg-indigo-500/10 [&_svg]:text-indigo-400",
  zinc: "bg-white/5 [&_svg]:text-zinc-400",
};

function IntegrationCard({ integration }: { integration: Integration }) {
  const Icon = integration.icon;
  const disabled = integration.status === "soon";

  return (
    <Link
      href={disabled ? "#" : integration.href}
      className={`block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-150 ${
        disabled
          ? "opacity-50 cursor-default"
          : "hover:border-white/[0.12] hover:bg-white/[0.04] cursor-pointer"
      }`}
      onClick={(e) => disabled && e.preventDefault()}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${COLOR_MAP[integration.color]}`}
        >
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{integration.name}</span>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide ${
                integration.status === "connected"
                  ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                  : integration.status === "available"
                    ? "bg-white/10 text-text-secondary border border-white/10"
                    : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
              }`}
            >
              {integration.status === "connected" && "● Connected"}
              {integration.status === "available" && "Enabled"}
              {integration.status === "soon" && "Soon"}
            </span>
          </div>
          <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{integration.meta}</p>
        </div>
      </div>
    </Link>
  );
}

export default function IntegrationsPage() {
  const ref = useGsapEntrance();

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div className="orb top-0 right-16 h-44 w-44 bg-violet-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow">
            <Plug size={11} /> Integrations
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl font-extrabold mt-3">
            Integrations
          </h1>
          <p className="text-text-secondary text-sm mt-3 max-w-xl">
            Matrix Dash is local-first — integrations are opt-in bridges to the outside world.
            Connect services to give the agent real context.
          </p>
        </div>
      </div>

      <p className="text-[10px] uppercase tracking-wider text-text-muted">Connected</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CONNECTED.map((integration) => (
          <IntegrationCard key={integration.name} integration={integration} />
        ))}
      </div>

      <p className="text-[10px] uppercase tracking-wider text-text-muted">Available</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {AVAILABLE.map((integration) => (
          <IntegrationCard key={integration.name} integration={integration} />
        ))}
      </div>

      <p className="text-[10px] uppercase tracking-wider text-text-muted">Coming Soon</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COMING_SOON.map((integration) => (
          <IntegrationCard key={integration.name} integration={integration} />
        ))}
      </div>
    </div>
  );
}
