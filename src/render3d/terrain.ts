/**
 * Prosedurel 3B arazi: yukseklik haritali zemin, koridor yollari, nehir,
 * kayalar, calilar, agaclar ve us platformlari.
 *
 * Arazi tek seferde uretilir; oyun sirasinda guncellenmez.
 */
import * as THREE from "three";
import { closestPointOnSegment, clamp, type Vec2 } from "../core/math";
import { Rng } from "../core/rng";
import {
  BUSHES,
  CAMPS,
  LANES,
  MAP_SIZE,
  NEXUS_POS,
  WALLS,
  lanePath,
} from "../game/constants";

// ---------------------------------------------------------------------------
// Yukseklik ve renk alanlari
// ---------------------------------------------------------------------------

const SEG: { a: Vec2; b: Vec2 }[] = [];
for (const lane of LANES) {
  const p = lanePath(0, lane);
  for (let i = 1; i < p.length; i++) SEG.push({ a: p[i - 1], b: p[i] });
}

/** En yakin koridor merkezine uzaklik. */
export function laneDist(x: number, y: number): number {
  let m = Infinity;
  const p = { x, y };
  for (const s of SEG) {
    const cp = closestPointOnSegment(p, s.a, s.b);
    const dx = cp.x - x;
    const dy = cp.y - y;
    const d = dx * dx + dy * dy;
    if (d < m) m = d;
  }
  return Math.sqrt(m);
}

/** Nehir eksenine (y = x) uzaklik. */
export const riverDist = (x: number, y: number): number => Math.abs(x - y) / Math.SQRT2;

/** Deterministik yumusak gurultu. */
function noise2(x: number, y: number): number {
  const s = Math.sin(x * 0.021 + y * 0.013) * 43758.5453;
  const t = Math.sin(x * 0.007 - y * 0.031) * 12345.6789;
  return ((s - Math.floor(s)) + (t - Math.floor(t))) * 0.5;
}

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const LANE_HALF = 30;
const LANE_FADE = 62;
const RIVER_HALF = 30;
const RIVER_FADE = 58;
const BASE_R = 135;

/** Arazi yuksekligi (oyun birimleri). */
export function terrainHeight(x: number, y: number): number {
  const dl = laneDist(x, y);
  const laneT = smooth(LANE_HALF, LANE_FADE, dl);
  const jungle = 7 + noise2(x, y) * 5 + Math.sin(x * 0.017) * 1.6 + Math.cos(y * 0.019) * 1.6;
  let h = jungle * laneT;

  const dr = riverDist(x, y);
  if (dr < RIVER_FADE) {
    const riverT = smooth(RIVER_HALF, RIVER_FADE, dr);
    h = -5 * (1 - riverT) + h * riverT;
  }

  for (const team of [0, 1] as const) {
    const n = NEXUS_POS[team];
    const d = Math.hypot(x - n.x, y - n.y);
    if (d < BASE_R) {
      const t = smooth(BASE_R * 0.72, BASE_R, d);
      h = 2.2 * (1 - t) + h * t;
    }
  }

  // Harita kenarinda yukselen duvar
  const edge = Math.min(x, y, MAP_SIZE - x, MAP_SIZE - y);
  if (edge < 46) h += (46 - edge) * 0.85;

  return h;
}

const C_LANE = new THREE.Color(0x8a7f56);
const C_LANE_EDGE = new THREE.Color(0x5d6b3e);
const C_GRASS = new THREE.Color(0x2f5c33);
const C_GRASS_DARK = new THREE.Color(0x21432a);
const C_RIVER = new THREE.Color(0x2b5567);
const C_BASE_BLUE = new THREE.Color(0x2a5f92);
const C_BASE_RED = new THREE.Color(0x8f3b30);
const C_ROCK = new THREE.Color(0x4b5561);

function terrainColor(x: number, y: number, out: THREE.Color): void {
  const dl = laneDist(x, y);
  const dr = riverDist(x, y);
  const n = noise2(x * 1.7, y * 1.7);

  out.copy(C_GRASS).lerp(C_GRASS_DARK, n);
  if (dl < LANE_FADE) {
    const t = smooth(LANE_HALF, LANE_FADE, dl);
    const lane = C_LANE.clone().lerp(C_LANE_EDGE, n * 0.7);
    out.lerp(lane, 1 - t);
  }
  if (dr < RIVER_FADE) {
    const t = smooth(RIVER_HALF * 0.7, RIVER_FADE, dr);
    out.lerp(C_RIVER, 1 - t);
  }
  for (const team of [0, 1] as const) {
    const p = NEXUS_POS[team];
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < BASE_R) {
      const t = smooth(BASE_R * 0.6, BASE_R, d);
      out.lerp(team === 0 ? C_BASE_BLUE : C_BASE_RED, (1 - t) * 0.75);
    }
  }
  const edge = Math.min(x, y, MAP_SIZE - x, MAP_SIZE - y);
  if (edge < 52) out.lerp(C_ROCK, 1 - smooth(20, 52, edge));
}

// ---------------------------------------------------------------------------
// Arazi mesh'i
// ---------------------------------------------------------------------------

export interface TerrainBuild {
  group: THREE.Group;
  ground: THREE.Mesh;
  /** Gorus maskesi dokusu (savas sisi). */
  visionTexture: THREE.DataTexture;
  visionData: Uint8Array;
  visionSize: number;
}

const VISION_SIZE = 96;

export function buildTerrain(): TerrainBuild {
  const group = new THREE.Group();
  const rng = new Rng(90210);

  // --- Zemin ---
  const SEGMENTS = 190;
  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  geo.translate(MAP_SIZE / 2, 0, MAP_SIZE / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    terrainColor(x, z, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // Savas sisi maskesi
  const visionData = new Uint8Array(VISION_SIZE * VISION_SIZE);
  const visionTexture = new THREE.DataTexture(
    visionData,
    VISION_SIZE,
    VISION_SIZE,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  visionTexture.minFilter = THREE.LinearFilter;
  visionTexture.magFilter = THREE.LinearFilter;
  visionTexture.wrapS = THREE.ClampToEdgeWrapping;
  visionTexture.wrapT = THREE.ClampToEdgeWrapping;
  visionTexture.needsUpdate = true;

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  applyVisionShader(mat, visionTexture);

  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  group.add(ground);

  // --- Su yuzeyi ---
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE * 1.5, 120, 1, 1),
    new THREE.MeshLambertMaterial({
      color: 0x3f9fc0,
      transparent: true,
      opacity: 0.55,
      emissive: 0x0d3a4a,
      emissiveIntensity: 0.35,
    }),
  );
  water.geometry.rotateX(-Math.PI / 2);
  water.position.set(MAP_SIZE / 2, -1.2, MAP_SIZE / 2);
  water.rotation.y = -Math.PI / 4;
  group.add(water);

  // --- Kayalar (gecilmez duvarlar) ---
  group.add(buildRocks(rng));

  // --- Calilar ---
  group.add(buildBushes(rng));

  // --- Agaclar ---
  group.add(buildTrees(rng));

  // --- Kamp isaretleri ---
  group.add(buildCampPads());

  return { group, ground, visionTexture, visionData, visionSize: VISION_SIZE };
}

/** Zemin materyaline savas sisi karartmasi ekler. */
export function applyVisionShader(
  mat: THREE.Material,
  tex: THREE.Texture,
  strength = 0.72,
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uVision = { value: tex };
    shader.uniforms.uMapSize = { value: MAP_SIZE };
    shader.uniforms.uFogStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWorldPosFow;",
      )
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\n\tvWorldPosFow = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    // worldpos_vertex bazi materyallerde yok; guvenli yedek
    if (!shader.vertexShader.includes("vWorldPosFow =")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        "\tvWorldPosFow = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>",
      );
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vWorldPosFow;
uniform sampler2D uVision;
uniform float uMapSize;
uniform float uFogStrength;`,
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
{
  vec2 fowUv = vWorldPosFow.xz / uMapSize;
  float vis = texture2D(uVision, fowUv).r;
  float shade = mix(1.0 - uFogStrength, 1.0, clamp(vis, 0.0, 1.0));
  gl_FragColor.rgb *= shade;
}`,
      );
  };
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Arazi susleri
// ---------------------------------------------------------------------------

function buildRocks(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x5c6874, flatShading: true });
  const matTop = new THREE.MeshLambertMaterial({ color: 0x6f7d8a, flatShading: true });

  for (const w of WALLS) {
    const cx = w.x + w.w / 2;
    const cz = w.y + w.h / 2;
    const base = terrainHeight(cx, cz);
    const chunks = 3 + Math.floor(rng.next() * 3);
    for (let i = 0; i < chunks; i++) {
      const s = 0.55 + rng.next() * 0.5;
      const geo = new THREE.DodecahedronGeometry(
        Math.min(w.w, w.h) * 0.62 * s + 6,
        0,
      );
      const m = new THREE.Mesh(geo, i % 2 ? matTop : mat);
      m.position.set(
        w.x + rng.next() * w.w,
        base + 6 + rng.next() * 8,
        w.y + rng.next() * w.h,
      );
      m.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
      m.scale.set(1, 0.75 + rng.next() * 0.5, 1);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  }
  return g;
}

function buildBushes(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    color: 0x3f8f46,
    transparent: true,
    opacity: 0.82,
    flatShading: true,
  });
  for (const b of BUSHES) {
    const base = terrainHeight(b.x, b.y);
    const blobs = 6 + Math.floor(rng.next() * 4);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + rng.next();
      const rr = b.r * (0.25 + rng.next() * 0.6);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r * 0.5, 0), mat);
      m.position.set(
        b.x + Math.cos(a) * rr,
        base + b.r * 0.32 + rng.next() * 3,
        b.y + Math.sin(a) * rr,
      );
      m.scale.set(1, 0.72, 1);
      m.rotation.y = rng.next() * 3;
      m.castShadow = true;
      g.add(m);
    }
  }
  return g;
}

function buildTrees(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(1.6, 2.4, 14, 5);
  const leafGeo = new THREE.ConeGeometry(9, 20, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3524, flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2c6b38, flatShading: true });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x3a7f42, flatShading: true });

  const spots: Vec2[] = [];
  for (let i = 0; i < 6000 && spots.length < 260; i++) {
    const x = rng.range(30, MAP_SIZE - 30);
    const y = rng.range(30, MAP_SIZE - 30);
    if (laneDist(x, y) < 58) continue;
    if (riverDist(x, y) < 52) continue;
    if (Math.hypot(x - NEXUS_POS[0].x, y - NEXUS_POS[0].y) < 175) continue;
    if (Math.hypot(x - NEXUS_POS[1].x, y - NEXUS_POS[1].y) < 175) continue;
    if (WALLS.some((w) => x > w.x - 16 && x < w.x + w.w + 16 && y > w.y - 16 && y < w.y + w.h + 16)) continue;
    if (BUSHES.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + 14)) continue;
    if (CAMPS.some((cm) => Math.hypot(cm.pos.x - x, cm.pos.y - y) < 46)) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < 26)) continue;
    spots.push({ x, y });
  }

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
  const leaves2 = new THREE.InstancedMesh(leafGeo, leafMat2, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();

  spots.forEach((s, i) => {
    const h = terrainHeight(s.x, s.y);
    const k = 0.8 + rng.next() * 0.7;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * 6.28);

    pv.set(s.x, h + 7 * k, s.y);
    sc.set(k, k, k);
    m4.compose(pv, q, sc);
    trunks.setMatrixAt(i, m4);

    pv.set(s.x, h + 20 * k, s.y);
    m4.compose(pv, q, sc);
    leaves.setMatrixAt(i, m4);

    pv.set(s.x, h + 29 * k, s.y);
    sc.set(k * 0.66, k * 0.7, k * 0.66);
    m4.compose(pv, q, sc);
    leaves2.setMatrixAt(i, m4);
  });

  for (const im of [trunks, leaves, leaves2]) {
    im.castShadow = true;
    im.receiveShadow = false;
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }
  return g;
}

/** Orman kamplarinin zemin isaretleri. */
function buildCampPads(): THREE.Group {
  const g = new THREE.Group();
  for (const camp of CAMPS) {
    const r = camp.epic ? 42 : 26;
    const geo = new THREE.RingGeometry(r * 0.82, r, 24);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: camp.epic === "baron" ? 0xa87dff : camp.epic ? 0xff9b4a : 0x8fd06a,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    m.position.set(camp.pos.x, terrainHeight(camp.pos.x, camp.pos.y) + 0.6, camp.pos.y);
    g.add(m);
  }
  return g;
}
