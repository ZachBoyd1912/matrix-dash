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

interface NodeIn {
  id: string;
  label: string;
  isFavorite: boolean;
  size: number;
}

interface LinkIn {
  id: string;
  source: string;
  target: string;
}

export interface NotesGraphData {
  nodes: NodeIn[];
  links: LinkIn[];
}

interface Node extends NodeIn, SimulationNodeDatum {}
type Link = SimulationLinkDatum<Node> & LinkIn;

interface Props {
  data: NotesGraphData;
  onSelect?: (id: string) => void;
}

/** Obsidian-style note graph: violet nodes, favorites glow amber. */
export function NotesGraph({ data, onSelect }: Props) {
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
      .attr("stroke", "#a78bfa")
      .attr("stroke-opacity", 0.25)
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

    node
      .append("circle")
      .attr("r", (d) => 5 + d.size * 8)
      .attr("fill", (d) => (d.isFavorite ? "#fbbf24" : "#a78bfa"))
      .attr("fill-opacity", 0.75)
      .attr("stroke", (d) => (d.isFavorite ? "#fbbf24" : "#a78bfa"))
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", 0.8);

    node.append("title").text((d) => d.label);

    node
      .append("text")
      .text((d) => d.label.slice(0, 24) + (d.label.length > 24 ? "…" : ""))
      .attr("font-size", 10)
      .attr("fill", "#888")
      .attr("dx", (d) => 8 + d.size * 8)
      .attr("dy", 3)
      .attr("pointer-events", "none");

    const sim = forceSimulation<Node>(nodes)
      .force(
        "link",
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(90)
          .strength(0.5)
      )
      .force("charge", forceManyBody<Node>().strength(-200))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<Node>().radius((d) => 12 + d.size * 8)
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

  return <svg ref={ref} className="h-full w-full" />;
}
