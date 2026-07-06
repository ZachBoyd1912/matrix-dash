import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-text-secondary inline-flex h-5 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 text-[10px] font-medium tracking-wider uppercase",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
