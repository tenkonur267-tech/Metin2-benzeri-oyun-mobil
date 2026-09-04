/**
 * Harita: oyun duzenine gore uretilen yukseklik alani (koridorlar, nehir,
 * usler) + uzerine yerlestirilen **hazir 3B modeller** (agac, cali, kaya,
 * cit, ev, fener...). Modeller `public/models/` altindadir, bkz. CREDITS.md.
 */
import * as THREE from "three";
import { BORDER } from "../game/grid";
import { closestPointOnSegment, clamp, type Vec2 } from "../core/math";
import { Rng } from "../core/rng";
import {
  BUSHES,
  CAMPS,
  LANES,
  LAYOUT_SCALE,
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

/**
 * Arazi genislikleri harita boyutuyla birlikte olceklenir; boylece harita
 * buyudugunde koridorlar da genisler ve oran korunur.
 */
const K = LAYOUT_SCALE;
const LANE_HALF = 30 * K;
const LANE_FADE = 62 * K;
// Zemin boyamasinda koridor bandi daha dar tutulur ki yol net gorunsun.
const LANE_PAINT_HALF = 24 * K;
const LANE_PAINT_FADE = 44 * K;
const RIVER_HALF = 30 * K;
const RIVER_FADE = 58 * K;
const BASE_R = 135 * K;
/** Harita kenarindaki kayalik bant. */
const EDGE_BAND = 46 * K;

/**
 * Bir noktanin duvar dikdortgeninin ne kadar icinde oldugu (disarida 0).
 *
 * League of Legends'da orman duvarlari yigin kaya degil, uzerine agac
 * cikmis kayalik yukseltilerdir; burada da duvarlar arazinin kendisini
 * yukselterek olusturulur.
 */
export function wallDepth(x: number, y: number): number {
  let best = 0;
  for (const w of WALLS) {
    const dx = Math.max(w.x - x, x - (w.x + w.w));
    const dy = Math.max(w.y - y, y - (w.y + w.h));
    const inside = -Math.max(dx, dy);
    if (inside > best) best = inside;
  }
  return best;
}

/** Duvar kayaliginin yuksekligi ve kenar egiminin genisligi. */
const WALL_HEIGHT = 34;
const WALL_SLOPE = 26;

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

  // Harita kenari: disari dogru hizla yukselen kayalik sur.
  const edge = Math.min(x, y, MAP_SIZE - x, MAP_SIZE - y);
  if (edge < EDGE_BAND) h += 52 * smooth(EDGE_BAND, EDGE_BAND * 0.12, edge);

  // Gecilmez duvarlar: dikdortgenin kendi sinirindan iceri dogru yukselir,
  // boylece disarida yuruyen birimler zemin seviyesinde kalir.
  const wd = wallDepth(x, y);
  if (wd > 0) h += WALL_HEIGHT * smooth(0, WALL_SLOPE, wd);

  return h;
}

const C_LANE = new THREE.Color(0xa89468);
const C_GRASS = new THREE.Color(0x74a659);
const C_GRASS_DARK = new THREE.Color(0x5d8b4b);
const C_RIVER = new THREE.Color(0x5f8f9e);
const C_BASE_BLUE = new THREE.Color(0x4f86bd);
const C_BASE_RED = new THREE.Color(0xb16055);
const C_ROCK = new THREE.Color(0x9aa2ab);
const C_WALL = new THREE.Color(0x7f868f);

/** Zemin rengi ve doku karisim agirliklari (cimen, toprak, kaya). */
function groundAt(x: number, y: number, color: THREE.Color, blend: THREE.Vector3): void {
  const dl = laneDist(x, y);
  const dr = riverDist(x, y);
  const n = noise2(x * 1.7, y * 1.7);

  const laneT = smooth(LANE_PAINT_HALF, LANE_PAINT_FADE, dl);
  const riverT = dr < RIVER_FADE ? smooth(RIVER_HALF * 0.7, RIVER_FADE, dr) : 1;
  const edge = Math.min(x, y, MAP_SIZE - x, MAP_SIZE - y);
  const edgeT = smooth(20 * K, 52 * K, edge);

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

  // Duvar kayaligi
  const wallT = smooth(-8, WALL_SLOPE * 0.8, wallDepth(x, y));
  color.lerp(C_WALL, wallT);

  const dirt = (1 - laneT) * 0.9 + (1 - riverT) * 0.5;
  const rock = (1 - edgeT) * 0.95 + (1 - riverT) * 0.3 + wallT * 1.4;
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
  /** Nehir materyali; her karede `uTime` guncellenir. */
  water: THREE.ShaderMaterial;
  mist: THREE.ShaderMaterial;
  /** Orman sisi katmani (dusuk kalitede gizlenir). */
  mistMesh: THREE.Mesh;
  /** Hazir modellerden olusan dekor (savas sisi ayrica uygulanir). */
  decor: THREE.Group;
  visionTexture: THREE.DataTexture;
  visionData: Uint8Array;
  visionSize: number;
}

const VISION_SIZE = 128;

/** Harita dekorunda kullanilan hazir modeller. */
export const PROP_NAMES = [
  // Igne yaprakli obekler (KayKit)
  "trees-a-small", "trees-a-medium", "trees-a-large",
  "trees-b-small", "trees-b-medium", "trees-b-large",
  "tree-single-a", "tree-single-b",
  // Genis yaprakli agaclar ve calilar (Kenney Nature Kit)
  "nat-tree-a", "nat-tree-b", "nat-tree-c", "nat-tree-d", "nat-tree-e", "nat-tree-f",
  "nat-bush-a", "nat-bush-b", "nat-bush-c",
  "nat-grass-a", "nat-grass-b", "nat-grass-c",
  "nat-lily-a", "nat-lily-b", "nat-pebble-a", "nat-pebble-b",
  "nat-rock-a", "nat-rock-b", "nat-stump", "nat-log",
  // Kayalar ve tepeler
  "rock-single-a", "rock-single-b", "rock-single-c", "rock-single-d", "rock-single-e",
  "mountain-a", "mountain-b", "mountain-c",
];

/**
 * Kenney doga modelleri nane yesili / seftali paletiyle geliyor.
 * Oyunun geri kalanina uymasi icin yaprak, govde ve kaya renkleri
 * yeniden boyanir.
 */
const NATURE_PALETTE: Record<string, number> = {
  leafsGreen: 0x39743f,
  leafsDark: 0x25552c,
  colorRed: 0xb8506a,
  leafsFall: 0xb8622c,
  grass: 0x3f7a44,
  woodBark: 0x5f452e,
  wood: 0x5f452e,
  dirt: 0x8b9199,
  stone: 0x8b9199,
  rock: 0x8b9199,
};

/**
 * Kaya modellerinde ustteki "grass" yuzeyi duz yesil bir kapak gibi
 * gorunuyor; kayalarda yosunumsu gri-yesile cekilir.
 */
const ROCK_PALETTE: Record<string, number> = {
  grass: 0x77836b,
  dirt: 0x8b9199,
  stone: 0x8b9199,
  rock: 0x8b9199,
};

/**
 * KayKit kaya ve tepe modelleri tek bir "hexagons_medieval" dokusuyla
 * geliyor ve ekranda bembeyaz duruyordu; ormana uygun koyu gri-kahve
 * bir kayaya cekilir.
 */
const STONE_PALETTE: Record<string, number> = {
  hexagons_medieval: 0x8b9088,
};

/** Yapraga gore boyanacak modeller. */
const NATURE_MODELS = PROP_NAMES.filter((n) => n.startsWith("nat-"));

/** Kaya paletiyle boyanacak modeller. */
const NATURE_ROCKS = ["nat-rock-a", "nat-rock-b"];

/**
 * Nehir kiyisindaki cakillar: islak tas gibi koyu ve mat olmali,
 * genel kaya grisi kullanilirsa beyaz levhalar gibi duruyorlar.
 */
const PEBBLE_PALETTE: Record<string, number> = { stone: 0x5f6a6b, rock: 0x5f6a6b };

/** Tas paletiyle boyanacak KayKit modelleri. */
const STONE_MODELS = [
  "rock-single-a", "rock-single-b", "rock-single-c", "rock-single-d", "rock-single-e",
  "mountain-a", "mountain-b", "mountain-c",
];

export function buildTerrain(props: PropLibrary): TerrainBuild {
  const group = new THREE.Group();
  const rng = new Rng(90210);

  // --- Zemin ---
  const SEGMENTS = Math.round(150 * Math.sqrt(K));
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

  // --- Nehir ---
  const waterMat = makeWaterMaterial();
  // Kosegen boyu: kare haritayi tam kat eder, disari tasmaz
  const waterGeo = new THREE.PlaneGeometry(MAP_SIZE * Math.SQRT2, 132 * K, 48, 8);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.set(MAP_SIZE / 2, -1.0, MAP_SIZE / 2);
  water.rotation.y = -Math.PI / 4;
  water.renderOrder = 1;
  group.add(water);

  // --- Hazir modellerle dekor ---
  for (const name of NATURE_MODELS) {
    if (props.has(name)) props.recolor(name, NATURE_PALETTE);
  }
  for (const name of NATURE_ROCKS) {
    if (props.has(name)) props.recolor(name, ROCK_PALETTE);
  }
  for (const name of STONE_MODELS) {
    if (props.has(name)) props.recolor(name, STONE_PALETTE);
  }
  for (const name of PEBBLE_MODELS) {
    if (props.has(name)) props.recolor(name, PEBBLE_PALETTE);
  }
  const mist = buildMist();
  group.add(mist.mesh);

  const decor = new THREE.Group();
  decor.add(buildJungleWalls(props, rng));
  decor.add(buildBorderWall(props, rng));
  decor.add(buildBushClusters(props, rng));
  decor.add(buildForest(props, rng));
  decor.add(buildCamps(props, rng));
  decor.add(buildBases(props, rng));
  group.add(decor);

  return {
    group, ground, decor,
    water: waterMat, mist: mist.material, mistMesh: mist.mesh,
    visionTexture, visionData, visionSize: VISION_SIZE,
  };
}

/**
 * Nehir yuzeyi.
 *
 * League of Legends'daki nehir gibi: akis yonunde kayan iki dalga katmani,
 * kenarlarda kopuk seridi ve derinlige gore koyulasan turkuaz bir renk.
 * Zemin altta gorunmeye devam etsin diye yari saydamdir.
 */
/**
 * Orman sisi.
 *
 * Koridorlardan ve uslerden uzakta, zemine yakin suzulen ince bir sis
 * tabakasi. Yogunlugu CPU'da her koseye yazilir (koridorda 0, ormanin
 * icinde 1); kayma ve kabarma shader'da yapilir.
 */
function buildMist(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const SEG = 110;
  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  geo.translate(MAP_SIZE / 2, 0, MAP_SIZE / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const amount = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Koridorlarda ve nehirde acilir, ormanda yogunlasir
    let a = smooth(LANE_HALF * 1.15, LANE_FADE * 1.5, laneDist(x, z));
    a *= smooth(RIVER_HALF * 0.9, RIVER_FADE * 1.2, riverDist(x, z));
    for (const team of [0, 1] as const) {
      const n = NEXUS_POS[team];
      a *= smooth(BASE_R * 0.8, BASE_R * 1.35, Math.hypot(x - n.x, z - n.y));
    }
    // Duvarlarin tepesinde sis birikmez
    a *= 1 - smooth(0, WALL_SLOPE, wallDepth(x, z));
    amount[i] = a;
    pos.setY(i, terrainHeight(x, z) + 6);
  }
  geo.setAttribute("aMist", new THREE.BufferAttribute(amount, 1));
  geo.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xb6cbdb) },
    },
    vertexShader: `
      attribute float aMist;
      varying float vMist;
      varying vec3 vWorld;
      void main() {
        vMist = aMist;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying float vMist;
      varying vec3 vWorld;

      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x),
                   mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        if (vMist < 0.01) discard;
        vec2 p = vWorld.xz;
        // Iki yonde kayan bulut katmani
        float a = n2(p * 0.010 + vec2(uTime * 0.013, uTime * 0.008));
        float b = n2(p * 0.026 - vec2(uTime * 0.021, uTime * 0.011));
        float f = a * 0.65 + b * 0.35;
        f = smoothstep(0.24, 0.78, f);
        float alpha = vMist * f * 0.52;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { mesh, material };
}

export function makeWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x76b6ad) },
      uDeep: { value: new THREE.Color(0x275c66) },
      uFoam: { value: new THREE.Color(0xcfe3e2) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;

      // Ucuz deger gurultusu
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        // Kiyiya uzaklik: 0 = orta, 1 = kenar
        float bank = abs(vUv.y - 0.5) * 2.0;

        // Akis yonunde kayan iki dalga katmani
        vec2 flow = vec2(vUv.x * 60.0, vUv.y * 6.0);
        float w1 = noise(flow + vec2(uTime * 0.55, 0.0));
        float w2 = noise(flow * 1.9 - vec2(uTime * 0.31, uTime * 0.08));
        float ripple = w1 * 0.6 + w2 * 0.4;

        // Derinlige gore renk
        // Derinlik gecisi: ortada koyu, kiyiya dogru acilir
        vec3 col = mix(uDeep, uShallow, smoothstep(0.05, 1.0, bank) * 0.85 + ripple * 0.18);

        // Kiyi kopugu: yalniz en kenarda, yumusak ve sessiz
        float foam = smoothstep(0.86, 1.0, bank + ripple * 0.1);
        float foamPulse = 0.72 + 0.28 * sin(uTime * 1.1 + vUv.x * 26.0);
        col = mix(col, uFoam, foam * foamPulse * 0.75);

        // Yuzeydeki isik kirilmasi: dar ve seyrek parlamalar
        col += vec3(0.06, 0.08, 0.09) * smoothstep(0.80, 0.99, ripple);

        float alpha = mix(0.90, 0.55, smoothstep(0.45, 1.0, bank));
        // Nehrin uclari harita kosesinde yumusakca biter
        alpha *= smoothstep(0.0, 0.035, vUv.x) * smoothstep(1.0, 0.965, vUv.x);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
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

/**
 * Savas sisi zamani.
 *
 * Sisin suzulmesi icin zemin ve model materyalleri ayni uniform'u
 * paylasir; her karede `world3d` bir kez gunceller.
 */
export const fowTime = { value: 0 };

/** Savas sisi: gorulmeyen yerler karartilmaz, sisle ortulur. */
const FOW_GLSL = `
float fowHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float fowNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(fowHash(i), fowHash(i + vec2(1.0, 0.0)), u.x),
    mix(fowHash(i + vec2(0.0, 1.0)), fowHash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
vec3 applyFow(vec3 col, float vis, vec2 world, float t) {
  float hidden = 1.0 - clamp(vis, 0.0, 1.0);
  // Iki katman suzulen sis: yogunlugu yavasca degisir
  float n = fowNoise(world * 0.012 + vec2(t * 0.011, t * -0.007)) * 0.6
          + fowNoise(world * 0.031 - vec2(t * 0.017, t * 0.013)) * 0.4;
  vec3 mist = vec3(0.34, 0.42, 0.52) * (0.72 + 0.55 * n);
  // Sis yalnizca hic gorulmemis bolgelerde yogunlasir; bir kez
  // kesfedilen yer neredeyse tamamen acik kalir.
  float thick = hidden * hidden;
  vec3 dark = col * mix(1.0, 0.5, hidden);
  return mix(dark, mist, thick * 0.92);
}
`;

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
    shader.uniforms.uTime = fowTime;

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
uniform float uMapSize;
uniform float uTime;
${FOW_GLSL}`,
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
  gl_FragColor.rgb = applyFow(gl_FragColor.rgb, vis, vWorldPos.xz, uTime);
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
        shader.uniforms.uTime = fowTime;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPosFow;")
          .replace(
            "#include <project_vertex>",
            // Dekor nesneleri InstancedMesh; `instanceMatrix` uygulanmazsa
            // her kopya sisi model yerelinde, yani haritanin kosesinde
            // ornekliyordu. Bu yuzden agaclarin ve kayalarin uzerindeki
            // sis karakter yaklassa da kalkmiyordu.
            `vec4 fowPos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  fowPos = instanceMatrix * fowPos;
#endif
vWorldPosFow = (modelMatrix * fowPos).xyz;
#include <project_vertex>`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec3 vWorldPosFow;
uniform sampler2D uVision;
uniform float uMapSize;
uniform float uTime;
${FOW_GLSL}`,
          )
          .replace(
            "#include <dithering_fragment>",
            `#include <dithering_fragment>
{
  float vis = texture2D(uVision, vWorldPosFow.xz / uMapSize).r;
  gl_FragColor.rgb = applyFow(gl_FragColor.rgb, vis, vWorldPosFow.xz, uTime);
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
  /** Yalniz dikey olcek (duvar bloklarini uzatmak icin). */
  scaleY?: number;
  rot: number;
  tiltX?: number;
  tiltZ?: number;
}

/** Harita kac parcaya bolunerek cizilecek (gorus alani disi elenebilsin diye). */
const CHUNKS = 6;

/**
 * Yerlesimleri model ve harita parcasina gore gruplayip InstancedMesh'lere
 * yazar.
 *
 * Tum agaclar tek bir InstancedMesh'te olsaydi kutusu haritanin tamamini
 * kaplar ve ekran disindakiler de her karede cizilirdi. Harita parcalara
 * bolununce kamera disinda kalan parcalar tamamen elenir.
 */
function instancePlacements(props: PropLibrary, list: Placement[]): THREE.Group {
  const g = new THREE.Group();
  const cell = MAP_SIZE / CHUNKS;
  const groups = new Map<string, Placement[]>();

  for (const p of list) {
    const cx = clamp(Math.floor(p.x / cell), 0, CHUNKS - 1);
    const cy = clamp(Math.floor(p.y / cell), 0, CHUNKS - 1);
    const key = `${p.model}|${cx}|${cy}`;
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sv = new THREE.Vector3();

  for (const [key, items] of groups) {
    const model = key.slice(0, key.indexOf("|"));
    if (!props.has(model)) continue;
    const meshes = props.instanced(model, items.length);
    items.forEach((p, i) => {
      e.set(p.tiltX ?? 0, p.rot, p.tiltZ ?? 0, "YXZ");
      q.setFromEuler(e);
      v.set(p.x, terrainHeight(p.x, p.y) - 0.6, p.y);
      sv.set(p.scale, p.scaleY ?? p.scale, p.scale);
      m4.compose(v, q, sv);
      for (const im of meshes) im.setMatrixAt(i, m4);
    });
    for (const im of meshes) {
      im.count = items.length;
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = true;
      im.computeBoundingSphere();
      g.add(im);
    }
  }
  return g;
}

// Model gruplari
/** Genis yaprakli tekil agaclar — ormanin ana dokusu. */
const BROADLEAF = ["nat-tree-a", "nat-tree-b", "nat-tree-c", "nat-tree-d", "nat-tree-f"];
/** Ince ve uzun agaclar. */
const TALL_TREES = ["nat-tree-e", "nat-tree-f"];
/** Igne yaprakli obekler — arka planda kalabalik yapar. */
const CONIFER_CLUMPS = ["trees-a-large", "trees-b-large", "trees-a-medium", "trees-b-medium"];
/** Cali obekleri (gizlenme alanlari). */
const BUSHES_MODELS = ["nat-bush-a", "nat-bush-b", "nat-bush-c"];
/**
 * Zemin ortusu.
 *
 * Onceki modeller (Kenney `grass_leafs` / `grass_large`) yassi ve parlak
 * yaprak levhalariydi, cimenin uzerinde oyuncak gibi duruyordu. Yerine
 * gercek ot tutami ve alcak yaprak bitkileri kullaniliyor.
 */
const GRASS_MODELS = ["nat-grass-a", "nat-grass-b", "nat-grass-c"];
/** Nehir kiyisindaki nilufer yapraklari ve cakil taslari. */
const LILY_MODELS = ["nat-lily-a", "nat-lily-b"];
const PEBBLE_MODELS = ["nat-pebble-a", "nat-pebble-b"];
const ROCKS = ["rock-single-a", "rock-single-b", "rock-single-c", "rock-single-d", "rock-single-e", "nat-rock-a", "nat-rock-b"];
const MOUNTAINS = ["mountain-a", "mountain-b", "mountain-c"];
/**
 * Duvar eteklerini olusturan kaya bloklari.
 *
 * Sadece kabaca kup oranli dag modelleri kullanilir; `rock-single-a`
 * gibi yassi ve cok genis kayalar istenen yuksekluge olceklendiginde
 * dev bir levha gibi yayiliyor ve gecilmez sinirin icine tasiyordu.
 */
const CLIFF_BLOCKS = ["mountain-a", "mountain-b", "mountain-c"];

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
 * Gecilmez orman duvarlari.
 *
 * League of Legends / Mobile Legends'daki gibi: duvarin kenari boyunca
 * kesintisiz bir kayalik yuz, tepesinde ise yesillik. Duvarin kendisi
 * arazi yuksekligiyle olusur (bkz. `terrainHeight`); burada duvarin
 * silueti kayalik bloklarla netlestirilir.
 */
function buildJungleWalls(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  /** Kayalik bloklarin genisligi; bu adimla dizilince yan yana kapanir. */
  const FACE = 19;

  for (const w of WALLS) {
    // --- Kenar yuzu: dikdortgenin cevresini blok blok dolas ---
    const inset = 12;
    const x0 = w.x + inset;
    const y0 = w.y + inset;
    const x1 = w.x + w.w - inset;
    const y1 = w.y + w.h - inset;
    const nx = Math.max(1, Math.round((x1 - x0) / FACE));
    const ny = Math.max(1, Math.round((y1 - y0) / FACE));

    const edge: Vec2[] = [];
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      edge.push({ x, y: y0 }, { x, y: y1 });
    }
    for (let j = 1; j < ny; j++) {
      const y = y0 + ((y1 - y0) * j) / ny;
      edge.push({ x: x0, y }, { x: x1, y });
    }

    for (const e of edge) {
      list.push(place(
        props, rng.pick(CLIFF_BLOCKS),
        e.x + rng.range(-3, 3), e.y + rng.range(-3, 3),
        rng.range(19, 27), rng.range(0, Math.PI * 2),
      ));
    }

    // --- Ust yuzey: kayalik kapak + sik yesillik ---
    const STEP = 34;
    const mx = Math.max(1, Math.round(w.w / STEP));
    const my = Math.max(1, Math.round(w.h / STEP));
    for (let i = 0; i <= mx; i++) {
      for (let j = 0; j <= my; j++) {
        const x = w.x + (i / mx) * w.w + rng.range(-6, 6);
        const y = w.y + (j / my) * w.h + rng.range(-6, 6);
        if (wallDepth(x, y) < WALL_SLOPE * 0.75) continue;
        const roll = rng.next();
        if (roll < 0.42) {
          list.push(place(props, rng.pick(BROADLEAF), x, y, rng.range(42, 56), rng.range(0, Math.PI * 2)));
        } else if (roll < 0.66) {
          list.push(place(props, rng.pick(CONIFER_CLUMPS), x, y, rng.range(38, 50), rng.range(0, Math.PI * 2)));
        } else {
          list.push(place(props, rng.pick(BUSHES_MODELS), x, y, rng.range(12, 18), rng.range(0, Math.PI * 2)));
        }
      }
    }
  }
  return instancePlacements(props, list);
}

/**
 * Haritanin dis siniri.
 *
 * Oyun alaninin bittigi yer, arazinin yukselen kenar bandiyla
 * olusur; burada o bant kayalik ve sik ignelik ormanla kaplanarak
 * MOBA haritalarindaki gibi kapali bir cerceve haline getirilir.
 */
function buildBorderWall(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];

  /** Kenardan `inset` kadar iceride, harita cevresini dolasan noktalar. */
  const ring = (inset: number, step: number, jitter: number): Vec2[] => {
    const out: Vec2[] = [];
    const a = inset;
    const b = MAP_SIZE - inset;
    const n = Math.max(2, Math.round((b - a) / step));
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      const j = (): number => rng.range(-jitter, jitter);
      out.push({ x: t, y: a + j() }, { x: t, y: b + j() }, { x: a + j(), y: t }, { x: b + j(), y: t });
    }
    return out;
  };

  // Ic etek: oyun alanina bakan kesintisiz kaya sirti.
  //
  // Her kaya, kendi genisligi kadar disari itilir; boylece kayanin ic
  // yuzu yurumenin durdugu `BORDER` cizgisiyle cakisir ve karakter
  // kayanin icine girmis gibi gorunmez.
  for (const p of ring(BORDER, 20, 0)) {
    const model = rng.pick(CLIFF_BLOCKS);
    const h = rng.range(26, 36);
    const push = props.footprint(model, h);
    // Kenardan uzaklasmak = harita disina dogru gitmek
    const ox = p.x < MAP_SIZE / 2 ? -push : p.x > MAP_SIZE / 2 ? push : 0;
    const oy = p.y < MAP_SIZE / 2 ? -push : p.y > MAP_SIZE / 2 ? push : 0;
    const onX = Math.min(p.x, MAP_SIZE - p.x) < Math.min(p.y, MAP_SIZE - p.y);
    list.push(place(
      props, model,
      p.x + (onX ? ox : 0),
      p.y + (onX ? 0 : oy),
      h, rng.range(0, Math.PI * 2),
    ));
  }
  // Sirtin uzerinde ve arkasinda koyu ignelik orman
  for (const p of ring(BORDER * 0.28, 26, 6)) {
    list.push(place(props, rng.pick(CONIFER_CLUMPS), p.x, p.y, rng.range(44, 58), rng.range(0, Math.PI * 2)));
  }
  for (const p of ring(BORDER * 0.02, 30, 8)) {
    if (rng.chance(0.8)) {
      list.push(place(props, rng.pick(CONIFER_CLUMPS), p.x, p.y, rng.range(42, 56), rng.range(0, Math.PI * 2)));
    }
  }
  // En distaki kayalar siluetı kapatir
  for (const p of ring(-6, 28, 6)) {
    list.push(place(props, rng.pick(CLIFF_BLOCKS), p.x, p.y, rng.range(30, 46), rng.range(0, Math.PI * 2)));
  }
  return instancePlacements(props, list);
}

/**
 * Calilar (gizlenme alanlari): League of Legends'daki gibi sik, alcak ve
 * koyu yesil cali obekleri. Alan icini tamamen doldurur ki icine girildigi
 * belli olsun.
 */
function buildBushClusters(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  for (const b of BUSHES) {
    // Ic ice iki halka + merkez
    for (const [ring, frac] of [[1, 0.94], [2, 0.66], [3, 0.34]] as const) {
      const count = Math.max(5, Math.round((b.r * frac * Math.PI * 2) / 15));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ring * 0.4;
        list.push(place(
          props, rng.pick(BUSHES_MODELS),
          b.x + Math.cos(a) * b.r * frac,
          b.y + Math.sin(a) * b.r * frac,
          rng.range(13, 18), rng.range(0, Math.PI * 2),
        ));
      }
    }
    for (let i = 0; i < 3; i++) {
      list.push(place(
        props, rng.pick(BUSHES_MODELS),
        b.x + rng.range(-b.r * 0.3, b.r * 0.3),
        b.y + rng.range(-b.r * 0.3, b.r * 0.3),
        rng.range(14, 19), rng.range(0, Math.PI * 2),
      ));
    }
  }
  return instancePlacements(props, list);
}

/**
 * Orman.
 *
 * Agaclar tek tek dagitilmaz; once obek merkezleri secilir, sonra her
 * obek kendi agac turuyle doldurulur. Boylece koridorlar arasinda
 * MOBA haritalarindaki gibi sik ve okunakli agaclik olusur.
 */
function buildForest(props: PropLibrary, rng: Rng): THREE.Group {
  const list: Placement[] = [];
  const taken: Vec2[] = [];

  const free = (x: number, y: number, gap: number): boolean => {
    if (x < EDGE_BAND * 1.15 || y < EDGE_BAND * 1.15) return false;
    if (x > MAP_SIZE - EDGE_BAND * 1.15 || y > MAP_SIZE - EDGE_BAND * 1.15) return false;
    if (laneDist(x, y) < 58 * K) return false;
    if (riverDist(x, y) < 50 * K) return false;
    if (Math.hypot(x - NEXUS_POS[0].x, y - NEXUS_POS[0].y) < 178 * K) return false;
    if (Math.hypot(x - NEXUS_POS[1].x, y - NEXUS_POS[1].y) < 178 * K) return false;
    if (WALLS.some((w) => x > w.x - 22 && x < w.x + w.w + 22 && y > w.y - 22 && y < w.y + w.h + 22)) return false;
    if (BUSHES.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + 22)) return false;
    if (CAMPS.some((cm) => Math.hypot(cm.pos.x - x, cm.pos.y - y) < 54 * K)) return false;
    return !taken.some((t) => Math.hypot(t.x - x, t.y - y) < gap);
  };

  // --- Obek merkezleri ---
  const groveCount = Math.round(30 * K * K);
  const groves: Vec2[] = [];
  for (let a = 0; a < groveCount * 140 && groves.length < groveCount; a++) {
    const x = rng.range(0, MAP_SIZE);
    const y = rng.range(0, MAP_SIZE);
    if (!free(x, y, 132)) continue;
    taken.push({ x, y });
    groves.push({ x, y });
  }

  for (const g of groves) {
    // Her obek tek bir agac ailesinden; siluet boylece toparli kalir.
    const roll = rng.next();
    const family = roll < 0.46 ? BROADLEAF : roll < 0.72 ? CONIFER_CLUMPS : TALL_TREES;
    const tall = family === TALL_TREES;
    const radius = rng.range(46, 82);
    const want = Math.round(rng.range(4, 8));

    for (let i = 0, tries = 0; i < want && tries < want * 30; tries++) {
      const a = rng.range(0, Math.PI * 2);
      // Merkeze dogru yogunlasan dagilim
      const d = radius * Math.sqrt(rng.next()) * 0.95;
      const x = g.x + Math.cos(a) * d;
      const y = g.y + Math.sin(a) * d;
      if (!free(x, y, 30)) continue;
      taken.push({ x, y });
      i++;
      const h = tall ? rng.range(58, 80) : rng.range(44, 66);
      list.push(place(props, rng.pick(family), x, y, h, rng.range(0, Math.PI * 2)));
    }

    // Obek eteginde alcak bitki ortusu.
    // Yurunen zeminde kaya/kutuk yok: icinden gecilen kati nesne izlenimi
    // vermesinler diye sadece ot ve alcak cali kullanilir.
    const under = Math.round(rng.range(2, 5));
    for (let i = 0; i < under; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = radius * rng.range(0.5, 1.1);
      const x = g.x + Math.cos(a) * d;
      const y = g.y + Math.sin(a) * d;
      if (!free(x, y, 22)) continue;
      taken.push({ x, y });
      list.push(place(
        props,
        rng.chance(0.6) ? rng.pick(GRASS_MODELS) : rng.pick(BUSHES_MODELS),
        x, y, rng.range(7, 13), rng.range(0, Math.PI * 2),
      ));
    }
  }

  // --- Obekler arasinda tek tuk agac (bosluklari doldurur) ---
  const loose = Math.round(20 * K * K);
  for (let a = 0; a < loose * 60 && a < 40000; a++) {
    const x = rng.range(0, MAP_SIZE);
    const y = rng.range(0, MAP_SIZE);
    if (!free(x, y, 58)) continue;
    taken.push({ x, y });
    list.push(place(props, rng.pick(BROADLEAF), x, y, rng.range(46, 64), rng.range(0, Math.PI * 2)));
  }

  // --- Nehir: suyun uzerinde nilufer, kiyisinda cakil ---
  for (let i = 0; i < Math.round(22 * K); i++) {
    const t = rng.range(120 * K, MAP_SIZE - 120 * K);
    const side = rng.chance(0.5) ? 1 : -1;
    const onWater = rng.chance(0.55);
    // `off` dogrudan nehir merkezine olan uzakliktir (bkz. riverDist).
    // Nilufer su icinde, cakil kiyinin disinda kalmali.
    const off = side * (onWater ? rng.range(14, 72) : rng.range(88, 112));
    const x = t + off * Math.SQRT1_2;
    const y = t - off * Math.SQRT1_2;
    if (x < 40 || y < 40 || x > MAP_SIZE - 40 || y > MAP_SIZE - 40) continue;
    if (onWater) {
      // Nilufer yapragi su yuzeyine yatar
      list.push(place(props, rng.pick(LILY_MODELS), x, y, rng.range(3.5, 6), rng.range(0, Math.PI * 2)));
    } else {
      list.push(place(props, rng.pick(PEBBLE_MODELS), x, y, rng.range(1.6, 3.2), rng.range(0, Math.PI * 2)));
    }
  }

  return instancePlacements(props, list);
}

/** Orman kamplari: cevresini belirleyen kaya halkasi. */
function buildCamps(props: PropLibrary, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const list: Placement[] = [];

  for (const camp of CAMPS) {
    const r = (camp.epic ? 46 : camp.buff === "scuttle" ? 26 : camp.buff ? 38 : 30) * K;
    // Yurunen zeminde kaya birakilmaz (icinden geciliyor gibi duruyordu);
    // kampi zemindeki halka isaretler. Sadece ejderha/baron cukurunun
    // kenarinda, zaten gecilmez duvarin ustunde kaya vardir.
    const count = camp.epic ? 5 : 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      list.push(place(
        props, ROCKS[i % ROCKS.length],
        camp.pos.x + Math.cos(a) * r,
        camp.pos.y + Math.sin(a) * r,
        camp.epic ? 16 : camp.buff ? 12 : 10,
        rng.range(0, Math.PI * 2),
      ));
    }

    // Kamp zemini
    const geo = new THREE.RingGeometry(r * 0.55, r * 0.72, 26);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: camp.epic === "baron"
          ? 0xa87dff
          : camp.epic
            ? 0xff9b4a
            : camp.buff === "blue"
              ? 0x5f9bff
              : camp.buff === "red"
                ? 0xff6a4a
                : camp.buff === "scuttle"
                  ? 0x54ded0
                  : 0x8fd06a,
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
      const x = clamp(n.x + Math.cos(a) * dist * K, 58, MAP_SIZE - 58);
      const y = clamp(n.y + Math.sin(a) * dist * K, 58, MAP_SIZE - 58);
      list.push(place(props, model, x, y, model.startsWith("well") ? 22 : 40, a + Math.PI));
    }

    // Cikis yolunun iki yaninda alcak calilik.
    // Once kaya diziliyordu; yurunen zemindeydi ve icinden geciliyor gibi
    // duruyordu.
    for (let i = 0; i < 6; i++) {
      const d = (78 + i * 30) * K;
      for (const side of [-1, 1]) {
        const a = face + side * 0.62;
        const x = clamp(n.x + Math.cos(a) * d, 48, MAP_SIZE - 48);
        const y = clamp(n.y + Math.sin(a) * d, 48, MAP_SIZE - 48);
        list.push(place(props, rng.pick(BUSHES_MODELS), x, y, rng.range(10, 14), rng.range(0, Math.PI * 2)));
      }
    }
  }
  return instancePlacements(props, list);
}
