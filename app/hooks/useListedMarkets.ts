import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { engineAbi } from "../lib/abis";
import { addresses, robinhoodTestnet } from "../lib/config";
import { marketCatalog, type ListedMarket } from "../lib/markets-board";

function readField(row: unknown, name: string, index: number): unknown {
  if (row && typeof row === "object" && name in row) {
    return (row as Record<string, unknown>)[name];
  }
  return Array.isArray(row) ? row[index] : undefined;
}

/** Markets the perp engine currently has listed. Unlisted catalog rows stay hidden. */
export function useListedMarkets() {
  const publicClient = usePublicClient({ chainId: robinhoodTestnet.id });
  const [markets, setMarkets] = useState<ListedMarket[] | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;

    const load = async () => {
      const catalog = marketCatalog();
      const reads = await Promise.all(
        catalog.map(async (market) => {
          if (!market.tradable) return { market, row: null, ok: false as const, skip: true as const };
          try {
            const row = await publicClient.readContract({
              address: addresses.engine,
              abi: engineAbi,
              functionName: "markets",
              args: [market.id],
            });
            return { market, row, ok: true as const, skip: false as const };
          } catch {
            return { market, row: null, ok: false as const, skip: false as const };
          }
        }),
      );
      if (cancelled) return;
      const checked = reads.filter((read) => !read.skip);
      const anyOk = checked.some((read) => read.ok);
      if (!anyOk) {
        setMarkets(catalog);
        return;
      }
      setMarkets(
        reads.flatMap((read) => {
          if (read.skip) return [read.market];
          if (!read.ok || !readField(read.row, "listed", 3)) return [];
          const maxLeverage = Number(readField(read.row, "maxLeverage", 1));
          return [
            {
              ...read.market,
              maxLeverage:
                Number.isFinite(maxLeverage) && maxLeverage > 0
                  ? maxLeverage
                  : read.market.maxLeverage,
            },
          ];
        }),
      );
    };

    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [publicClient]);

  return markets;
}
