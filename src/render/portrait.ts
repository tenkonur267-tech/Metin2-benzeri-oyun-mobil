/**
 * Sampiyon portresi: oyun ici sprite'i kucuk bir tuvale cizip onbellege alir.
 * Menu kartlarinda ve HUD panelinde kullanilir.
 */
import { championModel } from "./models";
import { drawCharacter, type AnimState } from "./sprites";

const cache = new Map<string, HTMLCanvasElement>();

const POSE: AnimState = {
  facing: 0,
  walkPhase: 0,
  moving: false,
  swing: 0,
  windup: 0,
  cast: 0,
  flash: 0,
  time: 0.4,
  hp: 1,
};

export function championPortrait(
  id: string,
  size: number,
  accent = "#4aa8ff",
  bg = true,
): HTMLCanvasElement {
  const key = `${id}:${size}:${accent}:${bg ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const cv = document.createElement("canvas");
  cv.width = Math.round(size * dpr);
  cv.height = Math.round(size * dpr);
  cv.style.width = `${size}px`;
  cv.style.height = `${size}px`;
  const g = cv.getContext("2d")!;
  g.scale(dpr, dpr);

  const m = championModel(id);
  if (bg) {
    const grad = g.createRadialGradient(size * 0.35, size * 0.25, 2, size * 0.5, size * 0.5, size * 0.75);
    grad.addColorStop(0, m.accent);
    grad.addColorStop(0.5, m.body);
    grad.addColorStop(1, "#050d16");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    g.globalAlpha = 0.18;
    g.fillStyle = "#000";
    g.fillRect(0, size * 0.62, size, size * 0.38);
    g.globalAlpha = 1;
  }

  g.save();
  g.translate(size * 0.42, size * 0.55);
  drawCharacter(g, 0, 0, size * 0.36, m, accent, POSE);
  g.restore();

  cache.set(key, cv);
  return cv;
}

/** Portreyi bir img/div icine gomulebilir veri URL'si olarak dondurur. */
export function championPortraitUrl(id: string, size: number, accent?: string): string {
  return championPortrait(id, size, accent).toDataURL("image/png");
}
