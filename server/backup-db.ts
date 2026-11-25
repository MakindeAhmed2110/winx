import { Client } from "pg";

export type BackupRow = {
  version: number;
  nonce: string;
  ciphertext: string;
};

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function connectionConfig() {
  const raw = (process.env.SUPABASE_CONNECTION_STRING || "").trim().replace(/^["']|["']$/g, "");
  const scheme = raw.indexOf("://");
  const at = raw.lastIndexOf("@");
  if (scheme < 0 || at < 0) throw new Error("SUPABASE_CONNECTION_STRING is missing");
  const userinfo = raw.slice(scheme + 3, at);
  const colon = userinfo.indexOf(":");
  if (colon < 0) throw new Error("SUPABASE_CONNECTION_STRING is missing a password");
  const user = safeDecode(userinfo.slice(0, colon));
  const password = safeDecode(userinfo.slice(colon + 1));
  const hostpart = raw.slice(at + 1).split("?")[0];
  const slash = hostpart.indexOf("/");
  const hostPort = slash >= 0 ? hostpart.slice(0, slash) : hostpart;
  const database = slash >= 0 ? hostpart.slice(slash + 1) : "postgres";
  const portColon = hostPort.lastIndexOf(":");
  const host = portColon >= 0 ? hostPort.slice(0, portColon) : hostPort;
  const port = portColon >= 0 ? Number(hostPort.slice(portColon + 1)) : 5432;
  return { host, port, user, password, database, ssl: { rejectUnauthorized: false } };
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(connectionConfig());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

let schemaReady: Promise<void> | null = null;

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = withClient(async (client) => {
      await client.query(`
        create table if not exists note_backups (
          address text primary key,
          version bigint not null,
          nonce text not null,
          ciphertext text not null,
          external_address text,
          updated_at timestamptz not null default now()
        )
      `);
      await client.query(`
        alter table note_backups add column if not exists external_address text
      `);
      await client.query(`
        create table if not exists wallet_pegs (
          external_address text primary key,
          embedded_address text not null unique,
          created_at timestamptz not null default now()
        )
      `);
    }).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export async function readBackup(address: string): Promise<BackupRow | null> {
  await ensureSchema();
  return withClient(async (client) => {
    const result = await client.query<BackupRow>(
      "select version, nonce, ciphertext from note_backups where address = $1",
      [address.toLowerCase()],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      version: Number(row.version),
      nonce: row.nonce,
      ciphertext: row.ciphertext,
    };
  });
}

export async function writeBackup(
  address: string,
  row: BackupRow,
  externalAddress?: string | null,
): Promise<void> {
  await ensureSchema();
  await withClient(async (client) => {
    await client.query(
      `insert into note_backups (address, version, nonce, ciphertext, external_address, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (address) do update
         set version = excluded.version,
             nonce = excluded.nonce,
             ciphertext = excluded.ciphertext,
             external_address = coalesce(excluded.external_address, note_backups.external_address),
             updated_at = now()`,
      [address.toLowerCase(), row.version, row.nonce, row.ciphertext, externalAddress?.toLowerCase() ?? null],
    );
  });
}

export type WalletPeg = { external: string; embedded: string };

export async function readPeg(external: string): Promise<WalletPeg | null> {
  await ensureSchema();
  return withClient(async (client) => {
    const result = await client.query<{ external_address: string; embedded_address: string }>(
      "select external_address, embedded_address from wallet_pegs where external_address = $1",
      [external.toLowerCase()],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { external: row.external_address, embedded: row.embedded_address };
  });
}

export async function readPegByEmbedded(embedded: string): Promise<WalletPeg | null> {
  await ensureSchema();
  return withClient(async (client) => {
    const result = await client.query<{ external_address: string; embedded_address: string }>(
      "select external_address, embedded_address from wallet_pegs where embedded_address = $1",
      [embedded.toLowerCase()],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { external: row.external_address, embedded: row.embedded_address };
  });
}

export async function savePeg(external: string, embedded: string): Promise<"saved" | "same" | "conflict"> {
  await ensureSchema();
  const ext = external.toLowerCase();
  const emb = embedded.toLowerCase();
  return withClient(async (client) => {
    const byExternal = await client.query<{ embedded_address: string }>(
      "select embedded_address from wallet_pegs where external_address = $1",
      [ext],
    );
    const byEmbedded = await client.query<{ external_address: string }>(
      "select external_address from wallet_pegs where embedded_address = $1",
      [emb],
    );
    const existingEmbedded = byExternal.rows[0]?.embedded_address;
    const existingExternal = byEmbedded.rows[0]?.external_address;
    if (existingEmbedded && existingEmbedded !== emb) return "conflict";
    if (existingExternal && existingExternal !== ext) return "conflict";
    if (existingEmbedded === emb) return "same";
    await client.query(
      "insert into wallet_pegs (external_address, embedded_address) values ($1, $2)",
      [ext, emb],
    );
    return "saved";
  });
}
