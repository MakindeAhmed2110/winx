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

function addressField(raw: unknown): string {
  if (!raw || typeof raw !== "object" || !("address" in raw)) return "";
  const address = (raw as { address?: unknown }).address;
  return typeof address === "string" ? address : "";
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
        ethAmount: "0.025",
        cooldownMs: 24 * 60 * 60 * 1000,
      });
      return;
    }
    json(res, 200, await faucetStatus(address, loadFaucetPrivateKey()));
    return;
  }

  if (method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const preset = (req as IncomingMessage & { body?: unknown }).body;
  let payload: unknown = preset;
  if (preset == null) {
    try {
      const raw = await readBody(req);
      payload = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return;
    }
  } else if (typeof preset === "string") {
    try {
      payload = preset.trim() ? JSON.parse(preset) : {};
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return;
    }
  }
  const address = addressField(payload);

  if (!isAddress(address)) {
    json(res, 400, { error: "Connect a wallet first" });
    return;
  }

  const key = loadFaucetPrivateKey();
  if (!key) {
    json(res, 503, { error: "Faucet is not configured" });
    return;
  }

  const amount =
    payload && typeof payload === "object" && "amount" in payload
      ? String((payload as { amount?: unknown }).amount ?? "")
      : "";
  const result = await claimFaucet(address, key, amount);
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
