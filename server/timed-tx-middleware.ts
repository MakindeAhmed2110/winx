import type { IncomingMessage, ServerResponse } from "node:http";
import { isHex } from "viem";
import { sendCloseInSecond, traderAddress } from "./timed-tx.ts";

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

export function isTimedTxPath(url: string | undefined) {
  const path = (url || "").split("?")[0];
  return path === "/api/timed-tx";
}

export async function handleTimedTxRequest(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (method === "GET") {
    json(res, 200, { address: traderAddress() });
    return;
  }
  if (method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  let payload: { data?: unknown; closedAt?: unknown };
  try {
    const raw = await readBody(req);
    payload = raw.trim() ? (JSON.parse(raw) as { data?: unknown; closedAt?: unknown }) : {};
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  const data = payload.data;
  const closedAtRaw = payload.closedAt;
  if (typeof data !== "string" || !isHex(data) || data.length < 10) {
    json(res, 400, { error: "Missing close data" });
    return;
  }
  if (typeof closedAtRaw !== "string" || !/^\d+$/.test(closedAtRaw)) {
    json(res, 400, { error: "Missing close second" });
    return;
  }

  try {
    const sent = await sendCloseInSecond(data, BigInt(closedAtRaw));
    json(res, 200, {
      ok: sent.status === "success" && sent.matched,
      hash: sent.hash,
      timestamp: sent.timestamp.toString(),
      status: sent.status,
      matched: sent.matched,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Close send failed";
    json(res, 400, { error: message.replace(/0x[0-9a-fA-F]{64}/g, "0x…") });
  }
}
