/**
 * 3B model yukleme ve klonlama.
 * Modeller CC0 lisanslidir (bkz. public/models/CREDITS.md).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  /** Modelin orijinal yuksekligi (birim). */
  height: number;
}

const cache = new Map<string, Promise<LoadedModel>>();

/** Modeller meshopt ile sikistirilmistir; cozucu tek sefer kurulur. */
let loader: GLTFLoader | null = null;
function gltfLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

function base(): string {
  const b = (import.meta.env && import.meta.env.BASE_URL) || "/";
  return b.endsWith("/") ? b : `${b}/`;
}

export function loadModel(file: string): Promise<LoadedModel> {
  const hit = cache.get(file);
  if (hit) return hit;
  const p = new Promise<LoadedModel>((resolve, reject) => {
    gltfLoader().load(
      `${base()}models/${file}`,
      (gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = false;
            m.frustumCulled = false;
          }
        });
        resolve({ scene: gltf.scene as THREE.Group, animations: gltf.animations, height: size.y || 1 });
      },
      undefined,
      reject,
    );
  });
  cache.set(file, p);
  return p;
}

/** Iskeletli modeli klonlar (materyaller de kopyalanir ki renk degistirilebilsin). */
export function instantiate(model: LoadedModel): THREE.Group {
  const obj = skeletonClone(model.scene) as THREE.Group;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
      if (Array.isArray(m.material)) m.material = m.material.map((x) => x.clone());
      else if (m.material) m.material = (m.material as THREE.Material).clone();
    }
  });
  return obj;
}

/** Isimle kemik bulur (glTF yuklerken noktalar kaldirilir: "Palm2.R" -> "Palm2R"). */
export function findBone(root: THREE.Object3D, name: string): THREE.Bone | null {
  const want = name.replace(/\./g, "");
  let hit: THREE.Bone | null = null;
  root.traverse((o) => {
    if (!hit && (o as THREE.Bone).isBone && o.name === want) hit = o as THREE.Bone;
  });
  return hit;
}

/** Isimle kemik/dugum bulur. */
export function findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!hit && o.name === name) hit = o;
  });
  return hit;
}

/** Materyalleri isimlerine gore boyar. */
export function tintByMaterialName(
  root: THREE.Object3D,
  colors: Record<string, number>,
): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of list) {
      const c = colors[mat.name];
      if (c === undefined) continue;
      const std = mat as THREE.MeshStandardMaterial;
      if (std.color) std.color.setHex(c);
      if ("metalness" in std) std.metalness = 0.05;
      if ("roughness" in std) std.roughness = 0.75;
    }
  });
}

/** Tum materyalleri tek renge boyar (canavarlar icin). */
export function tintAll(
  root: THREE.Object3D,
  color: number,
  emissive = 0x000000,
  amount = 1,
): void {
  const target = new THREE.Color(color);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of list) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.color) std.color.lerp(target, amount);
      if (std.emissive) std.emissive.setHex(emissive);
      if ("metalness" in std) std.metalness = 0.02;
      if ("roughness" in std) std.roughness = 0.85;
    }
  });
}

/**
 * Sikistirilmis modellerde ozellikler Int16 olarak saklanir
 * (KHR_mesh_quantization). Geometriyi birlestirmeden veya donusturmeden
 * once hepsini Float32'ye cevirmek gerekir.
 */
export function dequantize(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const key of Object.keys(geo.attributes)) {
    const attr = geo.attributes[key] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const plain = attr as THREE.BufferAttribute;
    if (plain.isBufferAttribute && !attr.normalized && plain.array instanceof Float32Array) continue;
    const n = attr.itemSize;
    const out = new Float32Array(attr.count * n);
    for (let i = 0; i < attr.count; i++) {
      out[i * n] = attr.getX(i);
      if (n > 1) out[i * n + 1] = attr.getY(i);
      if (n > 2) out[i * n + 2] = attr.getZ(i);
      if (n > 3) out[i * n + 3] = attr.getW(i);
    }
    geo.setAttribute(key, new THREE.BufferAttribute(out, n));
  }
  return geo;
}

/**
 * Bir karakterin gorunur iskeletli parcalarini tek mesh'te birlestirir.
 *
 * KayKit karakterleri kol/bacak/govde/kafa gibi 10 ayri parcadan olusur;
 * hepsi ayni iskelete ve ayni dokuya bagli oldugu icin birlestirilebilir.
 * 10 cizim cagrisi 1'e iner — sahnede onlarca minyon varken sart.
 * Gizli parcalar (kullanilmayan silahlar) birlestirmeye alinmaz.
 */
export function mergeSkinned(root: THREE.Object3D): void {
  const parts: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const s = o as THREE.SkinnedMesh;
    if (s.isSkinnedMesh && s.visible) parts.push(s);
  });
  if (parts.length < 2) return;

  const first = parts[0];
  const same = parts.filter((s) => s.skeleton === first.skeleton);
  if (same.length < 2) return;

  const geos = same.map((s) => dequantize(s.geometry.clone()));
  const keys = Object.keys(geos[0].attributes).sort().join(",");
  if (geos.some((g) => Object.keys(g.attributes).sort().join(",") !== keys)) return;

  const merged = mergeGeometries(geos, false);
  if (!merged) return;

  const mesh = new THREE.SkinnedMesh(merged, first.material);
  mesh.name = "merged";
  mesh.bind(first.skeleton, first.bindMatrix);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  first.parent?.add(mesh);
  for (const s of same) s.parent?.remove(s);
}
