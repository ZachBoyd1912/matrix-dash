export interface ParsedAddress {
  /** The human name, or the address's local part when there is no name. */
  name: string;
  /** The bare address, lowercased. Empty when the header is unparseable. */
  address: string;
}

/**
 * Split a `From`/`To` header into a display name and an address.
 *
 * Headers arrive in several shapes and the list currently shows the raw string,
 * so `"PU Prime" <noreply@puprime.com>` renders in full where a name belongs.
 * Handles: `Name <addr>`, `"Quoted, Name" <addr>`, a bare `addr`, and the
 * empty case.
 */
export function parseAddress(header: string): ParsedAddress {
  const raw = (header ?? "").trim();
  if (!raw) return { name: "", address: "" };

  const angled = raw.match(/^(.*?)<([^>]+)>\s*$/);
  if (angled) {
    const address = angled[2].trim().toLowerCase();
    // A quoted name may itself contain the comma that would otherwise split
    // an address list, so the quotes are stripped only after matching.
    const name = angled[1]
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim();
    return { name: name || address.split("@")[0], address };
  }

  const address = raw.toLowerCase();
  return { name: address.split("@")[0] || address, address };
}

/** Every address in a comma-separated header, ignoring commas inside quotes. */
export function parseAddressList(header: string): ParsedAddress[] {
  const raw = (header ?? "").trim();
  if (!raw) return [];
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngles = false;
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "<") inAngles = true;
    else if (ch === ">") inAngles = false;
    if (ch === "," && !inQuotes && !inAngles) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => parseAddress(p)).filter((a) => a.address);
}

/**
 * A stable colour for a sender's avatar, derived from the address so the same
 * sender is always the same colour. Hue only — saturation and lightness are
 * fixed so every avatar sits at the same visual weight.
 */
export function avatarColor(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360} 55% 45%)`;
}

/** The initial shown in the avatar circle. */
export function avatarInitial(parsed: ParsedAddress): string {
  const source = parsed.name || parsed.address;
  const letter = source.replace(/[^a-z0-9]/gi, "").charAt(0);
  return (letter || "?").toUpperCase();
}

/** `Re:`/`Fwd:` prefix without stacking duplicates the way naive concatenation does. */
export function prefixSubject(subject: string, prefix: "Re" | "Fwd"): string {
  const clean = (subject || "(no subject)").trim();
  const already = new RegExp(`^${prefix}:`, "i").test(clean);
  return already ? clean : `${prefix}: ${clean}`;
}

/**
 * The quoted original, in the convention every mail client uses: an attribution
 * line followed by `> ` prefixed body. Built from the plain-text body rather
 * than the HTML — a reply composed in a plain textarea cannot carry markup, and
 * quoting raw tags into it would be worse than useless.
 */
export function quoteBody(from: string, date: string, body: string): string {
  const who = parseAddress(from);
  const when = new Date(date);
  const stamp = Number.isNaN(when.getTime()) ? "" : when.toLocaleString();
  const attribution = `On ${stamp}, ${who.name || who.address} <${who.address}> wrote:`;
  const quoted = (body || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\n${attribution}\n${quoted}\n`;
}
