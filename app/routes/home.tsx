import type { Route } from "./+types/home";
import { LandingPage } from "../components/landing/LandingPage";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Winx Perp - privacy-native perps on Robinhood Chain" },
    {
      name: "description",
      content:
        "Hide your positions from the public. Private orderbook, private market, private settlement on Robinhood Chain.",
    },
  ];
}

export default function Home() {
  return <LandingPage />;
}
