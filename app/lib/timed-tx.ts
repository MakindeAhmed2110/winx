let traderAddress: string | null | undefined;

/** Address of the server-side trader key, or null when this app cannot time a close. */
export async function loadTimedTrader(): Promise<string | null> {
  if (traderAddress !== undefined) return traderAddress;
  try {
    const res = await fetch("/api/timed-tx");
    if (!res.ok) {
      traderAddress = null;
      return null;
    }
    const json = (await res.json()) as { address?: string | null };
    traderAddress = json.address ?? null;
    return traderAddress;
  } catch {
    traderAddress = null;
    return null;
  }
}

export async function sendTimedClose(args: {
  data: `0x${string}`;
  closedAt: bigint;
  gas: bigint;
}): Promise<`0x${string}`> {
  const res = await fetch("/api/timed-tx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: args.data,
      closedAt: args.closedAt.toString(),
      gas: args.gas.toString(),
    }),
  });
  const text = await res.text();
  let json: { ok?: boolean; hash?: `0x${string}`; error?: string };
  try {
    json = JSON.parse(text) as { ok?: boolean; hash?: `0x${string}`; error?: string };
  } catch {
    throw new Error("Close server failed to start. The close was not sent.");
  }
  if (!res.ok || !json.ok || !json.hash) {
    throw new Error(json.error || "Close missed the block. Tap Close again.");
  }
  return json.hash;
}
