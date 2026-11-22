import { parseAbiItem, type PublicClient } from "viem";
import { addresses } from "../config";
import { vaultAbi } from "../abis";
import { confirmNote, loadStore, replaceLeaves, setNoteLeafIndex, type LocalNote } from "./notes";

/** Production vault deploy on RH testnet (before first shield). */
export const VAULT_SYNC_FROM_BLOCK = BigInt(
  import.meta.env.VITE_VAULT_FROM_BLOCK || "154572087",
);

/** Robinhood testnet accepts ~250k-block eth_getLogs windows. 2k-block scans skip most of history. */
const LOG_SPAN = 250_000n;
const MIN_LOG_SPAN = 2_000n;

const shieldedEvent = parseAbiItem(
  "event Shielded(bytes32 indexed commitment, uint32 indexed collateralId, uint256 amount, address indexed from)",
);
const noteInsertedEvent = parseAbiItem("event NoteInserted(bytes32 indexed commitment)");
const noteSpentEvent = parseAbiItem(
  "event NoteSpent(bytes32 indexed nullifier, bytes32 changeCommitment)",
);

type LeafHit = {
  commitment: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
};

const ZERO =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function uniqLeaves(hits: LeafHit[]): `0x${string}`[] {
  hits.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
  const leaves: `0x${string}`[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const key = h.commitment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    leaves.push(h.commitment);
  }
  return leaves;
}

async function logsInRange(
  from: bigint,
  to: bigint,
  fetch: (from: bigint, to: bigint) => Promise<LeafHit[]>,
): Promise<LeafHit[]> {
  try {
    return await fetch(from, to);
  } catch (err) {
    const width = to - from + 1n;
    if (width <= MIN_LOG_SPAN) {
      try {
        return await fetch(from, to);
      } catch (retryErr) {
        const detail = retryErr instanceof Error ? retryErr.message : String(retryErr);
        throw new Error(`Vault log scan failed for blocks ${from}-${to}: ${detail}`, {
          cause: err,
        });
      }
    }
    const mid = from + (to - from) / 2n;
    const left = await logsInRange(from, mid, fetch);
    const right = await logsInRange(mid + 1n, to, fetch);
    return left.concat(right);
  }
}

async function logsInChunks(
  fromStart: bigint,
  latest: bigint,
  fetch: (from: bigint, to: bigint) => Promise<LeafHit[]>,
): Promise<LeafHit[]> {
  const hits: LeafHit[] = [];
  let from = fromStart;
  while (from <= latest) {
    const to = from + LOG_SPAN - 1n > latest ? latest : from + LOG_SPAN - 1n;
    hits.push(...(await logsInRange(from, to, fetch)));
    from = to + 1n;
  }
  return hits;
}

function applyIndices(leaves: `0x${string}`[], notes: LocalNote[]): LocalNote[] {
  const indexByCommitment = new Map(leaves.map((c, i) => [c.toLowerCase(), i]));
  return notes.map((n) => {
    const idx = indexByCommitment.get(n.commitment.toLowerCase());
    return idx === undefined ? n : { ...n, leafIndex: idx };
  });
}

/**
 * Rebuild local merkle leaves from vault history.
 * Never replace a complete local tree with a partial log scan.
 */
export async function resyncVaultLeaves(client: PublicClient): Promise<{
  leaves: `0x${string}`[];
  notes: LocalNote[];
}> {
  const store = loadStore();
  const latest = await client.getBlockNumber();
  const nextIndex = Number(
    await client.readContract({
      address: addresses.vault,
      abi: vaultAbi,
      functionName: "nextLeafIndex",
    }),
  );

  if (store.leaves.length === nextIndex && nextIndex > 0) {
    const notes = applyIndices(store.leaves, store.notes);
    replaceLeaves(store.leaves, notes);
    return { leaves: store.leaves, notes };
  }

  const hits = await logsInChunks(VAULT_SYNC_FROM_BLOCK, latest, async (fromBlock, toBlock) => {
    const base = { address: addresses.vault, fromBlock, toBlock } as const;
    const [shielded, inserted, spent] = await Promise.all([
      client.getLogs({ ...base, event: shieldedEvent }),
      client.getLogs({ ...base, event: noteInsertedEvent }),
      client.getLogs({ ...base, event: noteSpentEvent }),
    ]);
    const chunk: LeafHit[] = [];
    for (const log of shielded) {
      const commitment = log.args.commitment;
      if (!commitment) continue;
      chunk.push({
        commitment,
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
      });
    }
    for (const log of inserted) {
      const commitment = log.args.commitment;
      if (!commitment) continue;
      chunk.push({
        commitment,
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
      });
    }
    for (const log of spent) {
      const change = log.args.changeCommitment;
      if (!change || change === ZERO) continue;
      chunk.push({
        commitment: change,
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
      });
    }
    return chunk;
  });

  const fromLogs = uniqLeaves(hits);

  // Only a full ordered history matches the on-chain root. A short scan must not
  // be stored: appending the new leaf onto a hole produces a proof the vault rejects.
  let leaves = store.leaves;
  if (fromLogs.length === nextIndex) {
    leaves = fromLogs;
  } else if (store.leaves.length === nextIndex) {
    leaves = store.leaves;
  } else if (fromLogs.length === nextIndex - 1 && fromLogs.length > store.leaves.length) {
    // Newest insert is not in logs yet. The scan did not skip windows, so this is the prefix.
    leaves = fromLogs;
  }

  const notes = applyIndices(leaves, store.notes);
  replaceLeaves(leaves, notes);
  return { leaves, notes };
}

/**
 * After shield / insertNote, the new leaf is always `nextLeafIndex - 1`.
 */
export async function appendLeafAfterInsert(
  client: PublicClient,
  commitment: `0x${string}`,
): Promise<number> {
  const next = await client.readContract({
    address: addresses.vault,
    abi: vaultAbi,
    functionName: "nextLeafIndex",
  });
  const idx = Number(next) - 1;
  if (idx < 0) throw new Error("Vault has no leaves after insert");

  const store = loadStore();
  const leaves = [...store.leaves];
  const existing = leaves.findIndex((c) => c.toLowerCase() === commitment.toLowerCase());
  if (existing >= 0 && leaves.length === idx + 1) {
    setNoteLeafIndex(commitment, existing);
    confirmNote(commitment, existing);
    return existing;
  }

  if (leaves.length !== idx) {
    const rebuilt = await resyncVaultLeaves(client);
    const again = [...rebuilt.leaves];
    const found = again.findIndex((c) => c.toLowerCase() === commitment.toLowerCase());
    if (found >= 0) {
      setNoteLeafIndex(commitment, found);
      confirmNote(commitment, found);
      return found;
    }
    if (again.length !== idx) {
      throw new Error(
        `Local merkle tree is missing leaves (have ${again.length}, need ${idx}). Retry after a moment.`,
      );
    }
    return commitLeaf(again, rebuilt.notes, commitment, idx);
  }
  return commitLeaf(leaves, store.notes, commitment, idx);
}

function commitLeaf(
  leaves: `0x${string}`[],
  notes: LocalNote[],
  commitment: `0x${string}`,
  idx: number,
): number {
  leaves.push(commitment);
  const nextNotes = notes.map((n) =>
    n.commitment.toLowerCase() === commitment.toLowerCase()
      ? { ...n, leafIndex: idx, pending: false }
      : n,
  );
  replaceLeaves(leaves, nextNotes);
  return idx;
}
