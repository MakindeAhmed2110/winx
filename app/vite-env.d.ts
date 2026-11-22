/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_RPC_URL: string;
  readonly VITE_EXPLORER_URL: string;
  readonly VITE_USDW: string;
  readonly VITE_SWAP: string;
  readonly VITE_VAULT: string;
  readonly VITE_ENGINE: string;
  readonly VITE_ORACLE: string;
  readonly VITE_BTC_FEED: string;
  readonly VITE_ETH_FEED: string;
  readonly VITE_TSLA_FEED?: string;
  readonly VITE_NVDA_FEED?: string;
  readonly VITE_MARKET_BTC: string;
  readonly VITE_MARKET_ETH: string;
  readonly VITE_MARKET_TSLA?: string;
  readonly VITE_MARKET_NVDA?: string;
  readonly VITE_MAINNET_RPC_URL?: string;
  readonly VITE_CHAINLINK_BTC_USD?: string;
  readonly VITE_CHAINLINK_ETH_USD?: string;
  readonly VITE_CHAINLINK_TSLA_USD?: string;
  readonly VITE_CHAINLINK_NVDA_USD?: string;
  readonly VITE_KEEPER_URL?: string;
  readonly VITE_KEEPER_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
