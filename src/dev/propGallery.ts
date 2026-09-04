/**
 * Gelistirici araci: `public/models/` altindaki hazir harita varliklarini
 * tek tek olceklendirip yan yana gosterir (olcu ve gorunum kontrolu icin).
 */
import * as THREE from "three";
import { PropLibrary } from "../render3d/props";
import { PROP_NAMES } from "../render3d/terrain";

const EXTRA = [
  "tower-a-blue", "tower-b-blue", "tower-c-blue", "inhibitor-blue", "nexus-blue",
  "tower-a-red", "nexus-red",
  "house-a-blue", "house-b-blue", "church-blue", "market-blue", "well-blue",
  "sword-1handed", "sword-2handed", "axe-2handed", "dagger", "staff", "wand",
  "crossbow-2handed", "shield-round", "spellbook-closed",
];
const CHARACTERS = [
  "champ-knight", "champ-barbarian", "champ-rogue", "champ-hooded", "champ-mage",
  "minion-melee", "minion-caster", "minion-small", "monster-rogue",
];
const NAMES = [...PROP_NAMES, ...EXTRA];
const SIZE = 190;

async function main(): Promise<void> {
  const grid = document.getElementById("grid") as HTMLDivElement;
  const lib = new PropLibrary();
  await lib.load(NAMES);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(2);

  for (const name of NAMES) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdff0ff, 0x40503a, 2.1));
    const sun = new THREE.DirectionalLight(0xfff2d5, 2.0);
    sun.position.set(3, 6, 4);
    scene.add(sun);

    const obj = lib.clone(name, 1);
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const r = Math.max(size.x, size.y, size.z) * 1.5;
    camera.position.set(center.x + r, center.y + r * 0.75, center.z + r);
    camera.lookAt(center);
    renderer.render(scene, camera);

    const fig = document.createElement("figure");
    const img = new Image(SIZE, SIZE);
    img.src = renderer.domElement.toDataURL();
    img.style.background = "#22485c";
    img.style.borderRadius = "8px";
    const cap = document.createElement("figcaption");
    const s = lib.get(name).size;
    cap.textContent = `${name} · ${s.x.toFixed(1)}×${s.y.toFixed(1)}×${s.z.toFixed(1)}`;
    fig.append(img, cap);
    grid.append(fig);
  }
}

void main();
