/**
 * 3B model yukleme ve klonlama.
 * Modeller CC0 lisanslidir (bkz. public/models/CREDITS.md).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  /** Modelin orijinal yuksekligi (birim). */
  height: number;
}

const cache = new Map<string, Promise<LoadedModel>>();

function base(): string {
  const b = (import.meta.env && import.meta.env.BASE_URL) || "/";
  return b.endsWith("/") ? b : `${b}/`;
}

export function loadModel(file: string): Promise<LoadedModel> {
  const hit = cache.get(file);
  if (hit) return hit;
  const p = new Promise<LoadedModel>((resolve, reject) => {
    new GLTFLoader().load(
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
export function tintAll(root: THREE.Object3D, color: number, emissive = 0x000000): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of list) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.color) std.color.setHex(color);
      if (std.emissive) std.emissive.setHex(emissive);
      if ("metalness" in std) std.metalness = 0.02;
      if ("roughness" in std) std.roughness = 0.85;
    }
  });
}
