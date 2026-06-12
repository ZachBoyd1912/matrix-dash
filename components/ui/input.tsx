import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "glass-input w-full h-10 px-3 rounded-md text-sm text-text-primary placeholder:text-text-muted",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "glass-input w-full p-3 rounded-md text-sm text-text-primary placeholder:text-text-muted resize-none",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
