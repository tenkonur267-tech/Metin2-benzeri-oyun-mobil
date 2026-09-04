/**
 * Sampiyon portreleri: oyun ici 3B modelin kucuk bir goruntusu.
 * Mac basindan once bir kez uretilip onbellege alinir; menude ve HUD'da
 * kullanilir.
 */
import * as THREE from "three";
import { CHAMPIONS } from "../game/champions";
import { championModel } from "../render/models";
import { findNode, instantiate, type LoadedModel } from "./assets";
import { GEAR_NODES, loadoutOf } from "./loadout";

const cache = new Map<string, HTMLCanvasElement>();
const SIZE = 256;

/** Onbellekteki portre (yoksa bos tuval). */
export function championPortrait(id: string): HTMLCanvasElement {
  const hit = cache.get(id);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = SIZE;
  cv.height = SIZE;
  cache.set(id, cv);
  return cv;
}

/** Tum sampiyonlarin portresini bir kez uretir. */
export function buildPortraits(models: Map<string, LoadedModel>): void {
  if (cache.size >= CHAMPIONS.length) return;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
  scene.add(new THREE.HemisphereLight(0xd8ecff, 0x3a3020, 1.5));
  const key = new THREE.DirectionalLight(0xfff2d8, 2.1);
  key.position.set(-2.2, 3.4, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fc0ff, 1.2);
  rim.position.set(3.0, 1.6, -2.6);
  scene.add(rim);

  for (const def of CHAMPIONS) {
    const cm = championModel(def.id);
    const lo = loadoutOf(def.id);
    const model = models.get(lo.model);
    if (!model) continue;

    const holder = new THREE.Group();
    const body = instantiate(model);
    body.scale.setScalar(1 / (lo.modelHeight ?? 1.75));

    // Sadece bu sampiyonun ekipmani gorunur
    const show = new Set(lo.show);
    for (const name of GEAR_NODES[lo.model] ?? []) {
      const node = findNode(body, name);
      if (node) node.visible = show.has(name);
    }
    // Portrede takim rengi yerine sampiyon rengi kullanilir (lobide
    // takim yok); `teamTint` acikken mavi taraf rengi temsil eder.
    const tintHex = lo.teamTint ? 0x4aa8ff : lo.tint;
    if (tintHex !== undefined) {
      const tint = new THREE.Color(tintHex);
      body.traverse((o) => {
        const m = o as THREE.Mesh;
        const skinned = (m as THREE.SkinnedMesh).isSkinnedMesh;
        if (!m.isMesh || !(skinned || /Cape|Cloak|Body|Hat|Helmet|Hood/i.test(m.name))) return;
        const list = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of list) {
          const std = mm as THREE.MeshStandardMaterial;
          if (std.color) std.color.lerp(tint, 0.42);
        }
      });
    }

    holder.add(body);
    holder.rotation.y = -0.7;
    scene.add(holder);

    // Ust govdeyi cerceveye al
    camera.position.set(0.16, 0.86, 1.32);
    camera.lookAt(0, 0.66, 0);

    renderer.render(scene, camera);

    const cv = championPortrait(def.id);
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const grad = ctx.createRadialGradient(SIZE * 0.35, SIZE * 0.28, 8, SIZE * 0.5, SIZE * 0.55, SIZE * 0.8);
    grad.addColorStop(0, cm.accent);
    grad.addColorStop(0.55, cm.body);
    grad.addColorStop(1, "#060f1a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, SIZE * 0.62, SIZE, SIZE * 0.38);
    ctx.globalAlpha = 1;
    ctx.drawImage(renderer.domElement, 0, 0, SIZE, SIZE);

    scene.remove(holder);
  }

  renderer.dispose();
}


