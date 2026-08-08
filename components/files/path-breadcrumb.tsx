"use client";

import { ChevronRight } from "lucide-react";

interface Props {
  currentPath: string;
  name: string;
  onNavigate: (path: string) => void;
}

export function PathBreadcrumb({ currentPath, name, onNavigate }: Props) {
  // The API includes a "name" field (last segment or "~" for root).
  // Build segments by splitting the path.
  const segments = currentPath.split("/").filter(Boolean);

  // Build breadcrumb segments with their cumulative paths.
  const crumbs: { label: string; path: string }[] = [];

  // Find the "Users" segment to know where home starts.
  const usersIdx = segments.indexOf("Users");
  if (usersIdx >= 0 && segments[usersIdx + 1]) {
    // First segment is "~" (home directory shorthand)
    const homePath = "/" + segments.slice(0, usersIdx + 2).join("/");
    crumbs.push({ label: "~", path: homePath });

    // Remaining segments after /Users/<username>
    for (let i = usersIdx + 2; i < segments.length; i++) {
      const cumulativePath = "/" + segments.slice(0, i + 1).join("/");
      crumbs.push({ label: segments[i], path: cumulativePath });
    }
  } else {
    // Fallback: just show each segment
    for (let i = 0; i < segments.length; i++) {
      const cumulativePath = "/" + segments.slice(0, i + 1).join("/");
      crumbs.push({ label: i === 0 ? "/" : segments[i], path: cumulativePath });
    }
  }

  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto text-xs" aria-label="File path">
      {crumbs.map(function renderCrumb(crumb, i) {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.path} className="flex items-center gap-0.5 whitespace-nowrap">
            {i > 0 && <ChevronRight size={10} className="text-text-muted shrink-0" />}
            {isLast ? (
              <span className="text-text-primary font-medium">{crumb.label}</span>
            ) : (
              <button
                onClick={() => onNavigate(crumb.path)}
                className="text-text-secondary hover:text-text-primary rounded px-1 py-0.5 transition-colors hover:bg-white/5"
              >
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
