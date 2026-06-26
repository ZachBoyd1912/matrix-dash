"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LogLine } from "@/lib/console/types";

const CAP = 1500;

interface ControlMsg {
  __control: "reset";
}

/**
 * Consumes an NDJSON log stream (one JSON object per line) from `url` into a
 * capped, growing `LogLine[]`. Reuses the chat route's streaming shape
 * (`res.body.getReader()` + TextDecoder). Aborts on unmount; `reconnect()`
 * re-opens; `clear()` empties the local view. A `{__control:"reset"}` line
 * (builder log truncated) clears accumulated lines.
 */
export function useLogStream(url: string) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => setLines([]), []);

  const start = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok || !res.body) {
          setConnected(false);
          return;
        }
        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop() ?? "";

          const batch: LogLine[] = [];
          let reset = false;
          for (const p of parts) {
            if (!p.trim()) continue;
            try {
              const obj = JSON.parse(p) as LogLine | ControlMsg;
              if ("__control" in obj && obj.__control === "reset") {
                reset = true;
                batch.length = 0;
                continue;
              }
              batch.push(obj as LogLine);
            } catch {
              /* skip malformed line */
            }
          }
          if (reset) setLines([]);
          if (batch.length) {
            setLines((prev) => {
              const next = prev.concat(batch);
              return next.length > CAP ? next.slice(next.length - CAP) : next;
            });
          }
        }
      } catch {
        /* aborted or network error — finally resets connected */
      } finally {
        if (abortRef.current === ac) setConnected(false);
      }
    })();
  }, [url]);

  useEffect(() => {
    start();
    return () => abortRef.current?.abort();
  }, [start]);

  const reconnect = useCallback(() => start(), [start]);

  return { lines, connected, clear, reconnect };
}
