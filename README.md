# Winx frontend

Testnet desk for private perps on Robinhood Chain.

## Run

```bash
pnpm install
# circuit assets live in public/circuits (shield + open wasm/zkey)
pnpm dev
```

Open `http://localhost:5173` → **Try on testnet**.

## Flow

1. Connect wallet (Robinhood Chain Testnet `46630`)
2. Swap testnet ETH → USDW
3. **Prove & shield** — Groth16 in-browser, secrets in `localStorage`
4. **Prove & open** — spend a note into a hidden BTC/ETH position

## Env

Copy `.env.example` → `.env`. Addresses default to the live Groth16 deploy.
