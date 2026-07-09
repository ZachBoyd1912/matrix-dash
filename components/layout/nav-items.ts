import {
  MessageSquare,
  BrainCircuit,
  Layers,
  Blocks,
  Code2,
  Settings,
  FileText,
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
  { href: "/dashboard/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/dashboard/projects", label: "Project Planning", icon: FolderKanban },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/email", label: "Email", icon: Mail },
  { href: "/dashboard/research", label: "Research", icon: FlaskConical },
  { href: "/dashboard/compare", label: "Compare", icon: GitCompare },
  { href: "/dashboard/images", label: "Images", icon: ImageIcon },
  { href: "/dashboard/skills", label: "Skills", icon: Wand2 },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/sessions", label: "Sessions", icon: Layers },
  { href: "/dashboard/ide", label: "IDE", icon: Code2 },
  { href: "/dashboard/matrix-builder", label: "Matrix Builder", icon: Blocks },
  { href: "/dashboard/console", label: "Console", icon: SquareTerminal },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
}
