import { useEffect, useState } from "react";

const EXTENDED_STREAM = "wss://api.starknet.extended.exchange/stream.extended.exchange/v1";
/** Coalesce the 100ms Extended pushes into fewer React renders. */
const FLUSH_MS = 200;

export interface BookLevel {
  price: number;
  size: number;
  /** Cumulative size from the touch outward. */
  total: number;
}

export interface OrderBookState {
  asks: BookLevel[];
  bids: BookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  connected: boolean;
}

export interface PublicTrade {
  id: number;
  side: "buy" | "sell";
  price: number;
  size: number;
  ts: number;
  /** Arrived after the initial backlog, so the UI can highlight it. */
  fresh: boolean;
}

interface WireLevel {
  p: string;
  q: string;
  c?: string;
}

const EMPTY: OrderBookState = { asks: [], bids: [], bestBid: null, bestAsk: null, connected: false };

function aggregate(levels: Map<number, number>, side: "ask" | "bid", tick: number, depth: number): BookLevel[] {
  const prices = [...levels.keys()].sort((a, b) => (side === "ask" ? a - b : b - a));
  const out: BookLevel[] = [];
  let total = 0;
  for (const price of prices) {
    const bucket = side === "ask" ? Math.ceil(price / tick - 1e-9) * tick : Math.floor(price / tick + 1e-9) * tick;
    const size = levels.get(price)!;
    total += size;
    const last = out[out.length - 1];
    if (last && Math.abs(last.price - bucket) < tick / 2) {
      last.size += size;
      last.total = total;
    } else {
      if (out.length === depth) break;
      out.push({ price: bucket, size, total });
    }
  }
  return out;
}

/** Live L2 book from the Extended stream: snapshot, then absolute-size deltas; reconnects on a sequence gap. */
export function useOrderBook(market: string, tick: number, depth: number): OrderBookState {
  const [state, setState] = useState<OrderBookState>(EMPTY);

  useEffect(() => {
    if (!market) return;
    const bids = new Map<number, number>();
    const asks = new Map<number, number>();
    let ws: WebSocket | undefined;
    let seq = 0;
    let dirty = false;
    let connected = false;
    let closed = false;
    let retry: number | undefined;
    setState(EMPTY);

    const apply = (book: Map<number, number>, levels: WireLevel[] | undefined, snapshot: boolean) => {
      for (const l of levels ?? []) {
        const size = Number(snapshot ? l.q : (l.c ?? l.q));
        const price = Number(l.p);
        if (size > 0) book.set(price, size);
        else book.delete(price);
      }
    };

    const connect = () => {
      bids.clear();
      asks.clear();
      seq = 0;
      ws = new WebSocket(`${EXTENDED_STREAM}/orderbooks/${market}`);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as {
          type: string;
          seq: number;
          data: { b?: WireLevel[]; a?: WireLevel[] };
        };
        const snapshot = msg.type === "SNAPSHOT";
        if (!snapshot && msg.seq !== seq + 1) {
          ws?.close();
          return;
        }
        seq = msg.seq;
        if (snapshot) {
          bids.clear();
          asks.clear();
        }
        apply(bids, msg.data.b, snapshot);
        apply(asks, msg.data.a, snapshot);
        connected = true;
        dirty = true;
      };
      ws.onclose = () => {
        connected = false;
        dirty = true;
        if (!closed) retry = window.setTimeout(connect, 1000);
      };
    };
    connect();

    const flush = window.setInterval(() => {
      if (!dirty) return;
      dirty = false;
      const a = aggregate(asks, "ask", tick, depth);
      const b = aggregate(bids, "bid", tick, depth);
      setState({
        asks: a,
        bids: b,
        bestAsk: asks.size ? Math.min(...asks.keys()) : null,
        bestBid: bids.size ? Math.max(...bids.keys()) : null,
        connected,
      });
    }, FLUSH_MS);

    return () => {
      closed = true;
      window.clearTimeout(retry);
      window.clearInterval(flush);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [market, tick, depth]);

  return state;
}

let tradeId = 0;
const STALE_STREAM_MS = 30_000;

/** Most recent public trades (newest first) from the Extended stream. */
export function usePublicTrades(market: string, limit: number, enabled: boolean): PublicTrade[] {
  const [trades, setTrades] = useState<PublicTrade[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | undefined;
    let closed = false;
    let retry: number | undefined;
    let lastMessage = Date.now();
    setTrades([]);

    const connect = () => {
      lastMessage = Date.now();
      ws = new WebSocket(`${EXTENDED_STREAM}/publicTrades/${market}`);
      ws.onmessage = (e) => {
        lastMessage = Date.now();
        const msg = JSON.parse(e.data as string) as {
          seq: number;
          data?: { S: string; p: string; q: string; T: number }[];
        };
        const isSnapshot = msg.seq === 1;
        const batch = (msg.data ?? [])
          .map(
            (t): PublicTrade => ({
              id: ++tradeId,
              side: t.S === "BUY" ? "buy" : "sell",
              price: +t.p,
              size: +t.q,
              ts: t.T,
              fresh: !isSnapshot,
            }),
          )
          .sort((a, b) => b.ts - a.ts);
        if (!batch.length) return;
        setTrades((prev) => (isSnapshot ? batch : [...batch, ...prev]).slice(0, limit));
      };
      ws.onclose = () => {
        if (!closed) retry = window.setTimeout(connect, 1000);
      };
    };
    connect();

    const watchdog = window.setInterval(() => {
      if (Date.now() - lastMessage > STALE_STREAM_MS && ws?.readyState === WebSocket.OPEN) ws.close();
    }, 5000);

    return () => {
      closed = true;
      window.clearInterval(watchdog);
      window.clearTimeout(retry);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [market, limit, enabled]);

  return trades;
}
