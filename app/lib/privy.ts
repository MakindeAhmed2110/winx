import { createWalletCreationOnLoginPlugin, type PrivyClientConfig, type WalletListEntry } from "@privy-io/react-auth";
import { robinhoodTestnet } from "./config";
import { shouldCreateEmbedded } from "./operating-wallet";
import { privyAppId } from "./privy-env";

export { privyAppId };

/** Featured wallets shown in the custom connect modal. */
export const FEATURED_WALLETS: {
  id: WalletListEntry;
  name: string;
}[] = [
  { id: "coinbase_wallet", name: "Coinbase" },
  { id: "okx_wallet", name: "OKX Wallet" },
  { id: "metamask", name: "MetaMask" },
  { id: "binance", name: "Binance Wallet" },
  { id: "rabby_wallet", name: "Rabby" },
  { id: "rainbow", name: "Rainbow" },
];

export const ALL_WALLET_LIST: WalletListEntry[] = [
  // EIP-6963 detected extensions (covers Rabby — Privy deprecated rabby_wallet)
  "detected_ethereum_wallets",
  "coinbase_wallet",
  "okx_wallet",
  "metamask",
  "binance",
  "rainbow",
  "zerion",
  "bybit_wallet",
  "robinhood_wallet",
  "wallet_connect",
];

const walletCreation = createWalletCreationOnLoginPlugin({
  shouldCreateWallet: ({ user }) => shouldCreateEmbedded(user),
});

export const privyConfig: PrivyClientConfig = {
  defaultChain: robinhoodTestnet,
  supportedChains: [robinhoodTestnet],
  loginMethods: ["email", "wallet"],
  appearance: {
    theme: "dark",
    accentColor: "#7a2bff",
    logo: "/logo/winx-mark.svg",
    showWalletLoginFirst: false,
    walletChainType: "ethereum-only",
    walletList: ALL_WALLET_LIST,
  },
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users",
    },
    showWalletUIs: false,
  },
  plugins: [walletCreation],
};
