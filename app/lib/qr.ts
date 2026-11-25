/** Version 3, error-correction M. Holds a 42-character wallet address with no extra padding. */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

function initField() {
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}
initField();

function mul(a: number, b: number) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!];
}

function reedSolomon(data: number[], eccLength: number) {
  let poly = [1];
  for (let i = 0; i < eccLength; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= mul(poly[j]!, EXP[i]!);
      next[j + 1] ^= poly[j]!;
    }
    poly = next;
  }
  const gen = poly.reverse();
  const out = new Uint8Array(data.length + eccLength);
  data.forEach((byte, index) => {
    out[index] = byte;
  });
  for (let i = 0; i < data.length; i += 1) {
    const factor = out[i]!;
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j += 1) out[i + j] ^= mul(gen[j]!, factor);
  }
  return Array.from(out.slice(data.length));
}

function dataCodewords(text: string) {
  const capacity = 44;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(text.length, 8);
  for (let i = 0; i < text.length; i += 1) push(text.charCodeAt(i), 8);
  const room = capacity * 8 - bits.length;
  for (let i = 0; i < Math.min(4, room); i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]!;
    bytes.push(byte);
  }
  const pads = [0xec, 0x11];
  let pad = 0;
  while (bytes.length < capacity) bytes.push(pads[pad++ % 2]!);
  return bytes;
}

function bitsOf(bytes: number[]) {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >>> i) & 1);
  }
  return bits;
}

const SIZE = 29;

function blank() {
  return {
    dark: Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false)),
    reserved: Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false)),
  };
}

function paint(
  grid: { dark: boolean[][]; reserved: boolean[][] },
  row: number,
  col: number,
  dark: boolean,
) {
  grid.dark[row]![col] = dark;
  grid.reserved[row]![col] = true;
}

function finder(grid: { dark: boolean[][]; reserved: boolean[][] }, row: number, col: number) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const r = row + y;
      const c = col + x;
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) continue;
      const edge = y === -1 || x === -1 || y === 7 || x === 7;
      const outer = y === 0 || x === 0 || y === 6 || x === 6;
      const inner = y >= 2 && y <= 4 && x >= 2 && x <= 4;
      paint(grid, r, c, !edge && (outer || inner));
    }
  }
}

function alignment(grid: { dark: boolean[][]; reserved: boolean[][] }, row: number, col: number) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const edge = Math.max(Math.abs(x), Math.abs(y)) === 2;
      paint(grid, row + y, col + x, edge || (x === 0 && y === 0));
    }
  }
}

function formatBits(mask: number) {
  const data = mask;
  let rem = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) rem ^= gen << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function bitAt(value: number, index: number) {
  return ((value >>> index) & 1) === 1;
}

function drawFormat(grid: { dark: boolean[][]; reserved: boolean[][] }, mask: number) {
  const bits = formatBits(mask);
  for (let i = 0; i <= 5; i += 1) paint(grid, i, 8, bitAt(bits, i));
  paint(grid, 7, 8, bitAt(bits, 6));
  paint(grid, 8, 8, bitAt(bits, 7));
  paint(grid, 8, 7, bitAt(bits, 8));
  for (let i = 9; i < 15; i += 1) paint(grid, 8, 14 - i, bitAt(bits, i));
  for (let i = 0; i < 8; i += 1) paint(grid, 8, SIZE - 1 - i, bitAt(bits, i));
  for (let i = 8; i < 15; i += 1) paint(grid, SIZE - 15 + i, 8, bitAt(bits, i));
}

function functionPatterns() {
  const grid = blank();
  for (let i = 0; i < SIZE; i += 1) {
    paint(grid, 6, i, i % 2 === 0);
    paint(grid, i, 6, i % 2 === 0);
  }
  finder(grid, 0, 0);
  finder(grid, 0, SIZE - 7);
  finder(grid, SIZE - 7, 0);
  alignment(grid, 22, 22);
  paint(grid, SIZE - 8, 8, true);
  reserveFormat(grid);
  return grid;
}

/** Format areas are function modules. Reserve them before data is placed. */
function reserveFormat(grid: { reserved: boolean[][] }) {
  const hold = (row: number, col: number) => {
    grid.reserved[row]![col] = true;
  };
  for (let i = 0; i <= 5; i += 1) hold(i, 8);
  hold(7, 8);
  hold(8, 8);
  hold(8, 7);
  for (let i = 9; i < 15; i += 1) hold(8, 14 - i);
  for (let i = 0; i < 8; i += 1) hold(8, SIZE - 1 - i);
  for (let i = 8; i < 15; i += 1) hold(SIZE - 15 + i, 8);
}

function masked(dataBits: number[], mask: number) {
  const grid = functionPatterns();
  let index = 0;
  let upward = true;
  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < SIZE; step += 1) {
      const row = upward ? SIZE - 1 - step : step;
      for (let k = 0; k < 2; k += 1) {
        const c = col - k;
        if (grid.reserved[row]![c]) continue;
        const bit = index < dataBits.length ? dataBits[index]! : 0;
        index += 1;
        const flip = maskOf(mask, row, c);
        grid.dark[row]![c] = bit === 1 ? !flip : flip;
      }
    }
    upward = !upward;
  }
  drawFormat(grid, mask);
  return grid.dark;
}

function maskOf(mask: number, row: number, col: number) {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function penalty(modules: boolean[][]) {
  let score = 0;
  const run = (dark: boolean, length: number) => {
    if (length >= 5) score += length - 2;
    return dark;
  };
  for (let row = 0; row < SIZE; row += 1) {
    let length = 1;
    for (let col = 1; col < SIZE; col += 1) {
      if (modules[row]![col] === modules[row]![col - 1]) length += 1;
      else {
        run(modules[row]![col - 1]!, length);
        length = 1;
      }
    }
    run(modules[row]![SIZE - 1]!, length);
  }
  for (let col = 0; col < SIZE; col += 1) {
    let length = 1;
    for (let row = 1; row < SIZE; row += 1) {
      if (modules[row]![col] === modules[row - 1]![col]) length += 1;
      else {
        run(modules[row - 1]![col]!, length);
        length = 1;
      }
    }
    run(modules[SIZE - 1]![col]!, length);
  }
  for (let row = 0; row < SIZE - 1; row += 1) {
    for (let col = 0; col < SIZE - 1; col += 1) {
      const value = modules[row]![col];
      if (
        value === modules[row]![col + 1] &&
        value === modules[row + 1]![col] &&
        value === modules[row + 1]![col + 1]
      ) {
        score += 3;
      }
    }
  }
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark += 1;
  score += Math.floor(Math.abs(dark * 100 / (SIZE * SIZE) - 50) / 5) * 10;
  return score;
}

export function qrModules(text: string): boolean[][] {
  if (text.length < 1 || text.length > 42) throw new Error("QR text must be 1–42 characters");
  const bytes = dataCodewords(text);
  const bits = bitsOf([...bytes, ...reedSolomon(bytes, 26)]);
  let best = masked(bits, 0);
  let bestScore = penalty(best);
  for (let mask = 1; mask < 8; mask += 1) {
    const candidate = masked(bits, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
