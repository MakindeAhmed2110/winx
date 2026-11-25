import type { IncomingMessage, ServerResponse } from "node:http";
import { isAddress, recoverMessageAddress } from "viem";
import { backupAuthMessage } from "../app/lib/privacy/backup-auth.ts";
import { readBackup, readPeg, readPegByEmbedded, writeBackup } from "./backup-db.ts";

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

function addressFromUrl(url: string | undefined) {
  if (!url) return "";
  const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("address") || "";
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

function sha256Hex(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((buf) =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
}

export async function handleBackupRequest(req: IncomingMessage, res: ServerResponse) {
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
      const address = addressFromUrl(req.url);
      if (!isAddress(address)) {
        json(res, 400, { error: "Address required" });
        return;
      }
      const row = await readBackup(address);
      json(res, 200, row ?? { version: 0, nonce: "", ciphertext: "" });
      return;
    }

    if (method !== "PUT" && method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = (await payloadOf(req)) as {
      address?: string;
      externalAddress?: string;
      version?: number;
      nonce?: string;
      ciphertext?: string;
      signature?: `0x${string}`;
    };
    const address = typeof body.address === "string" ? body.address : "";
    const externalAddress = typeof body.externalAddress === "string" ? body.externalAddress : "";
    const version = Number(body.version);
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const ciphertext = typeof body.ciphertext === "string" ? body.ciphertext : "";
    const signature = body.signature;
    if (!isAddress(address) || !Number.isInteger(version) || version < 1) {
      json(res, 400, { error: "Invalid backup" });
      return;
    }
    if (!nonce || !ciphertext || ciphertext.length > 500_000 || !signature) {
      json(res, 400, { error: "Invalid backup" });
      return;
    }

    const current = await readBackup(address);
    const expected = current ? current.version + 1 : 1;
    if (version !== expected) {
      json(res, 409, current ?? { version: 0, nonce: "", ciphertext: "" });
      return;
    }

    const digest = await sha256Hex(ciphertext);
    const signer = await recoverMessageAddress({
      message: backupAuthMessage(address, version, digest),
      signature,
    });
    if (signer.toLowerCase() !== address.toLowerCase()) {
      json(res, 401, { error: "Backup signature does not match this wallet" });
      return;
    }

    let linked: string | null = null;
    if (externalAddress) {
      if (!isAddress(externalAddress)) {
        json(res, 400, { error: "Invalid wallet peg" });
        return;
      }
      const byExternal = await readPeg(externalAddress);
      const byEmbedded = await readPegByEmbedded(address);
      if (byExternal && byExternal.embedded !== address.toLowerCase()) {
        json(res, 409, { error: "This wallet is pegged to a different trading wallet" });
        return;
      }
      if (byEmbedded && byEmbedded.external !== externalAddress.toLowerCase()) {
        json(res, 409, { error: "This trading wallet is pegged to a different wallet" });
        return;
      }
      linked = externalAddress.toLowerCase();
    }

    await writeBackup(address, { version, nonce, ciphertext }, linked);
    json(res, 200, { ok: true, version });
  } catch (err) {
    console.error("[backup]", err instanceof Error ? err.message : "failed");
    json(res, 500, { error: "Backup failed" });
  }
}

export function isBackupPath(url: string | undefined) {
  if (!url) return false;
  return url.split("?")[0] === "/api/backup";
}
