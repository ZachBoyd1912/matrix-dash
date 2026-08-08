"use client";

import { useCallback, useEffect, useState } from "react";

interface QueuedMessage {
  id: string;
  sessionId: string;
  content: string;
  timestamp: string;
}

const STORAGE_KEY = "matrix_offline_queue";

function load(): QueuedMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMessage[]) : [];
  } catch {
    return [];
  }
}

function save(queue: QueuedMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* quota exceeded — oldest messages already flushed */
  }
}

/**
 * Manages a queue of chat messages typed while offline.
 * On reconnect, auto-flushes via the provided send function.
 */
export function useOfflineQueue(sendOnline: (sessionId: string, content: string) => Promise<void>) {
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const [flushing, setFlushing] = useState(false);

  // Restore queue from localStorage on mount
  useEffect(function restoreQueue() {
    setQueue(load());
  }, []);

  // Enqueue a message when offline
  const enqueue = useCallback(function addToQueue(sessionId: string, content: string) {
    const item: QueuedMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      content,
      timestamp: new Date().toISOString(),
    };
    setQueue((prev) => {
      const next = [...prev, item];
      save(next);
      return next;
    });
  }, []);

  // Flush all queued messages on reconnect
  const flush = useCallback(
    async function flushQueue() {
      const items = load();
      if (items.length === 0) return;
      setFlushing(true);
      for (const item of items) {
        try {
          await sendOnline(item.sessionId, item.content);
          // Remove from queue on success
          setQueue((prev) => {
            const next = prev.filter((q) => q.id !== item.id);
            save(next);
            return next;
          });
        } catch {
          // Leave in queue for next flush attempt
          break;
        }
      }
      setFlushing(false);
    },
    [sendOnline]
  );

  // Auto-flush when coming back online
  useEffect(
    function autoFlushOnReconnect() {
      function handleOnline() {
        void flush();
      }
      window.addEventListener("online", handleOnline);
      return function cleanupOnlineListener() {
        window.removeEventListener("online", handleOnline);
      };
    },
    [flush]
  );

  // Also flush on mount if online and queue has items
  useEffect(
    function flushOnMountIfOnline() {
      if (navigator.onLine && queue.length > 0) {
        void flush();
      }
    },
    [flush, queue.length]
  );

  return { queue, enqueue, flush, flushing };
}
