import { sfx } from "../core/audio";
import { clamp, type Vec2 } from "../core/math";
import {
  BUSHES,
  LANES,
  MAP_SIZE,
  NEXUS_POS,
  TEAM_COLORS,
  WALLS,
  lanePath,
} from "../game/constants";
import type { Champion } from "../game/champion";
import type { World } from "../game/world";
import type { HudLayout } from "./layout";
import { roundRect } from "./draw";
import { championPortrait } from "../render3d/portrait3d";

/** HUD'un ihtiyac duydugu kamera/goruntu arayuzu (3B sahne saglar). */
export interface View {
  vw: number;
  vh: number;
  toScreen(x: number, y: number, height?: number): Vec2;
  toWorld(sx: number, sy: number): Vec2;
  groundHeight(x: number, y: number): number;
  isBehind(x: number, y: number, height?: number): boolean;
}

export type AbilityKey = "Q" | "W" | "E" | "R";
export type AimKey = AbilityKey | "D" | "F" | "A";

export interface UiState {
  joystick: { active: boolean; id: number; base: Vec2; cur: Vec2 };
  aim: { key: AimKey | null; id: number; origin: Vec2; cur: Vec2; moved: number };
  /** Ekran yonunu zemin yonune cevirir (kamera acisina gore). */
  screenDir: (dx: number, dy: number) => Vec2;
  autoAttack: boolean;
  showScore: boolean;
  toast: { text: string; life: number }[];
}

export function newUiState(): UiState {
  return {
    joystick: { active: false, id: -1, base: { x: 0, y: 0 }, cur: { x: 0, y: 0 } },
    aim: { key: null, id: -1, origin: { x: 0, y: 0 }, cur: { x: 0, y: 0 }, moved: 0 },
    screenDir: (dx, dy) => ({ x: dx, y: dy }),
    autoAttack: true,
    showScore: false,
    toast: [],
  };
}

/** Yetenek simgeleri. */
export const ABILITY_ICON: Record<string, string> = {
  "kaya:Q": "🪨", "kaya:W": "🛡️", "kaya:E": "💥", "kaya:R": "🌋",
  "selin:Q": "🌙", "selin:W": "✨", "selin:E": "🌀", "selin:R": "🌕",
  "demir:Q": "🎯", "demir:W": "💨", "demir:E": "🤸", "demir:R": "⚡",
  "golge:Q": "🗡️", "golge:W": "🌫️", "golge:E": "🔪", "golge:R": "☠️",
  "ayla:Q": "🔆", "ayla:W": "💚", "ayla:E": "🍃", "ayla:R": "🌟",
  "bozkurt:Q": "🐾", "bozkurt:W": "🩸", "bozkurt:E": "🐺", "bozkurt:R": "🦷",
  "deniz:Q": "🌊", "deniz:W": "🫧", "deniz:E": "🌀", "deniz:R": "🌪️",
  "alev:Q": "🔥", "alev:W": "♨️", "alev:E": "💫", "alev:R": "☄️",
};

const FONT = "sans-serif";

export function drawHud(
  g: CanvasRenderingContext2D,
  world: World,
  view: View,
  L: HudLayout,
  ui: UiState,
): void {
  const p = world.player;

  drawUnitOverlays(g, world, view);
  drawFloatingText(g, world, view);
  drawTopBar(g, world, L);
  drawPlayerPanel(g, world, L, p);
  drawMinimap(g, world, view, L);
  drawEventLog(g, world, L);
  drawJoystick(g, L, ui);
  drawButtons(g, world, L, ui, p);
  if (!p.alive) drawDeathOverlay(g, L, p);
  drawToasts(g, L, ui);
}


// ---------------------------------------------------------------------------
// Birim ustu bilgiler (can cubugu, isim, seviye) - ekran uzayinda cizilir
// ---------------------------------------------------------------------------

/** Birimin basinin ustundeki yukseklik (oyun birimi). */
function headHeight(u: import("../game/units").Unit): number {
  switch (u.kind) {
    case "champion":
      return u.radius * 3.2;
    case "minion":
      return u.radius * 2.9;
    case "monster":
      return u.radius * 2.8;
    case "tower":
      return u.radius * 6.2;
    case "inhibitor":
      return u.radius * 4.0;
    default:
      return u.radius * 4.2;
  }
}

function miniBar(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  pct: number,
  color: string,
): void {
  const x = cx - w / 2;
  g.fillStyle = "rgba(0,0,0,0.62)";
  g.fillRect(x - 1, cy - 1, w + 2, h + 2);
  g.fillStyle = color;
  g.fillRect(x, cy, w * clamp(pct, 0, 1), h);
}

export function drawUnitOverlays(
  g: CanvasRenderingContext2D,
  world: World,
  view: View,
): void {
  const p = world.player;
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";

  const onScreen = (u: import("../game/units").Unit, hh: number): Vec2 | null => {
    if (view.isBehind(u.pos.x, u.pos.y, view.groundHeight(u.pos.x, u.pos.y) + hh)) return null;
    const s = view.toScreen(u.pos.x, u.pos.y, view.groundHeight(u.pos.x, u.pos.y) + hh);
    if (s.x < -80 || s.y < -60 || s.x > view.vw + 80 || s.y > view.vh + 60) return null;
    return s;
  };

  // Yapilar
  for (const st of world.structures) {
    if (!st.alive) continue;
    const s = onScreen(st, headHeight(st));
    if (!s) continue;
    const w = st.kind === "nexus" ? 50 : st.kind === "inhibitor" ? 38 : 32;
    miniBar(g, s.x, s.y, w, st.kind === "nexus" ? 6 : 4, st.hpPct, TEAM_COLORS[st.team]);
  }

  // Orman canavarlari
  for (const m of world.monsters) {
    if (!m.alive) continue;
    const s = onScreen(m, headHeight(m));
    if (!s) continue;
    miniBar(g, s.x, s.y, m.spec.epic ? 48 : 32, 4, m.hpPct, "#8fd06a");
    if (m.spec.epic) {
      g.font = "bold 10px sans-serif";
      g.fillStyle = "#c9a0ff";
      g.fillText(m.spec.name, s.x, s.y - 11);
    }
  }

  // Minyonlar
  for (const m of world.minions) {
    if (!m.alive) continue;
    if (m.team !== p.team && !m.visibleTo[p.team]) continue;
    const s = onScreen(m, headHeight(m));
    if (!s) continue;
    miniBar(g, s.x, s.y, 18, 3, m.hpPct, TEAM_COLORS[m.team]);
  }

  // Sampiyonlar
  for (const c of world.champions) {
    if (!c.alive) continue;
    if (c.team !== p.team && !c.visibleTo[p.team]) continue;
    const s = onScreen(c, headHeight(c));
    if (!s) continue;

    const w = 48;
    const x = s.x - w / 2;
    const top = s.y;

    g.fillStyle = "rgba(0,0,0,0.66)";
    g.fillRect(x - 1, top - 1, w + 2, 11);
    g.fillStyle = TEAM_COLORS[c.team];
    g.fillRect(x, top, w * c.hpPct, 5);
    const sh = c.shieldAmount;
    if (sh > 0) {
      const sw = Math.min(w * (sh / c.stats.maxHp), w * (1 - c.hpPct));
      g.fillStyle = "#d8f0ff";
      g.fillRect(x + w * c.hpPct, top, sw, 5);
    }
    g.fillStyle = "#3f6fd8";
    g.fillRect(x, top + 6, w * c.mpPct, 3);
    g.strokeStyle = "rgba(255,255,255,0.3)";
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, top + 0.5, w - 1, 4);

    // Seviye rozeti
    g.fillStyle = "#0d1622";
    g.beginPath();
    g.arc(x - 8, top + 4, 7.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#c8a24a";
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = "#ffe08a";
    g.font = "bold 9px sans-serif";
    g.fillText(String(c.level), x - 8, top + 4.5);

    // Isim
    g.font = c.isPlayer ? "bold 11px sans-serif" : "10.5px sans-serif";
    g.lineWidth = 3;
    g.strokeStyle = "rgba(0,0,0,0.75)";
    g.strokeText(c.displayName(), s.x, top - 9);
    g.fillStyle = c.isPlayer ? "#ffe08a" : "rgba(233,243,255,0.92)";
    g.fillText(c.displayName(), s.x, top - 9);

    // Durum etiketleri
    const labels = c.effects
      .filter((e) => e.label && e.time > 0.05)
      .slice(0, 4)
      .map((e) => e.label as string);
    if (labels.length > 0) {
      g.font = "9px sans-serif";
      g.fillStyle = "#9fd0ff";
      g.fillText(labels.join(" "), s.x, top + 20);
    }

    // Geri donus halkasi
    if (c.recallTimer > 0) {
      const pct = 1 - c.recallTimer / 7;
      g.strokeStyle = "#8fd8ff";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(s.x, top + 34, 13, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();
}

export function drawFloatingText(
  g: CanvasRenderingContext2D,
  world: World,
  view: View,
): void {
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const t of world.fx.texts) {
    const h = view.groundHeight(t.pos.x, t.pos.y) + 26;
    if (view.isBehind(t.pos.x, t.pos.y, h)) continue;
    const s = view.toScreen(t.pos.x, t.pos.y, h);
    if (s.x < -60 || s.y < -60 || s.x > view.vw + 60 || s.y > view.vh + 60) continue;
    const a = clamp(t.life / t.maxLife, 0, 1);
    const rise = (1 - a) * 26;
    g.globalAlpha = a;
    g.font = `bold ${t.size}px sans-serif`;
    g.lineWidth = 3;
    g.strokeStyle = "rgba(0,0,0,0.78)";
    g.strokeText(t.text, s.x, s.y - rise);
    g.fillStyle = t.color;
    g.fillText(t.text, s.x, s.y - rise);
  }
  g.restore();
}

// ---------------------------------------------------------------------------

function drawTopBar(g: CanvasRenderingContext2D, world: World, L: HudLayout): void {
  const t = world.time;
  const mm = String(Math.floor(t / 60)).padStart(2, "0");
  const ss = String(Math.floor(t % 60)).padStart(2, "0");
  const b = L.scoreBar;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  g.save();
  g.fillStyle = "rgba(6,16,28,0.86)";
  roundRect(g, b.x, b.y, b.w, b.h, 9);
  g.fill();
  g.strokeStyle = "rgba(120,190,255,0.22)";
  g.lineWidth = 1;
  g.stroke();

  g.font = `bold 15px ${FONT}`;
  g.textBaseline = "middle";
  g.textAlign = "right";
  g.fillStyle = TEAM_COLORS[0];
  g.fillText(String(world.teams[0].kills), cx - 32, cy);
  g.textAlign = "left";
  g.fillStyle = TEAM_COLORS[1];
  g.fillText(String(world.teams[1].kills), cx + 32, cy);

  g.textAlign = "center";
  g.fillStyle = "#dce8f5";
  g.font = `12px ${FONT}`;
  g.fillText(`${mm}:${ss}`, cx, cy);

  // Ejderha sayaclari
  g.font = `10px ${FONT}`;
  const drakes = `🐉${world.teams[0].dragons} - ${world.teams[1].dragons}🐉`;
  g.fillStyle = "#ffb347";
  g.fillText(drakes, cx, b.y + b.h + 9);
  g.restore();
}

function drawPlayerPanel(g: CanvasRenderingContext2D, world: World, L: HudLayout, p: Champion): void {
  const x = L.statusBar.x;
  const y = L.statusBar.y;
  const w = L.statusBar.w;
  const h = L.statusBar.h;

  g.save();
  g.fillStyle = "rgba(6,16,28,0.82)";
  roundRect(g, x, y, w, h, 10);
  g.fill();
  g.strokeStyle = "rgba(120,190,255,0.22)";
  g.lineWidth = 1;
  g.stroke();

  // Portre (oyun ici sprite'inin kucuk hali)
  const pr = 19;
  const pcx = x + pr + 6;
  const pcy = y + h / 2;
  const portrait = championPortrait(p.def.id);
  g.save();
  g.beginPath();
  g.arc(pcx, pcy, pr, 0, Math.PI * 2);
  g.clip();
  g.drawImage(portrait, pcx - pr, pcy - pr, pr * 2, pr * 2);
  g.restore();
  g.strokeStyle = TEAM_COLORS[p.team];
  g.lineWidth = 2;
  g.beginPath();
  g.arc(pcx, pcy, pr, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = "center";
  g.textBaseline = "middle";

  // Seviye rozeti
  g.fillStyle = "#0d1622";
  g.beginPath();
  g.arc(pcx - pr + 3, pcy + pr - 4, 9, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#c8a24a";
  g.lineWidth = 1.2;
  g.stroke();
  g.fillStyle = "#ffe08a";
  g.font = `bold 10px ${FONT}`;
  g.fillText(String(p.level), pcx - pr + 3, pcy + pr - 3);

  // Cubuklar
  const bx = pcx + pr + 8;
  const bw = x + w - bx - 8;
  g.textAlign = "left";
  g.textBaseline = "middle";

  bar(g, bx, y + 10, bw, 9, p.hpPct, "#3fd07a", "#12301f");
  const sh = p.shieldAmount;
  if (sh > 0) {
    g.fillStyle = "#d8f0ff";
    const sw = Math.min(bw * (sh / p.stats.maxHp), bw * (1 - p.hpPct));
    g.fillRect(bx + bw * p.hpPct, y + 10, sw, 9);
  }
  g.fillStyle = "#eaf4ff";
  g.font = `9px ${FONT}`;
  g.fillText(`${Math.round(p.hp)} / ${Math.round(p.stats.maxHp)}`, bx + 4, y + 15);

  bar(g, bx, y + 22, bw, 7, p.mpPct, "#4a86ff", "#14203a");
  g.fillStyle = "#dbe8ff";
  g.fillText(`${Math.round(p.mp)}`, bx + 4, y + 26);

  // Tecrube
  const xpPct = xpProgress(p);
  bar(g, bx, y + 32, bw, 4, xpPct, "#c8a24a", "#241d10");

  // KDA / altin / CS - dar ekranlarda esit araliklarla yerlesir
  g.font = `10px ${FONT}`;
  const col = bw / 3;
  g.fillStyle = "#9fb3c8";
  g.fillText(p.scoreLine(), bx, y + 46);
  g.fillStyle = "#ffd45e";
  g.fillText(`⛁ ${Math.floor(p.gold)}`, bx + col, y + 46);
  g.fillStyle = "#9fb3c8";
  g.fillText(`CS ${p.cs}`, bx + col * 2, y + 46);
  g.restore();
}

function xpProgress(p: Champion): number {
  const table = [0];
  let need = 280;
  for (let i = 1; i < 18; i++) {
    table.push(table[i - 1] + need);
    need += 100 + i * 16;
  }
  if (p.level >= 18) return 1;
  const cur = table[p.level - 1];
  const next = table[p.level];
  return clamp((p.xp - cur) / (next - cur), 0, 1);
}

function bar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  color: string,
  bg: string,
): void {
  g.fillStyle = bg;
  roundRect(g, x, y, w, h, h / 2);
  g.fill();
  g.fillStyle = color;
  if (pct > 0) {
    roundRect(g, x, y, Math.max(h, w * pct), h, h / 2);
    g.fill();
  }
  g.strokeStyle = "rgba(255,255,255,0.14)";
  g.lineWidth = 1;
  roundRect(g, x, y, w, h, h / 2);
  g.stroke();
}

// ---------------------------------------------------------------------------

function drawMinimap(g: CanvasRenderingContext2D, world: World, view: View, L: HudLayout): void {
  const m = L.minimap;
  const k = m.w / MAP_SIZE;
  const p = world.player;

  g.save();
  g.fillStyle = "rgba(6,16,28,0.9)";
  roundRect(g, m.x - 3, m.y - 3, m.w + 6, m.h + 6, 8);
  g.fill();
  g.strokeStyle = "rgba(120,190,255,0.3)";
  g.lineWidth = 1.5;
  g.stroke();

  g.save();
  roundRect(g, m.x, m.y, m.w, m.h, 5);
  g.clip();
  // Orman zemini
  g.fillStyle = "#2c4433";
  g.fillRect(m.x, m.y, m.w, m.h);

  // Nehir: koridorlarin kestigi yerde kesilir (arazide de oyle)
  g.strokeStyle = "rgba(52,116,132,0.85)";
  g.lineWidth = m.w * 0.075;
  g.lineCap = "butt";
  g.beginPath();
  g.moveTo(m.x, m.y);
  g.lineTo(m.x + m.w, m.y + m.h);
  g.stroke();

  // Gecilmez orman duvarlari: haritanin okunmasini saglayan asil sey
  g.fillStyle = "rgba(24,36,44,0.92)";
  for (const w of WALLS) {
    g.fillRect(m.x + w.x * k, m.y + w.y * k, Math.max(1.5, w.w * k), Math.max(1.5, w.h * k));
  }

  // Koridorlar
  g.strokeStyle = "rgba(168,148,104,0.85)";
  g.lineWidth = m.w * 0.045;
  g.lineJoin = "round";
  g.lineCap = "round";
  for (const lane of LANES) {
    const path = lanePath(0, lane);
    g.beginPath();
    g.moveTo(m.x + path[0].x * k, m.y + path[0].y * k);
    for (let i = 1; i < path.length; i++) g.lineTo(m.x + path[i].x * k, m.y + path[i].y * k);
    g.stroke();
  }

  // Usler
  for (const team of [0, 1] as const) {
    const n = NEXUS_POS[team];
    g.fillStyle = team === 0 ? "rgba(70,150,235,0.28)" : "rgba(220,90,80,0.28)";
    g.beginPath();
    g.arc(m.x + n.x * k, m.y + n.y * k, m.w * 0.14, 0, Math.PI * 2);
    g.fill();
  }

  // Calilar
  g.fillStyle = "rgba(58,110,66,0.9)";
  for (const b of BUSHES) {
    g.beginPath();
    g.arc(m.x + b.x * k, m.y + b.y * k, Math.max(1.4, b.r * k), 0, Math.PI * 2);
    g.fill();
  }

  // Yapilar
  for (const s of world.structures) {
    if (!s.alive) continue;
    const sx = m.x + s.pos.x * k;
    const sy = m.y + s.pos.y * k;
    g.fillStyle = TEAM_COLORS[s.team];
    const size = s.kind === "nexus" ? 6 : s.kind === "inhibitor" ? 4 : 3.4;
    g.fillRect(sx - size / 2, sy - size / 2, size, size);
  }

  // Canavarlar
  for (const mo of world.monsters) {
    if (!mo.alive || !mo.spec.epic) continue;
    g.fillStyle = "#c9a0ff";
    g.beginPath();
    g.arc(m.x + mo.pos.x * k, m.y + mo.pos.y * k, 3, 0, Math.PI * 2);
    g.fill();
  }

  // Minyonlar
  for (const mi of world.minions) {
    if (!mi.alive) continue;
    if (mi.team !== p.team && !mi.visibleTo[p.team]) continue;
    g.fillStyle = mi.team === p.team ? "rgba(120,200,255,0.55)" : "rgba(255,130,120,0.55)";
    g.fillRect(m.x + mi.pos.x * k - 1, m.y + mi.pos.y * k - 1, 2, 2);
  }

  // Sampiyonlar: portreleri kucuk birer simge olarak cizilir
  for (const c of world.champions) {
    if (!c.alive) continue;
    if (c.team !== p.team && !c.visibleTo[p.team]) continue;
    const sx = m.x + c.pos.x * k;
    const sy = m.y + c.pos.y * k;
    const r = c.isPlayer ? m.w * 0.045 : m.w * 0.038;

    const face = championPortrait(c.def.id);
    if (face.width > 0) {
      g.save();
      g.beginPath();
      g.arc(sx, sy, r, 0, Math.PI * 2);
      g.clip();
      // Portrenin ust govdesi kirpilarak dairenin icine oturtulur
      const src = face.width * 0.62;
      g.drawImage(face, (face.width - src) / 2, face.height * 0.06, src, src, sx - r, sy - r, r * 2, r * 2);
      g.restore();
    } else {
      g.fillStyle = TEAM_COLORS[c.team];
      g.beginPath();
      g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fill();
    }

    // Takim halkasi; oyuncunun kendisi altin renkli
    g.strokeStyle = c.isPlayer ? "#ffe08a" : TEAM_COLORS[c.team];
    g.lineWidth = c.isPlayer ? 2.2 : 1.8;
    g.beginPath();
    g.arc(sx, sy, r, 0, Math.PI * 2);
    g.stroke();
  }

  // Kamera gorus alani (ekran koselerinin zemine izdusumu)
  const corners = [
    view.toWorld(0, 0),
    view.toWorld(view.vw, 0),
    view.toWorld(view.vw, view.vh),
    view.toWorld(0, view.vh),
  ];
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.lineWidth = 1;
  g.beginPath();
  corners.forEach((c, i) => {
    const cx = m.x + clamp(c.x, -400, MAP_SIZE + 400) * k;
    const cy = m.y + clamp(c.y, -400, MAP_SIZE + 400) * k;
    if (i === 0) g.moveTo(cx, cy);
    else g.lineTo(cx, cy);
  });
  g.closePath();
  g.stroke();
  g.restore();
  g.restore();
}


// ---------------------------------------------------------------------------

function drawEventLog(g: CanvasRenderingContext2D, world: World, L: HudLayout): void {
  const items = world.events.slice(-4);
  g.save();
  g.font = `10.5px ${FONT}`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  const x = 10;
  let y = L.eventLogY;
  for (const e of items) {
    const age = world.time - e.time;
    if (age > 10) continue;
    g.globalAlpha = clamp(1 - (age - 7) / 3, 0, 1);
    g.fillStyle = "rgba(6,16,28,0.7)";
    const wpx = g.measureText(e.text).width + 12;
    roundRect(g, x, y - 8, wpx, 16, 5);
    g.fill();
    g.fillStyle = e.color ?? "#dce8f5";
    g.fillText(e.text, x + 6, y);
    y += 19;
  }
  g.restore();
}

function drawJoystick(g: CanvasRenderingContext2D, L: HudLayout, ui: UiState): void {
  const j = ui.joystick;
  const base = j.active ? j.base : L.joystickHome;
  const R = L.joystickHome.r;
  g.save();
  g.globalAlpha = j.active ? 0.85 : 0.32;
  g.strokeStyle = "rgba(200,230,255,0.6)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(base.x, base.y, R, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(20,40,64,0.35)";
  g.fill();

  let kx = base.x;
  let ky = base.y;
  if (j.active) {
    const dx = j.cur.x - j.base.x;
    const dy = j.cur.y - j.base.y;
    const d = Math.hypot(dx, dy);
    const cl = Math.min(d, R);
    if (d > 0.001) {
      kx = base.x + (dx / d) * cl;
      ky = base.y + (dy / d) * cl;
    }
  }
  g.fillStyle = "rgba(190,225,255,0.75)";
  g.beginPath();
  g.arc(kx, ky, R * 0.36, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------------------

function drawButtons(
  g: CanvasRenderingContext2D,
  world: World,
  L: HudLayout,
  ui: UiState,
  p: Champion,
): void {
  // Saldiri dugmesi
  circleButton(g, L.attack, "#2a1f12", "#f0c26a", "⚔️", 24, 1);

  // Yetenekler
  for (const key of ["Q", "W", "E", "R"] as const) {
    const c = L.abilities[key];
    const st = p.abilities[key];
    const def = p.def.abilities.find((a) => a.key === key)!;
    const icon = ABILITY_ICON[`${p.def.id}:${key}`] ?? key;
    const ready = p.canCastAbility(key);
    const cdPct = st.cd > 0 ? st.cd / Math.max(0.01, p.cooldownFor(key)) : 0;
    const noMana = p.mp < p.costFor(key);

    circleButton(
      g,
      c,
      key === "R" ? "#2a1836" : "#122740",
      ready ? "#8fd8ff" : "#3d5570",
      icon,
      c.r * 0.95,
      ready ? 1 : 0.55,
    );

    if (cdPct > 0) {
      g.save();
      g.globalAlpha = 0.72;
      g.fillStyle = "#04101c";
      g.beginPath();
      g.moveTo(c.x, c.y);
      g.arc(c.x, c.y, c.r, -Math.PI / 2, -Math.PI / 2 + cdPct * Math.PI * 2);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = "#eaf4ff";
      g.font = `bold ${Math.round(c.r * 0.72)}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(Math.ceil(st.cd)), c.x, c.y);
      g.restore();
    } else if (noMana) {
      g.save();
      g.globalAlpha = 0.45;
      g.fillStyle = "#1a3a6a";
      g.beginPath();
      g.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // Tus harfi ve sira noktalari
    g.save();
    g.font = `bold 9px ${FONT}`;
    g.fillStyle = "#c8dcf0";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(key, c.x, c.y + c.r + 8);
    const max = key === "R" ? 3 : 5;
    const pw = 4;
    const total = max * pw + (max - 1) * 2;
    let px = c.x - total / 2;
    for (let i = 0; i < max; i++) {
      g.fillStyle = i < st.rank ? "#ffd45e" : "rgba(255,255,255,0.2)";
      g.fillRect(px, c.y - c.r - 8, pw, 3);
      px += pw + 2;
    }
    g.restore();
  }

  // Sihirdar buyuleri
  p.summoners.forEach((s, i) => {
    const c = L.summoners[i];
    const ready = s.cd <= 0;
    circleButton(g, c, "#151f2e", ready ? "#a8e6ff" : "#3d5570", s.spell.emoji, c.r, ready ? 1 : 0.5);
    if (!ready) {
      g.save();
      g.fillStyle = "#eaf4ff";
      g.font = `bold ${Math.round(c.r * 0.85)}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(Math.ceil(s.cd)), c.x, c.y);
      g.restore();
    }
  });

  // Magaza / geri donus / skor / otomatik saldiri
  circleButton(g, L.shop, "#1c2a16", "#a8e08a", "🛒", L.shop.r, 1);
  circleButton(
    g,
    L.recall,
    p.recallTimer > 0 ? "#123a52" : "#141f2e",
    "#8fd8ff",
    "🏠",
    L.recall.r,
    1,
  );
  circleButton(g, L.scoreboard, "#141f2e", "#c8dcf0", "📊", L.scoreboard.r, 1);
  circleButton(g, L.settings, "#141f2e", "#c8dcf0", "⚙️", L.settings.r, 1);
}

function circleButton(
  g: CanvasRenderingContext2D,
  c: { x: number; y: number; r: number },
  bg: string,
  border: string,
  icon: string,
  iconSize: number,
  alpha: number,
): void {
  g.save();
  // Arka plan her zaman opak: altindaki oyun alani gorunmesin
  g.fillStyle = "#050d16";
  g.beginPath();
  g.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(c.x, c.y - c.r * 0.4, 2, c.x, c.y, c.r);
  grad.addColorStop(0, "rgba(255,255,255,0.14)");
  grad.addColorStop(1, bg);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = border;
  g.lineWidth = 2;
  g.stroke();
  g.globalAlpha = alpha;
  g.font = `${Math.round(iconSize)}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(icon, c.x, c.y + 1);
  g.restore();
}

// ---------------------------------------------------------------------------

/** Nisan alma girdisinden dunya hedefi hesaplar. */
export function aimTarget(
  world: World,
  L: HudLayout,
  ui: UiState,
  p: Champion,
): { point: Vec2; target: import("../game/units").Unit | null } | null {
  const key = ui.aim.key;
  if (!key) return null;
  const isAttack = key === "A";
  const def =
    key === "D" || key === "F" || isAttack ? null : p.def.abilities.find((a) => a.key === key)!;
  const range = isAttack ? p.stats.attackRange + 150 : def?.range || 120;
  const style = isAttack ? "unit" : def?.targeting ?? "point";

  const dx = ui.aim.cur.x - ui.aim.origin.x;
  const dy = ui.aim.cur.y - ui.aim.origin.y;
  const drag = Math.hypot(dx, dy);

  if (drag < 14) {
    // Hizli kullanim: en uygun hedefi bul
    const t = smartTarget(world, p, range, style);
    if (t) return { point: { x: t.pos.x, y: t.pos.y }, target: t };
    const f = { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    return { point: { x: p.pos.x + f.x * range * 0.8, y: p.pos.y + f.y * range * 0.8 }, target: null };
  }

  // Kamera dondurulebildigi icin ekran yonu dunya yonune cevrilir.
  const w = ui.screenDir(dx / drag, dy / drag);
  const nx = w.x;
  const ny = w.y;
  const reach = clamp(drag / (L.abilities.Q.r * 2.6), 0, 1) * range;
  const point = { x: p.pos.x + nx * reach, y: p.pos.y + ny * reach };
  if (style === "unit") {
    const t = smartTarget(world, p, range, style, { x: nx, y: ny });
    return { point: t ? t.pos : point, target: t };
  }
  return { point, target: null };
}

export function smartTarget(
  world: World,
  p: Champion,
  range: number,
  style: string,
  dir?: Vec2,
): import("../game/units").Unit | null {
  let best: import("../game/units").Unit | null = null;
  let bestScore = -Infinity;
  for (const u of world.allUnits()) {
    if (!u.alive || u.team === p.team) continue;
    if (u.kind === "monster" && u.team === p.team) continue;
    if (!u.visibleTo[p.team]) continue;
    if (u.isStructure && u.kind !== "tower") continue;
    const dx = u.pos.x - p.pos.x;
    const dy = u.pos.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > range + u.radius + 30) continue;
    let score = 300 - d;
    if (u.kind === "champion") score += 320;
    else if (u.kind === "monster") score += 40;
    else if (u.kind === "tower") score -= 120;
    if (dir && d > 1) {
      const dot = (dx / d) * dir.x + (dy / d) * dir.y;
      score += dot * 220;
    }
    if (score > bestScore) {
      bestScore = score;
      best = u;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------

function drawDeathOverlay(g: CanvasRenderingContext2D, L: HudLayout, p: Champion): void {
  g.save();
  g.fillStyle = "rgba(40,6,10,0.35)";
  g.fillRect(0, 0, L.w, L.h);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ff9b8f";
  g.font = `bold ${Math.round(clamp(L.w * 0.05, 20, 40))}px ${FONT}`;
  g.fillText("OLDUN", L.w / 2, L.h / 2 - 26);
  g.fillStyle = "#ffe08a";
  g.font = `bold ${Math.round(clamp(L.w * 0.07, 26, 54))}px ${FONT}`;
  g.fillText(`${Math.ceil(p.respawnTimer)}`, L.w / 2, L.h / 2 + 16);
  g.fillStyle = "#c8dcf0";
  g.font = `12px ${FONT}`;
  g.fillText("Yeniden dogus", L.w / 2, L.h / 2 + 46);
  g.restore();
}

function drawToasts(g: CanvasRenderingContext2D, L: HudLayout, ui: UiState): void {
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  let y = L.h * 0.28;
  for (const t of ui.toast) {
    g.globalAlpha = clamp(t.life, 0, 1);
    g.font = `bold 14px ${FONT}`;
    const w = g.measureText(t.text).width + 20;
    g.fillStyle = "rgba(6,16,28,0.85)";
    roundRect(g, L.w / 2 - w / 2, y - 13, w, 26, 8);
    g.fill();
    g.strokeStyle = "rgba(120,190,255,0.3)";
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = "#ffe08a";
    g.fillText(t.text, L.w / 2, y + 1);
    y += 32;
  }
  g.restore();
}
