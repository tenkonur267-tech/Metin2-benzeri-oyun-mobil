/**
 * Sampiyon portreleri: oyun ici 3B modelin kucuk bir goruntusu.
 * Mac basindan once bir kez uretilip onbellege alinir; menude ve HUD'da
 * kullanilir.
 */
import * as THREE from "three";
import { CHAMPIONS } from "../game/champions";
import { championModel } from "../render/models";
import { instantiate, findBone, tintByMaterialName, type LoadedModel } from "./assets";
import { buildCape, buildHeadgear, buildOffhand, buildWeapon, colorOf } from "./gear";

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
export function buildPortraits(model: LoadedModel): void {
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
    const holder = new THREE.Group();
    const body = instantiate(model);
    const k = 1 / model.height;
    const gearScale = 1 / 1.8;
    body.scale.setScalar(k);
    tintByMaterialName(body, {
      Main: colorOf(cm.body),
      Grey: colorOf(cm.accent),
      Black: colorOf(cm.bodyDark),
    });
    attach(findBone(body, "Palm2R"), buildWeapon(cm), gearScale);
    const off = buildOffhand(cm);
    if (off) attach(findBone(body, "Palm2L"), off, gearScale);
    const head = buildHeadgear(cm);
    if (head) attach(findBone(body, "Head"), head, gearScale);
    const cape = buildCape(cm);
    if (cape) attach(findBone(body, "Torso_1") ?? findBone(body, "Body") ?? body, cape, gearScale);

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

function attach(bone: THREE.Object3D | null, gear: THREE.Object3D, worldScale: number): void {
  if (!bone) return;
  const holder = new THREE.Object3D();
  const ws = new THREE.Vector3();
  bone.updateWorldMatrix(true, false);
  bone.getWorldScale(ws);
  holder.scale.setScalar(ws.x > 1e-6 ? worldScale / ws.x : 1);
  holder.add(gear);
  bone.add(holder);
}
