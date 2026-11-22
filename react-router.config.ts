import type { Config } from "@react-router/dev/config";

export default {
  // Wallet + snarkjs are browser-only
  ssr: false,
} satisfies Config;
