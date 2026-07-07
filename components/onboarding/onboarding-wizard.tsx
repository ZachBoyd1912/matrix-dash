"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Plug, MessageSquare, Brain, Command } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const STORAGE_KEY = "matrix-onboarding-v1";
const RESTART_EVENT = "matrix-onboarding-restart";

/** Clears the done-flag and re-opens the tour wherever it's mounted. */
export function restartOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(RESTART_EVENT));
}

const STEPS = [
  {
    icon: Sparkles,
    title: "Welcome to Matrix",
    body: "Your local-first AI command center. Chat, agents, notes, email, calendar, and a real IDE — all in one private dashboard, with your data in a local encrypted database you control.",
  },
  {
    icon: Plug,
    title: "Add an AI provider",
    body: "Head to Settings → Add Models to connect a provider. Matrix speaks to 20+ (Anthropic, OpenAI, Gemini, DeepSeek, local Ollama…) and can automatically fall back to a backup provider if your primary one fails mid-conversation.",
  },
  {
    icon: MessageSquare,
    title: "Chat & agents",
    body: "Slash commands like /model, /compact and /context control the conversation. Flip to Agent mode for tool use (GitHub, Slack, Gmail, Calendar…). Hover any reply to regenerate it or fork the conversation from that point.",
  },
  {
    icon: Brain,
    title: "Memory & notes",
    body: "Matrix remembers: facts are auto-extracted into the Memory Bank and injected back into future chats. Notes support [[wikilinks]], and both can two-way sync with an Obsidian vault (Settings → Integrations → Obsidian).",
  },
  {
    icon: Command,
    title: "Power features",
    body: "Press Cmd+K for the command palette. The IDE gives you real VS Code in the browser, Matrix Builder generates full sites from a prompt, and the whole app installs as a PWA that keeps working offline.",
  },
];

export function OnboardingWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // localStorage is browser-only — deciding visibility in an effect avoids an
  // SSR/hydration mismatch (the wizard renders nothing until this has run).
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "done") {
      setStep(0);
      setOpen(true);
    }
    const onRestart = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(RESTART_EVENT, onRestart);
    return () => window.removeEventListener(RESTART_EVENT, onRestart);
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "done");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <Dialog open={open} onClose={finish} className="max-w-md">
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="glass bezel mb-4 grid h-14 w-14 place-items-center rounded-2xl">
          <Icon size={26} className="text-emerald-300" />
        </div>
        <span className="eyebrow mb-2">
          Step {step + 1} of {STEPS.length}
        </span>
        <h2 className="font-display text-text-primary text-2xl italic">{current.title}</h2>
        <p className="text-text-secondary mt-3 text-sm leading-relaxed">{current.body}</p>

        <div className="mt-6 flex items-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-5 bg-emerald-400" : "w-1.5 bg-white/15"
              )}
            />
          ))}
        </div>

        <div className="mt-6 flex w-full items-center justify-between">
          <Button variant="ghost" size="sm" onClick={finish}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {last ? (
              <Button variant="primary" size="sm" onClick={finish}>
                Get started
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
