import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWalletPegRequest } from "../wallet-peg-middleware";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleWalletPegRequest(req, res);
}
