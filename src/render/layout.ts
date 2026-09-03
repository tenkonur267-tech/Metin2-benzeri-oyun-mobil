import { clamp } from "../core/math";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface HudLayout {
  w: number;
  h: number;
  /** Ana saldiri dugmesi. */
  attack: Circle;
  abilities: Record<"Q" | "W" | "E" | "R", Circle>;
  summoners: [Circle, Circle];
  minimap: Rect;
  shop: Circle;
  recall: Circle;
  scoreboard: Circle;
  autoToggle: Circle;
  /** Hareket cubugunun etkin oldugu bolge. */
  joystickZone: Rect;
  joystickHome: Circle;
  statusBar: Rect;
  /** Skor/sure serodi. */
  scoreBar: Rect;
  /** Olay gunlugunun baslangic y konumu. */
  eventLogY: number;
  narrow: boolean;
}

const A = (deg: number): number => (deg * Math.PI) / 180;

export function computeLayout(w: number, h: number): HudLayout {
  const small = Math.min(w, h);
  // Dugme kumesi dar ekranlarda hareket cubuguyla cakismasin diye
  // hem kisa kenara hem de her iki eksene gore olceklenir.
  const s = clamp(Math.min(small / 400, w / 620, h / 430), 0.62, 1.35);
  const narrow = w < 620;
  const panelW = clamp(w * 0.34, 150, 260);

  const attackR = 40 * s;
  const abilR = 27 * s;
  const ultR = 33 * s;
  const cx = w - (86 * s);
  const cy = h - (84 * s);

  const arc = (angle: number, radius: number, r: number): Circle => ({
    x: cx + Math.cos(A(angle)) * radius,
    y: cy + Math.sin(A(angle)) * radius,
    r,
  });

  const mmSize = clamp(small * 0.3, 96, 190);

  return {
    w,
    h,
    attack: { x: cx, y: cy, r: attackR },
    abilities: {
      Q: arc(184, 108 * s, abilR),
      W: arc(224, 108 * s, abilR),
      E: arc(264, 108 * s, abilR),
      R: arc(204, 172 * s, ultR),
    },
    summoners: [
      { x: w - 26 * s, y: h - 205 * s, r: 19 * s },
      { x: w - 26 * s, y: h - 258 * s, r: 19 * s },
    ],
    minimap: { x: w - mmSize - 8, y: 8, w: mmSize, h: mmSize },
    shop: { x: 34 * s, y: h - 40 * s, r: 22 * s },
    recall: { x: 86 * s, y: h - 40 * s, r: 22 * s },
    scoreboard: { x: w - mmSize - 34, y: 8 + 22, r: 19 * s },
    autoToggle: { x: w - mmSize - 34, y: 8 + 22 + 46 * s, r: 19 * s },
    joystickZone: { x: 0, y: h * 0.28, w: w * 0.46, h: h * 0.72 },
    joystickHome: { x: 96 * s, y: h - 118 * s, r: 52 * s },
    statusBar: { x: 8, y: 8, w: panelW, h: 56 },
    scoreBar: narrow
      ? { x: w / 2 - 80, y: 70, w: 160, h: 28 }
      : { x: w / 2 - 92, y: 4, w: 184, h: 32 },
    eventLogY: narrow ? 110 : 76,
    narrow,
  };
}

export function inCircle(c: Circle, x: number, y: number, pad = 0): boolean {
  const dx = x - c.x;
  const dy = y - c.y;
  const r = c.r + pad;
  return dx * dx + dy * dy <= r * r;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}
