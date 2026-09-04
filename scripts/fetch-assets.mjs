/**
 * Hazir 3B varliklari indirir ve mobil icin optimize eder.
 *
 * Kaynak: KayKit (Kay Lousberg) — hepsi CC0 1.0, atif zorunlu degil.
 *   - Adventurers Character Pack : sampiyonlar + silahlar
 *   - Skeletons Character Pack   : minyonlar ve orman canavarlari
 *   - Medieval Hexagon Pack      : kuleler, ana bina, doga
 *
 * Kullanim:  npm run assets:fetch   [-- --skip-optimize]
 *
 * Not: gltf-transform paketleri devDependencies'te degildir (sharp ile
 * birlikte 40+ paket getirip CI'yi yavaslatiyorlar). `assets:fetch`
 * betigi onlari calisma aninda --no-save ile kurar.
 * Cikti:     public/models/*.glb
 */
import { mkdir, writeFile, readFile, stat, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);
const RAW = "https://raw.githubusercontent.com/KayKit-Game-Assets";
const ADV = `${RAW}/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures`;
const SKE = `${RAW}/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons`;
const HEX = `${RAW}/KayKit-Medieval-Hexagon-Pack-1.0/main/addons/kaykit_medieval_hexagon_pack/Assets/gltf`;

const OUT = "public/models";
const TMP = ".asset-cache";

/** Karakterlerde tutulacak animasyonlar (digerleri atilir, dosya kuculur). */
const KEEP_ANIMS = [
  "Idle",
  "Walking_A",
  "Running_A",
  "1H_Melee_Attack_Slice_Diagonal",
  "1H_Melee_Attack_Chop",
  "2H_Melee_Attack_Chop",
  "1H_Ranged_Shoot",
  "Spellcast_Shoot",
  "Hit_A",
  "Death_A",
  "Cheer",
].join(",");

/**
 * Indirilecek varliklar.
 *  kind: "glb"  -> tek dosya
 *        "gltf" -> .gltf + .bin + doku ayni klasore inip GLB'ye paketlenir
 */
const MANIFEST = [
  // --- Sampiyonlar (iskeletli, animasyonlu) ---
  ...[
    ["Knight", "champ-knight"],
    ["Barbarian", "champ-barbarian"],
    ["Rogue", "champ-rogue"],
    ["Rogue_Hooded", "champ-hooded"],
    ["Mage", "champ-mage"],
  ].map(([src, name]) => ({
    kind: "glb", url: `${ADV}/Characters/gltf/${src}.glb`, name, character: true,
  })),

  // --- Minyonlar ve orman canavarlari (iskeletli) ---
  ...[
    ["Skeleton_Warrior", "minion-melee"],
    ["Skeleton_Mage", "minion-caster"],
    ["Skeleton_Minion", "minion-small"],
    ["Skeleton_Rogue", "monster-rogue"],
  ].map(([src, name]) => ({
    kind: "glb", url: `${SKE}/Characters/gltf/${src}.glb`, name, character: true,
  })),

  // --- Silahlar ve kalkanlar ---
  ...[
    "sword_1handed", "sword_2handed", "axe_1handed", "axe_2handed",
    "dagger", "staff", "wand", "crossbow_2handed", "crossbow_1handed",
    "spellbook_closed", "quiver", "arrow",
    "shield_round", "shield_square", "shield_spikes", "shield_badge",
  ].map((src) => ({
    kind: "gltf", dir: `${ADV}/Assets/gltf`, src, name: src.replace(/_/g, "-"),
  })),

  // --- Yapilar: her takim icin ayri renk ---
  ...["blue", "red"].flatMap((team) =>
    [
      ["building_tower_A", "tower-a"],
      ["building_tower_B", "tower-b"],
      ["building_tower_catapult", "tower-c"],
      ["building_castle", "nexus"],
      ["building_barracks", "inhibitor"],
      ["building_home_A", "house-a"],
      ["building_home_B", "house-b"],
      ["building_church", "church"],
      ["building_market", "market"],
      ["building_well", "well"],
    ].map(([src, name]) => ({
      kind: "gltf",
      dir: `${HEX}/buildings/${team}`,
      src: `${src}_${team}`,
      name: `${name}-${team}`,
    })),
  ),

  // --- Doga ---
  ...[
    "tree_single_A", "tree_single_B",
    "trees_A_small", "trees_A_medium", "trees_A_large",
    "trees_B_small", "trees_B_medium", "trees_B_large",
    "rock_single_A", "rock_single_B", "rock_single_C", "rock_single_D", "rock_single_E",
    "hill_single_A", "hill_single_B", "hill_single_C",
    "mountain_A", "mountain_B", "mountain_C",
    "waterplant_A", "waterplant_B",
  ].map((src) => ({
    kind: "gltf", dir: `${HEX}/decoration/nature`, src, name: src.replace(/_/g, "-").toLowerCase(),
  })),
];

const fmt = (n) => (n / 1024).toFixed(1) + " KB";

async function download(url, dest) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      return buf.length;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  return 0;
}

/** Kullanilmayan animasyonlari atar (karakter dosyalarinin buyuk kismi budur). */
async function stripAnimations(src, dst) {
  await run("node", ["scripts/strip-anims.mjs", src, dst, KEEP_ANIMS], { maxBuffer: 1 << 24 });
}

async function optimize(src, dst, character) {
  await rm(dst, { force: true });
  await run(
    "npx",
    [
      "--yes", "@gltf-transform/cli@4", "optimize", src, dst,
      "--texture-compress", "webp",
      "--texture-size", "256",
      "--compress", "meshopt",
      "--simplify", "false",
      ...(character ? ["--join", "false", "--palette", "false", "--instance", "false"] : []),
    ],
    { maxBuffer: 1 << 24 },
  );
}

async function main() {
  const skipOptimize = process.argv.includes("--skip-optimize");
  await mkdir(OUT, { recursive: true });
  await mkdir(TMP, { recursive: true });

  let rawTotal = 0;
  let outTotal = 0;

  for (const item of MANIFEST) {
    const outFile = path.join(OUT, `${item.name}.glb`);
    let source;
    let raw = 0;

    if (item.kind === "glb") {
      source = path.join(TMP, `${item.name}.glb`);
      raw = existsSync(source) ? (await stat(source)).size : await download(item.url, source);
    } else {
      // .gltf yaninda tampon ve doku dosyalari da ayni klasore inmeli
      const dir = path.join(TMP, item.name);
      await mkdir(dir, { recursive: true });
      const main = path.join(dir, `${item.src}.gltf`);
      raw += existsSync(main) ? (await stat(main)).size : await download(`${item.dir}/${item.src}.gltf`, main);

      const json = JSON.parse(await readFile(main, "utf8"));
      const refs = [...(json.buffers ?? []), ...(json.images ?? [])]
        .map((b) => b.uri)
        .filter((u) => u && !u.startsWith("data:"));
      for (const uri of new Set(refs)) {
        const dest = path.join(dir, decodeURIComponent(uri));
        await mkdir(path.dirname(dest), { recursive: true });
        raw += existsSync(dest) ? (await stat(dest)).size : await download(`${item.dir}/${uri}`, dest);
      }
      source = main;
    }
    rawTotal += raw;

    if (skipOptimize) {
      await cp(source, outFile);
    } else if (item.character) {
      const slim = path.join(TMP, `${item.name}.slim.glb`);
      await stripAnimations(source, slim);
      await optimize(slim, outFile, true);
    } else {
      await optimize(source, outFile, false);
    }

    const out = (await stat(outFile)).size;
    outTotal += out;
    console.log(`${item.name.padEnd(22)} ${fmt(raw).padStart(10)} -> ${fmt(out).padStart(10)}`);
  }

  console.log(`\nTOPLAM  ${fmt(rawTotal)} -> ${fmt(outTotal)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
