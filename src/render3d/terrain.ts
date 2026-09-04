/**
 * Harita: oyun duzenine gore uretilen yukseklik alani (koridorlar, nehir,
 * usler) + uzerine yerlestirilen **hazir 3B modeller** (agac, cali, kaya,
 * cit, ev, fener...). Modeller `public/models/` altindadir, bkz. CREDITS.md.
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
import type { PropLibrary } from "./props";

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
// Zemin boyamasinda koridor bandi daha dar tutulur ki yol net gorunsun.
const LANE_PAINT_HALF = 24;
const LANE_PAINT_FADE = 44;
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

  const edge = Math.min(x, y, MAP_SIZE - x, MAP_SIZE - y);
  if (edge < 46) h += (46 - edge) * 0.85;

  return h;
}

const C_LANE = new THREE.Color(0xa89468);
const C_GRASS = new THREE.Color(0x74a659);
const C_GRASS_DARK = new THREE.Color(0x5d8b4b);
const C_RIVER = new THREE.Color(0x5f8f9e);
const C_BASE_BLUE = new THREE.Color(0x4f86bd);
const C_BASE_RED = new THREE.Color(0xb16055);
const C_ROCK = new THREE.Color(0x9aa2ab);

/** Zemin rengi ve doku karisim agirliklari (cimen, toprak, kaya). */
function groundAt(x: number, y: number, color: THREE.Color, blend: THREE.Vector3): void {
  const dl = laneDist(x, y);
  const dr = riverDist(x, y);
  const n = noise2(x * 1.7, y * 1.7);

  const laneT = smooth(LANE_PAINT_HALF, LANE_PAINT_FADE, dl);
  const riverT = dr < RIVER_FADE ? smooth(RIVER_HALF * 0.7, RIVER_FADE, dr) : 1;
  const edge = Math.min(x, y, MAP_SIZE - x, MAP_SIZE - y);
  const edgeT = smooth(20, 52, edge);

  color.copy(C_GRASS).lerp(C_GRASS_DARK, n * 0.55);
  color.lerp(C_LANE, 1 - laneT);
  color.lerp(C_RIVER, 1 - riverT);
  for (const team of [0, 1] as const) {
    const p = NEXUS_POS[team];
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < BASE_R) {
      const t = smooth(BASE_R * 0.6, BASE_R, d);
      color.lerp(team === 0 ? C_BASE_BLUE : C_BASE_RED, (1 - t) * 0.45);
    }
  }
  color.lerp(C_ROCK, 1 - edgeT);

  const dirt = (1 - laneT) * 0.9 + (1 - riverT) * 0.5;
  const rock = (1 - edgeT) * 0.95 + (1 - riverT) * 0.3;
  const grass = Math.max(0.05, 1 - dirt - rock);
  const sum = dirt + rock + grass;
  blend.set(grass / sum, dirt / sum, rock / sum);
}

// ---------------------------------------------------------------------------
// Arazi
// ---------------------------------------------------------------------------

export interface TerrainBuild {
  group: THREE.Group;
  ground: THREE.Mesh;
  /** Hazir modellerden olusan dekor (savas sisi ayrica uygulanir). */
  decor: THREE.Group;
  visionTexture: THREE.DataTexture;
  visionData: Uint8Array;
  visionSize: number;
}

const VISION_SIZE = 96;

/** Harita dekorunda kullanilan hazir modeller. */
export const PROP_NAMES = [
  "tree-single-a", "tree-single-b",
  "trees-a-small", "trees-a-medium", "trees-a-large",
  "trees-b-small", "trees-b-medium", "trees-b-large",
  "rock-single-a", "rock-single-b", "rock-single-c", "rock-single-d", "rock-single-e",
  "mountain-a", "mountain-b", "mountain-c",
  "waterplant-a", "waterplant-b",
];

export function buildTerrain(props: PropLibrary): TerrainBuild {
  const group = new THREE.Group();
  const rng = new Rng(90210);

  // --- Zemin ---
  const SEGMENTS = 190;
  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  geo.translate(MAP_SIZE / 2, 0, MAP_SIZE / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const blends = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const b = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    groundAt(x, z, c, b);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    blends[i * 3] = b.x;
    blends[i * 3 + 1] = b.y;
    blends[i * 3 + 2] = b.z;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aBlend", new THREE.BufferAttribute(blends, 3));
  geo.computeVertexNormals();

  const visionData = new Uint8Array(VISION_SIZE * VISION_SIZE);
  const visionTexture = new THREE.DataTexture(
    visionData, VISION_SIZE, VISION_SIZE, THREE.RedFormat, THREE.UnsignedByteType,
  );
  visionTexture.minFilter = THREE.LinearFilter;
  visionTexture.magFilter = THREE.LinearFilter;
  visionTexture.needsUpdate = true;

  const mat = makeGroundMaterial(visionTexture);
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  group.add(ground);

  // --- Su yuzeyi ---
  const waterGeo = new THREE.PlaneGeometry(MAP_SIZE * 1.6, 130, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({
      color: 0x4fb0cc,
      transparent: true,
      opacity: 0.6,
      roughness: 0.15,
      metalness: 0.1,
      emissive: 0x0d3a4a,
      emissiveIntensity: 0.3,
    }),
  );
  water.position.set(MAP_SIZE / 2, -1.2, MAP_SIZE / 2);
  water.rotation.y = -Math.PI / 4;
  group.add(water);

  // --- Hazir modellerle dekor ---
  const decor = new THREE.Group();
  decor.add(buildRockWalls(props, rng));
  decor.add(buildBushClusters(props, rng));
  decor.add(buildForest(props, rng));
  decor.add(buildCamps(props, rng));
  decor.add(buildBases(props, rng));
  group.add(decor);

  return { group, ground, decor, visionTexture, visionData, visionSize: VISION_SIZE };
}

// ---------------------------------------------------------------------------
// Zemin materyali: cimen / toprak / kaya dokularini karistirir + savas sisi
// ---------------------------------------------------------------------------

function loadTiling(url: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function texBase(): string {
  const b = (import.meta.env && import.meta.env.BASE_URL) || "/";
  return b.endsWith("/") ? b : `${b}/`;
}

export function makeGroundMaterial(vision: THREE.Texture): THREE.Material {
  const base = texBase();
  const grass = loadTiling(`${base}textures/grass.webp`);
  const dirt = loadTiling(`${base}textures/dirt.webp`);
  const rock = loadTiling(`${base}textures/rock.webp`);

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = { value: grass };
    shader.uniforms.uDirt = { value: dirt };
    shader.uniforms.uRock = { value: rock };
    shader.uniforms.uVision = { value: vision };
    shader.uniforms.uMapSize = { value: MAP_SIZE };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec3 aBlend;
varying vec3 vBlend;
varying vec3 vWorldPos;`,
      )
      .replace(
        "#include <project_vertex>",
        `vBlend = aBlend;
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#include <project_vertex>`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vBlend;
varying vec3 vWorldPos;
uniform sampler2D uGrass;
uniform sampler2D uDirt;
uniform sampler2D uRock;
uniform sampler2D uVision;
uniform float uMapSize;`,
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
{
  vec2 uvA = vWorldPos.xz * 0.055;
  vec2 uvB = vWorldPos.xz * 0.033;
  vec3 tex = texture2D(uGrass, uvA).rgb * vBlend.x
           + texture2D(uDirt,  uvA).rgb * vBlend.y
           + texture2D(uRock,  uvB).rgb * vBlend.z;
  float detail = dot(tex, vec3(0.3333));
  gl_FragColor.rgb *= (0.78 + 0.48 * detail);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * tex * 2.2, 0.3);

  float vis = texture2D(uVision, vWorldPos.xz / uMapSize).r;
  gl_FragColor.rgb *= mix(0.3, 1.0, clamp(vis, 0.0, 1.0));
}`,
      );
  };
  return mat;
}

/** Model materyallerine savas sisi karartmasi uygular. */
export function applyVisionToProps(root: THREE.Object3D, vision: THREE.Texture): void {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of list) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (shader, renderer) => {
        prev?.call(mat, shader, renderer);
        shader.uniforms.uVision = { value: vision };
        shader.uniforms.uMapSize = { value: MAP_SIZE };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPosFow;")
          .replace(
            "#include <project_vertex>",
            "vWorldPosFow = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec3 vWorldPosFow;
uniform sampler2D uVision;
uniform float uMapSize;`,
          )
          .replace(
            "#include <dithering_fragment>",
            `#include <dithering_fragment>
{
  float vis = texture2D(uVision, vWorldPosFow.xz / uMapSize).r;
  gl_FragColor.rgb *= mix(0.32, 1.0, clamp(vis, 0.0, 1.0));
}`,
          );
      };
      mat.needsUpdate = true;
    }
  });
}

// ---------------------------------------------------------------------------
// Hazir modellerin yerlesimi
// ---------------------------------------------------------------------------

interface Placement {
  model: string;
  x: number;
  y: number;
  scale: number;
  rot: number;
  tiltX?: number;
  tiltZ?: number;
}

/** Yerlesimleri model bazinda gruplayip InstancedMesh'lere yazar. */
function instancePlacements(props: PropLibrary, list: Placement[]): THREE.Group {
  const g = new THREE.Group();
  const byModel = new Map<string, Placement[]>();
  for (const p of list) {
    const arr = byModel.get(p.model) ?? [];
    arr.push(p);
    byModel.set(p.model, arr);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  for (const [model, items] of byModel) {
    if (!props.has(model)) continue;
    const meshes = props.instanced(model, items.length);
    items.forEach((p, i) => {
      e.set(p.tiltX ?? 0, p.rot, p.tiltZ ?? 0, "YXZ");
      q.setFromEuler(e);
      v.set(p.x, terrainHeight(p.x, p.y) - 0.6, p.y);
      s.setScalar(p.scale);
      m4.compose(v, q, s);
      for (const im of meshes) im.setMatrixAt(i, m4);
    });
    for (const im of meshes) {
      im.count = items.length;
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      g.add(im);
    }
  }
  return g;
}

// Model gruplari (hepsi KayKit Medieval Hexagon Pack, CC0)
const BIG_TREES = ["trees-a-large", "trees-b-large"];
const MID_TREES = ["trees-a-medium", "trees-b-medium"];
const SMALL_TREES = ["trees-a-small", "trees-b-small"];
const SINGLE_TREES = ["tree-single-a", "tree-single-b"];
const ROCKS = ["rock-single-a", "rock-single-b", "rock-single-c", "rock-single-d", "rock-single-e"];
const MOUNTAINS = ["mountain-a", "mountain-b", "mountain-c"];
const WATERPLANTS = ["waterplant-a", "waterplant-b"];

/** Modeli istenen yukseklige olceklendirip yerlesim kaydi olusturur. */
function place(
  props: PropLibrary,
  model: string,
  x: number,
  y: number,
  height: number,
  rot: number,
): Placement {
  return {
    model,
    x,
    y,
    scale: height / (props.has(model) ? props.height(model) : 1),
    rot,
  };
}

/**
 * Gecilmez duvarlar: dikdortgenin uzun ekseni boyunca kaya/tepe dizisi.
 * Duvarin nerede oldugu tek bakista anlasilsin diye siralidir.
 */
function buildRockWalls(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  for (const w of WALLS) {
    const horizontal = w.w >= w.h;
    const long = horizontal ? w.w : w.h;
    const steps = Math.max(2, Math.round(long / 34));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = horizontal ? w.x + t * w.w : w.x + w.w / 2;
      const y = horizontal ? w.y + w.h / 2 : w.y + t * w.h;
      const big = i % 2 === 0;
      list.push(place(
        props,
        rng.pick(MOUNTAINS),
        x, y,
        big ? 36 : 27,
        rng.range(0, Math.PI * 2),
      ));
    }
  }
  return instancePlacements(props, list);
}

/** Calilar (gizlenme alanlari): sik kucuk agac obekleri. */
function buildBushClusters(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  for (const b of BUSHES) {
    const count = Math.max(5, Math.round((b.r * Math.PI * 2) / 22));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      list.push(place(
        props, rng.pick(SMALL_TREES),
        b.x + Math.cos(a) * b.r * 0.7,
        b.y + Math.sin(a) * b.r * 0.7,
        20, rng.range(0, Math.PI * 2),
      ));
    }
    list.push(place(props, rng.pick(SMALL_TREES), b.x, b.y, 22, rng.range(0, Math.PI * 2)));
  }
  return instancePlacements(props, list);
}

/** Orman: koridorlardan ve nehirden uzak, seyrek agac obekleri. */
function buildForest(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  const taken: Vec2[] = [];

  const free = (x: number, y: number, gap: number): boolean => {
    if (laneDist(x, y) < 62) return false;
    if (riverDist(x, y) < 52) return false;
    if (Math.hypot(x - NEXUS_POS[0].x, y - NEXUS_POS[0].y) < 178) return false;
    if (Math.hypot(x - NEXUS_POS[1].x, y - NEXUS_POS[1].y) < 178) return false;
    if (WALLS.some((w) => x > w.x - 26 && x < w.x + w.w + 26 && y > w.y - 26 && y < w.y + w.h + 26)) return false;
    if (BUSHES.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + 24)) return false;
    if (CAMPS.some((cm) => Math.hypot(cm.pos.x - x, cm.pos.y - y) < 58)) return false;
    return !taken.some((t) => Math.hypot(t.x - x, t.y - y) < gap);
  };

  for (let attempt = 0; attempt < 9000 && list.length < 110; attempt++) {
    const x = rng.range(36, MAP_SIZE - 36);
    const y = rng.range(36, MAP_SIZE - 36);
    if (!free(x, y, 52)) continue;
    taken.push({ x, y });
    const roll = rng.next();
    const model = roll < 0.4 ? rng.pick(BIG_TREES) : roll < 0.8 ? rng.pick(MID_TREES) : rng.pick(SINGLE_TREES);
    const height = roll < 0.4 ? rng.range(52, 66) : roll < 0.8 ? rng.range(40, 52) : rng.range(30, 40);
    list.push(place(props, model, x, y, height, rng.range(0, Math.PI * 2)));
  }

  // Nehir kiyisina su bitkileri
  for (let i = 0; i < 26; i++) {
    const t = rng.range(120, MAP_SIZE - 120);
    const side = rng.chance(0.5) ? 1 : -1;
    const off = side * rng.range(26, 40);
    const x = t + off * Math.SQRT1_2;
    const y = t - off * Math.SQRT1_2;
    if (x < 40 || y < 40 || x > MAP_SIZE - 40 || y > MAP_SIZE - 40) continue;
    list.push(place(props, rng.pick(WATERPLANTS), x, y, 12, rng.range(0, Math.PI * 2)));
  }

  return instancePlacements(props, list);
}

/** Orman kamplari: cevresini belirleyen kaya halkasi. */
function buildCamps(props: PropLibrary, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const list: Placement[] = [];

  for (const camp of CAMPS) {
    const r = camp.epic ? 46 : 30;
    const count = camp.epic ? 8 : 5;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      list.push(place(
        props, ROCKS[i % ROCKS.length],
        camp.pos.x + Math.cos(a) * r,
        camp.pos.y + Math.sin(a) * r,
        camp.epic ? 22 : 13,
        rng.range(0, Math.PI * 2),
      ));
    }

    // Kamp zemini
    const geo = new THREE.RingGeometry(r * 0.55, r * 0.72, 26);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: camp.epic === "baron" ? 0xa87dff : camp.epic ? 0xff9b4a : 0x8fd06a,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    m.position.set(camp.pos.x, terrainHeight(camp.pos.x, camp.pos.y) + 0.7, camp.pos.y);
    g.add(m);
  }

  g.add(instancePlacements(props, list));
  return g;
}

/** Us cevresi: takim renginde hazir koy binalari. */
function buildBases(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  for (const team of [0, 1] as const) {
    const suffix = team === 0 ? "blue" : "red";
    const n = NEXUS_POS[team];
    const face = team === 0 ? -Math.PI * 0.25 : Math.PI * 0.75;

    const ring: [string, number, number][] = [
      [`house-a-${suffix}`, 2.55, 132],
      [`house-b-${suffix}`, 1.95, 142],
      [`church-${suffix}`, 3.15, 128],
      [`market-${suffix}`, 1.35, 138],
      [`well-${suffix}`, 2.35, 96],
      [`house-a-${suffix}`, 3.75, 130],
    ];
    for (const [model, angleOff, dist] of ring) {
      const a = face + angleOff;
      const x = clamp(n.x + Math.cos(a) * dist, 58, MAP_SIZE - 58);
      const y = clamp(n.y + Math.sin(a) * dist, 58, MAP_SIZE - 58);
      list.push(place(props, model, x, y, model.startsWith("well") ? 22 : 40, a + Math.PI));
    }

    // Cikis yolunun iki yaninda kayalik
    for (let i = 0; i < 4; i++) {
      const d = 78 + i * 30;
      for (const side of [-1, 1]) {
        const a = face + side * 0.55;
        const x = clamp(n.x + Math.cos(a) * d, 48, MAP_SIZE - 48);
        const y = clamp(n.y + Math.sin(a) * d, 48, MAP_SIZE - 48);
        list.push(place(props, rng.pick(ROCKS), x, y, 14, rng.range(0, Math.PI * 2)));
      }
    }
  }
  return instancePlacements(props, list);
}
