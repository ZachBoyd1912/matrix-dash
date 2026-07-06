"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface TabItem {
  id: string;
  name: string;
}

interface Props {
  files: TabItem[];
  activeId: string | null;
  dirty: Set<string>;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function EditorTabs({ files, activeId, dirty, onSelect, onClose }: Props) {
  return (
    <div className="flex items-stretch overflow-x-auto border-b border-white/5">
      {files.map((file) => {
        const isActive = file.id === activeId;
        const isDirty = dirty.has(file.id);
        return (
          <div
            key={file.id}
            className={cn(
              "group relative flex h-9 min-w-0 cursor-pointer items-center gap-2 border-r border-white/5 px-3 text-xs transition-colors",
              isActive
                ? "text-text-primary bg-white/[0.05]"
                : "text-text-secondary hover:bg-white/[0.03]"
            )}
            onClick={() => onSelect(file.id)}
          >
            {isActive && <span className="absolute top-0 right-0 left-0 h-px bg-emerald-400" />}
            <span className="max-w-[160px] truncate">{file.name}</span>
            {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(file.id);
              }}
              className="text-text-muted hover:text-text-primary rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Close tab"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
