"use client";

import { WifiOff } from "lucide-react";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

// Served by the service worker as the navigation fallback when a page isn't
// cached and the network request fails — must render with zero API/DB calls
// so it works with no connectivity at all.
export default function OfflinePage() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="glass bezel sheen mb-6 grid h-16 w-16 place-items-center rounded-2xl">
        <LogoMark size={40} />
      </div>
      <div className="text-text-muted mb-3 flex items-center gap-2 text-xs">
        <WifiOff size={13} />
        <span>You&apos;re offline</span>
      </div>
      <h1 className="font-display text-text-primary text-2xl italic">
        Can&apos;t reach Matrix Dash
      </h1>
      <p className="text-text-secondary mt-2 max-w-sm text-sm">
        This page hasn&apos;t been cached yet, and there&apos;s no network connection right now.
        Already-visited pages stay available offline.
      </p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </div>
  );
}
