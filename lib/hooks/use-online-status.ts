"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `navigator.onLine`, updated live via the browser's online/offline events.
 * When offline, adds `app-offline` class to `<body>` so the global CSS can adapt
 * (e.g. dim non-cached content, show offline banners).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(function subscribeToOnlineEvents() {
    function handleOnline() {
      setOnline(true);
      document.body.classList.remove("app-offline");
    }
    function handleOffline() {
      setOnline(false);
      document.body.classList.add("app-offline");
    }

    setOnline(navigator.onLine);
    if (!navigator.onLine) document.body.classList.add("app-offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return function unsubscribeFromOnlineEvents() {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
