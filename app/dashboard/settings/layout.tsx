"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Brain, Palette, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const SECTIONS = [
  { href: "/dashboard/settings", label: "AI Providers", icon: Bot, exact: true },
  { href: "/dashboard/settings/memory", label: "Memory", icon: Brain },
  { href: "/dashboard/settings/appearance", label: "Appearance", icon: Palette },
  { href: "/dashboard/settings/system", label: "System", icon: ShieldAlert },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
      <aside className="border-r border-white/5 p-4 bg-white/[0.01] min-h-[calc(100vh-3.5rem)]">
        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-3 px-2">Settings</p>
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
                  "flex items-center gap-2 px-3 h-8 rounded-md text-xs transition-colors",
                  active
                    ? "bg-white/[0.06] text-text-primary"
                    : "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
                )}
              >
                <Icon size={13} className={active ? "text-emerald-400" : ""} />
                {section.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="p-4 md:p-8 max-w-3xl">{children}</section>
    </div>
  );
}
