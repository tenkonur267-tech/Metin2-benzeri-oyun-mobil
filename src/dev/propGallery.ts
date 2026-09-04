/**
 * Gelistirici araci: `public/models/` altindaki hazir harita varliklarini
 * tek tek olceklendirip yan yana gosterir (olcu ve gorunum kontrolu icin).
 */
import * as THREE from "three";
import { CHAMPIONS } from "../game/champions";
import { findBone, findNode, instantiate, loadModel } from "../render3d/assets";
import { GEAR_NODES, loadoutOf } from "../render3d/loadout";
import { PropLibrary } from "../render3d/props";
import { PROP_NAMES } from "../render3d/terrain";

const EXTRA = [
  "tower-a-blue", "tower-b-blue", "tower-c-blue", "inhibitor-blue", "nexus-blue",
  "tower-a-red", "nexus-red",
  "house-a-blue", "house-b-blue", "church-blue", "market-blue", "well-blue",
  "sword-1handed", "sword-2handed", "axe-2handed", "dagger", "staff", "wand",
  "crossbow-2handed", "shield-round", "spellbook-closed",
];
const CHARACTERS = ["minion-melee", "minion-caster", "minion-small", "monster-rogue"];
const NAMES = [...PROP_NAMES, ...EXTRA];
const SIZE = 190;

async function main(): Promise<void> {
  const grid = document.getElementById("grid") as HTMLDivElement;
  const lib = new PropLibrary();
  await lib.load([...new Set([...NAMES, "dagger", "staff", "spellbook-closed"])]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(2);

  const shoot = (obj: THREE.Object3D, label: string): void => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdff0ff, 0x40503a, 2.1));
    const sun = new THREE.DirectionalLight(0xfff2d5, 2.0);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    scene.add(obj);

    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    const r = Math.max(size.x, size.y, size.z) * 1.5 || 1;
    camera.position.set(center.x + r, center.y + r * 0.75, center.z + r);
    camera.lookAt(center);
    renderer.render(scene, camera);

    const fig = document.createElement("figure");
    const img = new Image(SIZE, SIZE);
    img.src = renderer.domElement.toDataURL();
    img.style.background = "#22485c";
    img.style.borderRadius = "8px";
    const cap = document.createElement("figcaption");
    cap.textContent = label;
    fig.append(img, cap);
    grid.append(fig);
  };

  // --- Sampiyonlar: oyundaki kurulumun aynisi ---
  for (const def of CHAMPIONS) {
    const lo = loadoutOf(def.id);
    const model = await loadModel(`${lo.model}.glb`);
    const obj = instantiate(model);
    const target = lo.scale ?? 1;
    obj.scale.setScalar(target / (lo.modelHeight ?? 1.75));

    const show = new Set(lo.show);
    for (const g of GEAR_NODES[lo.model] ?? []) {
      const node = findNode(obj, g);
      if (node) node.visible = show.has(g);
    }
    const handHeight = target * (lo.handScale ?? 0.5);
    if (lo.mainHand && lib.has(lo.mainHand)) {
      hand(obj, lo.handBone ?? "handslot.r", lib.clone(lo.mainHand, handHeight));
    }
    if (lo.offHand && lib.has(lo.offHand)) {
      hand(obj, lo.offHandBone ?? "handslot.l", lib.clone(lo.offHand, handHeight * 0.34));
    }
    const tintHex = lo.teamTint ? 0x4aa8ff : lo.tint;
    if (tintHex !== undefined) {
      const tint = new THREE.Color(tintHex);
      const amount = lo.teamTint ? 0.55 : 0.28;
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        const skinned = (m as THREE.SkinnedMesh).isSkinnedMesh;
        if (!m.isMesh || !(skinned || /Cape|Cloak|Body/i.test(m.name))) return;
        const list = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of list) {
          const std = mm as THREE.MeshStandardMaterial;
          if (std.color) std.color.lerp(tint, amount);
        }
      });
    }
    shoot(obj, `${def.name} · ${lo.model}`);
  }

  // --- Minyonlar ve canavarlar ---
  for (const name of CHARACTERS) {
    const model = await loadModel(`${name}.glb`);
    const obj = instantiate(model);
    obj.scale.setScalar(1 / 1.75);
    shoot(obj, name);
  }

  // --- Harita varliklari ---
  for (const name of NAMES) {
    const s = lib.get(name).size;
    shoot(lib.clone(name, 1), `${name} · ${s.x.toFixed(1)}×${s.y.toFixed(1)}×${s.z.toFixed(1)}`);
  }
}

void main();

/** Hazir silahi el kemigine, kemik olceginden bagimsiz boyutta takar. */
function hand(body: THREE.Object3D, boneName: string, gear: THREE.Object3D): void {
  const bone = findBone(body, boneName);
  if (!bone) return;
  bone.updateWorldMatrix(true, false);
  const ws = new THREE.Vector3();
  bone.getWorldScale(ws);
  const holder = new THREE.Object3D();
  holder.scale.setScalar(ws.x > 1e-6 ? 1 / ws.x : 1);
  holder.add(gear);
  bone.add(holder);
}
