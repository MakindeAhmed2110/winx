import { buildPoseidon } from "circomlibjs";

const NOTE = 1n;
const POSITION = 2n;
const NOTE_NULLIFIER = 3n;
const POSITION_NULLIFIER = 4n;

export type Hasher = Awaited<ReturnType<typeof createHasher>>;

export async function createHasher() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const hash = (inputs: bigint[]) => F.toObject(poseidon(inputs.map((x) => BigInt(x))));
  return {
    poseidon,
    F,
    hash2: (a: bigint, b: bigint) => hash([a, b]),
    noteCommit: (amount: bigint, owner: bigint, blinding: bigint, collateralId = 1n) =>
      hash([NOTE, amount, owner, blinding, collateralId]),
    positionCommit: (
      size: bigint,
      isLong: bigint,
      entryPrice: bigint,
      leverage: bigint,
      owner: bigint,
      blinding: bigint,
      marketId: bigint,
      fundingIndex: bigint,
      openedAt: bigint,
      collateralId = 1n,
    ) =>
      hash([
        POSITION,
        size,
        isLong,
        entryPrice,
        leverage,
        owner,
        blinding,
        marketId,
        fundingIndex,
        openedAt,
        collateralId,
      ]),
    noteNullifier: (owner: bigint, blinding: bigint, scope: bigint) =>
      hash([NOTE_NULLIFIER, owner, blinding, scope]),
    positionNullifier: (owner: bigint, blinding: bigint, scope: bigint) =>
      hash([POSITION_NULLIFIER, owner, blinding, scope]),
  };
}

export function toHex32(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export function randomBlinding(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex);
}

export function addressToOwner(address: `0x${string}`): bigint {
  return BigInt(address);
}
