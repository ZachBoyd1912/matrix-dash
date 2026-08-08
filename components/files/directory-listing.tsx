"use client";

import { Folder, FileText, Image, File } from "lucide-react";
import type { FileEntry } from "@/lib/files-security";

interface Props {
  entries: FileEntry[];
  onNavigate: (path: string) => void;
  onFileTap: (file: FileEntry) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

function fileIcon(entry: FileEntry, hidden: boolean) {
  const ext = entry.extension || "";
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff"]);
  if (entry.type === "dir") return <Folder size={18} className="shrink-0 text-sky-400" />;
  if (imageExts.has(ext)) return <Image size={18} className="shrink-0 text-purple-400" />;
  return <FileText size={18} className={hidden ? "text-text-muted" : "text-text-secondary"} />;
}

export function DirectoryListing({ entries, onNavigate, onFileTap }: Props) {
  return (
    <ul className="divide-y divide-white/5">
      {entries.map(function renderEntry(entry) {
        const isDir = entry.type === "dir";
        const hidden = entry.hidden;

        return (
          <li key={entry.path}>
            <button
              onClick={() => (isDir ? onNavigate(entry.path) : onFileTap(entry))}
              className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]"
              style={{ minHeight: 48 }}
            >
              {/* Icon */}
              <span className={hidden ? "opacity-40" : ""}>{fileIcon(entry, hidden)}</span>

              {/* Name + meta */}
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm ${hidden ? "text-text-muted" : "text-text-primary"}`}
                >
                  {entry.name}
                </p>
                <p className="text-text-muted text-[11px]">
                  {isDir
                    ? "Folder"
                    : `${entry.size != null ? formatSize(entry.size) : ""}${entry.mtime ? ` · ${formatTime(entry.mtime)}` : ""}`}
                </p>
              </div>

              {/* Arrow for directories */}
              {isDir && <span className="text-text-muted text-[10px]">{">"}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
