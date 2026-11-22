import { lazy, Suspense } from "react";
import { usePrivyStatus } from "./auth/privy-status";

const ConnectedPrivyButton = lazy(() => import("./auth/ConnectedPrivyButton"));

export function ConnectButton() {
  const status = usePrivyStatus();

  if (status !== "ready") {
    return (
      <button type="button" className="trade-connect-btn" disabled>
        {status === "loading" ? "Loading…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <Suspense
      fallback={
        <button type="button" className="trade-connect-btn" disabled>
          Loading…
        </button>
      }
    >
      <ConnectedPrivyButton />
    </Suspense>
  );
}

