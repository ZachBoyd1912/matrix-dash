"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const SECTIONS = [
  { href: "/dashboard/settings", label: "AI Providers", icon: Bot, exact: true },
  { href: "/dashboard/settings/cookbook", label: "Cookbook", icon: Cpu },
  { href: "/dashboard/settings/memory", label: "Memory", icon: Brain },
  { href: "/dashboard/settings/email", label: "Email", icon: Mail },
  { href: "/dashboard/settings/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/settings/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/settings/agent-tools", label: "Agent Tools", icon: Wrench },
  { href: "/dashboard/settings/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/settings/shortcuts", label: "Shortcuts", icon: Keyboard },
  { href: "/dashboard/settings/account", label: "Account", icon: User },
  { href: "/dashboard/settings/accounts", label: "Accounts", icon: Users },
  { href: "/dashboard/settings/devices", label: "Devices", icon: MonitorSmartphone },
  { href: "/dashboard/settings/tutorial", label: "Tutorial", icon: GraduationCap },
  { href: "/dashboard/settings/auth", label: "Security (2FA)", icon: Lock },
  { href: "/dashboard/settings/tokens", label: "API Tokens", icon: KeyRound },
  { href: "/dashboard/settings/vault", label: "Vault", icon: Shield },
  { href: "/dashboard/settings/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/dashboard/settings/backups", label: "Backups", icon: Archive },
  { href: "/dashboard/settings/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/settings/presets", label: "Personas", icon: Drama },
  { href: "/dashboard/settings/appearance", label: "Appearance", icon: Palette },
  { href: "/dashboard/settings/diagnostics", label: "Diagnostics", icon: Activity },
  { href: "/dashboard/settings/system", label: "System", icon: ShieldAlert },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
      <aside className="min-h-[calc(100vh-3.5rem)] border-r border-white/5 bg-white/[0.01] p-4">
        <p className="text-text-muted mb-3 px-2 text-[10px] tracking-wider uppercase">Settings</p>
        <nav className="space-y-1">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const active = section.exact
              ? pathname === section.href
              : pathname.startsWith(section.href);
            return (
              <Link
                key={section.href}
                href={section.href}
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
          })}
        </nav>
      </aside>
      <section className="max-w-3xl p-4 md:p-8">{children}</section>
    </div>
  );
}
