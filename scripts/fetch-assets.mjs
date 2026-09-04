/**
 * Hazir 3B varliklari indirir ve mobil icin optimize eder.
 *
 * Kaynaklar (hepsi acik lisansli):
 *  - BabylonJS/Assets  — CC BY 4.0 (koy/mezarlik paketleri, silahlar)
 *  - mrdoob/three.js   — RobotExpressive, CC0
 *  - KhronosGroup/glTF-Sample-Assets — Fox, CC0
 *
 * Kullanim:  node scripts/fetch-assets.mjs [--skip-optimize]
 * Cikti:     public/models/*.glb  (optimize edilmis)
 */
import { mkdir, writeFile, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);
const RAW = "https://raw.githubusercontent.com";
const BJS = `${RAW}/BabylonJS/Assets/master/meshes`;
const OUT = "public/models";
const TMP = ".asset-cache";

/** indirilecek dosyalar: [kaynak URL, hedef ad] */
const MANIFEST = [
  // --- Karakterler (CC0) ---
  [`${RAW}/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb`, "champion.glb"],
  [`${RAW}/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb`, "beast.glb"],

  // --- Agaclar (mezarlik + koy paketi) ---
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [
    `${BJS}/graveYardPack/tree${n}/tree${n}.glb`,
    `tree-${n}.glb`,
  ]),
  [`${BJS}/villagePack/tree1/tree1.glb`, "tree-9.glb"],
  [`${BJS}/villagePack/tree2/tree2.glb`, "tree-10.glb"],

  // --- Calilar ---
  ...[1, 2, 3, 4].map((n) => [`${BJS}/villagePack/bush${n}/bush${n}.glb`, `bush-${n}.glb`]),

  // --- Kayalar ---
  ...[1, 2, 3, 4].map((n) => [`${BJS}/villagePack/rocks${n}/rocks${n}.glb`, `rock-${n}.glb`]),

  // --- Orman susleri ---
  [`${BJS}/villagePack/stump/stump.glb`, "stump.glb"],
  [`${BJS}/villagePack/hollowLog/hollowLog.glb`, "log.glb"],
  [`${BJS}/graveYardPack/stump1/stump1.glb`, "stump-2.glb"],

  // --- Yapilar ---
  [`${BJS}/graveYardPack/obelisk1/obelisk1.glb`, "tower.glb"],
  [`${BJS}/graveYardPack/obelisk2/obelisk2.glb`, "tower-2.glb"],
  [`${BJS}/graveYardPack/mausoleumSmall/mausoleumSmall.glb`, "inhibitor.glb"],
  [`${BJS}/graveYardPack/mausoleumLarge/mausoleumLarge.glb`, "nexus.glb"],
  [`${BJS}/villagePack/waterwell/waterwell.glb`, "well.glb"],
  [`${BJS}/villagePack/lightPost1/lightPost1.glb`, "lightpost.glb"],
  [`${BJS}/villagePack/cottage/cottage.glb`, "cottage.glb"],
  [`${BJS}/villagePack/wall/wall.glb`, "wall.glb"],
  [`${BJS}/villagePack/wallArch/wallArch.glb`, "wall-arch.glb"],
  [`${BJS}/villagePack/fence/fence.glb`, "fence.glb"],
  [`${BJS}/graveYardPack/fenceASection1/fenceASection1.glb`, "fence-2.glb"],

  // --- Silahlar ---
  [`${BJS}/Demos/weaponsDemo/meshes/runeSword.glb`, "weapon-sword.glb"],
  [`${BJS}/Demos/weaponsDemo/meshes/frostAxe_noMorph.glb`, "weapon-axe.glb"],
  [`${BJS}/Demos/weaponsDemo/meshes/moltenDagger.glb`, "weapon-dagger.glb"],
];

/** Optimize edilmeyecek dosyalar (iskelet animasyonu bozulmasin diye). */
const SKIP_OPTIMIZE = new Set(["champion.glb", "beast.glb"]);

const fmt = (n) => (n / 1024).toFixed(1) + " KB";

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  const skipOptimize = process.argv.includes("--skip-optimize");
  await mkdir(OUT, { recursive: true });
  await mkdir(TMP, { recursive: true });

  let rawTotal = 0;
  let outTotal = 0;

  for (const [url, name] of MANIFEST) {
    const tmpFile = path.join(TMP, name);
    const outFile = path.join(OUT, name);
    let raw;
    if (existsSync(tmpFile)) {
      raw = (await stat(tmpFile)).size;
    } else {
      raw = await download(url, tmpFile);
    }
    rawTotal += raw;

    if (skipOptimize || SKIP_OPTIMIZE.has(name)) {
      await writeFile(outFile, await (await import("node:fs/promises")).readFile(tmpFile));
    } else {
      await rm(outFile, { force: true });
      await run(
        "npx",
        [
          "--yes",
          "@gltf-transform/cli@4",
          "optimize",
          tmpFile,
          outFile,
          "--texture-compress", "webp",
          "--texture-size", "512",
          "--compress", "meshopt",
          "--simplify", "false",
        ],
        { maxBuffer: 1 << 24 },
      );
    }
    const out = (await stat(outFile)).size;
    outTotal += out;
    console.log(`${name.padEnd(20)} ${fmt(raw).padStart(10)} -> ${fmt(out).padStart(10)}`);
  }

  console.log(`\nTOPLAM  ${fmt(rawTotal)} -> ${fmt(outTotal)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
