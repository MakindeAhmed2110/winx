import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { http } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { NeutralizePrivyDialogs } from "./components/auth/NeutralizePrivyDialogs";
import { robinhoodTestnet } from "./lib/config";
import { tradingWalletForWagmi } from "./lib/operating-wallet";
import { privyAppId, privyConfig } from "./lib/privy";

const wagmiConfig = createConfig({
  chains: [robinhoodTestnet],
  transports: {
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
  },
});

function RobinhoodChainGuard({ children }: { children: ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (!isConnected) return;
    if (chainId === robinhoodTestnet.id) return;
    try {
      switchChain({ chainId: robinhoodTestnet.id });
    } catch {
      // Wallet may reject — ConnectButton still offers a manual switch.
    }
  }, [isConnected, chainId, switchChain]);

  return <>{children}</>;
}

function MarkReady({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

export default function PrivyApp({
  children,
  queryClient,
  onReady,
}: {
  children: ReactNode;
  queryClient: QueryClient;
  onReady: () => void;
}) {
  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} setActiveWalletForWagmi={tradingWalletForWagmi}>
          <MarkReady onReady={onReady} />
          <NeutralizePrivyDialogs />
          <RobinhoodChainGuard>{children}</RobinhoodChainGuard>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
