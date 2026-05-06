import type { TreeEntry, TreeNode } from "@statewalker/ai-agent/state";
import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Re-render only when the node's child list changes (add / remove /
 * group / ungroup). Reads `node.data.children` — `addChild` and
 * `removeChild` allocate a new array, so referential equality via
 * `Object.is` is the structural-change signal.
 */
export function useNodeChildren<T extends TreeNode>(
  node: T,
): readonly TreeEntry[] | undefined {
  const subscribe = useCallback((cb: () => void) => node.onUpdate(cb), [node]);
  const getSnapshot = useCallback(() => node.data.children, [node]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Re-render only when the node's `content` string changes. Drives the
 * streaming bubble — `appendDelta` reassigns `content`, so the snapshot
 * differs each token.
 */
export function useNodeContent<T extends TreeNode>(
  node: T,
): string | undefined {
  const subscribe = useCallback((cb: () => void) => node.onUpdate(cb), [node]);
  const getSnapshot = useCallback(() => node.content, [node]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Re-render only when `select(node)` changes by `Object.is` comparison.
 * Use for typed accessors (e.g., `useNodeProp(session, s => s.isStreaming)`).
 */
export function useNodeProp<T extends TreeNode, K>(
  node: T,
  select: (n: T) => K,
): K {
  const subscribe = useCallback((cb: () => void) => node.onUpdate(cb), [node]);
  const getSnapshot = useCallback(() => select(node), [node, select]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Catch-all: re-render on every notify, regardless of what changed. Uses
 * a monotonic counter snapshot so React always commits. Use sparingly —
 * the selector hooks above are usually what you want.
 */
export function useNode<T extends TreeNode>(node: T): number {
  const counterRef = useRef(0);
  const subscribe = useCallback(
    (cb: () => void) =>
      node.onUpdate(() => {
        counterRef.current += 1;
        cb();
      }),
    [node],
  );
  const getSnapshot = useCallback(() => counterRef.current, []);
  return useSyncExternalStore(subscribe, getSnapshot);
}
