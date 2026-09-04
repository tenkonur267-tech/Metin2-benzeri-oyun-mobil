/**
 * Sampiyon, minyon ve yapi modellerinin eslesmesi.
 *
 * Tum modeller KayKit (CC0) paketlerinden gelir; her sampiyon hazir bir
 * karakter modeli + o modelin icindeki hazir ekipman parcalari ile kurulur.
 * Kodla uretilen silah/zirh yoktur.
 */

/** Kirpilmis animasyon kutuphanesindeki klip adlari. */
export type Clip =
  | "Idle"
  | "Walking_A"
  | "Running_A"
  | "1H_Melee_Attack_Chop"
  | "1H_Melee_Attack_Slice_Diagonal"
  | "2H_Melee_Attack_Chop"
  | "1H_Ranged_Shoot"
  | "Spellcast_Shoot"
  | "Hit_A"
  | "Death_A"
  | "Cheer";

export interface Loadout {
  /** public/models altindaki dosya adi (uzantisiz). */
  model: string;
  /** Modelde gorunur kalacak ekipman dugumleri. */
  show: string[];
  attack: Clip;
  cast: Clip;
  /** Pelerin/kumas parcalarina uygulanan sampiyon rengi. */
  tint?: number;
}

const KNIGHT_GEAR = [
  "1H_Sword", "2H_Sword", "1H_Sword_Offhand",
  "Round_Shield", "Square_Shield", "Rectangle_Shield", "Badge_Shield", "Spike_Shield",
  "Knight_Helmet", "Knight_Cape",
];
const BARBARIAN_GEAR = [
  "1H_Axe", "2H_Axe", "1H_Axe_Offhand", "Barbarian_Round_Shield", "Mug",
  "Barbarian_Hat", "Barbarian_Cape",
];
const ROGUE_GEAR = ["Knife", "Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Throwable", "Rogue_Cape"];
const MAGE_GEAR = ["Spellbook", "Spellbook_open", "1H_Wand", "2H_Staff", "Mage_Hat", "Mage_Cape"];

/** Bir modeldeki tum ekipman dugumleri (gorunmeyecekler gizlenir). */
export const GEAR_NODES: Record<string, string[]> = {
  "champ-knight": KNIGHT_GEAR,
  "champ-barbarian": BARBARIAN_GEAR,
  "champ-rogue": ROGUE_GEAR,
  "champ-hooded": ROGUE_GEAR,
  "champ-mage": MAGE_GEAR,
};

export const LOADOUTS: Record<string, Loadout> = {
  // Tank — iki elli kilic
  kaya: {
    model: "champ-knight",
    show: ["2H_Sword", "Knight_Helmet", "Knight_Cape"],
    attack: "2H_Melee_Attack_Chop",
    cast: "Spellcast_Shoot",
    tint: 0x4f7fd0,
  },
  // Buyucu — asa
  selin: {
    model: "champ-mage",
    show: ["2H_Staff", "Mage_Hat", "Mage_Cape"],
    attack: "Spellcast_Shoot",
    cast: "Spellcast_Shoot",
    tint: 0x6a5bd8,
  },
  // Nisanci — arbalet
  demir: {
    model: "champ-rogue",
    show: ["2H_Crossbow", "Rogue_Cape"],
    attack: "1H_Ranged_Shoot",
    cast: "Spellcast_Shoot",
    tint: 0xc08a34,
  },
  // Suikastci — cift hancer
  golge: {
    model: "champ-hooded",
    show: ["Knife", "Knife_Offhand", "Rogue_Cape"],
    attack: "1H_Melee_Attack_Slice_Diagonal",
    cast: "Spellcast_Shoot",
    tint: 0x3a3352,
  },
  // Destek — asa + buyu kitabi
  ayla: {
    model: "champ-mage",
    show: ["1H_Wand", "Spellbook", "Mage_Hat", "Mage_Cape"],
    attack: "Spellcast_Shoot",
    cast: "Spellcast_Shoot",
    tint: 0xffe4a8,
  },
  // Savascı — iki elli balta
  bozkurt: {
    model: "champ-barbarian",
    show: ["2H_Axe", "Barbarian_Hat", "Barbarian_Cape"],
    attack: "2H_Melee_Attack_Chop",
    cast: "Spellcast_Shoot",
    tint: 0x8c6a3c,
  },
  // Tank — kilic + kalkan
  deniz: {
    model: "champ-knight",
    show: ["1H_Sword", "Round_Shield", "Knight_Helmet", "Knight_Cape"],
    attack: "1H_Melee_Attack_Chop",
    cast: "Spellcast_Shoot",
    tint: 0x2f8f9e,
  },
  // Buyucu — degnek
  alev: {
    model: "champ-mage",
    show: ["1H_Wand", "Mage_Hat", "Mage_Cape"],
    attack: "Spellcast_Shoot",
    cast: "Spellcast_Shoot",
    tint: 0xd45a2c,
  },
};

export const DEFAULT_LOADOUT: Loadout = {
  model: "champ-knight",
  show: ["1H_Sword", "Round_Shield", "Knight_Helmet"],
  attack: "1H_Melee_Attack_Chop",
  cast: "Spellcast_Shoot",
};

export function loadoutOf(id: string): Loadout {
  return LOADOUTS[id] ?? DEFAULT_LOADOUT;
}

/** Yuklenecek sampiyon modelleri. */
export const CHAMPION_MODEL_FILES = [
  "champ-knight",
  "champ-barbarian",
  "champ-rogue",
  "champ-hooded",
  "champ-mage",
];

/** Minyon turu -> model. */
export const MINION_MODELS: Record<string, string> = {
  melee: "minion-melee",
  caster: "minion-caster",
  cannon: "minion-melee",
  super: "minion-melee",
};

/** Orman canavari modelleri. */
export const MONSTER_MODELS = ["monster-rogue", "minion-caster", "minion-melee"];

/** Minyonlarin eline takilan hazir silahlar. */
export const MINION_WEAPONS: Record<string, string> = {
  melee: "sword-1handed",
  caster: "staff",
  cannon: "axe-2handed",
  super: "sword-2handed",
};
