import type { PublicClient } from "viem";
import { engineAbi } from "../abis";
import { addresses } from "../config";
import { BACKUP_KEY_MESSAGE, backupAuthMessage } from "./backup-auth";
import {
  loadStore,
  replaceNotesAndPositions,
  type LocalNote,
  type LocalPosition,
} from "./notes";

type SignMessage = (message: string) => Promise<`0x${string}`>;

type RemoteBackup = {
  version: number;
  nonce: string;
  ciphertext: string;
};

export type BackupSyncResult = {
  uploaded: boolean;
  restored: boolean;
  skipped: boolean;
};

const keys = new Map<string, CryptoKey>();
let queue: Promise<unknown> = Promise.resolve();

export class BackupSignatureDenied extends Error {
  constructor() {
    super("Backup signature was rejected");
    this.name = "BackupSignatureDenied";
  }
}

function bytesToB64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: `0x${string}`) {
  const bytes = new Uint8Array((hex.length - 2) / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  }
  return bytes;
}

async function deriveKey(signature: `0x${string}`) {
  const raw = await crypto.subtle.digest("SHA-256", hexToBytes(signature));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function keyFor(address: string, signMessage: SignMessage) {
  const id = address.toLowerCase();
  const cached = keys.get(id);
  if (cached) return cached;
  let signature: `0x${string}`;
  try {
    signature = await signMessage(BACKUP_KEY_MESSAGE);
  } catch {
    throw new BackupSignatureDenied();
  }
  const key = await deriveKey(signature);
  keys.set(id, key);
  return key;
}

async function encrypt(key: CryptoKey, notes: LocalNote[], positions: LocalPosition[]) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ notes, positions }));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  return { nonce: bytesToB64(iv), ciphertext: bytesToB64(cipher) };
}

async function decrypt(key: CryptoKey, nonce: string, ciphertext: string) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(nonce) },
    key,
    b64ToBytes(ciphertext),
  );
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as {
    notes?: LocalNote[];
    positions?: LocalPosition[];
  };
  return {
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    positions: Array.isArray(parsed.positions) ? parsed.positions : [],
  };
}

function unionNotes(local: LocalNote[], remote: LocalNote[]) {
  const map = new Map<string, LocalNote>();
  for (const note of remote) {
    if (!note?.commitment) continue;
    map.set(note.commitment.toLowerCase(), { ...note });
  }
  for (const note of local) {
    if (!note?.commitment) continue;
    const key = note.commitment.toLowerCase();
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...note });
      continue;
    }
    map.set(key, {
      ...prev,
      ...note,
      spent: prev.spent || note.spent,
      spentBy: prev.spentBy || note.spentBy,
    });
  }
  return [...map.values()];
}

function unionPositions(local: LocalPosition[], remote: LocalPosition[]) {
  const map = new Map<string, LocalPosition>();
  for (const position of remote) {
    if (!position?.commitment) continue;
    map.set(position.commitment.toLowerCase(), { ...position });
  }
  for (const position of local) {
    if (!position?.commitment) continue;
    map.set(position.commitment.toLowerCase(), { ...position });
  }
  return [...map.values()];
}

async function dropClosed(positions: LocalPosition[], publicClient: PublicClient) {
  const open: LocalPosition[] = [];
  for (const position of positions) {
    try {
      const stillOpen = await publicClient.readContract({
        address: addresses.engine,
        abi: engineAbi,
        functionName: "positions",
        args: [position.commitment],
      });
      if (stillOpen) open.push(position);
    } catch {
      open.push(position);
    }
  }
  return open;
}

function sameRecords(a: { notes: LocalNote[]; positions: LocalPosition[] }, b: { notes: LocalNote[]; positions: LocalPosition[] }) {
  const pack = (records: { notes: LocalNote[]; positions: LocalPosition[] }) =>
    JSON.stringify({
      notes: [...records.notes].sort((x, y) => x.commitment.localeCompare(y.commitment)),
      positions: [...records.positions].sort((x, y) => x.commitment.localeCompare(y.commitment)),
    });
  return pack(a) === pack(b);
}

async function fetchRemote(address: string): Promise<RemoteBackup | "unconfigured"> {
  const res = await fetch(`/api/backup?address=${address}`);
  if (res.status === 503) return "unconfigured";
  if (!res.ok) throw new Error("Could not read the backup");
  return (await res.json()) as RemoteBackup;
}

async function syncOnce(args: {
  address: `0x${string}`;
  signMessage: SignMessage;
  publicClient: PublicClient;
  externalAddress?: `0x${string}`;
}): Promise<BackupSyncResult> {
  const remote = await fetchRemote(args.address);
  if (remote === "unconfigured") return { uploaded: false, restored: false, skipped: true };

  const key = await keyFor(args.address, args.signMessage);
  const local = loadStore();
  const remoteRecords =
    remote.version > 0 && remote.ciphertext
      ? await decrypt(key, remote.nonce, remote.ciphertext)
      : { notes: [] as LocalNote[], positions: [] as LocalPosition[] };

  const notes = unionNotes(local.notes, remoteRecords.notes);
  const positions = await dropClosed(
    unionPositions(local.positions, remoteRecords.positions),
    args.publicClient,
  );
  const merged = { notes, positions };
  const restored = !sameRecords({ notes: local.notes, positions: local.positions }, merged);
  if (restored) replaceNotesAndPositions(notes, positions);

  if (remote.version > 0 && sameRecords(remoteRecords, merged)) {
    return { uploaded: false, restored, skipped: false };
  }
  if (notes.length === 0 && positions.length === 0) {
    return { uploaded: false, restored, skipped: false };
  }

  const packed = await encrypt(key, notes, positions);
  const version = remote.version + 1;
  const digest = await sha256Hex(packed.ciphertext);
  let signature: `0x${string}`;
  try {
    signature = await args.signMessage(backupAuthMessage(args.address, version, digest));
  } catch {
    throw new BackupSignatureDenied();
  }
  const res = await fetch("/api/backup", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      address: args.address,
      externalAddress: args.externalAddress,
      version,
      nonce: packed.nonce,
      ciphertext: packed.ciphertext,
      signature,
    }),
  });
  if (res.status === 409) throw new Error("retry");
  if (!res.ok) throw new Error("Could not save the backup");
  return { uploaded: true, restored, skipped: false };
}

export function syncPrivateBackup(args: {
  address: `0x${string}`;
  signMessage: SignMessage;
  publicClient: PublicClient;
  externalAddress?: `0x${string}`;
}) {
  const run = queue.then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await syncOnce(args);
      } catch (err) {
        if (err instanceof Error && err.message === "retry") continue;
        throw err;
      }
    }
    throw new Error("Could not save the backup");
  });
  queue = run.catch(() => undefined);
  return run;
}
