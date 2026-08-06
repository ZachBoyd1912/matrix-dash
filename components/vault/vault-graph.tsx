"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3-selection";
import { drag, type D3DragEvent } from "d3-drag";
import { zoom, type D3ZoomEvent } from "d3-zoom";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { MemoryType } from "@/types/memory";
import type { VaultGraphData, VaultGraphLink, VaultGraphNode, VaultSource } from "@/types/vault";

interface Node extends VaultGraphNode, SimulationNodeDatum {}
type Link = SimulationLinkDatum<Node> & VaultGraphLink;

const SOURCE_COLOR: Record<VaultSource, string> = {
  note: "#a78bfa",
  memory: "#38bdf8", // overridden per-node by MEMORY_TYPE_HEX when memoryType is set
  "claude-code": "#fb923c",
};

const SOURCE_LABEL: Record<VaultSource, string> = {
  note: "Matrix Notes",
  memory: "Memory Bank",
  "claude-code": "Claude Code (read-only)",
};

// MEMORY_TYPE_META stores Tailwind classes, not hex — mirror memory-graph.tsx's
// own hardcoded hex table instead of trying to parse a Tailwind class name.
const MEMORY_TYPE_HEX: Record<MemoryType, string> = {
  identity: "#34d399",
  project: "#38bdf8",
  global: "#fbbf24",
  lesson: "#f43f5e",
};

interface Props {
  data: VaultGraphData;
  onSelect?: (id: string) => void;
}

/** Unified vault graph — notes (violet), memories (colored by type), Claude Code (orange). */
export function VaultGraph({ data, onSelect }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    const { width, height } = ref.current.getBoundingClientRect();
    svg.selectAll("*").remove();
    if (data.nodes.length === 0) return;

    const g = svg.append("g");
    svg.call(
      zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
          g.attr("transform", event.transform.toString());
        })
    );

    const nodes: Node[] = data.nodes.map((n) => ({ ...n }));
    const links: Link[] = data.links
      .filter((l) => nodes.some((n) => n.id === l.source) && nodes.some((n) => n.id === l.target))
      .map((l) => ({ ...l }));

    const nodeColor = (d: Node): string =>
      d.source === "memory" && d.memoryType
        ? MEMORY_TYPE_HEX[d.memoryType]
        : SOURCE_COLOR[d.source];

    const link = g
      .append("g")
      .attr("stroke", "#ffffff")
      .attr("stroke-opacity", 0.15)
      .selectAll<SVGLineElement, Link>("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1);

    const node = g
      .append("g")
      .selectAll<SVGGElement, Node>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (_e, d) => onSelect?.(d.id));

    const radius = (d: Node) => 5 + (d.isPinned || d.isFavorite ? 3 : 0);

    node
      .append("circle")
      .attr("r", radius)
      .attr("fill", nodeColor)
      .attr("fill-opacity", 0.75)
      .attr("stroke", nodeColor)
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", (d) => (d.isPinned || d.isFavorite ? 2 : 0.8));

    node.append("title").text((d) => `${d.label}\n(${SOURCE_LABEL[d.source]})`);

    node
      .append("text")
      .text((d) => d.label.slice(0, 26) + (d.label.length > 26 ? "…" : ""))
      .attr("font-size", 9)
      .attr("font-family", "var(--font-sans), sans-serif")
      .attr("fill", "#888")
      .attr("dx", (d) => radius(d) + 6)
      .attr("dy", 3)
      .attr("pointer-events", "none");

    const sim = forceSimulation<Node>(nodes)
      .force(
        "link",
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(80)
          .strength(0.4)
      )
      .force("charge", forceManyBody<Node>().strength(-170))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<Node>().radius((d) => radius(d) + 8)
      )
      .on("tick", () => {
        link
          .attr("x1", (d) => (d.source as Node).x ?? 0)
          .attr("y1", (d) => (d.source as Node).y ?? 0)
          .attr("x2", (d) => (d.target as Node).x ?? 0)
          .attr("y2", (d) => (d.target as Node).y ?? 0);
        node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    node.call(
      drag<SVGGElement, Node>()
        .on("start", (event: D3DragEvent<SVGGElement, Node, Node>, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event: D3DragEvent<SVGGElement, Node, Node>, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event: D3DragEvent<SVGGElement, Node, Node>, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    return () => {
      sim.stop();
    };
  }, [data, onSelect]);

  return (
    <div className="relative h-full w-full">
      <svg ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute top-3 left-3 flex flex-col gap-1 text-[10px]">
        {(["note", "memory", "claude-code"] as VaultSource[]).map((s) => (
          <div key={s} className="text-text-muted flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLOR[s] }} />
            {SOURCE_LABEL[s]}
          </div>
        ))}
      </div>
    </div>
  );
}
