import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withFaucetSenderLock } from "./faucet.server.ts";
import { loadFaucetPrivateKey } from "./faucet-key.ts";

const RPC =
  process.env.VITE_RPC_URL ||
  process.env.RPC_URL ||
  "https://rpc.testnet.chain.robinhood.com/rpc";
const MAINNET_RPC =
  process.env.MAINNET_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const EXTENDED_API =
  process.env.EXTENDED_API_URL || "https://api.starknet.extended.exchange/api/v1";
const CHAINLINK_MAX_AGE_S = 120n;
const FRESH_S = 30n;

type Pair = {
  marketId: number;
  testnet: `0x${string}`;
  extended?: string;
  rh?: string;
  mainnet?: `0x${string}`;
};

/** Feeds the owner key is allowed to update. Prices are fetched here, never from the browser. */
const PAIRS: Pair[] = [
  {
    marketId: 1,
    extended: "BTC-USD",
    mainnet: "0xa2c5184bF03d373Dc9dE4876eb4Bce595B460251",
    testnet: "0x104D9Fd02A550496cB35137D8333172b6CC5E77A",
  },
  {
    marketId: 2,
    extended: "ETH-USD",
    mainnet: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
    testnet: "0x380a51874789e4d1362c07ecB27BE7FC3D040F38",
  },
  { marketId: 3, extended: "BNB-USD", testnet: "0xf102995e7c8a734afb233695ae2f087cd3592673" },
  { marketId: 4, extended: "XRP-USD", testnet: "0xe20eaa6c23ad12b6098419a47cd8d3fb33074e8a" },
  { marketId: 5, extended: "SOL-USD", testnet: "0x484a3059926254d6530fa081ea36eb6b9aba9a37" },
  { marketId: 6, extended: "TRX-USD", testnet: "0xb30f901585c963bb14b1b396f530344fca357608" },
  { marketId: 7, extended: "HYPE-USD", testnet: "0xa68974da343520dd9154c41c62a5f4fd088eb91c" },
  { marketId: 8, extended: "ZEC-USD", testnet: "0x2b6a9e3885ae9ed4ff3462ad970b960588be5a21" },
  { marketId: 9, extended: "XMR-USD", testnet: "0xd00dcb8212f6645facdef9b6d410e5430f01f23e" },
  { marketId: 10, extended: "DOGE-USD", testnet: "0xda60fb0fdf6879e62d342e77e6400804ca06f124" },
  { marketId: 11, rh: "NVDA", testnet: "0x0b009227430f1a2cebcae5c6394c6c1cdecf4dc6" },
  { marketId: 12, rh: "SPCX", testnet: "0x351893c0d4452fddeae372eaf19c08f80650cef6" },
  { marketId: 13, rh: "META", testnet: "0xff00ae8921c1c0767daa60d4a9e992530d2808e4" },
  { marketId: 14, rh: "COIN", testnet: "0x17bdb6f1708bc16c80b98e9b0b6bd13a5877566e" },
  { marketId: 15, rh: "TTEQ", testnet: "0xd7f166698ea8385962aa166250fcd2198ab51698" },
  { marketId: 16, rh: "TSLA", testnet: "0x2b340256d6fedb5179ad27f8bed87524cf744279" },
  { marketId: 17, rh: "GOOGL", testnet: "0x18960eb5c718ae39bd1ded471ddedb22d4a28313" },
  { marketId: 18, rh: "AAPL", testnet: "0xd0cab71210f7f74fba56200b68240153e804edf2" },
  { marketId: 19, rh: "ANT", testnet: "0xb2508c331fac13f0afeefdaa7f5f247088c7e09e" },
];

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

function chainOf(rpc: string) {
  return defineChain({
    id: Number(process.env.VITE_CHAIN_ID || process.env.CHAIN_ID || 46630),
    name: "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
}

function clientFor(rpc: string): PublicClient {
  return createPublicClient({
    chain: chainOf(rpc),
    transport: http(rpc, { batch: false, timeout: 8_000 }),
  });
}

async function mainnetAnswerIfFresh(feed: `0x${string}`): Promise<bigint | null> {
  try {
    const client = createPublicClient({ transport: http(MAINNET_RPC, { timeout: 8_000 }) });
    const round = await client.readContract({
      address: feed,
      abi: feedAbi,
      functionName: "latestRoundData",
    });
    const answer = BigInt(round[1]);
    const updatedAt = BigInt(round[3]);
    if (answer <= 0n) return null;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now - updatedAt > CHAINLINK_MAX_AGE_S) return null;
    return answer;
  } catch {
    return null;
  }
}

async function extendedAnswer(market: string): Promise<bigint> {
  const res = await fetch(`${EXTENDED_API}/info/markets?market=${encodeURIComponent(market)}`);
  if (!res.ok) throw new Error(`Extended HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: { marketStats?: { markPrice?: string | number } }[];
  };
  const mark = Number(body.data?.[0]?.marketStats?.markPrice ?? 0);
  if (!Number.isFinite(mark) || mark <= 0) throw new Error(`No live mark for ${market}`);
  return BigInt(Math.round(mark * 1e8));
}

async function robinhoodAnswer(symbol: string): Promise<bigint> {
  const res = await fetch(`https://api.robinhood.com/rhj/prices/${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`Robinhood HTTP ${res.status}`);
  const body = (await res.json()) as {
    quotes?: { tokenBid?: string; tokenAsk?: string }[];
  };
  const quote = body.quotes?.[0];
  const bid = Number(quote?.tokenBid);
  const ask = Number(quote?.tokenAsk);
  const mid = (bid + ask) / 2;
  if (!Number.isFinite(mid) || mid <= 0) throw new Error(`No Robinhood mark for ${symbol}`);
  return BigInt(Math.round(mid * 1e8));
}

async function liveAnswer(pair: Pair): Promise<bigint> {
  if (pair.rh) return robinhoodAnswer(pair.rh);
  if (pair.mainnet) {
    const fromCl = await mainnetAnswerIfFresh(pair.mainnet);
    if (fromCl != null) return fromCl;
  }
  if (!pair.extended) throw new Error("No live price source");
  return extendedAnswer(pair.extended);
}

/**
 * Publish one market's live mark with the feed owner key.
 * The trading wallet cannot call setAnswer, so opens were reverting on new markets.
 */
export async function refreshOwnedMark(marketId: number) {
  const pair = PAIRS.find((row) => row.marketId === marketId);
  if (!pair) throw new Error("Unknown market");
  const key = loadFaucetPrivateKey();
  if (!key) throw new Error("Mark relayer is not configured");
  const account = privateKeyToAccount(key);
  const publicClient = clientFor(RPC);
  const chain = chainOf(RPC);

  const round = await publicClient.readContract({
    address: pair.testnet,
    abi: feedAbi,
    functionName: "latestRoundData",
  });
  const current = BigInt(round[1]);
  const updatedAt = BigInt(round[3]);
  const block = await publicClient.getBlock();
  if (current > 0n && block.timestamp - updatedAt < FRESH_S) {
    return { ok: true as const, skipped: true, answer: current.toString(), updatedAt: updatedAt.toString() };
  }

  const next = await liveAnswer(pair);
  const base = block.baseFeePerGas ?? 0n;
  const maxPriorityFeePerGas = 1_000_000_000n;
  const maxFeePerGas = base + 2_000_000_000n;

  const hash = await withFaucetSenderLock(async () => {
    const wallet = createWalletClient({
      account,
      chain,
      transport: http(RPC, { batch: false, timeout: 8_000 }),
    });
    const [pending, latest] = await Promise.all([
      publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
      publicClient.getTransactionCount({ address: account.address, blockTag: "latest" }),
    ]);
    let nonce = BigInt(pending > latest ? pending : latest);
    const tx = {
      account,
      address: pair.testnet,
      abi: feedAbi,
      functionName: "setAnswer" as const,
      args: [next] as const,
      gas: 400_000n,
      maxPriorityFeePerGas,
      maxFeePerGas,
    };
    try {
      return await wallet.writeContract({ ...tx, nonce });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/nonce too low/i.test(message)) throw error;
      const stated = message.match(/state:\s*(\d+)/);
      const bumped = stated ? BigInt(stated[1]) : nonce + 1n;
      const again = BigInt(
        await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        }),
      );
      nonce = bumped > again ? bumped : again > nonce ? again : nonce + 1n;
      return wallet.writeContract({ ...tx, nonce });
    }
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 });
  if (receipt.status !== "success") throw new Error("Mark update reverted");
  return { ok: true as const, skipped: false, answer: next.toString(), hash };
}
