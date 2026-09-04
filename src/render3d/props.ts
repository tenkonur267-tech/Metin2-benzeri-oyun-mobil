/**
 * Hazir 3B varlik kutuphanesi.
 *
 * Modeller `public/models/` altinda hazir GLB dosyalaridir (bkz. CREDITS.md);
 * burada yuklenir, olculeri normalize edilir ve performans icin
 * InstancedMesh'e cevrilir.
 */
import * as THREE from "three";
import { loadModel, type LoadedModel } from "./assets";

export interface PropPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export interface Prop {
  name: string;
  parts: PropPart[];
  /** Modelin kendi birimlerindeki boyutu. */
  size: THREE.Vector3;
  /** Taban ofseti (modelin en alt noktasi). */
  baseY: number;
}

export class PropLibrary {
  private props = new Map<string, Prop>();

  async load(names: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    let done = 0;
    for (const name of names) {
      if (!this.props.has(name)) {
        const model = await loadModel(`${name}.glb`);
        this.props.set(name, flatten(name, model));
      }
      onProgress?.(++done, names.length);
    }
  }

  get(name: string): Prop {
    const p = this.props.get(name);
    if (!p) throw new Error(`Model yuklenmedi: ${name}`);
    return p;
  }

  has(name: string): boolean {
    return this.props.has(name);
  }

  /** Modelin yuksekligi (kendi birimlerinde). */
  height(name: string): number {
    return this.get(name).size.y || 1;
  }

  /** Modelin paylasilan materyalini bir renge dogru kaydirir. */
  tint(name: string, hex: number, amount = 0.5): void {
    const col = new THREE.Color(hex);
    for (const part of this.get(name).parts) {
      const std = part.material as THREE.MeshStandardMaterial;
      if (std.color) std.color.lerp(col, amount);
    }
  }

  /** Tek bir kopya (yapilar gibi benzersiz nesneler icin). */
  clone(name: string, targetHeight?: number): THREE.Group {
    const p = this.get(name);
    const g = new THREE.Group();
    for (const part of p.parts) {
      const m = new THREE.Mesh(part.geometry, part.material.clone());
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    if (targetHeight) {
      const k = targetHeight / (p.size.y || 1);
      g.scale.setScalar(k);
    }
    return g;
  }

  /**
   * Cok sayida kopyayi tek cizim cagrisinda cizer.
   * Donen nesnelerin `setMatrixAt` ile doldurulmasi gerekir.
   */
  instanced(name: string, count: number): THREE.InstancedMesh[] {
    const p = this.get(name);
    return p.parts.map((part) => {
      const im = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, count));
      im.castShadow = true;
      im.receiveShadow = false;
      im.count = 0;
      return im;
    });
  }
}

/**
 * Sikistirilmis modellerde konumlar Int16 olarak saklanir (KHR_mesh_quantization).
 * Donusum uygulamadan once tum ozellikleri Float32'ye cevirmek gerekir,
 * yoksa `applyMatrix4` tam sayi tamponuna yazip geometriyi bozar.
 */
function dequantize(geo: THREE.BufferGeometry): THREE.BufferGeometry {
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

/** Model hiyerarsisini duz (geometri, materyal) listesine cevirir. */
function flatten(name: string, model: LoadedModel): Prop {
  const parts: PropPart[] = [];
  model.scene.updateWorldMatrix(true, true);
  model.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const geo = dequantize(m.geometry.clone());
    geo.applyMatrix4(m.matrixWorld);
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    const std = mat as THREE.MeshStandardMaterial;
    if (std) {
      std.metalness = Math.min(std.metalness ?? 0, 0.15);
      std.roughness = Math.max(std.roughness ?? 1, 0.65);
    }
    parts.push({ geometry: geo, material: mat });
  });

  const box = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) box.union(part.geometry.boundingBox);
  }
  const size = new THREE.Vector3();
  box.getSize(size);

  // Modeli tabanindan hizala (y = 0 zemin)
  const baseY = box.min.y;
  for (const part of parts) part.geometry.translate(0, -baseY, 0);

  return { name, parts, size, baseY };
}
