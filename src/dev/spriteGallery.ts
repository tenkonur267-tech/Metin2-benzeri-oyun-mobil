/**
 * Gelistirici araci: tum prosedurel sprite'lari poz poz gosterir.
 * `npm run dev` sonrasi /sprites.html adresinden acilir.
 */
import { CHAMPIONS } from "../game/champions";
import { CAMPS, TEAM_COLORS, TEAM_COLORS_DARK } from "../game/constants";
import { championModel, creatureModel } from "../render/models";
import {
  drawCharacter,
  drawCreature,
  drawInhibitorSprite,
  drawMinionSprite,
  drawNexusSprite,
  drawTowerSprite,
  type AnimState,
} from "../render/sprites";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const g = canvas.getContext("2d")!;

const CELL = 130;
const R = 34;
const POSES = ["duruş", "yürüyüş", "hazırlık", "vuruş", "büyü"] as const;

function pose(name: (typeof POSES)[number], t: number): AnimState {
  return {
    facing: 0,
    walkPhase: name === "yürüyüş" ? t * 6 : 0,
    moving: name === "yürüyüş",
    swing: name === "vuruş" ? 0.7 : 0,
    windup: name === "hazırlık" ? 0.9 : 0,
    cast: name === "büyü" ? 1 : 0,
    flash: 0,
    time: t,
    hp: 1,
  };
}

function resize(): void {
  const cols = POSES.length + 1;
  const rows = CHAMPIONS.length + 3;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = cols * CELL * dpr;
  canvas.height = rows * CELL * dpr;
  canvas.style.width = `${cols * CELL}px`;
  canvas.style.height = `${rows * CELL}px`;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame(now: number): void {
  const t = now / 1000;
  const cols = POSES.length + 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#12222f";
  g.fillRect(0, 0, canvas.width, canvas.height);

  g.font = "11px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";

  // Baslik satiri
  POSES.forEach((p, i) => {
    g.fillStyle = "#8fa8c4";
    g.fillText(p, (i + 1) * CELL + CELL / 2, 16);
  });

  CHAMPIONS.forEach((c, row) => {
    const y = row * CELL + CELL * 0.75;
    g.fillStyle = "#e6f1ff";
    g.textAlign = "left";
    g.fillText(`${c.name}`, 8, y);
    g.fillStyle = "#8fa8c4";
    g.fillText(`${c.role}`, 8, y + 14);
    g.textAlign = "center";
    POSES.forEach((p, col) => {
      const cx = (col + 1) * CELL + CELL / 2;
      drawCharacter(g, cx, y, R, championModel(c.id), TEAM_COLORS[0], pose(p, t));
    });
  });

  // Minyonlar
  const minY = CHAMPIONS.length * CELL + CELL * 0.75;
  g.textAlign = "left";
  g.fillStyle = "#e6f1ff";
  g.fillText("Minyonlar", 8, minY);
  (["melee", "caster", "cannon", "super"] as const).forEach((k, i) => {
    const cx = (i + 1) * CELL + CELL / 2;
    drawMinionSprite(g, cx, minY, R * 0.7, k, TEAM_COLORS[i % 2], TEAM_COLORS_DARK[i % 2], pose("yürüyüş", t));
    g.textAlign = "center";
    g.fillStyle = "#8fa8c4";
    g.fillText(k, cx, minY + 44);
  });

  // Yapilar
  const stY = (CHAMPIONS.length + 1) * CELL + CELL * 0.8;
  g.textAlign = "left";
  g.fillStyle = "#e6f1ff";
  g.fillText("Yapilar", 8, stY);
  drawTowerSprite(g, CELL * 1.5, stY, 28, TEAM_COLORS[0], TEAM_COLORS_DARK[0], t, Math.sin(t) * 1.2, 1, 0, 1);
  drawTowerSprite(g, CELL * 2.5, stY, 28, TEAM_COLORS[1], TEAM_COLORS_DARK[1], t, 0.4, 0.25, 0, 3);
  drawInhibitorSprite(g, CELL * 3.5, stY, 26, TEAM_COLORS[0], TEAM_COLORS_DARK[0], t);
  drawNexusSprite(g, CELL * 4.5, stY, 32, TEAM_COLORS[1], TEAM_COLORS_DARK[1], t, 1);

  // Canavarlar
  const mY = (CHAMPIONS.length + 2) * CELL + CELL * 0.75;
  g.textAlign = "left";
  g.fillStyle = "#e6f1ff";
  g.fillText("Canavarlar", 8, mY);
  const names = [...new Set(CAMPS.map((c) => c.name))];
  names.forEach((n, i) => {
    const cx = (i + 1) * CELL + CELL / 2;
    drawCreature(g, cx, mY, R * 0.85, creatureModel(n), pose(i % 2 ? "yürüyüş" : "duruş", t));
    g.textAlign = "center";
    g.fillStyle = "#8fa8c4";
    g.fillText(n, cx, mY + 46);
    g.textAlign = "left";
  });

  requestAnimationFrame(frame);
}

resize();
window.addEventListener("resize", resize);
requestAnimationFrame(frame);
