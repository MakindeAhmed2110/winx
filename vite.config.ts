import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { handleFaucetRequest, isFaucetPath } from "./server/faucet-middleware.ts";

function faucetMiddleware() {
  return (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => {
    if (!isFaucetPath(req.url)) {
      next();
      return;
    }
    void handleFaucetRequest(req, res).catch((err) => {
      console.error("[faucet]", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Faucet failed" }));
      }
    });
  };
}

function faucetPlugin(): Plugin {
  return {
    name: "winx-faucet",
    configureServer(server) {
      // Before Vite's file middleware, which would serve api/faucet.ts as source.
      server.middlewares.use(faucetMiddleware());
      // Post-hook so this also runs before React Router's SPA catch-all.
      return () => {
        server.middlewares.use(faucetMiddleware());
      };
    },
    configurePreviewServer(server) {
      return () => {
        server.middlewares.use(faucetMiddleware());
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
      },
    },
  };
});
