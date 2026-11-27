import { defineChain } from "viem";

export const robinhoodTestnet = defineChain({
  id: Number(import.meta.env.VITE_CHAIN_ID || 46630),
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL || "https://rpc.testnet.chain.robinhood.com/rpc"] },
  },
  blockExplorers: {
    default: {
      name: "Explorer",
      url: import.meta.env.VITE_EXPLORER_URL || "https://explorer.testnet.chain.robinhood.com",
    },
  },
});

export const addresses = {
  usdw: (import.meta.env.VITE_USDW || "0x5A3a75B1Fa0113B81f178bc918cf1f5646dCa6f8") as `0x${string}`,
  swap: (import.meta.env.VITE_SWAP || "0x4dd437B807Dd2b4587926A60bED59A58F7Dd22A0") as `0x${string}`,
  vault: (import.meta.env.VITE_VAULT || "0x9eD997082Ce5d49568E5285dB81239d67295124b") as `0x${string}`,
  engine: (import.meta.env.VITE_ENGINE || "0x5135288399BCdDa309A5299244c46958477B7d91") as `0x${string}`,
  oracle: (import.meta.env.VITE_ORACLE || "0x59f63f4499A5136B53dB4Bdb83d11DFa9b303D8B") as `0x${string}`,
  // Testnet AggregatorV3 mirrors of Robinhood mainnet Chainlink feeds
  btcFeed: (import.meta.env.VITE_BTC_FEED || "0x104D9Fd02A550496cB35137D8333172b6CC5E77A") as `0x${string}`,
  ethFeed: (import.meta.env.VITE_ETH_FEED || "0x380a51874789e4d1362c07ecB27BE7FC3D040F38") as `0x${string}`,
};

/** Robinhood mainnet Chainlink proxies (docs.robinhood.com/chain/oracles-and-price-feeds). */
export const mainnetChainlink = {
  btcUsd: (import.meta.env.VITE_CHAINLINK_BTC_USD ||
    "0xa2c5184bF03d373Dc9dE4876eb4Bce595B460251") as `0x${string}`,
  ethUsd: (import.meta.env.VITE_CHAINLINK_ETH_USD ||
    "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9") as `0x${string}`,
  tslaUsd: (import.meta.env.VITE_CHAINLINK_TSLA_USD ||
    "0x4A1166a659A55625345e9515b32adECea5547C38") as `0x${string}`,
  nvdaUsd: (import.meta.env.VITE_CHAINLINK_NVDA_USD ||
    "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15") as `0x${string}`,
};

/**
 * Settlement mark pairs: mainnet Chainlink → testnet AggregatorV3.
 * Add a row (+ deploy Aggregator + listMarket) when listing a new asset.
 */
export type MarkFeedPair = {
  key: string;
  marketId: number;
  mainnet: `0x${string}`;
  testnet: `0x${string}`;
  extended?: string;
  rh?: string;
};

function marketId(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function optionalMarkPair(
  key: string,
  marketId: number,
  mainnet: `0x${string}`,
  testnetEnv: string | undefined,
): MarkFeedPair | null {
  const testnet = (testnetEnv || "").trim() as `0x${string}`;
  if (!testnet || !/^0x[a-fA-F0-9]{40}$/.test(testnet)) return null;
  return { key, marketId, mainnet, testnet };
}

const listedMarkPairs: MarkFeedPair[] = [
  {
    key: "btc",
    marketId: marketId(import.meta.env.VITE_MARKET_BTC, 1),
    mainnet: mainnetChainlink.btcUsd,
    testnet: addresses.btcFeed,
  },
  {
    key: "eth",
    marketId: marketId(import.meta.env.VITE_MARKET_ETH, 2),
    mainnet: mainnetChainlink.ethUsd,
    testnet: addresses.ethFeed,
  },
  // Future listings — set VITE_*_FEED after deploying AggregatorV3 mirrors:
  ...(
    [
      optionalMarkPair(
        "tsla",
        marketId(import.meta.env.VITE_MARKET_TSLA, 16),
        mainnetChainlink.tslaUsd,
        import.meta.env.VITE_TSLA_FEED,
      ),
      optionalMarkPair(
        "nvda",
        marketId(import.meta.env.VITE_MARKET_NVDA, 11),
        mainnetChainlink.nvdaUsd,
        import.meta.env.VITE_NVDA_FEED,
      ),
    ] as (MarkFeedPair | null)[]
  ).filter((p): p is MarkFeedPair => p != null),
];

/** Extended public books. TTEQ is not listed there. */
const STOCK_BOOKS: Record<string, string> = {
  NVDA: "NVDA_24_5-USD",
  SPCX: "SPCX-USD",
  META: "META_24_5-USD",
  COIN: "COIN_24_5-USD",
  TSLA: "TSLA_24_5-USD",
  GOOGL: "GOOGL-USD",
  AAPL: "AAPL_24_5-USD",
  ANT: "ANTHROP-USD",
};

/**
 * Every row settles on the engine. BTC and ETH keep their original feeds.
 * The rest were listed with their own AggregatorV3 mirrors.
 */
export const markets = {
  btc: {
    id: marketId(import.meta.env.VITE_MARKET_BTC, 1),
    tradable: true,
    category: "crypto" as const,
    cmcId: 1,
    maxLeverage: 40,
    label: "BTC-PERP",
    pair: "BTC-USD",
    icon: "/assets/btc.svg",
    /** Extended public book / trades market. Settlement uses the testnet feed. */
    extendedMarket: "BTC-USD",
    book: "BTC-USD",
    priceDecimals: 0,
    feed: addresses.btcFeed,
    tv: "BINANCE:BTCUSDT",
    rh: "",
  },
  eth: {
    id: marketId(import.meta.env.VITE_MARKET_ETH, 2),
    tradable: true,
    category: "crypto" as const,
    cmcId: 1027,
    maxLeverage: 30,
    label: "ETH-PERP",
    pair: "ETH-USD",
    icon: "/assets/eth.svg",
    extendedMarket: "ETH-USD",
    book: "ETH-USD",
    priceDecimals: 2,
    feed: addresses.ethFeed,
    tv: "BINANCE:ETHUSDT",
    rh: "",
  },
  ant: stock(marketId(import.meta.env.VITE_MARKET_ANT, 19), "ANT", "0xb2508c331fac13f0afeefdaa7f5f247088c7e09e", "", 42896, 50),
  bnb: listed({
    id: marketId(import.meta.env.VITE_MARKET_BNB, 3),
    lev: 40,
    cmcId: 1839,
    category: "crypto",
    label: "BNB-PERP",
    pair: "BNB-USD",
    decimals: 2,
    icon: "/assets/bnb.png",
    extended: "BNB-USD",
    feed: "0xf102995e7c8a734afb233695ae2f087cd3592673",
    tv: "BINANCE:BNBUSDT",
  }),
  xrp: listed({
    id: marketId(import.meta.env.VITE_MARKET_XRP, 4),
    lev: 30,
    cmcId: 52,
    category: "crypto",
    label: "XRP-PERP",
    pair: "XRP-USD",
    decimals: 4,
    icon: "/assets/xrp.png",
    extended: "XRP-USD",
    feed: "0xe20eaa6c23ad12b6098419a47cd8d3fb33074e8a",
    tv: "BINANCE:XRPUSDT",
  }),
  sol: listed({
    id: marketId(import.meta.env.VITE_MARKET_SOL, 5),
    lev: 50,
    cmcId: 5426,
    category: "crypto",
    label: "SOL-PERP",
    pair: "SOL-USD",
    decimals: 2,
    icon: "/assets/sol.png",
    extended: "SOL-USD",
    feed: "0x484a3059926254d6530fa081ea36eb6b9aba9a37",
    tv: "BINANCE:SOLUSDT",
  }),
  trx: listed({
    id: marketId(import.meta.env.VITE_MARKET_TRX, 6),
    lev: 30,
    cmcId: 1958,
    category: "crypto",
    label: "TRX-PERP",
    pair: "TRX-USD",
    decimals: 4,
    icon: "/assets/trx.png",
    extended: "TRX-USD",
    feed: "0xb30f901585c963bb14b1b396f530344fca357608",
    tv: "BINANCE:TRXUSDT",
  }),
  hype: listed({
    id: marketId(import.meta.env.VITE_MARKET_HYPE, 7),
    lev: 30,
    cmcId: 32196,
    category: "crypto",
    label: "HYPE-PERP",
    pair: "HYPE-USD",
    decimals: 2,
    icon: "/assets/hype.png",
    extended: "HYPE-USD",
    feed: "0xa68974da343520dd9154c41c62a5f4fd088eb91c",
    tv: "BINANCE:HYPEUSDT",
  }),
  zec: listed({
    id: marketId(import.meta.env.VITE_MARKET_ZEC, 8),
    lev: 30,
    cmcId: 1437,
    category: "crypto",
    label: "ZEC-PERP",
    pair: "ZEC-USD",
    decimals: 2,
    icon: "/assets/zec.png",
    extended: "ZEC-USD",
    feed: "0x2b6a9e3885ae9ed4ff3462ad970b960588be5a21",
    tv: "BINANCE:ZECUSDT",
  }),
  xmr: listed({
    id: marketId(import.meta.env.VITE_MARKET_XMR, 9),
    lev: 30,
    cmcId: 328,
    category: "crypto",
    label: "XMR-PERP",
    pair: "XMR-USD",
    decimals: 2,
    icon: "/assets/xmr.png",
    extended: "XMR-USD",
    feed: "0xd00dcb8212f6645facdef9b6d410e5430f01f23e",
    tv: "KUCOIN:XMRUSDT",
  }),
  doge: listed({
    id: marketId(import.meta.env.VITE_MARKET_DOGE, 10),
    lev: 30,
    cmcId: 74,
    category: "crypto",
    label: "DOGE-PERP",
    pair: "DOGE-USD",
    decimals: 5,
    icon: "/assets/doge.png",
    extended: "DOGE-USD",
    feed: "0xda60fb0fdf6879e62d342e77e6400804ca06f124",
    tv: "BINANCE:DOGEUSDT",
  }),
  nvda: stock(marketId(import.meta.env.VITE_MARKET_NVDA, 11), "NVDA", "0x0b009227430f1a2cebcae5c6394c6c1cdecf4dc6", "NASDAQ:NVDA", 40685),
  spcx: stock(marketId(import.meta.env.VITE_MARKET_SPCX, 12), "SPCX", "0x351893c0d4452fddeae372eaf19c08f80650cef6", "", 37068),
  meta: stock(marketId(import.meta.env.VITE_MARKET_META, 13), "META", "0xff00ae8921c1c0767daa60d4a9e992530d2808e4", "NASDAQ:META", 40780),
  coin: stock(marketId(import.meta.env.VITE_MARKET_COIN, 14), "COIN", "0x17bdb6f1708bc16c80b98e9b0b6bd13a5877566e", "NASDAQ:COIN", 40722),
  tteq: stock(marketId(import.meta.env.VITE_MARKET_TTEQ, 15), "TTEQ", "0xd7f166698ea8385962aa166250fcd2198ab51698", "NASDAQ:TTEQ", 0),
  tsla: stock(marketId(import.meta.env.VITE_MARKET_TSLA, 16), "TSLA", "0x2b340256d6fedb5179ad27f8bed87524cf744279", "NASDAQ:TSLA", 40691),
  googl: stock(marketId(import.meta.env.VITE_MARKET_GOOGL, 17), "GOOGL", "0x18960eb5c718ae39bd1ded471ddedb22d4a28313", "NASDAQ:GOOGL", 40757),
  aapl: stock(marketId(import.meta.env.VITE_MARKET_AAPL, 18), "AAPL", "0xd0cab71210f7f74fba56200b68240153e804edf2", "NASDAQ:AAPL", 40703),
} as const;

function listed(args: {
  id: number;
  lev: number;
  cmcId: number;
  category: "crypto" | "equities";
  label: string;
  pair: string;
  decimals: number;
  icon: string;
  extended: string;
  feed: `0x${string}`;
  tv: string;
  rh?: string;
  book?: string;
}) {
  return {
    id: args.id,
    tradable: true,
    category: args.category,
    cmcId: args.cmcId,
    maxLeverage: args.lev,
    label: args.label,
    pair: args.pair,
    icon: args.icon,
    extendedMarket: args.extended,
    priceDecimals: args.decimals,
    feed: args.feed,
    tv: args.tv,
    rh: args.rh ?? "",
    /** Public book venue. Stocks keep an empty extendedMarket so quotes stay on Robinhood. */
    book: args.book ?? args.extended,
  };
}

function stock(id: number, symbol: string, feed: `0x${string}`, tv: string, cmcId: number, lev = 10) {
  return listed({
    id,
    lev,
    cmcId,
    category: "equities",
    label: `${symbol}-PERP`,
    pair: `${symbol}-USD`,
    decimals: 2,
    icon: `/assets/stocks/${symbol.toLowerCase()}.${symbol === "TTEQ" ? "svg" : "png"}`,
    extended: "",
    feed,
    tv,
    rh: symbol,
    book: STOCK_BOOKS[symbol] ?? "",
  });
}

const ZERO_FEED = "0x0000000000000000000000000000000000000000" as const;

export const markFeedPairs: MarkFeedPair[] = [
  ...listedMarkPairs,
  ...((Object.entries(markets) as [string, (typeof markets)[MarketKey]][]) 
    .filter(([, market]) => market.id > 2)
    .map(([key, market]) => ({
      key,
      marketId: market.id,
      mainnet: ZERO_FEED,
      testnet: market.feed,
      extended: market.extendedMarket || undefined,
      rh: market.rh || undefined,
    }))),
];

export type MarketKey = keyof typeof markets;

export function marketById(marketId: number) {
  return (Object.values(markets) as (typeof markets)[MarketKey][]).find(
    (market) => market.id === marketId,
  );
}

export function feedForMarketId(marketId: number): `0x${string}` {
  return marketById(marketId)?.feed ?? addresses.btcFeed;
}

export const explorerTx = (hash: string) =>
  `${import.meta.env.VITE_EXPLORER_URL || "https://explorer.testnet.chain.robinhood.com"}/tx/${hash}`;
