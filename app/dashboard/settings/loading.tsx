import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback shown when switching between Settings sub-pages. It renders inside the
 * Settings <section>, so the settings sidebar stays visible and only the form
 * area swaps to a skeleton — instant feedback even while the page compiles.
 */
export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-[fadeIn_120ms_ease-out]">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64 opacity-60" />
      </div>
      <div className="glass rounded-xl p-4 space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="glass rounded-xl p-4 space-y-3">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}
