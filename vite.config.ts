import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { handleBackupRequest, isBackupPath } from "./server/backup-middleware.ts";
import { handleFaucetRequest, isFaucetPath } from "./server/faucet-middleware.ts";
import { handleTimedTxRequest, isTimedTxPath } from "./server/timed-tx-middleware.ts";
import { handleWalletPegRequest, isWalletPegPath } from "./server/wallet-peg-middleware.ts";

function apiMiddleware() {
  return (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => {
    const run = isFaucetPath(req.url)
      ? handleFaucetRequest(req, res)
      : isBackupPath(req.url)
        ? handleBackupRequest(req, res)
        : isWalletPegPath(req.url)
          ? handleWalletPegRequest(req, res)
          : isTimedTxPath(req.url)
            ? handleTimedTxRequest(req, res)
            : null;
    if (!run) {
      next();
      return;
    }
    void run.catch((err) => {
      console.error("[api]", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Request failed" }));
      }
    });
  };
}

function faucetPlugin(): Plugin {
  return {
    name: "winx-faucet",
    configureServer(server) {
      // Before Vite's file middleware, which would serve api/faucet.ts as source.
      server.middlewares.use(apiMiddleware());
      // Post-hook so this also runs before React Router's SPA catch-all.
      return () => {
        server.middlewares.use(apiMiddleware());
      };
    },
    configurePreviewServer(server) {
      return () => {
        server.middlewares.use(apiMiddleware());
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  return {
    plugins: [
      nodePolyfills({
        include: ["buffer", "process"],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
      tailwindcss(),
      faucetPlugin(),
      reactRouter(),
    ],
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      include: ["buffer", "process", "snarkjs", "circomlibjs"],
      exclude: ["ffjavascript"],
    },
    define: {
      global: "globalThis",
    },
    server: {
      fs: {
        allow: [".."],
      },
      // SPA has ssr:false — proxy Extended REST so the ticker can load live stats.
      // Also proxy RH mainnet RPC so settlement sync can read live Chainlink without CORS.
      proxy: {
        "/extended": {
          target: "https://api.starknet.extended.exchange",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/extended/, ""),
        },
        "/rh-mainnet": {
          target: "https://rpc.mainnet.chain.robinhood.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/rh-mainnet/, ""),
        },
        "/rhj": {
          target: "https://api.robinhood.com",
          changeOrigin: true,
          secure: true,
        },
        "/cmc": {
          target: "https://api.coinmarketcap.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/cmc/, ""),
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0",
          },
        },
      },
    },
  };
});
