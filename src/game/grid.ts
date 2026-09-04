import { clamp, type Vec2 } from "../core/math";
import { MAP_SIZE, WALLS, type WallRect } from "./constants";

export const CELL = 20;
export const GRID_N = MAP_SIZE / CELL; // 50x50

/** Duvar hucrelerini isaretleyen izgara (1 = gecilmez). */
export const blocked: Uint8Array = new Uint8Array(GRID_N * GRID_N);

/**
 * Harita cevresindeki gecilmez kayalik bandin kalinligi.
 *
 * Arazi kenari yukselen bir kaya sirtiyla kapaniyor; oyuncu bu sirtin
 * icinden gecmesin diye bant yol bulma izgarasinda da kapatilir.
 * Deger, kayalarin ic yuzuyle ayni hizada tutulur (bkz. terrain.ts).
 */
export const BORDER = 70;

function rasterize(): void {
  for (const w of WALLS) markRect(w);
  markBorder();
}

/** Harita kenarindaki bandi kapatir. */
function markBorder(): void {
  for (let y = 0; y < GRID_N; y++) {
    for (let x = 0; x < GRID_N; x++) {
      const cx = x * CELL + CELL / 2;
      const cy = y * CELL + CELL / 2;
      const d = Math.min(cx, cy, MAP_SIZE - cx, MAP_SIZE - cy);
      if (d < BORDER) blocked[y * GRID_N + x] = 1;
    }
  }
}

function markRect(w: WallRect): void {
  const x0 = Math.max(0, Math.floor(w.x / CELL));
  const y0 = Math.max(0, Math.floor(w.y / CELL));
  const x1 = Math.min(GRID_N - 1, Math.floor((w.x + w.w) / CELL));
  const y1 = Math.min(GRID_N - 1, Math.floor((w.y + w.h) / CELL));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) blocked[y * GRID_N + x] = 1;
  }
}

rasterize();

export function isWallAt(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return true;
  const cx = (x / CELL) | 0;
  const cy = (y / CELL) | 0;
  return blocked[cy * GRID_N + cx] === 1;
}

/** Yaricapi hesaba katarak konumun gecerli olup olmadigini kontrol eder. */
export function isBlockedCircle(x: number, y: number, r: number): boolean {
  if (x - r < 0 || y - r < 0 || x + r > MAP_SIZE || y + r > MAP_SIZE) return true;
  const s = Math.max(4, r * 0.75);
  return (
    isWallAt(x, y) ||
    isWallAt(x + s, y) ||
    isWallAt(x - s, y) ||
    isWallAt(x, y + s) ||
    isWallAt(x, y - s)
  );
}

/** Iki nokta arasinda duvar var mi? (isin yurume) */
export function hasLineOfSight(a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.ceil(Math.hypot(dx, dy) / (CELL * 0.5));
  if (steps <= 0) return true;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (isWallAt(a.x + dx * t, a.y + dy * t)) return false;
  }
  return true;
}

/** En yakin gecilebilir noktayi bulur (spiral arama). */
export function nearestFree(p: Vec2, r = 14): Vec2 {
  if (!isBlockedCircle(p.x, p.y, r)) return { x: p.x, y: p.y };
  for (let ring = 1; ring <= 14; ring++) {
    const rad = ring * CELL * 0.8;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = clamp(p.x + Math.cos(a) * rad, r, MAP_SIZE - r);
      const y = clamp(p.y + Math.sin(a) * rad, r, MAP_SIZE - r);
      if (!isBlockedCircle(x, y, r)) return { x, y };
    }
  }
  return { x: clamp(p.x, r, MAP_SIZE - r), y: clamp(p.y, r, MAP_SIZE - r) };
}

// ---------------------------------------------------------------------------
// A* yol bulma
// ---------------------------------------------------------------------------

const gScore = new Float32Array(GRID_N * GRID_N);
const fScore = new Float32Array(GRID_N * GRID_N);
const cameFrom = new Int32Array(GRID_N * GRID_N);
const closed = new Uint8Array(GRID_N * GRID_N);
const openMark = new Uint8Array(GRID_N * GRID_N);

const NEI = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.4142],
  [1, -1, 1.4142],
  [-1, 1, 1.4142],
  [-1, -1, 1.4142],
] as const;

/** Basit ikili yigin (min-heap). */
class Heap {
  private data: number[] = [];
  private key: Float32Array;

  constructor(key: Float32Array) {
    this.key = key;
  }

  clear(): void {
    this.data.length = 0;
  }

  get size(): number {
    return this.data.length;
  }

  push(v: number): void {
    const d = this.data;
    d.push(v);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.key[d[p]] <= this.key[d[i]]) break;
      [d[p], d[i]] = [d[i], d[p]];
      i = p;
    }
  }

  pop(): number {
    const d = this.data;
    const top = d[0];
    const last = d.pop()!;
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < d.length && this.key[d[l]] < this.key[d[m]]) m = l;
        if (r < d.length && this.key[d[r]] < this.key[d[m]]) m = r;
        if (m === i) break;
        [d[m], d[i]] = [d[i], d[m]];
        i = m;
      }
    }
    return top;
  }
}

const heap = new Heap(fScore);

/**
 * Izgara uzerinde yol bulur ve duzlestirilmis nokta listesi dondurur.
 * Yol bulunamazsa bos dizi doner.
 */
export function findPath(from: Vec2, to: Vec2): Vec2[] {
  const sx = clamp((from.x / CELL) | 0, 0, GRID_N - 1);
  const sy = clamp((from.y / CELL) | 0, 0, GRID_N - 1);
  let tx = clamp((to.x / CELL) | 0, 0, GRID_N - 1);
  let ty = clamp((to.y / CELL) | 0, 0, GRID_N - 1);

  if (blocked[ty * GRID_N + tx]) {
    const free = nearestFree(to, 10);
    tx = clamp((free.x / CELL) | 0, 0, GRID_N - 1);
    ty = clamp((free.y / CELL) | 0, 0, GRID_N - 1);
  }

  const start = sy * GRID_N + sx;
  const goal = ty * GRID_N + tx;
  if (start === goal) return [{ x: to.x, y: to.y }];

  closed.fill(0);
  openMark.fill(0);
  gScore.fill(Infinity);
  cameFrom.fill(-1);
  heap.clear();

  gScore[start] = 0;
  fScore[start] = heuristic(sx, sy, tx, ty);
  heap.push(start);
  openMark[start] = 1;

  let iter = 0;
  while (heap.size > 0 && iter++ < 6000) {
    const cur = heap.pop();
    if (cur === goal) return buildPath(cur, from, to);
    closed[cur] = 1;
    const cx = cur % GRID_N;
    const cy = (cur / GRID_N) | 0;

    for (const [dx, dy, cost] of NEI) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_N || ny >= GRID_N) continue;
      const ni = ny * GRID_N + nx;
      if (blocked[ni] || closed[ni]) continue;
      // Kose kesmeyi engelle
      if (dx !== 0 && dy !== 0) {
        if (blocked[cy * GRID_N + nx] || blocked[ny * GRID_N + cx]) continue;
      }
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        fScore[ni] = tentative + heuristic(nx, ny, tx, ty);
        cameFrom[ni] = cur;
        if (!openMark[ni]) {
          openMark[ni] = 1;
          heap.push(ni);
        } else {
          heap.push(ni);
        }
      }
    }
  }
  return [];
}

function heuristic(x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.abs(x0 - x1);
  const dy = Math.abs(y0 - y1);
  return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy);
}

function buildPath(goal: number, from: Vec2, to: Vec2): Vec2[] {
  const cells: number[] = [];
  let c = goal;
  while (c !== -1) {
    cells.push(c);
    c = cameFrom[c];
  }
  cells.reverse();

  const pts: Vec2[] = cells.map((i) => ({
    x: (i % GRID_N) * CELL + CELL / 2,
    y: ((i / GRID_N) | 0) * CELL + CELL / 2,
  }));
  pts[pts.length - 1] = { x: to.x, y: to.y };

  // Gorus hatti ile duzlestirme
  const out: Vec2[] = [];
  let cur: Vec2 = { x: from.x, y: from.y };
  let i = 0;
  while (i < pts.length) {
    let best = i;
    for (let j = pts.length - 1; j > i; j--) {
      if (hasLineOfSight(cur, pts[j])) {
        best = j;
        break;
      }
    }
    out.push(pts[best]);
    cur = pts[best];
    if (best === pts.length - 1) break;
    i = best + 1;
  }
  return out;
}
