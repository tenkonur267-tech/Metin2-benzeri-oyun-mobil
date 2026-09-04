/**
 * Karakter "modelleri": her sampiyon ve birim icin prosedurel olarak
 * cizilecek govde parcalari, renkler ve silah tipi.
 * Hazir gorsel dosyasi yoktur; tum sprite'lar calisma aninda cizilir.
 */

export type WeaponKind =
  | "greatsword"
  | "sword"
  | "staff"
  | "bow"
  | "dagger"
  | "wand"
  | "axe"
  | "trident"
  | "claws"
  | "cannon"
  | "none";

export type HeadGear = "none" | "hood" | "horned" | "crown" | "mask" | "helm";
export type Build = "heavy" | "medium" | "slim";

export interface CharModel {
  body: string;
  bodyDark: string;
  accent: string;
  skin: string;
  hair: string;
  cape?: string;
  weapon: WeaponKind;
  offhand?: "shield" | "dagger" | "orb" | "none";
  head: HeadGear;
  build: Build;
  /** Govde cevresinde hafif parilti. */
  aura?: string;
  /** Omuz zirhi. */
  pauldrons?: boolean;
}

const M = (m: CharModel): CharModel => m;

export const CHAMPION_MODELS: Record<string, CharModel> = {
  kaya: M({
    body: "#6d8296",
    bodyDark: "#3c4b5a",
    accent: "#b9cadb",
    skin: "#8d949c",
    hair: "#55636f",
    weapon: "greatsword",
    offhand: "shield",
    head: "helm",
    build: "heavy",
    pauldrons: true,
  }),
  selin: M({
    body: "#6a5bd8",
    bodyDark: "#382f7a",
    accent: "#cbbcff",
    skin: "#f0d6bd",
    hair: "#e8e2ff",
    cape: "#4a3fa8",
    weapon: "staff",
    offhand: "orb",
    head: "hood",
    build: "slim",
    aura: "#b9a8ff",
  }),
  demir: M({
    body: "#a8792f",
    bodyDark: "#5e4318",
    accent: "#ffd45e",
    skin: "#e8c39a",
    hair: "#3f3222",
    cape: "#7a5a22",
    weapon: "bow",
    head: "none",
    build: "medium",
  }),
  golge: M({
    body: "#2e2a45",
    bodyDark: "#14121f",
    accent: "#8f7bd8",
    skin: "#c9a98c",
    hair: "#1a1728",
    cape: "#221d38",
    weapon: "dagger",
    offhand: "dagger",
    head: "mask",
    build: "slim",
  }),
  ayla: M({
    body: "#f2e3ba",
    bodyDark: "#b9a171",
    accent: "#ffd98a",
    skin: "#f6d9bd",
    hair: "#ffe9a8",
    cape: "#fff6dd",
    weapon: "wand",
    offhand: "orb",
    head: "crown",
    build: "slim",
    aura: "#ffe9a8",
  }),
  bozkurt: M({
    body: "#7c6a50",
    bodyDark: "#43382a",
    accent: "#c9b08a",
    skin: "#d7b48e",
    hair: "#3b2f22",
    cape: "#5c4a34",
    weapon: "axe",
    head: "horned",
    build: "heavy",
    pauldrons: true,
  }),
  deniz: M({
    body: "#2f8f9e",
    bodyDark: "#17505c",
    accent: "#8fe8f5",
    skin: "#dcbfa0",
    hair: "#1d6b78",
    weapon: "trident",
    offhand: "shield",
    head: "helm",
    build: "heavy",
    pauldrons: true,
    aura: "#5fd6e8",
  }),
  alev: M({
    body: "#b8452a",
    bodyDark: "#6b2213",
    accent: "#ff9b4a",
    skin: "#eec4a2",
    hair: "#ff7a3c",
    cape: "#7a2a18",
    weapon: "wand",
    offhand: "orb",
    head: "hood",
    build: "medium",
    aura: "#ff8f47",
  }),
};

/** Bilinmeyen sampiyonlar icin yedek model. */
export const DEFAULT_MODEL: CharModel = M({
  body: "#6f7f95",
  bodyDark: "#3b4655",
  accent: "#cfe0f0",
  skin: "#e2c3a2",
  hair: "#33291f",
  weapon: "sword",
  head: "none",
  build: "medium",
});

export function championModel(id: string): CharModel {
  return CHAMPION_MODELS[id] ?? DEFAULT_MODEL;
}

/** Orman canavarlarinin govde bicimi. */
export interface CreatureModel {
  body: string;
  bodyDark: string;
  accent: string;
  shape: "wolf" | "golem" | "raptor" | "boar" | "dragon";
  legs: number;
  horns?: boolean;
  wings?: boolean;
  tail?: boolean;
}

export const CREATURE_MODELS: Record<string, CreatureModel> = {
  "Mavi Muhafiz": { body: "#4f8fe0", bodyDark: "#1f3f70", accent: "#bfe0ff", shape: "golem", legs: 2, horns: true },
  "Kizil Yaban": { body: "#d05a3c", bodyDark: "#6b2416", accent: "#ffcaa8", shape: "boar", legs: 4, horns: true, tail: true },
  Kurtlar: { body: "#7d8794", bodyDark: "#464e58", accent: "#d7dee6", shape: "wolf", legs: 4, tail: true },
  Golem: { body: "#6b6157", bodyDark: "#3a342e", accent: "#a89684", shape: "golem", legs: 2 },
  Yirtici: { body: "#8a6a3f", bodyDark: "#4a3720", accent: "#e0c088", shape: "raptor", legs: 2, wings: true },
  "Yaban Domuzu": { body: "#6f5a44", bodyDark: "#3d3125", accent: "#d8c4a8", shape: "boar", legs: 4, horns: true, tail: true },
  Ejderha: { body: "#3f7a4a", bodyDark: "#1e3d25", accent: "#8fe08a", shape: "dragon", legs: 4, wings: true, horns: true, tail: true },
  "Kadim Ejder": { body: "#6b4a9e", bodyDark: "#33224f", accent: "#d0a8ff", shape: "dragon", legs: 4, wings: true, horns: true, tail: true },
};

export function creatureModel(name: string): CreatureModel {
  return (
    CREATURE_MODELS[name] ?? {
      body: "#6b6157",
      bodyDark: "#3a342e",
      accent: "#a89684",
      shape: "golem",
      legs: 2,
    }
  );
}
