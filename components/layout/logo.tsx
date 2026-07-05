import { cn } from "@/lib/utils/cn";

interface Props {
  className?: string;
  size?: number;
}

/**
 * Brand marks are fixed rust (#a8461f) regardless of the active color theme —
 * they're identity, not themeable UI chrome. A wax-seal ring with a
 * product-specific glyph inside: a dial-gauge for Dashboard, a drafting
 * compass for Builder.
 */
const SEAL_RUST = "#a8461f";

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
      <circle cx="16" cy="16" r="14.5" stroke={SEAL_RUST} strokeWidth="1.6" />
      <path
        d="M9 20 A7 7 0 0 1 23 20 M16 20 L20 14"
        stroke={SEAL_RUST}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="16" cy="20" r="1.3" fill={SEAL_RUST} />
    </svg>
  );
}

/**
 * Matrix Builder's sibling mark — a drafting-compass glyph (two legs meeting
 * at a point + a spread base), reading as "drafting/construction" to pair
 * with Dashboard's "signal reading" dial-gauge.
 */
export function BuilderMark({ className, size = 22 }: Props) {
  return (
    <svg
      className={cn(className)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="16" cy="16" r="14.5" stroke={SEAL_RUST} strokeWidth="1.6" />
      <path
        d="M16 11 L12 23 M16 11 L20 23 M10.5 23 H13.5 M18.5 23 H21.5"
        stroke={SEAL_RUST}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="16" cy="11" r="1.3" fill={SEAL_RUST} />
    </svg>
  );
}
