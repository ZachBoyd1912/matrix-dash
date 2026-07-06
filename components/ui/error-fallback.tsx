"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface ErrorFallbackProps {
  title?: string;
  description?: string;
  error?: Error & { digest?: string };
  onRetry?: () => void;
  className?: string;
}

export function ErrorFallback({
  title = "Something went wrong",
  description = "An unexpected error occurred. You can try again, or head back to the overview.",
  error,
  onRetry,
  className,
}: ErrorFallbackProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/[0.03] p-8 text-center",
        className
      )}
    >
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-rose-500/10 text-rose-400">
        <AlertTriangle size={18} />
      </div>
      <h3 className="text-text-primary mb-1 text-sm font-medium">{title}</h3>
      <p className="text-text-secondary mb-4 max-w-sm text-xs">{description}</p>
      {error?.message && (
        <pre className="text-text-muted mb-4 max-w-full overflow-x-auto rounded-md bg-black/20 px-3 py-2 text-left text-[11px]">
          {error.message}
        </pre>
      )}
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw size={13} /> Try again
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/dashboard")}>
          <Home size={13} /> Back to overview
        </Button>
      </div>
    </div>
  );
}
