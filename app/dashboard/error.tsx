"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ui/error-fallback";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4 md:p-8">
      <ErrorFallback
        title="This page crashed"
        description="Something went wrong loading this part of the dashboard. Try again, or head back to the overview."
        error={error}
        onRetry={reset}
        className="max-w-md"
      />
    </div>
  );
}
