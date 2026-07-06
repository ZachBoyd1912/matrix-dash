import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "glass-input text-text-primary placeholder:text-text-muted h-10 w-full rounded-md px-3 text-sm",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "glass-input text-text-primary placeholder:text-text-muted w-full resize-none rounded-md p-3 text-sm",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
