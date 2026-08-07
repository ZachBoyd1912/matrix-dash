"use client";

import { ExternalLink, FileWarning, Link2, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WikiContent } from "@/components/notes/wiki-content";
import { timeAgo } from "@/lib/utils/time";
import type { VaultFileDetail } from "@/types/vault";

interface Props {
  file: VaultFileDetail;
  /** The vault directory's basename, for the obsidian:// link. */
  vaultName: string | null;
  onSelectPath: (relPath: string) => void;
}

/** Frontmatter keys already shown in the header — don't repeat them as badges. */
const HEADER_KEYS = new Set(["name", "description", "title"]);

/**
 * Read-only viewer for any indexed vault file matrix-dash does not own —
 * Claude Code's memory, session write-ups, the vault README, anything the
 * operator adds. No edit affordances at all, on purpose: those formats belong
 * to whatever wrote them, and matrix-dash only reads. Files that DO have a
 * matrix-dash row open in NoteEditor/MemoryDetail instead and never reach here.
 */
export function VaultFileViewer({ file, vaultName, onSelectPath }: Props) {
  const { frontmatter } = file;
  const badges = Object.entries(frontmatter).filter(
    ([key, value]) => !HEADER_KEYS.has(key) && value && value.length < 60
  );

  // Obsidian resolves `file` against the named vault, so both parts must be
  // encoded — vault names and note names both routinely contain spaces.
  const obsidianUri =
    vaultName &&
    `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file.relPath)}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-text-muted truncate text-[10px] tracking-[0.16em] uppercase">
            {file.dirPath || "Vault root"}
          </div>
          <h2 className="text-text-primary mt-1 text-lg font-semibold">
            {frontmatter.name || frontmatter.title || file.name.replace(/\.md$/i, "")}
          </h2>
          {frontmatter.description && (
            <p className="text-text-muted mt-1 text-sm">{frontmatter.description}</p>
          )}
        </div>
        <Badge className="shrink-0 border-amber-400/20 bg-amber-400/10 text-amber-400">
          <Lock size={10} /> Read-only
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {badges.map(([key, value]) => (
          <Badge key={key}>
            {key}: {value}
          </Badge>
        ))}
        {file.mtimeMs && (
          <span className="text-text-muted text-[10px]">
            edited {timeAgo(new Date(file.mtimeMs).toISOString())}
          </span>
        )}
        {obsidianUri && (
          <a
            href={obsidianUri}
            className="text-text-muted hover:text-text-primary inline-flex items-center gap-1 text-[10px] transition-colors"
          >
            <ExternalLink size={10} /> Open in Obsidian
          </a>
        )}
      </div>

      {file.isText ? (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
          <WikiContent
            content={file.body}
            onNavigate={(title) => {
              // Resolve using the server's own resolution for this file rather
              // than guessing client-side: the index already decided which
              // MEMORY.md a [[MEMORY]] in this folder meant.
              const match = file.outgoing.find(
                (l) => l.raw.toLowerCase() === title.toLowerCase() && l.relPath
              );
              if (match?.relPath) onSelectPath(match.relPath);
            }}
          />
        </div>
      ) : (
        <div className="text-text-muted flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-4 text-xs">
          <FileWarning size={13} />
          <span>
            {file.ext ? `.${file.ext}` : "This"} files aren&rsquo;t indexed for reading — open it in
            Obsidian.
          </span>
        </div>
      )}

      {file.backlinks.length > 0 && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
          <h3 className="text-text-muted flex items-center gap-1.5 text-[10px] tracking-[0.16em] uppercase">
            <Link2 size={11} /> {file.backlinks.length} link
            {file.backlinks.length === 1 ? "" : "s"} here
          </h3>
          <div className="mt-2 space-y-0.5">
            {file.backlinks.map((b) => (
              <button
                key={b.relPath}
                onClick={() => onSelectPath(b.relPath)}
                className="text-text-secondary hover:text-text-primary block w-full truncate rounded px-2 py-1 text-left text-xs transition-colors hover:bg-white/[0.03]"
                title={b.relPath}
              >
                {b.name.replace(/\.md$/i, "")}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-text-muted text-[10px]">
        This file lives in the Obsidian vault and is shown here for reference. Edit it in Obsidian —
        changes made here won&rsquo;t be saved.
      </p>
    </div>
  );
}
