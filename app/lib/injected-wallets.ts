import type { WalletListEntry } from "@privy-io/react-auth";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isOkxWallet?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: Eip1193Provider[];
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: Eip1193Provider;
};

const INJECTED_HINTS: Partial<
  Record<
    WalletListEntry,
    { rdns: string[]; names: string[]; flag?: keyof Eip1193Provider }
  >
> = {
  metamask: {
    rdns: ["io.metamask", "io.metamask.flask"],
    names: ["metamask"],
    flag: "isMetaMask",
  },
  rabby_wallet: {
    rdns: ["io.rabby"],
    names: ["rabby"],
    flag: "isRabby",
  },
  okx_wallet: {
    rdns: ["com.okex.wallet"],
    names: ["okx"],
    flag: "isOkxWallet",
  },
  coinbase_wallet: {
    rdns: ["com.coinbase.wallet"],
    names: ["coinbase"],
    flag: "isCoinbaseWallet",
  },
  rainbow: {
    rdns: ["me.rainbow"],
    names: ["rainbow"],
  },
  binance: {
    rdns: ["com.binance.wallet"],
    names: ["binance"],
  },
};

/** Keep announced providers across clicks (EIP-6963 is event-based). */
const announced = new Map<string, Eip6963ProviderDetail>();
let listening = false;

function ensureListener() {
  if (typeof window === "undefined" || listening) return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", ((event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!detail?.info?.uuid || !detail.provider) return;
    announced.set(detail.info.uuid, detail);
  }) as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function refreshInjectedProviders() {
  ensureListener();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function discoverInjectedProviders(): Eip6963ProviderDetail[] {
  refreshInjectedProviders();
  return [...announced.values()];
}

export function resolveInjectedProvider(
  id: WalletListEntry,
): { provider: Eip1193Provider; walletClientType: string } | null {
  const hint = INJECTED_HINTS[id];
  if (!hint) return null;

  const list = discoverInjectedProviders();

  const byRdns = list.find((d) =>
    hint.rdns.some((r) => d.info.rdns.toLowerCase() === r.toLowerCase()),
  );
  if (byRdns) return { provider: byRdns.provider, walletClientType: id };

  const byName = list.find((d) =>
    hint.names.some((n) => d.info.name.toLowerCase().includes(n)),
  );
  if (byName) return { provider: byName.provider, walletClientType: id };

  const eth = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  if (!eth) return null;

  const providers = eth.providers?.length ? eth.providers : [eth];

  // Rabby sets isRabby; prefer it explicitly (it may also look like MetaMask)
  if (id === "rabby_wallet") {
    const rabby =
      providers.find((p: Eip1193Provider) => p.isRabby) ??
      (eth.isRabby ? eth : undefined);
    if (rabby) return { provider: rabby, walletClientType: id };
  }

  if (id === "metamask") {
    const mm = providers.find(
      (p: Eip1193Provider) => p.isMetaMask && !p.isRabby,
    );
    if (mm) return { provider: mm, walletClientType: id };
  }

  if (hint.flag) {
    const flagged = providers.find((p: Eip1193Provider) =>
      Boolean(p[hint.flag!]),
    );
    if (flagged) return { provider: flagged, walletClientType: id };
  }

  return null;
}

export function installUrlFor(id: WalletListEntry): string | null {
  switch (id) {
    case "rabby_wallet":
      return "https://rabby.io";
    case "metamask":
      return "https://metamask.io/download/";
    case "okx_wallet":
      return "https://www.okx.com/web3";
    case "coinbase_wallet":
      return "https://www.coinbase.com/wallet/downloads";
    case "rainbow":
      return "https://rainbow.me/download";
    case "binance":
      return "https://www.binance.com/en/web3wallet";
    default:
      return null;
  }
}
