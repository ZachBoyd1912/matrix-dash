"use client";

import { useState } from "react";
import {
  FolderKanban,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Layers,
  Database,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Project } from "@/types/jarvis";

const BADGE_COLORS: Record<string, string> = {
  frontend: "border-blue-500/40 text-blue-400 bg-blue-500/10",
  fullstack: "border-purple-500/40 text-purple-400 bg-purple-500/10",
  backend: "border-orange-500/40 text-orange-400 bg-orange-500/10",
  automation: "border-teal-500/40 text-teal-400 bg-teal-500/10",
  platform: "border-amber-500/40 text-amber-400 bg-amber-500/10",
  empty: "border-rose-500/40 text-rose-400 bg-rose-500/10",
};

interface Props {
  project: Project;
  onViewTasks: (id: string) => void;
}

export function ProjectCard({ project, onViewTasks }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass rounded-xl border border-white/5 hover:border-white/10 transition-all duration-300">
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider border shrink-0",
                BADGE_COLORS[project.badge] ?? "border-white/10 text-text-muted"
              )}
            >
              {project.badge}
            </span>
            <span className="text-sm font-semibold text-text-primary truncate">
              {project.name}
            </span>
            {project.path && (
              <a
                href={`file://${project.path}`}
                target="_blank"
                rel="noreferrer"
                className="text-text-muted hover:text-emerald-400 shrink-0 transition-colors"
                title="Open in Finder"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onViewTasks(project.id)}
              className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
            >
              <FolderKanban size={11} />
              Tasks
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-white/5 transition-colors"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </div>

        {/* Expandable sections */}
        {expanded && (
          <div className="mt-3 space-y-2.5 border-t border-white/5 pt-3">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                Description
              </span>
              <p className="text-[13px] text-text-secondary mt-0.5 leading-relaxed">
                {project.description}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Purpose
              </span>
              <p className="text-[13px] text-text-secondary mt-0.5 leading-relaxed">
                {project.purpose}
              </p>
            </div>
            {(project.frontend || project.backend || project.database) && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-400">
                  Tech Stack
                </span>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  {project.frontend && (
                    <span className="text-[12px] text-text-muted flex items-center gap-1">
                      <Layers size={10} className="text-blue-400" />
                      {project.frontend}
                    </span>
                  )}
                  {project.backend && (
                    <span className="text-[12px] text-text-muted flex items-center gap-1">
                      <Terminal size={10} className="text-amber-400" />
                      {project.backend}
                    </span>
                  )}
                  {project.database && (
                    <span className="text-[12px] text-text-muted flex items-center gap-1">
                      <Database size={10} className="text-emerald-400" />
                      {project.database}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
