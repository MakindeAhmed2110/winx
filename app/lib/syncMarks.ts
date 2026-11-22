import { createPublicClient, http } from "viem";
import { markFeedPairs, type MarkFeedPair } from "./config";

const feedAbi = [
  {
    type: "function",
    name: "setAnswer",
    stateMutability: "nonpayable",
    inputs: [{ name: "answer", type: "int256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

/** Prefer live Extended; RH Chainlink is often hours-stale (heartbeat). */
const EXTENDED_BY_KEY: Record<string, string> = {
  btc: "BTC-USD",
  eth: "ETH-USD",
  tsla: "TSLA-USD",
  nvda: "NVDA-USD",
};

const MAINNET_RPC =
  (import.meta.env.VITE_MAINNET_RPC_URL as string | undefined) ||
  "https://rpc.mainnet.chain.robinhood.com";

/** Chainlink older than this → treat as stale, use Extended instead. */
const CHAINLINK_MAX_AGE_S = 120n;

function mainnetRpcUrl(): string {
  // Same-origin proxy. Vite rewrites it in dev; vercel.json rewrites it in production.
  // A direct browser call to the mainnet RPC is blocked by CORS.
  if (typeof window !== "undefined") {
    return `${window.location.origin}/rh-mainnet`;
  }
  return MAINNET_RPC;
}

function toAnswer1e8(usd: number): bigint {
  return BigInt(Math.round(usd * 1e8));
}

async function extendedAnswer(market: string): Promise<bigint> {
  const res = await fetch(
    `/extended/api/v1/info/markets?market=${encodeURIComponent(market)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Extended HTTP ${res.status}`);
  const body = (await res.json()) as {
    status?: string;
    data?: { marketStats?: Record<string, string | number> }[];
  };
  const stats = body.data?.[0]?.marketStats;
  const mark = Number(stats?.markPrice ?? stats?.indexPrice ?? 0);
  if (!Number.isFinite(mark) || mark <= 0) throw new Error(`No Extended mark for ${market}`);
  return toAnswer1e8(mark);
}

async function mainnetAnswerIfFresh(mainnetFeed: `0x${string}`): Promise<bigint | null> {
  try {
    const client = createPublicClient({ transport: http(mainnetRpcUrl()) });
    const round = await client.readContract({
      address: mainnetFeed,
      abi: feedAbi,
      functionName: "latestRoundData",
    });
    const answer = BigInt(Array.isArray(round) ? round[1] : round.answer);
    const updatedAt = BigInt(Array.isArray(round) ? round[3] : round.updatedAt);
    if (answer <= 0n) return null;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now - updatedAt > CHAINLINK_MAX_AGE_S) return null;
    return answer;
  } catch {
    return null;
  }
}

/** Live settlement answer: fresh mainnet Chainlink, else Extended. */
async function liveAnswer(pair: MarkFeedPair): Promise<bigint> {
  const fromCl = await mainnetAnswerIfFresh(pair.mainnet);
  if (fromCl != null) return fromCl;
  const extMarket = EXTENDED_BY_KEY[pair.key];
  if (!extMarket) throw new Error(`no live source for ${pair.key}`);
  return extendedAnswer(extMarket);
}

type WriteFn = (args: {
  address: `0x${string}`;
  abi: typeof feedAbi;
  functionName: "setAnswer";
  args: [bigint];
}) => Promise<`0x${string}`>;

type WaitFn = (args: { hash: `0x${string}` }) => Promise<unknown>;

type ReadFn = (args: {
  address: `0x${string}`;
  abi: typeof feedAbi;
  functionName: "latestRoundData";
}) => Promise<readonly [bigint, bigint, bigint, bigint, bigint] | { answer: bigint; updatedAt: bigint }>;

function pairsForMarket(marketId?: number): MarkFeedPair[] {
  if (marketId == null) return markFeedPairs;
  return markFeedPairs.filter((p) => p.marketId === marketId);
}

/**
 * Push a live mark into testnet AggregatorV3 before open/close.
 * Uses Robinhood mainnet Chainlink when fresh (&lt;2m), otherwise Extended
 * so settlement isn't frozen on a heartbeat-stale answer.
 */
export async function syncAggregatorMarks(args: {
  writeContractAsync: WriteFn;
  waitForTx: WaitFn;
  readContract: ReadFn;
  marketId?: number;
}): Promise<Record<string, bigint>> {
  const pairs = pairsForMarket(args.marketId);
  if (pairs.length === 0) return {};

  const out: Record<string, bigint> = {};
  const now = BigInt(Math.floor(Date.now() / 1000));

  for (const pair of pairs) {
    const next = await liveAnswer(pair);
    let current: bigint | null = null;
    let updatedAt = 0n;
    try {
      const round = await args.readContract({
        address: pair.testnet,
        abi: feedAbi,
        functionName: "latestRoundData",
      });
      if (Array.isArray(round)) {
        current = round[1];
        updatedAt = round[3];
      } else {
        current = round.answer;
        updatedAt = round.updatedAt;
      }
    } catch {
      current = null;
    }

    // Always push unless the aggregator already matches this live print
    // and is fresh enough for engine maxPriceAge (60s).
    const age = current != null ? now - updatedAt : 999999n;
    if (current != null && current === next && age < 20n) {
      out[pair.key] = current;
      continue;
    }

    const hash = await args.writeContractAsync({
      address: pair.testnet,
      abi: feedAbi,
      functionName: "setAnswer",
      args: [next],
    });
    await args.waitForTx({ hash });
    out[pair.key] = next;
  }

  return out;
}

/** Live 1e8 mark used for UI + settlement (Extended if Chainlink is stale). */
export async function fetchLiveAnswer1e8(marketId: number): Promise<bigint> {
  const pair = markFeedPairs.find((p) => p.marketId === marketId);
  if (!pair) throw new Error(`No mark feed pair for market ${marketId}`);
  return liveAnswer(pair);
}

export async function requestKeeperMarkSync(): Promise<boolean> {
  const url = import.meta.env.VITE_KEEPER_URL as string | undefined;
  const token = import.meta.env.VITE_KEEPER_TOKEN as string | undefined;
  if (!url || !token) return false;
  try {
    const res = await fetch(new URL("/sync-marks", url), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
