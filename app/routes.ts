import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("trade", "routes/trade.tsx"),
  route("markets", "routes/markets.tsx"),
  route("portfolio", "routes/portfolio.tsx"),
] satisfies RouteConfig;
