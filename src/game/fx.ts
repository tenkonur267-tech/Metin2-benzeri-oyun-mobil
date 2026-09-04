import { dirTo, type Vec2 } from "../core/math";
import { rng } from "../core/rng";
import type { DamageType, FloatingText, Particle, Team } from "./types";
import { TEAM_COLORS } from "./constants";

/** Gorsel efekt havuzu: hasar sayilari, parcaciklar, halkalar. */
export class Fx {
  texts: FloatingText[] = [];
  particles: Particle[] = [];
  rings: {
    pos: Vec2;
    r: number;
    maxR: number;
    life: number;
    maxLife: number;
    color: string;
    width: number;
  }[] = [];
  beams: {
    a: Vec2;
    b: Vec2;
    life: number;
    maxLife: number;
    color: string;
    width: number;
  }[] = [];

  /**
   * Kamera sarsintisi. Oyuncunun vurdugu ve yedigi darbelerde artar,
   * her karede sonumlenir; 3B katman bu degeri okuyup kamerayi oynatir.
   */
  shake = 0;

  /** Sarsintiyi tetikler (mevcut sarsintiyla en buyugu alinir). */
  addShake(amount: number): void {
    this.shake = Math.min(1, Math.max(this.shake, amount));
  }

  clear(): void {
    this.shake = 0;
    this.texts.length = 0;
    this.particles.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.pos.x += t.vel.x * dt;
      t.pos.y += t.vel.y * dt;
      t.vel.y += 26 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.vel.x *= 1 - 2.2 * dt;
      p.vel.y *= 1 - 2.2 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.r += ((r.maxR - r.r) * 6) * dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) this.beams.splice(i, 1);
    }
  }

  private pushText(t: FloatingText): void {
    if (this.texts.length > 90) this.texts.shift();
    this.texts.push(t);
  }

  damageNumber(pos: Vec2, amount: number, type: DamageType, big: boolean): void {
    const color = type === "physical" ? "#ffd9a0" : type === "magic" ? "#c0a8ff" : "#ffffff";
    this.pushText({
      pos: { x: pos.x + rng.range(-8, 8), y: pos.y - 14 },
      vel: { x: rng.range(-14, 14), y: -34 },
      text: String(Math.round(amount)),
      color,
      life: big ? 0.95 : 0.62,
      maxLife: big ? 0.95 : 0.62,
      size: big ? 15 : 11,
    });
  }

  shieldNumber(pos: Vec2, amount: number): void {
    this.pushText({
      pos: { x: pos.x, y: pos.y - 20 },
      vel: { x: 0, y: -22 },
      text: String(Math.round(amount)),
      color: "#8fd8ff",
      life: 0.6,
      maxLife: 0.6,
      size: 11,
    });
  }

  healNumber(pos: Vec2, amount: number): void {
    this.pushText({
      pos: { x: pos.x, y: pos.y - 16 },
      vel: { x: rng.range(-8, 8), y: -30 },
      text: `+${Math.round(amount)}`,
      color: "#7ff0a8",
      life: 0.8,
      maxLife: 0.8,
      size: 12,
    });
  }

  goldNumber(pos: Vec2, amount: number): void {
    this.pushText({
      pos: { x: pos.x, y: pos.y - 24 },
      vel: { x: 0, y: -26 },
      text: `+${Math.round(amount)}`,
      color: "#ffd45e",
      life: 0.9,
      maxLife: 0.9,
      size: 11,
    });
  }

  label(pos: Vec2, text: string, color = "#ffffff", size = 13): void {
    this.pushText({
      pos: { x: pos.x, y: pos.y - 26 },
      vel: { x: 0, y: -20 },
      text,
      color,
      life: 1.1,
      maxLife: 1.1,
      size,
    });
  }

  critMark(pos: Vec2): void {
    this.burst(pos, "#ffcf5e", 8, 90);
  }

  blocked(pos: Vec2): void {
    this.pushText({
      pos: { x: pos.x, y: pos.y - 20 },
      vel: { x: 0, y: -18 },
      text: "korumali",
      color: "#9fb3c8",
      life: 0.6,
      maxLife: 0.6,
      size: 10,
    });
  }

  burst(pos: Vec2, color: string, count = 10, speed = 110, kind: Particle["kind"] = "spark"): void {
    if (this.particles.length > 500) return;
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(speed * 0.35, speed);
      this.particles.push({
        pos: { x: pos.x, y: pos.y },
        vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
        life: rng.range(0.25, 0.6),
        maxLife: 0.6,
        color,
        size: rng.range(1.6, 3.6),
        kind,
        angle: a,
      });
    }
  }

  ring(pos: Vec2, maxR: number, color: string, life = 0.45, width = 3): void {
    this.rings.push({ pos: { x: pos.x, y: pos.y }, r: maxR * 0.2, maxR, life, maxLife: life, color, width });
  }

  beam(a: Vec2, b: Vec2, color: string, life = 0.18, width = 4): void {
    this.beams.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, life, maxLife: life, color, width });
  }

  slash(from: Vec2, to: Vec2, team: Team): void {
    const d = dirTo(from, to);
    this.beam(
      { x: from.x + d.x * 10, y: from.y + d.y * 10 },
      { x: to.x - d.x * 6, y: to.y - d.y * 6 },
      TEAM_COLORS[team],
      0.12,
      2.5,
    );
    this.burst(to, TEAM_COLORS[team], 4, 60);
  }

  /**
   * Yakin dovus darbesi: kilicin izi, carpma noktasinda kivilcim ve
   * genisleyen bir halka. Vurusun hissedilmesi icin efekt hedefin
   * uzerinde, saldiran yonunden gelecek sekilde konumlanir.
   */
  meleeImpact(from: Vec2, to: Vec2, team: Team, crit: boolean): void {
    const d = dirTo(from, to);
    // Carpma noktasi: hedefin saldirgana bakan yuzu
    const hit = { x: to.x - d.x * 8, y: to.y - d.y * 8 };
    const color = TEAM_COLORS[team];

    // Salinim izi
    this.beam(
      { x: from.x + d.x * 14, y: from.y + d.y * 14 },
      { x: to.x + d.x * 6, y: to.y + d.y * 6 },
      "#ffffff",
      0.13,
      crit ? 8 : 6,
    );
    this.beam(
      { x: from.x + d.x * 12, y: from.y + d.y * 12 },
      { x: to.x + d.x * 3, y: to.y + d.y * 3 },
      color,
      0.2,
      crit ? 12 : 9,
    );

    // Carpma kivilcimlari ve halkalari
    this.spark(hit, "#fff6dc", crit ? 18 : 12, crit ? 230 : 170, crit ? 5.5 : 4.2);
    this.spark(hit, color, crit ? 10 : 6, crit ? 150 : 110, crit ? 4.5 : 3.4);
    this.ring(hit, crit ? 30 : 20, "#ffffff", crit ? 0.34 : 0.26, crit ? 4 : 3);
    this.ring(hit, crit ? 44 : 30, color, crit ? 0.4 : 0.3, 2);
  }

  /** Menzilli merminin hedefe carpmasi. */
  rangedImpact(pos: Vec2, color: string, crit: boolean): void {
    this.spark(pos, "#fff6dc", crit ? 16 : 10, crit ? 200 : 140, crit ? 5 : 3.8);
    this.spark(pos, color, crit ? 12 : 8, crit ? 150 : 100, crit ? 4.2 : 3.2);
    this.ring(pos, crit ? 26 : 18, color, 0.3, 3);
  }

  /**
   * Kivilcim patlamasi.
   *
   * `burst`ten farki, parcacik boyutunun cagiran tarafindan verilmesi:
   * darbe kivilcimlari savas alaninda secilsin diye iri olmali.
   */
  spark(pos: Vec2, color: string, count: number, speed: number, size: number): void {
    if (this.particles.length > 500) return;
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(speed * 0.35, speed);
      this.particles.push({
        pos: { x: pos.x, y: pos.y },
        vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
        life: rng.range(0.22, 0.45),
        maxLife: 0.45,
        color,
        size: rng.range(size * 0.55, size),
        kind: "spark",
        angle: a,
      });
    }
  }

  levelUp(pos: Vec2, team: Team): void {
    this.ring(pos, 46, "#ffe08a", 0.7, 3);
    this.burst(pos, "#ffe08a", 14, 90);
  }

  recallStart(pos: Vec2, team: Team): void {
    this.ring(pos, 34, TEAM_COLORS[team], 0.8, 2);
  }

  recallDone(pos: Vec2, team: Team): void {
    this.burst(pos, TEAM_COLORS[team], 18, 120);
  }

  death(pos: Vec2, color: string): void {
    this.burst(pos, color, 22, 150);
    this.ring(pos, 40, color, 0.5, 3);
  }
}
