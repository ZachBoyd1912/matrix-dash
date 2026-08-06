"use client";

import dynamic from "next/dynamic";
import { SkeletonGraph } from "@/components/ui/skeleton";

/** Code-split wrapper: keeps d3 out of the vault page's initial chunk. */
export const VaultGraph = dynamic(() => import("./vault-graph").then((m) => m.VaultGraph), {
  ssr: false,
  loading: () => <SkeletonGraph />,
});
