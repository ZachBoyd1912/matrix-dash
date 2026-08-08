import {
  MessageSquare,
  BrainCircuit,
  Layers,
  Blocks,
  Code2,
  Settings,
  Sparkles,
  Mail,
  Wand2,
  Calendar,
  CheckSquare,
  FlaskConical,
  GitCompare,
  Image as ImageIcon,
  FolderKanban,
  SquareTerminal,
  Bot,
  Vault,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Omitted = rendered as a standalone top-level link, not inside a collapsible group. */
  groupId?: string;
}

export interface NavGroupMeta {
  id: string;
  label: string;
  icon: LucideIcon;
}

/** Group metadata for the sidebar's collapsible sections. Order here is display order. */
export const NAV_GROUP_META: NavGroupMeta[] = [
  { id: "playground", label: "Playground", icon: FlaskConical },
  { id: "knowledge", label: "Knowledge", icon: BrainCircuit },
  { id: "work", label: "Work", icon: FolderKanban },
  { id: "agents", label: "Agents & Skills", icon: Bot },
  { id: "comms", label: "Communication", icon: Mail },
  { id: "devtools", label: "Dev Tools", icon: Code2 },
];

/**
 * Single source of truth for every top-level nav destination — the sidebar,
 * mobile drawer/bottom-tabs, command palette, and topbar breadcrumb all
 * derive from this one flat list instead of keeping their own copies (which
 * is exactly how those four surfaces drifted out of sync with each other).
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Sparkles, exact: true },
  { href: "/dashboard/sessions", label: "Chat & Sessions", icon: Layers },
  {
    href: "/dashboard/playground/research",
    label: "Research",
    icon: FlaskConical,
    groupId: "playground",
  },
  {
    href: "/dashboard/playground/compare",
    label: "Compare",
    icon: GitCompare,
    groupId: "playground",
  },
  {
    href: "/dashboard/playground/images",
    label: "Images",
    icon: ImageIcon,
    groupId: "playground",
  },
  {
    href: "/dashboard/vault",
    label: "Vault",
    icon: Vault,
    groupId: "knowledge",
  },
  { href: "/dashboard/tasks", label: "Tasks", icon: CheckSquare, groupId: "work" },
  {
    href: "/dashboard/projects",
    label: "Project Planning",
    icon: FolderKanban,
    groupId: "work",
  },
  { href: "/dashboard/skills", label: "Skills", icon: Wand2, groupId: "agents" },
  { href: "/dashboard/agents", label: "Agents", icon: Bot, groupId: "agents" },
  { href: "/dashboard/email", label: "Email", icon: Mail, groupId: "comms" },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar, groupId: "comms" },
  { href: "/dashboard/ide", label: "IDE", icon: Code2, groupId: "devtools" },
  { href: "/dashboard/console", label: "Console", icon: SquareTerminal, groupId: "devtools" },
  {
    href: "/dashboard/matrix-builder",
    label: "Matrix Builder",
    icon: Blocks,
    groupId: "devtools",
  },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/files", label: "Files", icon: FolderOpen },
];

/** Curated bottom-tab set for mobile — deliberately NOT NAV_ITEMS.slice(0,4),
 * which used to pin the dead "Chat" redirect stub to a permanent tab slot. */
export const MOBILE_PRIMARY_HREFS = [
  "/dashboard",
  "/dashboard/sessions",
  "/dashboard/files",
  "/dashboard/tasks",
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
}

export function isGroupActive(groupId: string, pathname: string): boolean {
  return NAV_ITEMS.some((item) => item.groupId === groupId && isNavActive(item, pathname));
}
