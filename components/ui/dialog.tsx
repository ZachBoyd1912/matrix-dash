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
          "glass-strong relative w-full max-w-lg animate-[fadeIn_180ms_ease-out] rounded-2xl p-6",
          className
        )}
      >
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary absolute top-3 right-3 rounded-md p-1 hover:bg-white/5"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {title && <h2 className="text-text-primary mb-1 text-lg font-semibold">{title}</h2>}
        {description && <p className="text-text-secondary mb-4 text-xs">{description}</p>}
        {children}
      </div>
    </div>
  );
}
