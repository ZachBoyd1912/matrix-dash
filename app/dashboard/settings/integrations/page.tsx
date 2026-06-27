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
  key: string;
}

const ALL_INTEGRATIONS: Omit<Integration, "status" | "meta">[] = [
  { name: "GitHub", icon: Github, href: "/dashboard/settings/integrations/github", color: "emerald", key: "github" },
  { name: "Slack", icon: MessageSquare, href: "/dashboard/settings/integrations/slack", color: "violet", key: "slack" },
  { name: "Web Search", icon: Globe, href: "/dashboard/settings/search", color: "sky", key: "websearch" },
  { name: "Google Drive", icon: HardDrive, href: "/dashboard/settings/integrations/drive", color: "amber", key: "drive" },
  { name: "Calendar", icon: Calendar, href: "/dashboard/settings/calendar", color: "pink", key: "calendar" },
  { name: "Webhooks", icon: Webhook, href: "/dashboard/settings/webhooks", color: "slate", key: "webhooks" },
];

const COMING_SOON: Omit<Integration, "status" | "meta">[] = [
  { name: "Linear", icon: Clock, href: "#", color: "indigo", key: "linear" },
  { name: "Notion", icon: FileText, href: "#", color: "zinc", key: "notion" },
  { name: "Discord", icon: Gamepad2, href: "#", color: "indigo", key: "discord" },
  { name: "Home Assistant", icon: Home, href: "#", color: "sky", key: "ha" },
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

type Snap = Record<string, { connected: boolean; meta: string }>;

function IntegrationCard({
  integration,
  snap,
}: {
  integration: { name: string; icon: typeof Github; href: string; color: string; key: string };
  snap?: { connected: boolean; meta: string };
}) {
  const Icon = integration.icon;
  const status = snap ? (snap.connected ? "connected" : "available") : "soon";
  const meta = snap?.meta ?? "";
  const disabled = status === "soon";

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
                status === "connected"
                  ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                  : status === "available"
                    ? "bg-white/10 text-text-secondary border border-white/10"
                    : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
              }`}
            >
              {status === "connected" && "● Connected"}
              {status === "available" && (snap ? "Configure" : "Soon")}
              {status === "soon" && "Soon"}
            </span>
          </div>
          {meta && (
            <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{meta}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function IntegrationsPage() {
  const ref = useGsapEntrance();
  const [snap, setSnap] = useState<Snap | null>(null);

  const refresh = useCallback(async () => {
    const [gh, sl, dr, settingsRes] = await Promise.all([
      fetch("/api/github/connections").then((r) => r.json()).catch(() => []),
      fetch("/api/slack/workspaces").then((r) => r.json()).catch(() => []),
      fetch("/api/drive/connections").then((r) => r.json()).catch(() => []),
      fetch("/api/settings").then((r) => r.json()).catch(() => ({})),
    ]);

    const ghConns = Array.isArray(gh) ? gh : [];
    const slConns = Array.isArray(sl) ? sl : [];

    const snap: Snap = {};

    // GitHub
    const activeGh = ghConns.find((c: any) => c.isActive);
    if (activeGh) {
      snap.github = { connected: true, meta: `${activeGh.githubUser} · connected` };
    } else if (ghConns.length > 0) {
      snap.github = { connected: true, meta: `${ghConns[0].githubUser} · inactive` };
    } else {
      snap.github = { connected: false, meta: "Connect your GitHub account" };
    }

    // Slack
    const activeSl = slConns.find((c: any) => c.isActive);
    if (activeSl) {
      snap.slack = { connected: true, meta: `${activeSl.teamName} · connected` };
    } else if (slConns.length > 0) {
      snap.slack = { connected: true, meta: `${slConns[0].teamName} · inactive` };
    } else {
      snap.slack = { connected: false, meta: "Connect your Slack workspace" };
    }

    // Web Search
    const tavilyKey = settingsRes.tavilyKey as string | undefined;
    snap.websearch = {
      connected: !!tavilyKey,
      meta: tavilyKey ? "Tavily API key set" : "No search provider configured",
    };

    // Google Drive — now fetching from real API
    const driveConns = Array.isArray(dr) ? dr : [];
    const activeDr = driveConns.find((c: any) => c.isActive);
    if (activeDr) {
      snap.drive = { connected: true, meta: `${activeDr.googleEmail} · connected` };
    } else if (driveConns.length > 0) {
      snap.drive = { connected: true, meta: `${driveConns[0].googleEmail} · inactive` };
    } else {
      snap.drive = { connected: false, meta: "Connect your Google account" };
    }

    // Calendar
    snap.calendar = { connected: true, meta: "CalDAV · Settings → Calendar" };

    // Webhooks
    snap.webhooks = { connected: true, meta: "Settings → Webhooks" };

    setSnap(snap);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connected = snap
    ? ALL_INTEGRATIONS.filter((i) => snap[i.key]?.connected)
    : [];
  const available = snap
    ? ALL_INTEGRATIONS.filter((i) => !snap[i.key]?.connected)
    : [];

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

      {snap && (
        <>
          {connected.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Connected</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {connected.map((i) => (
                  <IntegrationCard key={i.key} integration={i} snap={snap[i.key]} />
                ))}
              </div>
            </>
          )}

          {available.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Available</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {available.map((i) => (
                  <IntegrationCard key={i.key} integration={i} snap={snap[i.key]} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!snap && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ALL_INTEGRATIONS.map((i) => (
            <IntegrationCard key={i.key} integration={i} />
          ))}
        </div>
      )}

      <p className="text-[10px] uppercase tracking-wider text-text-muted">Coming Soon</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COMING_SOON.map((i) => (
          <IntegrationCard key={i.key} integration={i} />
        ))}
      </div>
    </div>
  );
}
