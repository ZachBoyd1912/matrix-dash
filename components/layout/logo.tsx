import { cn } from "@/lib/utils/cn";

interface Props {
  className?: string;
  size?: number;
}

export function LogoMark({ className, size = 22 }: Props) {
  return (
    <svg
      className={cn(className)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="md-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#md-grad)" opacity="0.18" />
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="7.5"
        stroke="url(#md-grad)"
        strokeOpacity="0.55"
      />
      <path
        d="M9 22 L9 10 L13 10 L16 16 L19 10 L23 10 L23 22"
        stroke="url(#md-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
