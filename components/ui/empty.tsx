import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 rounded-xl border border-white/5 bg-white/[0.02]",
        className
      )}
    >
      {icon && (
        <div className="mb-3 h-10 w-10 rounded-full grid place-items-center bg-white/5 text-text-secondary">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-text-secondary max-w-xs mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
