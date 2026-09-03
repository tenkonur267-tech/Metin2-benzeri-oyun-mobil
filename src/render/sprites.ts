/**
 * Prosedurel sprite cizimi. Tum karakterler, yapilar ve canavarlar
 * calisma aninda Canvas 2D ile cizilir; hazir gorsel dosyasi yoktur.
 *
 * Yerel koordinat sistemi: +X karakterin baktigi yon, +Y sag yani.
 */

import { clamp } from "../core/math";
import type { CharModel, CreatureModel, WeaponKind } from "./models";

export interface AnimState {
  facing: number;
  walkPhase: number;
  moving: boolean;
  /** 0 = savurma yok, 1 = vurusun hemen ardindan. */
  swing: number;
  /** 1 = hazirlik basladi, 0 = vurus ani. */
  windup: number;
  /** 0..1 yetenek kullanma pozu. */
  cast: number;
  /** 0..1 hasar parlamasi. */
  flash: number;
  /** Zaman (nefes alma / duraklama animasyonu icin). */
  time: number;
  /** Can orani (hasarli gorunum icin). */
  hp: number;
}

// ---------------------------------------------------------------------------
// Cizim yardimcilari
// ---------------------------------------------------------------------------

function ell(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  g.beginPath();
  g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
  g.fill();
}

function capsule(
  g: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
): void {
  g.lineCap = "round";
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

function poly(g: CanvasRenderingContext2D, pts: [number, number][]): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
}

/**
 * Gradyan onbellegi. Her karede yuzlerce gradyan uretmek pahalidir;
 * gradyanlar boyama anindaki donusum uzayinda degerlendirildigi icin
 * ayni yerel uzayda tekrar kullanilabilirler.
 */
const gradCache = new Map<string, CanvasGradient>();

function cachedLinear(
  g: CanvasRenderingContext2D,
  key: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: [number, string][],
): CanvasGradient {
  const hit = gradCache.get(key);
  if (hit) return hit;
  const grad = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) grad.addColorStop(o, c);
  gradCache.set(key, grad);
  return grad;
}

function cachedRadial(
  g: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  r0: number,
  r1: number,
  stops: [number, string][],
): CanvasGradient {
  const hit = gradCache.get(key);
  if (hit) return hit;
  const grad = g.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) grad.addColorStop(o, c);
  gradCache.set(key, grad);
  return grad;
}

/** Govde icin ust-sol aydinlatmali gradyan (onbellekli). */
function bodyGradient(
  g: CanvasRenderingContext2D,
  r: number,
  light: string,
  dark: string,
): CanvasGradient {
  return cachedLinear(
    g,
    `body:${r.toFixed(1)}:${light}:${dark}`,
    -r * 0.5,
    -r * 0.7,
    r * 0.4,
    r * 0.8,
    [
      [0, light],
      [1, dark],
    ],
  );
}

// ---------------------------------------------------------------------------
// Sampiyon / insansi karakter
// ---------------------------------------------------------------------------

const BUILD_SCALE: Record<CharModel["build"], { torsoW: number; torsoL: number; limb: number; head: number }> = {
  heavy: { torsoW: 0.74, torsoL: 0.62, limb: 0.24, head: 0.36 },
  medium: { torsoW: 0.66, torsoL: 0.55, limb: 0.21, head: 0.34 },
  slim: { torsoW: 0.58, torsoL: 0.5, limb: 0.18, head: 0.32 },
};

/**
 * Tepeden bakis karakter cizimi.
 * Once zemin/golge, sonra bacaklar, pelerin, govde, kollar+silah,
 * en ustte bas cizilir; bu sira tepeden gorunumu dogru verir.
 */
export function drawCharacter(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  m: CharModel,
  teamColor: string,
  a: AnimState,
): void {
  const b = BUILD_SCALE[m.build];
  const bob = a.moving
    ? Math.abs(Math.sin(a.walkPhase * 2)) * r * 0.05
    : Math.sin(a.time * 2.1) * r * 0.02;

  g.save();
  g.translate(x, y);

  // Zemin golgesi
  g.fillStyle = "rgba(0,0,0,0.42)";
  ell(g, 0, r * 0.42, r * 0.88, r * 0.34);

  g.save();
  g.rotate(a.facing);
  g.translate(0, 0);

  // --- Bacaklar (govdenin arkasindan cikar) ---
  const legSwing = a.moving ? Math.sin(a.walkPhase * 2) * r * 0.3 : 0;
  g.strokeStyle = m.bodyDark;
  capsule(g, -r * 0.1, -b.torsoW * r * 0.42, -r * 0.42 + legSwing, -b.torsoW * r * 0.5, b.limb * r);
  capsule(g, -r * 0.1, b.torsoW * r * 0.42, -r * 0.42 - legSwing, b.torsoW * r * 0.5, b.limb * r);
  g.fillStyle = m.bodyDark;
  ell(g, -r * 0.44 + legSwing, -b.torsoW * r * 0.5, r * 0.13, r * 0.1);
  ell(g, -r * 0.44 - legSwing, b.torsoW * r * 0.5, r * 0.13, r * 0.1);

  // --- Pelerin ---
  if (m.cape) {
    const wave = Math.sin(a.walkPhase * 2 + 1) * r * 0.12 * (a.moving ? 1 : 0.25);
    g.fillStyle = m.cape;
    poly(g, [
      [-r * 0.05, -b.torsoW * r * 0.85],
      [-r * 0.85 + wave * 0.3, -b.torsoW * r * 0.8 + wave],
      [-r * 0.95, 0],
      [-r * 0.85 + wave * 0.3, b.torsoW * r * 0.8 + wave],
      [-r * 0.05, b.torsoW * r * 0.85],
    ]);
    g.fillStyle = "rgba(0,0,0,0.28)";
    poly(g, [
      [-r * 0.4, -b.torsoW * r * 0.5],
      [-r * 0.92, 0],
      [-r * 0.4, b.torsoW * r * 0.5],
    ]);
  }

  g.translate(bob, 0);

  // --- Govde ---
  g.fillStyle = "rgba(6,12,20,0.75)";
  ell(g, 0, 0, b.torsoL * r + r * 0.07, b.torsoW * r + r * 0.07);
  g.fillStyle = bodyGradient(g, r, m.body, m.bodyDark);
  ell(g, 0, 0, b.torsoL * r, b.torsoW * r);

  // Gogus arma seridi (takim rengi)
  g.fillStyle = teamColor;
  g.globalAlpha = 0.8;
  poly(g, [
    [b.torsoL * r * 0.15, -r * 0.16],
    [b.torsoL * r * 0.85, -r * 0.09],
    [b.torsoL * r * 0.85, r * 0.09],
    [b.torsoL * r * 0.15, r * 0.16],
  ]);
  g.globalAlpha = 1;

  // Sirt/omuz cizgisi
  g.strokeStyle = m.accent;
  g.lineWidth = r * 0.07;
  g.beginPath();
  g.moveTo(-b.torsoL * r * 0.35, -b.torsoW * r * 0.78);
  g.lineTo(-b.torsoL * r * 0.35, b.torsoW * r * 0.78);
  g.stroke();

  // --- Omuzluklar ---
  if (m.pauldrons) {
    g.fillStyle = m.accent;
    ell(g, r * 0.02, -b.torsoW * r * 0.86, r * 0.27, r * 0.22);
    ell(g, r * 0.02, b.torsoW * r * 0.86, r * 0.27, r * 0.22);
    g.fillStyle = "rgba(255,255,255,0.22)";
    ell(g, r * 0.08, -b.torsoW * r * 0.9, r * 0.14, r * 0.1);
    ell(g, r * 0.08, b.torsoW * r * 0.9, r * 0.14, r * 0.1);
  }

  // --- Kollar ve silah ---
  const armAngle =
    a.cast > 0
      ? -0.45 - a.cast * 0.55
      : a.windup > 0
        ? -0.95 * a.windup
        : a.swing > 0
          ? 1.05 * a.swing
          : Math.sin(a.walkPhase * 2 + Math.PI) * (a.moving ? 0.22 : 0.05);

  const shoulderY = b.torsoW * r * 0.66;
  const reach = r * 0.62;
  const hx = r * 0.12 + Math.cos(armAngle) * reach;
  const hy = shoulderY * 0.85 + Math.sin(armAngle) * reach * 0.5;

  const ohAngle = a.cast > 0 ? -0.85 : -0.15 + Math.sin(a.walkPhase * 2) * (a.moving ? 0.18 : 0.03);
  const ox = r * 0.12 + Math.cos(ohAngle) * reach * 0.9;
  const oy = -shoulderY * 0.85 + Math.sin(ohAngle) * reach * 0.4;

  // Sol (yardimci) kol
  g.strokeStyle = m.skin;
  capsule(g, r * 0.02, -shoulderY, ox, oy, b.limb * r * 0.85);
  drawOffhand(g, r, m, ox, oy, a);

  // Sag kol
  g.strokeStyle = m.skin;
  capsule(g, r * 0.02, shoulderY, hx, hy, b.limb * r * 0.85);
  drawWeapon(g, r, m, hx, hy, armAngle, a);

  // --- Bas (en ustte) ---
  const headX = r * 0.1;
  g.fillStyle = "rgba(6,12,20,0.8)";
  ell(g, headX, 0, b.head * r + r * 0.06, b.head * r * 0.94 + r * 0.06);
  g.fillStyle = m.skin;
  ell(g, headX, 0, b.head * r, b.head * r * 0.94);
  drawHead(g, r, m, headX, b.head * r, a);

  // Ust isik
  g.globalAlpha = 0.16;
  g.fillStyle = "#ffffff";
  ell(g, headX - r * 0.06, -r * 0.08, b.head * r * 0.5, b.head * r * 0.34, -0.4);
  g.globalAlpha = 1;

  // --- Parilti ---
  if (m.aura) {
    g.globalAlpha = 0.14 + 0.06 * Math.sin(a.time * 3);
    g.fillStyle = cachedRadial(
      g,
      `aura:${r.toFixed(1)}:${m.aura}`,
      0,
      0,
      r * 0.3,
      r * 1.2,
      [
        [0, m.aura],
        [1, "rgba(0,0,0,0)"],
      ],
    );
    ell(g, 0, 0, r * 1.2, r * 1.2);
    g.globalAlpha = 1;
  }

  g.restore();

  if (a.flash > 0) {
    g.globalAlpha = clamp(a.flash, 0, 1) * 0.5;
    g.fillStyle = "#ffffff";
    ell(g, 0, 0, r * 0.85, r * 0.85);
    g.globalAlpha = 1;
  }

  g.restore();
}

/** Tepeden gorunume uygun bas/baslik detaylari. */
function drawHead(
  g: CanvasRenderingContext2D,
  r: number,
  m: CharModel,
  hx: number,
  hr: number,
  a: AnimState,
): void {
  switch (m.head) {
    case "hood": {
      g.fillStyle = m.body;
      poly(g, [
        [hx - hr * 0.85, -hr * 0.9],
        [hx + hr * 0.3, -hr * 0.95],
        [hx + hr * 0.95, 0],
        [hx + hr * 0.3, hr * 0.95],
        [hx - hr * 0.85, hr * 0.9],
      ]);
      g.fillStyle = "rgba(0,0,0,0.6)";
      ell(g, hx + hr * 0.25, 0, hr * 0.45, hr * 0.5);
      g.fillStyle = m.accent;
      ell(g, hx + hr * 0.35, -hr * 0.24, hr * 0.13, hr * 0.11);
      ell(g, hx + hr * 0.35, hr * 0.24, hr * 0.13, hr * 0.11);
      break;
    }
    case "helm": {
      g.fillStyle = m.accent;
      ell(g, hx, 0, hr * 1.05, hr * 1.0);
      g.fillStyle = "rgba(0,0,0,0.72)";
      poly(g, [
        [hx + hr * 0.15, -hr * 0.55],
        [hx + hr * 1.0, -hr * 0.3],
        [hx + hr * 1.0, hr * 0.3],
        [hx + hr * 0.15, hr * 0.55],
      ]);
      g.fillStyle = m.body;
      g.fillRect(hx + hr * 0.35, -hr * 0.12, hr * 0.62, hr * 0.24);
      g.fillStyle = "rgba(255,255,255,0.25)";
      ell(g, hx - hr * 0.3, -hr * 0.3, hr * 0.4, hr * 0.24, -0.4);
      break;
    }
    case "horned": {
      g.fillStyle = m.hair;
      ell(g, hx - hr * 0.15, 0, hr * 1.0, hr * 1.02);
      g.fillStyle = "#e8e0cf";
      poly(g, [
        [hx - hr * 0.1, -hr * 0.7],
        [hx + hr * 0.85, -hr * 1.5],
        [hx + hr * 0.3, -hr * 0.55],
      ]);
      poly(g, [
        [hx - hr * 0.1, hr * 0.7],
        [hx + hr * 0.85, hr * 1.5],
        [hx + hr * 0.3, hr * 0.55],
      ]);
      g.fillStyle = "rgba(0,0,0,0.5)";
      ell(g, hx + hr * 0.45, -hr * 0.28, hr * 0.14, hr * 0.1);
      ell(g, hx + hr * 0.45, hr * 0.28, hr * 0.14, hr * 0.1);
      break;
    }
    case "crown": {
      g.fillStyle = m.hair;
      ell(g, hx - hr * 0.18, 0, hr * 1.1, hr * 1.05);
      g.fillStyle = "#ffd45e";
      poly(g, [
        [hx + hr * 0.1, -hr * 0.75],
        [hx + hr * 0.5, -hr * 0.5],
        [hx + hr * 0.75, -hr * 0.6],
        [hx + hr * 0.72, 0],
        [hx + hr * 0.75, hr * 0.6],
        [hx + hr * 0.5, hr * 0.5],
        [hx + hr * 0.1, hr * 0.75],
      ]);
      g.fillStyle = "rgba(0,0,0,0.45)";
      ell(g, hx + hr * 0.42, -hr * 0.22, hr * 0.11, hr * 0.09);
      ell(g, hx + hr * 0.42, hr * 0.22, hr * 0.11, hr * 0.09);
      break;
    }
    case "mask": {
      g.fillStyle = m.bodyDark;
      ell(g, hx, 0, hr * 1.02, hr * 0.98);
      g.fillStyle = m.hair;
      poly(g, [
        [hx - hr * 1.2, -hr * 0.5],
        [hx - hr * 0.1, -hr * 0.9],
        [hx - hr * 0.1, hr * 0.9],
        [hx - hr * 1.2, hr * 0.5],
      ]);
      g.fillStyle = m.accent;
      g.globalAlpha = 0.95;
      ell(g, hx + hr * 0.42, -hr * 0.3, hr * 0.2, hr * 0.11, -0.3);
      ell(g, hx + hr * 0.42, hr * 0.3, hr * 0.2, hr * 0.11, 0.3);
      g.globalAlpha = 1;
      break;
    }
    default: {
      g.fillStyle = m.hair;
      poly(g, [
        [hx - hr * 1.15, -hr * 0.85],
        [hx + hr * 0.2, -hr * 1.0],
        [hx + hr * 0.35, 0],
        [hx + hr * 0.2, hr * 1.0],
        [hx - hr * 1.15, hr * 0.85],
      ]);
      g.fillStyle = "rgba(0,0,0,0.5)";
      ell(g, hx + hr * 0.5, -hr * 0.28, hr * 0.14, hr * 0.1);
      ell(g, hx + hr * 0.5, hr * 0.28, hr * 0.14, hr * 0.1);
    }
  }
}

function drawOffhand(
  g: CanvasRenderingContext2D,
  r: number,
  m: CharModel,
  ox: number,
  oy: number,
  a: AnimState,
): void {
  switch (m.offhand) {
    case "shield": {
      g.save();
      g.translate(ox, oy);
      g.rotate(0.25);
      g.fillStyle = m.accent;
      poly(g, [
        [-r * 0.14, -r * 0.34],
        [r * 0.24, -r * 0.26],
        [r * 0.28, r * 0.26],
        [-r * 0.14, r * 0.34],
      ]);
      g.fillStyle = "rgba(0,0,0,0.3)";
      ell(g, r * 0.06, 0, r * 0.09, r * 0.14);
      g.fillStyle = "rgba(255,255,255,0.25)";
      poly(g, [
        [-r * 0.12, -r * 0.3],
        [r * 0.06, -r * 0.24],
        [r * 0.02, r * 0.0],
      ]);
      g.restore();
      break;
    }
    case "dagger": {
      g.save();
      g.translate(ox, oy);
      g.rotate(-0.35);
      g.fillStyle = "#dbe6f2";
      poly(g, [
        [0, -r * 0.055],
        [r * 0.46, -r * 0.02],
        [r * 0.52, 0],
        [r * 0.46, r * 0.02],
        [0, r * 0.055],
      ]);
      g.fillStyle = m.accent;
      g.fillRect(-r * 0.1, -r * 0.07, r * 0.12, r * 0.14);
      g.restore();
      break;
    }
    case "orb": {
      const pulse = 1 + 0.14 * Math.sin(a.time * 4);
      g.save();
      g.translate(ox, oy);
      g.fillStyle = cachedRadial(
        g,
        `oh:${r.toFixed(1)}:${m.accent}`,
        0,
        0,
        0,
        r * 0.28,
        [
          [0, "#ffffff"],
          [0.45, m.accent],
          [1, "rgba(0,0,0,0)"],
        ],
      );
      ell(g, 0, 0, r * 0.28 * pulse, r * 0.28 * pulse);
      g.restore();
      break;
    }
    default:
      break;
  }
}

function drawWeapon(
  g: CanvasRenderingContext2D,
  r: number,
  m: CharModel,
  hx: number,
  hy: number,
  angle: number,
  a: AnimState,
): void {
  const steel = "#e2ebf5";
  const steelDark = "#8fa3b8";
  g.save();
  g.translate(hx, hy);
  g.rotate(angle * 0.85);

  const kind: WeaponKind = m.weapon;
  switch (kind) {
    case "greatsword":
    case "sword": {
      const len = kind === "greatsword" ? r * 1.5 : r * 1.1;
      const wdt = kind === "greatsword" ? r * 0.17 : r * 0.11;
      g.fillStyle = "#6b4a2f";
      g.fillRect(-r * 0.26, -r * 0.05, r * 0.3, r * 0.1);
      g.fillStyle = m.accent;
      g.fillRect(-r * 0.02, -r * 0.26, r * 0.08, r * 0.52);
      g.fillStyle = cachedLinear(g, `blade:${wdt.toFixed(1)}`, 0, -wdt, 0, wdt, [
        [0, steel],
        [0.45, "#ffffff"],
        [1, steelDark],
      ]);
      poly(g, [
        [r * 0.07, -wdt],
        [len - r * 0.16, -wdt * 0.75],
        [len, 0],
        [len - r * 0.16, wdt * 0.75],
        [r * 0.07, wdt],
      ]);
      break;
    }
    case "axe": {
      g.fillStyle = "#5d4128";
      g.fillRect(-r * 0.24, -r * 0.06, r * 1.15, r * 0.12);
      g.fillStyle = "#3a2818";
      g.fillRect(r * 0.62, -r * 0.09, r * 0.16, r * 0.18);
      g.fillStyle = cachedLinear(g, `axe:${r.toFixed(1)}`, r * 0.7, -r * 0.45, r * 1.15, r * 0.45, [
        [0, "#ffffff"],
        [0.5, steel],
        [1, steelDark],
      ]);
      // Tek tarafli, sapa oturan balta agzi
      poly(g, [
        [r * 0.7, -r * 0.08],
        [r * 0.78, -r * 0.5],
        [r * 1.16, -r * 0.34],
        [r * 1.02, 0],
        [r * 1.16, r * 0.34],
        [r * 0.78, r * 0.5],
        [r * 0.7, r * 0.08],
      ]);
      g.fillStyle = "rgba(0,0,0,0.2)";
      poly(g, [
        [r * 0.9, -r * 0.4],
        [r * 1.12, -r * 0.3],
        [r * 1.0, 0],
      ]);
      break;
    }
    case "staff":
    case "wand": {
      const len = kind === "staff" ? r * 1.45 : r * 0.95;
      g.strokeStyle = kind === "staff" ? "#6b4a2f" : m.bodyDark;
      capsule(g, -r * 0.28, 0, len, 0, r * 0.1);
      const pulse = 1 + 0.16 * Math.sin(a.time * 5);
      g.fillStyle = cachedRadial(
        g,
        `orb:${r.toFixed(1)}:${len.toFixed(1)}:${m.aura ?? m.accent}`,
        len,
        0,
        0,
        r * 0.38,
        [
          [0, "#ffffff"],
          [0.4, m.aura ?? m.accent],
          [1, "rgba(0,0,0,0)"],
        ],
      );
      g.globalAlpha = 0.85 + 0.15 * Math.sin(a.time * 5);
      ell(g, len, 0, r * 0.38 * pulse, r * 0.38 * pulse);
      g.globalAlpha = 1;
      break;
    }
    case "bow": {
      const draw = clamp(a.windup, 0, 1);
      g.strokeStyle = "#8a6338";
      g.lineWidth = r * 0.1;
      g.beginPath();
      g.arc(r * 0.05, 0, r * 0.72, -1.2, 1.2);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineWidth = r * 0.03;
      const sx = r * 0.05 + Math.cos(1.2) * r * 0.72;
      const sy = Math.sin(1.2) * r * 0.72;
      const pull = -r * 0.4 * draw;
      g.beginPath();
      g.moveTo(sx, -sy);
      g.lineTo(pull, 0);
      g.lineTo(sx, sy);
      g.stroke();
      if (draw > 0.05) {
        g.strokeStyle = "#e8dcc0";
        capsule(g, pull, 0, pull + r * 0.85, 0, r * 0.045);
        g.fillStyle = steel;
        poly(g, [
          [pull + r * 0.85, -r * 0.06],
          [pull + r * 1.0, 0],
          [pull + r * 0.85, r * 0.06],
        ]);
      }
      break;
    }
    case "dagger": {
      g.fillStyle = m.accent;
      g.fillRect(-r * 0.2, -r * 0.06, r * 0.24, r * 0.12);
      g.fillStyle = steel;
      poly(g, [
        [r * 0.04, -r * 0.075],
        [r * 0.58, -r * 0.025],
        [r * 0.68, 0],
        [r * 0.58, r * 0.025],
        [r * 0.04, r * 0.075],
      ]);
      break;
    }
    case "trident": {
      g.strokeStyle = "#3f5560";
      capsule(g, -r * 0.28, 0, r * 1.0, 0, r * 0.11);
      g.strokeStyle = m.accent;
      capsule(g, -r * 0.28, 0, r * 1.0, 0, r * 0.05);
      g.fillStyle = steel;
      for (const off of [-0.3, 0, 0.3]) {
        poly(g, [
          [r * 0.92, off * r - r * 0.045],
          [r * 1.38, off * r * 0.55],
          [r * 0.92, off * r + r * 0.045],
        ]);
      }
      break;
    }
    case "claws": {
      g.fillStyle = steel;
      for (const off of [-0.18, 0, 0.18]) {
        poly(g, [
          [0, off * r],
          [r * 0.6, off * r * 1.5 - r * 0.035],
          [r * 0.62, off * r * 1.5 + r * 0.035],
        ]);
      }
      break;
    }
    case "cannon": {
      g.fillStyle = "#4c5764";
      g.fillRect(-r * 0.18, -r * 0.2, r * 1.05, r * 0.4);
      g.fillStyle = "#2b333d";
      ell(g, r * 0.86, 0, r * 0.14, r * 0.21);
      break;
    }
    default:
      break;
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Minyonlar
// ---------------------------------------------------------------------------

export function drawMinionSprite(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  kind: "melee" | "caster" | "cannon" | "super",
  teamColor: string,
  teamDark: string,
  a: AnimState,
): void {
  const big = kind === "cannon" || kind === "super";
  const bob = a.moving ? Math.abs(Math.sin(a.walkPhase * 2.4)) * r * 0.07 : 0;
  g.save();
  g.translate(x, y);
  g.fillStyle = "rgba(0,0,0,0.36)";
  ell(g, 0, r * 0.4, r * 0.8, r * 0.3);
  g.rotate(a.facing);

  // Bacaklar
  const sw = a.moving ? Math.sin(a.walkPhase * 2.4) * r * 0.26 : 0;
  g.strokeStyle = teamDark;
  capsule(g, -r * 0.08, -r * 0.3, -r * 0.34 + sw, -r * 0.36, r * 0.2);
  capsule(g, -r * 0.08, r * 0.3, -r * 0.34 - sw, r * 0.36, r * 0.2);

  g.translate(bob, 0);

  // Govde
  g.fillStyle = bodyGradient(g, r, teamColor, teamDark);
  ell(g, 0, 0, r * (big ? 0.62 : 0.55), r * (big ? 0.72 : 0.62));

  // Zirh seridi
  g.fillStyle = "rgba(255,255,255,0.2)";
  poly(g, [
    [r * 0.1, -r * 0.12],
    [r * 0.5, -r * 0.06],
    [r * 0.5, r * 0.06],
    [r * 0.1, r * 0.12],
  ]);

  // Silah kolu
  const armAngle = a.windup > 0 ? -0.85 * a.windup : a.swing > 0 ? 0.95 * a.swing : 0;
  g.save();
  g.translate(r * 0.1, r * 0.6);
  g.rotate(armAngle);
  switch (kind) {
    case "caster": {
      g.strokeStyle = "#6b4a2f";
      capsule(g, -r * 0.1, 0, r * 0.6, 0, r * 0.09);
      g.fillStyle = cachedRadial(
        g,
        `mo:${r.toFixed(1)}:${teamColor}`,
        r * 0.66,
        0,
        0,
        r * 0.3,
        [
          [0, "#ffffff"],
          [0.4, teamColor],
          [1, "rgba(0,0,0,0)"],
        ],
      );
      ell(g, r * 0.66, 0, r * 0.3, r * 0.3);
      break;
    }
    case "cannon": {
      g.fillStyle = "#3f4a56";
      g.fillRect(-r * 0.1, -r * 0.17, r * 0.9, r * 0.34);
      g.fillStyle = "#20272f";
      ell(g, r * 0.78, 0, r * 0.12, r * 0.18);
      break;
    }
    default: {
      g.fillStyle = "#6b4a2f";
      g.fillRect(-r * 0.14, -r * 0.05, r * 0.18, r * 0.1);
      g.fillStyle = "#dbe6f2";
      poly(g, [
        [r * 0.02, -r * 0.06],
        [r * 0.62, -r * 0.025],
        [r * 0.7, 0],
        [r * 0.62, r * 0.025],
        [r * 0.02, r * 0.06],
      ]);
    }
  }
  g.restore();

  // Kalkan
  if (kind === "melee" || kind === "super") {
    g.save();
    g.translate(r * 0.16, -r * 0.62);
    g.rotate(0.2);
    g.fillStyle = teamColor;
    poly(g, [
      [-r * 0.1, -r * 0.24],
      [r * 0.18, -r * 0.18],
      [r * 0.2, r * 0.18],
      [-r * 0.1, r * 0.24],
    ]);
    g.fillStyle = "rgba(0,0,0,0.28)";
    ell(g, r * 0.04, 0, r * 0.07, r * 0.1);
    g.restore();
  }

  // Bas / migfer
  const hr = r * 0.32;
  g.fillStyle = "rgba(0,0,0,0.3)";
  ell(g, r * 0.02, r * 0.04, hr * 1.05, hr);
  g.fillStyle = kind === "super" ? "#e6edf5" : "#b9c6d4";
  ell(g, r * 0.08, 0, hr, hr * 0.96);
  g.fillStyle = "rgba(0,0,0,0.65)";
  poly(g, [
    [r * 0.12, -hr * 0.5],
    [r * 0.08 + hr, -hr * 0.28],
    [r * 0.08 + hr, hr * 0.28],
    [r * 0.12, hr * 0.5],
  ]);
  if (kind === "super") {
    g.fillStyle = "#ffd45e";
    poly(g, [
      [r * 0.0, -hr * 0.6],
      [r * 0.18, -hr * 1.5],
      [r * 0.22, -hr * 0.4],
    ]);
  }

  g.restore();

  if (a.flash > 0) {
    g.save();
    g.translate(x, y);
    g.globalAlpha = clamp(a.flash, 0, 1) * 0.5;
    g.fillStyle = "#ffffff";
    ell(g, 0, 0, r * 0.8, r * 0.8);
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// Yapilar
// ---------------------------------------------------------------------------

export function drawTowerSprite(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  teamColor: string,
  teamDark: string,
  time: number,
  aim: number,
  hpPct: number,
  recoil: number,
  tier: number,
): void {
  g.save();
  g.translate(x, y);

  g.fillStyle = "rgba(0,0,0,0.42)";
  ell(g, 0, r * 0.55, r * 1.25, r * 0.5);

  // Taban platform
  g.fillStyle = "#39434f";
  ell(g, 0, r * 0.18, r * 1.15, r * 0.62);
  g.fillStyle = "#4b5866";
  ell(g, 0, r * 0.05, r * 0.98, r * 0.52);

  // Gövde (kule sutunu)
  const h = r * (1.5 + tier * 0.12);
  g.fillStyle = cachedLinear(g, `tower:${r.toFixed(1)}:${h.toFixed(1)}`, -r * 0.6, -h, r * 0.6, r * 0.2, [
    [0, "#7c8a99"],
    [0.55, "#57646f"],
    [1, "#333c46"],
  ]);
  poly(g, [
    [-r * 0.55, r * 0.1],
    [-r * 0.42, -h],
    [r * 0.42, -h],
    [r * 0.55, r * 0.1],
  ]);

  // Takim rengi seritler
  g.fillStyle = teamDark;
  g.fillRect(-r * 0.5, -h * 0.45, r * 1.0, r * 0.18);
  g.fillStyle = teamColor;
  g.fillRect(-r * 0.5, -h * 0.72, r * 1.0, r * 0.14);

  // Hasar catlaklari
  if (hpPct < 0.6) {
    g.strokeStyle = "rgba(20,10,6,0.6)";
    g.lineWidth = r * 0.06;
    g.beginPath();
    g.moveTo(-r * 0.3, -h * 0.85);
    g.lineTo(-r * 0.05, -h * 0.55);
    g.lineTo(-r * 0.25, -h * 0.3);
    g.stroke();
  }
  if (hpPct < 0.3) {
    g.strokeStyle = "rgba(20,10,6,0.55)";
    g.beginPath();
    g.moveTo(r * 0.32, -h * 0.9);
    g.lineTo(r * 0.1, -h * 0.6);
    g.stroke();
  }

  // Taret basi (hedefe doner)
  g.save();
  g.translate(0, -h - r * 0.15);
  g.rotate(aim);
  g.translate(-recoil * r * 0.3, 0);
  g.fillStyle = "#46525f";
  ell(g, 0, 0, r * 0.6, r * 0.52);
  g.fillStyle = teamDark;
  g.fillRect(0, -r * 0.16, r * 0.85, r * 0.32);
  g.fillStyle = teamColor;
  ell(g, r * 0.82, 0, r * 0.14, r * 0.16);
  g.restore();

  // Enerji kristali
  const pulse = 0.75 + 0.25 * Math.sin(time * 3.2 + r);
  g.globalAlpha = 0.85;
  g.fillStyle = cachedRadial(
    g,
    `towerglow:${r.toFixed(1)}:${h.toFixed(1)}:${teamColor}`,
    0,
    -h - r * 0.15,
    0,
    r * 0.9,
    [
      [0, "#ffffff"],
      [0.35, teamColor],
      [1, "rgba(0,0,0,0)"],
    ],
  );
  ell(g, 0, -h - r * 0.15, r * 0.9 * pulse, r * 0.9 * pulse);
  g.globalAlpha = 1;

  g.restore();
}

export function drawInhibitorSprite(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  teamColor: string,
  teamDark: string,
  time: number,
): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = "rgba(0,0,0,0.4)";
  ell(g, 0, r * 0.5, r * 1.0, r * 0.42);

  g.fillStyle = "#3b4652";
  ell(g, 0, r * 0.2, r * 0.9, r * 0.42);

  const float = Math.sin(time * 1.7) * r * 0.12;
  g.save();
  g.translate(0, -r * 0.35 + float);
  g.rotate(time * 0.6);
  const grad = g.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, teamColor);
  grad.addColorStop(1, teamDark);
  g.fillStyle = grad;
  poly(g, [
    [0, -r * 1.05],
    [r * 0.6, 0],
    [0, r * 0.8],
    [-r * 0.6, 0],
  ]);
  g.fillStyle = "rgba(255,255,255,0.35)";
  poly(g, [
    [0, -r * 1.0],
    [r * 0.28, -r * 0.1],
    [0, r * 0.2],
  ]);
  g.restore();

  g.globalAlpha = 0.4 + 0.15 * Math.sin(time * 3);
  const rg = g.createRadialGradient(0, -r * 0.35, 0, 0, -r * 0.35, r * 1.5);
  rg.addColorStop(0, teamColor);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  ell(g, 0, -r * 0.35, r * 1.5, r * 1.5);
  g.restore();
}

export function drawNexusSprite(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  teamColor: string,
  teamDark: string,
  time: number,
  hpPct: number,
): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = "rgba(0,0,0,0.45)";
  ell(g, 0, r * 0.5, r * 1.15, r * 0.5);

  // Kaide
  g.fillStyle = "#39434f";
  ell(g, 0, r * 0.25, r * 1.05, r * 0.5);
  g.fillStyle = "#4c5967";
  ell(g, 0, r * 0.12, r * 0.85, r * 0.4);

  // Yorungedeki parcalar
  for (let i = 0; i < 3; i++) {
    const ang = time * 0.8 + (i / 3) * Math.PI * 2;
    const rad = r * 0.95;
    g.fillStyle = teamColor;
    g.globalAlpha = 0.7;
    ell(
      g,
      Math.cos(ang) * rad,
      Math.sin(ang) * rad * 0.45 - r * 0.35,
      r * 0.1,
      r * 0.14,
      ang,
    );
  }
  g.globalAlpha = 1;

  // Ana kristal
  const float = Math.sin(time * 1.3) * r * 0.08;
  const scale = 0.7 + 0.3 * hpPct;
  g.save();
  g.translate(0, -r * 0.4 + float);
  g.rotate(time * 0.35);
  const grad = g.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.35, teamColor);
  grad.addColorStop(1, teamDark);
  g.fillStyle = "rgba(6,12,20,0.8)";
  poly(g, [
    [0, -r * 1.32 * scale],
    [r * 0.7 * scale, -r * 0.15],
    [0, r * 1.02 * scale],
    [-r * 0.7 * scale, -r * 0.15],
  ]);
  g.fillStyle = grad;
  poly(g, [
    [0, -r * 1.25 * scale],
    [r * 0.62 * scale, -r * 0.15],
    [0, r * 0.95 * scale],
    [-r * 0.62 * scale, -r * 0.15],
  ]);
  g.fillStyle = "rgba(255,255,255,0.55)";
  poly(g, [
    [0, -r * 1.2 * scale],
    [r * 0.26 * scale, -r * 0.2],
    [0, r * 0.3 * scale],
  ]);
  g.restore();

  g.globalAlpha = 0.3 + 0.12 * Math.sin(time * 2.4);
  const rg = g.createRadialGradient(0, -r * 0.4, 0, 0, -r * 0.4, r * 2.2);
  rg.addColorStop(0, teamColor);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  ell(g, 0, -r * 0.4, r * 2.2, r * 2.2);
  g.restore();
}

// ---------------------------------------------------------------------------
// Orman canavarlari
// ---------------------------------------------------------------------------

export function drawCreature(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  m: CreatureModel,
  a: AnimState,
): void {
  const bob = a.moving ? Math.sin(a.walkPhase * 2.2) * r * 0.06 : Math.sin(a.time * 1.8) * r * 0.03;
  g.save();
  g.translate(x, y);
  g.fillStyle = "rgba(0,0,0,0.4)";
  ell(g, 0, r * 0.55, r * 1.1, r * 0.42);
  g.rotate(a.facing);
  g.translate(0, bob);

  const legSwing = a.moving ? Math.sin(a.walkPhase * 2.2) * r * 0.3 : 0;

  // Kanatlar (govde arkasinda)
  if (m.wings) {
    const flap = Math.sin(a.time * (a.moving ? 7 : 2.5)) * 0.35;
    g.fillStyle = m.bodyDark;
    g.globalAlpha = 0.9;
    for (const side of [-1, 1]) {
      g.save();
      g.rotate(0);
      poly(g, [
        [-r * 0.2, side * r * 0.4],
        [-r * 1.1, side * r * (1.1 + flap)],
        [r * 0.2, side * r * (0.95 + flap * 0.6)],
        [r * 0.3, side * r * 0.45],
      ]);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  // Kuyruk
  if (m.tail) {
    g.strokeStyle = m.bodyDark;
    const wag = Math.sin(a.walkPhase * 2.2 + 1) * r * 0.3;
    capsule(g, -r * 0.6, 0, -r * 1.25, wag, r * 0.18);
  }

  // Bacaklar
  g.strokeStyle = m.bodyDark;
  if (m.legs >= 4) {
    capsule(g, r * 0.35, -r * 0.5, r * 0.35 + legSwing, -r * 0.62, r * 0.2);
    capsule(g, r * 0.35, r * 0.5, r * 0.35 - legSwing, r * 0.62, r * 0.2);
    capsule(g, -r * 0.35, -r * 0.5, -r * 0.35 - legSwing, -r * 0.62, r * 0.2);
    capsule(g, -r * 0.35, r * 0.5, -r * 0.35 + legSwing, r * 0.62, r * 0.2);
  } else {
    capsule(g, 0, -r * 0.45, legSwing, -r * 0.6, r * 0.26);
    capsule(g, 0, r * 0.45, -legSwing, r * 0.6, r * 0.26);
  }

  // Govde
  g.fillStyle = bodyGradient(g, r, m.body, m.bodyDark);
  if (m.shape === "golem") {
    poly(g, [
      [-r * 0.7, -r * 0.75],
      [r * 0.7, -r * 0.6],
      [r * 0.8, r * 0.6],
      [-r * 0.6, r * 0.8],
    ]);
    g.fillStyle = m.accent;
    ell(g, r * 0.1, -r * 0.1, r * 0.22, r * 0.18, 0.4);
    ell(g, -r * 0.3, r * 0.25, r * 0.16, r * 0.13, -0.3);
  } else {
    ell(g, 0, 0, r * 0.85, r * 0.6);
  }

  // Bas
  const hx = r * 0.85;
  g.fillStyle = m.body;
  if (m.shape === "wolf" || m.shape === "boar") {
    poly(g, [
      [hx - r * 0.15, -r * 0.34],
      [hx + r * 0.55, -r * 0.14],
      [hx + r * 0.58, r * 0.14],
      [hx - r * 0.15, r * 0.34],
    ]);
    // Kulaklar / disler
    g.fillStyle = m.bodyDark;
    if (m.shape === "wolf") {
      poly(g, [[hx - r * 0.1, -r * 0.3], [hx + r * 0.05, -r * 0.62], [hx + r * 0.18, -r * 0.26]]);
      poly(g, [[hx - r * 0.1, r * 0.3], [hx + r * 0.05, r * 0.62], [hx + r * 0.18, r * 0.26]]);
    } else if (m.horns) {
      g.fillStyle = "#e8e0cf";
      poly(g, [[hx + r * 0.35, -r * 0.14], [hx + r * 0.75, -r * 0.42], [hx + r * 0.42, -r * 0.04]]);
      poly(g, [[hx + r * 0.35, r * 0.14], [hx + r * 0.75, r * 0.42], [hx + r * 0.42, r * 0.04]]);
    }
  } else if (m.shape === "dragon") {
    poly(g, [
      [hx - r * 0.2, -r * 0.4],
      [hx + r * 0.75, -r * 0.16],
      [hx + r * 0.8, r * 0.16],
      [hx - r * 0.2, r * 0.4],
    ]);
    g.fillStyle = m.accent;
    poly(g, [[hx, -r * 0.34], [hx + r * 0.3, -r * 0.8], [hx + r * 0.24, -r * 0.24]]);
    poly(g, [[hx, r * 0.34], [hx + r * 0.3, r * 0.8], [hx + r * 0.24, r * 0.24]]);
  } else {
    ell(g, hx, 0, r * 0.4, r * 0.34);
    g.fillStyle = m.accent;
    poly(g, [[hx + r * 0.2, -r * 0.1], [hx + r * 0.8, 0], [hx + r * 0.2, r * 0.1]]);
  }

  // Gozler
  g.fillStyle = "#ffd45e";
  ell(g, hx + r * 0.12, -r * 0.14, r * 0.07, r * 0.06);
  ell(g, hx + r * 0.12, r * 0.14, r * 0.07, r * 0.06);

  // Sirt dikenleri
  if (m.shape === "dragon" || m.shape === "golem") {
    g.fillStyle = m.accent;
    for (let i = -1; i <= 1; i++) {
      poly(g, [
        [i * r * 0.35 - r * 0.1, 0],
        [i * r * 0.35, -r * 0.3],
        [i * r * 0.35 + r * 0.1, 0],
      ]);
    }
  }

  g.restore();

  if (a.flash > 0) {
    g.save();
    g.translate(x, y);
    g.globalAlpha = clamp(a.flash, 0, 1) * 0.5;
    g.fillStyle = "#ffffff";
    ell(g, 0, 0, r * 1.1, r * 0.9);
    g.restore();
  }
}
