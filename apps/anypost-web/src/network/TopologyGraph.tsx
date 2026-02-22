import { createMemo, For } from "solid-js";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import type { NetworkStatus } from "anypost-core/protocol";
import { buildTopologyGraph, type GraphNode, type GraphEdge, type NodeType, type TransportType } from "./topology-graph.js";

type TopologyGraphProps = {
  readonly networkStatus: NetworkStatus;
  readonly bootstrapAddrs: readonly string[];
};

type SimNode = SimulationNodeDatum & GraphNode;
type SimLink = SimulationLinkDatum<SimNode> & GraphEdge;

const WIDTH = 500;
const HEIGHT = 350;
const SELF_RADIUS = 20;
const PEER_RADIUS = 12;
const SIMULATION_TICKS = 80;

const nodeColor = (nodeType: NodeType): string => {
  switch (nodeType) {
    case "self": return "#2196F3";
    case "relay": return "#FF9800";
    case "peer": return "#4CAF50";
    case "bootstrap": return "#9E9E9E";
  }
};

const edgeColor = (transport: TransportType): string => {
  switch (transport) {
    case "webrtc": return "#4CAF50";
    case "circuit-relay": return "#FF9800";
    case "websocket": return "#2196F3";
    case "unknown": return "#9E9E9E";
  }
};

const edgeDash = (transport: TransportType): string =>
  transport === "circuit-relay" ? "6,3" : "none";

const nodeRadius = (nodeType: NodeType): number =>
  nodeType === "self" ? SELF_RADIUS : PEER_RADIUS;

const runLayout = (graph: { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] }): {
  readonly nodes: readonly (GraphNode & { readonly x: number; readonly y: number })[];
  readonly links: readonly { readonly source: { readonly x: number; readonly y: number }; readonly target: { readonly x: number; readonly y: number }; readonly transport: TransportType; readonly direction: string }[];
} => {
  const simNodes: SimNode[] = graph.nodes.map((n) => ({
    ...n,
    x: n.nodeType === "self" ? WIDTH / 2 : undefined,
    y: n.nodeType === "self" ? HEIGHT / 2 : undefined,
    fx: n.nodeType === "self" ? WIDTH / 2 : undefined,
    fy: n.nodeType === "self" ? HEIGHT / 2 : undefined,
  }));

  const simLinks: SimLink[] = graph.edges.map((e) => ({
    ...e,
    source: e.source,
    target: e.target,
  }));

  const sim = forceSimulation(simNodes)
    .force("link", forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(100))
    .force("charge", forceManyBody().strength(-200))
    .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
    .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(d.nodeType) + 10))
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i++) sim.tick();

  const positionedNodes = simNodes.map((n) => ({
    id: n.id,
    label: n.label,
    nodeType: n.nodeType,
    x: n.x ?? WIDTH / 2,
    y: n.y ?? HEIGHT / 2,
  }));

  const positionedLinks = simLinks.map((l) => {
    const src = l.source as SimNode;
    const tgt = l.target as SimNode;
    return {
      source: { x: src.x ?? 0, y: src.y ?? 0 },
      target: { x: tgt.x ?? 0, y: tgt.y ?? 0 },
      transport: l.transport,
      direction: l.direction,
    };
  });

  return { nodes: positionedNodes, links: positionedLinks };
};

export const TopologyGraph = (props: TopologyGraphProps) => {
  const layout = createMemo(() => {
    const graph = buildTopologyGraph(props.networkStatus, props.bootstrapAddrs);
    return runLayout(graph);
  });

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: "100%", height: "auto", "max-height": "350px", "background-color": "#fafafa", "border-radius": "6px" }}
      >
        {/* Edges */}
        <For each={layout().links}>
          {(link) => (
            <line
              x1={link.source.x}
              y1={link.source.y}
              x2={link.target.x}
              y2={link.target.y}
              stroke={edgeColor(link.transport)}
              stroke-width={2}
              stroke-dasharray={edgeDash(link.transport)}
              opacity={0.7}
            />
          )}
        </For>

        {/* Nodes */}
        <For each={layout().nodes}>
          {(node) => {
            const r = nodeRadius(node.nodeType);
            return (
              <g>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={nodeColor(node.nodeType)}
                  stroke="#fff"
                  stroke-width={2}
                  opacity={0.9}
                />
                <text
                  x={node.x}
                  y={node.y + r + 14}
                  text-anchor="middle"
                  font-size="9"
                  font-family="monospace"
                  fill="#666"
                >
                  {node.nodeType === "self" ? "You" : node.label}
                </text>
              </g>
            );
          }}
        </For>
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: "12px", "flex-wrap": "wrap", "margin-top": "6px", "font-size": "0.7em", color: "#888" }}>
        <span><span style={{ color: "#2196F3" }}>●</span> You</span>
        <span><span style={{ color: "#FF9800" }}>●</span> Relay</span>
        <span><span style={{ color: "#4CAF50" }}>●</span> Peer</span>
        <span><span style={{ color: "#9E9E9E" }}>●</span> Bootstrap</span>
        <span style={{ "border-left": "1px solid #ddd", "padding-left": "12px" }}>
          <span style={{ color: "#4CAF50" }}>―</span> WebRTC
          {" "}
          <span style={{ color: "#FF9800" }}>- -</span> Relay
          {" "}
          <span style={{ color: "#2196F3" }}>―</span> WS
        </span>
      </div>
    </div>
  );
};
