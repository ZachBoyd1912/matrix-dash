import {
  MessageSquare,
  BrainCircuit,
  Layers,
  Code2,
  Settings,
  FileText,
  Sparkles,
  Mail,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Sparkles, exact: true },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/memory-bank", label: "Memory Bank", icon: BrainCircuit },
  { href: "/dashboard/notes", label: "Notes", icon: FileText },
  { href: "/dashboard/email", label: "Email", icon: Mail },
  { href: "/dashboard/sessions", label: "Sessions", icon: Layers },
  { href: "/dashboard/ide", label: "IDE", icon: Code2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
}
