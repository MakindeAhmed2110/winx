import type { IncomingMessage, ServerResponse } from "node:http";
import { handleTimedTxRequest } from "../timed-tx-middleware";

/** The handler waits until the proved second, then for the receipt. */
export const maxDuration = 60;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleTimedTxRequest(req, res);
}
