import type { IncomingMessage, ServerResponse } from "node:http";
import { handleBackupRequest } from "../backup-middleware";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleBackupRequest(req, res);
}
