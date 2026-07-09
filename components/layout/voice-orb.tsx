"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Loader2, Volume2, MessageCircle } from "lucide-react";
import { useSpeechInput, useVoiceDegraded, stopSpeaking } from "@/lib/hooks/use-voice";
import { toast } from "@/lib/stores/use-feedback";

type OrbState = "idle" | "listening" | "thinking" | "speaking";

/**
 * Global Jarvis voice orb (topbar, all pages). Click (or the configured hotkey)
 * to talk; on release it transcribes, runs one Jarvis turn, and speaks the reply.
 * Conversation mode auto-reopens the mic after Jarvis finishes. Renders only when
 * voice is enabled in settings.
 */
export function VoiceOrb() {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<OrbState>("idle");
  const [convo, setConvo] = useState(false);
  const degraded = useVoiceDegraded();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const convoRef = useRef(false);
  convoRef.current = convo;

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const s = (await res.json()) as Record<string, string>;
      setEnabled(s.voice_enabled === "1");
      setConvo(s.voice_conversation_mode === "1");
    })();
  }, []);

  const handleTranscript = useCallback(async (text: string) => {
    if (!text.trim()) {
      setState("idle");
      return;
    }
    setState("thinking");
    try {
      const res = await fetch("/api/voice/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("chat failed");
      const { reply } = (await res.json()) as { reply: string };
      await playReply(reply);
    } catch {
      toast.error("Jarvis couldn't respond");
      setState("idle");
    }
  }, []);

  const { listening, supported, toggle } = useSpeechInput(handleTranscript);

  const playReply = useCallback(
    async (reply: string) => {
      if (!reply.trim()) {
        setState("idle");
        return;
      }
      setState("speaking");
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply }),
        });
        if (!res.ok) throw new Error("tts failed");
        const buf = await res.arrayBuffer();
        const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setState("idle");
          if (convoRef.current) setTimeout(() => toggle(), 300); // auto-reopen mic
        };
        await audio.play();
      } catch {
        setState("idle");
      }
    },
    [toggle]
  );

  // Hotkey (spacebar) push-to-talk when no text field is focused.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space" && state === "idle") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, state, toggle]);

  // Reflect the recorder's listening flag into the orb state.
  useEffect(() => {
    if (listening) setState("listening");
    else if (state === "listening") setState("thinking");
  }, [listening]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled || !supported) return null;

  const onClick = () => {
    if (state === "speaking") {
      audioRef.current?.pause();
      stopSpeaking();
      setState("idle");
      return;
    }
    if (state === "idle" || state === "listening") toggle();
  };

  const Icon = state === "thinking" ? Loader2 : state === "speaking" ? Volume2 : Mic;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onClick}
        title={degraded ? "Jarvis (backup voice)" : "Jarvis voice"}
        aria-label="Jarvis voice"
        className={`relative grid h-8 w-8 place-items-center rounded-full border transition-colors ${
          state === "listening"
            ? "border-rose-400/60 bg-rose-500/20 text-rose-300"
            : state === "speaking"
              ? "border-sky-400/60 bg-sky-500/20 text-sky-300"
              : "border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
        }`}
      >
        {state === "listening" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400/40" />
        )}
        <Icon size={14} className={state === "thinking" ? "animate-spin" : ""} />
        {degraded && (
          <span
            className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-amber-400"
            title="backup voice"
          />
        )}
      </button>
      <button
        onClick={() => {
          const next = !convo;
          setConvo(next);
          void fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voice_conversation_mode: next }),
          });
        }}
        title={convo ? "Conversation mode on" : "Conversation mode off"}
        aria-label="Toggle conversation mode"
        className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
          convo ? "text-emerald-300" : "text-text-muted hover:text-text-primary hover:bg-white/5"
        }`}
      >
        <MessageCircle size={14} />
      </button>
    </div>
  );
}
