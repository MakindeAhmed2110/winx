/** Hand a fresh position to the keeper. The response is only `{ ok: true }`. */
export async function handoffPosition(body: Record<string, string | number | boolean>) {
  const url = import.meta.env.VITE_KEEPER_URL as string | undefined;
  const token = import.meta.env.VITE_KEEPER_TOKEN as string | undefined;
  if (!url || !token) return false;
  const res = await fetch(new URL("/positions", url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Keeper did not accept the position");
  return true;
}
