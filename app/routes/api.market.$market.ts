import type { Route } from "./+types/api.market.$market";
import { getMarketStats } from "../lib/server/extended.server";

export async function loader({ params }: Route.LoaderArgs) {
  const market = params.market;
  if (!market || !/^[A-Z0-9-]{3,32}$/i.test(market)) {
    return Response.json({ error: "Invalid market" }, { status: 400 });
  }

  try {
    const stats = await getMarketStats(market.toUpperCase());
    return Response.json(stats, {
      headers: {
        "Cache-Control": "public, max-age=1, stale-while-revalidate=3",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load market";
    return Response.json({ error: message }, { status: 502 });
  }
}
