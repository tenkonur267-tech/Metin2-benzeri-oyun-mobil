/**
 * Bir GLB'den istenmeyen animasyon kliplerini siler.
 * KayKit karakterleri 70'ten fazla klip icerir; oyunda birkaci kullanilir.
 *
 * Kullanim: node scripts/strip-anims.mjs <giris.glb> <cikis.glb> <klip1,klip2,...>
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";

const [, , input, output, keepList] = process.argv;
const keep = new Set(keepList.split(","));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
for (const anim of doc.getRoot().listAnimations()) {
  if (!keep.has(anim.getName())) anim.dispose();
}
await doc.transform(prune(), dedup());
await io.write(output, doc);
