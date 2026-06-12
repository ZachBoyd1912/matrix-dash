import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-medium uppercase tracking-wider border bg-white/5 border-white/10 text-text-secondary",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
