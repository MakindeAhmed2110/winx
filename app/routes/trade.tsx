import type { Route } from "./+types/trade";
import { TradePage } from "../components/trade/TradePage";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Trade · Winx Perp" },
    {
      name: "description",
      content: "Private perpetual trading desk on Robinhood Chain. Shield, prove, and open without painting the book.",
    },
  ];
}

export default function Trade() {
  return <TradePage />;
}
