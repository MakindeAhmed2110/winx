import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  lazy,
  Suspense,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";
import { http } from "viem";
import { WagmiProvider, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  PrivyStatusContext,
  type PrivyStatus,
} from "./components/auth/privy-status";
import { robinhoodTestnet } from "./lib/config";
import { privyAppId } from "./lib/privy-env";

const PrivyApp = lazy(() => import("./privy-app"));

if (typeof window !== "undefined") {
  void import("./privy-app");
}

/** Fallback wagmi config used before Privy chunk mounts. */
const fallbackWagmi = createConfig({
  chains: [robinhoodTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
  },
  ssr: false,
});

let privyOnce = false;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [wantPrivy, setWantPrivy] = useState(privyOnce);
  const [privyReady, setPrivyReady] = useState(false);

  useLayoutEffect(() => {
    if (!privyAppId) return;
    privyOnce = true;
    setWantPrivy(true);
  }, []);

  const onReady = useCallback(() => setPrivyReady(true), []);

  const status: PrivyStatus = !privyAppId
    ? "unconfigured"
    : privyReady
      ? "ready"
      : "loading";

  const shell = (
    <BootShell queryClient={queryClient}>{children}</BootShell>
  );

  return (
    <PrivyStatusContext.Provider value={status}>
      {wantPrivy ? (
        <Suspense fallback={shell}>
          <PrivyApp queryClient={queryClient} onReady={onReady}>
            {children}
          </PrivyApp>
        </Suspense>
      ) : (
        shell
      )}
    </PrivyStatusContext.Provider>
  );
}

function BootShell({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <WagmiProvider config={fallbackWagmi}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
