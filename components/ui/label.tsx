import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("text-text-secondary block text-xs font-medium", className)}
    {...props}
  />
));
Label.displayName = "Label";
