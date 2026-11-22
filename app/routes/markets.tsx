import type { Route } from "./+types/markets";
import { MarketsPage } from "../components/markets/MarketsPage";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Markets · Winx Perp" },
    {
      name: "description",
      content: "Live markets listed on the Winx perpetual engine.",
    },
  ];
}

export default function Markets() {
  return <MarketsPage />;
}
