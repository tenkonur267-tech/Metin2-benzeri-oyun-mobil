/**
 * Gelistirici araci: karakter modellerinin iskelet boyunu olcer.
 *
 * Yeni bir model eklendiginde `loadout.modelHeight` degerini buradan
 * okunan `maxY` belirler: KayKit referansi 1.75 iken olculen boy
 * 1.241 oldugundan, yeni model icin `olculenBoy / 0.709` kullanilir.
 */
import * as THREE from "three";
import { instantiate, loadModel } from "../render3d/assets";

async function main(): Promise<void> {
  const out = document.getElementById("out") as HTMLDivElement;
  const lines: string[] = [];
  const files = (new URLSearchParams(location.search).get("m") ?? "champ-mannequin,champ-knight").split(",");
  for (const file of files) {
    const m = await loadModel(`${file}.glb`);
    const obj = instantiate(m);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    obj.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      if (!sk.isSkinnedMesh || !sk.skeleton) return;
      for (const bone of sk.skeleton.bones) box.expandByPoint(bone.getWorldPosition(v));
    });
    const size = new THREE.Vector3();
    box.getSize(size);
    lines.push(
      `${file}: kemik kutusu ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}\n` +
        `  onerilen modelHeight: ${(size.y / 0.709).toFixed(2)}\n` +
        `  klipler (${m.animations.length}): ${m.animations.map((a) => a.name).join(", ")}`,
    );
  }
  out.textContent = lines.join("\n");
}
void main();
