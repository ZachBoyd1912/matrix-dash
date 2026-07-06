"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ui/error-fallback";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[settings]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4 md:p-8">
      <ErrorFallback
        title="Settings crashed"
        description="This settings page hit an error. Nothing was saved incorrectly — retry to reload it."
        error={error}
        onRetry={reset}
        className="max-w-md"
      />
    </div>
  );
}
