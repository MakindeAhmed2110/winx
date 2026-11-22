import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("trade", "routes/trade.tsx"),
  route("markets", "routes/markets.tsx"),
  route("api/market/:market", "routes/api.market.$market.ts"),
] satisfies RouteConfig;
