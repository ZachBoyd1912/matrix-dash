import { streamText, type StreamTextResult, type TextStreamPart } from "ai";
import type { FallbackCandidate } from "./registry";
import { isCircuitOpen, recordFailure, recordSuccess } from "./circuit-breaker";
import { withBackoff } from "./retry";

// streamText()'s TOOLS generic only affects tool-call/tool-result payload shape;
// this module only ever inspects `part.type`, which is stable across every
// instantiation, so there's no value threading the generic through here.
type AnyStreamTextOptions = Parameters<typeof streamText>[0];
type AnyStreamTextResult = StreamTextResult<any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type AnyTextStreamPart = TextStreamPart<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FallbackResult {
  candidate: FallbackCandidate;
  result: AnyStreamTextResult;
  /** Already advanced past the first part — callers must consume `firstPart`, then keep pulling from here. */
  iterator: AsyncIterator<AnyTextStreamPart>;
  firstPart: AnyTextStreamPart;
}

/**
 * streamText() surfaces provider/auth/network failures as an `error` part on
 * `fullStream`, not as a thrown exception (confirmed against the AI SDK v5
 * docs) — so "did this candidate work" is decided by reading its first part,
 * not by whether the call itself throws.
 *
 * Two retries per candidate (immediate + one ~1s backoff) before moving to the
 * next provider in the chain — enough to ride out a transient blip without
 * making an interactive chat request wait through the full backoff ladder on
 * every dead provider. Circuit-open candidates are skipped outright.
 */
export async function streamWithFallback(
  candidates: FallbackCandidate[],
  buildOptions: (candidate: FallbackCandidate) => AnyStreamTextOptions
): Promise<FallbackResult> {
  let lastError: unknown = new Error("No AI provider available");

  for (const candidate of candidates) {
    if (isCircuitOpen(candidate.provider.id)) continue;
    try {
      const attempt = await withBackoff(() => attemptCandidate(candidate, buildOptions), {
        attempts: 2,
      });
      recordSuccess(candidate.provider.id);
      return attempt;
    } catch (err) {
      recordFailure(candidate.provider.id);
      lastError = err;
    }
  }
  throw lastError;
}

// Pure lifecycle/bookkeeping parts that arrive before the model call has
// actually produced (or failed to produce) anything — e.g. `start` fires the
// instant streamText() begins iterating, well before the HTTP request even
// resolves. Committing to a candidate on one of these would "win" the cascade
// for a request that hasn't succeeded yet, so keep reading past them.
const PENDING_PART_TYPES = new Set(["start", "start-step", "finish-step"]);

async function attemptCandidate(
  candidate: FallbackCandidate,
  buildOptions: (candidate: FallbackCandidate) => AnyStreamTextOptions
): Promise<FallbackResult> {
  const result: AnyStreamTextResult = streamText(buildOptions(candidate));
  const iterator: AsyncIterator<AnyTextStreamPart> = result.fullStream[Symbol.asyncIterator]();

  while (true) {
    const next = await iterator.next();
    if (next.done) {
      throw new Error(`${candidate.provider.name} returned an empty stream`);
    }
    const part = next.value;
    if (part.type === "error") {
      const err = (part as { error: unknown }).error;
      throw err instanceof Error ? err : new Error(String(err));
    }
    if (PENDING_PART_TYPES.has(part.type)) continue;
    return { candidate, result, iterator, firstPart: part };
  }
}
