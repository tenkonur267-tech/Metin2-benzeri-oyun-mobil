/** Basit 2B vektor ve matematik yardimcilari. */

export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const clone = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export function norm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-6 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** a'dan b'ye birim yon vektoru. */
export function dirTo(a: Vec2, b: Vec2): Vec2 {
  return norm(sub(b, a));
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

export const TAU = Math.PI * 2;

/** Aciyi -PI..PI araligina sikistirir. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Aciyi hedefe dogru en fazla `maxStep` kadar dondurur. */
export function rotateToward(cur: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxStep) return target;
  return wrapAngle(cur + Math.sign(d) * maxStep);
}

/** Noktanin AB dogru parcasina en yakin izdusumu. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 < 1e-9) return clone(a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = clamp(t, 0, 1);
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Nokta, merkezi c olan koni icinde mi? (yon birim vektor, yariAci radyan) */
export function inCone(
  p: Vec2,
  c: Vec2,
  dir: Vec2,
  range: number,
  halfAngle: number,
): boolean {
  const d = sub(p, c);
  const l = Math.hypot(d.x, d.y);
  if (l > range) return false;
  if (l < 1e-6) return true;
  const dot = (d.x * dir.x + d.y * dir.y) / l;
  return dot >= Math.cos(halfAngle);
}

export const deg = (r: number): number => (r * 180) / Math.PI;
export const rad = (d: number): number => (d * Math.PI) / 180;
