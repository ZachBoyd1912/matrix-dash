"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Brain,
  Palette,
  ShieldAlert,
  Plug,
  Keyboard,
  User,
  Mail,
  Wrench,
  Cpu,
  Lock,
  KeyRound,
  Shield,
  Webhook,
  Archive,
  Users,
  Activity,
  Drama,
  Calendar,
  MonitorSmartphone,
  GraduationCap,
  Server,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NavGroup } from "@/components/layout/nav-group";

interface Section {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  groupId?: string;
}

const GROUP_META: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "ai-agents", label: "AI & Agents", icon: Bot },
  { id: "comms", label: "Communication", icon: Mail },
  { id: "security", label: "Security & Keys", icon: Shield },
  { id: "system", label: "System & Data", icon: ShieldAlert },
  { id: "utility", label: "Appearance & Help", icon: Palette },
];

const SECTIONS: Section[] = [
  {
    href: "/dashboard/settings",
    label: "AI Providers",
    icon: Bot,
    exact: true,
    groupId: "ai-agents",
  },
  { href: "/dashboard/settings/cookbook", label: "Cookbook", icon: Cpu, groupId: "ai-agents" },
  {
    href: "/dashboard/settings/agent-tools",
    label: "Agent Tools",
    icon: Wrench,
    groupId: "ai-agents",
  },
  { href: "/dashboard/settings/mcp", label: "MCP Servers", icon: Server, groupId: "ai-agents" },
  { href: "/dashboard/settings/agents", label: "Agents", icon: Bot, groupId: "ai-agents" },
  { href: "/dashboard/settings/presets", label: "Personas", icon: Drama, groupId: "ai-agents" },

  { href: "/dashboard/settings/memory", label: "Memory", icon: Brain },
  { href: "/dashboard/settings/integrations", label: "Integrations", icon: Plug },

  { href: "/dashboard/settings/email", label: "Email", icon: Mail, groupId: "comms" },
  { href: "/dashboard/settings/calendar", label: "Calendar", icon: Calendar, groupId: "comms" },
  { href: "/dashboard/settings/contacts", label: "Contacts", icon: Users, groupId: "comms" },

  { href: "/dashboard/settings/auth", label: "Security (2FA)", icon: Lock, groupId: "security" },
  { href: "/dashboard/settings/vault", label: "Vault", icon: Shield, groupId: "security" },
  { href: "/dashboard/settings/tokens", label: "API Tokens", icon: KeyRound, groupId: "security" },
  { href: "/dashboard/settings/webhooks", label: "Webhooks", icon: Webhook, groupId: "security" },

  { href: "/dashboard/settings/system", label: "System", icon: ShieldAlert, groupId: "system" },
  { href: "/dashboard/settings/backups", label: "Backups", icon: Archive, groupId: "system" },
  {
    href: "/dashboard/settings/diagnostics",
    label: "Diagnostics",
    icon: Activity,
    groupId: "system",
  },
  {
    href: "/dashboard/settings/devices",
    label: "Devices",
    icon: MonitorSmartphone,
    groupId: "system",
  },
  {
    href: "/dashboard/settings/analytics",
    label: "Analytics",
    icon: BarChart3,
    groupId: "system",
  },

  {
    href: "/dashboard/settings/appearance",
    label: "Appearance",
    icon: Palette,
    groupId: "utility",
  },
  { href: "/dashboard/settings/shortcuts", label: "Shortcuts", icon: Keyboard, groupId: "utility" },
  {
    href: "/dashboard/settings/tutorial",
    label: "Tutorial",
    icon: GraduationCap,
    groupId: "utility",
  },

  { href: "/dashboard/settings/account", label: "My Profile", icon: User },
  { href: "/dashboard/settings/accounts", label: "Team & Members", icon: Users },
];

function isActive(section: Section, pathname: string): boolean {
  return section.exact ? pathname === section.href : pathname.startsWith(section.href);
}

function isSectionGroupActive(groupId: string, pathname: string): boolean {
  return SECTIONS.some((s) => s.groupId === groupId && isActive(s, pathname));
}

function SectionLink({ section, active }: { section: Section; active: boolean }) {
  const Icon = section.icon;
  return (
    <Link
      href={section.href}
      data-tour={`nav-${section.href.split("/").pop()}`}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-3 text-xs transition-colors",
        active
          ? "text-text-primary bg-white/[0.06]"
          : "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
      )}
    >
      <Icon size={13} className={active ? "text-emerald-400" : ""} />
      {section.label}
    </Link>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rendered = new Set<string>();

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
      <aside className="border-r border-white/5 bg-white/[0.01] p-4 md:min-h-[calc(100vh-3.5rem)]">
        <p className="text-text-muted mb-3 px-2 text-[10px] tracking-wider uppercase">Settings</p>
        <nav className="space-y-0.5">
          {SECTIONS.map((section) => {
            if (section.groupId) {
              if (rendered.has(section.groupId)) return null;
              rendered.add(section.groupId);
              const meta = GROUP_META.find((g) => g.id === section.groupId);
              if (!meta) return null;
              const groupSections = SECTIONS.filter((s) => s.groupId === section.groupId);
              return (
                <NavGroup
                  key={meta.id}
                  id={`settings-${meta.id}`}
                  label={meta.label}
                  icon={meta.icon}
                  active={isSectionGroupActive(meta.id, pathname)}
                  compact
                >
                  {groupSections.map((s) => (
                    <SectionLink key={s.href} section={s} active={isActive(s, pathname)} />
                  ))}
                </NavGroup>
              );
            }
            return (
              <SectionLink
                key={section.href}
                section={section}
                active={isActive(section, pathname)}
              />
            );
          })}
        </nav>
      </aside>
      <section className="max-w-3xl p-4 md:p-8">{children}</section>
    </div>
  );
}
