/**
 * Sampiyonlara takilan prosedurel 3B ekipman: silahlar, basliklar,
 * pelerinler ve aura halkalari. Hepsi kodla uretilir.
 */
import * as THREE from "three";
import type { CharModel, WeaponKind } from "../render/models";

const STEEL = 0xdfe8f2;
const STEEL_DARK = 0x8fa1b4;
const WOOD = 0x6b4a2f;

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.12,
    flatShading: true,
    ...opts,
  });
}

function glowMat(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0,
  });
}

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.castShadow = true;
  return g;
}

/**
 * Silah uretir. Yerel eksen: +Y silahin ucu (kemik yonu),
 * kabza orijinde. Sonradan tutucu ile dondurulur.
 */
export function buildWeapon(m: CharModel): THREE.Object3D {
  const g = new THREE.Group();
  const accent = mat(colorOf(m.accent));
  const steel = mat(STEEL, { metalness: 0.55, roughness: 0.3 });
  const steelDark = mat(STEEL_DARK, { metalness: 0.5, roughness: 0.4 });
  const wood = mat(WOOD);
  const kind: WeaponKind = m.weapon;

  switch (kind) {
    case "greatsword":
    case "sword": {
      const len = kind === "greatsword" ? 1.05 : 0.82;
      const wdt = kind === "greatsword" ? 0.17 : 0.12;
      const grip = box(0.07, 0.26, 0.07, wood);
      grip.position.y = -0.1;
      const guard = box(0.42, 0.06, 0.09, accent);
      guard.position.y = 0.04;
      const blade = box(wdt, len, 0.05, steel);
      blade.position.y = 0.06 + len / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(wdt * 0.72, 0.22, 4), steel);
      tip.position.y = 0.06 + len + 0.09;
      const fuller = box(wdt * 0.32, len * 0.85, 0.06, steelDark);
      fuller.position.y = 0.06 + len / 2;
      g.add(grip, guard, blade, tip, fuller);
      break;
    }
    case "axe": {
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.0, 6), wood);
      haft.position.y = 0.36;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.2, 0.12, 3), steel);
      head.rotation.set(Math.PI / 2, 0, 0);
      head.position.set(0.16, 0.78, 0);
      const back = box(0.12, 0.2, 0.1, steelDark);
      back.position.set(-0.1, 0.78, 0);
      g.add(haft, head, back);
      break;
    }
    case "staff":
    case "wand": {
      const len = kind === "staff" ? 1.3 : 0.8;
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, len, 6),
        kind === "staff" ? wood : mat(colorOf(m.bodyDark)),
      );
      shaft.position.y = len / 2 - 0.15;
      const orbColor = colorOf(m.aura ?? m.accent);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), glowMat(orbColor));
      orb.position.y = len - 0.08;
      orb.name = "glowOrb";
      const cage = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.025, 4, 10),
        accent,
      );
      cage.position.y = len - 0.08;
      cage.rotation.x = Math.PI / 2;
      g.add(shaft, orb, cage);
      break;
    }
    case "bow": {
      const limb = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 5, 14, Math.PI * 1.15), wood);
      limb.rotation.z = Math.PI / 2 + 0.575 * Math.PI * 0.0;
      limb.rotation.y = Math.PI / 2;
      limb.position.y = 0.3;
      const stringGeo = new THREE.CylinderGeometry(0.008, 0.008, 1.0, 3);
      const str = new THREE.Mesh(stringGeo, mat(0xf0e6cc));
      str.position.set(0.22, 0.3, 0);
      g.add(limb, str);
      break;
    }
    case "dagger": {
      const grip = box(0.055, 0.18, 0.055, mat(colorOf(m.accent)));
      const blade = box(0.075, 0.44, 0.03, steel);
      blade.position.y = 0.3;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), steel);
      tip.position.y = 0.58;
      g.add(grip, blade, tip);
      break;
    }
    case "trident": {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.2, 6), accent);
      shaft.position.y = 0.46;
      g.add(shaft);
      for (const off of [-0.16, 0, 0.16]) {
        const prong = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 4), steel);
        prong.position.set(off, 1.24, 0);
        g.add(prong);
      }
      const crossbar = box(0.42, 0.05, 0.06, steelDark);
      crossbar.position.y = 1.05;
      g.add(crossbar);
      break;
    }
    case "claws": {
      for (const off of [-0.11, 0, 0.11]) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.42, 4), steel);
        c.position.set(off, 0.2, 0);
        c.rotation.z = off * 1.2;
        g.add(c);
      }
      break;
    }
    default:
      break;
  }
  return g;
}

/** Sol ele takilan yardimci ekipman. */
export function buildOffhand(m: CharModel): THREE.Object3D | null {
  switch (m.offhand) {
    case "shield": {
      const g = new THREE.Group();
      const face = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.3, 0.07, 6),
        mat(colorOf(m.accent), { metalness: 0.4, roughness: 0.4 }),
      );
      face.rotation.x = Math.PI / 2;
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(STEEL, { metalness: 0.6 }));
      boss.position.z = 0.06;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 4, 12), mat(STEEL_DARK, { metalness: 0.6 }));
      g.add(face, boss, rim);
      return g;
    }
    case "dagger": {
      const g = new THREE.Group();
      const blade = box(0.06, 0.4, 0.028, mat(STEEL, { metalness: 0.6, roughness: 0.28 }));
      blade.position.y = 0.26;
      const grip = box(0.05, 0.16, 0.05, mat(colorOf(m.accent)));
      g.add(grip, blade);
      return g;
    }
    case "orb": {
      const c = colorOf(m.aura ?? m.accent);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), glowMat(c));
      orb.name = "glowOrb";
      return orb;
    }
    default:
      return null;
  }
}

/** Basa takilan baslik. */
export function buildHeadgear(m: CharModel): THREE.Object3D | null {
  const g = new THREE.Group();
  const accent = mat(colorOf(m.accent), { metalness: 0.4, roughness: 0.4 });
  const body = mat(colorOf(m.body));

  switch (m.head) {
    case "hood": {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 7, 1, true), body);
      hood.position.y = 0.14;
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6, 0, Math.PI), body);
      back.rotation.y = Math.PI;
      back.position.set(0, 0.02, -0.06);
      g.add(hood, back);
      break;
    }
    case "helm": {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
        accent,
      );
      cap.position.y = 0.04;
      const crest = box(0.07, 0.3, 0.5, mat(colorOf(m.accent)));
      crest.position.y = 0.28;
      g.add(cap, crest);
      break;
    }
    case "horned": {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 5), mat(0xe6dcc6));
        horn.position.set(s * 0.3, 0.28, 0);
        horn.rotation.z = s * -0.85;
        g.add(horn);
      }
      break;
    }
    case "crown": {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 5, 12), mat(0xffd45e, { metalness: 0.8, roughness: 0.25 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.24;
      g.add(ring);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), mat(0xffd45e, { metalness: 0.8, roughness: 0.25 }));
        spike.position.set(Math.cos(a) * 0.32, 0.36, Math.sin(a) * 0.32);
        g.add(spike);
      }
      break;
    }
    case "mask": {
      const mask = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.12), mat(colorOf(m.bodyDark)));
      mask.position.set(0, 0.02, 0.3);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.03), glowMat(colorOf(m.accent)));
      eye.position.set(0, 0.05, 0.37);
      g.add(mask, eye);
      break;
    }
    default:
      return null;
  }
  g.traverse((o) => {
    (o as THREE.Mesh).castShadow = true;
  });
  return g;
}

/** Sirta takilan pelerin. */
export function buildCape(m: CharModel): THREE.Object3D | null {
  if (!m.cape) return null;
  const g = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: colorOf(m.cape),
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  // Ust uste binen uc parca; hafif salinim icin ayri dugumler
  for (let i = 0; i < 3; i++) {
    const w = 0.62 - i * 0.09;
    const h = 0.42;
    const piece = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), material);
    piece.position.set(0, -i * 0.34, -0.1 - i * 0.06);
    piece.rotation.x = 0.16 + i * 0.1;
    piece.castShadow = true;
    piece.name = `cape${i}`;
    g.add(piece);
  }
  return g;
}

/** Ayak altindaki takim halkasi. */
export function buildTeamRing(color: number, radius: number, player = false): THREE.Mesh {
  const geo = new THREE.RingGeometry(radius * 0.82, radius, 28);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: player ? 0.95 : 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  m.renderOrder = 2;
  return m;
}

/** "#rrggbb" veya sayi -> sayi */
export function colorOf(c: string | number | undefined): number {
  if (c === undefined) return 0xffffff;
  if (typeof c === "number") return c;
  return new THREE.Color(c).getHex();
}
