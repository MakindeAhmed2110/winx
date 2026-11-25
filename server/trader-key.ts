import fs from "node:fs";
import path from "node:path";

function pickKey(raw: string | undefined): `0x${string}` | null {
  const value = (raw || "").trim().replace(/^["']|["']$/g, "");
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value as `0x${string}`;
  return null;
}

function fromFile(file: string): `0x${string}` | null {
  try {
    const text = fs.readFileSync(file, "utf8");
    const found = text.match(/^\s*TRADER_PRIVATE_KEY\s*=\s*(.+)\s*$/m)?.[1];
    return pickKey(found);
  } catch {
    return null;
  }
}

/** Server-only. Never log this and never send it to the browser. */
export function loadTraderPrivateKey(): `0x${string}` | null {
  const fromEnv = pickKey(process.env.TRADER_PRIVATE_KEY);
  if (fromEnv) return fromEnv;
  const cwd = process.cwd();
  for (const file of [path.resolve(cwd, ".env"), path.resolve(cwd, "frontend/.env")]) {
    const key = fromFile(file);
    if (key) return key;
  }
  return null;
}
