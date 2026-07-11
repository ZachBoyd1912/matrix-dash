"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/lib/stores/use-tour";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The interactive tour overlay: dims the page, spotlights the current step's
 * `data-tour` target, and shows a tooltip card with next/back/skip. Navigates
 * to the step's route first so the target exists.
 */
export function TourOverlay() {
  const { active, current, next, prev, stop, isLast, chapters, chapterIndex } = useTour();
  const router = useRouter();
  const pathname = usePathname();
  const [rect, setRect] = useState<Rect | null>(null);

  const step = current()?.step ?? null;

  // Navigate to the step's route if we're not there yet.
  useEffect(() => {
    if (active && step?.route && pathname !== step.route) router.push(step.route);
  }, [active, step?.route, pathname, router]);

  // Locate the spotlight target (retry briefly while the page settles).
  useEffect(() => {
    if (!active || !step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    let tries = 0;
    const find = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (tries++ < 20) {
        setTimeout(find, 100);
      } else {
        setRect(null);
      }
    };
    find();
  }, [active, step, pathname]);

  const finish = async (completed: boolean) => {
    stop();
    if (completed) {
      await fetch("/api/auth/tutorial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      }).catch(() => {});
    }
  };

  if (!active || !step) return null;

  const pad = 6;
  const spotlight = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Position the card near the target, else center it.
  const cardStyle: React.CSSProperties = spotlight
    ? {
        top: Math.min(spotlight.top + spotlight.height + 12, window.innerHeight - 240),
        left: Math.min(Math.max(spotlight.left, 16), window.innerWidth - 360),
      }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true">
      {/* Dim layer with a cut-out spotlight via box-shadow */}
      <div
        className="absolute inset-0 bg-black/60 transition-all"
        style={
          spotlight
            ? {
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${spotlight.left}px ${spotlight.top}px, ${spotlight.left}px ${spotlight.top + spotlight.height}px, ${spotlight.left + spotlight.width}px ${spotlight.top + spotlight.height}px, ${spotlight.left + spotlight.width}px ${spotlight.top}px, ${spotlight.left}px ${spotlight.top}px)`,
              }
            : undefined
        }
      />
      {spotlight && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-emerald-400/80"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}

      <div
        className="glass-input absolute w-[340px] rounded-2xl border border-white/10 p-5 shadow-2xl"
        style={cardStyle}
      >
        <button
          onClick={() => finish(true)}
          className="text-text-muted hover:text-text-primary absolute top-3 right-3"
          aria-label="Skip tour"
        >
          <X size={15} />
        </button>
        <p className="text-text-muted mb-1 text-[10px] tracking-wider uppercase">
          {chapters[chapterIndex]?.title} · {chapterIndex + 1}/{chapters.length}
        </p>
        <h3 className="text-text-primary mb-2 text-base font-semibold">{step.title}</h3>
        <p className="text-text-secondary text-sm leading-relaxed">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => finish(true)}
            className="text-text-muted hover:text-text-primary text-xs"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {chapterIndex > 0 && (
              <Button variant="ghost" size="sm" onClick={prev}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={() => (isLast() ? finish(true) : next())}>
              {isLast() ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
