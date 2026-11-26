import type { Route } from "./+types/docs";
import { DocsPage } from "../components/docs/DocsPage";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Docs · Winx" },
    {
      name: "description",
      content:
        "How Winx trades. Private perpetuals on Robinhood Chain: wallets, sealed positions, markets, settlement, and $WINX.",
    },
  ];
}

export default function Docs() {
  return <DocsPage />;
}
