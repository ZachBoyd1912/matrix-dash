"use client";

import { useEffect, useCallback, useRef } from "react";

const CHANNEL = "matrix-dash-cross-tab";

/**
 * BroadcastChannel-based cross-tab synchronisation.
 *
 * Any tab that calls `notifyTabs()` pushes a "refresh" signal to all other
 * tabs of the same origin. The callback `onSync` fires in every listening
 * tab – use it to re-fetch data so all windows stay in sync instantly
 * without polling or WebSockets.
 */
export function useCrossTabSync(onSync: () => void): () => void {
  const cb = useRef(onSync);
  cb.current = onSync;

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (event.data === "refresh") cb.current();
      };
    } catch {
      // BroadcastChannel not supported (rare: old Safari, Node.js).
      // Fall back silently – tabs will sync on manual refresh.
    }
    return () => channel?.close();
  }, []);

  const notifyTabs = useCallback(() => {
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage("refresh");
      channel.close();
    } catch {
      // noop
    }
  }, []);

  return notifyTabs;
}
