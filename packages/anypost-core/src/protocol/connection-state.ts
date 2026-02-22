type ConnectionStatus =
  | "disconnected"
  | "connecting-to-relay"
  | "discovering-peers"
  | "connected-relayed"
  | "connected-direct";

type ConnectionQuality = "red" | "yellow" | "green";

type ConnectionState = {
  readonly status: ConnectionStatus;
  readonly error?: string;
};

const VALID_TRANSITIONS: ReadonlyMap<ConnectionStatus, readonly ConnectionStatus[]> =
  new Map([
    ["disconnected", ["connecting-to-relay"]],
    ["connecting-to-relay", ["discovering-peers", "disconnected"]],
    ["discovering-peers", ["connected-relayed", "disconnected"]],
    ["connected-relayed", ["connected-direct", "disconnected"]],
    ["connected-direct", ["disconnected"]],
  ]);

export const createConnectionState = (): ConnectionState => ({
  status: "disconnected",
});

export const transitionTo = (
  state: ConnectionState,
  target: ConnectionStatus,
  error?: string,
): ConnectionState => {
  const allowed = VALID_TRANSITIONS.get(state.status) ?? [];
  if (!allowed.includes(target)) {
    throw new Error(
      `Invalid transition from '${state.status}' to '${target}'`,
    );
  }

  return target === "disconnected"
    ? { status: target, error }
    : { status: target };
};

export const connectionQuality = (state: ConnectionState): ConnectionQuality => {
  if (state.status === "connected-direct") return "green";
  if (state.status === "disconnected") return "red";
  return "yellow";
};
