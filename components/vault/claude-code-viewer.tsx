"use client";

import { Lock, FolderGit2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WikiContent } from "@/components/notes/wiki-content";
import { timeAgo } from "@/lib/utils/time";
import type { ClaudeCodeFileContent } from "@/types/vault";

interface Props {
  file: ClaudeCodeFileContent;
  /** Navigate to another Claude Code file in the SAME project by [[name]] reference. */
  onNavigateTitle: (title: string) => void;
}

/**
 * Read-only viewer for a Claude Code memory file — no edit affordances at
 * all, on purpose. Claude Code owns this format (frontmatter conventions,
 * cross-references) via its own memory system; matrix-dash only reads it.
 */
export function ClaudeCodeViewer({ file, onNavigateTitle }: Props) {
  const { frontmatter } = file;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-text-muted flex items-center gap-1.5 text-[10px] tracking-[0.16em] uppercase">
            <FolderGit2 size={11} /> {file.project}
          </div>
          <h2 className="text-text-primary mt-1 text-lg font-semibold">
            {frontmatter.name || file.name}
          </h2>
          {frontmatter.description && (
            <p className="text-text-muted mt-1 text-sm">{frontmatter.description}</p>
          )}
        </div>
        <Badge className="border-amber-400/20 bg-amber-400/10 text-amber-400">
          <Lock size={10} /> Read-only
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {frontmatter.type && <Badge>{frontmatter.type}</Badge>}
        {file.mtimeMs && (
          <span className="text-text-muted text-[10px]">
            edited {timeAgo(new Date(file.mtimeMs).toISOString())}
          </span>
        )}
      </div>

      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
        <WikiContent content={file.body} onNavigate={onNavigateTitle} />
      </div>

      <p className="text-text-muted text-[10px]">
        This file lives in Claude Code&rsquo;s own memory system and is shown here for reference.
        Edit it from within Claude Code — changes made here won&rsquo;t be saved.
      </p>
    </div>
  );
}
