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
        "flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center",
        className
      )}
    >
      {icon && (
        <div className="text-text-secondary mb-3 grid h-10 w-10 place-items-center rounded-full bg-white/5">
          {icon}
        </div>
      )}
      <h3 className="text-text-primary mb-1 text-sm font-medium">{title}</h3>
      {description && <p className="text-text-secondary mb-4 max-w-xs text-xs">{description}</p>}
      {action}
    </div>
  );
}
