import type { IncomingMessage, ServerResponse } from "node:http";
import { isAddress, recoverMessageAddress } from "viem";
import { readPeg, savePeg } from "./backup-db.ts";

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function payloadOf(req: IncomingMessage): Promise<unknown> {
  const preset = (req as IncomingMessage & { body?: unknown }).body;
  if (preset == null) {
    const raw = await readBody(req);
    return raw.trim() ? JSON.parse(raw) : {};
  }
  if (typeof preset === "string") return preset.trim() ? JSON.parse(preset) : {};
  return preset;
}

function pegMessage(external: string, embedded: string) {
  return `Winx testnet wallet peg\n${external.toLowerCase()}\n${embedded.toLowerCase()}`;
}

export async function handleWalletPegRequest(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (!process.env.SUPABASE_CONNECTION_STRING) {
    json(res, 503, { error: "Backup is not configured" });
    return;
  }

  try {
    if (method === "GET") {
      const url = req.url || "";
      const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      const external = new URLSearchParams(q).get("external") || "";
      if (!isAddress(external)) {
        json(res, 400, { error: "Address required" });
        return;
      }
      const peg = await readPeg(external);
      json(res, 200, peg ?? { external: external.toLowerCase(), embedded: "" });
      return;
    }

    if (method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = (await payloadOf(req)) as {
      external?: string;
      embedded?: string;
      signature?: `0x${string}`;
    };
    const external = typeof body.external === "string" ? body.external : "";
    const embedded = typeof body.embedded === "string" ? body.embedded : "";
    const signature = body.signature;
    if (!isAddress(external) || !isAddress(embedded) || !signature) {
      json(res, 400, { error: "Invalid wallet peg" });
      return;
    }
    const signer = await recoverMessageAddress({
      message: pegMessage(external, embedded),
      signature,
    });
    if (signer.toLowerCase() !== embedded.toLowerCase()) {
      json(res, 401, { error: "Peg signature does not match the trading wallet" });
      return;
    }
    const saved = await savePeg(external, embedded);
    if (saved === "conflict") {
      json(res, 409, { error: "This wallet is already pegged" });
      return;
    }
    json(res, 200, { ok: true, external: external.toLowerCase(), embedded: embedded.toLowerCase() });
  } catch (err) {
    console.error("[wallet-peg]", err instanceof Error ? err.message : "failed");
    json(res, 500, { error: "Could not save the wallet peg" });
  }
}

export function isWalletPegPath(url: string | undefined) {
  if (!url) return false;
  return url.split("?")[0] === "/api/wallet-peg";
}
