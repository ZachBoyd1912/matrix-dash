"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/stores/use-app-store";
import type { BeforeInstallPromptEvent } from "@/types/pwa";

export function PwaRegister() {
  const setInstallPromptEvent = useAppStore((s) => s.setInstallPromptEvent);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* silently fail in dev */
    });
  }, []);

  useEffect(() => {
    // Fires when Chromium decides the app is installable — capture it so a
    // UI button can trigger the native prompt later, since the browser only
    // dispatches this once and won't show its own install UI once prevented.
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPromptEvent(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [setInstallPromptEvent]);

  return null;
}
