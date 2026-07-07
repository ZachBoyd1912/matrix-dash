"use client";

import dynamic from "next/dynamic";
import { SkeletonGraph } from "@/components/ui/skeleton";

export type { NotesGraphData } from "./notes-graph";

/**
 * Code-split wrapper: keeps d3 out of the notes page's initial chunk.
 */
export const NotesGraph = dynamic(() => import("./notes-graph").then((m) => m.NotesGraph), {
  ssr: false,
  loading: () => <SkeletonGraph />,
});
