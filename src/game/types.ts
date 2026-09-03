import type { Vec2 } from "../core/math";

/** 0 = Mavi takim (oyuncu), 1 = Kirmizi takim. */
export type Team = 0 | 1;

export type UnitKind =
  | "champion"
  | "minion"
  | "tower"
  | "inhibitor"
  | "nexus"
  | "monster";

export type DamageType = "physical" | "magic" | "true";

export type MinionKind = "melee" | "caster" | "cannon" | "super";

export type Lane = "top" | "mid" | "bot";

export type Role = "Savasci" | "Buyucu" | "Nisanci" | "Suikastci" | "Destek" | "Tank";

/** Kalici olmayan durum etkileri. */
export interface StatusEffect {
  id: string;
  kind:
    | "slow"
    | "stun"
    | "root"
    | "silence"
    | "shield"
    | "haste"
    | "adBuff"
    | "apBuff"
    | "armorBuff"
    | "dot"
    | "heal"
    | "invuln"
    | "stealth"
    | "reveal"
    | "lifestealBuff"
    | "asBuff";
  /** Kalan sure (saniye). */
  time: number;
  /** Etkinin siddeti: yavaslatmada 0..1 oran, kalkanda kalan deger, dot'ta saniyelik hasar. */
  value: number;
  /** Hasar veren kaynak (dot icin). */
  sourceId?: number;
  damageType?: DamageType;
  /** Ekranda gosterilecek kisa etiket. */
  label?: string;
  color?: string;
  /** Yigilma sayaci (orn. pasif yigilmalari). */
  stacks?: number;
}

/** Bir birimin turetilmis savas degerleri. */
export interface Stats {
  maxHp: number;
  maxMp: number;
  hpRegen: number;
  mpRegen: number;
  ad: number;
  ap: number;
  armor: number;
  mr: number;
  moveSpeed: number;
  /** Saniyedeki saldiri sayisi. */
  attackSpeed: number;
  attackRange: number;
  crit: number;
  lifesteal: number;
  /** Yetenek hizi: bekleme suresini azaltir. */
  abilityHaste: number;
  armorPen: number;
  magicPen: number;
  /** Kontrol etkilerine direnc (0..0.6). */
  tenacity: number;
  sightRange: number;
}

export interface AbilityDef {
  key: "Q" | "W" | "E" | "R";
  name: string;
  desc: string;
  /** Menzil (0 ise kendine/cevreye). */
  range: number;
  cooldown: number[];
  cost: number[];
  /** Nisan alma bicimi. */
  targeting: "skillshot" | "point" | "unit" | "self" | "direction" | "cone";
  /** Nisan yardimcisi icin gorsel genislik. */
  width?: number;
  /** Ulti icin true. */
  ultimate?: boolean;
}

export interface AbilityState {
  cd: number;
  /** Ogrenilmis seviye (0 = ogrenilmemis). */
  rank: number;
  /** Yeteneklerin kendi sayaclari (kanal, yigilma vs). */
  charges?: number;
}

export interface ChampionDef {
  id: string;
  name: string;
  title: string;
  role: Role;
  emoji: string;
  color: string;
  /** Uzak menzilli mi? */
  ranged: boolean;
  lore: string;
  base: {
    hp: number;
    hpPerLvl: number;
    mp: number;
    mpPerLvl: number;
    hpRegen: number;
    mpRegen: number;
    ad: number;
    adPerLvl: number;
    armor: number;
    armorPerLvl: number;
    mr: number;
    mrPerLvl: number;
    moveSpeed: number;
    attackSpeed: number;
    asPerLvl: number;
    attackRange: number;
  };
  abilities: AbilityDef[];
  /** Bot yapay zekasi icin tercih edilen koridor. */
  preferredLane: Lane;
  /** Botlarin satin alma sirasi (item id listesi). */
  buildOrder: string[];
}

export interface ItemDef {
  id: string;
  name: string;
  cost: number;
  emoji: string;
  color: string;
  stats: Partial<Stats>;
  desc: string;
  /** Sinirli sayida alinabilir (orn. cizme). */
  unique?: boolean;
  tags: ("ad" | "ap" | "tank" | "boots" | "support")[];
}

export interface DamageInfo {
  amount: number;
  type: DamageType;
  sourceId: number;
  /** Otomatik saldiri mi? (vampirlik ve kule hedeflemesi icin) */
  isAuto?: boolean;
  /** Yetenek adi (oldurme mesaji icin) */
  label?: string;
  /** Vampirlik uygulanmasin. */
  noLifesteal?: boolean;
}

export interface FloatingText {
  pos: Vec2;
  vel: Vec2;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: "spark" | "ring" | "smoke" | "slash";
  angle?: number;
}

export interface CombatEvent {
  text: string;
  time: number;
  color?: string;
}
