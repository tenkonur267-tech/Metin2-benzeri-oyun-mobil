/**
 * Oyun birimlerinin 3B temsilleri.
 *
 * - Sampiyonlar: CC0 iskeletli model + prosedurel ekipman + animasyon makinesi
 * - Minyonlar: birlestirilmis dusuk poligonlu mesh, InstancedMesh ile cizilir
 * - Canavarlar: CC0 hayvan modeli, kampa gore boyanip olceklenir
 * - Yapilar: tamamen prosedurel (kule, engelleyici, ana bina)
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clamp } from "../core/math";
import { TEAM_COLORS, TEAM_COLORS_DARK } from "../game/constants";
import type { Champion } from "../game/champion";
import type { Minion, Monster, Structure } from "../game/units";
import { championModel, creatureModel, type CharModel } from "../render/models";
import { instantiate, findBone, tintAll, tintByMaterialName, type LoadedModel } from "./assets";
import { buildCape, buildHeadgear, buildOffhand, buildTeamRing, buildWeapon, colorOf } from "./gear";
import { terrainHeight } from "./terrain";

const UP = new THREE.Vector3(0, 1, 0);

/** Oyun yonunu (radyan, 2B) 3B Y ekseni donusune cevirir. */
export function facingToYaw(facing: number): number {
  return Math.atan2(Math.cos(facing), Math.sin(facing));
}

// ---------------------------------------------------------------------------
// Sampiyon
// ---------------------------------------------------------------------------

type AnimName = "Idle" | "Walking" | "Running" | "Punch" | "Death" | "Wave" | "Jump";

export class ChampionActor {
  readonly root = new THREE.Group();
  private body: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current: AnimName = "Idle";
  private ring: THREE.Mesh;
  private cape: THREE.Object3D | null = null;
  private glowOrbs: THREE.Mesh[] = [];
  private aura: THREE.Mesh | null = null;
  private shieldDome: THREE.Mesh;
  private flashMats: THREE.MeshStandardMaterial[] = [];
  private baseColors: number[] = [];
  private swingCooldown = 0;
  /** Sampiyon govdesinin oyun birimi cinsinden boyu. */
  readonly bodyHeight: number;

  constructor(
    readonly champ: Champion,
    model: LoadedModel,
    isPlayer: boolean,
  ) {
    const def: CharModel = championModel(champ.def.id);
    const buildScale = def.build === "heavy" ? 1.1 : def.build === "slim" ? 0.92 : 1;
    const target = champ.radius * 2.9 * buildScale;
    const k = target / model.height;
    // Ekipmanlar 1.8 birim boyunda bir figur icin cizildi; modelin gercek
    // olceginden bagimsiz olarak dogru orana getirilir.
    const gearScale = target / 1.8;
    this.bodyHeight = target;

    this.body = instantiate(model);
    this.body.scale.setScalar(k);
    this.root.add(this.body);

    tintByMaterialName(this.body, {
      Main: colorOf(def.body),
      Grey: colorOf(def.accent),
      Black: colorOf(def.bodyDark),
    });

    // Hasar parlamasi icin materyalleri topla
    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of list) {
        const std = mm as THREE.MeshStandardMaterial;
        if (std.emissive) {
          this.flashMats.push(std);
          this.baseColors.push(std.emissive.getHex());
        }
      }
    });

    // --- Ekipman ---
    this.attach(findBone(this.body, "Palm2R"), buildWeapon(def), gearScale, new THREE.Euler(-0.32, 0, 0));
    const off = buildOffhand(def);
    if (off) this.attach(findBone(this.body, "Palm2L"), off, gearScale, new THREE.Euler(-0.25, 0, 0));
    const head = buildHeadgear(def);
    if (head) this.attach(findBone(this.body, "Head"), head, gearScale, new THREE.Euler(0, 0, 0));
    const cape = buildCape(def);
    if (cape) {
      this.cape = cape;
      this.attach(findBone(this.body, "Torso_1") ?? findBone(this.body, "Body") ?? this.body, cape, gearScale, new THREE.Euler(0, 0, 0));
    }

    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.name === "glowOrb") this.glowOrbs.push(m);
    });

    // --- Takim halkasi ---
    this.ring = buildTeamRing(
      isPlayer ? 0xffe08a : colorOf(TEAM_COLORS[champ.team]),
      champ.radius * 1.5,
      isPlayer,
    );
    this.ring.position.y = 0.7;
    this.root.add(this.ring);

    // --- Kalkan kubbesi ---
    this.shieldDome = new THREE.Mesh(
      new THREE.SphereGeometry(champ.radius * 1.7, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0x8fd8ff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.shieldDome.position.y = champ.radius * 1.3;
    this.shieldDome.visible = false;
    this.root.add(this.shieldDome);

    // --- Aura ---
    if (def.aura) {
      const geo = new THREE.RingGeometry(champ.radius * 1.6, champ.radius * 2.3, 24);
      geo.rotateX(-Math.PI / 2);
      this.aura = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: colorOf(def.aura),
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        }),
      );
      this.aura.position.y = 0.5;
      this.root.add(this.aura);
    }

    // --- Animasyonlar ---
    this.mixer = new THREE.AnimationMixer(this.body);
    for (const clip of model.animations) {
      const name = clip.name as AnimName;
      const action = this.mixer.clipAction(clip);
      if (name === "Death" || name === "Punch" || name === "Jump") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
    this.play("Idle", 0);
  }

  /** Kemige, kemik olceginden bagimsiz boyutta ekipman takar. */
  private attach(
    bone: THREE.Object3D | null,
    gear: THREE.Object3D,
    worldScale: number,
    rot: THREE.Euler,
  ): void {
    if (!bone) {
      this.body.add(gear);
      return;
    }
    const holder = new THREE.Object3D();
    const ws = new THREE.Vector3();
    bone.updateWorldMatrix(true, false);
    bone.getWorldScale(ws);
    const s = ws.x > 1e-6 ? worldScale / ws.x : 1;
    holder.scale.setScalar(s);
    holder.rotation.copy(rot);
    holder.add(gear);
    bone.add(holder);
  }

  private play(name: AnimName, fade = 0.18): void {
    const next = this.actions.get(name);
    if (!next || this.current === name) return;
    const prev = this.actions.get(this.current);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
    this.current = name;
  }

  /** Tek seferlik animasyonu bastan oynatir. */
  private trigger(name: AnimName): void {
    const a = this.actions.get(name);
    if (!a) return;
    const prev = this.actions.get(this.current);
    if (prev && prev !== a) prev.fadeOut(0.1);
    a.reset();
    a.setEffectiveTimeScale(1.6);
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.fadeIn(0.06);
    a.play();
    this.current = name;
  }

  update(dt: number, time: number): void {
    const c = this.champ;
    this.root.visible = c.alive || c.deathTimer < 2.4;
    this.root.position.set(c.pos.x, terrainHeight(c.pos.x, c.pos.y), c.pos.y);
    this.root.rotation.y = facingToYaw(c.facing);

    this.swingCooldown = Math.max(0, this.swingCooldown - dt);

    // --- Animasyon durumu ---
    if (!c.alive) {
      this.play("Death", 0.15);
      this.ring.visible = false;
    } else {
      this.ring.visible = true;
      if (this.current === "Death") this.play("Idle", 0.1);
      if (c.swing > 0.2 && this.swingCooldown <= 0) {
        this.trigger("Punch");
        this.swingCooldown = 0.34;
      } else if (c.castAnim > 0.24 && this.swingCooldown <= 0) {
        this.trigger("Wave");
        this.swingCooldown = 0.32;
      } else if (
        this.current !== "Punch" &&
        this.current !== "Wave" &&
        this.current !== "Jump"
      ) {
        if (c.speedNow > 55) this.play("Running");
        else if (c.speedNow > 8) this.play("Walking");
        else this.play("Idle");
      } else if (this.swingCooldown <= 0) {
        this.play(c.speedNow > 8 ? "Walking" : "Idle", 0.12);
      }
    }

    this.mixer.update(dt);

    // --- Gorsel efektler ---
    const stealth = c.hasEffect("stealth");
    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of list) {
        const std = mm as THREE.MeshStandardMaterial;
        std.transparent = stealth;
        std.opacity = stealth ? 0.35 : 1;
      }
    });

    const sh = c.shieldAmount;
    this.shieldDome.visible = sh > 0;
    if (sh > 0) {
      const s = 1 + 0.04 * Math.sin(time * 6);
      this.shieldDome.scale.setScalar(s);
    }

    if (this.aura) {
      this.aura.rotation.y = time * 0.6;
      (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.1 * Math.sin(time * 3);
    }

    for (const orb of this.glowOrbs) {
      const s = 1 + 0.16 * Math.sin(time * 5 + this.champ.id);
      orb.scale.setScalar(s);
    }

    if (this.cape) {
      const sway = Math.sin(time * 6 + this.champ.id) * (c.speedNow > 8 ? 0.22 : 0.05);
      this.cape.rotation.x = sway * 0.5;
      this.cape.rotation.z = sway;
    }

    // Hasar parlamasi
    const flash = clamp(c.hitFlash / 0.12, 0, 1);
    for (let i = 0; i < this.flashMats.length; i++) {
      const m = this.flashMats[i];
      if (flash > 0.01) {
        m.emissive.setRGB(flash * 0.7, flash * 0.7, flash * 0.7);
      } else if (m.emissive.getHex() !== this.baseColors[i]) {
        m.emissive.setHex(this.baseColors[i]);
      }
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

// ---------------------------------------------------------------------------
// Minyonlar (instanced)
// ---------------------------------------------------------------------------

function minionGeometry(kind: Minion["minionKind"]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const big = kind === "cannon" || kind === "super";
  const s = big ? 1.25 : 1;

  const body = new THREE.BoxGeometry(7 * s, 9 * s, 5.4 * s);
  body.translate(0, 8 * s, 0);
  parts.push(body);

  const head = new THREE.BoxGeometry(4.6 * s, 4 * s, 4.4 * s);
  head.translate(0, 14.6 * s, 0.4);
  parts.push(head);

  // Bacaklar
  for (const off of [-2, 2]) {
    const leg = new THREE.BoxGeometry(2.4 * s, 5 * s, 2.4 * s);
    leg.translate(off * s, 2.6 * s, 0);
    parts.push(leg);
  }

  // Kollar
  for (const off of [-4.4, 4.4]) {
    const arm = new THREE.BoxGeometry(1.9 * s, 6.4 * s, 1.9 * s);
    arm.translate(off * s, 8.4 * s, 0);
    parts.push(arm);
  }

  if (kind === "caster") {
    const staff = new THREE.CylinderGeometry(0.5, 0.6, 12, 5);
    staff.translate(5 * s, 10 * s, 1.5);
    parts.push(staff);
    const orb = new THREE.IcosahedronGeometry(1.9, 0);
    orb.translate(5 * s, 16.4 * s, 1.5);
    parts.push(orb);
  } else if (kind === "cannon") {
    const barrel = new THREE.CylinderGeometry(2.1, 2.4, 10, 6);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(5 * s, 9 * s, 4);
    parts.push(barrel);
  } else {
    const blade = new THREE.BoxGeometry(1.1, 10 * s, 0.7);
    blade.translate(5 * s, 11 * s, 1.6);
    parts.push(blade);
    const shield = new THREE.BoxGeometry(0.9, 6.5 * s, 5 * s);
    shield.translate(-5.4 * s, 9 * s, 0.6);
    parts.push(shield);
  }

  if (kind === "super") {
    const crest = new THREE.ConeGeometry(1.5, 4.5, 4);
    crest.translate(0, 18.4 * s, 0);
    parts.push(crest);
  }

  // Bazi geometriler indeksli, bazilari degil; birlestirmeden once esitle
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(flat, false) ?? body;
}

export class MinionField {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3(1, 1, 1);

  constructor(capacity = 70) {
    const kinds: Minion["minionKind"][] = ["melee", "caster", "cannon", "super"];
    for (const team of [0, 1] as const) {
      for (const kind of kinds) {
        const geo = minionGeometry(kind);
        const mat = new THREE.MeshStandardMaterial({
          color: colorOf(TEAM_COLORS_DARK[team]),
          emissive: colorOf(TEAM_COLORS[team]),
          emissiveIntensity: 0.22,
          roughness: 0.7,
          metalness: 0.1,
          flatShading: true,
        });
        const im = new THREE.InstancedMesh(geo, mat, capacity);
        im.castShadow = true;
        im.receiveShadow = false;
        im.frustumCulled = false;
        im.count = 0;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.meshes.set(`${team}:${kind}`, im);
        this.group.add(im);
      }
    }
  }

  update(minions: Minion[], playerTeam: number, time: number): void {
    const counts = new Map<string, number>();
    for (const m of this.meshes.values()) m.count = 0;

    for (const mi of minions) {
      if (!mi.alive) continue;
      if (mi.team !== playerTeam && !mi.visibleTo[playerTeam as 0 | 1]) continue;
      const key = `${mi.team}:${mi.minionKind}`;
      const im = this.meshes.get(key);
      if (!im) continue;
      const i = counts.get(key) ?? 0;
      if (i >= im.instanceMatrix.count) continue;

      const bob = mi.speedNow > 6 ? Math.abs(Math.sin(mi.walkPhase * 2.6)) * 1.4 : 0;
      const lean = mi.speedNow > 6 ? Math.sin(mi.walkPhase * 2.6) * 0.12 : 0;
      this.v.set(mi.pos.x, terrainHeight(mi.pos.x, mi.pos.y) + bob, mi.pos.y);
      this.q.setFromEuler(new THREE.Euler(lean, facingToYaw(mi.facing), 0, "YXZ"));
      const k = mi.minionKind === "super" ? 1.15 : 0.95;
      this.sc.set(k, k, k);
      this.m4.compose(this.v, this.q, this.sc);
      im.setMatrixAt(i, this.m4);
      counts.set(key, i + 1);
    }

    for (const [key, im] of this.meshes) {
      im.count = counts.get(key) ?? 0;
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Orman canavarlari
// ---------------------------------------------------------------------------

export class MonsterActor {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = "";
  private body: THREE.Group;

  constructor(
    readonly monster: Monster,
    model: LoadedModel,
  ) {
    const cm = creatureModel(monster.spec.name);
    this.body = instantiate(model);
    const target = monster.radius * (monster.spec.epic ? 3.4 : 2.4);
    this.body.scale.setScalar(target / model.height);
    tintAll(this.body, colorOf(cm.body), monster.spec.epic ? colorOf(cm.accent) : 0x000000);
    if (monster.spec.epic) {
      this.body.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const list = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of list) {
          (mm as THREE.MeshStandardMaterial).emissiveIntensity = 0.35;
        }
      });
    }
    this.root.add(this.body);

    // Epik canavarlara boynuz / diken
    if (cm.horns) {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(
          new THREE.ConeGeometry(monster.radius * 0.16, monster.radius * 0.75, 5),
          new THREE.MeshStandardMaterial({ color: 0xe8dcc6, flatShading: true, roughness: 0.6 }),
        );
        horn.position.set(s * monster.radius * 0.28, monster.radius * 1.25, monster.radius * 0.85);
        horn.rotation.z = s * -0.5;
        horn.castShadow = true;
        this.root.add(horn);
      }
    }

    this.mixer = new THREE.AnimationMixer(this.body);
    for (const clip of model.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    this.play("Survey");
  }

  private play(name: string, fade = 0.2): void {
    const next = this.actions.get(name);
    if (!next || this.current === name) return;
    const prev = this.actions.get(this.current);
    next.reset().play();
    if (prev) prev.crossFadeTo(next, fade, false);
    this.current = name;
  }

  update(dt: number): void {
    const m = this.monster;
    this.root.visible = m.alive;
    if (!m.alive) return;
    this.root.position.set(m.pos.x, terrainHeight(m.pos.x, m.pos.y), m.pos.y);
    this.root.rotation.y = facingToYaw(m.facing);
    if (m.speedNow > 45) this.play("Run");
    else if (m.speedNow > 6) this.play("Walk");
    else this.play("Survey");
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Yapilar
// ---------------------------------------------------------------------------

export class StructureActor {
  readonly root = new THREE.Group();
  private turret: THREE.Object3D | null = null;
  private crystal: THREE.Object3D | null = null;
  private glow: THREE.Mesh | null = null;
  private rubble: THREE.Object3D | null = null;
  private alivePart = new THREE.Group();

  constructor(readonly s: Structure) {
    const team = s.team;
    const col = colorOf(TEAM_COLORS[team]);
    const dark = colorOf(TEAM_COLORS_DARK[team]);
    const stone = new THREE.MeshStandardMaterial({ color: 0x6b7683, roughness: 0.85, flatShading: true });
    const stoneDark = new THREE.MeshStandardMaterial({ color: 0x434e5a, roughness: 0.9, flatShading: true });
    const accent = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.6, metalness: 0.2 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 1.6,
      roughness: 0.3,
    });

    this.root.add(this.alivePart);

    if (s.kind === "tower") {
      const r = s.radius;
      const h = r * (3.4 + s.tier * 0.35);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.9, r * 0.9, 8), stoneDark);
      base.position.y = r * 0.45;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 1.05, h, 8), stone);
      shaft.position.y = r * 0.9 + h / 2;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, r * 0.5, 8), accent);
      band.position.y = r * 0.9 + h * 0.62;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 0.85, r * 0.7, 8), stone);
      crown.position.y = r * 0.9 + h + r * 0.2;

      const turret = new THREE.Group();
      const headMesh = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 0.8, r * 1.6), accent);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.26, r * 1.6, 6), stoneDark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = r * 1.2;
      const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.42, 1), glowMat);
      eye.position.set(0, r * 0.55, 0);
      turret.add(headMesh, barrel, eye);
      turret.position.y = r * 0.9 + h + r * 0.75;
      this.turret = turret;
      this.glow = eye;

      this.alivePart.add(base, shaft, band, crown, turret);
    } else if (s.kind === "inhibitor") {
      const r = s.radius;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.8, r * 0.6, 8), stoneDark);
      pad.position.y = r * 0.3;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.95, 0), glowMat);
      crystal.position.y = r * 2.1;
      crystal.scale.set(1, 1.35, 1);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r * 1.5, r * 0.09, 5, 16),
        accent,
      );
      ring.position.y = r * 2.1;
      ring.rotation.x = Math.PI / 2;
      this.crystal = crystal;
      this.glow = crystal;
      this.alivePart.add(pad, crystal, ring);
    } else {
      const r = s.radius;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.4, r * 1.7, r * 0.7, 10), stoneDark);
      pad.position.y = r * 0.35;
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.95, 0), glowMat);
      core.position.y = r * 1.9;
      core.scale.set(1, 1.5, 1);
      const shards = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const sh = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.3, 0), glowMat);
        sh.position.set(Math.cos(a) * r * 1.7, r * 1.6, Math.sin(a) * r * 1.7);
        shards.add(sh);
      }
      shards.position.y = 0;
      this.crystal = core;
      this.glow = core;
      this.alivePart.add(pad, core, shards);
      (this.root as THREE.Group & { shards?: THREE.Group }).shards = shards;
    }

    this.alivePart.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    // Yikilmis hali
    const rubble = new THREE.Group();
    const rubMat = new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + s.id;
      const chunk = new THREE.Mesh(
        new THREE.DodecahedronGeometry(s.radius * (0.3 + (i % 3) * 0.14), 0),
        rubMat,
      );
      chunk.position.set(Math.cos(a) * s.radius * 0.9, s.radius * 0.2, Math.sin(a) * s.radius * 0.9);
      chunk.rotation.set(i, i * 1.3, i * 0.7);
      chunk.castShadow = true;
      rubble.add(chunk);
    }
    rubble.visible = false;
    this.rubble = rubble;
    this.root.add(rubble);

    this.root.position.set(s.pos.x, terrainHeight(s.pos.x, s.pos.y), s.pos.y);
  }

  update(time: number): void {
    const s = this.s;
    this.alivePart.visible = s.alive;
    if (this.rubble) this.rubble.visible = !s.alive;
    if (!s.alive) return;

    if (this.turret) {
      const t = s.target;
      const yaw = t ? facingToYaw(Math.atan2(t.pos.y - s.pos.y, t.pos.x - s.pos.x)) : Math.sin(time * 0.4 + s.id) * 0.8;
      this.turret.rotation.y += (yaw - this.turret.rotation.y) * 0.2;
      const recoil = clamp(s.swing / 0.24, 0, 1);
      this.turret.position.z = -recoil * s.radius * 0.35;
    }
    if (this.crystal) {
      this.crystal.rotation.y = time * 0.8;
      this.crystal.position.y +=
        (this.s.radius * (this.s.kind === "nexus" ? 1.9 : 2.1) +
          Math.sin(time * 1.4) * this.s.radius * 0.12 -
          this.crystal.position.y) * 0.2;
    }
    const shards = (this.root as THREE.Group & { shards?: THREE.Group }).shards;
    if (shards) shards.rotation.y = time * 0.5;

    if (this.glow) {
      const m = (this.glow as THREE.Mesh).material as THREE.MeshStandardMaterial;
      const dim = s.invulnerable ? 0.5 : 1;
      m.emissiveIntensity = (1.2 + 0.5 * Math.sin(time * 3 + s.id)) * dim;
    }
  }
}
