"use client";

import { useEffect, useRef } from "react";
import { speak } from "@/lib/hooks/use-voice";

interface Notification {
  id: string;
  title: string;
  body: string;
  kind: string;
  createdAt: string;
}

const WATERMARK_KEY = "matrix.voice.announced";

/**
 * Proactive Jarvis announcements. When voice is enabled and the tab is focused,
 * newly-arrived notifications are spoken aloud. A localStorage watermark of the
 * newest already-spoken notification prevents re-speaking. Renders nothing.
 */
export function VoiceAnnouncer() {
  const enabledRef = useRef(false);
  const primedRef = useRef(false);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      if (!alive) return;
      // Only speak when the tab is visible.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      // Refresh the enabled flag cheaply (settings can change at runtime).
      try {
        const sRes = await fetch("/api/settings");
        if (sRes.ok) {
          const s = (await sRes.json()) as Record<string, string>;
          enabledRef.current = s.voice_enabled === "1";
        }
      } catch {
        /* ignore */
      }
      if (!enabledRef.current) return;

      let notes: Notification[] = [];
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        notes = (await res.json()) as Notification[];
      } catch {
        return;
      }
      if (notes.length === 0) return;

      const watermark = localStorage.getItem(WATERMARK_KEY) ?? "";
      // Notifications come newest-first; find those newer than the watermark.
      const fresh = notes.filter((n) => n.createdAt > watermark);
      // Advance the watermark to the newest we've seen regardless.
      localStorage.setItem(WATERMARK_KEY, notes[0].createdAt);

      // On the first tick after load, prime silently (don't dump a backlog aloud).
      if (!primedRef.current) {
        primedRef.current = true;
        return;
      }

      // Speak only agent-relevant items (avoid narrating every app notification).
      const speakable = fresh
        .filter((n) => /agent|approval|run|urgent|digest/i.test(n.title + n.body))
        .reverse(); // oldest-first for natural order
      for (const n of speakable) {
        speak(`${n.title}. ${n.body}`.slice(0, 300));
      }
    };

    void tick();
    const t = setInterval(tick, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return null;
}
