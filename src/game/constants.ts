import type { Vec2 } from "../core/math";
import type { Lane, Team } from "./types";

/**
 * Harita kenar uzunlugu (oyun birimi). Mavi us sol-alt, kirmizi us sag-ust.
 *
 * Duzen koordinatlari 1000 birimlik bir tasarim izgarasinda yazilmistir;
 * MAP_SIZE buyudugunde koridorlar, duvarlar, calilar, kamplar ve yapilar
 * `LAYOUT_SCALE` ile birlikte otomatik olceklenir. Sampiyon boyutlari,
 * saldiri menzilleri ve hizlar olceklenmez — bu sayede harita buyudukce
 * koridorlar birbirinden uzaklasir ve kamera League of Legends'daki gibi
 * haritanin daha kucuk bir kismini gosterir.
 */
export const MAP_SIZE = 2000;

/** Duzenin yazildigi tasarim izgarasinin kenar uzunlugu. */
const DESIGN_SIZE = 1000;

/** Tasarim izgarasindan oyun birimine olcek. */
export const LAYOUT_SCALE = MAP_SIZE / DESIGN_SIZE;

/** Tasarim izgarasindaki bir uzunlugu oyun birimine cevirir. */
const sc = (n: number): number => n * LAYOUT_SCALE;

/** Tasarim izgarasindaki bir noktayi oyun birimine cevirir. */
const scp = (p: Vec2): Vec2 => ({ x: sc(p.x), y: sc(p.y) });

export const TEAM_BLUE: Team = 0;
export const TEAM_RED: Team = 1;

export const TEAM_COLORS = ["#4aa8ff", "#ff5f52"] as const;
export const TEAM_COLORS_DARK = ["#1d5f9e", "#9e3128"] as const;
export const TEAM_NAMES = ["Mavi", "Kirmizi"] as const;

/** Bir noktayi haritanin diger yarisina aynalar. */
export const mirror = (p: Vec2): Vec2 => ({ x: MAP_SIZE - p.x, y: MAP_SIZE - p.y });

export const NEXUS_POS: Record<Team, Vec2> = {
  0: scp({ x: 95, y: 905 }),
  1: scp({ x: 905, y: 95 }),
};

export const SPAWN_POS: Record<Team, Vec2> = {
  0: scp({ x: 150, y: 860 }),
  1: scp({ x: 850, y: 140 }),
};

/** Mavi takim minyonlarinin izledigi yol. Kirmizi icin ters cevrilir. */
const BLUE_LANE_PATHS: Record<Lane, Vec2[]> = {
  top: [
    { x: 145, y: 835 },
    { x: 108, y: 640 },
    { x: 105, y: 330 },
    { x: 165, y: 150 },
    { x: 350, y: 105 },
    { x: 660, y: 100 },
    { x: 855, y: 145 },
  ],
  mid: [
    { x: 175, y: 830 },
    { x: 300, y: 705 },
    { x: 430, y: 578 },
    { x: 570, y: 435 },
    { x: 700, y: 305 },
    { x: 830, y: 175 },
  ],
  bot: [
    { x: 168, y: 858 },
    { x: 350, y: 895 },
    { x: 665, y: 900 },
    { x: 852, y: 848 },
    { x: 897, y: 660 },
    { x: 900, y: 345 },
    { x: 855, y: 150 },
  ],
};

export const LANES: Lane[] = ["top", "mid", "bot"];

/**
 * Koridorlar iki takim icin ayni fiziksel yoldur; kirmizi takim ters yonde yurur.
 * Harita nokta-simetrik oldugundan aynalama ust/alt koridoru yer degistirir:
 * bu yuzden yapi konumlari aynalanirken koridor etiketi de degisir.
 */
export function lanePath(team: Team, lane: Lane): Vec2[] {
  const base = BLUE_LANE_PATHS[lane].map(scp);
  return team === 0 ? base : base.reverse();
}

export const swapLane = (l: Lane): Lane => (l === "top" ? "bot" : l === "bot" ? "top" : "mid");

export interface TowerSpec {
  lane: Lane;
  tier: 1 | 2 | 3 | 4; // 4 = nexus kulesi
  pos: Vec2;
}

const BLUE_TOWERS: TowerSpec[] = [
  { lane: "top", tier: 1, pos: { x: 106, y: 372 } },
  { lane: "top", tier: 2, pos: { x: 108, y: 606 } },
  { lane: "top", tier: 3, pos: { x: 118, y: 730 } },
  { lane: "mid", tier: 1, pos: { x: 400, y: 608 } },
  { lane: "mid", tier: 2, pos: { x: 318, y: 688 } },
  { lane: "mid", tier: 3, pos: { x: 240, y: 766 } },
  { lane: "bot", tier: 1, pos: { x: 626, y: 898 } },
  { lane: "bot", tier: 2, pos: { x: 392, y: 892 } },
  { lane: "bot", tier: 3, pos: { x: 280, y: 900 } },
  { lane: "mid", tier: 4, pos: { x: 175, y: 945 } },
  { lane: "mid", tier: 4, pos: { x: 55, y: 820 } },
];

export function towerSpecs(team: Team): TowerSpec[] {
  return BLUE_TOWERS.map((t) =>
    team === 0
      ? { ...t, pos: scp(t.pos) }
      : { ...t, lane: swapLane(t.lane), pos: mirror(scp(t.pos)) },
  );
}

export interface InhibSpec {
  lane: Lane;
  pos: Vec2;
}

const BLUE_INHIBS: InhibSpec[] = [
  { lane: "top", pos: { x: 128, y: 795 } },
  { lane: "mid", pos: { x: 188, y: 818 } },
  { lane: "bot", pos: { x: 212, y: 895 } },
];

export function inhibSpecs(team: Team): InhibSpec[] {
  return BLUE_INHIBS.map((b) =>
    team === 0
      ? { ...b, pos: scp(b.pos) }
      : { ...b, lane: swapLane(b.lane), pos: mirror(scp(b.pos)) },
  );
}

/** Gecilmez arazi bloklari (dikdortgen). */
export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mavi yarisindaki duvarlar; kirmizi taraf aynalanir. */
/**
 * Ejderha cukuru: uc duvarla cevrili, nehre bakan tarafi acik.
 * Aynalandiginda haritanin diger ucunda baron cukurunu olusturur.
 */
const PIT_WALLS: WallRect[] = [
  { x: 782, y: 638, w: 48, h: 124 },
  { x: 688, y: 762, w: 142, h: 38 },
  { x: 688, y: 620, w: 112, h: 38 },
];

const BLUE_WALLS: WallRect[] = [
  ...PIT_WALLS,
  { x: 179, y: 285, w: 46, h: 82 },
  { x: 195, y: 414, w: 96, h: 40 },
  { x: 254, y: 488, w: 78, h: 46 },
  { x: 174, y: 543, w: 46, h: 82 },
  { x: 341, y: 739, w: 40, h: 96 },
  { x: 439, y: 747, w: 40, h: 96 },
  { x: 495, y: 661, w: 96, h: 40 },
  { x: 513, y: 763, w: 46, h: 82 },
  { x: 593, y: 757, w: 64, h: 64 },
];

const SCALED_WALLS: WallRect[] = BLUE_WALLS.map((w) => ({
  x: sc(w.x),
  y: sc(w.y),
  w: sc(w.w),
  h: sc(w.h),
}));

export const WALLS: WallRect[] = [
  ...SCALED_WALLS,
  ...SCALED_WALLS.map((w) => ({
    x: MAP_SIZE - w.x - w.w,
    y: MAP_SIZE - w.y - w.h,
    w: w.w,
    h: w.h,
  })),
];

/** Calilar: icindeki birim, yakinda olmayan dusmanlar tarafindan gorulmez. */
export interface Bush {
  x: number;
  y: number;
  r: number;
}

const BLUE_BUSHES: Bush[] = [
  { x: 173, y: 673, r: 40 },
  { x: 398, y: 479, r: 37 },
  { x: 514, y: 562, r: 34 },
  { x: 787, y: 815, r: 40 },
  { x: 199, y: 221, r: 42 },
  { x: 168, y: 499, r: 34 },
  { x: 379, y: 696, r: 34 },
];

const SCALED_BUSHES: Bush[] = BLUE_BUSHES.map((b) => ({ x: sc(b.x), y: sc(b.y), r: sc(b.r) }));

export const BUSHES: Bush[] = [
  ...SCALED_BUSHES,
  ...SCALED_BUSHES.map((b) => ({ x: MAP_SIZE - b.x, y: MAP_SIZE - b.y, r: b.r })),
];

/** Orman kamplari. */
export interface CampSpec {
  id: string;
  name: string;
  emoji: string;
  pos: Vec2;
  hp: number;
  ad: number;
  armor: number;
  gold: number;
  xp: number;
  respawn: number;
  epic?: "dragon" | "baron";
  /** Olduruldugunde vurana gecici guclendirme verir. */
  buff?: "blue" | "red" | "scuttle";
  scale: number;
}

/**
 * Orman kamplari Summoner's Rift dizilimini izler.
 *
 * Her takimin yarisi mid koridoruyla ikiye ayrilir:
 *   Ust orman (top koridoru tarafi), usten disari dogru:
 *     Kurtlar -> Mavi Muhafiz -> Yaban Domuzu
 *   Alt orman (bot koridoru tarafi), usten disari dogru:
 *     Yirtici -> Kizil Yaban -> Golem
 * Buff kamplari olduruldugunde vurana gecici bir guclendirme verir.
 */
const BLUE_CAMPS: Omit<CampSpec, "id">[] = [
  // --- Ust orman ---
  { name: "Kurtlar", emoji: "🐺", pos: { x: 274, y: 589 }, hp: 900, ad: 32, armor: 12, gold: 68, xp: 90, respawn: 90, scale: 1 },
  { name: "Mavi Muhafiz", emoji: "💙", pos: { x: 320, y: 458 }, hp: 1500, ad: 44, armor: 22, gold: 90, xp: 130, respawn: 150, scale: 1.35, buff: "blue" },
  { name: "Yaban Domuzu", emoji: "🐗", pos: { x: 235, y: 400 }, hp: 1100, ad: 38, armor: 16, gold: 76, xp: 104, respawn: 100, scale: 1.1 },
  // --- Alt orman ---
  { name: "Yirtici", emoji: "🦅", pos: { x: 451, y: 692 }, hp: 820, ad: 30, armor: 8, gold: 64, xp: 86, respawn: 90, scale: 0.9 },
  { name: "Kizil Yaban", emoji: "❤️", pos: { x: 560, y: 740 }, hp: 1500, ad: 46, armor: 22, gold: 90, xp: 130, respawn: 150, scale: 1.35, buff: "red" },
  { name: "Golem", emoji: "🪨", pos: { x: 744, y: 846 }, hp: 1250, ad: 40, armor: 20, gold: 82, xp: 110, respawn: 100, scale: 1.2 },
];

export const CAMPS: CampSpec[] = [
  ...BLUE_CAMPS.map((c, i) => ({ ...c, id: `b${i}`, pos: scp(c.pos) })),
  ...BLUE_CAMPS.map((c, i) => ({ ...c, id: `r${i}`, pos: mirror(scp(c.pos)) })),
  {
    id: "dragon",
    name: "Ejderha",
    emoji: "🐉",
    pos: scp({ x: 735, y: 700 }),
    hp: 3400,
    ad: 76,
    armor: 26,
    gold: 30,
    xp: 200,
    respawn: 150,
    epic: "dragon",
    scale: 1.7,
  },
  {
    id: "scuttle-top",
    name: "Kacak Yengec",
    emoji: "🦀",
    pos: scp({ x: 392, y: 428 }),
    hp: 700,
    ad: 0,
    armor: 6,
    gold: 40,
    xp: 60,
    respawn: 120,
    buff: "scuttle",
    scale: 0.85,
  },
  {
    id: "scuttle-bot",
    name: "Kacak Yengec",
    emoji: "🦀",
    pos: scp({ x: 608, y: 572 }),
    hp: 700,
    ad: 0,
    armor: 6,
    gold: 40,
    xp: 60,
    respawn: 120,
    buff: "scuttle",
    scale: 0.85,
  },
  {
    id: "baron",
    name: "Kadim Ejder",
    emoji: "🐲",
    pos: scp({ x: 265, y: 300 }),
    hp: 6200,
    ad: 118,
    armor: 40,
    gold: 150,
    xp: 420,
    respawn: 240,
    epic: "baron",
    scale: 2,
  },
];

/** Oyun ekonomisi ve genel ayarlar. */
export const CONFIG = {
  teamSize: 5,
  passiveGoldPerSec: 3.2,
  startingGold: 550,
  minionWaveInterval: 28,
  firstWaveDelay: 12,
  cannonEveryNWaves: 3,
  superMinionAfterInhib: true,
  inhibRespawn: 150,
  baseRespawn: 9,
  respawnPerLevel: 2.6,
  maxLevel: 18,
  championKillGold: 300,
  assistGold: 150,
  shutdownBonus: 60,
  towerGold: 250,
  towerLocalGold: 100,
  minionGoldMelee: 21,
  minionGoldCaster: 15,
  minionGoldCannon: 48,
  minionGoldSuper: 60,
  minionXp: 32,
  cannonXp: 62,
  /** Kule menzili ve hasari. */
  towerRange: 112,
  /** Orman buff kamplarinin verdigi guclendirmenin suresi (saniye). */
  jungleBuffTime: 90,
  towerAttackSpeed: 0.9,
  towerDamage: [155, 175, 195, 210],
  towerHp: [2200, 2500, 2800, 2300],
  towerArmor: [26, 30, 34, 26],
  inhibHp: 2500,
  nexusHp: 3800,
  /** Us icinde saglik yenilenmesi (saniyede yuzde). */
  fountainRegen: 0.22,
  fountainRadius: 105,
  /** Geri donus suresi. */
  recallTime: 7,
  matchTimeLimit: 60 * 30,
} as const;

/** Seviye basina gereken toplam tecrube. */
export const XP_TABLE: number[] = (() => {
  const t = [0];
  let need = 280;
  for (let i = 1; i < 18; i++) {
    t.push(t[i - 1] + need);
    need += 100 + i * 16;
  }
  return t;
})();

export function levelFromXp(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < XP_TABLE.length; i++) {
    if (xp >= XP_TABLE[i]) lvl = i + 1;
    else break;
  }
  return Math.min(lvl, CONFIG.maxLevel);
}

/** Birim yaricaplari (carpisma). */
export const RADIUS = {
  champion: 10,
  minion: 7,
  tower: 14,
  inhibitor: 17,
  nexus: 26,
  monster: 14,
} as const;
