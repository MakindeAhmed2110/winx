import type { IncomingMessage, ServerResponse } from "node:http";
import { handleSyncMarkRequest } from "../sync-mark-middleware";

export const maxDuration = 60;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleSyncMarkRequest(req, res);
}
