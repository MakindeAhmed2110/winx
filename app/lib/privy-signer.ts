export type PrivyCloseSign = {
  from: `0x${string}`;
  to: `0x${string}`;
  data: `0x${string}`;
  nonce: number;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  chainId: number;
};

type Signer = (tx: PrivyCloseSign) => Promise<`0x${string}`>;

let signer: Signer | null = null;

/** Registered by the Privy session. Survives wagmi dropping its wallet client. */
export function setPrivyTransactionSigner(next: Signer | null) {
  signer = next;
}

export function privySignTransaction(tx: PrivyCloseSign): Promise<`0x${string}`> | null {
  if (!signer) return null;
  return signer(tx);
}
