import { GENESIS_HASH, toHex } from "./action-chain.js";
import type { SignedAction } from "./action-chain.js";

export type ActionDagState = {
  readonly actions: ReadonlyMap<string, SignedAction>;
  readonly tipHashes: ReadonlySet<string>;
};

export const createActionDagState = (): ActionDagState => ({
  actions: new Map(),
  tipHashes: new Set(),
});

export const appendAction = (
  state: ActionDagState,
  action: SignedAction,
): ActionDagState => {
  const hashHex = toHex(action.hash);
  if (state.actions.has(hashHex)) return state;

  const actions = new Map(state.actions);
  actions.set(hashHex, action);

  const tipHashes = new Set(state.tipHashes);
  for (const parentHash of action.parentHashes) {
    tipHashes.delete(toHex(parentHash));
  }
  tipHashes.add(hashHex);

  return { actions, tipHashes };
};

export const getTips = (state: ActionDagState): readonly Uint8Array[] => {
  const tips: Uint8Array[] = [];
  for (const hashHex of state.tipHashes) {
    const action = state.actions.get(hashHex);
    if (action) tips.push(action.hash);
  }
  return tips;
};

export const topologicalOrder = (
  state: ActionDagState,
): readonly SignedAction[] => {
  if (state.actions.size === 0) return [];

  const genesisHex = toHex(GENESIS_HASH);
  const childrenOf = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const [hashHex] of state.actions) {
    inDegree.set(hashHex, 0);
    childrenOf.set(hashHex, []);
  }

  for (const [hashHex, action] of state.actions) {
    let parentCount = 0;
    for (const parentHash of action.parentHashes) {
      const parentHex = toHex(parentHash);
      if (parentHex === genesisHex) continue;
      if (state.actions.has(parentHex)) {
        childrenOf.get(parentHex)!.push(hashHex);
        parentCount++;
      }
    }
    inDegree.set(hashHex, parentCount);
  }

  const queue: string[] = [];
  for (const [hashHex, degree] of inDegree) {
    if (degree === 0) queue.push(hashHex);
  }
  sortByTimestampThenHash(queue, state.actions);

  const result: SignedAction[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(state.actions.get(current)!);

    const children = childrenOf.get(current) ?? [];
    const ready: string[] = [];
    for (const childHex of children) {
      const newDegree = inDegree.get(childHex)! - 1;
      inDegree.set(childHex, newDegree);
      if (newDegree === 0) ready.push(childHex);
    }

    if (ready.length > 0) {
      sortByTimestampThenHash(ready, state.actions);
      queue.push(...ready);
      sortByTimestampThenHash(queue, state.actions);
    }
  }

  return result;
};

const sortByTimestampThenHash = (
  hashes: string[],
  actions: ReadonlyMap<string, SignedAction>,
): void => {
  hashes.sort((a, b) => {
    const actionA = actions.get(a)!;
    const actionB = actions.get(b)!;
    const timeDiff = actionA.timestamp - actionB.timestamp;
    if (timeDiff !== 0) return timeDiff;
    return a.localeCompare(b);
  });
};
