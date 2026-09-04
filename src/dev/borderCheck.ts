/**
 * Gelistirici araci: harita cevresindeki kayalarin ic yuzunun,
 * yurumenin durdugu `BORDER` cizgisiyle ortusup ortusmedigini olcer.
 */
import * as THREE from "three";
import { MAP_SIZE } from "../game/constants";
import { BORDER } from "../game/grid";
import { PropLibrary } from "../render3d/props";
import { PROP_NAMES, buildTerrain } from "../render3d/terrain";

async function main(): Promise<void> {
  const out = document.getElementById("out") as HTMLDivElement;
  const props = new PropLibrary();
  await props.load(PROP_NAMES);
  const t = buildTerrain(props);

  // Her kenar icin, o kenardaki nesnelerin oyun alanina en cok
  // sokulan yuzunu bul. Deger BORDER'i gecerse karakter kayanin
  // icine girebiliyor demektir.
  const deepest = { sol: 0, ust: 0, sag: 0, alt: 0 };
  const worstBy = new Map<string, number>();
  const box = new THREE.Box3();
  const m4 = new THREE.Matrix4();
  t.decor.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh || !im.geometry.boundingBox) im.geometry?.computeBoundingBox?.();
    if (!im.isInstancedMesh) return;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m4);
      box.copy(im.geometry.boundingBox!).applyMatrix4(m4);
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const dl = cx;
      const dt = cz;
      const dr = MAP_SIZE - cx;
      const db = MAP_SIZE - cz;
      const near = Math.min(dl, dt, dr, db);
      if (near > BORDER + 30) continue;
      const key = im.name || "?";
      const inward = near === dl ? box.max.x : near === dt ? box.max.z : near === dr ? MAP_SIZE - box.min.x : MAP_SIZE - box.min.z;
      worstBy.set(key, Math.max(worstBy.get(key) ?? 0, inward));
      if (near === dl) deepest.sol = Math.max(deepest.sol, box.max.x);
      else if (near === dt) deepest.ust = Math.max(deepest.ust, box.max.z);
      else if (near === dr) deepest.sag = Math.max(deepest.sag, MAP_SIZE - box.min.x);
      else deepest.alt = Math.max(deepest.alt, MAP_SIZE - box.min.z);
    }
  });
  out.textContent =
    `BORDER=${BORDER} | ice sokulma: ` +
    `sol ${deepest.sol.toFixed(1)}, ust ${deepest.ust.toFixed(1)}, ` +
    `sag ${deepest.sag.toFixed(1)}, alt ${deepest.alt.toFixed(1)}\n` +
    [...worstBy].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}: ${v.toFixed(0)}`).join("  ");
}
void main();
