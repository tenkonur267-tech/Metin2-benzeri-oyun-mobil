import { sfx } from "../core/audio";
import { clamp, dirTo, dist, inCone, rad, type Vec2 } from "../core/math";
import type { Champion } from "./champion";
import { isBlockedCircle } from "./grid";
import { makeProjectile, makeZone } from "./projectile";
import type { Unit } from "./units";
import type { DamageType } from "./types";
import type { World } from "./world";

export interface AimInput {
  /** Nisan alinan dunya noktasi. */
  point: Vec2;
  /** Sampiyondan nisan noktasina birim yon. */
  dir: Vec2;
  /** Birim hedefli yetenekler icin. */
  target: Unit | null;
}

type Impl = (world: World, c: Champion, rank: number, aim: AimInput) => boolean;

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------

/** Sira degerine gore taban + oran hesaplar. */
const val = (base: number[], rank: number, ratio: number, stat: number): number =>
  (base[clamp(rank, 1, base.length) - 1] ?? base[0]) + ratio * stat;

function hurt(
  world: World,
  c: Champion,
  u: Unit,
  amount: number,
  type: DamageType,
  label: string,
): void {
  u.takeDamage(world, { amount, type, sourceId: c.id, label });
}

/** Belirli yaricaptaki dusmanlar. */
function enemiesAround(world: World, c: Champion, pos: Vec2, radius: number): Unit[] {
  return world.enemiesInRadius(c.team, pos, radius, true).filter((u) => !u.isStructure || u.kind === "tower");
}

function coneTargets(world: World, c: Champion, dir: Vec2, range: number, halfDeg: number): Unit[] {
  return enemiesAround(world, c, c.pos, range + 30).filter((u) =>
    inCone(u.pos, c.pos, dir, range + u.radius, rad(halfDeg)),
  );
}

function slow(u: Unit, id: number, amount: number, time: number): void {
  u.addEffect({ id: `slow_${id}`, kind: "slow", time, value: amount, label: "Yavas", color: "#7fd0ff" });
}

function stun(u: Unit, id: number, time: number): void {
  u.addEffect({ id: `stun_${id}`, kind: "stun", time, value: 1, label: "Sersem", color: "#ffd27a" });
}

function root(u: Unit, id: number, time: number): void {
  u.addEffect({ id: `root_${id}`, kind: "root", time, value: 1, label: "Kok", color: "#a0ffb0" });
}

function shield(c: Unit, id: string, amount: number, time: number): void {
  c.addEffect({ id, kind: "shield", time, value: amount, label: "Kalkan", color: "#8fd8ff" });
}

/** Duvarlara takilmayan guvenli isinlanma. */
function blinkTo(world: World, c: Champion, point: Vec2, maxRange: number): void {
  const d = dist(c.pos, point);
  const dir = d < 1 ? { x: Math.cos(c.facing), y: Math.sin(c.facing) } : dirTo(c.pos, point);
  const range = Math.min(d, maxRange);
  let best: Vec2 = { x: c.pos.x, y: c.pos.y };
  for (let t = range; t > 0; t -= 8) {
    const cand = { x: c.pos.x + dir.x * t, y: c.pos.y + dir.y * t };
    if (!worldBlocked(cand, c.radius)) {
      best = cand;
      break;
    }
  }
  world.fx.burst(c.pos, c.def.color, 12, 130);
  c.pos = best;
  c.path.length = 0;
  world.fx.burst(c.pos, c.def.color, 12, 130);
}

function worldBlocked(p: Vec2, r: number): boolean {
  return isBlockedCircle(p.x, p.y, r);
}

// ---------------------------------------------------------------------------
// Yetenek uygulamalari
// ---------------------------------------------------------------------------

export const ABILITY_IMPL: Record<string, Impl> = {
  // ======================= KAYA =======================
  "kaya:Q": (w, c, r, aim) => {
    const dmg = val([60, 95, 130, 165, 200], r, 0.8, c.stats.ad);
    const dir = aim.dir;
    w.fx.ring(
      { x: c.pos.x + dir.x * 55, y: c.pos.y + dir.y * 55 },
      70,
      c.def.color,
      0.35,
      5,
    );
    for (const u of coneTargets(w, c, dir, 120, 55)) {
      hurt(w, c, u, dmg, "physical", "Kaya Vurusu");
      slow(u, c.id, 0.3, 1.5);
    }
    return true;
  },
  "kaya:W": (w, c, r) => {
    const amount = val([80, 130, 180, 230, 280], r, 0.12, c.stats.maxHp);
    shield(c, "kaya_w", amount, 3);
    c.addEffect({ id: "kaya_w_armor", kind: "armorBuff", time: 3, value: 25, label: "Zirh", color: "#9fb3c8" });
    w.fx.ring(c.pos, 40, "#9fd8ff", 0.6, 4);
    return true;
  },
  "kaya:E": (w, c, r, aim) => {
    const dmg = val([70, 115, 160, 205, 250], r, 0.6, c.stats.ad);
    const hit = new Set<number>();
    c.startDash(aim.dir, 520, 0.4, (world) => {
      world.fx.ring(c.pos, 55, c.def.color, 0.4, 4);
    });
    // Atilma sirasinda carpisma icin kisa sureli alan
    w.addZone(
      makeZone({
        team: c.team,
        sourceId: c.id,
        pos: c.pos,
        radius: 34,
        time: 0.42,
        dps: 0,
        color: c.def.color,
        label: "Sarsinti",
        shape: "circle",
        onTick: (world, z) => {
          z.pos.x = c.pos.x;
          z.pos.y = c.pos.y;
          for (const u of enemiesAround(world, c, c.pos, 36)) {
            if (hit.has(u.id)) continue;
            hit.add(u.id);
            hurt(world, c, u, dmg, "physical", "Sarsinti");
            stun(u, c.id, 0.7);
          }
        },
      }),
    );
    return true;
  },
  "kaya:R": (w, c, r) => {
    const dmg = val([220, 340, 460], r, 0.9, c.stats.ad);
    w.fx.ring(c.pos, 175, "#ffb347", 0.9, 7);
    w.fx.burst(c.pos, "#ffb347", 30, 190);
    for (const u of enemiesAround(w, c, c.pos, 175)) {
      hurt(w, c, u, dmg, "physical", "Yerin Ofkesi");
      stun(u, c.id, 1.2);
    }
    return true;
  },

  // ======================= SELIN =======================
  "selin:Q": (w, c, r, aim) => {
    const dmg = val([70, 110, 150, 190, 230], r, 0.65, c.stats.ap);
    w.addProjectile(
      makeProjectile({
        team: c.team,
        sourceId: c.id,
        pos: c.pos,
        dir: aim.dir,
        speed: 620,
        damage: dmg,
        damageType: "magic",
        range: 300,
        radius: 12,
        color: "#b9a8ff",
        label: "Ay Oku",
        shape: "bolt",
      }),
    );
    return true;
  },
  "selin:W": (w, c, r, aim) => {
    const total = val([100, 160, 220, 280, 340], r, 0.7, c.stats.ap);
    w.addZone(
      makeZone({
        team: c.team,
        sourceId: c.id,
        pos: aim.point,
        radius: 90,
        time: 2.5,
        dps: total / 2.5,
        damageType: "magic",
        slow: 0.35,
        color: "#9d8bff",
        label: "Yildiz Yagmuru",
        shape: "storm",
      }),
    );
    return true;
  },
  "selin:E": (w, c, r, aim) => {
    blinkTo(w, c, aim.point, 165);
    shield(c, "selin_e", val([60, 90, 120, 150, 180], r, 0.4, c.stats.ap), 2);
    return true;
  },
  "selin:R": (w, c, r, aim) => {
    const dmg = val([280, 430, 580], r, 1.0, c.stats.ap);
    w.addZone(
      makeZone({
        team: c.team,
        sourceId: c.id,
        pos: aim.point,
        radius: 120,
        time: 0.75,
        dps: 0,
        color: "#c9b8ff",
        label: "Dolunay",
        shape: "warning",
        onExpire: (world, z) => {
          world.fx.ring(z.pos, 120, "#e0d4ff", 0.8, 8);
          world.fx.burst(z.pos, "#e0d4ff", 34, 200);
          for (const u of world.enemiesInRadius(c.team, z.pos, 120, true)) {
            if (u.isStructure && u.kind !== "tower") continue;
            hurt(world, c, u, dmg, "magic", "Dolunay");
            root(u, c.id, 1.2);
          }
        },
      }),
    );
    return true;
  },

  // ======================= DEMIR =======================
  "demir:Q": (w, c, r) => {
    const bonus = c.stats.ad * val([0.5, 0.7, 0.9, 1.1, 1.3], r, 0, 0);
    c.empoweredAttack = { bonus, slow: 0.25, label: "Delici Ok" };
    c.addEffect({ id: "empowered", kind: "adBuff", time: 6, value: 0, label: "Q!", color: "#ffd45e" });
    w.fx.ring(c.pos, 30, "#ffd45e", 0.4, 3);
    return true;
  },
  "demir:W": (w, c, r) => {
    const as = val([0.3, 0.4, 0.5, 0.6, 0.7], r, 0, 0);
    c.addEffect({ id: "demir_w", kind: "asBuff", time: 4, value: as, label: "Hiz", color: "#ffd45e" });
    c.addEffect({ id: "demir_w_ms", kind: "haste", time: 4, value: 0.15, label: "", color: "#ffd45e" });
    return true;
  },
  "demir:E": (w, c, r, aim) => {
    c.startDash(aim.dir, 620, 0.28);
    c.addEffect({ id: "demir_e", kind: "asBuff", time: 1.5, value: 0.2, label: "", color: "#ffd45e" });
    return true;
  },
  "demir:R": (w, c, r, aim) => {
    const dmg = val([200, 320, 440], r, 1.2, c.stats.ad);
    w.addProjectile(
      makeProjectile({
        team: c.team,
        sourceId: c.id,
        pos: c.pos,
        dir: aim.dir,
        speed: 900,
        damage: dmg,
        damageType: "physical",
        range: 620,
        radius: 15,
        pierce: true,
        color: "#ffd45e",
        label: "Yildirim Oku",
        shape: "arrow",
      }),
    );
    w.fx.beam(c.pos, { x: c.pos.x + aim.dir.x * 620, y: c.pos.y + aim.dir.y * 620 }, "#ffe9a8", 0.25, 3);
    return true;
  },

  // ======================= GOLGE =======================
  "golge:Q": (w, c, r, aim) => {
    const t = aim.target;
    if (!t || !t.alive || dist(c.pos, t.pos) > 210) return false;
    const dmg = val([60, 100, 140, 180, 220], r, 0.75, c.stats.ad);
    const dir = dirTo(c.pos, t.pos);
    const d = Math.max(0, dist(c.pos, t.pos) - (t.radius + c.radius));
    c.startDash(dir, 900, d / 900 + 0.02, (world) => {
      hurt(world, c, t, dmg, "physical", "Golge Darbesi");
      world.fx.slash(c.pos, t.pos, c.team);
      c.target = t;
    });
    return true;
  },
  "golge:W": (w, c, r) => {
    const ms = val([0.3, 0.35, 0.4, 0.45, 0.5], r, 0, 0);
    c.addEffect({ id: "golge_w", kind: "stealth", time: 2.5, value: 1, label: "Gizli", color: "#6a5acd" });
    c.addEffect({ id: "golge_w_ms", kind: "haste", time: 2.5, value: ms, label: "", color: "#6a5acd" });
    w.fx.burst(c.pos, "#6a5acd", 18, 120);
    return true;
  },
  "golge:E": (w, c, r, aim) => {
    const dmg = val([55, 90, 125, 160, 195], r, 0.55, c.stats.ad);
    w.addProjectile(
      makeProjectile({
        team: c.team,
        sourceId: c.id,
        pos: c.pos,
        dir: aim.dir,
        speed: 700,
        damage: dmg,
        damageType: "physical",
        range: 280,
        radius: 10,
        color: "#8f7bd8",
        label: "Bicak",
        shape: "blade",
        slow: 0.3,
        slowTime: 2,
      }),
    );
    return true;
  },
  "golge:R": (w, c, r, aim) => {
    const t = aim.target;
    if (!t || !t.alive || dist(c.pos, t.pos) > 310) return false;
    const base = val([150, 250, 350], r, 0.8, c.stats.ad);
    const dir = dirTo(c.pos, t.pos);
    const d = Math.max(0, dist(c.pos, t.pos) - (t.radius + c.radius));
    c.startDash(dir, 1100, d / 1100 + 0.02, (world) => {
      const missing = 1 - t.hpPct;
      const dmg = base * (1 + missing);
      hurt(world, c, t, dmg, "physical", "Infaz");
      world.fx.ring(t.pos, 60, "#b088ff", 0.5, 5);
      world.fx.burst(t.pos, "#b088ff", 22, 170);
      c.target = t;
    });
    return true;
  },

  // ======================= AYLA =======================
  "ayla:Q": (w, c, r, aim) => {
    const dmg = val([65, 105, 145, 185, 225], r, 0.6, c.stats.ap);
    w.addProjectile(
      makeProjectile({
        team: c.team,
        sourceId: c.id,
        pos: c.pos,
        dir: aim.dir,
        speed: 660,
        damage: dmg,
        damageType: "magic",
        range: 290,
        radius: 11,
        color: "#ffe9a8",
        label: "Isik Huzmesi",
        shape: "bolt",
      }),
    );
    return true;
  },
  "ayla:W": (w, c, r) => {
    const amount = val([90, 135, 180, 225, 270], r, 0.55, c.stats.ap);
    const allies = w
      .alliesInRadius(c.team, c.pos, 230)
      .filter((a) => a.alive)
      .sort((a, b) => a.hpPct - b.hpPct);
    const target = allies[0] && allies[0].hpPct < 0.95 ? allies[0] : c;
    target.heal(w, amount);
    w.fx.ring(target.pos, 40, "#8fffc0", 0.6, 4);
    return true;
  },
  "ayla:E": (w, c, r) => {
    const ms = val([0.25, 0.3, 0.35, 0.4, 0.45], r, 0, 0);
    for (const a of w.alliesInRadius(c.team, c.pos, 220)) {
      a.addEffect({ id: "ayla_e", kind: "haste", time: 3, value: ms, label: "Hiz", color: "#ffe9a8" });
      w.fx.ring(a.pos, 26, "#ffe9a8", 0.4, 2);
    }
    return true;
  },
  "ayla:R": (w, c, r) => {
    const dmg = val([150, 230, 310], r, 0.7, c.stats.ap);
    const healAmt = val([150, 250, 350], r, 0.5, c.stats.ap);
    w.fx.ring(c.pos, 200, "#fff0c0", 1, 8);
    for (const u of enemiesAround(w, c, c.pos, 200)) {
      hurt(w, c, u, dmg, "magic", "Kutsal Firtina");
      root(u, c.id, 1.5);
    }
    for (const a of w.alliesInRadius(c.team, c.pos, 200)) a.heal(w, healAmt);
    return true;
  },

  // ======================= BOZKURT =======================
  "bozkurt:Q": (w, c, r, aim) => {
    const dmg = val([70, 115, 160, 205, 250], r, 0.7, c.stats.ad);
    const d = Math.min(230, dist(c.pos, aim.point));
    c.startDash(aim.dir, 700, d / 700, (world) => {
      world.fx.ring(c.pos, 70, c.def.color, 0.45, 5);
      for (const u of enemiesAround(world, c, c.pos, 70)) {
        hurt(world, c, u, dmg, "physical", "Kurt Sicrayisi");
      }
    });
    return true;
  },
  "bozkurt:W": (w, c, r, aim) => {
    const dmg = val([50, 85, 120, 155, 190], r, 0.5, c.stats.ad);
    const bleed = c.stats.ad * 0.6;
    const targets = coneTargets(w, c, aim.dir, 110, 65);
    let dealt = 0;
    for (const u of targets) {
      hurt(w, c, u, dmg, "physical", "Parcalayan Pence");
      dealt += dmg;
      u.addEffect({
        id: `bleed_${c.id}`,
        kind: "dot",
        time: 4,
        value: bleed / 4,
        sourceId: c.id,
        damageType: "physical",
        label: "Kanama",
        color: "#d8384a",
      });
    }
    if (dealt > 0) c.heal(w, dealt * 0.4);
    w.fx.burst({ x: c.pos.x + aim.dir.x * 50, y: c.pos.y + aim.dir.y * 50 }, "#d8384a", 12, 120);
    return true;
  },
  "bozkurt:E": (w, c, r) => {
    const as = val([0.35, 0.45, 0.55, 0.65, 0.75], r, 0, 0);
    c.addEffect({ id: "bozkurt_e", kind: "asBuff", time: 5, value: as, label: "Av", color: "#c9b08a" });
    c.addEffect({ id: "bozkurt_e_ls", kind: "lifestealBuff", time: 5, value: 0.12, label: "", color: "#c9b08a" });
    return true;
  },
  "bozkurt:R": (w, c, r, aim) => {
    const t = aim.target;
    if (!t || !t.alive || dist(c.pos, t.pos) > 185) return false;
    const dmg = val([250, 400, 550], r, 1.0, c.stats.ad);
    stun(t, c.id, 1.3);
    hurt(w, c, t, dmg, "physical", "Bogazlama");
    w.fx.ring(t.pos, 55, "#d8384a", 0.7, 6);
    w.fx.beam(c.pos, t.pos, "#d8384a", 0.3, 5);
    c.target = t;
    return true;
  },

  // ======================= DENIZ =======================
  "deniz:Q": (w, c, r, aim) => {
    const dmg = val([65, 105, 145, 185, 225], r, 0.55, c.stats.ap);
    w.fx.ring({ x: c.pos.x + aim.dir.x * 60, y: c.pos.y + aim.dir.y * 60 }, 75, "#4fc7d8", 0.4, 5);
    for (const u of coneTargets(w, c, aim.dir, 135, 55)) {
      hurt(w, c, u, dmg, "magic", "Dalga Kirici");
      slow(u, c.id, 0.35, 1.5);
    }
    return true;
  },
  "deniz:W": (w, c, r) => {
    const amount = val([90, 140, 190, 240, 290], r, 0.45, c.stats.ap);
    shield(c, "deniz_w", amount, 3);
    const allies = w
      .alliesInRadius(c.team, c.pos, 200)
      .filter((a) => a !== c && a.alive)
      .sort((a, b) => a.hpPct - b.hpPct);
    if (allies[0]) shield(allies[0], "deniz_w", amount, 3);
    w.fx.ring(c.pos, 45, "#4fc7d8", 0.6, 4);
    return true;
  },
  "deniz:E": (w, c, r, aim) => {
    const total = val([70, 110, 150, 190, 230], r, 0.5, c.stats.ap);
    w.addZone(
      makeZone({
        team: c.team,
        sourceId: c.id,
        pos: aim.point,
        radius: 95,
        time: 2,
        dps: total / 2,
        damageType: "magic",
        slow: 0.4,
        pull: 55,
        color: "#4fc7d8",
        label: "Girdap",
        shape: "storm",
      }),
    );
    return true;
  },
  "deniz:R": (w, c, r, aim) => {
    const dmg = val([240, 380, 520], r, 0.8, c.stats.ap);
    const dir = aim.dir;
    w.addProjectile(
      makeProjectile({
        team: c.team,
        sourceId: c.id,
        pos: c.pos,
        dir,
        speed: 430,
        damage: dmg,
        damageType: "magic",
        range: 380,
        radius: 45,
        pierce: true,
        color: "#4fc7d8",
        label: "Tsunami",
        shape: "wave",
        onHit: (world, u) => {
          stun(u, c.id, 1);
          if (!u.isStructure && u.kind !== "monster") {
            u.startDash(dir, 340, 0.35);
          }
          world.fx.burst(u.pos, "#8fe8f5", 14, 150);
        },
      }),
    );
    return true;
  },

  // ======================= ALEV =======================
  "alev:Q": (w, c, r, aim) => {
    const dmg = val([75, 115, 155, 195, 235], r, 0.6, c.stats.ap);
    const burn = c.stats.ap * 0.25;
    w.addProjectile(
      makeProjectile({
        team: c.team,
        sourceId: c.id,
        pos: c.pos,
        dir: aim.dir,
        speed: 600,
        damage: dmg,
        damageType: "magic",
        range: 290,
        radius: 13,
        color: "#ff8f47",
        label: "Alev Topu",
        shape: "orb",
        onHit: (world, u) => {
          u.addEffect({
            id: `burn_${c.id}`,
            kind: "dot",
            time: 3,
            value: burn / 3,
            sourceId: c.id,
            damageType: "magic",
            label: "Yanma",
            color: "#ff8f47",
          });
        },
      }),
    );
    return true;
  },
  "alev:W": (w, c, r) => {
    const dps = val([30, 45, 60, 75, 90], r, 0.2, c.stats.ap);
    w.addZone(
      makeZone({
        team: c.team,
        sourceId: c.id,
        pos: c.pos,
        radius: 110,
        time: 4,
        dps,
        damageType: "magic",
        color: "#ff8f47",
        label: "Ates Cemberi",
        shape: "burning",
        onTick: (_world, z) => {
          z.pos.x = c.pos.x;
          z.pos.y = c.pos.y;
        },
      }),
    );
    return true;
  },
  "alev:E": (w, c, r, aim) => {
    const dmg = val([60, 95, 130, 165, 200], r, 0.4, c.stats.ap);
    const from = { x: c.pos.x, y: c.pos.y };
    blinkTo(w, c, aim.point, 190);
    const mid = { x: (from.x + c.pos.x) / 2, y: (from.y + c.pos.y) / 2 };
    w.fx.beam(from, c.pos, "#ff8f47", 0.3, 6);
    w.addZone(
      makeZone({
        team: c.team,
        sourceId: c.id,
        pos: mid,
        radius: Math.max(60, dist(from, c.pos) / 2 + 25),
        time: 0.2,
        dps: dmg,
        once: true,
        damageType: "magic",
        color: "#ff8f47",
        label: "Kor",
        shape: "burning",
      }),
    );
    return true;
  },
  "alev:R": (w, c, r, aim) => {
    const dmg = val([300, 450, 600], r, 1.1, c.stats.ap);
    const burn = c.stats.ap * 0.4;
    w.addZone(
      makeZone({
        team: c.team,
        sourceId: c.id,
        pos: aim.point,
        radius: 130,
        time: 1,
        dps: 0,
        color: "#ff6a2a",
        label: "Meteor",
        shape: "warning",
        onExpire: (world, z) => {
          world.fx.ring(z.pos, 130, "#ff9b4a", 0.9, 9);
          world.fx.burst(z.pos, "#ff9b4a", 40, 230);
          for (const u of world.enemiesInRadius(c.team, z.pos, 130, true)) {
            if (u.isStructure && u.kind !== "tower") continue;
            hurt(world, c, u, dmg, "magic", "Meteor");
            u.addEffect({
              id: `burn_${c.id}`,
              kind: "dot",
              time: 3,
              value: burn / 3,
              sourceId: c.id,
              damageType: "magic",
              label: "Yanma",
              color: "#ff8f47",
            });
          }
        },
      }),
    );
    return true;
  },
};

// ---------------------------------------------------------------------------
// Genel yetenek kullanimi
// ---------------------------------------------------------------------------

export function castAbility(world: World, c: Champion, key: "Q" | "W" | "E" | "R", aim: AimInput): boolean {
  if (!c.canCastAbility(key)) return false;
  const impl = ABILITY_IMPL[`${c.def.id}:${key}`];
  if (!impl) return false;
  const st = c.abilities[key];
  const ok = impl(world, c, st.rank, aim);
  if (!ok) return false;
  c.mp -= c.costFor(key);
  st.cd = c.cooldownFor(key);
  c.castAnim = 0.3;
  c.castAnimKey = key;
  if (c.isPlayer) sfx.play(key === "R" ? "ult" : "cast");
  c.cancelRecall();
  if (c.hasEffect("stealth") && (key === "Q" || key === "R")) c.removeEffect("golge_w");
  return true;
}

export function castSummoner(world: World, c: Champion, index: number, aim: AimInput): boolean {
  const slot = c.summoners[index];
  if (!slot || slot.cd > 0 || !c.alive) return false;
  switch (slot.spell.id) {
    case "flash": {
      if (!c.canMove) return false;
      blinkTo(world, c, aim.point, 95);
      world.fx.ring(c.pos, 40, "#ffffff", 0.4, 3);
      break;
    }
    case "ignite": {
      const t =
        aim.target && aim.target.team !== c.team
          ? aim.target
          : world.nearestEnemyChampion(c.team, c.pos, 320);
      if (!t) return false;
      t.addEffect({
        id: `ignite_${c.id}`,
        kind: "dot",
        time: 5,
        value: (60 + c.level * 16) / 5,
        sourceId: c.id,
        damageType: "true",
        label: "Tutusturma",
        color: "#ff6a2a",
      });
      world.fx.beam(c.pos, t.pos, "#ff6a2a", 0.4, 3);
      break;
    }
    case "heal": {
      const amount = 90 + c.level * 26;
      c.heal(world, amount);
      c.addEffect({ id: "heal_ms", kind: "haste", time: 2, value: 0.3, label: "Hiz", color: "#8fffc0" });
      for (const a of world.alliesInRadius(c.team, c.pos, 150)) {
        if (a === c) continue;
        a.heal(world, amount * 0.6);
        a.addEffect({ id: "heal_ms", kind: "haste", time: 2, value: 0.3, label: "", color: "#8fffc0" });
      }
      break;
    }
  }
  slot.cd = slot.spell.cd;
  c.cancelRecall();
  if (c.isPlayer) sfx.play("cast");
  return true;
}
