import { groth16 } from "snarkjs";
import { addressToOwner, createHasher, randomBlinding, toHex32 } from "./commitments";
import { pathForIndex, poseidonZeros } from "./merkle";

export type Groth16ProofArgs = {
  a: readonly [bigint, bigint];
  b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  c: readonly [bigint, bigint];
};

function parseProof(calldata: string): Groth16ProofArgs {
  const parsed = JSON.parse(`[${calldata}]`) as [
    string[],
    string[][],
    string[],
    string[],
  ];
  return {
    a: [BigInt(parsed[0][0]!), BigInt(parsed[0][1]!)] as const,
    b: [
      [BigInt(parsed[1][0]![0]!), BigInt(parsed[1][0]![1]!)] as const,
      [BigInt(parsed[1][1]![0]!), BigInt(parsed[1][1]![1]!)] as const,
    ] as const,
    c: [BigInt(parsed[2][0]!), BigInt(parsed[2][1]!)] as const,
  };
}

async function fullProve(
  name: "shield" | "open" | "unshield" | "close",
  input: Record<string, unknown>,
) {
  const root = (globalThis as { __WINX_CIRCUITS__?: string }).__WINX_CIRCUITS__;
  const wasm = root ? `${root}/${name}.wasm` : `/circuits/${name}.wasm`;
  const zkey = root ? `${root}/${name}.zkey` : `/circuits/${name}.zkey`;
  const t0 = performance.now();
  const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey);
  const proveMs = Math.round(performance.now() - t0);
  const calldata = await groth16.exportSolidityCallData(proof, publicSignals);
  return { proof: parseProof(calldata), publicSignals, proveMs };
}

export async function proveShield(args: {
  vault: `0x${string}`;
  amount: bigint;
  ownerAddress: `0x${string}`;
  blinding?: bigint;
}) {
  const h = await createHasher();
  const owner = addressToOwner(args.ownerAddress);
  const blinding = args.blinding ?? randomBlinding();
  const collateralId = 1n;
  const scope = BigInt(args.vault);
  const noteCommitment = h.noteCommit(args.amount, owner, blinding, collateralId);

  const { proof, proveMs } = await fullProve("shield", {
    owner: owner.toString(),
    blinding: blinding.toString(),
    noteCommitment: noteCommitment.toString(),
    amount: args.amount.toString(),
    collateralId: collateralId.toString(),
    scope: scope.toString(),
  });

  return {
    proof,
    noteCommitment: toHex32(noteCommitment),
    amount: args.amount,
    collateralId: 1,
    owner,
    blinding,
    proveMs,
  };
}

export async function proveOpen(args: {
  engine: `0x${string}`;
  ownerAddress: `0x${string}`;
  noteAmount: bigint;
  noteBlinding: bigint;
  leafIndex: number;
  leaves: bigint[];
  merkleRoot: `0x${string}`;
  size: bigint;
  isLong: boolean;
  leverage: bigint;
  markPrice: bigint;
  maxLeverage: bigint;
  marketId: number;
  openedAt: bigint;
  fundingIndex?: bigint;
  impactBps?: bigint;
  posBlinding?: bigint;
}) {
  const h = await createHasher();
  const zeros = await poseidonZeros(h);
  const owner = addressToOwner(args.ownerAddress);
  const scope = BigInt(args.engine);
  const posBlinding = args.posBlinding ?? randomBlinding();
  const collateralId = 1n;
  const fundingIndex = args.fundingIndex ?? 0n;
  const impactBps = args.impactBps ?? 0n;
  const isLong = args.isLong ? 1n : 0n;

  const noteCommitment = h.noteCommit(args.noteAmount, owner, args.noteBlinding, collateralId);
  const leaves = [...args.leaves];
  if (leaves[args.leafIndex] !== noteCommitment) {
    throw new Error("Local leaf list does not match this note - resync from vault history");
  }

  const { pathElements, pathIndices, computedRoot } = pathForIndex(
    args.leafIndex,
    leaves,
    zeros,
    h,
  );
  if (computedRoot !== BigInt(args.merkleRoot)) {
    throw new Error(
      `Merkle root mismatch. Local ${toHex32(computedRoot)} vs chain ${args.merkleRoot}`,
    );
  }

  const noteNullifier = h.noteNullifier(owner, args.noteBlinding, scope);
  const positionCommitment = h.positionCommit(
    args.size,
    isLong,
    args.markPrice,
    args.leverage,
    owner,
    posBlinding,
    BigInt(args.marketId),
    fundingIndex,
    args.openedAt,
    collateralId,
  );

  const margin = args.size / args.leverage;
  if (margin * args.leverage !== args.size) throw new Error("size must divide by leverage");
  if (margin > args.noteAmount) throw new Error("margin exceeds note");
  const changeAmount = args.noteAmount - margin;
  const changeBlinding = changeAmount === 0n ? 0n : randomBlinding();
  const changeNoteCommitment =
    changeAmount === 0n ? 0n : h.noteCommit(changeAmount, owner, changeBlinding, collateralId);

  const { proof, proveMs } = await fullProve("open", {
    noteAmount: args.noteAmount.toString(),
    owner: owner.toString(),
    noteBlinding: args.noteBlinding.toString(),
    changeBlinding: changeBlinding.toString(),
    size: args.size.toString(),
    isLong: isLong.toString(),
    leverage: args.leverage.toString(),
    posBlinding: posBlinding.toString(),
    pathElements,
    pathIndices,
    merkleRoot: BigInt(args.merkleRoot).toString(),
    noteNullifier: noteNullifier.toString(),
    positionCommitment: positionCommitment.toString(),
    changeNoteCommitment: changeNoteCommitment.toString(),
    markPrice: args.markPrice.toString(),
    maxLeverage: args.maxLeverage.toString(),
    marketId: args.marketId.toString(),
    fundingIndex: fundingIndex.toString(),
    impactBps: impactBps.toString(),
    openedAt: args.openedAt.toString(),
    collateralId: collateralId.toString(),
    scope: scope.toString(),
  });

  return {
    proof,
    proveMs,
    merkleRoot: args.merkleRoot,
    noteNullifier: toHex32(noteNullifier),
    positionCommitment: toHex32(positionCommitment),
    changeNoteCommitment: toHex32(changeNoteCommitment),
    markPrice: args.markPrice,
    openedAt: args.openedAt,
    marketId: args.marketId,
    collateralId: 1,
    posBlinding,
    changeBlinding,
    changeAmount,
    size: args.size,
    leverage: args.leverage,
    isLong: args.isLong,
    fundingIndex,
  };
}

/** GMX-style full-close PnL: floor(size * |exit-entry| / entry). */
export function computePnl(args: {
  size: bigint;
  isLong: boolean;
  entryPrice: bigint;
  exitPrice: bigint;
  margin: bigint;
}) {
  const priceDiff =
    args.exitPrice >= args.entryPrice
      ? args.exitPrice - args.entryPrice
      : args.entryPrice - args.exitPrice;
  const isProfit = args.isLong
    ? args.exitPrice >= args.entryPrice
    : args.exitPrice < args.entryPrice;
  const pnl = (args.size * priceDiff) / args.entryPrice;
  const underwater = !isProfit && pnl > args.margin;
  const equity = isProfit ? args.margin + pnl : underwater ? 0n : args.margin - pnl;
  return { pnl, equity, isProfit, underwater };
}

export function impactBpsFromSkew(longOi: bigint, shortOi: bigint, impactFactorBps: bigint) {
  const total = longOi + shortOi;
  if (total === 0n || impactFactorBps === 0n) return 0n;
  const imb = longOi > shortOi ? longOi - shortOi : shortOi - longOi;
  const bps = (imb * impactFactorBps) / total;
  return bps > 500n ? 500n : bps;
}

export function absIndex(v: bigint) {
  return v < 0n ? -v : v;
}

/** Close a private position. Scope is the engine. `closedAt` must equal the inclusion block timestamp. */
export async function proveClose(args: {
  engine: `0x${string}`;
  ownerAddress: `0x${string}`;
  size: bigint;
  isLong: boolean;
  entryPrice: bigint;
  leverage: bigint;
  posBlinding: bigint;
  fundingIndexEntry: bigint;
  marketId: number;
  openedAt: bigint;
  closedAt: bigint;
  exitPrice: bigint;
  fundingIndex: bigint;
  impactBps: bigint;
  borrowRate: bigint;
  profitFeeBps: bigint;
}) {
  const h = await createHasher();
  const owner = addressToOwner(args.ownerAddress);
  const scope = BigInt(args.engine);
  const collateralId = 1n;
  const isLong = args.isLong ? 1n : 0n;
  const margin = args.size / args.leverage;
  if (margin * args.leverage !== args.size) throw new Error("size must divide by leverage");

  const pnl = computePnl({
    size: args.size,
    isLong: args.isLong,
    entryPrice: args.entryPrice,
    exitPrice: args.exitPrice,
    margin,
  });
  if (pnl.underwater) {
    throw new Error("Position is underwater — close is disabled; liquidation path required");
  }

  const SCALE = 100_000_000n;
  // Engine packs abs(fundingIndexLong); circuit AbsDiff(publicIndex, entry).
  const fundingPublic = absIndex(args.fundingIndex);
  const idxDiff = absIndex(fundingPublic - args.fundingIndexEntry);
  const dt = args.closedAt - args.openedAt;
  if (dt < 0n) throw new Error("closedAt before openedAt");
  const fundingFee = (args.size * idxDiff) / SCALE;
  const borrowFee = (args.size * args.borrowRate * dt) / SCALE;
  const impactFee = (args.size * args.impactBps) / 10_000n;
  const fees = fundingFee + borrowFee + impactFee;
  const leftoverGross = pnl.equity > fees ? pnl.equity - fees : 0n;
  const protocolFee = pnl.isProfit ? (pnl.pnl * args.profitFeeBps) / 10_000n : 0n;
  if (protocolFee > leftoverGross) {
    throw new Error("Protocol fee exceeds leftover equity");
  }
  const leftover = leftoverGross - protocolFee;

  const positionCommitment = h.positionCommit(
    args.size,
    isLong,
    args.entryPrice,
    args.leverage,
    owner,
    args.posBlinding,
    BigInt(args.marketId),
    args.fundingIndexEntry,
    args.openedAt,
    collateralId,
  );
  const positionNullifier = h.positionNullifier(owner, args.posBlinding, scope);
  const payoutBlinding = leftover === 0n ? 0n : randomBlinding();
  const payoutNoteCommitment =
    leftover === 0n ? 0n : h.noteCommit(leftover, owner, payoutBlinding, collateralId);

  const { proof, proveMs } = await fullProve("close", {
    size: args.size.toString(),
    isLong: isLong.toString(),
    entryPrice: args.entryPrice.toString(),
    leverage: args.leverage.toString(),
    owner: owner.toString(),
    posBlinding: args.posBlinding.toString(),
    payoutBlinding: payoutBlinding.toString(),
    fundingIndexEntry: args.fundingIndexEntry.toString(),
    positionCommitment: positionCommitment.toString(),
    positionNullifier: positionNullifier.toString(),
    payoutNoteCommitment: payoutNoteCommitment.toString(),
    exitPrice: args.exitPrice.toString(),
    protocolFee: protocolFee.toString(),
    marketId: args.marketId.toString(),
    collateralId: collateralId.toString(),
    fundingIndex: fundingPublic.toString(),
    impactBps: args.impactBps.toString(),
    openedAt: args.openedAt.toString(),
    closedAt: args.closedAt.toString(),
    borrowRate: args.borrowRate.toString(),
    profitFeeBps: args.profitFeeBps.toString(),
    scope: scope.toString(),
  });

  return {
    proof,
    proveMs,
    positionCommitment: toHex32(positionCommitment),
    positionNullifier: toHex32(positionNullifier),
    payoutNoteCommitment: toHex32(payoutNoteCommitment),
    exitPrice: args.exitPrice,
    protocolFee,
    marketId: args.marketId,
    collateralId: 1,
    leftover,
    payoutBlinding,
    closedAt: args.closedAt,
    owner,
  };
}

/** Withdraw a shielded note to `recipient`. Nullifier scope is the vault. */
export async function proveUnshield(args: {
  vault: `0x${string}`;
  /** Poseidon owner field (usually BigInt of the shield wallet). */
  owner: bigint;
  noteAmount: bigint;
  noteBlinding: bigint;
  leafIndex: number;
  leaves: bigint[];
  merkleRoot: `0x${string}`;
  recipient: `0x${string}`;
}) {
  const h = await createHasher();
  const zeros = await poseidonZeros(h);
  const owner = args.owner;
  const scope = BigInt(args.vault);
  const collateralId = 1n;
  const recipient = BigInt(args.recipient);

  const noteCommitment = h.noteCommit(args.noteAmount, owner, args.noteBlinding, collateralId);
  const leaves = [...args.leaves];
  if (leaves[args.leafIndex] !== noteCommitment) {
    throw new Error(
      `Local leaf list does not match this note (index ${args.leafIndex}). Re-sync vault or restore the original note secrets.`,
    );
  }

  const { pathElements, pathIndices, computedRoot } = pathForIndex(
    args.leafIndex,
    leaves,
    zeros,
    h,
  );
  if (computedRoot !== BigInt(args.merkleRoot)) {
    throw new Error(
      `Merkle root mismatch. Local ${toHex32(computedRoot)} vs chain ${args.merkleRoot}`,
    );
  }

  const noteNullifier = h.noteNullifier(owner, args.noteBlinding, scope);

  const { proof, proveMs } = await fullProve("unshield", {
    owner: owner.toString(),
    blinding: args.noteBlinding.toString(),
    pathElements,
    pathIndices,
    merkleRoot: BigInt(args.merkleRoot).toString(),
    noteNullifier: noteNullifier.toString(),
    amount: args.noteAmount.toString(),
    recipient: recipient.toString(),
    collateralId: collateralId.toString(),
    scope: scope.toString(),
  });

  return {
    proof,
    proveMs,
    merkleRoot: args.merkleRoot,
    noteNullifier: toHex32(noteNullifier),
    amount: args.noteAmount,
    recipient: args.recipient,
    collateralId: 1,
  };
}
