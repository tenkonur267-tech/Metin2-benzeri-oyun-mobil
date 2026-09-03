import { clamp, type Vec2 } from "../core/math";
import { MAP_SIZE, TEAM_COLORS, TEAM_COLORS_DARK } from "../game/constants";
import type { Champion } from "../game/champion";
import type { World } from "../game/world";
import type { Minion, Monster, Structure, Unit } from "../game/units";
import { buildMapCanvas, roundRect } from "./mapCanvas";
import { championModel, creatureModel } from "./models";
import {
  drawCharacter,
  drawCreature,
  drawInhibitorSprite,
  drawMinionSprite,
  drawNexusSprite,
  drawTowerSprite,
  type AnimState,
} from "./sprites";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}


/** Bir birimden cizim animasyon durumu uretir. */
export function unitAnim(u: Unit, time: number): AnimState {
  const windupTotal = Math.max(0.05, Math.min(0.28, u.attackInterval * 0.32));
  const cast = (u as unknown as { castAnim?: number }).castAnim ?? 0;
  return {
    facing: u.facing,
    walkPhase: u.walkPhase,
    moving: u.speedNow > 12,
    swing: clamp(u.swing / 0.24, 0, 1),
    windup: u.windupTarget ? clamp(u.windup / windupTotal, 0, 1) : 0,
    cast: clamp(cast / 0.3, 0, 1),
    flash: clamp(u.hitFlash / 0.12, 0, 1),
    time,
    hp: u.hpPct,
  };
}

export class Renderer {
  private map: HTMLCanvasElement;
  private fog: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  cam: Camera = { x: MAP_SIZE / 2, y: MAP_SIZE / 2, scale: 1 };
  /** Ekran (CSS) boyutlari. */
  vw = 0;
  vh = 0;
  showFog = true;

  constructor() {
    this.map = buildMapCanvas();
    this.fog = document.createElement("canvas");
    this.fogCtx = this.fog.getContext("2d")!;
  }

  resize(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
    // Gorunur alani ~300x300 oyun birimi olacak sekilde olcekle:
    // hem yatay hem dikey ekranlarda dengeli bir gorus acisi verir.
    this.cam.scale = clamp(Math.sqrt(w * h) / 330, 1.0, 3.2);
    this.fog.width = Math.max(2, Math.floor(w / 2));
    this.fog.height = Math.max(2, Math.floor(h / 2));
  }

  centerOn(p: Vec2, lerpAmount = 1): void {
    this.cam.x += (p.x - this.cam.x) * lerpAmount;
    this.cam.y += (p.y - this.cam.y) * lerpAmount;
    // Kamerayi harita sinirlarinda tut (kenarda bosluk gorunmesin)
    const halfW = this.vw / 2 / this.cam.scale;
    const halfH = this.vh / 2 / this.cam.scale;
    const pad = 40;
    this.cam.x =
      halfW * 2 >= MAP_SIZE + pad * 2
        ? MAP_SIZE / 2
        : clamp(this.cam.x, halfW - pad, MAP_SIZE - halfW + pad);
    this.cam.y =
      halfH * 2 >= MAP_SIZE + pad * 2
        ? MAP_SIZE / 2
        : clamp(this.cam.y, halfH - pad, MAP_SIZE - halfH + pad);
  }

  toScreen(p: Vec2): Vec2 {
    return {
      x: (p.x - this.cam.x) * this.cam.scale + this.vw / 2,
      y: (p.y - this.cam.y) * this.cam.scale + this.vh / 2,
    };
  }

  toWorld(x: number, y: number): Vec2 {
    return {
      x: (x - this.vw / 2) / this.cam.scale + this.cam.x,
      y: (y - this.vh / 2) / this.cam.scale + this.cam.y,
    };
  }

  private visible(p: Vec2, pad = 60): boolean {
    const s = this.toScreen(p);
    return s.x > -pad && s.y > -pad && s.x < this.vw + pad && s.y < this.vh + pad;
  }

  // -------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D, world: World): void {
    const cam = this.cam;
    g.save();
    g.translate(this.vw / 2, this.vh / 2);
    g.scale(cam.scale, cam.scale);
    g.translate(-cam.x, -cam.y);

    g.imageSmoothingEnabled = true;
    g.drawImage(this.map, 0, 0, MAP_SIZE, MAP_SIZE);

    this.drawZones(g, world);
    this.drawStructures(g, world);
    this.drawMonsters(g, world);
    this.drawMinions(g, world);
    this.drawChampions(g, world);
    this.drawProjectiles(g, world);
    this.drawFx(g, world);

    g.restore();

    if (this.showFog) this.drawFog(g, world);
    this.drawOverlays(g, world);
    this.drawFloatingText(g, world);
  }

  // -------------------------------------------------------------------------

  private drawZones(g: CanvasRenderingContext2D, world: World): void {
    for (const z of world.zones) {
      if (!this.visible(z.pos, z.radius + 40)) continue;
      const t = clamp(z.time / Math.max(0.01, z.maxTime), 0, 1);
      g.save();
      if (z.shape === "warning") {
        g.globalAlpha = 0.35;
        g.fillStyle = z.color;
        g.beginPath();
        g.arc(z.pos.x, z.pos.y, z.radius * (1 - t) * 0.9 + z.radius * 0.1, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.9;
        g.strokeStyle = z.color;
        g.lineWidth = 3;
        g.setLineDash([10, 8]);
        g.beginPath();
        g.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2);
        g.stroke();
      } else if (z.shape === "burning") {
        g.globalAlpha = 0.28;
        const rg = g.createRadialGradient(z.pos.x, z.pos.y, 4, z.pos.x, z.pos.y, z.radius);
        rg.addColorStop(0, z.color);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = rg;
        g.beginPath();
        g.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.6;
        g.strokeStyle = z.color;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2);
        g.stroke();
      } else {
        g.globalAlpha = 0.22;
        g.fillStyle = z.color;
        g.beginPath();
        g.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.7;
        g.strokeStyle = z.color;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2);
        g.stroke();
        if (z.shape === "storm") {
          g.globalAlpha = 0.5;
          const a = world.time * 3;
          for (let i = 0; i < 5; i++) {
            const ang = a + (i / 5) * Math.PI * 2;
            const rr = z.radius * (0.35 + 0.5 * ((i * 0.27 + world.time * 0.6) % 1));
            g.beginPath();
            g.arc(z.pos.x + Math.cos(ang) * rr, z.pos.y + Math.sin(ang) * rr, 5, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      g.restore();
    }
  }

  private drawStructures(g: CanvasRenderingContext2D, world: World): void {
    // Oyuncuya en yakin dusman kulesinin menzil halkasi
    const pl = world.player;
    let nearestTower: Structure | null = null;
    let ntD = Infinity;
    for (const s of world.structures) {
      if (!s.alive || s.kind !== "tower" || s.team === pl.team) continue;
      const d = Math.hypot(pl.pos.x - s.pos.x, pl.pos.y - s.pos.y);
      if (d < s.stats.attackRange + 120 && d < ntD) {
        ntD = d;
        nearestTower = s;
      }
    }
    if (nearestTower) {
      g.save();
      g.globalAlpha = 0.2;
      g.strokeStyle = TEAM_COLORS[nearestTower.team];
      g.lineWidth = 2;
      g.setLineDash([9, 9]);
      g.beginPath();
      g.arc(nearestTower.pos.x, nearestTower.pos.y, nearestTower.stats.attackRange, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    for (const s of world.structures) {
      if (!s.alive && s.kind !== "inhibitor") {
        this.drawRubble(g, s);
        continue;
      }
      if (!s.alive) {
        this.drawRubble(g, s);
        continue;
      }
      if (!this.visible(s.pos, 90)) continue;
      const col = TEAM_COLORS[s.team];
      const dark = TEAM_COLORS_DARK[s.team];

      if (s.kind === "tower") {
        const t = s.target;
        const aim = t
          ? Math.atan2(t.pos.y - s.pos.y, t.pos.x - s.pos.x)
          : Math.sin(world.time * 0.4 + s.id) * 0.8;
        drawTowerSprite(
          g,
          s.pos.x,
          s.pos.y,
          s.radius,
          col,
          dark,
          world.time,
          aim,
          s.hpPct,
          clamp(s.swing / 0.24, 0, 1),
          s.tier,
        );
      } else if (s.kind === "inhibitor") {
        drawInhibitorSprite(g, s.pos.x, s.pos.y, s.radius, col, dark, world.time);
      } else {
        drawNexusSprite(g, s.pos.x, s.pos.y, s.radius, col, dark, world.time, s.hpPct);
      }

      const nearPlayer =
        Math.hypot(world.player.pos.x - s.pos.x, world.player.pos.y - s.pos.y) < 300;
      if (s.invulnerable && nearPlayer) {
        g.save();
        g.globalAlpha = 0.5;
        g.strokeStyle = "#dfe9f5";
        g.lineWidth = 2;
        g.setLineDash([5, 5]);
        g.beginPath();
        g.arc(s.pos.x, s.pos.y, s.radius * 1.6, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }
  }

  private drawRubble(g: CanvasRenderingContext2D, s: Structure): void {
    if (!this.visible(s.pos, 60)) return;
    g.save();
    g.globalAlpha = 0.55;
    g.fillStyle = "#2a3038";
    g.beginPath();
    g.ellipse(s.pos.x, s.pos.y, s.radius * 0.9, s.radius * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3b444f";
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + s.id;
      g.beginPath();
      g.arc(s.pos.x + Math.cos(a) * s.radius * 0.5, s.pos.y + Math.sin(a) * s.radius * 0.3, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawMinions(g: CanvasRenderingContext2D, world: World): void {
    const p = world.player;
    for (const m of world.minions) {
      if (!m.alive || !this.visible(m.pos, 30)) continue;
      if (m.team !== p.team && !m.visibleTo[p.team]) continue;
      drawMinionSprite(
        g,
        m.pos.x,
        m.pos.y,
        m.radius * 1.35,
        m.minionKind,
        TEAM_COLORS[m.team],
        TEAM_COLORS_DARK[m.team],
        unitAnim(m, world.time),
      );
    }
  }

  private drawMonsters(g: CanvasRenderingContext2D, world: World): void {
    for (const m of world.monsters) {
      if (!m.alive || !this.visible(m.pos, 70)) continue;
      drawCreature(
        g,
        m.pos.x,
        m.pos.y,
        m.radius * 1.15,
        creatureModel(m.spec.name),
        unitAnim(m, world.time),
      );
    }
  }

  private drawChampions(g: CanvasRenderingContext2D, world: World): void {
    const p = world.player;
    for (const c of world.champions) {
      if (!c.alive) continue;
      if (c.team !== p.team && !c.visibleTo[p.team]) continue;
      if (!this.visible(c.pos, 60)) continue;

      const col = c.def.color;
      const teamCol = TEAM_COLORS[c.team];
      const stealth = c.hasEffect("stealth");

      g.save();
      if (stealth) g.globalAlpha = 0.42;

      // Takim halkasi (zeminde)
      g.save();
      g.translate(c.pos.x, c.pos.y);
      g.strokeStyle = teamCol;
      g.lineWidth = 2.2;
      g.globalAlpha *= 0.85;
      g.beginPath();
      g.ellipse(0, c.radius * 0.5, c.radius * 1.1, c.radius * 0.46, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();

      drawCharacter(
        g,
        c.pos.x,
        c.pos.y,
        c.radius * 1.35,
        championModel(c.def.id),
        teamCol,
        unitAnim(c, world.time),
      );

      // Oyuncu isareti
      if (c.isPlayer) {
        g.save();
        g.translate(c.pos.x, c.pos.y);
        g.strokeStyle = "#ffe08a";
        g.lineWidth = 2;
        g.setLineDash([6, 5]);
        g.lineDashOffset = -world.time * 12;
        g.beginPath();
        g.ellipse(0, c.radius * 0.5, c.radius * 1.5, c.radius * 0.62, 0, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }

      // Kalkan kubbesi
      const sh = c.shieldAmount;
      if (sh > 0) {
        g.save();
        g.translate(c.pos.x, c.pos.y);
        g.globalAlpha = 0.55;
        g.strokeStyle = "#8fd8ff";
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(0, 0, c.radius * 1.5, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 0.12;
        g.fillStyle = "#8fd8ff";
        g.fill();
        g.restore();
      }

      // Yetenek kullanma dalgasi
      if (c.castAnim > 0) {
        g.save();
        g.translate(c.pos.x, c.pos.y);
        g.globalAlpha = c.castAnim / 0.3;
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, c.radius * 1.4 + (1 - c.castAnim / 0.3) * 20, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
      g.restore();

      // Kontrol etkisi gostergesi
      if (c.stunned || c.hasEffect("root")) {
        g.save();
        g.strokeStyle = c.stunned ? "#ffd27a" : "#a0ffb0";
        g.lineWidth = 2;
        const a = world.time * 6;
        for (let i = 0; i < 3; i++) {
          const ang = a + (i / 3) * Math.PI * 2;
          g.beginPath();
          g.arc(c.pos.x + Math.cos(ang) * 16, c.pos.y - c.radius - 12 + Math.sin(ang) * 5, 3, 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      }

      // Geri donus gostergesi
      if (c.recallTimer > 0) {
        const pct = 1 - c.recallTimer / 7;
        g.save();
        g.strokeStyle = "#8fd8ff";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(c.pos.x, c.pos.y, c.radius + 14, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }
  }


  // -------------------------------------------------------------------------
  // Ekran uzayinda cizilen can cubuklari ve etiketler (kamera olceginden bagimsiz)
  // -------------------------------------------------------------------------

  private drawOverlays(g: CanvasRenderingContext2D, world: World): void {
    const p = world.player;
    g.save();
    g.textAlign = "center";
    g.textBaseline = "middle";

    // Yapilar
    for (const s of world.structures) {
      if (!s.alive || !this.visible(s.pos, 60)) continue;
      const sc = this.toScreen(s.pos);
      const w = s.kind === "nexus" ? 46 : s.kind === "inhibitor" ? 34 : 30;
      const h = s.kind === "nexus" ? 6 : 4;
      this.bar(g, sc.x, sc.y - s.radius * this.cam.scale - 12, w, h, s.hpPct, TEAM_COLORS[s.team]);
    }

    // Orman canavarlari
    for (const m of world.monsters) {
      if (!m.alive || !this.visible(m.pos, 60)) continue;
      const sc = this.toScreen(m.pos);
      this.bar(g, sc.x, sc.y - m.radius * this.cam.scale - 11, m.spec.epic ? 44 : 30, 4, m.hpPct, "#8fd06a");
      if (m.spec.epic) {
        g.font = "bold 9px sans-serif";
        g.fillStyle = "#c9a0ff";
        g.fillText(m.spec.name, sc.x, sc.y - m.radius * this.cam.scale - 22);
      }
    }

    // Minyonlar
    for (const m of world.minions) {
      if (!m.alive || !this.visible(m.pos, 30)) continue;
      if (m.team !== p.team && !m.visibleTo[p.team]) continue;
      const sc = this.toScreen(m.pos);
      this.bar(g, sc.x, sc.y - m.radius * this.cam.scale - 8, 18, 3, m.hpPct, TEAM_COLORS[m.team]);
    }

    // Sampiyonlar
    for (const c of world.champions) {
      if (!c.alive) continue;
      if (c.team !== p.team && !c.visibleTo[p.team]) continue;
      if (!this.visible(c.pos, 60)) continue;
      const sc = this.toScreen(c.pos);
      const top = sc.y - c.radius * this.cam.scale - 16;
      const w = 46;
      const x = sc.x - w / 2;

      g.fillStyle = "rgba(0,0,0,0.6)";
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
      g.strokeStyle = "rgba(255,255,255,0.28)";
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, top + 0.5, w - 1, 4);

      // Seviye rozeti
      g.fillStyle = "#0d1622";
      g.beginPath();
      g.arc(x - 8, top + 4, 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#c8a24a";
      g.lineWidth = 1.2;
      g.stroke();
      g.fillStyle = "#ffe08a";
      g.font = "bold 9px sans-serif";
      g.fillText(String(c.level), x - 8, top + 4.5);

      // Isim
      g.font = c.isPlayer ? "bold 10px sans-serif" : "10px sans-serif";
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0,0,0,0.7)";
      g.strokeText(c.displayName(), sc.x, top - 8);
      g.fillStyle = c.isPlayer ? "#ffe08a" : "rgba(233,243,255,0.9)";
      g.fillText(c.displayName(), sc.x, top - 8);

      // Etkin durum etiketleri
      const labels = c.effects
        .filter((e) => e.label && e.time > 0.05)
        .slice(0, 4)
        .map((e) => e.label as string);
      if (labels.length > 0) {
        g.font = "8px sans-serif";
        g.fillStyle = "#9fd0ff";
        g.fillText(labels.join(" "), sc.x, top + 18);
      }
    }
    g.restore();
  }

  private bar(
    g: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    w: number,
    h: number,
    pct: number,
    color: string,
  ): void {
    const x = cx - w / 2;
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillRect(x - 1, cy - 1, w + 2, h + 2);
    g.fillStyle = color;
    g.fillRect(x, cy, w * clamp(pct, 0, 1), h);
  }

  private drawProjectiles(g: CanvasRenderingContext2D, world: World): void {
    for (const p of world.projectiles) {
      if (!this.visible(p.pos, 30)) continue;
      g.save();
      g.translate(p.pos.x, p.pos.y);
      g.rotate(Math.atan2(p.dir.y, p.dir.x));
      g.fillStyle = p.color;
      g.shadowColor = p.color;
      g.shadowBlur = 8;
      switch (p.shape) {
        case "arrow":
          g.beginPath();
          g.moveTo(p.radius * 1.6, 0);
          g.lineTo(-p.radius, p.radius * 0.55);
          g.lineTo(-p.radius * 0.4, 0);
          g.lineTo(-p.radius, -p.radius * 0.55);
          g.closePath();
          g.fill();
          break;
        case "blade":
          g.beginPath();
          g.ellipse(0, 0, p.radius * 1.5, p.radius * 0.5, world.time * 14, 0, Math.PI * 2);
          g.fill();
          break;
        case "wave":
          g.globalAlpha = 0.7;
          g.beginPath();
          g.ellipse(0, 0, p.radius * 0.5, p.radius, 0, 0, Math.PI * 2);
          g.fill();
          break;
        case "orb":
          g.beginPath();
          g.arc(0, 0, p.radius, 0, Math.PI * 2);
          g.fill();
          break;
        default:
          g.beginPath();
          g.ellipse(0, 0, p.radius * 1.5, p.radius * 0.7, 0, 0, Math.PI * 2);
          g.fill();
      }
      g.restore();
    }
  }

  private drawFx(g: CanvasRenderingContext2D, world: World): void {
    const fx = world.fx;
    for (const b of fx.beams) {
      const a = b.life / b.maxLife;
      g.save();
      g.globalAlpha = a;
      g.strokeStyle = b.color;
      g.lineWidth = b.width;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(b.a.x, b.a.y);
      g.lineTo(b.b.x, b.b.y);
      g.stroke();
      g.restore();
    }
    for (const r of fx.rings) {
      const a = r.life / r.maxLife;
      g.save();
      g.globalAlpha = a * 0.85;
      g.strokeStyle = r.color;
      g.lineWidth = r.width;
      g.beginPath();
      g.arc(r.pos.x, r.pos.y, r.r, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    for (const p of fx.particles) {
      const a = p.life / p.maxLife;
      g.save();
      g.globalAlpha = clamp(a, 0, 1);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  private drawFloatingText(g: CanvasRenderingContext2D, world: World): void {
    g.save();
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const t of world.fx.texts) {
      const s = this.toScreen(t.pos);
      if (s.x < -40 || s.y < -40 || s.x > this.vw + 40 || s.y > this.vh + 40) continue;
      const a = clamp(t.life / t.maxLife, 0, 1);
      g.globalAlpha = a;
      g.font = `bold ${t.size}px sans-serif`;
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0,0,0,0.75)";
      g.strokeText(t.text, s.x, s.y);
      g.fillStyle = t.color;
      g.fillText(t.text, s.x, s.y);
    }
    g.restore();
  }

  /** Savas sisi: muttefik gorus alani disi karartilir. */
  private drawFog(g: CanvasRenderingContext2D, world: World): void {
    const fc = this.fogCtx;
    const sx = this.fog.width / this.vw;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, this.fog.width, this.fog.height);
    fc.fillStyle = "rgba(2, 8, 16, 0.66)";
    fc.fillRect(0, 0, this.fog.width, this.fog.height);
    fc.globalCompositeOperation = "destination-out";

    const team = world.player.team;
    for (const u of world.allUnits()) {
      if (!u.alive || u.team !== team) continue;
      const s = this.toScreen(u.pos);
      const r = u.stats.sightRange * this.cam.scale;
      const cx = s.x * sx;
      const cy = s.y * sx;
      const rr = r * sx;
      if (cx + rr < 0 || cy + rr < 0 || cx - rr > this.fog.width || cy - rr > this.fog.height) continue;
      const grad = fc.createRadialGradient(cx, cy, rr * 0.55, cx, cy, rr);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      fc.fillStyle = grad;
      fc.beginPath();
      fc.arc(cx, cy, rr, 0, Math.PI * 2);
      fc.fill();
    }
    fc.globalCompositeOperation = "source-over";

    g.save();
    g.globalCompositeOperation = "source-over";
    g.drawImage(this.fog, 0, 0, this.vw, this.vh);
    g.restore();
  }
}

/** Rengi acar/koyulastirir. */
export function shade(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const num = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  let r = (num >> 16) & 255;
  let gg = (num >> 8) & 255;
  let b = num & 255;
  const f = (v: number) => clamp(Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)), 0, 255);
  r = f(r);
  gg = f(gg);
  b = f(b);
  return `rgb(${r},${gg},${b})`;
}
