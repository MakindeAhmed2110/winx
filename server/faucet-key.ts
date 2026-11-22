import fs from "node:fs";
import path from "node:path";

function pickKey(raw: string | undefined): `0x${string}` | null {
  const v = (raw || "").trim().replace(/^["']|["']$/g, "");
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v as `0x${string}`;
  return null;
}

function fromFile(file: string): `0x${string}` | null {
  try {
    const text = fs.readFileSync(file, "utf8");
    const faucet = text.match(/^\s*FAUCET_PRIVATE_KEY\s*=\s*(.+)\s*$/m)?.[1];
    const admin = text.match(/^\s*PRIVATE_KEY\s*=\s*(.+)\s*$/m)?.[1];
    return pickKey(faucet) || pickKey(admin);
  } catch {
    return null;
  }
}

/** Server-only. Never expose to the client bundle. */
export function loadFaucetPrivateKey(): `0x${string}` | null {
  const env =
    pickKey(process.env.FAUCET_PRIVATE_KEY) || pickKey(process.env.PRIVATE_KEY);
  if (env) return env;

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, ".env"),
    path.resolve(cwd, "../.env"),
    path.resolve(cwd, "../contracts/.env"),
  ];
  for (const file of candidates) {
    const key = fromFile(file);
    if (key) return key;
  }
  return null;
}
