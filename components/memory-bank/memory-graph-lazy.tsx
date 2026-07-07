"use client";

import dynamic from "next/dynamic";
import { SkeletonGraph } from "@/components/ui/skeleton";

/**
 * Code-split wrapper: keeps d3 (force/selection/drag/zoom) out of the
 * memory-bank page's initial chunk. Type-only import carries no runtime cost.
 */
export const MemoryGraph = dynamic(() => import("./memory-graph").then((m) => m.MemoryGraph), {
  ssr: false,
  loading: () => <SkeletonGraph />,
});
