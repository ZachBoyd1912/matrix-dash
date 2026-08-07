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
import type { VaultGraphData, VaultGraphLink, VaultGraphNode } from "@/types/vault";

interface Node extends VaultGraphNode, SimulationNodeDatum {}
type Link = SimulationLinkDatum<Node> & VaultGraphLink;

interface Props {
  data: VaultGraphData;
  /** Receives a vault-relative path; ghost nodes are not selectable. */
  onSelect?: (relPath: string) => void;
}

/**
 * The whole vault as one force graph — every indexed file, coloured by its
 * top-level folder, with a real edge for every [[link]] and ![[embed]].
 *
 * The previous version drew notes and memories from their own DB link tables
 * plus one hand-picked Claude Code project, which is why the graph looked
 * almost edgeless: nothing resolved links across folders. Everything here
 * comes from `vault_links`, resolved once at scan time.
 */
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
        .scaleExtent([0.1, 4])
        .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
          g.attr("transform", event.transform.toString());
        })
    );

    const nodes: Node[] = data.nodes.map((n) => ({ ...n }));
    const ids = new Set(nodes.map((n) => n.id));
    const links: Link[] = data.links
      .filter((l) => ids.has(l.source as string) && ids.has(l.target as string))
      .map((l) => ({ ...l }));

    const link = g
      .append("g")
      .selectAll<SVGLineElement, Link>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#ffffff")
      // Embeds read as a weaker relationship than an explicit link.
      .attr("stroke-opacity", (d) => (d.kind === "embed" ? 0.1 : 0.2))
      .attr("stroke-width", 1);

    const node = g
      .append("g")
      .selectAll<SVGGElement, Node>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", (d) => (d.isGhost ? "default" : "pointer"))
      .on("click", (_e, d) => {
        if (d.relPath) onSelect?.(d.relPath);
      });

    // Well-connected files read as hubs, the way they do in Obsidian.
    const radius = (d: Node) => (d.isGhost ? 3.5 : 4 + Math.min(6, Math.sqrt(d.degree) * 2));

    node
      .append("circle")
      .attr("r", radius)
      .attr("fill", (d) => d.color)
      .attr("fill-opacity", (d) => (d.isGhost ? 0.18 : 0.75))
      .attr("stroke", (d) => d.color)
      .attr("stroke-opacity", (d) => (d.isGhost ? 0.35 : 0.9))
      .attr("stroke-width", (d) => (d.isGhost ? 1 : 0.8))
      .attr("stroke-dasharray", (d) => (d.isGhost ? "2 2" : null));

    node
      .append("title")
      .text((d) => (d.isGhost ? `${d.label}\n(not in the vault)` : d.relPath || d.label));

    node
      .append("text")
      .text((d) => d.label.slice(0, 26) + (d.label.length > 26 ? "…" : ""))
      .attr("font-size", 9)
      .attr("font-family", "var(--font-sans), sans-serif")
      .attr("fill", (d) => (d.isGhost ? "#555" : "#888"))
      .attr("dx", (d) => radius(d) + 6)
      .attr("dy", 3)
      .attr("pointer-events", "none");

    const sim = forceSimulation<Node>(nodes)
      .force(
        "link",
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(70)
          .strength(0.35)
      )
      .force("charge", forceManyBody<Node>().strength(nodes.length > 300 ? -70 : -170))
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

  const ghostCount = data.nodes.filter((n) => n.isGhost).length;

  return (
    <div className="relative h-full w-full">
      <svg ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute top-3 left-3 flex flex-col gap-1 text-[10px]">
        {data.folders.map((f) => (
          <div key={f.name} className="text-text-muted flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />
            {f.name}
            <span className="tabular-nums opacity-60">{f.count}</span>
          </div>
        ))}
        {ghostCount > 0 && (
          <div className="text-text-muted flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-dashed border-slate-400/60" />
            Unresolved <span className="tabular-nums opacity-60">{ghostCount}</span>
          </div>
        )}
      </div>
      {data.truncated && (
        <div className="text-text-muted absolute right-3 bottom-3 rounded-md border border-amber-400/20 bg-amber-400/[0.08] px-2 py-1 text-[10px] text-amber-300/90">
          Showing the first {data.nodes.filter((n) => !n.isGhost).length} of {data.total} files
        </div>
      )}
    </div>
  );
}
