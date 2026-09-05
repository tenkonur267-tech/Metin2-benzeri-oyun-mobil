/**
 * Gelistirici araci: haritayi maç açmadan, serbest kamerayla gösterir.
 *
 * URL parametreleri (hepsi istege bagli):
 *   ?x=1000&y=1000  bakilan nokta (oyun birimi)
 *   &d=900          kameranin uzakligi
 *   &p=55           yukselis acisi (derece; 90 = tam tepeden)
 *   &a=45           yatay aci (derece)
 */
import * as THREE from "three";
import { BASE_PROPS, STRUCTURE_PROPS } from "../render3d/actors";
import { PropLibrary } from "../render3d/props";
import { PROP_NAMES, buildTerrain, fowTime, terrainHeight } from "../render3d/terrain";
import { MAP_SIZE } from "../game/constants";

const q = new URLSearchParams(location.search);
const num = (k: string, def: number): number => {
  const v = Number(q.get(k));
  return Number.isFinite(v) && q.has(k) ? v : def;
};

async function main(): Promise<void> {
  const props = new PropLibrary();
  const status = document.getElementById("status") as HTMLDivElement;
  await props.load([...new Set([...PROP_NAMES, ...STRUCTURE_PROPS, ...BASE_PROPS])], (d, t) => {
    status.textContent = `Modeller ${d}/${t}`;
  });
  status.textContent = "Arazi olusturuluyor...";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1a26);
  scene.fog = new THREE.Fog(0x0d1a26, MAP_SIZE * 0.7, MAP_SIZE * 1.8);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x33452c, 2.0));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(MAP_SIZE * 0.6, MAP_SIZE, MAP_SIZE * 0.4);
  scene.add(sun);

  const terrain = buildTerrain(props);
  // Gorus alani maskesi acik olsun ki her sey gorunsun.
  terrain.visionData.fill(255);
  terrain.visionTexture.needsUpdate = true;
  scene.add(terrain.group);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.append(renderer.domElement);

  const cx = num("x", MAP_SIZE / 2);
  const cy = num("y", MAP_SIZE / 2);
  const dist = num("d", MAP_SIZE * 0.75);
  const pitch = (num("p", 58) * Math.PI) / 180;
  const yaw = (num("a", 45) * Math.PI) / 180;

  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, MAP_SIZE * 4);
  const look = new THREE.Vector3(cx, terrainHeight(cx, cy), cy);
  camera.position.set(
    cx - Math.cos(yaw) * Math.cos(pitch) * dist,
    look.y + Math.sin(pitch) * dist,
    cy - Math.sin(yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(look);

  const t0 = performance.now();
  let frames = 0;
  let last = t0;
  const tick = (): void => {
    const t = (performance.now() - t0) / 1000;
    terrain.water.uniforms.uTime.value = t;
    terrain.fow.uniforms.uTime.value = t;
    fowTime.value = t;
    renderer.render(scene, camera);
    const now = performance.now();
    frames++;
    if (now - last > 500) {
      const r = renderer.info.render;
      status.textContent =
        `${Math.round((frames * 1000) / (now - last))} fps | ` +
        `${r.calls} cizim | ${(r.triangles / 1000).toFixed(0)}k ucgen`;
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

void main();
