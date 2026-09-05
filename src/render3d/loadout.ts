/**
 * Sampiyon, minyon ve yapi modellerinin eslesmesi.
 *
 * Tum modeller KayKit (CC0) paketlerinden gelir; her sampiyon hazir bir
 * karakter modeli + o modelin icindeki hazir ekipman parcalari ile kurulur.
 * Kodla uretilen silah/zirh yoktur.
 */

/**
 * Kirpilmis animasyon kutuphanesindeki klip adlari.
 * Hangi modelde hangi klibin bulundugu `scripts/fetch-assets.mjs`
 * icindeki KEEP_ANIMS listesiyle ayni kalmalidir.
 */
import { CHAMPIONS } from "../game/champions";

export type Clip =
  | "Idle"
  | "Walking_A"
  | "Running_A"
  | "Hit_A"
  | "Death_A"
  | "Cheer"
  | "1H_Melee_Attack_Chop"
  | "1H_Melee_Attack_Slice_Horizontal"
  | "1H_Melee_Attack_Stab"
  | "2H_Melee_Attack_Chop"
  | "2H_Melee_Attack_Slice"
  | "2H_Melee_Attack_Stab"
  | "2H_Melee_Attack_Spin"
  | "Dualwield_Melee_Attack_Chop"
  | "Dualwield_Melee_Attack_Slice"
  | "Dualwield_Melee_Attack_Stab"
  | "1H_Ranged_Shoot"
  | "1H_Ranged_Reload"
  | "Throw"
  | "Block"
  | "Dodge_Forward"
  | "Dodge_Backward"
  | "Spellcast_Shoot"
  | "Spellcast_Raise"
  | "Spellcast_Long"
  // --- Quaternius Universal Animation Library (manken govde) ---
  | "Idle_Loop"
  | "Idle_Talking_Loop"
  | "Walk_Loop"
  | "Jog_Fwd_Loop"
  | "Sprint_Loop"
  | "Sword_Idle"
  | "Sword_Attack"
  | "Sword_Attack_RM"
  | "Punch_Enter"
  | "Punch_Jab"
  | "Punch_Cross"
  | "Push_Loop"
  | "Spell_Simple_Enter"
  | "Spell_Simple_Shoot"
  | "Spell_Simple_Exit"
  | "Spell_Simple_Idle_Loop"
  | "Hit_Chest"
  | "Hit_Head"
  | "Death01"
  | "Roll"
  | "Jump_Start"
  | "Jump_Loop"
  | "Jump_Land"
  | "Dance_Loop"
  | "Interact";

/** Yetenek tuslari. */
export type AbilityKey = "Q" | "W" | "E" | "R";

/** Modele gore degisebilen temel durumlar. */
export type BaseState = "Idle" | "Walk" | "Run" | "Death" | "Hit" | "Recall";

export interface Loadout {
  /** public/models altindaki dosya adi (uzantisiz). */
  model: string;
  /** Modelde gorunur kalacak ekipman dugumleri. */
  show: string[];
  /** Normal saldiri. */
  attack: Clip;
  /**
   * Komboyu tamamlayan ek vurus klipleri.
   * Ardisik vuruslarda `attack` -> combo[0] -> combo[1] -> ... sirayla
   * oynatilir; bosluk verilince zincir basa doner.
   */
  combo?: Clip[];
  /** Yetenege ozel klip bulunamazsa kullanilan yedek. */
  cast: Clip;
  /** Her yetenek tusu icin ayri animasyon. */
  abilities?: Partial<Record<AbilityKey, Clip>>;
  /**
   * Temel durum klipleri. KayKit disi bir model kullanildiginda
   * (farkli klip adlandirmasi) buradan ezilir.
   */
  base?: Partial<Record<BaseState, Clip>>;
  /** Pelerin/kumas parcalarina uygulanan sampiyon rengi. */
  tint?: number;
  /** Govde boyu carpani (silueti farklilastirmak icin). */
  scale?: number;
  /** Modelde bulunmayan silahlar disaridan takilir (hazir silah modelleri). */
  mainHand?: string;
  offHand?: string;
  /** Takilan silahin oyun birimi cinsinden boyu (govde boyuna orani). */
  handScale?: number;
  /** Silahin takilacagi kemikler (varsayilan KayKit isimleri). */
  handBone?: string;
  offHandBone?: string;
  /**
   * Modelin kendi birimindeki referans boyu; olcekleme buna bolunur.
   * Verilmezse KayKit referansi kullanilir.
   */
  modelHeight?: number;
  /**
   * Govdeyi sampiyon rengi yerine takim rengiyle boyar.
   * Iki takim da ayni sampiyonu kullanirken ayirt etmeyi saglar.
   */
  teamTint?: boolean;
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
  // Iskelet modellerinde hazir silah yoktur; disaridan takilir.
  "monster-rogue": [],
};

export const LOADOUTS: Record<string, Loadout> = {
  /**
   * Tank.
   *
   * Gecici govde: Quaternius Universal Animation Library'nin manken
   * modeli (CC0). Gercek karakter modeli geldiginde yalnizca `model`
   * degisir; iskelet ve klip adlari ayni oldugu icin asagidaki
   * eslesme oldugu gibi kalir.
   */
  kaya: {
    model: "champ-mannequin",
    show: [],
    base: {
      Idle: "Sword_Idle",
      Walk: "Walk_Loop",
      Run: "Jog_Fwd_Loop",
      Death: "Death01",
      Hit: "Hit_Chest",
      Recall: "Dance_Loop",
    },
    attack: "Sword_Attack",
    // 3'lu kombo. Kutuphanede tek bir kilic savurmasi oldugu icin
    // zincir en cok ayrisan uc hareketten kuruldu:
    // genis savurma (1.5 sn) -> hizli sokme (0.83 sn) -> govdeyi
    // dondurup atilan agir darbe (1.0 sn).
    combo: ["Punch_Jab", "Punch_Cross"],
    cast: "Spell_Simple_Shoot",
    // Q kavrayici darbe, W tas kalkan, E ileri savurma, R cevresel sarsinti
    // Yetenek animasyonlari normal vurus zinciriyle cakismasin diye
    // ayri kliplerden secildi.
    abilities: {
      // Q: onundeki koniye savrulan sok -> iki elle itis
      Q: "Spell_Simple_Shoot",
      // W: uzerine kabuk cekme -> koruma durusuna gecis
      W: "Spell_Simple_Enter",
      // E: ileri atilma -> takla
      E: "Roll",
      // R: yeri parcalama -> yere iniş darbesi
      R: "Jump_Land",
    },
    mainHand: "sword-2handed",
    handScale: 0.66,
    handBone: "DEF-hand.R",
    offHandBone: "DEF-hand.L",
    modelHeight: 2.21,
    teamTint: true,
    // Manken KayKit karakterlerinden daha ince; ayni boyda kaldiginda
    // ekranda kucuk duruyor, bu yuzden biraz buyutuldu.
    scale: 1.34,
  },
  // Buyucu — sivri sapkali, uzun asa
  selin: {
    model: "champ-mage",
    show: ["2H_Staff", "Mage_Hat", "Mage_Cape"],
    attack: "Spellcast_Shoot",
    cast: "Spellcast_Shoot",
    // Q hizli buyu, W uzun kanal, E isinlanma, R yukselen buyu
    abilities: {
      Q: "Spellcast_Shoot",
      W: "Spellcast_Long",
      E: "Dodge_Forward",
      R: "Spellcast_Raise",
    },
    tint: 0x6a5bd8,
    scale: 0.96,
  },
  // Nisanci — baslıksız haydut, arbalet
  demir: {
    model: "champ-rogue",
    show: ["2H_Crossbow"],
    attack: "1H_Ranged_Shoot",
    cast: "Spellcast_Shoot",
    // Q ok hazirlama, W avci durusu, E geri sicrama, R guclu atis
    abilities: {
      Q: "1H_Ranged_Reload",
      W: "Cheer",
      E: "Dodge_Backward",
      R: "Throw",
    },
    tint: 0xc08a34,
  },
  // Suikastci — kukuletali iskelet, cift hancer
  golge: {
    model: "monster-rogue",
    show: [],
    attack: "Dualwield_Melee_Attack_Slice",
    cast: "Spellcast_Raise",
    // Q sicrayan darbe, W sis, E bicak firlatma, R infaz
    abilities: {
      Q: "Dualwield_Melee_Attack_Chop",
      W: "Spellcast_Raise",
      E: "Throw",
      R: "Dualwield_Melee_Attack_Stab",
    },
    tint: 0x5b4ea8,
    scale: 0.96,
    mainHand: "dagger",
    offHand: "dagger",
    handScale: 0.42,
  },
  // Destek — kukuletali sifaci, asa ve buyu kitabi
  ayla: {
    model: "champ-hooded",
    show: ["Rogue_Cape"],
    attack: "Spellcast_Shoot",
    cast: "Spellcast_Raise",
    // Q isik huzmesi, W kutsama, E bereket, R uzun kanal
    abilities: {
      Q: "Spellcast_Shoot",
      W: "Spellcast_Raise",
      E: "Spellcast_Raise",
      R: "Spellcast_Long",
    },
    tint: 0xffe4a8,
    scale: 0.94,
    mainHand: "staff",
    offHand: "spellbook-closed",
    handScale: 0.95,
  },
  // Savasci — kurt postlu barbar, iki elli balta
  bozkurt: {
    model: "champ-barbarian",
    show: ["2H_Axe", "Barbarian_Hat", "Barbarian_Cape"],
    attack: "2H_Melee_Attack_Chop",
    cast: "Spellcast_Shoot",
    // Q atilma, W genis pence, E ulume, R bogazlama
    abilities: {
      Q: "Dodge_Forward",
      W: "2H_Melee_Attack_Slice",
      E: "Cheer",
      R: "2H_Melee_Attack_Stab",
    },
    tint: 0x8c6a3c,
    scale: 1.1,
  },
  // Tank — baslıksız sovalye, kilic ve dikenli kalkan
  deniz: {
    model: "champ-knight",
    show: ["1H_Sword", "Spike_Shield"],
    attack: "1H_Melee_Attack_Chop",
    cast: "Spellcast_Shoot",
    // Q genis savurma, W kalkan durusu, E girdap, R ileri hamle
    abilities: {
      Q: "1H_Melee_Attack_Slice_Horizontal",
      W: "Block",
      E: "2H_Melee_Attack_Spin",
      R: "1H_Melee_Attack_Stab",
    },
    tint: 0x2f8f9e,
    scale: 1.06,
  },
  // Buyucu — sapkasiz, kisa degnek
  alev: {
    model: "champ-mage",
    show: ["1H_Wand", "Mage_Cape"],
    attack: "Spellcast_Shoot",
    cast: "Spellcast_Shoot",
    // Q alev topu, W cember, E kor sicramasi, R meteor kanali
    abilities: {
      Q: "Spellcast_Shoot",
      W: "Spellcast_Raise",
      E: "Dodge_Forward",
      R: "Spellcast_Long",
    },
    tint: 0xd45a2c,
    scale: 0.98,
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

/**
 * Yuklenecek sampiyon modelleri.
 *
 * Oyunda yer alan sampiyonlarin gercekten kullandigi dosyalar; kapali
 * sampiyonlarin modelleri bosuna indirilmez.
 */
export const CHAMPION_MODEL_FILES = [
  ...new Set(CHAMPIONS.map((c) => loadoutOf(c.id).model)),
];

/** Sampiyonlara disaridan takilan hazir silahlar. */
export const CHAMPION_WEAPONS = [
  ...new Set(
    CHAMPIONS.flatMap((c) => {
      const l = loadoutOf(c.id);
      return [l.mainHand, l.offHand].filter((x): x is string => !!x);
    }),
  ),
];

/** Minyon turu -> model. */
export const MINION_MODELS: Record<string, string> = {
  melee: "minion-melee",
  caster: "minion-caster",
  cannon: "minion-melee",
  super: "minion-melee",
};

/** Orman canavari modelleri (sampiyonlarla karismasin diye ayri secildi). */
export const MONSTER_MODELS = ["minion-melee", "minion-caster", "minion-small"];

/** Minyonlarin eline takilan hazir silahlar. */
export const MINION_WEAPONS: Record<string, string> = {
  melee: "sword-1handed",
  caster: "staff",
  cannon: "axe-2handed",
  super: "sword-2handed",
};
