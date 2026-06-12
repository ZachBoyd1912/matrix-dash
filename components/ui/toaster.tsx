"use client";

import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { useFeedback } from "@/lib/stores/use-feedback";
import { cn } from "@/lib/utils/cn";

const ICONS = {
  success: <CheckCircle2 size={15} className="text-emerald-400" />,
  error: <XCircle size={15} className="text-rose-400" />,
  default: <Info size={15} className="text-sky-400" />,
};

export function Toaster() {
  const toasts = useFeedback((s) => s.toasts);
  const dismiss = useFeedback((s) => s.dismissToast);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "glass-strong rounded-xl p-3 flex items-start gap-2.5 pointer-events-auto",
            "animate-[toastIn_220ms_cubic-bezier(0.32,0.72,0,1)]"
          )}
        >
          <span className="mt-0.5 shrink-0">{ICONS[t.variant]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-text-primary">{t.title}</p>
            {t.description && (
              <p className="text-[11px] text-text-secondary mt-0.5">{t.description}</p>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="text-text-muted hover:text-text-primary shrink-0 p-0.5"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
