import type { IncomingMessage, ServerResponse } from "node:http";
import { refreshOwnedMark } from "./sync-mark.ts";

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

export function isSyncMarkPath(url: string | undefined) {
  const path = (url || "").split("?")[0];
  return path === "/api/sync-mark";
}

export async function handleSyncMarkRequest(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  let marketId: number;
  try {
    const raw = await readBody(req);
    const payload = raw.trim() ? (JSON.parse(raw) as { marketId?: unknown }) : {};
    marketId = Number(payload.marketId);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }
  if (!Number.isInteger(marketId) || marketId < 1) {
    json(res, 400, { error: "Missing market" });
    return;
  }

  try {
    const sent = await refreshOwnedMark(marketId);
    json(res, 200, sent);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mark update failed";
    json(res, 400, { error: message.replace(/0x[0-9a-fA-F]{64}/g, "0x…") });
  }
}
