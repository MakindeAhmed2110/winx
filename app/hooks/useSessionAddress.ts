import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, useRef } from "react";
import { toHex } from "viem";
import { useAccount } from "wagmi";
import { allowPrivyModal, blockPrivyModal, dismissPrivyModals } from "../lib/dismiss-privy";
import {
  embeddedWalletAddress,
  externalWalletAddress,
  isDirectWallet,
  isEmbeddedWallet,
  pegMessage,
  setLinkedWallet,
  setOperatingAddress,
  setOperatingPeg,
  shouldCreateEmbedded,
  type Peg,
} from "../lib/operating-wallet";
import { setPrivyTransactionSigner, type PrivyCloseSign } from "../lib/privy-signer";

const pegSaves = new Set<string>();

async function savePeg(external: `0x${string}`, embedded: `0x${string}`, sign: () => Promise<string>) {
  const id = `${external.toLowerCase()}:${embedded.toLowerCase()}`;
  if (pegSaves.has(id)) return;
  pegSaves.add(id);
  const pair: Peg = { external, embedded };
  setOperatingPeg(pair);
  try {
    const current = await fetch(`/api/wallet-peg?external=${external.toLowerCase()}`);
    if (current.ok) {
      const body = (await current.json()) as { embedded?: string };
      if (body.embedded?.toLowerCase() === embedded.toLowerCase()) return;
    }
    const signature = await sign();
    await fetch("/api/wallet-peg", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        external: external.toLowerCase(),
        embedded: embedded.toLowerCase(),
        signature,
      }),
    });
  } catch {
    // A refresh tries the peg again. Don't loop the signature prompt.
  }
}

/** Mount only under PrivyProvider (privy status === "ready"). */
export function PrivyAddressSync({
  onAddress,
}: {
  onAddress: (address: `0x${string}` | undefined) => void;
}) {
  const { address: wagmiAddress } = useAccount();
  const { user, authenticated, signTransaction } = usePrivy();
  const { wallets, ready } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { createWallet } = useCreateWallet();
  const createWalletRef = useRef(createWallet);
  createWalletRef.current = createWallet;

  const external = authenticated ? externalWalletAddress(user) : undefined;
  const embedded = authenticated ? embeddedWalletAddress(user) : undefined;
  const direct = isDirectWallet(external);
  const desired: `0x${string}` | undefined = !authenticated
    ? undefined
    : direct
      ? external
      : embedded ?? (external ? undefined : (user?.wallet?.address as `0x${string}` | undefined));

  const userId = user?.id;
  const shouldCreate = Boolean(user && shouldCreateEmbedded(user) && !embedded);

  useEffect(() => {
    if (!authenticated || !ready || !userId || !shouldCreate) return;
    let cancelled = false;

    const run = async () => {
      // The embedded-wallet iframe is often still loading right after SIWE.
      // Creating before it is ready opens a Privy dialog that login used to close.
      await new Promise((resolve) => setTimeout(resolve, 400));
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        allowPrivyModal();
        try {
          await Promise.race([
            createWalletRef.current(),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error("Embedded wallet creation timed out")), 12_000);
            }),
          ]);
          dismissPrivyModals();
          return;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/already has an embedded wallet/i.test(msg)) {
            dismissPrivyModals();
            return;
          }
          dismissPrivyModals();
          if (attempt === 5) console.warn("[winx] embedded wallet was not created", msg);
          await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        } finally {
          blockPrivyModal();
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [authenticated, ready, userId, shouldCreate]);

  useEffect(() => {
    if (!desired) return;
    const target = wallets.find((wallet) => wallet.address.toLowerCase() === desired.toLowerCase());
    if (!target) return;
    if (wagmiAddress?.toLowerCase() === desired.toLowerCase()) return;
    setActiveWallet(target);
  }, [desired, wallets, wagmiAddress, setActiveWallet]);

  useEffect(() => {
    const active = wagmiAddress?.toLowerCase() === desired?.toLowerCase() ? desired : undefined;
    setOperatingAddress(active);
    setLinkedWallet(authenticated && external && !direct ? external : undefined);
    onAddress(active);
  }, [authenticated, desired, direct, external, wagmiAddress, onAddress]);

  useEffect(() => {
    if (!authenticated || !external || !embedded || isDirectWallet(external)) return;
    const wallet = wallets.find(
      (item) => isEmbeddedWallet(item) && item.address.toLowerCase() === embedded.toLowerCase(),
    );
    if (!wallet) return;
    void savePeg(external, embedded, () => wallet.sign(pegMessage(external, embedded)));
  }, [authenticated, external, embedded, wallets]);

  useEffect(() => {
    const signingAddress = desired && !isDirectWallet(desired) ? desired : undefined;
    if (!authenticated || !signingAddress) {
      setPrivyTransactionSigner(null);
      return;
    }
    setPrivyTransactionSigner(async (tx: PrivyCloseSign) => {
      allowPrivyModal();
      try {
        const { signature } = await signTransaction(
          {
            from: tx.from,
            to: tx.to,
            data: tx.data,
            nonce: toHex(tx.nonce),
            gasLimit: toHex(tx.gas),
            maxFeePerGas: toHex(tx.maxFeePerGas),
            maxPriorityFeePerGas: toHex(tx.maxPriorityFeePerGas),
            value: "0x0",
            chainId: tx.chainId,
            type: 2,
          },
          { address: signingAddress },
        );
        return signature;
      } finally {
        blockPrivyModal();
      }
    });
    return () => setPrivyTransactionSigner(null);
  }, [authenticated, desired, signTransaction]);

  return null;
}
