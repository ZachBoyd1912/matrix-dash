"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Browser Speech API typings (fallback engine) ──────────────────────────
interface SpeechRecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── Degraded-mode signal (shared so the orb can show "backup voice") ──────
let degraded = false;
const degradedSubs = new Set<(d: boolean) => void>();
function setDegraded(d: boolean) {
  if (degraded === d) return;
  degraded = d;
  for (const s of degradedSubs) s(d);
}
export function useVoiceDegraded(): boolean {
  const [d, setD] = useState(degraded);
  useEffect(() => {
    degradedSubs.add(setD);
    return () => {
      degradedSubs.delete(setD);
    };
  }, []);
  return d;
}

// ── Speech-to-text: MediaRecorder → Whisper, falling back to the browser ──
/**
 * Records from the mic on `toggle()` (again to stop) and returns the transcript
 * via `onResult`. Uses server Whisper; on any failure (voice off, no provider,
 * outage) it falls back to the browser SpeechRecognition engine and flags degraded.
 * Signature is unchanged from the v0 hook so existing call sites keep working.
 */
export function useSpeechInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const browserRecRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const hasRecorder = typeof window !== "undefined" && "MediaRecorder" in window;
    setSupported(hasRecorder || getRecognitionCtor() !== null);
  }, []);

  const startBrowser = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setListening(false);
      return;
    }
    setDegraded(true);
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = Array.from({ length: e.results.length })
        .map((_, i) => e.results[i][0].transcript)
        .join(" ")
        .trim();
      if (transcript) onResult(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    browserRecRef.current = rec;
    rec.start();
    setListening(true);
  }, [onResult]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      return;
    }
    browserRecRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined" || !("MediaRecorder" in window) || !navigator.mediaDevices) {
      startBrowser();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        try {
          const form = new FormData();
          form.append("audio", blob, "speech.webm");
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
          if (!res.ok) throw new Error("stt failed");
          const { text } = (await res.json()) as { text: string };
          setDegraded(false);
          if (text) onResult(text);
        } catch {
          // Server STT unavailable — degrade to the browser engine next time.
          setDegraded(true);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch {
      startBrowser();
    }
  }, [onResult, startBrowser]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  return { listening, supported, toggle };
}

// ── Text-to-speech: OpenAI TTS, falling back to the browser ───────────────
let currentAudio: HTMLAudioElement | null = null;

export function speak(text: string) {
  if (typeof window === "undefined" || !text.trim()) return;
  stopSpeaking();
  (async () => {
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("tts failed");
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      setDegraded(false);
      await audio.play();
    } catch {
      // Fall back to the robotic-but-free browser voice.
      setDegraded(true);
      speakBrowser(text);
    }
  })();
}

function speakBrowser(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.05;
  window.speechSynthesis.speak(utter);
}

export function stopSpeaking() {
  if (typeof window === "undefined") return;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}
