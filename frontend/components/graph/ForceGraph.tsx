"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as d3 from "d3";
import type { Agent, Task, AgentRole, TaskStatus, AgentState } from "@/types/entities";
import { AGENT_DISPLAY, TASK_STATUS_COLOR } from "@/types/entities";

// ─── Types ───

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: "agent" | "task";
  label: string;
  role?: AgentRole;
  status?: TaskStatus;
  agentState?: AgentState;
  confidence?: number;
  radius: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: "assignment" | "dependency" | "handoff";
}

interface ForceGraphProps {
  agents: Agent[];
  tasks: Task[];
  selectedNodeId: string | null;
  onNodeClick: (type: "agent" | "task", id: string) => void;
  isPlaying: boolean;
}

// ─── Constants ───

const AGENT_RADIUS = 28;
const TASK_RADIUS = 16;
const ACTIVE_STATES: (AgentState | TaskStatus)[] = [
  "thinking",
  "acting",
  "active",
  "retrying",
];

function getNodeColor(node: GraphNode): string {
  if (node.type === "agent" && node.role) {
    return AGENT_DISPLAY[node.role]?.color ?? "#94a3b8";
  }
  if (node.type === "task" && node.status) {
    return TASK_STATUS_COLOR[node.status] ?? "#94a3b8";
  }
  return "#94a3b8";
}

function getNodeIcon(node: GraphNode): string {
  if (node.type === "agent" && node.role) {
    return AGENT_DISPLAY[node.role]?.icon ?? "?";
  }
  return "";
}

function isNodeActive(node: GraphNode): boolean {
  if (node.type === "agent" && node.agentState) {
    return ACTIVE_STATES.includes(node.agentState);
  }
  if (node.type === "task" && node.status) {
    return ACTIVE_STATES.includes(node.status);
  }
  return false;
}

// ─── Component ───

export default function ForceGraph({
  agents,
  tasks,
  selectedNodeId,
  onNodeClick,
  isPlaying,
}: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Observe container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Build and render the graph
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;
    const svgEl = svgRef.current;
    const svg = d3.select(svgEl);

    svg.selectAll("*").remove();

    const { width, height } = dimensions;

    // ─── Build nodes and links ───
    const nodes: GraphNode[] = [
      ...agents.map((a) => ({
        id: a.id,
        type: "agent" as const,
        label: a.name,
        role: a.role,
        agentState: a.state,
        confidence: a.confidence,
        radius: AGENT_RADIUS,
      })),
      ...tasks.map((t) => ({
        id: t.id,
        type: "task" as const,
        label: t.title,
        status: t.status,
        confidence: t.confidence,
        radius: TASK_RADIUS,
      })),
    ];

    const links: GraphLink[] = [];

    // Agent → Task assignment links
    tasks.forEach((t) => {
      if (t.owner_agent_id) {
        links.push({
          source: t.owner_agent_id,
          target: t.id,
          type: "assignment",
        });
      }
    });

    // Task → Task dependency links
    tasks.forEach((t) => {
      t.depends_on.forEach((depId) => {
        if (nodes.some((n) => n.id === depId)) {
          links.push({
            source: depId,
            target: t.id,
            type: "dependency",
          });
        }
      });
    });

    // Agent → Agent handoff links (architect → analyst, analyst → operator, etc.)
    const handoffPairs: [AgentRole, AgentRole][] = [
      ["architect", "analyst"],
      ["architect", "operator"],
      ["analyst", "guardian"],
      ["operator", "narrator"],
      ["guardian", "escalation_lead"],
    ];
    handoffPairs.forEach(([fromRole, toRole]) => {
      const from = agents.find((a) => a.role === fromRole);
      const to = agents.find((a) => a.role === toRole);
      if (from && to) {
        links.push({ source: from.id, target: to.id, type: "handoff" });
      }
    });

    // ─── Defs: arrow markers and glow filter ───
    const defs = svg.append("defs");

    // Arrow marker
    defs
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L10,0L0,4")
      .attr("fill", "#3b3b40");

    // Glow filter for active nodes
    const glow = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glow
      .append("feGaussianBlur")
      .attr("stdDeviation", "6")
      .attr("result", "coloredBlur");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "coloredBlur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // Stronger glow for edge highlights
    const edgeGlow = defs.append("filter").attr("id", "edge-glow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
    edgeGlow.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    const edgeMerge = edgeGlow.append("feMerge");
    edgeMerge.append("feMergeNode").attr("in", "blur");
    edgeMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // ─── Zoom ───
    const g = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    d3.select(svgEl).call(zoom as any);

    // Center the view initially
    d3.select(svgEl).call(
      (zoom as any).transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85)
    );

    // ─── Force simulation ───
    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            if (d.type === "handoff") return 140;
            if (d.type === "assignment") return 90;
            return 110;
          })
          .strength((d) => {
            if (d.type === "handoff") return 0.6;
            return 0.3;
          })
      )
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(0, 0))
      .force(
        "collision",
        d3.forceCollide<GraphNode>().radius((d) => d.radius + 12)
      )
      .force("x", d3.forceX(0).strength(0.05))
      .force("y", d3.forceY(0).strength(0.05));

    simulationRef.current = simulation;

    // ─── Links ───
    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => {
        if (d.type === "handoff") return "#3b3b40";
        if (d.type === "assignment") return "#2a2a30";
        return "#252528";
      })
      .attr("stroke-width", (d) => (d.type === "handoff" ? 1.5 : 1))
      .attr("stroke-dasharray", (d) =>
        d.type === "dependency" ? "4 3" : "none"
      )
      .attr("marker-end", (d) =>
        d.type === "dependency" ? "url(#arrowhead)" : ""
      );

    // Animated flow + glow on active links
    link
      .filter((d): boolean => {
        const targetNode = nodes.find(
          (n) => n.id === (typeof d.target === "object" ? d.target.id : d.target)
        );
        const sourceNode = nodes.find(
          (n) => n.id === (typeof d.source === "object" ? d.source.id : d.source)
        );
        return Boolean((targetNode && isNodeActive(targetNode)) || (sourceNode && isNodeActive(sourceNode)));
      })
      .attr("stroke-dasharray", "8 4")
      .attr("stroke-width", 2.5)
      .attr("stroke", (d) => {
        const sourceNode = nodes.find(
          (n) => n.id === (typeof d.source === "object" ? d.source.id : d.source)
        );
        return sourceNode ? getNodeColor(sourceNode) : "#3b3b40";
      })
      .attr("filter", "url(#edge-glow)")
      .attr("class", "edge-animated edge-glow");

    // ─── Node groups ───
    const node = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Click handler
    node.on("click", (_event, d) => {
      onNodeClick(d.type, d.id);
    });

    // Agent nodes: rounded rectangles
    node
      .filter((d) => d.type === "agent")
      .each(function (d) {
        const group = d3.select(this);
        const color = getNodeColor(d);
        const active = isNodeActive(d);
        const selected = d.id === selectedNodeId;

        // Animated pulse rings for active agents
        if (active) {
          // Outer breathing glow
          group
            .append("circle")
            .attr("r", d.radius + 8)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 1.5)
            .attr("opacity", 0)
            .attr("filter", "url(#glow)")
            .append("animate")
            .attr("attributeName", "r")
            .attr("values", `${d.radius + 4};${d.radius + 14};${d.radius + 4}`)
            .attr("dur", "2.5s")
            .attr("repeatCount", "indefinite");

          group.select("circle:last-of-type")
            .append("animate")
            .attr("attributeName", "opacity")
            .attr("values", "0.4;0.1;0.4")
            .attr("dur", "2.5s")
            .attr("repeatCount", "indefinite");

          // Ripple ring that expands outward
          group
            .append("circle")
            .attr("r", d.radius)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 1)
            .attr("opacity", 0)
            .append("animate")
            .attr("attributeName", "r")
            .attr("values", `${d.radius};${d.radius + 20}`)
            .attr("dur", "3s")
            .attr("repeatCount", "indefinite");

          group.select("circle:last-of-type")
            .append("animate")
            .attr("attributeName", "opacity")
            .attr("values", "0.5;0")
            .attr("dur", "3s")
            .attr("repeatCount", "indefinite");
        }

        // Main circle with CSS transition class
        group
          .append("circle")
          .attr("class", "graph-node-circle")
          .attr("r", d.radius)
          .attr("fill", `${color}15`)
          .attr("stroke", selected ? color : `${color}60`)
          .attr("stroke-width", selected ? 2.5 : 1.5);

        // Icon
        group
          .append("text")
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("font-size", "16px")
          .attr("fill", color)
          .text(getNodeIcon(d));

        // Label below
        group
          .append("text")
          .attr("y", d.radius + 14)
          .attr("text-anchor", "middle")
          .attr("font-size", "11px")
          .attr("font-weight", "500")
          .attr("fill", selected ? color : "#9b978f")
          .text(d.label);

        // State label
        if (d.agentState) {
          group
            .append("text")
            .attr("y", d.radius + 26)
            .attr("text-anchor", "middle")
            .attr("font-size", "9px")
            .attr("font-family", "JetBrains Mono, monospace")
            .attr("fill", "#5c5852")
            .text(d.agentState);
        }
      });

    // Task nodes: smaller circles
    node
      .filter((d) => d.type === "task")
      .each(function (d) {
        const group = d3.select(this);
        const color = getNodeColor(d);
        const active = isNodeActive(d);
        const selected = d.id === selectedNodeId;

        if (active) {
          // Pulse ring for active tasks
          group
            .append("circle")
            .attr("r", d.radius + 3)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 1)
            .attr("opacity", 0)
            .append("animate")
            .attr("attributeName", "r")
            .attr("values", `${d.radius};${d.radius + 12}`)
            .attr("dur", "2s")
            .attr("repeatCount", "indefinite");

          group.select("circle:last-of-type")
            .append("animate")
            .attr("attributeName", "opacity")
            .attr("values", "0.5;0")
            .attr("dur", "2s")
            .attr("repeatCount", "indefinite");
        }

        // Main circle with CSS transition
        group
          .append("circle")
          .attr("class", "graph-node-circle")
          .attr("r", d.radius)
          .attr("fill", `${color}20`)
          .attr("stroke", selected ? color : `${color}50`)
          .attr("stroke-width", selected ? 2 : 1);

        // Status dot
        group
          .append("circle")
          .attr("r", 3)
          .attr("fill", color);

        // Truncated label
        const maxLen = 18;
        const displayLabel =
          d.label.length > maxLen ? d.label.slice(0, maxLen) + "…" : d.label;

        group
          .append("text")
          .attr("y", d.radius + 12)
          .attr("text-anchor", "middle")
          .attr("font-size", "9px")
          .attr("fill", selected ? color : "#5c5852")
          .text(displayLabel);
      });

    // ─── Tick ───
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // ─── Entrance animation: start nodes clustered, then expand ───
    nodes.forEach((n) => {
      n.x = (Math.random() - 0.5) * 50;
      n.y = (Math.random() - 0.5) * 50;
    });
    simulation.alpha(1).restart();

    return () => {
      simulation.stop();
    };
  }, [agents, tasks, selectedNodeId, onNodeClick, dimensions]);

  // Pause/resume simulation
  useEffect(() => {
    if (simulationRef.current) {
      if (isPlaying) {
        simulationRef.current.alpha(0.1).restart();
      } else {
        simulationRef.current.stop();
      }
    }
  }, [isPlaying]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: "block" }}
      />
    </div>
  );
}
