/**
 * Best-effort masking of secret values so raw credentials never land in a
 * persisted agent transcript, even when a redacted read is allowed. Masks:
 *  - KEY=value / KEY: value assignments (common in .env dumps)
 *  - long high-entropy tokens (API keys, JWTs)
 * Keys/names stay visible; only the value is starred out.
 */

const ASSIGNMENT = /\b([A-Z0-9_]{2,}\s*[:=]\s*)(["']?)([^\s"'#]{4,})\2/g;
const LONG_TOKEN = /\b([A-Za-z0-9_-]{28,}\.?[A-Za-z0-9_.-]*)\b/g;

export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text.replace(
    ASSIGNMENT,
    (_m, key: string, quote: string) => `${key}${quote}••••••••${quote}`
  );
  out = out.replace(LONG_TOKEN, (m) => (looksLikeSecret(m) ? "••••••••" : m));
  return out;
}

function looksLikeSecret(token: string): boolean {
  // A path, URL, or ordinary word shouldn't be masked; a mixed-case/digit blob likely is a key.
  if (token.includes("/") || token.includes("\\")) return false;
  const hasUpper = /[A-Z]/.test(token);
  const hasLower = /[a-z]/.test(token);
  const hasDigit = /[0-9]/.test(token);
  const classes = [hasUpper, hasLower, hasDigit].filter(Boolean).length;
  return classes >= 2 && token.length >= 28;
}

/** Mask secret values inside an arbitrary tool result before it enters the transcript. */
export function redactResult(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactSecrets(value);
  try {
    return JSON.parse(redactSecrets(JSON.stringify(value)));
  } catch {
    return value;
  }
}
