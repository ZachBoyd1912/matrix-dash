import { cn } from "@/lib/utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return <Skeleton className={cn("h-24 rounded-2xl", className)} />;
}

export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 rounded-xl" />
      ))}
    </div>
  );
}

export function SkeletonGraph({ className }: { className?: string }) {
  return <Skeleton className={cn("h-[400px] rounded-2xl", className)} />;
}
