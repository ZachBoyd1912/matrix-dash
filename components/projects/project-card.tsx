"use client";

import { FolderKanban, ExternalLink, Layers, Database, Terminal } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Project } from "@/types/jarvis";

// Badge colour by project type — mirrors the reference catalog (projects.html).
const BADGE_COLORS: Record<string, string> = {
  frontend: "border-blue-500/40 text-blue-400 bg-blue-500/10",
  fullstack: "border-purple-500/40 text-purple-400 bg-purple-500/10",
  backend: "border-orange-500/40 text-orange-400 bg-orange-500/10",
  automation: "border-teal-500/40 text-teal-400 bg-teal-500/10",
  platform: "border-amber-500/40 text-amber-400 bg-amber-500/10",
  empty: "border-rose-500/40 text-rose-400 bg-rose-500/10",
};

// Left accent stripe colour, keyed off badge type.
const ACCENT: Record<string, string> = {
  frontend: "before:bg-blue-400/70",
  fullstack: "before:bg-purple-400/70",
  backend: "before:bg-orange-400/70",
  automation: "before:bg-teal-400/70",
  platform: "before:bg-amber-400/70",
  empty: "before:bg-rose-400/70",
};

// Coloured tech tags — detected from the freeform stack strings.
const TAG_DEFS: { match: RegExp; label: string; className: string }[] = [
  { match: /next\.?js/i,   label: "Next.js",  className: "border-white/30 text-white" },
  { match: /react/i,       label: "React",    className: "border-cyan-400/40 text-cyan-300" },
  { match: /vite/i,        label: "Vite",     className: "border-indigo-400/40 text-indigo-300" },
  { match: /tailwind/i,    label: "Tailwind", className: "border-sky-400/40 text-sky-300" },
  { match: /three/i,       label: "Three.js", className: "border-orange-400/40 text-orange-300" },
  { match: /gsap/i,        label: "GSAP",     className: "border-lime-400/40 text-lime-300" },
  { match: /framer/i,      label: "Framer",   className: "border-blue-400/40 text-blue-300" },
  { match: /firebase/i,    label: "Firebase", className: "border-amber-400/40 text-amber-300" },
  { match: /supabase/i,    label: "Supabase", className: "border-emerald-400/40 text-emerald-300" },
  { match: /drizzle/i,     label: "Drizzle",  className: "border-lime-400/40 text-lime-300" },
  { match: /turso|libsql/i,label: "Turso",    className: "border-teal-400/40 text-teal-300" },
  { match: /sqlite/i,      label: "SQLite",   className: "border-sky-500/40 text-sky-300" },
  { match: /fastapi/i,     label: "FastAPI",  className: "border-teal-400/40 text-teal-300" },
  { match: /flask/i,       label: "Flask",    className: "border-white/20 text-text-secondary" },
  { match: /python/i,      label: "Python",   className: "border-blue-400/40 text-blue-300" },
  { match: /remix/i,       label: "Remix",    className: "border-white/30 text-white" },
  { match: /chroma/i,      label: "ChromaDB", className: "border-orange-500/40 text-orange-300" },
  { match: /postgres/i,    label: "Postgres", className: "border-sky-400/40 text-sky-300" },
];

function deriveTags(project: Project): { label: string; className: string }[] {
  const blob = [project.frontend, project.backend, project.database].filter(Boolean).join(" · ");
  const seen = new Set<string>();
  const tags: { label: string; className: string }[] = [];
  for (const def of TAG_DEFS) {
    if (def.match.test(blob) && !seen.has(def.label)) {
      seen.add(def.label);
      tags.push({ label: def.label, className: def.className });
    }
  }
  return tags;
}

interface Props {
  project: Project;
  onViewTasks: (id: string) => void;
}

export function ProjectCard({ project, onViewTasks }: Props) {
  const isEmpty = project.badge === "empty";
  const tags = deriveTags(project);

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 pl-6 transition-colors duration-200 hover:border-white/[0.14]",
        "before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[3px] before:rounded-full",
        ACCENT[project.badge] ?? "before:bg-white/20"
      )}
    >
      {/* Header: name + badge */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[1.05rem] font-semibold tracking-tight text-text-primary truncate">
            {project.name}
          </h3>
          {project.path && (
            <a
              href={`file://${project.path}`}
              target="_blank"
              rel="noreferrer"
              className="text-text-muted hover:text-emerald-400 shrink-0 transition-colors"
              title="Open in Finder"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onViewTasks(project.id)}
            className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
            title="Filter the task board by this project"
          >
            <FolderKanban size={11} />
            Tasks
          </button>
          <span
            className={cn(
              "inline-flex items-center h-5 px-2.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
              BADGE_COLORS[project.badge] ?? "border-white/10 text-text-muted"
            )}
          >
            {project.badge}
          </span>
        </div>
      </div>

      {/* Description */}
      <div className="mt-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-400">
          Description
        </span>
        <p className={cn("text-[13px] mt-0.5 leading-relaxed", isEmpty ? "text-text-muted italic" : "text-text-secondary")}>
          {project.description}
        </p>
      </div>

      {/* Purpose */}
      <div className="mt-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-400">
          Purpose
        </span>
        <p className={cn("text-[13px] mt-0.5 leading-relaxed", isEmpty ? "text-text-muted italic" : "text-text-secondary")}>
          {project.purpose}
        </p>
      </div>

      {/* Tech Stack */}
      <div className="mt-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-teal-400">
          Tech Stack
        </span>
        {project.frontend || project.backend || project.database ? (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1">
              {project.frontend && (
                <span className="text-[12px] text-text-muted flex items-center gap-1.5">
                  <Layers size={11} className="text-blue-400" />
                  <span className="text-text-secondary font-medium uppercase text-[10px] tracking-wide">FE</span>
                  {project.frontend}
                </span>
              )}
              {project.backend && (
                <span className="text-[12px] text-text-muted flex items-center gap-1.5">
                  <Terminal size={11} className="text-amber-400" />
                  <span className="text-text-secondary font-medium uppercase text-[10px] tracking-wide">BE</span>
                  {project.backend}
                </span>
              )}
              {project.database && (
                <span className="text-[12px] text-text-muted flex items-center gap-1.5">
                  <Database size={11} className="text-emerald-400" />
                  <span className="text-text-secondary font-medium uppercase text-[10px] tracking-wide">DB</span>
                  {project.database}
                </span>
              )}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <span
                    key={t.label}
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-md border bg-white/[0.03]",
                      t.className
                    )}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-[13px] mt-0.5 text-text-muted italic">TBD · TBD · TBD</p>
        )}
      </div>
    </div>
  );
}
