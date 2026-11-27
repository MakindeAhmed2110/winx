import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbiItem,
  formatUnits,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

export const FAUCET_AMOUNT = parseUnits("1000", 6);
/** Covers approve + shield + open at the testnet base fee. */
export const FAUCET_ETH_AMOUNT = parseEther("0.025");
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FAUCET_TIP = 1_000_000_000n;
/**
 * A native transfer on Robinhood testnet estimates around 234k gas.
 * 21,000 is under the floor, so the ETH drop was rejected and wallets
 * kept the USDW with nothing to pay gas.
 */
const ETH_TRANSFER_GAS = 300_000n;
const TOKEN_TRANSFER_GAS = 300_000n;
/** Send another 0.025 ETH when a prior claim left the wallet below this. */
const GAS_TOPUP_BELOW = parseEther("0.001");
/** ETH transfer + ERC-20 transfer gas so the drop is not stranded. */
const FAUCET_GAS_RESERVE = (10_000_000_000n + FAUCET_TIP) * (ETH_TRANSFER_GAS + TOKEN_TRANSFER_GAS);

async function faucetGasPrice(publicClient: ReadClient): Promise<bigint> {
  const block = await publicClient.getBlock();
  return (block.baseFeePerGas ?? 0n) + FAUCET_TIP;
}

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
/** One sender key. Claims must not read the same nonce. */
let senderQueue: Promise<unknown> = Promise.resolve();
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
    ethAmount: "0.025",
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
  client: ReadClient,
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
  client: ReadClient,
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
    const client = faucetClient();
    const admin = privateKeyToAccount(privateKey).address;
    const recipient = address as `0x${string}`;
    const last = await lastClaimMs(client, admin, recipient);
    const status = cooldownFrom(last);
    if (status.available) return status;
    const balance = await client.getBalance({ address: recipient });
    if (balance >= GAS_TOPUP_BELOW) return status;
    return { ...status, available: true, gasOnly: true, retryInMs: 0 };
  } catch {
    return {
      ...cooldownFrom(null),
      available: false,
      error: "Could not verify the 24-hour claim window",
    };
  }
}

function withSenderLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = senderQueue.then(fn, fn);
  senderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Faucet claims and close relays share one nonce sequence. */
export function withFaucetSenderLock<T>(fn: () => Promise<T>): Promise<T> {
  return withSenderLock(fn);
}

type ReadClient = ReturnType<typeof createPublicClient>;

async function nextNonce(publicClient: ReadClient, address: `0x${string}`): Promise<bigint> {
  const [pending, latest] = await Promise.all([
    publicClient.getTransactionCount({ address, blockTag: "pending" }),
    publicClient.getTransactionCount({ address, blockTag: "latest" }),
  ]);
  return BigInt(pending > latest ? pending : latest);
}

function nonceTooLow(error: unknown): bigint | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (!/nonce too low/i.test(message)) return undefined;
  const stated = message.match(/state:\s*(\d+)/);
  return stated ? BigInt(stated[1]) : 0n;
}

async function sendAtNonce<T>(
  publicClient: ReadClient,
  address: `0x${string}`,
  send: (nonce: bigint) => Promise<T>,
): Promise<T> {
  let nonce = await nextNonce(publicClient, address);
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await send(nonce);
    } catch (error) {
      last = error;
      const bumped = nonceTooLow(error);
      if (bumped === undefined || attempt === 3) throw error;
      const again = await nextNonce(publicClient, address);
      nonce = bumped > again ? bumped : again > nonce ? again : nonce + 1n;
    }
  }
  throw last;
}

/** Prior USDW claim landed, but the ETH transfer did not. Send gas only. */
async function sendGasTopup(privateKey: `0x${string}`, recipient: `0x${string}`) {
  const chain = faucetChain();
  const account = privateKeyToAccount(privateKey);
  const transport = http(chain.rpcUrls.default.http[0]);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ chain, transport, account });
  const balance = await publicClient.getBalance({ address: recipient });
  if (balance >= GAS_TOPUP_BELOW) return null;
  const nativeBal = await publicClient.getBalance({ address: account.address });
  if (nativeBal < FAUCET_ETH_AMOUNT + FAUCET_GAS_RESERVE) {
    return {
      ok: false as const,
      status: 503,
      error: "Faucet is empty — admin ETH balance too low",
    };
  }
  const ethTxHash = await withSenderLock(async () => {
    const gasPrice = await faucetGasPrice(publicClient);
    const hash = await sendAtNonce(publicClient, account.address, (nonce) =>
      walletClient.sendTransaction({
        account,
        to: recipient,
        value: FAUCET_ETH_AMOUNT,
        gas: ETH_TRANSFER_GAS,
        gasPrice,
        nonce: Number(nonce),
      }),
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") throw new Error("ETH gas drop reverted");
    return hash;
  });
  return {
    ok: true as const,
    status: 200,
    amount: "0",
    ethAmount: "0.025",
    gasOnly: true,
    ethTxHash,
  };
}

/** A blank amount is the standard drip. A typed amount cannot exceed it. */
function requestedAmount(
  raw: string | undefined,
): { ok: true; amount: bigint } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: true, amount: FAUCET_AMOUNT };
  if (!/^\d+(\.\d{1,6})?$/.test(raw.trim())) return { ok: false, error: "Enter a USDW amount." };
  const units = parseUnits(raw.trim(), 6);
  if (units <= 0n) return { ok: false, error: "Enter a USDW amount." };
  if (units > FAUCET_AMOUNT) return { ok: false, error: "Deposit limit is 1,000 USDW." };
  return { ok: true, amount: units };
}

export async function claimFaucet(
  to: string,
  privateKey: `0x${string}`,
  amountRaw?: string,
) {
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
      const topped = await sendGasTopup(privateKey, to as `0x${string}`);
      if (topped) return { ...topped, nextClaimAt: gate.nextClaimAt ?? undefined };
      return {
        ok: false as const,
        status: 429,
        error: "Already claimed in the last 24 hours",
        nextClaimAt: gate.nextClaimAt,
        retryInMs: gate.retryInMs,
      };
    }

    const requested = requestedAmount(amountRaw);
    if (!requested.ok) {
      return { ok: false as const, status: 400, error: requested.error };
    }
    const sendAmount = requested.amount;
    const adminBal = await publicClient.readContract({
      address: token,
      abi: transferAbi,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (adminBal < sendAmount) {
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
    const { hash, ethTxHash } = await withSenderLock(async () => {
      const gasPrice = await faucetGasPrice(publicClient);
      const hash = await sendAtNonce(publicClient, account.address, (nonce) =>
        walletClient.writeContract({
          account,
          address: token,
          abi: transferAbi,
          functionName: "transfer",
          args: [recipient, sendAmount],
          gasPrice,
          nonce: Number(nonce),
        }),
      );
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error("Faucet transfer reverted");
      }

      let ethTxHash: `0x${string}` | undefined;
      try {
        const ethGasPrice = await faucetGasPrice(publicClient);
        ethTxHash = await sendAtNonce(publicClient, account.address, (nonce) =>
          walletClient.sendTransaction({
            account,
            to: recipient,
            value: FAUCET_ETH_AMOUNT,
            gas: ETH_TRANSFER_GAS,
            gasPrice: ethGasPrice,
            nonce: Number(nonce),
          }),
        );
        const ethReceipt = await publicClient.waitForTransactionReceipt({ hash: ethTxHash });
        if (ethReceipt.status === "reverted") ethTxHash = undefined;
      } catch {
        // USDW already landed — the Transfer log is the cooldown.
      }
      return { hash, ethTxHash };
    });

    const now = Date.now();
    return {
      ok: true as const,
      amount: formatUnits(sendAmount, 6),
      ethAmount: "0.025",
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
