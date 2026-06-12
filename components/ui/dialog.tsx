"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, className }: Props) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={cn(
          "relative glass-strong rounded-2xl w-full max-w-lg p-6 animate-[fadeIn_180ms_ease-out]",
          className
        )}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-white/5"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {title && <h2 className="text-lg font-semibold text-text-primary mb-1">{title}</h2>}
        {description && <p className="text-xs text-text-secondary mb-4">{description}</p>}
        {children}
      </div>
    </div>
  );
}
