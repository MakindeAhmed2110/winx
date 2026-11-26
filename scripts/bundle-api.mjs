import { build } from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = ["faucet", "backup", "timed-tx", "wallet-peg"];

for (const name of routes) {
  await build({
    absWorkingDir: root,
    entryPoints: [path.join(root, "api", `${name}.ts`)],
    outfile: path.join(root, "api", `${name}.js`),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    // pg stays a real package so its optional native binding can load.
    external: ["pg"],
    logLevel: "info",
  });
}

// Vercel compiles api/*.ts itself and then fails to load the .ts imports.
// The bundled .js files are the functions. The .ts entries must not ship beside them.
if (process.env.VERCEL === "1") {
  await Promise.all(routes.map((name) => rm(path.join(root, "api", `${name}.ts`))));
}
