import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits, parseUnits, pad, type PublicClient } from "viem";
import { erc20Abi, engineAbi, oracleAbi, vaultAbi } from "../lib/abis";
import { addresses, explorerTx, markets, robinhoodTestnet } from "../lib/config";
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
import { requestKeeperMarkSync, syncAggregatorMarks } from "../lib/syncMarks";
import type { TradeSuccess } from "../components/trade/TradeSuccessModal";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isUserRejected(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /user rejected|user denied|rejected the request|denied transaction/i.test(msg);
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
export type MarketKey = "btc" | "eth";

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
  const address = wagmiAddress ?? privyAddress;

  const [searchParams] = useSearchParams();
  const marketParam = searchParams.get("market");
  const [marketKey, setMarketKey] = useState<MarketKey>(
    marketParam === "eth" ? "eth" : "btc",
  );
  const [isLong, setIsLong] = useState(true);
  const [leverage, setLeverage] = useState(40);

  useEffect(() => {
    if (marketParam !== "btc" && marketParam !== "eth") return;
    setMarketKey(marketParam);
    setLeverage(markets[marketParam].maxLeverage);
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
  const feed = marketKey === "btc" ? addresses.btcFeed : addresses.ethFeed;

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
    query: { refetchInterval: 12_000 },
  });

  const markPrice = oraclePrice(mark) ?? undefined;
  const markUsd = markPrice != null ? Number(markPrice) / 1e8 : null;

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
    if (!walletClient && !isConnected) {
      setStatus({
        kind: "err",
        text: "Wallet can’t sign yet. Disconnect and reconnect MetaMask, then retry.",
      });
      return false;
    }
    return true;
  }, [address, publicClient, ensureNetwork, walletClient, isConnected]);

  const onWithdraw = useCallback(async (only?: LocalNote) => {
    if (!(await ensureSigner())) return;
    const toWithdraw = only
      ? liveNotes().filter(
          (n) => n.commitment.toLowerCase() === only.commitment.toLowerCase(),
        )
      : liveNotes();
    if (toWithdraw.length === 0) {
      setStatus({ kind: "err", text: "No live shielded notes to withdraw." });
      return;
    }

    try {
      const h = await createHasher();
      let withdrawn = 0n;
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
          text: `Withdraw ${i}/${toWithdraw.length}: checking nullifiers…`,
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
            `Note ${note.commitment.slice(0, 10)}… not found in vault merkle tree — cannot withdraw`,
          );
        }

        const root = await publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "currentRoot",
        });

        setStatus({
          kind: "work",
          text: `Withdraw ${i}/${toWithdraw.length}: proving unshield…`,
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
          text: `Withdraw ${i}/${toWithdraw.length}: submitting (${proved.proveMs} ms)…`,
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
        await publicClient.waitForTransactionReceipt({ hash });
        markNoteSpent(note.commitment, "withdraw");
        withdrawn += proved.amount;

        // Tree root changes after each unshield nullifier spend only — leaves stay;
        // refresh root for the next note by re-reading (no leaf rebuild needed).
      }

      refreshLocal();
      await refetchUsdw();

      if (withdrawn === 0n) {
        setStatus({
          kind: "ok",
          text: "No withdrawable notes left (already spent on-chain).",
        });
      } else {
        setStatus({
          kind: "ok",
          text: `Withdrew ${formatUsdw(formatUnits(withdrawn, 6))} USDW to wallet.`,
        });
      }
      setBottomTab("balances");
    } catch (e) {
      refreshLocal();
      setStatus({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }, [ensureSigner, writeContractAsync, refreshLocal, refetchUsdw, address, publicClient]);

  const onDownloadNotes = useCallback(() => {
    downloadNotesFile();
    setStatus({ kind: "ok", text: "Notes backup downloaded." });
  }, []);

  const onDownloadNote = useCallback((note: LocalNote) => {
    downloadSingleNote(note);
    setStatus({ kind: "ok", text: `Downloaded note ${note.commitment.slice(0, 10)}…` });
  }, []);

  /** Push live Extended (or fresh Chainlink) into the testnet Aggregator. Must succeed. */
  const refreshSettlementMark = useCallback(
    async (marketId?: number) => {
      setStatus({ kind: "work", text: "Refreshing live settlement mark…" });
      const synced = await requestKeeperMarkSync();
      if (synced) {
        await sleep(1_500);
        return;
      }
      if (!publicClient) throw new Error("RPC not ready — cannot refresh mark");
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
    async (pos: LocalPosition) => {
      if (!(await ensureSigner()) || !address || !publicClient) return;
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
          setBottomTab("notes");
          return;
        }

        await refreshSettlementMark(pos.marketId);

        const feed =
          pos.marketId === 1 ? feedId(addresses.btcFeed) : feedId(addresses.ethFeed);

        let lastErr: unknown;
        for (let attempt = 1; attempt <= 4; attempt++) {
          setStatus({
            kind: "work",
            text: `Close attempt ${attempt}/4: reading live mark + market…`,
          });
          const [markTuple, marketRow, feeBps, block] = await Promise.all([
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
            publicClient.getBlock(),
          ]);

          const exitPrice = oraclePrice(markTuple);
          if (exitPrice == null || exitPrice <= 0n) {
            throw new Error("Settlement mark unavailable after sync");
          }
          if (exitPrice === BigInt(pos.entryPrice) && attempt === 1) {
            setStatus({ kind: "work", text: "Mark still equals entry — pushing live feed again…" });
            await refreshSettlementMark(pos.marketId);
            continue;
          }

          const risk = marketRisk(marketRow);
          const impactBps = impactBpsFromSkew(risk.longOi, risk.shortOi, risk.impactFactorBps);
          // Engine packs block.timestamp as closedAt — proof must match inclusion exactly.
          const closedAt = block.timestamp + 8n;

          setStatus({
            kind: "work",
            text: `Close attempt ${attempt}/4: proving (target t=${closedAt})…`,
          });
          const proved = await proveClose({
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

          setStatus({
            kind: "work",
            text: `Close attempt ${attempt}/4: waiting for chain time ${closedAt}…`,
          });
          let submitted = false;
          for (let i = 0; i < 60; i++) {
            const b = await publicClient.getBlock();
            if (b.timestamp > closedAt) break;
            if (b.timestamp === closedAt) {
              setStatus({
                kind: "work",
                text: `Close attempt ${attempt}/4: submitting (${proved.proveMs} ms prove)…`,
              });
              try {
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

                const hash = await writeContractAsync({
                  address: addresses.engine,
                  abi: engineAbi,
                  functionName: "close",
                  args: [
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
                  ],
                });
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                if (receipt.status === "reverted") {
                  throw new Error("Close transaction reverted");
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
                setStatus({
                  kind: "ok",
                  text:
                    proved.leftover > 0n
                      ? `Closed · Live payout ${formatUsdw(formatUnits(proved.leftover, 6))} USDW — Notes → Withdraw`
                      : "Closed · no payout (loss/fees consumed equity)",
                });
                setBottomTab("notes");
                return;
              } catch (e) {
                if (proved.leftover > 0n) {
                  try {
                    const liveOnVault = await publicClient.readContract({
                      address: addresses.vault,
                      abi: vaultAbi,
                      functionName: "isLiveNote",
                      args: [proved.payoutNoteCommitment],
                    });
                    if (liveOnVault) {
                      confirmNote(proved.payoutNoteCommitment);
                      try {
                        await appendLeafAfterInsert(publicClient, proved.payoutNoteCommitment);
                      } catch {
                        // keep pending leaf index
                      }
                    } else {
                      dropPendingNote(proved.payoutNoteCommitment);
                    }
                  } catch {
                    // keep backup
                  }
                }
                lastErr = e;
                submitted = true;
                break;
              }
            }
            await sleep(500);
          }
          if (!submitted) lastErr = new Error("Missed close timestamp window — retrying");
        }
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Close failed"));
      } catch (e) {
        refreshLocal();
        setStatus({ kind: "err", text: e instanceof Error ? e.message : String(e) });
      }
    },
    [ensureSigner, address, publicClient, writeContractAsync, refreshLocal, refreshSettlementMark],
  );

  const onOpen = useCallback(async () => {
    if (!(await ensureSigner()) || !address || !publicClient) return;
    let shieldConfirmed = false;
    try {
      await refreshSettlementMark(market.id);

      const noteAmount = parseUnits(sizeUsd || "0", 6);
      if (noteAmount <= 0n) throw new Error("Enter a size greater than 0");

      const reusable = await findLiveMarginNote(publicClient, noteAmount);
      let openCommitment: `0x${string}`;

      const lev = BigInt(Math.min(leverage, market.maxLeverage));
      const size = noteAmount * lev;

      if (reusable) {
        openCommitment = reusable.commitment;
        shieldConfirmed = true;
        setStatus({ kind: "work", text: "1/3 Using shielded USDW…" });
      } else {
        if (usdwBal !== undefined && usdwBal < noteAmount) {
          throw new Error(`Need ${formatUsdw(formatUnits(noteAmount, 6))} USDW (available ${formatUsdw(formatUnits(usdwBal, 6))})`);
        }

        // --- 1) Shield margin into a private note ---
        setStatus({ kind: "work", text: "1/4 Proving shield (Groth16)…" });
        const shielded = await proveShield({
          vault: addresses.vault,
          amount: noteAmount,
          ownerAddress: address,
        });

        setStatus({ kind: "work", text: "1/4 Approving USDW…" });
        const allowance = await publicClient.readContract({
          address: addresses.usdw,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, addresses.vault],
        });
        if (allowance < noteAmount) {
          const ah = await writeContractAsync({
            address: addresses.usdw,
            abi: erc20Abi,
            functionName: "approve",
            args: [addresses.vault, noteAmount],
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

        setStatus({ kind: "work", text: "2/4 Submitting shield…" });
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

      // Rebuild the vault leaf list before proving. The new shield is already in the logs.
      setStatus({
        kind: "work",
        text: reusable ? "2/3 Syncing vault + proving open…" : "3/4 Syncing vault + proving open…",
      });
      await resyncVaultLeaves(publicClient);
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
      const openAttempts = 4;
      let opened: {
        proved: Awaited<ReturnType<typeof proveOpen>>;
        hash: `0x${string}`;
      } | null = null;
      let lastOpenErr: unknown;
      const step = reusable ? "3/3" : "4/4";

      for (let attempt = 1; attempt <= openAttempts; attempt++) {
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

        setStatus({
          kind: "work",
          text: `${step} Proving open at the live mark (attempt ${attempt}/${openAttempts})…`,
        });
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
          lastOpenErr = new Error("Settlement mark moved during the proof");
          continue;
        }

        setStatus({
          kind: "work",
          text: `${step} Submitting open (${proved.proveMs} ms prove)…`,
        });
        try {
          const hash = await writeContractAsync({
            address: addresses.engine,
            abi: engineAbi,
            functionName: "open",
            args: [
              proved.proof,
              {
                merkleRoot: proved.merkleRoot,
                noteNullifier: proved.noteNullifier,
                positionCommitment: proved.positionCommitment,
                changeNoteCommitment: proved.changeNoteCommitment,
                markPrice: proved.markPrice,
                openedAt: proved.openedAt,
                marketId: proved.marketId,
                collateralId: 1,
              },
            ],
          });
          const openReceipt = await publicClient.waitForTransactionReceipt({ hash });
          if (openReceipt.status === "reverted") {
            lastOpenErr = new Error("Open transaction reverted");
            continue;
          }
          opened = { proved, hash };
          break;
        } catch (e) {
          if (isUserRejected(e)) throw e;
          lastOpenErr = e;
        }
      }

      if (!opened) {
        throw lastOpenErr instanceof Error
          ? lastOpenErr
          : new Error("Settlement mark changed before the open was included");
      }
      const { proved, hash } = opened;

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
        text: `Private ${isLong ? "long" : "short"} ${market.label} @ ${lev}x opened`,
      });
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
      if (shieldConfirmed) setBottomTab("notes");
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
  ]);

  const dismissSuccess = useCallback(() => setSuccess(null), []);

  const selectMarket = useCallback((key: MarketKey) => {
    setMarketKey(key);
    setLeverage(markets[key].maxLeverage);
  }, []);

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
