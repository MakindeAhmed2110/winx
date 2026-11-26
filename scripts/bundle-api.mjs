import { mkdir } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = ["faucet", "backup", "timed-tx", "wallet-peg"];
const outDir = path.join(root, "api");

await mkdir(outDir, { recursive: true });

// Sources live outside api/. Vercel treats every file in api/ as a function,
// so the directory only receives these JavaScript bundles.
for (const name of routes) {
  await build({
    absWorkingDir: root,
    entryPoints: [path.join(root, "server", "routes", `${name}.ts`)],
    outfile: path.join(outDir, `${name}.js`),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    // pg stays a real package so its optional native binding can load.
    external: ["pg"],
    logLevel: "info",
  });
}
