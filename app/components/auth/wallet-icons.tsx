import type { WalletListEntry } from "@privy-io/react-auth";

const WALLET_LOGOS: Partial<Record<WalletListEntry, string>> = {
  metamask: "/wallets/metamask.png",
  coinbase_wallet: "/wallets/coinbase.png",
  okx_wallet: "/wallets/okx.png",
  binance: "/wallets/binance.png",
  rabby_wallet: "/wallets/rabby.png",
  rainbow: "/wallets/rainbow.png",
  wallet_connect: "/wallets/walletconnect.png",
};

export function WalletBrandIcon({
  id,
  className = "h-9 w-9 shrink-0 rounded-[10px] object-cover",
}: {
  id: WalletListEntry;
  className?: string;
}) {
  const src = WALLET_LOGOS[id] ?? "/wallets/walletconnect.png";
  return (
    <img
      src={src}
      alt=""
      width={36}
      height={36}
      className={className}
      draggable={false}
    />
  );
}
