export interface RetryOptions {
  /** Total attempts including the first (not a retry count). */
  attempts?: number;
  baseMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `fn` with jittered exponential backoff (base·2^n, ±25% jitter —
 * 1s/2s/4s at the default base). Rethrows the last error once attempts are
 * exhausted.
 */
export async function withBackoff<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 1000;
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) break;
      const backoff = baseMs * 2 ** i;
      await sleep(backoff * (0.75 + Math.random() * 0.5));
    }
  }
  throw lastError;
}
