"use client";

import { avatarColor, avatarInitial, parseAddress } from "@/lib/utils/email-address";

interface Props {
  fromAddr: string;
  toAddr: string;
  createdAt: string;
}

/**
 * Sender identity, the way every mail client shows it: a coloured initial, the
 * display name in full, and the address secondary.
 *
 * The list and reading pane previously printed the raw header, so
 * `PU Prime <noreply@puprime.com>` appeared verbatim where a name belongs.
 */
export function EmailHeader({ fromAddr, toAddr, createdAt }: Props) {
  const from = parseAddress(fromAddr);
  const to = parseAddress(toAddr);
  const when = new Date(createdAt);
  const valid = !Number.isNaN(when.getTime());

  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
        style={{ background: avatarColor(from.address || from.name) }}
      >
        {avatarInitial(from)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-text-primary truncate text-sm font-medium">{from.name}</span>
          {from.address && from.address !== from.name && (
            <span className="text-text-muted truncate text-[11px]">&lt;{from.address}&gt;</span>
          )}
        </div>
        <div className="text-text-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
          <span className="truncate">to {to.name || to.address || "me"}</span>
          {valid && (
            // The full timestamp on hover, the way Gmail does — the relative
            // time above the message is friendlier but loses the actual moment.
            <span title={when.toLocaleString()}>· {when.toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
