import { createPublicClient, http, parseAbiItem, type PublicClient } from "viem";
import { addresses, robinhoodTestnet } from "./config";
import type { CashStep } from "./portfolio-curve";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const RANGE_DAYS: Record<string, number> = {
  "1D": 1,
  "2D": 2,
  "7D": 7,
  "2W": 14,
  "1M": 30,
  All: 14,
};

const CHUNK = 80_000n;
const MAX_BLOCKS = 700_000n;

function client(): PublicClient {
  return createPublicClient({
    chain: robinhoodTestnet,
    transport: http(robinhoodTestnet.rpcUrls.default.http[0], {
      batch: false,
      timeout: 12_000,
    }),
    cacheTime: 0,
  }) as PublicClient;
}

async function blocksPerDay(rpc: PublicClient, latestNumber: bigint, latestTime: bigint): Promise<bigint> {
  const sample = latestNumber > 4_000n ? latestNumber - 4_000n : 0n;
  const earlier = sample === latestNumber ? null : await rpc.getBlock({ blockNumber: sample });
  const dt = earlier && latestTime > earlier.timestamp ? latestTime - earlier.timestamp : 1n;
  const dn = earlier && latestNumber > earlier.number ? latestNumber - earlier.number : 1n;
  const perDay = (dn * 86_400n) / dt;
  return perDay > 1_000n ? perDay : 86_400n;
}

function isInternal(address: `0x${string}`) {
  const id = address.toLowerCase();
  return id === addresses.vault.toLowerCase() || id === addresses.engine.toLowerCase();
}

/** External USDW inflows and outflows. Shielding into the vault is not a portfolio loss. */
export async function loadPrincipalSteps(address: `0x${string}`, range: string): Promise<CashStep[]> {
  const rpc = client();
  const latest = await rpc.getBlock({ blockTag: "latest" });
  const perDay = await blocksPerDay(rpc, latest.number, latest.timestamp);
  const days = BigInt(RANGE_DAYS[range] ?? 1);
  const wanted = perDay * days;
  const span = wanted > MAX_BLOCKS ? MAX_BLOCKS : wanted;
  const fromBlock = latest.number > span ? latest.number - span : 0n;
  const blockMs = Number(86_400_000n / (perDay > 1n ? perDay : 1n));
  const timeOf = (block: bigint) => Number(latest.timestamp) * 1000 - Number(latest.number - block) * blockMs;

  const pull = async (
    args: { from?: `0x${string}`; to?: `0x${string}` },
    start: bigint,
    end: bigint,
  ): Promise<{ blockNumber: bigint; from: `0x${string}`; to: `0x${string}`; value: bigint }[]> => {
    try {
      const logs = await rpc.getLogs({
        address: addresses.usdw,
        event: transferEvent,
        args,
        fromBlock: start,
        toBlock: end,
      });
      return logs.flatMap((log) => {
        if (log.args.from == null || log.args.to == null || log.args.value == null || log.blockNumber == null) {
          return [];
        }
        return [{ blockNumber: log.blockNumber, from: log.args.from, to: log.args.to, value: log.args.value }];
      });
    } catch {
      if (end - start <= 4_000n) return [];
      const mid = start + (end - start) / 2n;
      return [...(await pull(args, start, mid)), ...(await pull(args, mid + 1n, end))];
    }
  };

  const parts: { blockNumber: bigint; from: `0x${string}`; to: `0x${string}`; value: bigint }[] = [];
  for (let cursor = fromBlock; cursor <= latest.number; ) {
    const end = cursor + CHUNK - 1n > latest.number ? latest.number : cursor + CHUNK - 1n;
    const [incoming, outgoing] = await Promise.all([
      pull({ to: address }, cursor, end),
      pull({ from: address }, cursor, end),
    ]);
    parts.push(...incoming, ...outgoing);
    if (end === latest.number) break;
    cursor = end + 1n;
  }

  const me = address.toLowerCase();
  const seen = new Set<string>();
  const steps: CashStep[] = [];
  for (const log of parts) {
    const id = `${log.blockNumber}:${log.from}:${log.to}:${log.value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const from = log.from.toLowerCase();
    const to = log.to.toLowerCase();
    const amount = Number(log.value) / 1e6;
    let delta = 0;
    if (to === me && from !== me && !isInternal(log.from)) delta += amount;
    if (from === me && to !== me && !isInternal(log.to)) delta -= amount;
    if (delta !== 0) steps.push({ t: timeOf(log.blockNumber), delta });
  }
  steps.sort((a, b) => a.t - b.t);
  return steps;
}
