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
};

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

export const markFeedPairs: MarkFeedPair[] = [
  {
    key: "btc",
    marketId: Number(import.meta.env.VITE_MARKET_BTC || 1),
    mainnet: mainnetChainlink.btcUsd,
    testnet: addresses.btcFeed,
  },
  {
    key: "eth",
    marketId: Number(import.meta.env.VITE_MARKET_ETH || 2),
    mainnet: mainnetChainlink.ethUsd,
    testnet: addresses.ethFeed,
  },
  // Future listings — set VITE_*_FEED after deploying AggregatorV3 mirrors:
  ...(
    [
      optionalMarkPair(
        "tsla",
        Number(import.meta.env.VITE_MARKET_TSLA || 3),
        mainnetChainlink.tslaUsd,
        import.meta.env.VITE_TSLA_FEED,
      ),
      optionalMarkPair(
        "nvda",
        Number(import.meta.env.VITE_MARKET_NVDA || 4),
        mainnetChainlink.nvdaUsd,
        import.meta.env.VITE_NVDA_FEED,
      ),
    ] as (MarkFeedPair | null)[]
  ).filter((p): p is MarkFeedPair => p != null),
];

export const markets = {
  btc: {
    id: Number(import.meta.env.VITE_MARKET_BTC || 1),
    maxLeverage: 40,
    label: "BTC-PERP",
    pair: "BTC-USD",
    icon: "/assets/btc.svg",
    /** Extended public book / trades market (UI only — settlement uses mainnet). */
    extendedMarket: "BTC-USD",
    priceDecimals: 0,
  },
  eth: {
    id: Number(import.meta.env.VITE_MARKET_ETH || 2),
    maxLeverage: 30,
    label: "ETH-PERP",
    pair: "ETH-USD",
    icon: "/assets/eth.svg",
    extendedMarket: "ETH-USD",
    priceDecimals: 2,
  },
} as const;

export const explorerTx = (hash: string) =>
  `${import.meta.env.VITE_EXPLORER_URL || "https://explorer.testnet.chain.robinhood.com"}/tx/${hash}`;
