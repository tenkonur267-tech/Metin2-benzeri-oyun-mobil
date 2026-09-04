import { sfx } from "../core/audio";
import { clamp, dist } from "../core/math";
import { CONFIG, NEXUS_POS, RADIUS, SPAWN_POS, levelFromXp } from "./constants";
import { getItem, MAX_ITEMS } from "./items";
import { emptyStats, Unit } from "./units";
import type { AbilityState, ChampionDef, ItemDef, Stats, Team } from "./types";
import type { World } from "./world";

export type SummonerId = "flash" | "ignite" | "heal";

export interface SummonerSpell {
  id: SummonerId;
  name: string;
  emoji: string;
  cd: number;
  desc: string;
}

export const SUMMONERS: Record<SummonerId, SummonerSpell> = {
  flash: { id: "flash", name: "Sicrama", emoji: "⚡", cd: 210, desc: "Kisa mesafe isinlanir." },
  ignite: { id: "ignite", name: "Tutusturma", emoji: "🔥", cd: 150, desc: "Hedefe 5sn boyunca gercek hasar." },
  heal: { id: "heal", name: "Iyilestirme", emoji: "💚", cd: 160, desc: "Kendini iyilestirir ve hizlandirir." },
};

/** Yetenek puani dagitim sirasi (1..18). R oncelikli. */
function levelUpOrder(): ("Q" | "W" | "E" | "R")[] {
  const order: ("Q" | "W" | "E" | "R")[] = [];
  const cycle: ("Q" | "W" | "E")[] = ["Q", "W", "E"];
  let qi = 0;
  for (let lvl = 1; lvl <= 18; lvl++) {
    if (lvl === 6 || lvl === 11 || lvl === 16) {
      order.push("R");
      continue;
    }
    order.push(cycle[qi % 3]);
    qi++;
  }
  return order;
}

const LEVEL_ORDER = levelUpOrder();

export class Champion extends Unit {
  readonly kind = "champion" as const;
  def: ChampionDef;
  displayLabel: string;
  isPlayer: boolean;

  level = 1;
  xp = 0;
  gold = CONFIG.startingGold;
  totalGold = CONFIG.startingGold;
  items: ItemDef[] = [];
  cs = 0;

  kills = 0;
  deaths = 0;
  assists = 0;
  killStreak = 0;

  abilities: Record<string, AbilityState> = {};
  summoners: { spell: SummonerSpell; cd: number }[] = [];

  respawnTimer = 0;
  recallTimer = 0;
  /** Oyuncunun otomatik saldiri tercihi. */
  autoAttack = true;
  /** Yapay zeka durumu (botlar icin). */
  ai: Record<string, unknown> = {};
  lane: import("./types").Lane;

  /** Son hasar alma zamani (savas disi yenilenme icin). */
  lastDamageTime = -99;

  /** Son yetenek animasyonu icin. */
  castAnim = 0;
  castAnimKey = "";

  /** Bir sonraki otomatik saldiri guclendirildi mi? */
  empoweredAttack: { bonus: number; slow?: number; label: string } | null = null;

  constructor(def: ChampionDef, team: Team, isPlayer: boolean, name?: string) {
    super(team, SPAWN_POS[team], RADIUS.champion);
    this.def = def;
    this.isPlayer = isPlayer;
    this.displayLabel = name ?? def.name;
    this.lane = def.preferredLane;
    for (const a of def.abilities) this.abilities[a.key] = { cd: 0, rank: 0 };
    const second: SummonerId = def.role === "Destek" || def.role === "Nisanci" ? "heal" : "ignite";
    this.summoners = [
      { spell: SUMMONERS.flash, cd: 0 },
      { spell: SUMMONERS[second], cd: 0 },
    ];
    this.grantLevelUps();
    this.computeStats();
    this.hp = this.stats.maxHp;
    this.mp = this.stats.maxMp;
  }

  override displayName(): string {
    return this.displayLabel;
  }

  // -------------------------------------------------------------------------
  // Degerler
  // -------------------------------------------------------------------------

  computeStats(): void {
    const b = this.def.base;
    const l = this.level - 1;
    const s: Stats = {
      ...emptyStats(),
      maxHp: b.hp + b.hpPerLvl * l,
      maxMp: b.mp + b.mpPerLvl * l,
      hpRegen: b.hpRegen + l * 0.16,
      mpRegen: b.mpRegen + l * 0.1,
      ad: b.ad + b.adPerLvl * l,
      ap: 0,
      armor: b.armor + b.armorPerLvl * l,
      mr: b.mr + b.mrPerLvl * l,
      moveSpeed: b.moveSpeed,
      attackSpeed: b.attackSpeed * (1 + b.asPerLvl * l),
      attackRange: b.attackRange,
      crit: 0,
      lifesteal: 0,
      abilityHaste: 0,
      armorPen: 0,
      magicPen: 0,
      tenacity: 0,
      sightRange: 330,
    };

    let asBonus = 0;
    for (const it of this.items) {
      const st = it.stats;
      s.maxHp += st.maxHp ?? 0;
      s.maxMp += st.maxMp ?? 0;
      s.hpRegen += st.hpRegen ?? 0;
      s.mpRegen += st.mpRegen ?? 0;
      s.ad += st.ad ?? 0;
      s.ap += st.ap ?? 0;
      s.armor += st.armor ?? 0;
      s.mr += st.mr ?? 0;
      s.moveSpeed += st.moveSpeed ?? 0;
      s.crit += st.crit ?? 0;
      s.lifesteal += st.lifesteal ?? 0;
      s.abilityHaste += st.abilityHaste ?? 0;
      s.armorPen += st.armorPen ?? 0;
      s.magicPen += st.magicPen ?? 0;
      s.tenacity += st.tenacity ?? 0;
      asBonus += st.attackSpeed ?? 0;
    }

    // Gecici guclendirmeler
    for (const e of this.effects) {
      if (e.kind === "adBuff") s.ad += e.value;
      else if (e.kind === "apBuff") s.ap += e.value;
      else if (e.kind === "armorBuff") {
        s.armor += e.value;
        s.mr += e.value * 0.5;
      } else if (e.kind === "asBuff") asBonus += e.value;
      else if (e.kind === "lifestealBuff") s.lifesteal += e.value;
    }

    s.attackSpeed *= 1 + asBonus;
    s.crit = clamp(s.crit, 0, 1);
    s.tenacity = clamp(s.tenacity, 0, 0.6);
    this.stats = s;
    this.hp = Math.min(this.hp, s.maxHp);
    this.mp = Math.min(this.mp, s.maxMp);
  }

  /** Yetenegin bekleme suresini yetenek hizina gore hesaplar. */
  cooldownFor(key: string): number {
    const def = this.def.abilities.find((a) => a.key === key);
    const st = this.abilities[key];
    if (!def || !st) return 0;
    const base = def.cooldown[Math.max(0, st.rank - 1)] ?? def.cooldown[0];
    return base * (100 / (100 + this.stats.abilityHaste));
  }

  costFor(key: string): number {
    const def = this.def.abilities.find((a) => a.key === key);
    const st = this.abilities[key];
    if (!def || !st) return 0;
    return def.cost[Math.max(0, st.rank - 1)] ?? def.cost[0];
  }

  canCastAbility(key: string): boolean {
    const st = this.abilities[key];
    if (!st || st.rank === 0) return false;
    if (!this.canCast) return false;
    if (st.cd > 0) return false;
    if (this.mp < this.costFor(key)) return false;
    return true;
  }

  // -------------------------------------------------------------------------
  // Seviye / tecrube
  // -------------------------------------------------------------------------

  gainXp(world: World, amount: number): void {
    if (this.level >= CONFIG.maxLevel) return;
    this.xp += amount;
    const newLevel = levelFromXp(this.xp);
    if (newLevel > this.level) {
      const gained = newLevel - this.level;
      this.level = newLevel;
      this.grantLevelUps();
      this.computeStats();
      // Seviye atlayinca bir miktar can/mana
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.12 * gained);
      this.mp = Math.min(this.stats.maxMp, this.mp + this.stats.maxMp * 0.12 * gained);
      world.fx.levelUp(this.pos, this.team);
      if (this.isPlayer) sfx.play("level");
    }
  }

  /** Seviyeye gore yetenek siralarini otomatik dagitir. */
  grantLevelUps(): void {
    const counts: Record<string, number> = { Q: 0, W: 0, E: 0, R: 0 };
    for (let i = 0; i < this.level && i < LEVEL_ORDER.length; i++) {
      const k = LEVEL_ORDER[i];
      const max = k === "R" ? 3 : 5;
      if (counts[k] < max) counts[k]++;
      else {
        for (const alt of ["Q", "W", "E"] as const) {
          if (counts[alt] < 5) {
            counts[alt]++;
            break;
          }
        }
      }
    }
    for (const k of ["Q", "W", "E", "R"] as const) {
      if (this.abilities[k]) this.abilities[k].rank = counts[k];
    }
  }

  // -------------------------------------------------------------------------
  // Ekonomi
  // -------------------------------------------------------------------------

  addGold(amount: number): void {
    this.gold += amount;
    this.totalGold += amount;
  }

  canBuy(item: ItemDef): boolean {
    if (this.items.length >= MAX_ITEMS) return false;
    if (this.gold < item.cost) return false;
    if (item.tags.includes("boots") && this.items.some((i) => i.tags.includes("boots"))) return false;
    if (this.items.some((i) => i.id === item.id)) return false;
    return true;
  }

  buy(item: ItemDef): boolean {
    if (!this.canBuy(item)) return false;
    this.gold -= item.cost;
    this.items.push(item);
    this.computeStats();
    return true;
  }

  sell(index: number): void {
    const it = this.items[index];
    if (!it) return;
    this.items.splice(index, 1);
    this.gold += Math.round(it.cost * 0.6);
    this.computeStats();
  }

  /** Botlarin sonraki hedef esyasi. */
  nextBuildItem(): ItemDef | null {
    for (const id of this.def.buildOrder) {
      if (this.items.some((i) => i.id === id)) continue;
      const it = getItem(id);
      if (!it) continue;
      if (it.tags.includes("boots") && this.items.some((i) => i.tags.includes("boots"))) continue;
      return it;
    }
    return null;
  }

  get inFountain(): boolean {
    return dist(this.pos, NEXUS_POS[this.team]) < CONFIG.fountainRadius;
  }

  // -------------------------------------------------------------------------

  override update(world: World, dt: number): void {
    for (const s of this.summoners) s.cd = Math.max(0, s.cd - dt);
    for (const k of ["Q", "W", "E", "R"] as const) {
      const st = this.abilities[k];
      if (st && st.cd > 0) st.cd = Math.max(0, st.cd - dt);
    }
    this.castAnim = Math.max(0, this.castAnim - dt);

    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) world.respawnChampion(this);
      return;
    }

    this.updateEffects(world, dt);
    this.computeStats();

    // Cesme yenilenmesi
    if (this.inFountain) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * CONFIG.fountainRegen * dt);
      this.mp = Math.min(this.stats.maxMp, this.mp + this.stats.maxMp * CONFIG.fountainRegen * dt);
    } else {
      this.regen(dt);
      // Savas disinda hizli yenilenme (son 8 saniyede hasar almadiysa)
      const lastHit = this.lastDamageTime;
      if (world.time - lastHit > 8) {
        this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.035 * dt);
        this.mp = Math.min(this.stats.maxMp, this.mp + this.stats.maxMp * 0.03 * dt);
      }
    }

    // Geri donus
    if (this.recallTimer > 0) {
      this.recallTimer -= dt;
      if (this.path.length > 0 || this.dash) this.cancelRecall();
      else if (this.recallTimer <= 0) {
        this.pos = { ...SPAWN_POS[this.team] };
        world.fx.recallDone(this.pos, this.team);
      }
    }

    this.tryAutoAttack(world, dt);
    this.moveAlongPath(world, dt);
  }

  startRecall(world: World): void {
    if (this.recallTimer > 0 || !this.alive) return;
    this.recallTimer = CONFIG.recallTime;
    this.stopMoving();
    world.fx.recallStart(this.pos, this.team);
    if (this.isPlayer) sfx.play("recall");
  }

  cancelRecall(): void {
    this.recallTimer = 0;
  }

  protected override landAutoAttack(world: World, target: Unit): void {
    const emp = this.empoweredAttack;
    this.swing = 0.24;
    const crit = Math.random() < this.stats.crit;
    let dmg = this.stats.ad * (crit ? 1.75 : 1);
    if (emp) dmg += emp.bonus;

    if (this.def.ranged) {
      if (this.isPlayer) sfx.play(crit ? "crit" : "hit");
      world.spawnAutoProjectile(this, target, dmg, crit, emp?.slow);
    } else {
      world.fx.slash(this.pos, target.pos, this.team);
      target.takeDamage(world, {
        amount: dmg,
        type: "physical",
        sourceId: this.id,
        isAuto: true,
        label: emp ? emp.label : "saldiri",
      });
      if (crit) world.fx.critMark(target.pos);
      if (this.isPlayer) sfx.play(crit ? "crit" : "hit");
      if (emp?.slow) {
        target.addEffect({
          id: `slow_${this.id}`,
          kind: "slow",
          time: 1.5,
          value: emp.slow,
          label: "Yavas",
          color: "#7fd0ff",
        });
      }
    }
    if (emp) {
      this.empoweredAttack = null;
      this.removeEffect("empowered");
    }
  }

  /** Olum sonrasi yeniden dogus suresi. */
  deathTime(): number {
    return CONFIG.baseRespawn + this.level * CONFIG.respawnPerLevel;
  }

  scoreLine(): string {
    return `${this.kills}/${this.deaths}/${this.assists}`;
  }
}
