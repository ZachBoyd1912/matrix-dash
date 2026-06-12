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
    <div className="flex items-stretch border-b border-white/5 overflow-x-auto">
      {files.map((file) => {
        const isActive = file.id === activeId;
        const isDirty = dirty.has(file.id);
        return (
          <div
            key={file.id}
            className={cn(
              "group relative flex items-center gap-2 px-3 h-9 border-r border-white/5 text-xs cursor-pointer transition-colors min-w-0",
              isActive
                ? "bg-white/[0.05] text-text-primary"
                : "text-text-secondary hover:bg-white/[0.03]"
            )}
            onClick={() => onSelect(file.id)}
          >
            {isActive && (
              <span className="absolute top-0 left-0 right-0 h-px bg-emerald-400" />
            )}
            <span className="truncate max-w-[160px]">{file.name}</span>
            {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(file.id);
              }}
              className="text-text-muted hover:text-text-primary p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
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
