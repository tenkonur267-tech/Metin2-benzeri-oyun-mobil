import { clamp, type Vec2 } from "../core/math";
import { CONFIG, LANES, MAP_SIZE, TEAM_COLORS, lanePath } from "../game/constants";
import type { Champion } from "../game/champion";
import type { World } from "../game/world";
import type { HudLayout } from "./layout";
import type { Renderer } from "./renderer";
import { roundRect } from "./mapCanvas";

export type AbilityKey = "Q" | "W" | "E" | "R";
export type AimKey = AbilityKey | "D" | "F";

export interface UiState {
  joystick: { active: boolean; id: number; base: Vec2; cur: Vec2 };
  aim: { key: AimKey | null; id: number; origin: Vec2; cur: Vec2; moved: number };
  autoAttack: boolean;
  showScore: boolean;
  toast: { text: string; life: number }[];
}

export function newUiState(): UiState {
  return {
    joystick: { active: false, id: -1, base: { x: 0, y: 0 }, cur: { x: 0, y: 0 } },
    aim: { key: null, id: -1, origin: { x: 0, y: 0 }, cur: { x: 0, y: 0 }, moved: 0 },
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
  r: Renderer,
  L: HudLayout,
  ui: UiState,
): void {
  const p = world.player;

  drawAimIndicator(g, world, r, L, ui, p);
  drawTopBar(g, world, L);
  drawPlayerPanel(g, world, L, p);
  drawMinimap(g, world, r, L);
  drawEventLog(g, world, L);
  drawJoystick(g, L, ui);
  drawButtons(g, world, L, ui, p);
  if (!p.alive) drawDeathOverlay(g, L, p);
  drawToasts(g, L, ui);
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

  // Portre
  const pr = 19;
  const pcx = x + pr + 6;
  const pcy = y + h / 2;
  g.fillStyle = p.def.color;
  g.beginPath();
  g.arc(pcx, pcy, pr, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = TEAM_COLORS[p.team];
  g.lineWidth = 2;
  g.stroke();
  g.font = `19px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(p.def.emoji, pcx, pcy + 1);

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

function drawMinimap(g: CanvasRenderingContext2D, world: World, r: Renderer, L: HudLayout): void {
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
  g.fillStyle = "#122029";
  g.fillRect(m.x, m.y, m.w, m.h);

  // Nehir
  g.strokeStyle = "rgba(45,110,145,0.7)";
  g.lineWidth = m.w * 0.09;
  g.beginPath();
  g.moveTo(m.x, m.y);
  g.lineTo(m.x + m.w, m.y + m.h);
  g.stroke();

  // Koridorlar
  g.strokeStyle = "rgba(130,150,105,0.6)";
  g.lineWidth = m.w * 0.05;
  g.lineJoin = "round";
  g.lineCap = "round";
  for (const lane of LANES) {
    const path = lanePath(0, lane);
    g.beginPath();
    g.moveTo(m.x + path[0].x * k, m.y + path[0].y * k);
    for (let i = 1; i < path.length; i++) g.lineTo(m.x + path[i].x * k, m.y + path[i].y * k);
    g.stroke();
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

  // Sampiyonlar
  for (const c of world.champions) {
    if (!c.alive) continue;
    if (c.team !== p.team && !c.visibleTo[p.team]) continue;
    const sx = m.x + c.pos.x * k;
    const sy = m.y + c.pos.y * k;
    g.fillStyle = c.isPlayer ? "#ffe08a" : TEAM_COLORS[c.team];
    g.beginPath();
    g.arc(sx, sy, c.isPlayer ? 4 : 3.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 0.8;
    g.stroke();
  }

  // Kamera cercevesi
  const halfW = (r.vw / 2 / r.cam.scale) * k;
  const halfH = (r.vh / 2 / r.cam.scale) * k;
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.lineWidth = 1;
  g.strokeRect(m.x + r.cam.x * k - halfW, m.y + r.cam.y * k - halfH, halfW * 2, halfH * 2);
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
  circleButton(
    g,
    L.autoToggle,
    ui.autoAttack ? "#22331c" : "#2a1a1a",
    ui.autoAttack ? "#a8e08a" : "#ff9b8f",
    "🤖",
    L.autoToggle.r,
    1,
  );
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

function drawAimIndicator(
  g: CanvasRenderingContext2D,
  world: World,
  r: Renderer,
  L: HudLayout,
  ui: UiState,
  p: Champion,
): void {
  const key = ui.aim.key;
  if (!key || !p.alive) return;
  const info = aimTarget(world, r, L, ui, p);
  if (!info) return;

  g.save();
  g.translate(L.w / 2, L.h / 2);
  g.scale(r.cam.scale, r.cam.scale);
  g.translate(-r.cam.x, -r.cam.y);
  g.globalAlpha = 0.55;

  const col = key === "D" || key === "F" ? "#ffffff" : p.def.color;
  const def = key === "D" || key === "F" ? null : p.def.abilities.find((a) => a.key === key)!;
  const style = def?.targeting ?? "point";
  const range = def?.range || 120;
  const width = def?.width ?? 40;

  // Menzil halkasi
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 2;
  g.setLineDash([8, 8]);
  g.beginPath();
  g.arc(p.pos.x, p.pos.y, range, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);

  g.fillStyle = col;
  g.strokeStyle = col;

  if (style === "skillshot" || style === "direction") {
    const dx = info.point.x - p.pos.x;
    const dy = info.point.y - p.pos.y;
    const a = Math.atan2(dy, dx);
    g.save();
    g.translate(p.pos.x, p.pos.y);
    g.rotate(a);
    g.globalAlpha = 0.32;
    g.fillRect(0, -width / 2, range, width);
    g.globalAlpha = 0.8;
    g.lineWidth = 2;
    g.strokeRect(0, -width / 2, range, width);
    g.restore();
  } else if (style === "cone") {
    const a = Math.atan2(info.point.y - p.pos.y, info.point.x - p.pos.x);
    g.globalAlpha = 0.3;
    g.beginPath();
    g.moveTo(p.pos.x, p.pos.y);
    g.arc(p.pos.x, p.pos.y, range, a - 0.95, a + 0.95);
    g.closePath();
    g.fill();
    g.globalAlpha = 0.8;
    g.stroke();
  } else if (style === "self") {
    g.globalAlpha = 0.25;
    g.beginPath();
    g.arc(p.pos.x, p.pos.y, Math.max(60, range), 0, Math.PI * 2);
    g.fill();
  } else if (style === "unit") {
    if (info.target) {
      g.globalAlpha = 0.8;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(info.target.pos.x, info.target.pos.y, info.target.radius + 8, 0, Math.PI * 2);
      g.stroke();
    }
  } else {
    g.globalAlpha = 0.3;
    g.beginPath();
    g.arc(info.point.x, info.point.y, width || 60, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.85;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(info.point.x, info.point.y, width || 60, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

/** Nisan alma girdisinden dunya hedefi hesaplar. */
export function aimTarget(
  world: World,
  r: Renderer,
  L: HudLayout,
  ui: UiState,
  p: Champion,
): { point: Vec2; target: import("../game/units").Unit | null } | null {
  const key = ui.aim.key;
  if (!key) return null;
  const def = key === "D" || key === "F" ? null : p.def.abilities.find((a) => a.key === key)!;
  const range = def?.range || 120;
  const style = def?.targeting ?? "point";

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

  const nx = dx / drag;
  const ny = dy / drag;
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
