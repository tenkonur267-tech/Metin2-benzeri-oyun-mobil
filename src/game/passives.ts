/**
 * Esya pasifleri.
 *
 * Esyalarin duz ozellikleri `items.ts` icinde; burada o ozelliklerin
 * otesine gecen benzersiz etkiler var. Her pasif, oyun dongusundeki
 * uygun kancadan cagrilir:
 *
 *   tick        her karede (aura, yenilenme)
 *   onAutoHit   normal saldiri hedefe indiginde
 *   onAbilityHit yetenek hasari indiginde
 *   onDamaged   sampiyon hasar aldiginda
 */
import type { Champion } from "./champion";
import type { DamageInfo } from "./types";
import type { Unit } from "./units";
import type { World } from "./world";

export interface ItemPassive {
  /** Magazada gosterilen kisa aciklama. */
  text: string;
  tick?: (world: World, c: Champion, dt: number) => void;
  onAutoHit?: (world: World, c: Champion, target: Unit, damage: number) => void;
  onAbilityHit?: (world: World, c: Champion, target: Unit, damage: number) => void;
  onDamaged?: (world: World, c: Champion, source: Unit | null, info: DamageInfo) => void;
}

/** Pasif sayaclarini esya bazinda tutar (bekleme sureleri vb.). */
const timers = new WeakMap<Champion, Record<string, number>>();

function timer(c: Champion, key: string): number {
  return timers.get(c)?.[key] ?? 0;
}

function setTimer(c: Champion, key: string, value: number): void {
  const t = timers.get(c) ?? {};
  t[key] = value;
  timers.set(c, t);
}

/** Sayaclari ilerletir; her karede bir kez cagrilir. */
function stepTimers(c: Champion, dt: number): void {
  const t = timers.get(c);
  if (!t) return;
  for (const k of Object.keys(t)) t[k] = Math.max(0, t[k] - dt);
}

export const ITEM_PASSIVES: Record<string, ItemPassive> = {
  // --- Yakin dovus / savasci ---
  sunfire: {
    text: "Yakin cevredeki dusmanlara saniyede 28 (+%2 maks. can) buyu hasari.",
    tick: (world, c, dt) => {
      const r = 130;
      const dps = 28 + c.stats.maxHp * 0.02;
      for (const u of world.enemiesInRadius(c.team, c.pos, r, true)) {
        if (u.isStructure) continue;
        u.takeDamage(world, { amount: dps * dt, type: "magic", sourceId: c.id, label: "Gunes Alevi" });
      }
      if (timer(c, "sunfireFx") <= 0) {
        setTimer(c, "sunfireFx", 0.5);
        world.fx.ring(c.pos, r, "#ff9b4a", 0.45, 2);
      }
    },
  },
  thornmail: {
    text: "Normal saldiriyla alinan hasarin %22'sini saldirana geri yansitir.",
    onDamaged: (world, c, source, info) => {
      if (!info.isAuto || !source || source.isStructure) return;
      source.takeDamage(world, {
        amount: info.amount * 0.22,
        type: "magic",
        sourceId: c.id,
        label: "Dikenli Zirh",
      });
    },
  },
  hydra: {
    text: "Normal saldirilar cevredeki dusmanlara hasarin %45'i kadar yayilir.",
    onAutoHit: (world, c, target, damage) => {
      for (const u of world.enemiesInRadius(c.team, target.pos, 95, true)) {
        if (u === target || u.isStructure) continue;
        u.takeDamage(world, {
          amount: damage * 0.45,
          type: "physical",
          sourceId: c.id,
          label: "Hidra",
        });
      }
      world.fx.ring(target.pos, 95, "#ff8f6a", 0.24, 3);
    },
  },
  triforce: {
    text: "Yetenek kullandiktan sonraki ilk normal saldiri +%180 SG ek hasar verir.",
    onAutoHit: (world, c, target) => {
      if (timer(c, "spellblade") <= 0) return;
      setTimer(c, "spellblade", 0);
      target.takeDamage(world, {
        amount: c.stats.ad * 1.8,
        type: "physical",
        sourceId: c.id,
        label: "Uclu Mizrak",
      });
      world.fx.ring(target.pos, 40, "#ffe08a", 0.3, 4);
    },
  },
  sword_inf: {
    text: "Kritik vuruslar %25 daha fazla hasar verir.",
  },
  bloodthirst: {
    text: "Can dolu iken calinan can, en fazla 320 degerinde kalkana donusur.",
    tick: (world, c) => {
      if (c.hp < c.stats.maxHp - 1 || c.stats.lifesteal <= 0) return;
      if (timer(c, "btShield") > 0) return;
      setTimer(c, "btShield", 1);
      const cur = c.effects.find((e) => e.id === "btShield");
      const next = Math.min(320, (cur?.value ?? 0) + 24);
      c.addEffect({ id: "btShield", kind: "shield", time: 8, value: next, label: "🩸", color: "#c0334a" });
    },
  },
  phantom: {
    text: "Normal saldiri isabetinde 2sn boyunca +%20 hareket hizi.",
    onAutoHit: (world, c) => {
      c.addEffect({ id: "phantomHaste", kind: "haste", time: 2, value: 0.2, label: "", color: "#dfe8ff" });
    },
  },

  // --- Buyucu ---
  liandry: {
    text: "Yetenek isabetleri 3sn boyunca saniyede maks. caninin %2'si kadar yakar.",
    onAbilityHit: (world, c, target) => {
      if (target.isStructure) return;
      target.addEffect({
        id: `liandry${c.id}`,
        kind: "dot",
        time: 3,
        value: target.stats.maxHp * 0.02,
        sourceId: c.id,
        damageType: "magic",
        label: "🔥",
        color: "#ff7a4a",
      });
    },
  },
  luden: {
    text: "Her 6sn'de bir yetenek isabetinde +85 (+%12 YG) ek buyu hasari.",
    onAbilityHit: (world, c, target) => {
      if (timer(c, "luden") > 0) return;
      setTimer(c, "luden", 6);
      target.takeDamage(world, {
        amount: 85 + c.stats.ap * 0.12,
        type: "magic",
        sourceId: c.id,
        label: "Bosluk Asasi",
      });
      world.fx.burst(target.pos, "#9f8bff", 10, 130);
    },
  },
  hourglass: {
    text: "Olumcul hasarda 2sn dokunulmazlik verir (90sn bekleme).",
    onDamaged: (world, c) => {
      if (c.hp > c.stats.maxHp * 0.16 || timer(c, "hourglass") > 0) return;
      setTimer(c, "hourglass", 90);
      c.addEffect({ id: "stasis", kind: "invuln", time: 2, value: 1, label: "⏳", color: "#ffd27a" });
      world.fx.ring(c.pos, 60, "#ffd27a", 0.8, 5);
      world.log(`${c.displayName()} kum saatini kullandi`, "#ffd27a");
    },
  },

  // --- Tank / destek ---
  warmog: {
    text: "8sn hasar almadiysan saniyede maks. caninin %3'u yenilenir.",
    tick: (world, c, dt) => {
      if (c.outOfCombat < 8) return;
      c.heal(world, c.stats.maxHp * 0.03 * dt, true);
    },
  },
  redemption: {
    text: "Her 4sn'de cevredeki yarali muttefikleri 60 (+%6 YG) iyilestirir.",
    tick: (world, c, dt) => {
      if (timer(c, "redemption") > 0) return;
      setTimer(c, "redemption", 4);
      const amount = 60 + c.stats.ap * 0.06;
      let healed = false;
      for (const a of world.champions) {
        if (a.team !== c.team || !a.alive || a.hp >= a.stats.maxHp) continue;
        if (Math.hypot(a.pos.x - c.pos.x, a.pos.y - c.pos.y) > 320) continue;
        a.heal(world, amount, true);
        healed = true;
      }
      if (healed) world.fx.ring(c.pos, 320, "#ffe9a8", 0.6, 3);
      void dt;
    },
  },
  ardent: {
    text: "Cevredeki muttefiklere surekli +%18 saldiri hizi.",
    tick: (world, c) => {
      for (const a of world.champions) {
        if (a.team !== c.team || !a.alive || a === c) continue;
        if (Math.hypot(a.pos.x - c.pos.x, a.pos.y - c.pos.y) > 300) continue;
        a.addEffect({ id: "ardent", kind: "asBuff", time: 1.2, value: 0.18, label: "🪔", color: "#ffc06b" });
      }
    },
  },
  spirit: {
    text: "Buyu hasari aldiginda 4sn boyunca +25 buyu direnci kazanir.",
    onDamaged: (world, c, source, info) => {
      if (info.type !== "magic") return;
      // `armorBuff` zirhin yarisi kadar buyu direnci de verir
      c.addEffect({ id: "spiritMr", kind: "armorBuff", time: 4, value: 20, label: "🛡️", color: "#7fe0c8" });
      void source;
    },
  },
};

/** `triforce` icin: yetenek kullanildiginda sonraki vurusu guclendirir. */
export function markSpellblade(c: Champion): void {
  if (c.items.some((i) => i.id === "triforce")) setTimer(c, "spellblade", 6);
}

/** Sampiyonun sahip oldugu pasifleri her karede isletir. */
export function tickPassives(world: World, c: Champion, dt: number): void {
  stepTimers(c, dt);
  for (const it of c.items) ITEM_PASSIVES[it.id]?.tick?.(world, c, dt);
}

export function autoHitPassives(world: World, c: Champion, target: Unit, damage: number): void {
  for (const it of c.items) ITEM_PASSIVES[it.id]?.onAutoHit?.(world, c, target, damage);
}

export function abilityHitPassives(world: World, c: Champion, target: Unit, damage: number): void {
  for (const it of c.items) ITEM_PASSIVES[it.id]?.onAbilityHit?.(world, c, target, damage);
}

export function damagedPassives(
  world: World,
  c: Champion,
  source: Unit | null,
  info: DamageInfo,
): void {
  for (const it of c.items) ITEM_PASSIVES[it.id]?.onDamaged?.(world, c, source, info);
}

/** Kritik hasar carpani (Sonsuz Kilic pasifi). */
export function critMultiplier(c: Champion): number {
  return c.items.some((i) => i.id === "sword_inf") ? 2.0 : 1.75;
}
