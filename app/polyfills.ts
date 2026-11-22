import { Buffer } from "buffer";

const g = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  process?: { env: Record<string, string | undefined> };
};

if (typeof g.Buffer === "undefined") {
  g.Buffer = Buffer;
}

if (typeof g.process === "undefined") {
  (g as { process: { env: Record<string, string | undefined> } }).process = {
    env: {},
  };
}
