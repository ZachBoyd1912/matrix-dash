"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ui/error-fallback";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[chat]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4 md:p-8">
      <ErrorFallback
        title="Chat crashed"
        description="The conversation view hit an error. Your messages are safe — retry to reload the session."
        error={error}
        onRetry={reset}
        className="max-w-md"
      />
    </div>
  );
}
