"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, GitCompare, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { href: "/dashboard/playground/research", label: "Research", icon: FlaskConical },
  { href: "/dashboard/playground/compare", label: "Compare", icon: GitCompare },
  { href: "/dashboard/playground/images", label: "Images", icon: ImageIcon },
];

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-white/5 px-4 pt-3 md:px-8">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex h-9 items-center gap-2 rounded-t-lg px-3.5 text-sm transition-colors",
                active
                  ? "text-text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-white/[0.03]"
              )}
            >
              <Icon size={14} className={active ? "text-emerald-400" : ""} />
              {tab.label}
              {active && (
                <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              )}
            </Link>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
