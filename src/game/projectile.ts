import type { Vec2 } from "../core/math";
import type { DamageType, Team } from "./types";
import type { Unit } from "./units";
import type { World } from "./world";

export interface Projectile {
  team: Team;
  sourceId: number;
  pos: Vec2;
  dir: Vec2;
  speed: number;
  /** Takip edilen birim (otomatik saldirilar). */
  homing: Unit | null;
  range: number;
  traveled: number;
  radius: number;
  damage: number;
  damageType: DamageType;
  isAuto: boolean;
  crit: boolean;
  pierce: boolean;
  hit: Set<number>;
  color: string;
  label: string;
  /** Saniye cinsinden yavaslatma (varsa). */
  slow?: number;
  slowTime?: number;
  stun?: number;
  /** Isabet aninda calisan ek etki. */
  onHit?: (world: World, target: Unit) => void;
  /** Menzil sonunda calisan etki. */
  onEnd?: (world: World, pos: Vec2) => void;
  dead: boolean;
  /** Gorsel bicim. */
  shape: "bolt" | "arrow" | "orb" | "blade" | "wave";
  trail: number;
}

export interface Zone {
  team: Team;
  sourceId: number;
  pos: Vec2;
  radius: number;
  time: number;
  maxTime: number;
  color: string;
  label: string;
  /** Saniyelik hasar. */
  dps: number;
  damageType: DamageType;
  slow?: number;
  /** Merkeze cekme hizi (birim/sn). */
  pull?: number;
  /** Sadece bir kez vurur (patlama). */
  once?: boolean;
  hit: Set<number>;
  /** Sure dolunca patlar. */
  onExpire?: (world: World, z: Zone) => void;
  /** Her karede tetiklenir. */
  onTick?: (world: World, z: Zone, dt: number) => void;
  /** Muttefiklere de etki eder mi? */
  affectsAllies?: boolean;
  /** Gorsel. */
  shape: "circle" | "burning" | "storm" | "warning";
  tickAcc: number;
  dead: boolean;
}

export function makeProjectile(p: Partial<Projectile> & {
  team: Team;
  sourceId: number;
  pos: Vec2;
  dir: Vec2;
  speed: number;
  damage: number;
}): Projectile {
  return {
    homing: null,
    range: 400,
    traveled: 0,
    radius: 10,
    damageType: "physical",
    isAuto: false,
    crit: false,
    pierce: false,
    hit: new Set<number>(),
    color: "#ffffff",
    label: "",
    dead: false,
    shape: "bolt",
    trail: 0,
    ...p,
    pos: { x: p.pos.x, y: p.pos.y },
    dir: { x: p.dir.x, y: p.dir.y },
  };
}

export function makeZone(z: Partial<Zone> & {
  team: Team;
  sourceId: number;
  pos: Vec2;
  radius: number;
  time: number;
}): Zone {
  return {
    maxTime: z.time,
    color: "#ffffff",
    label: "",
    dps: 0,
    damageType: "magic",
    hit: new Set<number>(),
    shape: "circle",
    tickAcc: 0,
    dead: false,
    ...z,
    pos: { x: z.pos.x, y: z.pos.y },
  };
}
