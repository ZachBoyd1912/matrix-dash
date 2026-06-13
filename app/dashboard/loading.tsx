import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-transition fallback for every top-level dashboard page.
 *
 * Without a loading boundary, navigating to a not-yet-loaded segment (in dev,
 * one that still has to compile) freezes on the previous screen, which reads as
 * "the app is slow". This renders an instant skeleton inside the shell so the
 * sidebar/topbar stay put and the click feels immediate.
 */
export default function DashboardLoading() {
  return (
    <div className="p-4 md:p-8 space-y-6 animate-[fadeIn_120ms_ease-out]">
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-72 opacity-60" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-full opacity-70" />
            <Skeleton className="h-3 w-3/4 opacity-70" />
            <Skeleton className="h-8 w-24 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
