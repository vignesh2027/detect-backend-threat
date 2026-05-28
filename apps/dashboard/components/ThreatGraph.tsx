"use client";
import { useRef, useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import type { ThreatEvent, GraphNode, GraphEdge } from "@/lib/types";
import { SEVERITY_COLOR } from "@/lib/types";

interface Props {
  events:       ThreatEvent[];
  onSelectIP:   (ip: string) => void;
}

function buildGraph(events: ThreatEvent[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap  = new Map<string, GraphNode>();
  const edgeMap  = new Map<string, GraphEdge>();

  for (const e of events) {
    const src = e.source_ip;
    if (!nodeMap.has(src)) {
      nodeMap.set(src, {
        id:          src,
        label:       src,
        eventCount:  0,
        threatScore: 0,
      });
    }
    const node = nodeMap.get(src)!;
    node.eventCount++;
    // threat score = max severity weight seen
    const w = { low: 10, medium: 35, high: 65, critical: 100 }[e.severity] ?? 0;
    if (w > node.threatScore) node.threatScore = w;

    // Edge: src → target (pseudo-node "DEFEND")
    const edgeKey = `${src}->DEFEND`;
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, { source: src, target: "DEFEND", connectionCount: 0 });
    }
    edgeMap.get(edgeKey)!.connectionCount++;
  }

  // Add a central defense node
  nodeMap.set("DEFEND", { id: "DEFEND", label: "Defender", eventCount: 0, threatScore: 0 });

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

export default function ThreatGraph({ events, onSelectIP }: Props) {
  const svgRef     = useRef<SVGSVGElement>(null);
  const simRef     = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);

  const { nodes, edges } = useMemo(() => buildGraph(events.slice(0, 300)), [events]);

  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    svg.selectAll("*").remove();

    const el   = svgRef.current!.parentElement!;
    const W    = el.clientWidth  || 600;
    const H    = el.clientHeight || 400;

    svg.attr("viewBox", `0 0 ${W} ${H}`);

    // Zoom layer
    const g = svg.append("g");
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
          g.attr("transform", event.transform.toString());
        })
    );

    // Simulation
    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force("link",    d3.forceLink<GraphNode, GraphEdge>(edges).id((d) => d.id).distance(80))
      .force("charge",  d3.forceManyBody().strength(-120))
      .force("collide", d3.forceCollide<GraphNode>((d) => Math.sqrt(d.eventCount) * 4 + 8))
      .force("center",  d3.forceCenter(W / 2, H / 2));
    simRef.current = sim;

    // Arrowhead marker
    svg.append("defs").append("marker")
      .attr("id",         "arrow")
      .attr("viewBox",    "0 -5 10 10")
      .attr("refX",       18)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient",     "auto")
      .append("path")
      .attr("d",    "M0,-5L10,0L0,5")
      .attr("fill", "#484f58");

    // Edges
    const link = g.append("g")
      .selectAll<SVGLineElement, GraphEdge>("line")
      .data(edges)
      .enter().append("line")
      .attr("stroke", "#21262d")
      .attr("stroke-width", (d) => Math.min(6, Math.sqrt(d.connectionCount)))
      .attr("marker-end", "url(#arrow)");

    // Nodes
    const node = g.append("g")
      .selectAll<SVGCircleElement, GraphNode>("circle")
      .data(nodes)
      .enter().append("circle")
      .attr("r", (d) => Math.max(6, Math.log(d.eventCount + 1) * 6))
      .attr("fill", (d) => {
        if (d.id === "DEFEND") return "#00ff88";
        const score = d.threatScore;
        if (score >= 80) return SEVERITY_COLOR.critical;
        if (score >= 50) return SEVERITY_COLOR.high;
        if (score >= 20) return SEVERITY_COLOR.medium;
        return SEVERITY_COLOR.low;
      })
      .attr("stroke",       "#0a0c10")
      .attr("stroke-width", 2)
      .style("cursor",      "pointer")
      .on("click", (_event, d) => {
        if (d.id !== "DEFEND") onSelectIP(d.id);
      })
      .on("mouseover", (event: MouseEvent, d) => {
        setTooltip({ x: event.offsetX, y: event.offsetY, node: d });
      })
      .on("mouseout", () => setTooltip(null))
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag",  (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end",   (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

    // Labels
    const label = g.append("g")
      .selectAll<SVGTextElement, GraphNode>("text")
      .data(nodes)
      .enter().append("text")
      .text((d) => d.id === "DEFEND" ? "Defender" : d.label)
      .attr("font-size",   "10px")
      .attr("font-family", "JetBrains Mono, monospace")
      .attr("fill",        "#8b949e")
      .attr("dx",          12)
      .attr("dy",          4)
      .style("pointer-events", "none");

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);
      node
        .attr("cx", (d) => d.x ?? 0)
        .attr("cy", (d) => d.y ?? 0);
      label
        .attr("x", (d) => d.x ?? 0)
        .attr("y", (d) => d.y ?? 0);
    });

    return () => { sim.stop(); };
  }, [nodes, edges, onSelectIP]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg
        ref={svgRef}
        style={{ width: "100%", height: "100%", background: "var(--bg-surface)" }}
        aria-label="Force-directed threat graph"
      />
      {tooltip && (
        <div style={{
          position:   "absolute",
          left:       tooltip.x + 12,
          top:        tooltip.y - 8,
          background: "var(--bg-elevated)",
          border:     "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding:    "8px 12px",
          pointerEvents: "none",
          fontFamily: "var(--font-mono)",
          fontSize:   "12px",
          color:      "var(--text-primary)",
          zIndex:     50,
          whiteSpace: "nowrap",
        }}>
          <div>{tooltip.node.label}</div>
          <div style={{ color: "var(--text-secondary)" }}>
            Events: {tooltip.node.eventCount} · Score: {tooltip.node.threatScore}
          </div>
        </div>
      )}
    </div>
  );
}
