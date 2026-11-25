import type { ConnectedWallet } from "@privy-io/react-auth";
import { useSyncExternalStore } from "react";

/** Existing positions live on these wallets. They trade directly and never get a pegged wallet. */
export const DIRECT_WALLETS = [
  "0xd1f3a43d8ff4185f6845a25d74cbe4b6c1922ea8",
  "0x03f0fa2451873bf8d5bee24f3e61e8dca9f34788",
] as const;

export type WalletLink = {
  type?: string;
  address?: string;
  walletClientType?: string;
};

export type Peg = {
  external: `0x${string}`;
  embedded: `0x${string}`;
};

const PEG_CACHE = "winx.wallet-peg.v1";

let operating: `0x${string}` | undefined;
let linked: `0x${string}` | undefined;
let peg: Peg | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function isDirectWallet(address: string | null | undefined) {
  if (!address) return false;
  const id = address.toLowerCase();
  return DIRECT_WALLETS.some((wallet) => wallet === id);
}

export function isEmbeddedWallet(wallet: { walletClientType?: string } | null | undefined) {
  const kind = wallet?.walletClientType;
  return kind === "privy" || kind === "privy-v2";
}

export function linkedWallets(user: { linkedAccounts?: WalletLink[] } | null | undefined) {
  return (user?.linkedAccounts ?? []).filter((account) => account.type === "wallet" && account.address);
}

export function externalWalletAddress(
  user: { linkedAccounts?: WalletLink[] } | null | undefined,
): `0x${string}` | undefined {
  const wallets = linkedWallets(user).filter((wallet) => !isEmbeddedWallet(wallet));
  const direct = wallets.find((wallet) => isDirectWallet(wallet.address));
  const address = (direct ?? wallets[0])?.address;
  return address ? (address as `0x${string}`) : undefined;
}

export function embeddedWalletAddress(
  user: { linkedAccounts?: WalletLink[] } | null | undefined,
): `0x${string}` | undefined {
  const address = linkedWallets(user).find((wallet) => isEmbeddedWallet(wallet))?.address;
  return address ? (address as `0x${string}`) : undefined;
}

/** Email users get an embedded wallet. External users do too, except the direct wallets above. */
export function shouldCreateEmbedded(user: { linkedAccounts?: WalletLink[] } | null | undefined) {
  const external = externalWalletAddress(user);
  if (!external) return true;
  return !isDirectWallet(external);
}

/** Wagmi follows this wallet. External logins use the embedded wallet, not the injected one. */
export function tradingWalletForWagmi({
  wallets,
  user,
}: {
  wallets: ConnectedWallet[];
  user: { linkedAccounts?: WalletLink[] } | null;
}): ConnectedWallet | undefined {
  const external = externalWalletAddress(user);
  if (isDirectWallet(external)) {
    return wallets.find((wallet) => wallet.address.toLowerCase() === external!.toLowerCase());
  }
  return wallets.find((wallet) => isEmbeddedWallet(wallet));
}

export function pegMessage(external: string, embedded: string) {
  return `Winx testnet wallet peg\n${external.toLowerCase()}\n${embedded.toLowerCase()}`;
}

export function setOperatingAddress(address: `0x${string}` | undefined) {
  if (operating === address) return;
  operating = address;
  emit();
}

/** External wallet a trading wallet is pegged to. Empty for email login and the direct wallets. */
export function setLinkedWallet(address: `0x${string}` | undefined) {
  const next = address?.toLowerCase() === operating?.toLowerCase() ? undefined : address;
  if (linked === next) return;
  linked = next;
  emit();
}

export function getLinkedWallet() {
  return linked;
}

export function getOperatingAddress() {
  return operating;
}

export function setOperatingPeg(next: Peg | undefined) {
  peg = next;
  if (typeof window === "undefined" || !next) return;
  try {
    window.localStorage.setItem(PEG_CACHE, JSON.stringify(next));
  } catch {
    // private mode
  }
}

export function getOperatingPeg(): Peg | undefined {
  if (peg) return peg;
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(PEG_CACHE);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Peg;
    if (!parsed?.external || !parsed?.embedded) return undefined;
    peg = parsed;
    return parsed;
  } catch {
    return undefined;
  }
}

export function backupExternalFor(address: string | undefined) {
  if (!address) return undefined;
  const pair = getOperatingPeg();
  if (!pair) return undefined;
  if (pair.embedded.toLowerCase() !== address.toLowerCase()) return undefined;
  return pair.external;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOperatingAddress() {
  return useSyncExternalStore(subscribe, getOperatingAddress, () => undefined);
}

export function useLinkedWallet() {
  return useSyncExternalStore(subscribe, getLinkedWallet, () => undefined);
}
