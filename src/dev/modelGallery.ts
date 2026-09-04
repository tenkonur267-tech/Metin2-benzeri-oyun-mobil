/**
 * Gelistirici araci: tum sampiyon modellerini, ekipmanlarini ve
 * animasyonlarini yan yana gosterir. `npm run dev` -> /models.html
 */
import * as THREE from "three";
import { CHAMPIONS } from "../game/champions";
import { CAMPS } from "../game/constants";
import { championModel, creatureModel } from "../render/models";
import { instantiate, findBone, loadModel, tintAll, tintByMaterialName } from "../render3d/assets";
import { buildCape, buildHeadgear, buildOffhand, buildWeapon, colorOf } from "../render3d/gear";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const label = document.getElementById("label") as HTMLElement;
const animSel = document.getElementById("anim") as HTMLSelectElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x0e1e2b, 1);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x2a3a22, 1.3));
const key = new THREE.DirectionalLight(0xfff0d8, 2);
key.position.set(-4, 8, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 20),
  new THREE.MeshStandardMaterial({ color: 0x27452e, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

const mixers: THREE.AnimationMixer[] = [];
const actions: Map<string, THREE.AnimationAction>[] = [];

async function main(): Promise<void> {
  const champModel = await loadModel("champion.glb");
  const beastModel = await loadModel("beast.glb");

  const SPACING = 2.15;
  CHAMPIONS.forEach((def, i) => {
    const cm = championModel(def.id);
    const body = instantiate(champModel);
    const k = 1.8 / champModel.height;
    const gearScale = 1;
    body.scale.setScalar(k);
    tintByMaterialName(body, {
      Main: colorOf(cm.body),
      Grey: colorOf(cm.accent),
      Black: colorOf(cm.bodyDark),
    });
    attach(findBone(body, "Palm2R"), buildWeapon(cm), gearScale);
    const off = buildOffhand(cm);
    if (off) attach(findBone(body, "Palm2L"), off, gearScale);
    const hg = buildHeadgear(cm);
    if (hg) attach(findBone(body, "Head"), hg, gearScale);
    const cape = buildCape(cm);
    if (cape) attach(findBone(body, "Torso_1") ?? findBone(body, "Body") ?? body, cape, gearScale);

    body.position.x = (i - (CHAMPIONS.length - 1) / 2) * SPACING;
    scene.add(body);

    const mixer = new THREE.AnimationMixer(body);
    const map = new Map<string, THREE.AnimationAction>();
    for (const clip of champModel.animations) map.set(clip.name, mixer.clipAction(clip));
    mixers.push(mixer);
    actions.push(map);
  });

  // Canavarlar
  const names = [...new Set(CAMPS.map((c) => c.name))];
  names.forEach((n, i) => {
    const cm = creatureModel(n);
    const beast = instantiate(beastModel);
    beast.scale.setScalar(1.4 / beastModel.height);
    tintAll(beast, colorOf(cm.body));
    beast.position.set((i - (names.length - 1) / 2) * 3.0, 0, -3.6);
    scene.add(beast);
    const mixer = new THREE.AnimationMixer(beast);
    mixer.clipAction(beastModel.animations[0]).play();
    mixers.push(mixer);
  });

  for (const clip of champModel.animations) {
    const opt = document.createElement("option");
    opt.value = clip.name;
    opt.textContent = clip.name;
    animSel.append(opt);
  }
  animSel.value = "Idle";
  animSel.addEventListener("change", () => setAnim(animSel.value));
  setAnim("Idle");

  label.textContent = CHAMPIONS.map((c) => c.name).join("  •  ");
  resize();
  window.addEventListener("resize", resize);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    for (const m of mixers) m.update(dt);
    renderer.render(scene, camera);
  });
}

function setAnim(name: string): void {
  for (const map of actions) {
    for (const [n, a] of map) {
      if (n === name) a.reset().play();
      else a.stop();
    }
  }
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

function resize(): void {
  const w = window.innerWidth;
  const h = Math.max(320, window.innerHeight - 90);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  camera.aspect = w / h;
  camera.fov = w / h > 2 ? 36 : 50;
  camera.updateProjectionMatrix();
  camera.position.set(0, 2.2, 14.5);
  camera.lookAt(0, 1.0, 0.0);
}

void main();
