import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  formatEther,
  formatUnits,
  maxUint256,
  parseUnits,
  pad,
  type PublicClient,
} from "viem";
import { erc20Abi, engineAbi, oracleAbi, vaultAbi } from "../lib/abis";
import {
  addresses,
  explorerTx,
  feedForMarketId,
  markets,
  robinhoodTestnet,
  type MarketKey,
} from "../lib/config";
import { useCmcQuote } from "./useCmcQuote";
import { formatUsdw } from "../lib/format";
import { handoffPosition } from "../lib/keeper";
import {
  addNote,
  addPosition,
  confirmNote,
  downloadNotesFile,
  downloadSingleNote,
  dropPendingNote,
  liveNotes,
  loadStore,
  markNoteSpent,
  removePosition,
  restorePayoutBackups,
  type LocalNote,
  type LocalPosition,
} from "../lib/privacy/notes";
import { backupExternalFor, isDirectWallet } from "../lib/operating-wallet";
import { BackupSignatureDenied, syncPrivateBackup, type BackupSyncResult } from "../lib/privacy/backup";
import { addressToOwner, createHasher, toHex32 } from "../lib/privacy/commitments";
import {
  absIndex,
  impactBpsFromSkew,
  proveClose,
  proveOpen,
  proveShield,
  proveUnshield,
} from "../lib/privacy/prove";
import { appendLeafAfterInsert, resyncVaultLeaves } from "../lib/privacy/vaultSync";
import { requestKeeperMarkSync, settlementUpdatedAt, syncAggregatorMarks } from "../lib/syncMarks";
import { sendTimedClose } from "../lib/timed-tx";
import type { TradeSuccess } from "../components/trade/TradeSuccessModal";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Proof `closedAt` must equal the inclusion block's timestamp, exactly. */
const CLOSE_LEAD_S = 8n;
/** Seconds that must remain after the proof so the server can still hit that second. */
const CLOSE_SLACK_S = 4n;
const CLOSE_GAS = 1_600_000n;

type HeadSample = { ts: bigint; recv: number; rtt: number };

function freshHeadClient(): PublicClient {
  return createPublicClient({
    chain: robinhoodTestnet,
    transport: http(robinhoodTestnet.rpcUrls.default.http[0], {
      batch: false,
      timeout: 4_000,
    }),
    cacheTime: 0,
  }) as PublicClient;
}

/** Uncached head sampler. Wagmi's client caches `latest` for several seconds, which skips the close second. */
function startCloseClock() {
  const client = freshHeadClient();
  let stopped = false;
  let latest: HeadSample | null = null;
  let step: { chainTs: bigint; secondStartMs: number } | null = null;
  let prev: HeadSample | null = null;

  void (async () => {
    while (!stopped) {
      const sent = Date.now();
      try {
        const block = await client.getBlock({ blockTag: "latest" });
        if (stopped) return;
        const recv = Date.now();
        const sample: HeadSample = {
          ts: block.timestamp,
          recv,
          rtt: Math.max(1, recv - sent),
        };
        if (prev && sample.ts === prev.ts + 1n) {
          const oneWay = Math.min(prev.rtt, sample.rtt) / 2;
          step = { chainTs: sample.ts, secondStartMs: recv - oneWay };
        }
        prev = sample;
        latest = sample;
        await sleep(80);
      } catch {
        if (!stopped) await sleep(100);
      }
    }
  })();

  return {
    client,
    stop() {
      stopped = true;
    },
    latest() {
      return latest;
    },
    async head(): Promise<HeadSample> {
      const waitUntil = Date.now() + 4_000;
      while (Date.now() < waitUntil) {
        if (latest && Date.now() - latest.recv < 1_500) return latest;
        await sleep(40);
      }
      if (latest) return latest;
      throw new Error("Could not read the chain clock");
    },
    /** Local ms when `target` begins, from the last observed second boundary. */
    startOf(target: bigint): number | null {
      if (!step) return null;
      return step.secondStartMs + Number(target - step.chainTs) * 1000;
    },
  };
}

/** Live note already shielding this margin, so a failed open can be retried without shielding again. */
async function findLiveMarginNote(
  publicClient: PublicClient,
  amount: bigint,
): Promise<LocalNote | null> {
  const want = amount.toString();
  const candidates = loadStore().notes.filter(
    (n) => !n.spent && n.amount === want && n.blinding && n.blinding !== "0" && n.commitment,
  );
  for (const note of candidates) {
    try {
      const live = await publicClient.readContract({
        address: addresses.vault,
        abi: vaultAbi,
        functionName: "isLiveNote",
        args: [note.commitment],
      });
      if (!live) continue;
      confirmNote(note.commitment);
      return { ...note, pending: false };
    } catch {
      // try the next note
    }
  }
  return null;
}

export type TradeStatus = { kind: "idle" | "work" | "ok" | "err"; text: string };
export type { MarketKey };

function feedId(feed: `0x${string}`): `0x${string}` {
  return pad(feed, { size: 32 });
}

function asBig(v: unknown, fallback = 0n): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "string" && v !== "") return BigInt(v);
  return fallback;
}

function oraclePrice(mark: unknown): bigint | null {
  if (mark == null) return null;
  if (Array.isArray(mark)) return asBig(mark[0]);
  if (typeof mark === "object" && mark && "price" in mark) {
    return asBig((mark as { price: bigint }).price);
  }
  return null;
}

function marketRisk(row: unknown) {
  const r = row as Record<string, unknown> & unknown[];
  return {
    borrowRate: asBig(r.borrowFactorPerSecond ?? r[5]),
    impactFactorBps: asBig(r.impactFactorBps ?? r[6]),
    longOi: asBig(r.longOi ?? r[9]),
    shortOi: asBig(r.shortOi ?? r[10]),
    fundingIndexLong: asBig(r.fundingIndexLong ?? r[11]),
  };
}

export function useTradeDesk() {
  const { address: wagmiAddress, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: robinhoodTestnet.id });
  const { data: walletClient } = useWalletClient({ chainId: robinhoodTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [privyAddress, setPrivyAddress] = useState<`0x${string}` | undefined>();
  const address = privyAddress ?? (isDirectWallet(wagmiAddress) ? wagmiAddress : undefined);

  const [searchParams, setSearchParams] = useSearchParams();
  const marketParam = searchParams.get("market");
  const [marketKey, setMarketKey] = useState<MarketKey>(
    marketParam != null && marketParam in markets ? (marketParam as MarketKey) : "btc",
  );
  const [isLong, setIsLong] = useState(true);
  const [leverage, setLeverage] = useState(40);

  useEffect(() => {
    if (marketParam == null || !(marketParam in markets)) return;
    const key = marketParam as MarketKey;
    setMarketKey(key);
    const max = markets[key].maxLeverage;
    if (max > 0) setLeverage(max);
  }, [marketParam]);
  const [orderType, setOrderType] = useState<"market" | "limit" | "trigger">("market");
  const [sizeUsd, setSizeUsd] = useState("400");
  const [status, setStatus] = useState<TradeStatus>({ kind: "idle", text: "Ready." });
  const [success, setSuccess] = useState<TradeSuccess | null>(null);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [positions, setPositions] = useState<LocalPosition[]>([]);
  const [ethDisplay, setEthDisplay] = useState("—");
  const [bottomTab, setBottomTab] = useState<
    "positions" | "balances" | "notes" | "orders" | "history"
  >("positions");

  const onPrivyAddress = useCallback((a: `0x${string}` | undefined) => {
    setPrivyAddress(a);
  }, []);

  const market = markets[marketKey];
  const feed = market.feed;

  const refreshLocal = useCallback(() => {
    const s = loadStore();
    setNotes([...s.notes]);
    setPositions([...s.positions]);
  }, []);

  useEffect(() => {
    const restored = restorePayoutBackups();
    refreshLocal();
    if (restored > 0) {
      setStatus({
        kind: "ok",
        text: `Restored ${restored} payout note${restored > 1 ? "s" : ""} from local backup.`,
      });
      setBottomTab("notes");
    }
  }, [refreshLocal]);

  useEffect(() => {
    if (!address) return;
    for (const pos of loadStore().positions) {
      void handoffPosition({
        commitment: pos.commitment,
        marketId: pos.marketId,
        isLong: pos.isLong,
        leverage: pos.leverage,
        size: pos.size,
        entryPrice: pos.entryPrice,
        posBlinding: pos.posBlinding,
        openedAt: pos.openedAt,
        owner: addressToOwner(address).toString(),
        fundingIndexEntry: pos.fundingIndexEntry ?? "0",
        collateralId: 1,
      }).catch(() => {});
    }
  }, [address]);

  /** Drop ghost positions and confirm pending notes against the vault. */
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    const hydrate = async () => {
      const local = loadStore();
      let removed = 0;
      for (const pos of local.positions) {
        try {
          const open = await publicClient.readContract({
            address: addresses.engine,
            abi: engineAbi,
            functionName: "positions",
            args: [pos.commitment],
          });
          if (!open) {
            removePosition(pos.commitment);
            removed += 1;
          }
        } catch {
          // ignore transient RPC errors
        }
      }

      restorePayoutBackups();
      const notesNow = loadStore().notes;
      for (const note of notesNow) {
        if (note.spent) continue;
        try {
          const liveOnVault = await publicClient.readContract({
            address: addresses.vault,
            abi: vaultAbi,
            functionName: "isLiveNote",
            args: [note.commitment],
          });
          if (liveOnVault) {
            confirmNote(note.commitment);
            const owner = BigInt(note.owner || "0");
            const blinding = BigInt(note.blinding || "0");
            if (owner > 0n && blinding > 0n) {
              const h = await createHasher();
              const vaultNull = toHex32(
                h.noteNullifier(owner, blinding, BigInt(addresses.vault)),
              );
              const engineNull = toHex32(
                h.noteNullifier(owner, blinding, BigInt(addresses.engine)),
              );
              const [vaultSpent, engineSpent] = await Promise.all([
                publicClient.readContract({
                  address: addresses.vault,
                  abi: vaultAbi,
                  functionName: "isSpentNullifier",
                  args: [vaultNull],
                }),
                publicClient.readContract({
                  address: addresses.vault,
                  abi: vaultAbi,
                  functionName: "isSpentNullifier",
                  args: [engineNull],
                }),
              ]);
              if (vaultSpent || engineSpent) {
                markNoteSpent(note.commitment, vaultSpent ? "withdraw" : "trade");
              }
            }
          } else if (note.pending) {
            // Not inserted yet — leave pending (open/close in flight) or drop after close fail.
          }
        } catch {
          // ignore
        }
      }

      if (cancelled) return;
      if (removed > 0) refreshLocal();
      else refreshLocal();
    };
    void hydrate();
    const id = window.setInterval(() => void hydrate(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [publicClient, refreshLocal]);

  const { data: usdwBal, refetch: refetchUsdw } = useReadContract({
    address: addresses.usdw,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const { data: mark } = useReadContract({
    address: addresses.oracle,
    abi: oracleAbi,
    functionName: "getPrice",
    args: [feedId(feed)],
    query: { refetchInterval: 12_000, enabled: markets[marketKey].tradable },
  });

  const cmc = useCmcQuote(markets[marketKey].cmcId);
  const markPrice = oraclePrice(mark) ?? undefined;
  const chainUsd = markPrice != null ? Number(markPrice) / 1e8 : null;
  const markUsd = markets[marketKey].tradable ? chainUsd : cmc.price;

  useEffect(() => {
    if (!address || !publicClient) {
      setEthDisplay("—");
      return;
    }
    setEthDisplay("…");
    let cancelled = false;
    publicClient.getBalance({ address }).then((b) => {
      if (!cancelled) setEthDisplay(Number(formatEther(b)).toFixed(6));
    }).catch(() => {
      if (!cancelled) setEthDisplay("—");
    });
    const id = window.setInterval(() => {
      publicClient.getBalance({ address }).then((b) => {
        if (!cancelled) setEthDisplay(Number(formatEther(b)).toFixed(6));
      }).catch(() => {});
    }, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [address, publicClient, status.kind]);

  const live = useMemo(() => liveNotes(), [notes]);

  const shieldedBal = useMemo(
    () => live.reduce((sum, n) => sum + BigInt(n.amount), 0n),
    [live],
  );
  const shieldedDisplay =
    live.length > 0 ? formatUsdw(formatUnits(shieldedBal, 6)) : address ? "0.00" : "—";

  const onRobinhood = chainId === robinhoodTestnet.id;
  /** Only when wagmi reports a different chain — not merely “Privy has an address”. */
  const needsNetworkSwitch = Boolean(address && chainId != null && !onRobinhood);

  const ensureNetwork = useCallback(async (): Promise<boolean> => {
    if (chainId === robinhoodTestnet.id) return true;
    try {
      setStatus({ kind: "work", text: "Switching wallet to Robinhood testnet…" });
      await switchChainAsync({ chainId: robinhoodTestnet.id });
      return true;
    } catch {
      setStatus({
        kind: "err",
        text: "Switch MetaMask to Robinhood Chain Testnet (46630), then retry.",
      });
      return false;
    }
  }, [chainId, switchChainAsync]);

  const ensureSigner = useCallback(async (): Promise<boolean> => {
    if (!address) {
      setStatus({ kind: "err", text: "Connect a wallet first." });
      return false;
    }
    if (!publicClient) {
      setStatus({ kind: "err", text: "RPC not ready — refresh and try again." });
      return false;
    }
    if (!(await ensureNetwork())) return false;
    return true;
  }, [address, publicClient, ensureNetwork, walletClient, isConnected]);

  const signBackup = useCallback(
    (message: string) => {
      const signer = walletClient?.account?.address;
      if (!walletClient || !address || !signer || signer.toLowerCase() !== address.toLowerCase()) {
        return Promise.reject(new BackupSignatureDenied());
      }
      return walletClient.signMessage({ account: address, message });
    },
    [walletClient, address],
  );

  const pushBackup = useCallback(async (): Promise<BackupSyncResult | null> => {
    const signer = walletClient?.account?.address;
    if (!address || !walletClient || !publicClient || !signer || signer.toLowerCase() !== address.toLowerCase()) {
      return null;
    }
    try {
      const result = await syncPrivateBackup({
        address,
        publicClient,
        signMessage: signBackup,
        externalAddress: backupExternalFor(address),
      });
      if (result.restored) refreshLocal();
      return result;
    } catch (err) {
      if (!(err instanceof BackupSignatureDenied)) {
        console.warn("backup sync failed");
      }
      return null;
    }
  }, [address, walletClient, publicClient, signBackup, refreshLocal]);

  const backupNote = (result: BackupSyncResult | null) =>
    result ? "" : " Backup did not sync — stay on this browser.";

  const autoBackup = useRef<string | null>(null);
  useEffect(() => {
    const signer = walletClient?.account?.address;
    if (!address || !walletClient || !publicClient || !signer || signer.toLowerCase() !== address.toLowerCase()) {
      return;
    }
    const id = address.toLowerCase();
    if (autoBackup.current === id) return;
    autoBackup.current = id;
    let cancelled = false;
    void pushBackup().then((result) => {
      if (cancelled || !result?.restored) return;
      setStatus((prev) =>
        prev.text === "Ready." || prev.kind === "idle"
          ? { kind: "ok", text: "Restored notes and positions from your backup." }
          : prev,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [address, walletClient, publicClient, pushBackup]);

  const onWithdraw = useCallback(async (only?: LocalNote) => {
    if (!(await ensureSigner())) return;
    const toWithdraw = only
      ? liveNotes().filter(
          (n) => n.commitment.toLowerCase() === only.commitment.toLowerCase(),
        )
      : liveNotes();
    if (toWithdraw.length === 0) {
      setStatus({ kind: "err", text: "No live shielded notes to unshield." });
      return;
    }

    try {
      const h = await createHasher();
      let withdrawn = 0n;
      let lastHash: `0x${string}` | undefined;
      let i = 0;

      setStatus({ kind: "work", text: "Syncing vault leaves…" });
      const syncedOnce = await resyncVaultLeaves(publicClient);
      refreshLocal();

      for (const note of toWithdraw) {
        i += 1;
        const syncedNote =
          syncedOnce.notes.find(
            (n) => n.commitment.toLowerCase() === note.commitment.toLowerCase(),
          ) ?? note;
        const owner = BigInt(syncedNote.owner || addressToOwner(address).toString());

        setStatus({
          kind: "work",
          text: `Unshield ${i}/${toWithdraw.length}: checking nullifiers…`,
        });

        const vaultNull = toHex32(
          h.noteNullifier(owner, BigInt(syncedNote.blinding), BigInt(addresses.vault)),
        );
        const engineNull = toHex32(
          h.noteNullifier(owner, BigInt(syncedNote.blinding), BigInt(addresses.engine)),
        );
        const [vaultSpent, engineSpent] = await Promise.all([
          publicClient.readContract({
            address: addresses.vault,
            abi: vaultAbi,
            functionName: "isSpentNullifier",
            args: [vaultNull],
          }),
          publicClient.readContract({
            address: addresses.vault,
            abi: vaultAbi,
            functionName: "isSpentNullifier",
            args: [engineNull],
          }),
        ]);
        if (vaultSpent || engineSpent) {
          markNoteSpent(note.commitment, vaultSpent ? "withdraw" : "trade");
          continue;
        }

        const leafKey = syncedNote.commitment.toLowerCase();
        const leafIndex = syncedOnce.leaves.findIndex((c) => c.toLowerCase() === leafKey);
        if (leafIndex < 0) {
          throw new Error(
            `Note ${note.commitment.slice(0, 10)}… not found in vault merkle tree — cannot unshield`,
          );
        }

        const root = await publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "currentRoot",
        });

        setStatus({
          kind: "work",
          text: `Unshield ${i}/${toWithdraw.length}: proving…`,
        });
        const proved = await proveUnshield({
          vault: addresses.vault,
          owner,
          noteAmount: BigInt(syncedNote.amount),
          noteBlinding: BigInt(syncedNote.blinding),
          leafIndex,
          leaves: syncedOnce.leaves.map((c) => BigInt(c)),
          merkleRoot: root,
          recipient: address,
        });

        setStatus({
          kind: "work",
          text: `Unshield ${i}/${toWithdraw.length}: submitting (${proved.proveMs} ms)…`,
        });
        const hash = await writeContractAsync({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "unshield",
          args: [
            proved.proof,
            {
              merkleRoot: proved.merkleRoot,
              noteNullifier: proved.noteNullifier,
              collateralId: 1,
              amount: proved.amount,
              recipient: proved.recipient,
            },
          ],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "reverted") throw new Error("Unshield reverted.");
        markNoteSpent(note.commitment, "withdraw");
        withdrawn += proved.amount;
        lastHash = hash;

        // Tree root changes after each unshield nullifier spend only — leaves stay;
        // refresh root for the next note by re-reading (no leaf rebuild needed).
      }

      refreshLocal();
      await refetchUsdw();
      const backed = await pushBackup();

      if (withdrawn === 0n || !lastHash) {
        setStatus({
          kind: "ok",
          text: `No shielded notes left to unshield.${backupNote(backed)}`,
        });
      } else {
        setSuccess({
          kind: "unshield",
          txHash: lastHash,
          amount: withdrawn.toString(),
        });
        setStatus({
          kind: "ok",
          text: `Unshielded ${formatUsdw(formatUnits(withdrawn, 6))} USDW to your wallet.${backupNote(backed)}`,
        });
      }
      setBottomTab("balances");
    } catch (e) {
      refreshLocal();
      setStatus({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }, [ensureSigner, writeContractAsync, refreshLocal, refetchUsdw, address, publicClient, pushBackup]);

  const onDownloadNotes = useCallback(() => {
    downloadNotesFile();
    setStatus({ kind: "ok", text: "Notes backup downloaded." });
  }, []);

  const onDownloadNote = useCallback((note: LocalNote) => {
    downloadSingleNote(note);
    setStatus({ kind: "ok", text: `Downloaded note ${note.commitment.slice(0, 10)}…` });
  }, []);

  /** Push a live mark only when the on-chain print is already old. A fresh feed is used as-is. */
  const refreshSettlementMark = useCallback(
    async (marketId?: number) => {
      if (!publicClient) throw new Error("RPC not ready — cannot refresh mark");
      const feedAddr = feedForMarketId(marketId ?? 1);
      const fresh = async () => {
        const updatedAt = await settlementUpdatedAt(
          (args) => publicClient.readContract(args),
          feedAddr,
        );
        if (updatedAt == null) return false;
        const block = await publicClient.getBlock();
        return block.timestamp - updatedAt < 30n;
      };
      if (await fresh()) return;
      setStatus({ kind: "work", text: "Refreshing live settlement mark…" });
      const synced = await requestKeeperMarkSync();
      if (synced && (await fresh())) return;
      await syncAggregatorMarks({
        marketId,
        writeContractAsync: (args) => writeContractAsync(args),
        waitForTx: (args) => publicClient.waitForTransactionReceipt(args),
        readContract: (args) => publicClient.readContract(args),
      });
    },
    [publicClient, writeContractAsync],
  );

  const onClosePosition = useCallback(
    async (pos: LocalPosition, opts?: { quiet?: boolean }): Promise<boolean> => {
      const quiet = opts?.quiet === true;
      if (!(await ensureSigner()) || !address || !publicClient) return false;
      const clock = startCloseClock();
      try {
        const stillOpen = await publicClient.readContract({
          address: addresses.engine,
          abi: engineAbi,
          functionName: "positions",
          args: [pos.commitment],
        });
        if (!stillOpen) {
          removePosition(pos.commitment);
          restorePayoutBackups();
          refreshLocal();
          setStatus({
            kind: "err",
            text: "This position is already closed on-chain. Check Notes for a Live payout — if none, the blinding was never saved.",
          });
          if (!quiet) setBottomTab("notes");
          return false;
        }

        await refreshSettlementMark(pos.marketId);

        const feed = feedId(feedForMarketId(pos.marketId));

        for (let attempt = 0; attempt < 3; attempt++) {
        let proved: Awaited<ReturnType<typeof proveClose>> | null = null;
        let closedAt = 0n;
        try {
        setStatus({ kind: "work", text: attempt === 0 ? "Proving close…" : "That second passed. Proving the close again…" });
        for (let built = 0; built < 2 && !proved; built++) {
          const [markTuple, marketRow, feeBps, head] = await Promise.all([
            publicClient.readContract({
              address: addresses.oracle,
              abi: oracleAbi,
              functionName: "getPrice",
              args: [feed],
            }),
            publicClient.readContract({
              address: addresses.engine,
              abi: engineAbi,
              functionName: "markets",
              args: [pos.marketId],
            }),
            publicClient.readContract({
              address: addresses.engine,
              abi: engineAbi,
              functionName: "profitFeeBps",
            }),
            clock.head(),
          ]);

          const exitPrice = oraclePrice(markTuple);
          if (exitPrice == null || exitPrice <= 0n) {
            throw new Error("Settlement mark unavailable after sync");
          }

          const risk = marketRisk(marketRow);
          const impactBps = impactBpsFromSkew(risk.longOi, risk.shortOi, risk.impactFactorBps);
          closedAt = head.ts + CLOSE_LEAD_S;
          const candidate = await proveClose({
            engine: addresses.engine,
            ownerAddress: address,
            size: BigInt(pos.size),
            isLong: pos.isLong,
            entryPrice: BigInt(pos.entryPrice),
            leverage: BigInt(pos.leverage),
            posBlinding: BigInt(pos.posBlinding),
            fundingIndexEntry: BigInt(pos.fundingIndexEntry ?? "0"),
            marketId: pos.marketId,
            openedAt: BigInt(pos.openedAt),
            closedAt,
            exitPrice,
            fundingIndex: absIndex(risk.fundingIndexLong),
            impactBps,
            borrowRate: risk.borrowRate,
            profitFeeBps: asBig(feeBps),
          });
          const afterProve = clock.latest() ?? head;
          if (closedAt - afterProve.ts >= CLOSE_SLACK_S) proved = candidate;
        }
        if (!proved) throw new Error("Close proof was too slow. Tap Close again.");

        setStatus({ kind: "work", text: "Sending close…" });
        const closeArgs = [
          proved.proof,
          {
            positionCommitment: proved.positionCommitment,
            positionNullifier: proved.positionNullifier,
            payoutNoteCommitment: proved.payoutNoteCommitment,
            exitPrice: proved.exitPrice,
            protocolFee: proved.protocolFee,
            marketId: proved.marketId,
            collateralId: 1,
          },
        ] as const;
        const closeData = encodeFunctionData({
          abi: engineAbi,
          functionName: "close",
          args: closeArgs,
        });

        try {
          const markNow = await clock.client.readContract({
            address: addresses.oracle,
            abi: oracleAbi,
            functionName: "getPrice",
            args: [feed],
          });
          const liveExit = oraclePrice(markNow);
          if (liveExit != null && liveExit !== proved.exitPrice) {
            throw new Error("Settlement mark moved. Tap Close again.");
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Settlement mark moved")) throw e;
        }

        if (proved.leftover > 0n) {
          addNote({
            commitment: proved.payoutNoteCommitment,
            amount: proved.leftover.toString(),
            blinding: proved.payoutBlinding.toString(),
            owner: proved.owner.toString(),
            leafIndex: 0,
            spent: false,
            pending: true,
            createdAt: Date.now(),
          });
          refreshLocal();
        }

        const tick = setInterval(() => {
          const start = clock.startOf(closedAt);
          const left = start == null ? 0 : start - Date.now();
          setStatus({
            kind: "work",
            text: left > 1_500 ? `Sending in ${Math.ceil(left / 1000)}s…` : "Sending close…",
          });
        }, 250);
        let hash: `0x${string}`;
        try {
          hash = await sendTimedClose({ data: closeData, closedAt, gas: CLOSE_GAS });
        } finally {
          clearInterval(tick);
        }
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "reverted") {
          if (proved.leftover > 0n) dropPendingNote(proved.payoutNoteCommitment);
          throw new Error("Close missed the block. Tap Close again.");
        }

        if (proved.leftover > 0n) {
          try {
            await appendLeafAfterInsert(publicClient, proved.payoutNoteCommitment);
          } catch (syncErr) {
            console.warn("append payout leaf failed", syncErr);
          }
          confirmNote(proved.payoutNoteCommitment);
        }

        removePosition(pos.commitment);
        refreshLocal();
        const backed = await pushBackup();

        if (!quiet) {
          setSuccess({
            kind: "close",
            txHash: hash,
            marketId: pos.marketId,
            isLong: pos.isLong,
            leverage: pos.leverage,
            margin: pos.margin,
            size: pos.size,
            entryPrice: pos.entryPrice,
            exitPrice: proved.exitPrice.toString(),
            leftover: proved.leftover.toString(),
            protocolFee: proved.protocolFee.toString(),
          });
        }
        setStatus({
          kind: "ok",
          text:
            (proved.leftover > 0n
              ? `Closed · Live payout ${formatUsdw(formatUnits(proved.leftover, 6))} USDW — Notes → Withdraw`
              : "Closed · no payout (loss/fees consumed equity)") + backupNote(backed),
        });
        if (!quiet) setBottomTab("notes");
        return true;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const permanent = /relayer is low|not configured|Only a close|server failed/i.test(message);
          if (proved) {
            const still = await publicClient
              .readContract({
                address: addresses.engine,
                abi: engineAbi,
                functionName: "positions",
                args: [pos.commitment],
              })
              .catch(() => true);
            if (!still) {
              if (proved.leftover > 0n) {
                try {
                  await appendLeafAfterInsert(publicClient, proved.payoutNoteCommitment);
                } catch (syncErr) {
                  console.warn("append payout leaf failed", syncErr);
                }
                confirmNote(proved.payoutNoteCommitment);
              }
              removePosition(pos.commitment);
              refreshLocal();
              const backed = await pushBackup();
              setStatus({
                kind: "ok",
                text:
                  (proved.leftover > 0n
                    ? `Closed · Live payout ${formatUsdw(formatUnits(proved.leftover, 6))} USDW — Notes → Withdraw`
                    : "Closed · no payout (loss/fees consumed equity)") + backupNote(backed),
              });
              if (!quiet) setBottomTab("notes");
              return true;
            }
          }
          if (!permanent && attempt < 2) {
            if (proved && proved.leftover > 0n) dropPendingNote(proved.payoutNoteCommitment);
            continue;
          }
          throw e;
        }
        }
        return false;
      } catch (e) {
        refreshLocal();
        setStatus({ kind: "err", text: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        clock.stop();
      }
    },
    [ensureSigner, address, publicClient, refreshLocal, refreshSettlementMark, pushBackup],
  );

  const onOpen = useCallback(async () => {
    if (!market.tradable) {
      setStatus({
        kind: "err",
        text: `${market.label} is on the board for price only. BTC-PERP and ETH-PERP are the markets you can trade.`,
      });
      return;
    }
    if (!(await ensureSigner()) || !address || !publicClient) return;
    let shieldConfirmed = false;
    try {
      const noteAmount = parseUnits(sizeUsd || "0", 6);
      if (noteAmount <= 0n) throw new Error("Enter a size greater than 0");

      const reusable = await findLiveMarginNote(publicClient, noteAmount);
      let openCommitment: `0x${string}`;

      const lev = BigInt(Math.min(leverage, market.maxLeverage));
      const size = noteAmount * lev;
      if (!reusable && usdwBal !== undefined && usdwBal < noteAmount) {
        throw new Error(`Need ${formatUsdw(formatUnits(noteAmount, 6))} USDW (available ${formatUsdw(formatUnits(usdwBal, 6))})`);
      }

      // Shield proof does not need the mark. Start it while the feed check runs.
      const markReady = refreshSettlementMark(market.id);
      const shieldProof = reusable
        ? null
        : proveShield({
            vault: addresses.vault,
            amount: noteAmount,
            ownerAddress: address,
          });

      if (reusable) {
        openCommitment = reusable.commitment;
        shieldConfirmed = true;
        setStatus({ kind: "work", text: "1/3 Using shielded USDW…" });
        await markReady;
      } else {
        setStatus({ kind: "work", text: "Proving shield…" });
        const shielded = await shieldProof;
        await markReady;
        if (!shielded) throw new Error("Shield proof failed");

        const allowance = await publicClient.readContract({
          address: addresses.usdw,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, addresses.vault],
        });
        if (allowance < noteAmount) {
          setStatus({ kind: "work", text: "Approve USDW once for the vault…" });
          const ah = await writeContractAsync({
            address: addresses.usdw,
            abi: erc20Abi,
            functionName: "approve",
            args: [addresses.vault, maxUint256],
          });
          await publicClient.waitForTransactionReceipt({ hash: ah });
        }

        addNote({
          commitment: shielded.noteCommitment,
          amount: noteAmount.toString(),
          blinding: shielded.blinding.toString(),
          owner: shielded.owner.toString(),
          leafIndex: 0,
          spent: false,
          pending: true,
          createdAt: Date.now(),
        });
        refreshLocal();

        setStatus({ kind: "work", text: "Submitting shield…" });
        const shieldHash = await writeContractAsync({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "shield",
          args: [
            shielded.proof,
            {
              noteCommitment: shielded.noteCommitment,
              collateralId: 1,
              amount: noteAmount,
            },
          ],
        });
        const shieldReceipt = await publicClient.waitForTransactionReceipt({ hash: shieldHash });
        if (shieldReceipt.status === "reverted") throw new Error("Shield transaction reverted");
        shieldConfirmed = true;
        openCommitment = shielded.noteCommitment;
      }

      setStatus({
        kind: "work",
        text: "Proving open…",
      });
      await appendLeafAfterInsert(publicClient, openCommitment);
      const after = loadStore();
      const syncedNote = after.notes.find(
        (n) => n.commitment.toLowerCase() === openCommitment.toLowerCase(),
      );
      if (!syncedNote) {
        throw new Error("Shielded note missing after vault sync — retry place order");
      }
      const leaves = after.leaves;
      const idx = leaves.findIndex((c) => c.toLowerCase() === openCommitment.toLowerCase());
      if (idx < 0 || leaves[idx]?.toLowerCase() !== openCommitment.toLowerCase()) {
        throw new Error(`Note ${openCommitment.slice(0, 10)}… not in vault leaf tree`);
      }
      refreshLocal();
      await refetchUsdw();

      // open() reverts PriceMismatch unless the proof's mark equals the oracle
      // in the inclusion block. The feed keeps moving during shield and vault
      // sync, so the price has to be read after that work — immediately before
      // the proof — and the proof discarded if the feed moves again.
      let provedOpen: Awaited<ReturnType<typeof proveOpen>> | null = null;
      let lastOpenErr: unknown;

      for (let attempt = 1; attempt <= 4 && !provedOpen; attempt++) {
        const [fresh, marketRow, root, openedBlock] = await Promise.all([
          publicClient.readContract({
            address: addresses.oracle,
            abi: oracleAbi,
            functionName: "getPrice",
            args: [feedId(feed)],
          }),
          publicClient.readContract({
            address: addresses.engine,
            abi: engineAbi,
            functionName: "markets",
            args: [market.id],
          }),
          publicClient.readContract({
            address: addresses.vault,
            abi: vaultAbi,
            functionName: "currentRoot",
          }),
          publicClient.getBlock(),
        ]);
        const openMark = oraclePrice(fresh);
        if (openMark == null || openMark <= 0n) throw new Error("Mark price unavailable");
        const risk = marketRisk(marketRow);
        const impactBps = impactBpsFromSkew(risk.longOi, risk.shortOi, risk.impactFactorBps);
        const fundingIndex = absIndex(risk.fundingIndexLong);
        const openedAt = openedBlock.timestamp;

        setStatus({ kind: "work", text: "Proving open at the live mark…" });
        const proved = await proveOpen({
          engine: addresses.engine,
          ownerAddress: address,
          noteAmount,
          noteBlinding: BigInt(syncedNote.blinding),
          leafIndex: idx,
          leaves: leaves.map((c) => BigInt(c)),
          merkleRoot: root,
          size,
          isLong,
          leverage: lev,
          markPrice: openMark,
          maxLeverage: BigInt(market.maxLeverage),
          marketId: market.id,
          openedAt,
          fundingIndex,
          impactBps,
        });

        const [freshAgain, marketAgain, blockAgain] = await Promise.all([
          publicClient.readContract({
            address: addresses.oracle,
            abi: oracleAbi,
            functionName: "getPrice",
            args: [feedId(feed)],
          }),
          publicClient.readContract({
            address: addresses.engine,
            abi: engineAbi,
            functionName: "markets",
            args: [market.id],
          }),
          publicClient.getBlock(),
        ]);
        const markNow = oraclePrice(freshAgain);
        const riskNow = marketRisk(marketAgain);
        const impactNow = impactBpsFromSkew(riskNow.longOi, riskNow.shortOi, riskNow.impactFactorBps);
        const fundingNow = absIndex(riskNow.fundingIndexLong);
        const proveAge = blockAgain.timestamp - openedAt;
        if (markNow !== openMark || impactNow !== impactBps || fundingNow !== fundingIndex || proveAge > 60n) {
          lastOpenErr = new Error("Settlement mark moved. Swipe again.");
          continue;
        }
        provedOpen = proved;
      }

      if (!provedOpen) {
        throw lastOpenErr instanceof Error
          ? lastOpenErr
          : new Error("Settlement mark changed. Swipe again.");
      }

      setStatus({ kind: "work", text: "Confirm the open once." });
      const hash = await writeContractAsync({
        address: addresses.engine,
        abi: engineAbi,
        functionName: "open",
        args: [
          provedOpen.proof,
          {
            merkleRoot: provedOpen.merkleRoot,
            noteNullifier: provedOpen.noteNullifier,
            positionCommitment: provedOpen.positionCommitment,
            changeNoteCommitment: provedOpen.changeNoteCommitment,
            markPrice: provedOpen.markPrice,
            openedAt: provedOpen.openedAt,
            marketId: provedOpen.marketId,
            collateralId: 1,
          },
        ],
      });
      const openReceipt = await publicClient.waitForTransactionReceipt({ hash });
      if (openReceipt.status === "reverted") {
        throw new Error("Open missed the mark. Swipe again.");
      }
      const proved = provedOpen;

      markNoteSpent(openCommitment, "trade");
      if (proved.changeAmount > 0n) {
        addNote({
          commitment: proved.changeNoteCommitment,
          amount: proved.changeAmount.toString(),
          blinding: proved.changeBlinding.toString(),
          owner: addressToOwner(address).toString(),
          leafIndex: 0,
          spent: false,
          pending: true,
          createdAt: Date.now(),
        });
        try {
          const changeIdx = await appendLeafAfterInsert(publicClient, proved.changeNoteCommitment);
          confirmNote(proved.changeNoteCommitment, changeIdx);
        } catch {
          confirmNote(proved.changeNoteCommitment);
        }
      }
      addPosition({
        commitment: proved.positionCommitment,
        noteCommitment: openCommitment,
        marketId: market.id,
        isLong,
        leverage: Number(lev),
        size: size.toString(),
        margin: noteAmount.toString(),
        entryPrice: proved.markPrice.toString(),
        posBlinding: proved.posBlinding.toString(),
        openedAt: proved.openedAt.toString(),
        fundingIndexEntry: proved.fundingIndex.toString(),
        createdAt: Date.now(),
      });
      refreshLocal();

      try {
        await handoffPosition({
          commitment: proved.positionCommitment,
          marketId: market.id,
          isLong,
          leverage: Number(lev),
          size: size.toString(),
          entryPrice: proved.markPrice.toString(),
          posBlinding: proved.posBlinding.toString(),
          openedAt: proved.openedAt.toString(),
          owner: addressToOwner(address).toString(),
          fundingIndexEntry: proved.fundingIndex.toString(),
          collateralId: 1,
        });
      } catch {
        // Optional liquidation handoff — ignore if unset.
      }

      setStatus({
        kind: "ok",
        text: `Private ${isLong ? "long" : "short"} ${market.label} @ ${lev}x opened.`,
      });
      void pushBackup();
      setSuccess({
        kind: "open",
        txHash: hash,
        marketId: market.id,
        isLong,
        leverage: Number(lev),
        margin: noteAmount.toString(),
        size: size.toString(),
        entryPrice: proved.markPrice.toString(),
      });
      setBottomTab("positions");
    } catch (e) {
      refreshLocal();
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({
        kind: "err",
        text: shieldConfirmed
          ? `Open failed after shield — USDW is in Notes as Live. Withdraw or retry. (${msg})`
          : msg,
      });
      if (shieldConfirmed) {
        setBottomTab("notes");
        void pushBackup();
      }
    }
  }, [
    ensureSigner,
    address,
    publicClient,
    feed,
    sizeUsd,
    usdwBal,
    leverage,
    market,
    isLong,
    writeContractAsync,
    refreshLocal,
    refetchUsdw,
    refreshSettlementMark,
    pushBackup,
  ]);

  const dismissSuccess = useCallback(() => setSuccess(null), []);

  const selectMarket = useCallback((key: MarketKey) => {
    setMarketKey(key);
    setSearchParams({ market: key }, { replace: true });
    const max = markets[key].maxLeverage;
    if (max > 0) setLeverage(max);
  }, [setSearchParams]);

  return {
    address,
    isConnected: isConnected || !!address,
    /** True when a wagmi signer is ready on Robinhood testnet. */
    canSign: Boolean(walletClient || (isConnected && onRobinhood)),
    needsNetworkSwitch,
    ensureNetwork,
    onPrivyAddress,
    marketKey,
    selectMarket,
    market,
    isLong,
    setIsLong,
    leverage,
    setLeverage,
    orderType,
    setOrderType,
    sizeUsd,
    setSizeUsd,
    status,
    success,
    dismissSuccess,
    notes,
    positions,
    live,
    ethDisplay,
    usdwBal,
    usdwDisplay:
      usdwBal !== undefined
        ? formatUsdw(formatUnits(usdwBal, 6))
        : address
          ? "…"
          : "—",
    shieldedBal,
    shieldedDisplay,
    markUsd,
    markPrice,
    bottomTab,
    setBottomTab,
    onOpen,
    onClosePosition,
    onWithdraw: () => void onWithdraw(),
    onWithdrawNote: (note: LocalNote) => void onWithdraw(note),
    onDownloadNotes,
    onDownloadNote,
    refetchUsdw,
    busy: status.kind === "work",
  };
}

export type TradeDeskState = ReturnType<typeof useTradeDesk>;
