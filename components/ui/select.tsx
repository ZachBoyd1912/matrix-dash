import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "glass-input h-9 px-2 pr-7 rounded-md text-sm text-text-primary appearance-none cursor-pointer",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
