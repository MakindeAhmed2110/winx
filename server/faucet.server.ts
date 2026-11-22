import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseEther,
  parseUnits,
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

type ClaimMap = Record<string, number>;

const inFlight = new Set<string>();

function claimsPath() {
  const dir = path.resolve(process.cwd(), ".data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "faucet-claims.json");
}

function readClaims(): ClaimMap {
  try {
    const raw = fs.readFileSync(claimsPath(), "utf8");
    const parsed = JSON.parse(raw) as ClaimMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeClaims(map: ClaimMap) {
  fs.writeFileSync(claimsPath(), `${JSON.stringify(map, null, 2)}\n`);
}

function nextClaimAt(last: number | undefined) {
  if (!last) return 0;
  return last + FAUCET_COOLDOWN_MS;
}

export function faucetStatus(address: string) {
  const key = address.toLowerCase();
  const last = readClaims()[key];
  const next = nextClaimAt(last);
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
    const claims = readClaims();
    const last = claims[key];
    const next = nextClaimAt(last);
    const now = Date.now();
    if (last && now < next) {
      return {
        ok: false as const,
        status: 429,
        error: "Already claimed in the last 24 hours",
        nextClaimAt: next,
        retryInMs: next - now,
      };
    }

    claims[key] = now;
    writeClaims(claims);

    try {
      const chain = faucetChain();
      const account = privateKeyToAccount(privateKey);
      const transport = http(chain.rpcUrls.default.http[0]);
      const publicClient = createPublicClient({ chain, transport });
      const walletClient = createWalletClient({ chain, transport, account });
      const token = usdwAddress();

      const adminBal = await publicClient.readContract({
        address: token,
        abi: transferAbi,
        functionName: "balanceOf",
        args: [account.address],
      });
      if (adminBal < FAUCET_AMOUNT) {
        delete claims[key];
        writeClaims(claims);
        return {
          ok: false as const,
          status: 503,
          error: "Faucet is empty — admin USDW balance too low",
        };
      }

      const nativeBal = await publicClient.getBalance({ address: account.address });
      if (nativeBal < FAUCET_ETH_AMOUNT + FAUCET_GAS_RESERVE) {
        delete claims[key];
        writeClaims(claims);
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
        delete claims[key];
        writeClaims(claims);
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
        // USDW already landed — do not roll back the claim.
      }

      return {
        ok: true as const,
        amount: "1000",
        ethAmount: "0.0002",
        txHash: hash,
        ethTxHash,
        nextClaimAt: now + FAUCET_COOLDOWN_MS,
      };
    } catch (e) {
      delete claims[key];
      writeClaims(claims);
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false as const, status: 500, error: message };
    }
  } finally {
    inFlight.delete(key);
  }
}
