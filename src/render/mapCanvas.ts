import { BUSHES, LANES, MAP_SIZE, NEXUS_POS, WALLS, lanePath } from "../game/constants";

const RES = 1200;
const K = RES / MAP_SIZE;

/** Statik harita bir kez cizilip onbellege alinir. */
export function buildMapCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = RES;
  cv.height = RES;
  const g = cv.getContext("2d")!;
  g.scale(K, K);

  // --- Zemin ---
  const grad = g.createLinearGradient(0, 0, MAP_SIZE, MAP_SIZE);
  grad.addColorStop(0, "#1b3a2c");
  grad.addColorStop(0.5, "#142b34");
  grad.addColorStop(1, "#1b2a3c");
  g.fillStyle = grad;
  g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

  // Doku
  g.globalAlpha = 0.06;
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * MAP_SIZE;
    const y = Math.random() * MAP_SIZE;
    g.fillStyle = Math.random() > 0.5 ? "#7fd0a0" : "#204050";
    g.fillRect(x, y, 3, 3);
  }
  g.globalAlpha = 1;

  // --- Nehir (y = x ekseni boyunca) ---
  g.save();
  g.strokeStyle = "#1d4a63";
  g.lineWidth = 96;
  g.lineCap = "round";
  g.globalAlpha = 0.85;
  g.beginPath();
  g.moveTo(-40, -40);
  g.lineTo(MAP_SIZE + 40, MAP_SIZE + 40);
  g.stroke();
  g.strokeStyle = "#2c6f8f";
  g.lineWidth = 62;
  g.globalAlpha = 0.55;
  g.beginPath();
  g.moveTo(-40, -40);
  g.lineTo(MAP_SIZE + 40, MAP_SIZE + 40);
  g.stroke();
  g.restore();

  // --- Koridorlar ---
  for (const lane of LANES) {
    const p = lanePath(0, lane);
    g.save();
    g.strokeStyle = "#4a5f42";
    g.globalAlpha = 0.75;
    g.lineWidth = 74;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
    g.stroke();

    g.strokeStyle = "#66804f";
    g.globalAlpha = 0.6;
    g.lineWidth = 52;
    g.beginPath();
    g.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
    g.stroke();
    g.restore();
  }

  // --- Usler ---
  for (const team of [0, 1] as const) {
    const c = NEXUS_POS[team];
    const col = team === 0 ? "#2b6fae" : "#a8443a";
    const rg = g.createRadialGradient(c.x, c.y, 10, c.x, c.y, 150);
    rg.addColorStop(0, col);
    rg.addColorStop(0.55, team === 0 ? "#1c4a76" : "#742f28");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.8;
    g.fillStyle = rg;
    g.beginPath();
    g.arc(c.x, c.y, 150, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  // --- Calilar ---
  for (const b of BUSHES) {
    g.fillStyle = "#2f5c36";
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3e8241";
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + b.x;
      const rr = b.r * 0.62;
      g.beginPath();
      g.arc(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, b.r * 0.36, 0, Math.PI * 2);
      g.fill();
    }
  }

  // --- Duvarlar ---
  WALLS.forEach((wl, wi) => {
    const r = 8 + (wi % 3) * 4;
    g.fillStyle = "#0b1620";
    roundRect(g, wl.x + 2, wl.y + 3, wl.w, wl.h, r);
    g.fill();
    const wg = g.createLinearGradient(wl.x, wl.y, wl.x, wl.y + wl.h);
    wg.addColorStop(0, "#3d4b5b");
    wg.addColorStop(0.45, "#2c3846");
    wg.addColorStop(1, "#1a222c");
    g.fillStyle = wg;
    roundRect(g, wl.x, wl.y, wl.w, wl.h, r);
    g.fill();
    g.strokeStyle = "#57697c";
    g.lineWidth = 2;
    g.stroke();
    // Kaya dokusu
    g.save();
    roundRect(g, wl.x, wl.y, wl.w, wl.h, r);
    g.clip();
    g.globalAlpha = 0.35;
    for (let i = 0; i < 7; i++) {
      const px = wl.x + ((i * 37) % wl.w);
      const py = wl.y + ((i * 53) % wl.h);
      g.fillStyle = i % 2 ? "#4e6175" : "#222c37";
      g.beginPath();
      g.arc(px, py, 5 + (i % 3) * 2.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // Kenar cimenleri
    g.globalAlpha = 0.5;
    g.fillStyle = "#223a2a";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + wi;
      g.beginPath();
      g.ellipse(
        wl.x + wl.w / 2 + Math.cos(a) * (wl.w / 2 + 5),
        wl.y + wl.h / 2 + Math.sin(a) * (wl.h / 2 + 5),
        9,
        6,
        a,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    g.globalAlpha = 1;
  });

  // Kenar cercevesi
  g.strokeStyle = "#0a1420";
  g.lineWidth = 14;
  g.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

  return cv;
}

export function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
