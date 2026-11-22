import type { Hasher } from "./commitments";

export const LEVELS = 16;

export async function poseidonZeros(h: Hasher): Promise<bigint[]> {
  const zeros = [0n];
  for (let i = 0; i < LEVELS; i++) zeros.push(h.hash2(zeros[i]!, zeros[i]!));
  return zeros;
}

/**
 * Sibling path for leaf `index` against the tree formed by **all** `leaves`
 * (same root as on-chain IncrementalMerkleTree after those inserts).
 *
 * The previous frontier-only path only matched the latest leaf — older notes
 * failed unshield with a merkle root mismatch once later leaves existed.
 */
export function pathForIndex(index: number, leaves: bigint[], zeros: bigint[], h: Hasher) {
  if (index < 0 || index >= leaves.length) {
    throw new Error(`Leaf index ${index} out of range (tree size ${leaves.length})`);
  }

  const pathElements: string[] = [];
  const pathIndices: string[] = [];
  let nodes = leaves.slice();
  let idx = index;
  let current = leaves[index]!;

  for (let level = 0; level < LEVELS; level++) {
    const isLeft = idx % 2 === 0;
    const siblingIdx = isLeft ? idx + 1 : idx - 1;
    const sibling = siblingIdx < nodes.length ? nodes[siblingIdx]! : zeros[level]!;

    pathIndices.push(isLeft ? "0" : "1");
    pathElements.push(sibling.toString());
    current = isLeft ? h.hash2(current, sibling) : h.hash2(sibling, current);

    const next: bigint[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i]!;
      const right = i + 1 < nodes.length ? nodes[i + 1]! : zeros[level]!;
      next.push(h.hash2(left, right));
    }
    nodes = next;
    idx = Math.floor(idx / 2);
  }

  return { pathElements, pathIndices, computedRoot: current };
}
