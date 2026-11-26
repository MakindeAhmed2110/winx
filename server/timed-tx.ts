import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  toFunctionSelector,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { engineAbi } from "../app/lib/abis.ts";
import { withFaucetSenderLock } from "./faucet.server.ts";
import { loadFaucetPrivateKey } from "./faucet-key.ts";
import { loadTraderPrivateKey } from "./trader-key.ts";

const ENGINE = "0x5135288399BCdDa309A5299244c46958477B7d91" as const;
const RPC = process.env.VITE_RPC_URL || process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com/rpc";
const chain = defineChain({
  id: Number(process.env.VITE_CHAIN_ID || process.env.CHAIN_ID || 46630),
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

/** Arrive this far into the sequencer second. Early enough to be included, late enough to miss the previous one. */
const ARRIVE_MS = 220;
/** Local unix time runs behind the sequencer. Pull the send forward by this much. */
const CLOCK_LEAD_MS = 1_700;
/** Shifted after a miss so the next send aims at the second that was actually mined. */
let leadAdjustMs = 0;

const CLOSE_SELECTOR = toFunctionSelector(
  engineAbi.find((item) => item.type === "function" && item.name === "close")!,
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function traderAccount() {
  const key = loadTraderPrivateKey();
  if (!key) return null;
  try {
    return privateKeyToAccount(key);
  } catch {
    return null;
  }
}

function chainClient() {
  return createPublicClient({
    chain,
    transport: http(RPC, { batch: false, timeout: 8_000 }),
    cacheTime: 0,
  });
}

/** Local clock minus the chain second, from the earliest block observed. */
async function measureSkew(publicClient: PublicClient) {
  const deadline = Date.now() + 1_500;
  let bestInto = Number.POSITIVE_INFINITY;
  let rtt = 350;
  let ts = 0n;
  while (Date.now() < deadline) {
    const sent = Date.now();
    const block = await publicClient.getBlock({ blockTag: "latest" });
    const recv = Date.now();
    const sampleRtt = Math.max(1, recv - sent);
    const into = recv - Math.round(sampleRtt / 2) - Number(block.timestamp) * 1000;
    if (into > -2_000 && into < bestInto) {
      bestInto = into;
      rtt = sampleRtt;
      ts = block.timestamp;
    }
  }
  if (!Number.isFinite(bestInto)) throw new Error("Could not read the chain clock");
  return { skewMs: bestInto, rtt, ts };
}

async function waitForSecond(publicClient: PublicClient, closedAt: bigint) {
  const { skewMs, rtt } = await measureSkew(publicClient);
  const fireAt =
    Number(closedAt) * 1000 + skewMs + ARRIVE_MS - Math.round(rtt / 2) - CLOCK_LEAD_MS - leadAdjustMs;
  const wait = fireAt - Date.now();
  if (wait > 50_000) throw new Error("Close second is too far away");
  if (wait < -700) throw new Error("Close second already passed");
  if (wait > 0) await sleep(wait);
  return { skewMs, rtt };
}

export function traderAddress(): `0x${string}` | null {
  return traderAccount()?.address ?? null;
}

/**
 * Broadcast a close inside `closedAt`.
 * The proof is valid only for that second, and close() does not check msg.sender,
 * so the faucet key submits it on the clock that already lands on time.
 */
export async function sendCloseInSecond(data: Hex, closedAt: bigint) {
  if (!data.startsWith(CLOSE_SELECTOR)) {
    throw new Error("Only a close can be sent on this timer");
  }
  const key = loadFaucetPrivateKey();
  if (!key) throw new Error("Close relayer is not configured");
  const account = privateKeyToAccount(key);

  const publicClient = chainClient();
  const head = await publicClient.getBlock();
  if (head.timestamp >= closedAt) throw new Error("Close second already passed");
  const base = head.baseFeePerGas ?? 0n;
  const maxPriorityFeePerGas = 1_000_000_000n;
  const maxFeePerGas = base + 2_000_000_000n;
  const gas = 1_600_000n;
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < gas * maxFeePerGas) throw new Error("Close relayer is low on ETH");
  const [pending, latest] = await Promise.all([
    publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
    publicClient.getTransactionCount({ address: account.address, blockTag: "latest" }),
  ]);
  let nonce = BigInt(pending > latest ? pending : latest);

  // Wake and broadcast immediately. Extra RPC after the timer pushed the last close into the next second.
  await waitForSecond(publicClient, closedAt);

  const hash = await withFaucetSenderLock(async () => {
    const wallet = createWalletClient({
      account,
      chain,
      transport: http(RPC, { batch: false, timeout: 8_000 }),
    });
    const tx = {
      account,
      chain,
      to: ENGINE,
      data,
      gas,
      maxPriorityFeePerGas,
      maxFeePerGas,
    } as const;
    try {
      return await wallet.sendTransaction({ ...tx, nonce });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/nonce too low/i.test(message)) throw error;
      const stated = message.match(/state:\s*(\d+)/);
      const bumped = stated ? BigInt(stated[1]) : nonce + 1n;
      const again = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });
      nonce = bumped > again ? bumped : again > nonce ? again : nonce + 1n;
      return wallet.sendTransaction({ ...tx, nonce });
    }
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 });
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  const deltaMs = Number(block.timestamp - closedAt) * 1000;
  if (deltaMs !== 0) leadAdjustMs = Math.max(-4_000, Math.min(4_000, leadAdjustMs + deltaMs));
  console.info(
    `[close] aimed ${closedAt} included ${block.timestamp} ${receipt.status} ${hash}`,
  );
  return {
    hash,
    timestamp: block.timestamp,
    status: receipt.status,
    matched: block.timestamp === closedAt && receipt.status === "success",
  };
}

/** Zero-value self transfer used to prove a broadcast lands in a chosen second. */
export async function probeTiming() {
  const account = traderAccount();
  if (!account) throw new Error("Trader key is not configured");
  const publicClient = chainClient();
  const head = await publicClient.getBlock();
  const target = head.timestamp + 5n;
  const aimed = await waitForSecond(publicClient, target);

  const wallet = createWalletClient({
    account,
    chain,
    transport: http(RPC, { batch: false, timeout: 8_000 }),
  });
  const hash = await wallet.sendTransaction({
    account,
    chain,
    to: account.address,
    value: 0n,
    gas: 21_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
    maxFeePerGas: 30_000_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 });
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  return {
    address: account.address,
    head: head.timestamp.toString(),
    target: target.toString(),
    included: block.timestamp.toString(),
    delta: (block.timestamp - target).toString(),
    skewMs: aimed.skewMs,
    rtt: aimed.rtt,
    hash,
    status: receipt.status,
  };
}
