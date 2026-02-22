import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum, Simulation } from "d3-force";
import type { NetworkStatus } from "anypost-core/protocol";
import { buildTopologyGraph, latencyToDistance, type GraphNode, type GraphEdge, type NodeType, type TransportType } from "./topology-graph.js";

export type TopologyGraphProps = {
  readonly networkStatus: NetworkStatus;
  readonly bootstrapAddrs: readonly string[];
  readonly latencyMap: ReadonlyMap<string, number>;
};

type SimNode = SimulationNodeDatum & GraphNode;
type SimLink = SimulationLinkDatum<SimNode> & GraphEdge;

type PositionedNode = GraphNode & { readonly x: number; readonly y: number };
type PositionedLink = {
  readonly source: { readonly x: number; readonly y: number };
  readonly target: { readonly x: number; readonly y: number };
  readonly transport: TransportType;
  readonly direction: string;
  readonly targetId: string;
  readonly latencyMs: number | null;
};

type LayoutSnapshot = {
  readonly nodes: readonly PositionedNode[];
  readonly links: readonly PositionedLink[];
};

const WIDTH = 500;
const HEIGHT = 350;
const SELF_RADIUS = 20;
const PEER_RADIUS = 12;
const DRAG_ALPHA_TARGET = 0.3;

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

const snapshotLayout = (simNodes: SimNode[], simLinks: SimLink[]): LayoutSnapshot => {
  const nodes = simNodes.map((n) => ({
    id: n.id,
    label: n.label,
    nodeType: n.nodeType,
    x: n.x ?? WIDTH / 2,
    y: n.y ?? HEIGHT / 2,
  }));

  const links = simLinks.map((l) => {
    const src = l.source as SimNode;
    const tgt = l.target as SimNode;
    return {
      source: { x: src.x ?? 0, y: src.y ?? 0 },
      target: { x: tgt.x ?? 0, y: tgt.y ?? 0 },
      transport: l.transport,
      direction: l.direction,
      targetId: typeof l.target === "string" ? l.target : (l.target as SimNode).id,
      latencyMs: l.latencyMs,
    };
  });

  return { nodes, links };
};

const nodeTypeLabel = (nodeType: NodeType): string => {
  switch (nodeType) {
    case "self": return "You";
    case "relay": return "Relay";
    case "peer": return "Peer";
    case "bootstrap": return "Bootstrap";
  }
};

const formatLatency = (ms: number): string => {
  if (ms < 1) return "<1ms";
  return `${Math.round(ms)}ms`;
};

export const TopologyGraph = (props: TopologyGraphProps) => {
  const [layout, setLayout] = createSignal<LayoutSnapshot>({ nodes: [], links: [] });
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);
  const [viewOffset, setViewOffset] = createSignal({ x: 0, y: 0 });

  let simRef: Simulation<SimNode, SimLink> | undefined;
  let simNodes: SimNode[] = [];
  let simLinks: SimLink[] = [];
  let rafId: number | undefined;
  let dragNodeId: string | null = null;
  let panStart: { x: number; y: number; ox: number; oy: number } | null = null;

  const tick = () => {
    setLayout(snapshotLayout(simNodes, simLinks));
    if (simRef && simRef.alpha() > simRef.alphaMin()) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const rebuildSimulation = () => {
    simRef?.stop();
    if (rafId !== undefined) cancelAnimationFrame(rafId);

    const graph = buildTopologyGraph(props.networkStatus, props.bootstrapAddrs, props.latencyMap);

    const prevPositions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    for (const n of simNodes) {
      prevPositions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, vx: n.vx ?? 0, vy: n.vy ?? 0 });
    }

    simNodes = graph.nodes.map((n) => {
      const prev = prevPositions.get(n.id);
      if (n.nodeType === "self") {
        return { ...n, x: WIDTH / 2, y: HEIGHT / 2, fx: WIDTH / 2, fy: HEIGHT / 2 };
      }
      return prev
        ? { ...n, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy }
        : { ...n };
    });

    simLinks = graph.edges.map((e) => ({
      ...e,
      source: e.source,
      target: e.target,
    }));

    simRef = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => latencyToDistance(l.latencyMs)),
      )
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(d.nodeType) + 10))
      .on("tick", () => {
        setLayout(snapshotLayout(simNodes, simLinks));
      });
  };

  createEffect(() => {
    const _status = props.networkStatus;
    const _addrs = props.bootstrapAddrs;
    const _latency = props.latencyMap;
    rebuildSimulation();
  });

  onCleanup(() => {
    simRef?.stop();
    if (rafId !== undefined) cancelAnimationFrame(rafId);
  });

  const svgPointFromEvent = (e: PointerEvent): { x: number; y: number } => {
    const svg = (e.currentTarget as Element).closest("svg");
    if (!svg) return { x: e.clientX, y: e.clientY };
    const rect = svg.getBoundingClientRect();
    const offset = viewOffset();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX + offset.x,
      y: (e.clientY - rect.top) * scaleY + offset.y,
    };
  };

  const handleNodePointerDown = (nodeId: string, e: PointerEvent) => {
    const node = simNodes.find((n) => n.id === nodeId);
    if (!node || node.nodeType === "self") return;

    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragNodeId = nodeId;

    const pt = svgPointFromEvent(e);
    node.fx = pt.x;
    node.fy = pt.y;
    simRef?.alphaTarget(DRAG_ALPHA_TARGET).restart();
  };

  const handleNodePointerMove = (e: PointerEvent) => {
    if (!dragNodeId) return;
    const node = simNodes.find((n) => n.id === dragNodeId);
    if (!node) return;

    const pt = svgPointFromEvent(e);
    node.fx = pt.x;
    node.fy = pt.y;
  };

  const handleNodePointerUp = () => {
    if (!dragNodeId) return;
    const node = simNodes.find((n) => n.id === dragNodeId);
    if (node) {
      node.fx = undefined;
      node.fy = undefined;
    }
    dragNodeId = null;
    simRef?.alphaTarget(0);
  };

  const handleBgPointerDown = (e: PointerEvent) => {
    if (dragNodeId) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const offset = viewOffset();
    panStart = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handleBgPointerMove = (e: PointerEvent) => {
    if (!panStart) return;
    const svg = (e.currentTarget as Element).closest("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const dx = (e.clientX - panStart.x) * scaleX;
    const dy = (e.clientY - panStart.y) * scaleY;
    setViewOffset({ x: panStart.ox - dx, y: panStart.oy - dy });
  };

  const handleBgPointerUp = () => {
    panStart = null;
  };

  const handleNodeClick = (nodeId: string) => {
    if (dragNodeId) return;
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  };

  const selectedNodeInfo = () => {
    const id = selectedNodeId();
    if (!id) return null;

    const node = layout().nodes.find((n) => n.id === id);
    if (!node) return null;

    const peer = props.networkStatus.peers.find((p) => p.peerId === id);
    const latency = props.latencyMap.get(id);

    return { node, peer, latency };
  };

  return (
    <div>
      <svg
        viewBox={`${viewOffset().x} ${viewOffset().y} ${WIDTH} ${HEIGHT}`}
        style={{
          width: "100%",
          height: "auto",
          "max-height": "350px",
          "background-color": "#0e1621",
          "border-radius": "6px",
          cursor: panStart ? "grabbing" : "grab",
          "user-select": "none",
        }}
      >
        <rect
          x={viewOffset().x}
          y={viewOffset().y}
          width={WIDTH}
          height={HEIGHT}
          fill="transparent"
          onPointerDown={handleBgPointerDown}
          onPointerMove={handleBgPointerMove}
          onPointerUp={handleBgPointerUp}
        />

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

        <For each={layout().links}>
          {(link) => {
            const latency = props.latencyMap.get(link.targetId);
            return (
              <Show when={latency !== undefined}>
                <text
                  x={(link.source.x + link.target.x) / 2}
                  y={(link.source.y + link.target.y) / 2 - 6}
                  text-anchor="middle"
                  font-size="8"
                  font-family="monospace"
                  fill="#8696a6"
                >
                  {formatLatency(latency!)}
                </text>
              </Show>
            );
          }}
        </For>

        <For each={layout().nodes}>
          {(node) => {
            const r = nodeRadius(node.nodeType);
            const isSelected = () => selectedNodeId() === node.id;
            return (
              <g
                style={{ cursor: node.nodeType === "self" ? "default" : "pointer" }}
                onPointerDown={(e) => handleNodePointerDown(node.id, e)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
                onClick={() => handleNodeClick(node.id)}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r + (isSelected() ? 3 : 0)}
                  fill={nodeColor(node.nodeType)}
                  stroke={isSelected() ? "#f5f5f5" : "#1d2b3a"}
                  stroke-width={isSelected() ? 3 : 2}
                  opacity={0.9}
                />
                <text
                  x={node.x}
                  y={node.y + r + 14}
                  text-anchor="middle"
                  font-size="9"
                  font-family="monospace"
                  fill="#8696a6"
                >
                  {node.nodeType === "self" ? "You" : node.label}
                </text>
              </g>
            );
          }}
        </For>
      </svg>

      <div class="flex gap-3 flex-wrap mt-1.5 text-[11px] text-tg-text-dim">
        <span><span style={{ color: "#2196F3" }}>●</span> You</span>
        <span><span style={{ color: "#FF9800" }}>●</span> Relay</span>
        <span><span style={{ color: "#4CAF50" }}>●</span> Peer</span>
        <span><span style={{ color: "#9E9E9E" }}>●</span> Bootstrap</span>
        <span class="border-l border-tg-border pl-3">
          <span style={{ color: "#4CAF50" }}>―</span> WebRTC
          {" "}
          <span style={{ color: "#FF9800" }}>- -</span> Relay
          {" "}
          <span style={{ color: "#2196F3" }}>―</span> WS
        </span>
      </div>

      <Show when={selectedNodeInfo()}>
        {(info) => (
          <div class="mt-2 p-3 bg-tg-sidebar rounded-lg border border-tg-border text-xs font-mono">
            <div class="flex justify-between items-center mb-1.5">
              <strong class="text-tg-text">{nodeTypeLabel(info().node.nodeType)}</strong>
              <button
                onClick={() => setSelectedNodeId(null)}
                class="text-tg-text-dim hover:text-tg-text cursor-pointer text-base"
              >
                &times;
              </button>
            </div>

            <div class="mb-1 break-all">
              <span class="text-tg-text-dim">Peer ID </span>
              <code class="text-tg-text">{info().node.id}</code>
              <button
                onClick={() => navigator.clipboard.writeText(info().node.id)}
                class="ml-1.5 border border-tg-border rounded px-1.5 py-px text-[10px] text-tg-text-dim hover:text-tg-text cursor-pointer"
              >
                copy
              </button>
            </div>

            <Show when={info().latency !== undefined}>
              <div class="mb-1">
                <span class="text-tg-text-dim">Latency </span>
                <span
                  class="px-1.5 rounded-full text-[10px]"
                  classList={{
                    "bg-tg-success/20 text-tg-success": info().latency! < 50,
                    "bg-tg-warning/20 text-tg-warning": info().latency! >= 50 && info().latency! < 200,
                    "bg-tg-danger/20 text-tg-danger": info().latency! >= 200,
                  }}
                >
                  {formatLatency(info().latency!)}
                </span>
              </div>
            </Show>

            <Show when={info().peer}>
              {(peer) => (
                <>
                  <div class="mb-1">
                    <span class="text-tg-text-dim">Direction </span>
                    <span class="text-tg-text">{peer().direction}</span>
                  </div>
                  <div class="mb-1">
                    <span class="text-tg-text-dim">Muxer </span>
                    <span class="text-tg-text">{peer().protocol}</span>
                  </div>
                  <Show when={peer().addrs.length > 0}>
                    <div>
                      <span class="text-tg-text-dim">Addresses</span>
                      <For each={peer().addrs}>
                        {(addr) => (
                          <div class="break-all pl-2 mt-0.5 text-tg-text-dim">
                            {addr}
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
};
