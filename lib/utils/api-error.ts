/** Normalizes a caught value (Error, string, or arbitrary throw) to a message string. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `Response.json({ ok: false, error }, { status })` — the shape most API routes already return by hand. */
export function apiError(err: unknown, status = 500): Response {
  return Response.json({ ok: false, error: getErrorMessage(err) }, { status });
}
