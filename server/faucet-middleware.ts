import type { IncomingMessage, ServerResponse } from "node:http";
import { isAddress } from "viem";
import { loadFaucetPrivateKey } from "./faucet-key.ts";
import { claimFaucet, faucetStatus } from "./faucet.server.ts";

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer | string) => {
      chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function addressFromUrl(url: string | undefined) {
  if (!url) return "";
  const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("address") || "";
}

export async function handleFaucetRequest(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (method === "GET") {
    const address = addressFromUrl(req.url);
    if (!isAddress(address)) {
      json(res, 200, {
        available: true,
        amount: "1000",
        ethAmount: "0.0002",
        cooldownMs: 24 * 60 * 60 * 1000,
      });
      return;
    }
    json(res, 200, faucetStatus(address));
    return;
  }

  if (method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  let address = "";
  try {
    const parsed = JSON.parse((await readBody(req)) || "{}") as { address?: string };
    address = parsed.address || "";
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  if (!isAddress(address)) {
    json(res, 400, { error: "Connect a wallet first" });
    return;
  }

  const key = loadFaucetPrivateKey();
  if (!key) {
    json(res, 503, { error: "Faucet is not configured" });
    return;
  }

  const result = await claimFaucet(address, key);
  if (!result.ok) {
    json(res, result.status, {
      error: result.error,
      nextClaimAt: "nextClaimAt" in result ? result.nextClaimAt : undefined,
      retryInMs: "retryInMs" in result ? result.retryInMs : undefined,
    });
    return;
  }
  json(res, 200, result);
}

export function isFaucetPath(url: string | undefined) {
  if (!url) return false;
  const path = url.split("?")[0];
  return path === "/api/faucet";
}
