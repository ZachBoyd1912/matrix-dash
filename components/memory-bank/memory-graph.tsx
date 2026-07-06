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
import { MEMORY_TYPE_META, type MemoryType } from "@/types/memory";

interface NodeIn {
  id: string;
  label: string;
  type: MemoryType;
  importance: number;
  usageCount: number;
  isPinned: boolean;
}

interface LinkIn {
  id: string;
  source: string;
  target: string;
  strength: number;
}

interface GraphData {
  nodes: NodeIn[];
  links: LinkIn[];
}

interface Node extends NodeIn, SimulationNodeDatum {}
type Link = SimulationLinkDatum<Node> & LinkIn;

const TYPE_COLOR: Record<MemoryType, string> = {
  identity: "#34d399",
  project: "#38bdf8",
  global: "#fbbf24",
  lesson: "#f43f5e",
};

interface Props {
  data: GraphData;
  onSelect?: (id: string) => void;
}

export function MemoryGraph({ data, onSelect }: Props) {
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

    const link = g
      .append("g")
      .attr("stroke", "#ffffff")
      .attr("stroke-opacity", 0.12)
      .selectAll<SVGLineElement, Link>("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (d) => 0.5 + d.strength * 1.5);

    const node = g
      .append("g")
      .selectAll<SVGGElement, Node>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (_e, d) => onSelect?.(d.id));

    node
      .append("circle")
      .attr("r", (d) => 4 + d.importance * 8)
      .attr("fill", (d) => TYPE_COLOR[d.type])
      .attr("fill-opacity", 0.7)
      .attr("stroke", (d) => TYPE_COLOR[d.type])
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", (d) => (d.isPinned ? 2 : 0.8));

    node.append("title").text((d) => `${d.label}\n(${d.type} · used ${d.usageCount}×)`);

    node
      .append("text")
      .text((d) => d.label.slice(0, 28) + (d.label.length > 28 ? "…" : ""))
      .attr("font-size", 9)
      .attr("font-family", "var(--font-sans), sans-serif")
      .attr("fill", "#888")
      .attr("dx", (d) => 6 + d.importance * 8)
      .attr("dy", 3)
      .attr("pointer-events", "none");

    const sim = forceSimulation<Node>(nodes)
      .force(
        "link",
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance((l) => 60 + (1 - l.strength) * 60)
          .strength((l) => 0.2 + l.strength * 0.6)
      )
      .force("charge", forceManyBody<Node>().strength(-160))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<Node>().radius((d) => 8 + d.importance * 10)
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
        {(Object.keys(TYPE_COLOR) as MemoryType[]).map((t) => (
          <div key={t} className="text-text-muted flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[t] }} />
            {MEMORY_TYPE_META[t].label}
          </div>
        ))}
      </div>
    </div>
  );
}
