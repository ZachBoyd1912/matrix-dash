"use client";

import { useEffect } from "react";
import { useLogStore } from "@/lib/stores/use-log-store";
import { makeLogId, type LogLevel, type LogSource } from "@/lib/console/types";

// Origin (scheme+host+port, no path) of the embedded builder — postMessage
// events report exactly this as event.origin.
const BUILDER_ORIGIN = (process.env.NEXT_PUBLIC_MATRIX_BUILDER_URL ?? "http://localhost:5001")
  .replace(/\/+$/, "");

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.stack || v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Captures Matrix Dashboard's OWN browser console (same-origin) into the log
 * store, plus listens for the optional Matrix Builder bridge (cross-origin
 * postMessages of shape {__mbConsole:true,...}). Renders nothing. Mounted once
 * in the dashboard shell; install-guarded so it patches console only once.
 */
export function ConsoleCapture() {
  useEffect(() => {
    const w = window as unknown as { __mbConsoleCaptureInstalled?: boolean };
    if (w.__mbConsoleCaptureInstalled) return;
    w.__mbConsoleCaptureInstalled = true;

    const push = useLogStore.getState().push;
    const add = (level: LogLevel, source: LogSource, parts: unknown[]) => {
      const ts = Date.now();
      try {
        push({ id: makeLogId(ts), ts, level, source, text: parts.map(stringify).join(" ") });
      } catch {
        /* logging must never throw */
      }
    };

    const methods: [keyof Console, LogLevel][] = [
      ["log", "log"],
      ["info", "info"],
      ["warn", "warn"],
      ["error", "error"],
      ["debug", "debug"],
    ];
    for (const [m, level] of methods) {
      const orig = console[m] as (...a: unknown[]) => void;
      if (typeof orig !== "function") continue;
      (console as unknown as Record<string, unknown>)[m as string] = (...args: unknown[]) => {
        add(level, "dash-browser", args);
        orig(...args);
      };
    }

    const onError = (e: ErrorEvent) =>
      add("error", "dash-browser", [
        e.message + (e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : ""),
      ]);
    const onRejection = (e: PromiseRejectionEvent) =>
      add("error", "dash-browser", ["Unhandled rejection: " + stringify(e.reason)]);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== BUILDER_ORIGIN) return;
      const d = e.data as { __mbConsole?: boolean; level?: string; text?: unknown; ts?: number };
      if (!d || d.__mbConsole !== true) return;
      const level: LogLevel = (["debug", "log", "info", "warn", "error"] as const).includes(
        d.level as LogLevel
      )
        ? (d.level as LogLevel)
        : "log";
      const ts = typeof d.ts === "number" ? d.ts : Date.now();
      push({ id: makeLogId(ts), ts, level, source: "builder-browser", text: stringify(d.text) });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("message", onMessage);
    // Intentionally never uninstalled — capture is app-wide for the session.
  }, []);

  return null;
}
