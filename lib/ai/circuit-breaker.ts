/**
 * Per-provider circuit breaker for the chat fallback cascade. Same in-module
 * Map pattern as middleware.ts's rate limiter — a single-user, single-process
 * app doesn't need distributed state, just enough memory to stop hammering a
 * provider that's already down.
 *
 * Opens after 3 consecutive failures; a request is allowed through again once
 * the 60s cooldown elapses (a plain trial, not a half-open quota — proportional
 * to what a personal-use app needs).
 */
interface CircuitState {
  failures: number;
  openUntil: number;
}

const circuits = new Map<string, CircuitState>();
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

export function isCircuitOpen(providerId: string, now = Date.now()): boolean {
  const c = circuits.get(providerId);
  if (!c || c.failures < FAILURE_THRESHOLD) return false;
  return now < c.openUntil;
}

export function recordSuccess(providerId: string): void {
  circuits.delete(providerId);
}

export function recordFailure(providerId: string, now = Date.now()): void {
  const c = circuits.get(providerId) ?? { failures: 0, openUntil: 0 };
  c.failures++;
  if (c.failures >= FAILURE_THRESHOLD) c.openUntil = now + COOLDOWN_MS;
  circuits.set(providerId, c);
}
