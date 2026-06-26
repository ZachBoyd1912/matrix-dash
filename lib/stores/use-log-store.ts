"use client";

import { create } from "zustand";
import type { LogLine } from "@/lib/console/types";

/* Browser-origin logs for the Console page. The two streaming sources
 * (dash-server, builder-server) come from API streams; these two come from
 * patching the browser console here in the app. Capped to bound memory. */

const CAP = 1500;

type BrowserSource = "dash-browser" | "builder-browser";

interface LogStoreState {
  dashBrowser: LogLine[];
  builderBrowser: LogLine[];
  /** Set true once any postMessage from the builder bridge arrives. */
  builderBridgeSeen: boolean;
  push: (line: LogLine) => void;
  clear: (source: BrowserSource) => void;
}

function capped(arr: LogLine[], line: LogLine): LogLine[] {
  const next = arr.concat(line);
  return next.length > CAP ? next.slice(next.length - CAP) : next;
}

export const useLogStore = create<LogStoreState>((set) => ({
  dashBrowser: [],
  builderBrowser: [],
  builderBridgeSeen: false,
  push: (line) =>
    set((s) =>
      line.source === "builder-browser"
        ? { builderBrowser: capped(s.builderBrowser, line), builderBridgeSeen: true }
        : { dashBrowser: capped(s.dashBrowser, line) }
    ),
  clear: (source) =>
    set(() => (source === "builder-browser" ? { builderBrowser: [] } : { dashBrowser: [] })),
}));
