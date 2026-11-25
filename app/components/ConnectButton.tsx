import { lazy, Suspense } from "react";
import { usePrivyStatus } from "./auth/privy-status";

const ConnectedPrivyButton = lazy(() => import("./auth/ConnectedPrivyButton"));

export function ConnectLabel() {
  return (
    <>
      <span className="trade-connect-full">Connect wallet</span>
      <span className="trade-connect-short">Connect wallet</span>
    </>
  );
}

export function ConnectButton() {
  const status = usePrivyStatus();

  if (status !== "ready") {
    return (
      <button type="button" className="trade-connect-btn" disabled>
        {status === "loading" ? "Loading…" : <ConnectLabel />}
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

