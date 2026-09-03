/**
 * Arazi ureteci: koridorlari tikamayan duvar/cali/kamp konumlari uretir.
 * Cikti dogrudan constants.ts icine yapistirilir.
 */
import { LANES, MAP_SIZE, NEXUS_POS, lanePath } from "../src/game/constants";
import { closestPointOnSegment } from "../src/core/math";

interface Rect { x: number; y: number; w: number; h: number }
const segs: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
for (const team of [0, 1] as const) {
  for (const lane of LANES) {
    const p = lanePath(team, lane);
    for (let i = 1; i < p.length; i++) segs.push({ a: p[i - 1], b: p[i] });
  }
}

const distToLanes = (p: { x: number; y: number }): number => {
  let m = Infinity;
  for (const s of segs) {
    const cp = closestPointOnSegment(p, s.a, s.b);
    const d = Math.hypot(cp.x - p.x, cp.y - p.y);
    if (d < m) m = d;
  }
  return m;
};

const distToRiver = (p: { x: number; y: number }): number => Math.abs(p.x - p.y) / Math.SQRT2;

function rectMinLaneDist(r: Rect): number {
  let m = Infinity;
  const step = 8;
  for (let x = r.x; x <= r.x + r.w; x += step) {
    for (let y = r.y; y <= r.y + r.h; y += step) {
      m = Math.min(m, distToLanes({ x, y }));
    }
  }
  return m;
}

function rectMinRiverDist(r: Rect): number {
  let m = Infinity;
  const step = 8;
  for (let x = r.x; x <= r.x + r.w; x += step) {
    for (let y = r.y; y <= r.y + r.h; y += step) {
      m = Math.min(m, distToRiver({ x, y }));
    }
  }
  return m;
}

// Mavi yari: y > x. Duvar adaylari izgarasi.
const LANE_CLEAR = 50;
const RIVER_CLEAR = 44;
const walls: Rect[] = [];

function overlapsAny(r: Rect, list: Rect[], gap: number): boolean {
  return list.some(
    (o) =>
      r.x < o.x + o.w + gap &&
      r.x + r.w + gap > o.x &&
      r.y < o.y + o.h + gap &&
      r.y + r.h + gap > o.y,
  );
}

const sizes: [number, number][] = [
  [78, 46],
  [46, 82],
  [64, 64],
  [96, 40],
  [40, 96],
];

let seed = 20240917;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

for (let attempt = 0; attempt < 60000 && walls.length < 13; attempt++) {
  const [w, h] = sizes[Math.floor(rnd() * sizes.length)];
  const x = Math.round(60 + rnd() * (MAP_SIZE - 160));
  const y = Math.round(60 + rnd() * (MAP_SIZE - 160));
  const r: Rect = { x, y, w, h };
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (cy <= cx) continue; // sadece mavi yari
  if (Math.hypot(cx - NEXUS_POS[0].x, cy - NEXUS_POS[0].y) < 210) continue;
  if (rectMinLaneDist(r) < LANE_CLEAR) continue;
  if (rectMinRiverDist(r) < RIVER_CLEAR) continue;
  // Aynasi da kurallara uymali
  const mr: Rect = { x: MAP_SIZE - x - w, y: MAP_SIZE - y - h, w, h };
  if (rectMinLaneDist(mr) < LANE_CLEAR) continue;
  if (Math.hypot(mr.x + w / 2 - NEXUS_POS[1].x, mr.y + h / 2 - NEXUS_POS[1].y) < 210) continue;
  if (overlapsAny(r, walls, 34)) continue;
  if (overlapsAny(r, walls.map((o) => ({ x: MAP_SIZE - o.x - o.w, y: MAP_SIZE - o.y - o.h, w: o.w, h: o.h })), 34)) continue;
  if (overlapsAny(mr, walls, 34)) continue;
  walls.push(r);
}

// Kamplar: duvarlardan uzak, koridorlardan 70+ birim ic bolgeler
const camps: { x: number; y: number }[] = [];
for (let attempt = 0; attempt < 20000 && camps.length < 4; attempt++) {
  const x = Math.round(150 + rnd() * 600);
  const y = Math.round(150 + rnd() * 700);
  if (y <= x) continue;
  if (Math.hypot(x - NEXUS_POS[0].x, y - NEXUS_POS[0].y) < 240) continue;
  const d = distToLanes({ x, y });
  if (d < 72 || d > 190) continue;
  if (distToRiver({ x, y }) < 70) continue;
  if (walls.some((w) => x > w.x - 42 && x < w.x + w.w + 42 && y > w.y - 42 && y < w.y + w.h + 42)) continue;
  const mx = MAP_SIZE - x;
  const my = MAP_SIZE - y;
  if (walls.some((w) => mx > w.x - 42 && mx < w.x + w.w + 42 && my > w.y - 42 && my < w.y + w.h + 42)) continue;
  if (camps.some((c) => Math.hypot(c.x - x, c.y - y) < 180)) continue;
  camps.push({ x, y });
}

// Calilar: koridor kenarlari ve nehir agzi
const bushes: { x: number; y: number; r: number }[] = [];
for (let attempt = 0; attempt < 20000 && bushes.length < 8; attempt++) {
  const x = Math.round(120 + rnd() * 680);
  const y = Math.round(120 + rnd() * 760);
  if (y <= x) continue;
  const r = 34 + Math.round(rnd() * 10);
  const d = distToLanes({ x, y });
  if (d < 44 || d > 130) continue;
  if (Math.hypot(x - NEXUS_POS[0].x, y - NEXUS_POS[0].y) < 230) continue;
  if (walls.some((w) => x > w.x - r - 8 && x < w.x + w.w + r + 8 && y > w.y - r - 8 && y < w.y + w.h + r + 8)) continue;
  const mx = MAP_SIZE - x;
  const my = MAP_SIZE - y;
  if (walls.some((w) => mx > w.x - r - 8 && mx < w.x + w.w + r + 8 && my > w.y - r - 8 && my < w.y + w.h + r + 8)) continue;
  if (bushes.some((b) => Math.hypot(b.x - x, b.y - y) < 120)) continue;
  if (camps.some((c) => Math.hypot(c.x - x, c.y - y) < 70)) continue;
  bushes.push({ x, y, r });
}

const fmtW = walls.map((w) => `  { x: ${w.x}, y: ${w.y}, w: ${w.w}, h: ${w.h} },`).join("\n");
const fmtB = bushes.map((b) => `  { x: ${b.x}, y: ${b.y}, r: ${b.r} },`).join("\n");
const fmtC = camps.map((c) => `  { x: ${c.x}, y: ${c.y} },`).join("\n");

console.log(`// duvarlar (${walls.length})\n${fmtW}\n`);
console.log(`// calilar (${bushes.length})\n${fmtB}\n`);
console.log(`// kamplar (${camps.length})\n${fmtC}`);
