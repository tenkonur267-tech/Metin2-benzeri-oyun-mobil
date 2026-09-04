import {
  clamp,
  dirTo,
  dist,
  norm,
  type Vec2,
} from "../core/math";
import { sfx } from "../core/audio";
import { CONFIG, MAP_SIZE, RADIUS } from "./constants";
import { isBlockedCircle } from "./grid";
import type {
  DamageInfo,
  DamageType,
  MinionKind,
  Stats,
  StatusEffect,
  Team,
  UnitKind,
} from "./types";
import type { World } from "./world";

let nextId = 1;
export const resetIds = (): void => {
  nextId = 1;
};

export function emptyStats(): Stats {
  return {
    maxHp: 100,
    maxMp: 0,
    hpRegen: 0,
    mpRegen: 0,
    ad: 0,
    ap: 0,
    armor: 0,
    mr: 0,
    moveSpeed: 0,
    attackSpeed: 0.6,
    attackRange: 100,
    crit: 0,
    lifesteal: 0,
    abilityHaste: 0,
    armorPen: 0,
    magicPen: 0,
    tenacity: 0,
    sightRange: 320,
  };
}

/** Zirh/buyu direncinden sonra alinan gercek hasar. */
export function mitigate(amount: number, type: DamageType, resist: number, pen: number): number {
  if (type === "true") return amount;
  const eff = Math.max(0, resist - pen);
  return amount * (100 / (100 + eff));
}

export abstract class Unit {
  readonly id: number = nextId++;
  abstract readonly kind: UnitKind;
  team: Team;
  pos: Vec2;
  radius: number;
  hp = 1;
  mp = 0;
  alive = true;
  facing = 0;

  stats: Stats = emptyStats();
  effects: StatusEffect[] = [];

  /** Otomatik saldiri zamanlayicilari. */
  attackCd = 0;
  windup = 0;
  windupTarget: Unit | null = null;

  /** Hareket. */
  moveTarget: Vec2 | null = null;
  path: Vec2[] = [];
  pathCd = 0;
  /** Zorlanmis hareket (atilma/kayma) - saniyede birim. */
  dash: { dir: Vec2; speed: number; time: number; onEnd?: (w: World) => void } | null = null;

  /** Saldiri hedefi. */
  target: Unit | null = null;

  /** Son hasar verenler (yardim/oldurme kredisi icin). */
  recentDamage = new Map<number, number>();

  /** Gorunurluk (her karede dunya tarafindan hesaplanir). */
  visibleTo: [boolean, boolean] = [false, false];

  /** Olum animasyonu icin. */
  deathTimer = 0;

  // --- Animasyon durumu (cizim katmani tarafindan okunur) ---
  /** Bir onceki karedeki konum; hiz ve yuruyus dongusu icin. */
  lastPos: Vec2 = { x: 0, y: 0 };
  /** Yuruyus dongusu fazi (kat edilen mesafeyle artar). */
  walkPhase = 0;
  /** Anlik hiz (birim/sn). */
  speedNow = 0;
  /** Saldiri savurma animasyonu (saniye). */
  swing = 0;
  /** Hasar alinca beyaz parlama (saniye). */
  hitFlash = 0;

  constructor(team: Team, pos: Vec2, radius: number) {
    this.team = team;
    this.pos = { x: pos.x, y: pos.y };
    this.lastPos = { x: pos.x, y: pos.y };
    this.radius = radius;
  }

  /** Her karede cizim animasyonlarini ilerletir. */
  tickAnim(dt: number): void {
    const dx = this.pos.x - this.lastPos.x;
    const dy = this.pos.y - this.lastPos.y;
    const moved = Math.hypot(dx, dy);
    this.speedNow = moved / Math.max(dt, 1e-4);
    this.walkPhase += moved * 0.32;
    this.lastPos.x = this.pos.x;
    this.lastPos.y = this.pos.y;
    this.swing = Math.max(0, this.swing - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.deathTimer = this.alive ? 0 : this.deathTimer + dt;
  }

  // -------------------------------------------------------------------------
  // Durum sorgulari
  // -------------------------------------------------------------------------

  get hpPct(): number {
    return clamp(this.hp / Math.max(1, this.stats.maxHp), 0, 1);
  }

  get mpPct(): number {
    return this.stats.maxMp <= 0 ? 0 : clamp(this.mp / this.stats.maxMp, 0, 1);
  }

  get isStructure(): boolean {
    return this.kind === "tower" || this.kind === "inhibitor" || this.kind === "nexus";
  }

  hasEffect(kind: StatusEffect["kind"]): boolean {
    for (const e of this.effects) if (e.kind === kind) return true;
    return false;
  }

  getEffect(kind: StatusEffect["kind"]): StatusEffect | undefined {
    return this.effects.find((e) => e.kind === kind);
  }

  get stunned(): boolean {
    return this.hasEffect("stun");
  }

  get canMove(): boolean {
    return this.alive && !this.hasEffect("stun") && !this.hasEffect("root");
  }

  get canCast(): boolean {
    return this.alive && !this.hasEffect("stun") && !this.hasEffect("silence");
  }

  get canAttack(): boolean {
    return this.alive && !this.hasEffect("stun");
  }

  get shieldAmount(): number {
    let s = 0;
    for (const e of this.effects) if (e.kind === "shield") s += e.value;
    return s;
  }

  /** Yavaslatma ve hizlanmalardan sonra hareket hizi. */
  get effectiveMoveSpeed(): number {
    let slow = 0;
    let haste = 0;
    for (const e of this.effects) {
      if (e.kind === "slow") slow = Math.max(slow, e.value);
      else if (e.kind === "haste") haste += e.value;
    }
    slow *= 1 - clamp(this.stats.tenacity, 0, 0.6);
    return Math.max(60, this.stats.moveSpeed * (1 - slow) * (1 + haste));
  }

  // -------------------------------------------------------------------------
  // Etkiler
  // -------------------------------------------------------------------------

  addEffect(e: StatusEffect): void {
    const cc = e.kind === "stun" || e.kind === "root" || e.kind === "silence";
    if (cc) e.time *= 1 - clamp(this.stats.tenacity, 0, 0.6);
    const existing = this.effects.find((x) => x.id === e.id);
    if (existing) {
      existing.time = Math.max(existing.time, e.time);
      existing.value = e.kind === "shield" ? existing.value + e.value : Math.max(existing.value, e.value);
      existing.stacks = (existing.stacks ?? 1) + 1;
      return;
    }
    this.effects.push(e);
  }

  removeEffect(id: string): void {
    const i = this.effects.findIndex((e) => e.id === id);
    if (i >= 0) this.effects.splice(i, 1);
  }

  protected updateEffects(world: World, dt: number): void {
    // Etkiler islenirken dizi degisebilir; kopya uzerinde calisilir.
    const snapshot = this.effects.slice();
    const expired: StatusEffect[] = [];
    for (const e of snapshot) {
      e.time -= dt;
      if (e.kind === "dot" && e.value > 0) {
        this.takeDamage(
          world,
          {
            amount: e.value * dt,
            type: e.damageType ?? "magic",
            sourceId: e.sourceId ?? -1,
            label: e.label,
            noLifesteal: true,
          },
          true,
        );
      }
      if (e.kind === "heal" && e.value > 0) this.heal(world, e.value * dt, true);
      if (e.time <= 0) expired.push(e);
    }
    if (expired.length > 0) this.effects = this.effects.filter((e) => !expired.includes(e));
  }

  // -------------------------------------------------------------------------
  // Hasar / iyilesme
  // -------------------------------------------------------------------------

  takeDamage(world: World, info: DamageInfo, silentNumbers = false): number {
    if (!this.alive || info.amount <= 0) return 0;
    if (this.hasEffect("invuln")) return 0;

    const resist = info.type === "physical" ? this.stats.armor : this.stats.mr;
    const source = world.getUnit(info.sourceId);
    const pen = info.type === "physical" ? source?.stats.armorPen ?? 0 : source?.stats.magicPen ?? 0;
    let dmg = mitigate(info.amount, info.type, resist, pen);

    // Kuleler minyonlara karsi tam hasar verir, sampiyonlara azaltilmis
    if (source?.kind === "tower" && this.kind === "champion") dmg *= 0.9;

    // Kalkanlari tuket
    let remaining = dmg;
    for (const e of this.effects) {
      if (e.kind !== "shield" || remaining <= 0) continue;
      const used = Math.min(e.value, remaining);
      e.value -= used;
      remaining -= used;
    }
    this.effects = this.effects.filter((e) => !(e.kind === "shield" && e.value <= 0.5));

    const applied = remaining;
    this.hp -= applied;
    if (applied > 0) this.hitFlash = 0.16;

    // Vurus sesi: oyuncunun vurdugu ya da oyuncuya inen darbeler duyulur
    if (applied > 0 && info.isAuto) {
      const bySelf = source?.kind === "champion" && (source as { isPlayer?: boolean }).isPlayer;
      const onSelf = this.kind === "champion" && (this as unknown as { isPlayer?: boolean }).isPlayer;
      if (bySelf || onSelf) {
        sfx.play(info.crit ? "crit" : "hit");
        world.fx.addShake(info.crit ? 0.55 : bySelf ? 0.22 : 0.3);
      }
    }
    if (applied > 0 && this.kind === "champion") {
      (this as unknown as { lastDamageTime: number }).lastDamageTime = world.time;
    }
    if (info.sourceId >= 0) this.recentDamage.set(info.sourceId, world.time);

    if (!silentNumbers && applied > 0.5) {
      world.fx.damageNumber(this.pos, applied, info.type, this.kind === "champion");
    }
    if (dmg - applied > 0.5 && !silentNumbers) {
      world.fx.shieldNumber(this.pos, dmg - applied);
    }

    // Can calma
    if (source && applied > 0 && !info.noLifesteal) {
      const ls = source.stats.lifesteal * (info.isAuto ? 1 : 0.35);
      if (ls > 0) source.heal(world, applied * ls, true);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      world.onUnitDeath(this, source ?? null, info.label);
    }
    return applied;
  }

  heal(world: World, amount: number, silent = false): number {
    if (!this.alive || amount <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    const gained = this.hp - before;
    if (!silent && gained > 1) world.fx.healNumber(this.pos, gained);
    return gained;
  }

  // -------------------------------------------------------------------------
  // Hareket
  // -------------------------------------------------------------------------

  protected moveAlongPath(world: World, dt: number): void {
    if (this.dash) {
      const d = this.dash;
      const step = d.speed * dt;
      const nx = this.pos.x + d.dir.x * step;
      const ny = this.pos.y + d.dir.y * step;
      if (!isBlockedCircle(nx, ny, this.radius)) {
        this.pos.x = nx;
        this.pos.y = ny;
      } else {
        d.time = 0;
      }
      this.facing = Math.atan2(d.dir.y, d.dir.x);
      d.time -= dt;
      if (d.time <= 0) {
        const cb = d.onEnd;
        this.dash = null;
        cb?.(world);
      }
      return;
    }

    if (!this.canMove) return;
    if (this.path.length === 0) return;

    let budget = this.effectiveMoveSpeed * dt;
    while (budget > 0 && this.path.length > 0) {
      const wp = this.path[0];
      const d = dist(this.pos, wp);
      if (d <= budget) {
        this.pos.x = wp.x;
        this.pos.y = wp.y;
        budget -= d;
        this.path.shift();
      } else {
        const dir = dirTo(this.pos, wp);
        const nx = this.pos.x + dir.x * budget;
        const ny = this.pos.y + dir.y * budget;
        if (isBlockedCircle(nx, ny, this.radius)) {
          // Duvar boyunca kaydir
          if (!isBlockedCircle(nx, this.pos.y, this.radius)) this.pos.x = nx;
          else if (!isBlockedCircle(this.pos.x, ny, this.radius)) this.pos.y = ny;
          else this.path.length = 0;
        } else {
          this.pos.x = nx;
          this.pos.y = ny;
        }
        this.facing = Math.atan2(dir.y, dir.x);
        budget = 0;
      }
    }
    this.pos.x = clamp(this.pos.x, this.radius, MAP_SIZE - this.radius);
    this.pos.y = clamp(this.pos.y, this.radius, MAP_SIZE - this.radius);
  }

  /** Hedefe dogru yol hesaplar (gerekirse A*). */
  setDestination(world: World, dest: Vec2, direct = false): void {
    this.moveTarget = { x: dest.x, y: dest.y };
    if (direct) {
      this.path = [{ x: dest.x, y: dest.y }];
      return;
    }
    this.path = world.pathTo(this.pos, dest);
  }

  stopMoving(): void {
    this.path.length = 0;
    this.moveTarget = null;
  }

  startDash(dir: Vec2, speed: number, time: number, onEnd?: (w: World) => void): void {
    this.dash = { dir: norm(dir), speed, time, onEnd };
    this.path.length = 0;
  }

  // -------------------------------------------------------------------------
  // Saldiri
  // -------------------------------------------------------------------------

  get attackInterval(): number {
    return 1 / Math.max(0.15, this.stats.attackSpeed);
  }

  inAttackRange(u: Unit): boolean {
    return dist(this.pos, u.pos) <= this.stats.attackRange + this.radius + u.radius;
  }

  protected tryAutoAttack(world: World, dt: number): void {
    this.attackCd -= dt;
    if (this.windupTarget) {
      this.windup -= dt;
      if (this.windup <= 0) {
        const t = this.windupTarget;
        this.windupTarget = null;
        if (t.alive && this.alive && dist(this.pos, t.pos) <= this.stats.attackRange + this.radius + t.radius + 60) {
          this.landAutoAttack(world, t);
        }
      }
      return;
    }
    const t = this.target;
    if (!t || !t.alive || !this.canAttack) return;
    if (this.attackCd > 0) return;
    if (!this.inAttackRange(t)) return;
    this.facing = Math.atan2(t.pos.y - this.pos.y, t.pos.x - this.pos.x);
    this.attackCd = this.attackInterval;
    this.windup = Math.min(0.28, this.attackInterval * 0.32);
    this.windupTarget = t;
    // Animasyon burada baslar; hasar `windup` kadar sonra, yani salinimin
    // ortasinda iner. Onceden animasyon hasarla ayni anda tetikleniyordu,
    // bu yuzden karakter once vuruyor sonra sallaniyor gibi gorunuyordu.
    this.swing = this.windup + 0.16;
    this.onAttackStart(world, t);
  }

  protected onAttackStart(world: World, target: Unit): void {}

  /** Otomatik saldiri hasarini uygular (menzilliler mermi firlatir). */
  protected landAutoAttack(world: World, target: Unit): void {
    const crit = Math.random() < this.stats.crit;
    const dmg = this.stats.ad * (crit ? 1.75 : 1);
    if (this.isRanged) {
      world.spawnAutoProjectile(this, target, dmg, crit);
    } else {
      world.fx.meleeImpact(this.pos, target.pos, this.team, crit);
      target.takeDamage(world, {
        amount: dmg,
        type: "physical",
        sourceId: this.id,
        isAuto: true,
        crit,
        label: "saldiri",
      });
      if (crit) world.fx.critMark(target.pos);
      this.onHit(world, target, dmg);
    }
  }

  onHit(world: World, target: Unit, damage: number): void {}

  get isRanged(): boolean {
    return this.stats.attackRange > 60;
  }

  // -------------------------------------------------------------------------

  regen(dt: number): void {
    if (!this.alive) return;
    if (this.stats.hpRegen > 0) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.hpRegen * dt);
    if (this.stats.mpRegen > 0 && this.stats.maxMp > 0) {
      this.mp = Math.min(this.stats.maxMp, this.mp + this.stats.mpRegen * dt);
    }
  }

  abstract update(world: World, dt: number): void;

  /** Bu birim `other` icin dusman mi? */
  isEnemy(other: Unit): boolean {
    return other.team !== this.team;
  }

  displayName(): string {
    return this.kind;
  }
}

/**
 * Hedef degistirmek icin yeni adayin ne kadar daha yakin olmasi gerektigi.
 * Esit mesafedeki iki dusman arasinda gidip gelmeyi onler.
 */
const TARGET_SWITCH_MARGIN = 6;

// ---------------------------------------------------------------------------
// Minyon
// ---------------------------------------------------------------------------

/**
 * Menziller League of Legends'daki govde genisligi oranina gore ayarlandi:
 * LoL'de yakin dovus minyonu hedefine ~1.7 govde genisligi kadar yaklasip
 * vurur, buyucu ~6, kusatma ~3.6, super ~2.3. Burada minyon govdesi 14
 * birim genisliginde oldugundan menziller ona gore olceklendi.
 */
// LoL'de minyonlar sampiyon hiziyla neredeyse ayni kosar (325 / 340); harita
// buyudugu icin buradaki hizlar da o orana cekildi.
const MINION_BASE: Record<MinionKind, { hp: number; ad: number; range: number; as: number; ms: number; armor: number; mr: number }> = {
  melee: { hp: 480, ad: 13, range: 10, as: 1.25, ms: 84, armor: 2, mr: 0 },
  caster: { hp: 300, ad: 24, range: 78, as: 1.0, ms: 84, armor: 0, mr: 12 },
  cannon: { hp: 900, ad: 42, range: 42, as: 0.7, ms: 80, armor: 6, mr: 12 },
  super: { hp: 1600, ad: 62, range: 16, as: 0.85, ms: 92, armor: 30, mr: 30 },
};

export class Minion extends Unit {
  readonly kind = "minion" as const;
  minionKind: MinionKind;
  lane: import("./types").Lane;
  waypoints: Vec2[];
  wpIndex = 0;
  aggroTimer = 0;

  constructor(team: Team, kind: MinionKind, lane: import("./types").Lane, waypoints: Vec2[], scale: number) {
    super(team, waypoints[0], RADIUS.minion);
    this.minionKind = kind;
    this.lane = lane;
    this.waypoints = waypoints;
    const b = MINION_BASE[kind];
    this.stats = {
      ...emptyStats(),
      maxHp: b.hp * scale,
      ad: b.ad * scale,
      attackRange: b.range,
      attackSpeed: b.as,
      moveSpeed: b.ms,
      armor: b.armor + scale * 4,
      mr: b.mr + scale * 3,
      sightRange: 280,
    };
    this.hp = this.stats.maxHp;
    this.radius = kind === "cannon" || kind === "super" ? 9 : RADIUS.minion;
  }

  override displayName(): string {
    return "Minyon";
  }

  override update(world: World, dt: number): void {
    if (!this.alive) return;
    this.updateEffects(world, dt);
    this.aggroTimer -= dt;

    // Hedef sec: her karede en yakin dusmana bakilir.
    // Esit mesafede saga sola donup titrememesi icin kucuk bir esik var:
    // yeni aday belirgin sekilde daha yakinsa hedef degistirilir.
    const near = world.findMinionTarget(this);
    if (!this.target || !this.target.alive || dist(this.pos, this.target.pos) > 320) {
      this.target = near;
    } else if (near && near !== this.target) {
      const dNew = dist(this.pos, near.pos) - near.radius;
      const dCur = dist(this.pos, this.target.pos) - this.target.radius;
      if (dNew < dCur - TARGET_SWITCH_MARGIN) this.target = near;
    }

    const t = this.target;
    if (t && t.alive) {
      if (this.inAttackRange(t)) {
        this.path.length = 0;
        this.tryAutoAttack(world, dt);
      } else if (dist(this.pos, t.pos) < 300) {
        this.setDestination(world, t.pos, true);
        this.attackCd -= dt;
      } else {
        this.target = null;
      }
    } else {
      this.attackCd -= dt;
      this.advanceLane(world);
    }
    this.moveAlongPath(world, dt);
  }

  private advanceLane(world: World): void {
    while (this.wpIndex < this.waypoints.length && dist(this.pos, this.waypoints[this.wpIndex]) < 34) {
      this.wpIndex++;
    }
    if (this.wpIndex >= this.waypoints.length) {
      const nexus = world.nexus[this.team === 0 ? 1 : 0];
      this.setDestination(world, nexus.pos, true);
      return;
    }
    this.setDestination(world, this.waypoints[this.wpIndex], true);
  }

  goldValue(): number {
    switch (this.minionKind) {
      case "melee":
        return CONFIG.minionGoldMelee;
      case "caster":
        return CONFIG.minionGoldCaster;
      case "cannon":
        return CONFIG.minionGoldCannon;
      default:
        return CONFIG.minionGoldSuper;
    }
  }

  xpValue(): number {
    return this.minionKind === "cannon" || this.minionKind === "super"
      ? CONFIG.cannonXp
      : CONFIG.minionXp;
  }
}

// ---------------------------------------------------------------------------
// Yapilar
// ---------------------------------------------------------------------------

export class Structure extends Unit {
  readonly kind: "tower" | "inhibitor" | "nexus";
  tier: 1 | 2 | 3 | 4;
  lane: import("./types").Lane;
  /** Sonraki kule yikilmadan hasar alamaz. */
  protectedBy: Structure | null = null;
  respawnTimer = 0;

  constructor(
    kind: "tower" | "inhibitor" | "nexus",
    team: Team,
    pos: Vec2,
    lane: import("./types").Lane,
    tier: 1 | 2 | 3 | 4,
  ) {
    super(team, pos, kind === "nexus" ? RADIUS.nexus : kind === "inhibitor" ? RADIUS.inhibitor : RADIUS.tower);
    this.kind = kind;
    this.tier = tier;
    this.lane = lane;
    const s = emptyStats();
    if (kind === "tower") {
      s.maxHp = CONFIG.towerHp[tier - 1];
      s.armor = CONFIG.towerArmor[tier - 1];
      s.mr = CONFIG.towerArmor[tier - 1];
      s.ad = CONFIG.towerDamage[tier - 1];
      s.attackRange = CONFIG.towerRange;
      s.attackSpeed = CONFIG.towerAttackSpeed;
      s.sightRange = CONFIG.towerRange + 130;
    } else if (kind === "inhibitor") {
      s.maxHp = CONFIG.inhibHp;
      s.armor = 25;
      s.mr = 25;
      s.attackRange = 0;
      s.sightRange = 240;
    } else {
      s.maxHp = CONFIG.nexusHp;
      s.armor = 30;
      s.mr = 30;
      s.attackRange = 0;
      s.sightRange = 300;
    }
    s.moveSpeed = 0;
    this.stats = s;
    this.hp = s.maxHp;
  }

  /** Ard arda vuruslarda artan hasar. */
  private shotCount = 0;

  override displayName(): string {
    return this.kind === "tower" ? "Kule" : this.kind === "inhibitor" ? "Engelleyici" : "Ana Bina";
  }

  override update(world: World, dt: number): void {
    if (!this.alive) {
      if (this.kind === "inhibitor" && this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.alive = true;
          this.hp = this.stats.maxHp;
          world.log(`${world.teamName(this.team)} engelleyici yeniden dogdu`, "#9fd0ff");
        }
      }
      return;
    }
    if (this.kind !== "tower") return;

    if (!this.target || !this.target.alive || !this.inAttackRange(this.target)) {
      const prev = this.target;
      this.target = world.findTowerTarget(this);
      if (this.target !== prev) this.shotCount = 0;
    }
    this.tryAutoAttack(world, dt);
  }

  protected override landAutoAttack(world: World, target: Unit): void {
    const bonus = 1 + Math.min(2, this.shotCount * 0.35);
    this.shotCount++;
    this.swing = 0.24;
    world.spawnTowerShot(this, target, this.stats.ad * bonus);
  }

  /** Kule korumasi: onceki kule ayakta ise hasar almaz. */
  get invulnerable(): boolean {
    return !!(this.protectedBy && this.protectedBy.alive);
  }

  override takeDamage(world: World, info: DamageInfo, silent = false): number {
    if (this.invulnerable) {
      if (!silent) world.fx.blocked(this.pos);
      return 0;
    }
    const scaled = { ...info, amount: info.amount * world.structureDamageMultiplier };
    return super.takeDamage(world, scaled, silent);
  }
}

// ---------------------------------------------------------------------------
// Orman canavari
// ---------------------------------------------------------------------------

export class Monster extends Unit {
  readonly kind = "monster" as const;
  spec: import("./constants").CampSpec;
  home: Vec2;
  respawnTimer = 0;
  leashTimer = 0;

  constructor(spec: import("./constants").CampSpec) {
    super(1 as Team, spec.pos, RADIUS.monster * spec.scale);
    this.spec = spec;
    this.home = { x: spec.pos.x, y: spec.pos.y };
    this.stats = {
      ...emptyStats(),
      maxHp: spec.hp,
      ad: spec.ad,
      armor: spec.armor,
      mr: spec.armor,
      attackRange: spec.epic ? 28 : 14,
      attackSpeed: 0.75,
      moveSpeed: 78,
      sightRange: 240,
    };
    this.hp = spec.hp;
  }

  override displayName(): string {
    return this.spec.name;
  }

  /** Canavarlar herkesin dusmanidir. */
  override isEnemy(_other: Unit): boolean {
    return true;
  }

  override update(world: World, dt: number): void {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.alive = true;
        this.hp = this.stats.maxHp;
        this.pos = { x: this.home.x, y: this.home.y };
        this.target = null;
        if (this.spec.epic) {
          world.log(`${this.spec.name} ortaya cikti!`, "#ffd27a");
        }
      }
      return;
    }
    this.updateEffects(world, dt);
    this.regen(dt);

    if (this.target && (!this.target.alive || dist(this.pos, this.home) > 260)) {
      this.target = null;
    }
    // Canavar da her karede en yakin dusmani secer
    const nearest = world.findMonsterTarget(this);
    if (!this.target) {
      this.target = nearest;
    } else if (nearest && nearest !== this.target) {
      const dNew = dist(this.pos, nearest.pos) - nearest.radius;
      const dCur = dist(this.pos, this.target.pos) - this.target.radius;
      if (dNew < dCur - TARGET_SWITCH_MARGIN) this.target = nearest;
    }
    const t = this.target;
    if (t) {
      if (this.inAttackRange(t)) {
        this.path.length = 0;
        this.tryAutoAttack(world, dt);
      } else {
        this.setDestination(world, t.pos, true);
        this.attackCd -= dt;
      }
    } else {
      this.attackCd -= dt;
      if (dist(this.pos, this.home) > 12) this.setDestination(world, this.home, true);
      else {
        this.path.length = 0;
        // Evine dondugunde tam cana kavusur
        this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.25 * dt);
      }
    }
    this.moveAlongPath(world, dt);
  }
}
