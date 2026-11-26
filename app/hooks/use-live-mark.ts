import { useEffect, useState } from "react";

const STREAM = "wss://api.starknet.extended.exchange/stream.extended.exchange/v1";

interface WireLevel {
  p: string;
  q: string;
  c?: string;
}

interface Room {
  bids: Map<number, number>;
  asks: Map<number, number>;
  price: number | null;
  listeners: Set<(price: number | null) => void>;
  ws?: WebSocket;
  seq: number;
  retry?: number;
  stopped: boolean;
}

const rooms = new Map<string, Room>();
const pending = new Set<Room>();
let frame = 0;

function best(book: Map<number, number>, side: "bid" | "ask"): number | null {
  let found: number | null = null;
  for (const price of book.keys()) {
    if (found == null || (side === "bid" ? price > found : price < found)) found = price;
  }
  return found;
}

function mid(room: Room): number | null {
  const bid = best(room.bids, "bid");
  const ask = best(room.asks, "ask");
  if (bid != null && ask != null && ask >= bid) return (bid + ask) / 2;
  return bid ?? ask ?? room.price;
}

function flush() {
  frame = 0;
  for (const room of pending) {
    pending.delete(room);
    const next = mid(room);
    if (next == null || next === room.price) continue;
    room.price = next;
    for (const listener of room.listeners) listener(next);
  }
}

function schedule(room: Room) {
  pending.add(room);
  if (frame || typeof requestAnimationFrame !== "function") return;
  frame = requestAnimationFrame(flush);
}

function apply(book: Map<number, number>, levels: WireLevel[] | undefined, snapshot: boolean) {
  for (const level of levels ?? []) {
    const size = Number(snapshot ? level.q : (level.c ?? level.q));
    const price = Number(level.p);
    if (!Number.isFinite(price)) continue;
    if (size > 0) book.set(price, size);
    else book.delete(price);
  }
}

function connect(market: string, room: Room) {
  room.seq = 0;
  const ws = new WebSocket(`${STREAM}/orderbooks/${market}`);
  room.ws = ws;
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data as string) as {
      type: string;
      seq: number;
      data?: { b?: WireLevel[]; a?: WireLevel[] };
    };
    const snapshot = msg.type === "SNAPSHOT";
    if (!snapshot && msg.seq !== room.seq + 1) {
      ws.close();
      return;
    }
    room.seq = msg.seq;
    if (snapshot) {
      room.bids.clear();
      room.asks.clear();
    }
    apply(room.bids, msg.data?.b, snapshot);
    apply(room.asks, msg.data?.a, snapshot);
    schedule(room);
  };
  ws.onclose = () => {
    if (!room.stopped) room.retry = window.setTimeout(() => connect(market, room), 1000);
  };
}

function subscribe(market: string, listener: (price: number | null) => void) {
  let room = rooms.get(market);
  if (!room) {
    room = {
      bids: new Map(),
      asks: new Map(),
      price: null,
      listeners: new Set(),
      seq: 0,
      stopped: false,
    };
    rooms.set(market, room);
    connect(market, room);
  }
  room.listeners.add(listener);
  if (room.price != null) listener(room.price);
  return () => {
    const current = rooms.get(market);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    current.stopped = true;
    window.clearTimeout(current.retry);
    if (current.ws) {
      current.ws.onclose = null;
      current.ws.close();
    }
    rooms.delete(market);
    pending.delete(current);
  };
}

/** Touch mid from the Extended order-book stream. One socket per market, painted every frame. */
export function useLiveMark(market: string | undefined): number | null {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!market) {
      setPrice(null);
      return;
    }
    setPrice(null);
    return subscribe(market, setPrice);
  }, [market]);

  return price;
}
