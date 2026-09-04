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
const C_GRASS = new THREE.Color(0x6f9c58);
const C_GRASS_DARK = new THREE.Color(0x4d7742);
const C_RIVER = new THREE.Color(0x5f8f9e);
const C_BASE_BLUE = new THREE.Color(0x4f86bd);
const C_BASE_RED = new THREE.Color(0xb16055);
const C_ROCK = new THREE.Color(0x8a8f96);

/** Zemin rengi ve doku karisim agirliklari (cimen, toprak, kaya). */
function groundAt(x: number, y: number, color: THREE.Color, blend: THREE.Vector3): void {
  const dl = laneDist(x, y);
  const dr = riverDist(x, y);
  const n = noise2(x * 1.7, y * 1.7);

  const laneT = smooth(LANE_HALF, LANE_FADE, dl);
  const riverT = dr < RIVER_FADE ? smooth(RIVER_HALF * 0.7, RIVER_FADE, dr) : 1;
  const edge = Math.min(x, y, MAP_SIZE - x, MAP_SIZE - y);
  const edgeT = smooth(20, 52, edge);

  color.copy(C_GRASS).lerp(C_GRASS_DARK, n);
  color.lerp(C_LANE, 1 - laneT);
  color.lerp(C_RIVER, 1 - riverT);
  for (const team of [0, 1] as const) {
    const p = NEXUS_POS[team];
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < BASE_R) {
      const t = smooth(BASE_R * 0.6, BASE_R, d);
      color.lerp(team === 0 ? C_BASE_BLUE : C_BASE_RED, (1 - t) * 0.6);
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
  "tree-1", "tree-2", "tree-3", "tree-4", "tree-5",
  "tree-6", "tree-7", "tree-8", "tree-9", "tree-10",
  "bush-1", "bush-2", "bush-3", "bush-4",
  "rock-1", "rock-2", "rock-3", "rock-4",
  "stump", "stump-2", "log",
  "cottage", "lightpost", "well", "fence", "fence-2", "wall", "wall-arch",
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
  // Mezarlik duvarlari mor tonlu geliyor; us duvari icin tas rengine cekilir.
  if (props.has("wall")) props.tint("wall", 0x8d8b84, 0.72);
  if (props.has("wall-arch")) props.tint("wall-arch", 0x8d8b84, 0.72);
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
  gl_FragColor.rgb *= (0.55 + 1.05 * detail);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * tex * 2.1, 0.45);

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

// Model gruplari (bkz. props.html galerisi)
const LEAFY = ["tree-9", "tree-10"];
const PINE = ["bush-2", "bush-3"];
const DEAD = ["tree-1", "tree-2", "tree-3", "tree-4", "tree-5", "tree-6", "tree-7", "tree-8"];
const BUSH = ["bush-1"];
const GRASS = ["bush-4"];
const GREY_ROCK = ["rock-2", "rock-3", "rock-4"];
const RED_ROCK = ["rock-1"];

/** Modeli istenen yukseklige olceklendirip yerlesim kaydi olusturur. */
function place(
  props: PropLibrary,
  model: string,
  x: number,
  y: number,
  height: number,
  rng: Rng,
  tilt = 0,
): Placement {
  return {
    model,
    x,
    y,
    scale: height / (props.has(model) ? props.height(model) : 1),
    rot: rng.range(0, Math.PI * 2),
    tiltX: tilt ? rng.range(-tilt, tilt) : 0,
    tiltZ: tilt ? rng.range(-tilt, tilt) : 0,
  };
}

/** Gecilmez duvarlari kaya yiginlariyla doldurur. */
function buildRockWalls(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  for (const w of WALLS) {
    const long = Math.max(w.w, w.h);
    const count = Math.max(4, Math.round(long / 18));
    for (let i = 0; i < count; i++) {
      const model = rng.chance(0.18) ? rng.pick(RED_ROCK) : rng.pick(GREY_ROCK);
      list.push(place(
        props, model,
        w.x + rng.range(2, w.w - 2),
        w.y + rng.range(2, w.h - 2),
        rng.range(18, 30),
        rng, 0.1,
      ));
    }
    // Kaya siralarinin arasina birkac olu agac
    for (let i = 0; i < Math.max(1, Math.round(long / 90)); i++) {
      list.push(place(
        props, rng.pick(DEAD),
        w.x + rng.range(2, w.w - 2), w.y + rng.range(2, w.h - 2),
        rng.range(40, 60), rng, 0.05,
      ));
    }
  }
  return instancePlacements(props, list);
}

/** Calilari (gizlenme alanlari) hazir cali modelleriyle doldurur. */
function buildBushClusters(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  for (const b of BUSHES) {
    const count = 9 + Math.floor(rng.next() * 5);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.range(-0.5, 0.5);
      const rr = b.r * rng.range(0.1, 0.9);
      list.push(place(
        props, rng.pick(BUSH),
        b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr,
        rng.range(15, 23), rng,
      ));
    }
    // Kenarlara ot tutamlari
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      list.push(place(
        props, rng.pick(GRASS),
        b.x + Math.cos(a) * b.r * rng.range(0.6, 1.05),
        b.y + Math.sin(a) * b.r * rng.range(0.6, 1.05),
        rng.range(7, 12), rng,
      ));
    }
  }
  return instancePlacements(props, list);
}

/** Ormani agac modelleriyle doldurur. */
function buildForest(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  const taken: Vec2[] = [];

  const free = (x: number, y: number, gap: number): boolean => {
    if (laneDist(x, y) < 54) return false;
    if (riverDist(x, y) < 46) return false;
    if (Math.hypot(x - NEXUS_POS[0].x, y - NEXUS_POS[0].y) < 165) return false;
    if (Math.hypot(x - NEXUS_POS[1].x, y - NEXUS_POS[1].y) < 165) return false;
    if (WALLS.some((w) => x > w.x - 14 && x < w.x + w.w + 14 && y > w.y - 14 && y < w.y + w.h + 14)) return false;
    if (BUSHES.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + 14)) return false;
    if (CAMPS.some((cm) => Math.hypot(cm.pos.x - x, cm.pos.y - y) < 48)) return false;
    return !taken.some((t) => Math.hypot(t.x - x, t.y - y) < gap);
  };

  // Buyuk yaprakli agaclar
  for (let attempt = 0; attempt < 6000 && list.length < 150; attempt++) {
    const x = rng.range(30, MAP_SIZE - 30);
    const y = rng.range(30, MAP_SIZE - 30);
    if (!free(x, y, 34)) continue;
    taken.push({ x, y });
    list.push(place(props, rng.pick(LEAFY), x, y, rng.range(58, 92), rng, 0.04));
  }

  // Cam agaclari ve olu agaclar (ara dolgu)
  for (let attempt = 0; attempt < 6000 && list.length < 330; attempt++) {
    const x = rng.range(30, MAP_SIZE - 30);
    const y = rng.range(30, MAP_SIZE - 30);
    if (!free(x, y, 19)) continue;
    taken.push({ x, y });
    const pine = rng.chance(0.55);
    list.push(place(
      props, pine ? rng.pick(PINE) : rng.pick(DEAD),
      x, y,
      pine ? rng.range(34, 52) : rng.range(38, 58),
      rng, 0.05,
    ));
  }

  // Zemin detayi: kutuk, devrik agac, ot
  for (let i = 0; i < 130; i++) {
    const t = taken[Math.floor(rng.next() * taken.length)];
    if (!t) break;
    const x = t.x + rng.range(-30, 30);
    const y = t.y + rng.range(-30, 30);
    const kind = rng.next();
    if (kind < 0.25) list.push(place(props, rng.pick(["stump", "stump-2"]), x, y, rng.range(8, 13), rng));
    else if (kind < 0.4) list.push(place(props, "log", x, y, rng.range(7, 11), rng));
    else list.push(place(props, rng.pick(GRASS), x, y, rng.range(6, 11), rng));
  }

  return instancePlacements(props, list);
}

/** Orman kamplarinin cevresini isaretler. */
function buildCamps(props: PropLibrary, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const list: Placement[] = [];

  for (const camp of CAMPS) {
    const r = camp.epic ? 48 : 32;
    const count = camp.epic ? 9 : 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const x = camp.pos.x + Math.cos(a) * r;
      const y = camp.pos.y + Math.sin(a) * r;
      if (camp.epic) {
        list.push(place(props, rng.pick(RED_ROCK.concat(GREY_ROCK)), x, y, rng.range(22, 34), rng, 0.1));
      } else {
        list.push(place(props, rng.pick(GREY_ROCK), x, y, rng.range(11, 17), rng, 0.1));
      }
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

/** Uslerin cevresine ev, fener, kuyu ve cit yerlestirir. */
function buildBases(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  for (const team of [0, 1] as const) {
    const n = NEXUS_POS[team];
    // Us disa dogru baktigi icin dekor yarim daireye yayilir
    const face = team === 0 ? -Math.PI * 0.25 : Math.PI * 0.75;

    // Evler
    for (let i = 0; i < 3; i++) {
      const a = face + Math.PI + (i - 1) * 0.72;
      const x = clamp(n.x + Math.cos(a) * 96, 62, MAP_SIZE - 62);
      const y = clamp(n.y + Math.sin(a) * 96, 62, MAP_SIZE - 62);
      const pl = place(props, "cottage", x, y, 52, rng);
      pl.rot = a + Math.PI;
      list.push(pl);
    }
    // Kuyu
    list.push(place(props, "well", n.x + Math.cos(face + 2.4) * 62, n.y + Math.sin(face + 2.4) * 62, 30, rng));
    // Fenerler: cikis yolunun iki yani
    for (let i = 0; i < 5; i++) {
      const d = 58 + i * 26;
      for (const side of [-1, 1]) {
        const a = face + side * (0.42 - i * 0.045);
        const x = clamp(n.x + Math.cos(a) * d, 46, MAP_SIZE - 46);
        const y = clamp(n.y + Math.sin(a) * d, 46, MAP_SIZE - 46);
        list.push(place(props, "lightpost", x, y, 26, rng));
      }
    }
    // Us cevresini saran tas duvar (harita disina tasmaz)
    for (let i = 0; i < 14; i++) {
      const a = face + Math.PI * 0.45 + (i / 13) * Math.PI * 1.1;
      const d = 104;
      const x = n.x + Math.cos(a) * d;
      const y = n.y + Math.sin(a) * d;
      if (x < 52 || x > MAP_SIZE - 52 || y < 52 || y > MAP_SIZE - 52) continue;
      const pl = place(props, i === 7 ? "wall-arch" : "wall", x, y, 24, rng);
      pl.rot = a + Math.PI / 2;
      pl.tiltX = 0;
      pl.tiltZ = 0;
      list.push(pl);
    }
    // Cit parcalari
    for (let i = 0; i < 8; i++) {
      const a = face + Math.PI + rng.range(-1.1, 1.1);
      const d = rng.range(70, 100);
      const x = clamp(n.x + Math.cos(a) * d, 52, MAP_SIZE - 52);
      const y = clamp(n.y + Math.sin(a) * d, 52, MAP_SIZE - 52);
      const pl = place(props, rng.pick(["fence", "fence-2"]), x, y, 16, rng);
      pl.rot = a + Math.PI / 2;
      list.push(pl);
    }
  }
  return instancePlacements(props, list);
}
