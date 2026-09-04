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
  meleeImpact(from: Vec2, to: Vec2, team: Team, crit: boolean, combo = 0): void {
    const d = dirTo(from, to);
    // Carpma noktasi: hedefin saldirgana bakan yuzu
    const hit = { x: to.x - d.x * 8, y: to.y - d.y * 8 };
    const color = TEAM_COLORS[team];

    // Kombo zinciri: 1. ve 2. vurus ters yonde savurur, 3. vurus agir
    // bir bitirici olur. Boylece ayni klip tekrarlansa bile darbeler
    // birbirinden ayirt edilir.
    const step = combo % 3;
    const heavy = step === 2 || crit;
    const side = step === 1 ? -1 : 1;
    const scale = heavy ? 1.5 : 1;

    // Salinimin yay izi: darbe yonune dik kaydirilarak egri hissi verilir
    const nx = -d.y * 16 * side * scale;
    const ny = d.x * 16 * side * scale;
    this.beam(
      { x: from.x + d.x * 14 + nx, y: from.y + d.y * 14 + ny },
      { x: to.x + d.x * 6 - nx * 0.5, y: to.y + d.y * 6 - ny * 0.5 },
      "#ffffff",
      0.13,
      (crit ? 8 : 6) * scale,
    );
    this.beam(
      { x: from.x + d.x * 12 + nx * 0.7, y: from.y + d.y * 12 + ny * 0.7 },
      { x: to.x + d.x * 3, y: to.y + d.y * 3 },
      color,
      0.2,
      (crit ? 12 : 9) * scale,
    );

    // Carpma kivilcimlari ve halkalari
    this.spark(hit, "#fff6dc", Math.round((crit ? 18 : 12) * scale), (crit ? 230 : 170) * scale, (crit ? 5.5 : 4.2) * scale);
    this.spark(hit, color, Math.round((crit ? 10 : 6) * scale), (crit ? 150 : 110) * scale, (crit ? 4.5 : 3.4) * scale);
    this.ring(hit, (crit ? 30 : 20) * scale, "#ffffff", crit ? 0.34 : 0.26, crit ? 4 : 3);
    this.ring(hit, (crit ? 44 : 30) * scale, color, crit ? 0.4 : 0.3, 2);
    if (heavy) {
      // Bitirici darbe: yerden kalkan ikinci bir dalga
      this.ring(hit, 62 * scale, "#ffe6a8", 0.42, 3);
    }
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
  /**
   * Yon dogrultusunda genisleyen koni: koni seklindeki yetenekler
   * icin bir yay boyunca dizilmis isinlar ve kivilcimlar.
   */
  cone(pos: Vec2, dir: Vec2, range: number, halfAngle: number, color: string): void {
    const a0 = Math.atan2(dir.y, dir.x);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / (n - 1) - 0.5) * 2 * halfAngle;
      const r = range * (0.75 + 0.25 * Math.cos((i / (n - 1) - 0.5) * Math.PI));
      this.beam(
        { x: pos.x + Math.cos(a) * 14, y: pos.y + Math.sin(a) * 14 },
        { x: pos.x + Math.cos(a) * r, y: pos.y + Math.sin(a) * r },
        i % 2 === 0 ? "#ffffff" : color,
        0.22,
        i % 2 === 0 ? 5 : 8,
      );
      this.spark(
        { x: pos.x + Math.cos(a) * r * 0.9, y: pos.y + Math.sin(a) * r * 0.9 },
        color, 4, 130, 4.4,
      );
    }
    this.ring(pos, range * 0.55, "#ffffff", 0.24, 3);
  }

  /**
   * Yerden yukselen sok dalgasi: ic ice genisleyen halkalar ve
   * savrulan toz. Genis alan yeteneklerinin vurusu hissedilsin diye.
   */
  shockwave(pos: Vec2, radius: number, color: string): void {
    this.ring(pos, radius, "#ffffff", 0.3, 6);
    this.ring(pos, radius * 0.92, color, 0.55, 9);
    this.ring(pos, radius * 0.6, color, 0.75, 5);
    this.spark(pos, "#fff2c8", 26, radius * 2.4, 6.5);
    this.spark(pos, color, 20, radius * 1.7, 5.5);
    // Cevreye dagilan tas parcalari
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rng.range(-0.2, 0.2);
      this.beam(
        { x: pos.x + Math.cos(a) * radius * 0.25, y: pos.y + Math.sin(a) * radius * 0.25 },
        { x: pos.x + Math.cos(a) * radius * 0.95, y: pos.y + Math.sin(a) * radius * 0.95 },
        color, 0.26, 4,
      );
    }
  }

  /** Kalkan / buff: govdeyi saran yukselen isik halkalari. */
  buffAura(pos: Vec2, color: string, radius: number): void {
    this.ring(pos, radius, color, 0.5, 5);
    this.ring(pos, radius * 1.45, "#ffffff", 0.34, 3);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(a) * radius * 0.85, y: pos.y + Math.sin(a) * radius * 0.85 },
        vel: { x: Math.cos(a) * 14, y: Math.sin(a) * 14 },
        life: 0.55,
        maxLife: 0.55,
        color,
        size: 4.6,
        kind: "spark",
        angle: a,
      });
    }
  }

  /** Atilma izi: gecilen yol boyunca birakilan hiz cizgileri. */
  dashTrail(from: Vec2, to: Vec2, color: string): void {
    this.beam(from, to, "#ffffff", 0.16, 5);
    this.beam(from, to, color, 0.28, 11);
    const d = dirTo(from, to);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      this.spark({ x: x - d.x * 6, y: y - d.y * 6 }, color, 3, 90, 4);
    }
  }

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
