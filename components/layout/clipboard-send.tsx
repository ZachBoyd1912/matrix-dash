"use client";

import { useState } from "react";
import { Clipboard, X, Loader2, Check } from "lucide-react";

export function ClipboardSend() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/clipboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        setText("");
        setSent(false);
      }, 1200);
    } catch {
      /* silently fail */
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-text-muted hover:text-text-primary grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-white/5"
        aria-label="Send to Mac clipboard"
        title="Send to Mac"
      >
        <Clipboard size={14} />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="glass-strong relative z-10 mx-4 mb-4 w-full max-w-md rounded-2xl p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "calc(1rem + var(--safe-area-bottom))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-text-primary text-sm font-semibold">Send to Mac</h3>
          <button
            onClick={() => {
              setOpen(false);
              setText("");
            }}
            className="text-text-muted hover:text-text-primary grid h-7 w-7 place-items-center rounded-md hover:bg-white/5"
          >
            <X size={14} />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste text to send to your MacBook…"
          className="glass-input text-text-primary w-full resize-none rounded-lg p-3 text-sm focus:outline-none"
          rows={4}
          autoFocus
          style={{ fontSize: 16 }}
        />
        <button
          onClick={send}
          disabled={busy || !text.trim() || sent}
          className="mt-3 w-full rounded-lg bg-emerald-400/15 py-2.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-400/25 disabled:opacity-40"
          style={{ minHeight: 44 }}
        >
          {sent ? (
            <span className="flex items-center justify-center gap-1.5">
              <Check size={14} /> Sent!
            </span>
          ) : busy ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 size={14} className="animate-spin" /> Sending…
            </span>
          ) : (
            "Send to Mac"
          )}
        </button>
      </div>
    </div>
  );
}
