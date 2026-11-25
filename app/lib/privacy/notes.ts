const KEY = "winx.notes.v1";

export type NoteSpendReason = "withdraw" | "trade";

export type LocalNote = {
  commitment: `0x${string}`;
  amount: string;
  blinding: string;
  owner: string;
  leafIndex: number;
  spent: boolean;
  /** True until the vault confirms the commitment (shield/close insert). */
  pending?: boolean;
  /** How the note was spent — withdraw to wallet, or open a trade. */
  spentBy?: NoteSpendReason;
  createdAt: number;
};

export type LocalPosition = {
  commitment: `0x${string}`;
  noteCommitment: `0x${string}`;
  marketId: number;
  isLong: boolean;
  leverage: number;
  size: string;
  margin: string;
  entryPrice: string;
  posBlinding: string;
  openedAt: string;
  /** Funding index locked at open (usually 0 on this deploy). */
  fundingIndexEntry?: string;
  createdAt: number;
};

type Store = {
  leaves: `0x${string}`[];
  notes: LocalNote[];
  positions: LocalPosition[];
};

function empty(): Store {
  return { leaves: [], notes: [], positions: [] };
}

export function loadStore(): Store {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const store = { ...empty(), ...JSON.parse(raw) } as Store;
    return backfillSpentBy(store);
  } catch {
    return empty();
  }
}

/** Tag older spent notes as Trade when a local position still references them. */
function backfillSpentBy(store: Store): Store {
  const traded = new Set(
    store.positions.map((p) => p.noteCommitment.toLowerCase()),
  );
  let dirty = false;
  for (const n of store.notes) {
    if (!n.spent || n.spentBy) continue;
    if (!traded.has(n.commitment.toLowerCase())) continue;
    n.spentBy = "trade";
    dirty = true;
  }
  if (dirty) save(store);
  return store;
}

function save(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function addNote(note: LocalNote) {
  const store = loadStore();
  const exists = store.notes.some(
    (n) => n.commitment.toLowerCase() === note.commitment.toLowerCase(),
  );
  if (!exists) {
    store.notes.unshift(note); // newest / live first
    if (
      !note.pending &&
      !store.leaves.some((c) => c.toLowerCase() === note.commitment.toLowerCase())
    ) {
      store.leaves.push(note.commitment);
    }
  } else {
    const n = store.notes.find(
      (x) => x.commitment.toLowerCase() === note.commitment.toLowerCase(),
    );
    if (n) Object.assign(n, note);
  }
  save(store);
  // Durable backup so a later crash/resync can't strand a close payout.
  backupPayoutNote(note);
  return store;
}

const PAYOUT_BACKUP_KEY = "winx.payout-backup.v1";

/** Extra copy of close/open payout notes (blinding + amount) for recovery. */
export function backupPayoutNote(note: LocalNote) {
  if (typeof window === "undefined" || note.spent) return;
  try {
    const raw = localStorage.getItem(PAYOUT_BACKUP_KEY);
    const list: LocalNote[] = raw ? (JSON.parse(raw) as LocalNote[]) : [];
    const i = list.findIndex(
      (n) => n.commitment.toLowerCase() === note.commitment.toLowerCase(),
    );
    if (i >= 0) list[i] = note;
    else list.unshift(note);
    localStorage.setItem(PAYOUT_BACKUP_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // ignore quota / private mode
  }
}

/** Re-import any backed-up live notes missing from the main store. */
export function restorePayoutBackups(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(PAYOUT_BACKUP_KEY);
    if (!raw) return 0;
    const list = JSON.parse(raw) as LocalNote[];
    if (!Array.isArray(list) || list.length === 0) return 0;
    const store = loadStore();
    let added = 0;
    for (const note of list) {
      if (!note?.commitment || note.spent) continue;
      // Restored notes stay pending until hydrate confirms isLiveNote.
      const exists = store.notes.some(
        (n) => n.commitment.toLowerCase() === note.commitment.toLowerCase(),
      );
      if (exists) continue;
      store.notes.unshift({ ...note, pending: true });
      if (!store.leaves.some((c) => c.toLowerCase() === note.commitment.toLowerCase())) {
        store.leaves.push(note.commitment);
      }
      added += 1;
    }
    if (added > 0) save(store);
    return added;
  } catch {
    return 0;
  }
}

export function markNoteSpent(
  commitment: `0x${string}`,
  spentBy: NoteSpendReason = "trade",
) {
  const store = loadStore();
  const n = store.notes.find(
    (x) => x.commitment.toLowerCase() === commitment.toLowerCase(),
  );
  if (n) {
    n.spent = true;
    n.spentBy = spentBy;
  }
  save(store);
  return store;
}

export function addPosition(pos: LocalPosition) {
  const store = loadStore();
  store.positions.push(pos);
  save(store);
  return store;
}

/** Replace notes and positions from a decrypted backup. Leaf list stays local. */
export function replaceNotesAndPositions(notes: LocalNote[], positions: LocalPosition[]) {
  const store = loadStore();
  store.notes = notes;
  store.positions = positions;
  save(store);
  return store;
}

export function removePosition(commitment: `0x${string}`) {
  const store = loadStore();
  store.positions = store.positions.filter(
    (p) => p.commitment.toLowerCase() !== commitment.toLowerCase(),
  );
  save(store);
  return store;
}

export function liveNotes(): LocalNote[] {
  return loadStore().notes.filter((n) => !n.spent && !n.pending);
}

export function setNoteLeafIndex(commitment: `0x${string}`, leafIndex: number) {
  const store = loadStore();
  const n = store.notes.find(
    (x) => x.commitment.toLowerCase() === commitment.toLowerCase(),
  );
  if (n) n.leafIndex = leafIndex;
  save(store);
  return store;
}

export function confirmNote(commitment: `0x${string}`, leafIndex?: number) {
  const store = loadStore();
  const n = store.notes.find(
    (x) => x.commitment.toLowerCase() === commitment.toLowerCase(),
  );
  if (n) {
    n.pending = false;
    if (leafIndex != null) n.leafIndex = leafIndex;
  }
  save(store);
  return store;
}

export function dropPendingNote(commitment: `0x${string}`) {
  const store = loadStore();
  const n = store.notes.find(
    (x) => x.commitment.toLowerCase() === commitment.toLowerCase(),
  );
  if (n?.pending && !n.spent) {
    store.notes = store.notes.filter(
      (x) => x.commitment.toLowerCase() !== commitment.toLowerCase(),
    );
    save(store);
  }
  return store;
}

/** JSON blob for backup / download (notes + positions + leaf list). */
export function exportStoreJson(): string {
  const store = loadStore();
  return `${JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      key: KEY,
      notes: store.notes,
      positions: store.positions,
      leaves: store.leaves,
    },
    null,
    2,
  )}\n`;
}

export function downloadNotesFile(filename?: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([exportStoreJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ?? `winx-notes-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSingleNote(note: LocalNote) {
  if (typeof window === "undefined") return;
  const blob = new Blob(
    [
      `${JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          note,
        },
        null,
        2,
      )}\n`,
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `winx-note-${note.commitment.slice(2, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function leafBigints(): bigint[] {
  return loadStore().leaves.map((c) => BigInt(c));
}

/** Replace merkle leaf list and optionally rewritten notes (e.g. after vault resync). */
export function replaceLeaves(leaves: `0x${string}`[], notes?: LocalNote[]) {
  const store = loadStore();
  store.leaves = leaves;
  if (notes) store.notes = notes;
  save(store);
  return store;
}
