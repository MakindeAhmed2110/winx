import type { Route } from "./+types/portfolio";
import { PortfolioPage } from "../components/portfolio/PortfolioPage";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Winx - Portfolio" },
    {
      name: "description",
      content: "Private portfolio on Winx. Shielded notes, wallet USDW, and open perps.",
    },
  ];
}

export default function Portfolio() {
  return <PortfolioPage />;
}
