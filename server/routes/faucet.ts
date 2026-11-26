import type { IncomingMessage, ServerResponse } from "node:http";
import { handleFaucetRequest } from "../faucet-middleware";

/** Claim sends two transactions and waits for both receipts. */
export const maxDuration = 60;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleFaucetRequest(req, res);
}
