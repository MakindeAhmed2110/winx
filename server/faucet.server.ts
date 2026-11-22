import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbiItem,
  parseEther,
  parseUnits,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

export const FAUCET_AMOUNT = parseUnits("1000", 6);
export const FAUCET_ETH_AMOUNT = parseEther("0.0002");
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FAUCET_GAS_PRICE = 20_000_001n;
/** ETH transfer + ERC-20 transfer gas so the drop is not stranded. */
const FAUCET_GAS_RESERVE = FAUCET_GAS_PRICE * (21_000n + 80_000n);

const transferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const inFlight = new Set<string>();
/** Robinhood testnet accepts roughly this many blocks per eth_getLogs. */
const LOG_SPAN = 250_000n;
const MIN_LOG_SPAN = 2_000n;

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

function nextClaimAt(last: number | undefined) {
  if (!last) return 0;
  return last + FAUCET_COOLDOWN_MS;
}

function cooldownFrom(last: number | null) {
  const next = nextClaimAt(last ?? undefined);
  const now = Date.now();
  const available = !last || now >= next;
  return {
    available,
    amount: "1000",
    ethAmount: "0.0002",
    cooldownMs: FAUCET_COOLDOWN_MS,
    nextClaimAt: available ? null : next,
    retryInMs: available ? 0 : Math.max(0, next - now),
  };
}

function faucetChain() {
  return defineChain({
    id: Number(process.env.VITE_CHAIN_ID || process.env.CHAIN_ID || 46630),
    name: "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: {
        http: [
          process.env.VITE_RPC_URL ||
            process.env.RPC_URL ||
            "https://rpc.testnet.chain.robinhood.com/rpc",
        ],
      },
    },
  });
}

function usdwAddress() {
  return (process.env.VITE_USDW ||
    "0x5A3a75B1Fa0113B81f178bc918cf1f5646dCa6f8") as `0x${string}`;
}

function faucetClient() {
  const chain = faucetChain();
  return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
}

async function logsInRange(
  client: PublicClient,
  token: `0x${string}`,
  from: `0x${string}`,
  to: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ blockNumber: bigint }[]> {
  try {
    return await client.getLogs({
      address: token,
      event: transferEvent,
      args: { from, to },
      fromBlock,
      toBlock,
    });
  } catch (err) {
    const span = toBlock - fromBlock;
    if (span <= MIN_LOG_SPAN) throw err;
    const mid = fromBlock + span / 2n;
    const left = await logsInRange(client, token, from, to, fromBlock, mid);
    const right = await logsInRange(client, token, from, to, mid + 1n, toBlock);
    return [...left, ...right];
  }
}

/** Latest faucet USDW transfer to this address, in ms, or null if none in the window. */
async function lastClaimMs(
  client: PublicClient,
  admin: `0x${string}`,
  recipient: `0x${string}`,
): Promise<number | null> {
  const latest = await client.getBlock();
  const sampleFrom = latest.number > 5_000n ? latest.number - 5_000n : 0n;
  const earlier =
    sampleFrom === latest.number ? latest : await client.getBlock({ blockNumber: sampleFrom });
  const dt = latest.timestamp > earlier.timestamp ? latest.timestamp - earlier.timestamp : 1n;
  const dn = latest.number > earlier.number ? latest.number - earlier.number : 1n;
  const day = ((dn * 86_400n) / dt) + 64n;
  const lookback = day + day / 5n;
  const fromBlock = latest.number > lookback ? latest.number - lookback : 0n;
  const token = usdwAddress();

  let newest: bigint | null = null;
  for (let cursor = fromBlock; cursor <= latest.number; ) {
    const end = cursor + LOG_SPAN - 1n > latest.number ? latest.number : cursor + LOG_SPAN - 1n;
    const logs = await logsInRange(client, token, admin, recipient, cursor, end);
    for (const log of logs) {
      if (newest == null || log.blockNumber > newest) newest = log.blockNumber;
    }
    if (end === latest.number) break;
    cursor = end + 1n;
  }
  if (newest == null) return null;
  const block = await client.getBlock({ blockNumber: newest });
  return Number(block.timestamp) * 1000;
}

export async function faucetStatus(address: string, privateKey: `0x${string}` | null) {
  if (!privateKey) {
    return {
      ...cooldownFrom(null),
      available: false,
      error: "Faucet is not configured",
    };
  }
  try {
    const admin = privateKeyToAccount(privateKey).address;
    const last = await lastClaimMs(faucetClient(), admin, address as `0x${string}`);
    return cooldownFrom(last);
  } catch {
    return {
      ...cooldownFrom(null),
      available: false,
      error: "Could not verify the 24-hour claim window",
    };
  }
}

export async function claimFaucet(to: string, privateKey: `0x${string}`) {
  if (!isAddress(to)) {
    return { ok: false as const, status: 400, error: "Invalid address" };
  }
  const key = to.toLowerCase();
  if (inFlight.has(key)) {
    return { ok: false as const, status: 429, error: "Claim already in progress" };
  }
  inFlight.add(key);
  try {
    const chain = faucetChain();
    const account = privateKeyToAccount(privateKey);
    const transport = http(chain.rpcUrls.default.http[0]);
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ chain, transport, account });
    const token = usdwAddress();

    let gate: ReturnType<typeof cooldownFrom>;
    try {
      const last = await lastClaimMs(publicClient, account.address, to as `0x${string}`);
      gate = cooldownFrom(last);
    } catch {
      return {
        ok: false as const,
        status: 503,
        error: "Could not verify the 24-hour claim window",
      };
    }
    if (!gate.available) {
      return {
        ok: false as const,
        status: 429,
        error: "Already claimed in the last 24 hours",
        nextClaimAt: gate.nextClaimAt,
        retryInMs: gate.retryInMs,
      };
    }

    const adminBal = await publicClient.readContract({
      address: token,
      abi: transferAbi,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (adminBal < FAUCET_AMOUNT) {
      return {
        ok: false as const,
        status: 503,
        error: "Faucet is empty — admin USDW balance too low",
      };
    }

    const nativeBal = await publicClient.getBalance({ address: account.address });
    if (nativeBal < FAUCET_ETH_AMOUNT + FAUCET_GAS_RESERVE) {
      return {
        ok: false as const,
        status: 503,
        error: "Faucet is empty — admin ETH balance too low",
      };
    }

    const recipient = to as `0x${string}`;
    const hash = await walletClient.writeContract({
      account,
      address: token,
      abi: transferAbi,
      functionName: "transfer",
      args: [recipient, FAUCET_AMOUNT],
      gasPrice: FAUCET_GAS_PRICE,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
      return { ok: false as const, status: 500, error: "Faucet transfer reverted" };
    }

    let ethTxHash: `0x${string}` | undefined;
    try {
      ethTxHash = await walletClient.sendTransaction({
        account,
        to: recipient,
        value: FAUCET_ETH_AMOUNT,
        gas: 21_000n,
        gasPrice: FAUCET_GAS_PRICE,
      });
      const ethReceipt = await publicClient.waitForTransactionReceipt({ hash: ethTxHash });
      if (ethReceipt.status === "reverted") {
        ethTxHash = undefined;
      }
    } catch {
      // USDW already landed — the Transfer log is the cooldown.
    }

    const now = Date.now();
    return {
      ok: true as const,
      amount: "1000",
      ethAmount: "0.0002",
      txHash: hash,
      ethTxHash,
      nextClaimAt: now + FAUCET_COOLDOWN_MS,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false as const, status: 500, error: message };
  } finally {
    inFlight.delete(key);
  }
}
