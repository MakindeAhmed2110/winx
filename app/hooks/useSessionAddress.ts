import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import { useAccount } from "wagmi";

/** Mount only under PrivyProvider (privy status === "ready"). */
export function PrivyAddressSync({
  onAddress,
}: {
  onAddress: (address: `0x${string}` | undefined) => void;
}) {
  const { address: wagmiAddress } = useAccount();
  const { user, authenticated } = usePrivy();
  const privyAddress = authenticated
    ? (user?.wallet?.address as `0x${string}` | undefined)
    : undefined;
  const resolved = wagmiAddress ?? privyAddress;

  useEffect(() => {
    onAddress(resolved);
  }, [resolved, onAddress]);

  return null;
}
