import { cn } from "@/lib/utils/cn";

interface Props {
  label: string;
  value: string | number;
  change?: number; // positive = up, negative = down
  changeLabel?: string;
  sparkline?: number[]; // 24 data points for mini sparkline
  className?: string;
}

export function MetricTile({ label, value, change, changeLabel, sparkline, className }: Props) {
  return (
    <div className={cn("bg-bg-surface rounded-xl border border-white/5 p-4", className)}>
      <p className="text-text-muted text-[11px] font-medium tracking-wider uppercase">{label}</p>
      <p className="text-text-primary mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {change !== undefined && (
        <div className="mt-1 flex items-center gap-1">
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              change >= 0 ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {change >= 0 ? "\u2191" : "\u2193"} {Math.abs(change)}%
          </span>
          {changeLabel && <span className="text-text-muted text-[10px]">{changeLabel}</span>}
        </div>
      )}
      {sparkline && sparkline.length > 0 && (
        <div className="mt-3 flex h-8 items-end gap-px">
          {sparkline.map((v, i) => {
            const max = Math.max(...sparkline, 1);
            const h = Math.max(2, (v / max) * 32);
            return (
              <div key={i} className="flex-1 rounded-sm bg-emerald-400/80" style={{ height: h }} />
            );
          })}
        </div>
      )}
    </div>
  );
}
