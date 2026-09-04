/**
 * Oyun birimlerinin 3B temsilleri.
 *
 * - Sampiyonlar: CC0 iskeletli model + prosedurel ekipman + animasyon makinesi
 * - Minyonlar: birlestirilmis dusuk poligonlu mesh, InstancedMesh ile cizilir
 * - Canavarlar: CC0 hayvan modeli, kampa gore boyanip olceklenir
 * - Yapilar: hazir tas modeller (dikilitas, turbe) + takim kristali
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clamp } from "../core/math";
import { TEAM_COLORS, TEAM_COLORS_DARK } from "../game/constants";
import type { Champion } from "../game/champion";
import type { Minion, Monster, Structure } from "../game/units";
import { championModel, creatureModel, type CharModel } from "../render/models";
import { findBone, findNode, instantiate, mergeSkinned, tintAll, type LoadedModel } from "./assets";
import { buildTeamRing, colorOf } from "./gear";
import { GEAR_NODES, MINION_MODELS, MINION_WEAPONS, type Clip, type Loadout } from "./loadout";
import type { PropLibrary } from "./props";
import { terrainHeight } from "./terrain";

const UP = new THREE.Vector3(0, 1, 0);

/** Oyun yonunu (radyan, 2B) 3B Y ekseni donusune cevirir. */
export function facingToYaw(facing: number): number {
  return Math.atan2(Math.cos(facing), Math.sin(facing));
}

// ---------------------------------------------------------------------------
// Sampiyon
// ---------------------------------------------------------------------------

/**
 * Animasyon durumlari. "Q/W/E/R" yetenege ozel kliplerdir; sampiyonun
 * kullandigi tusa gore secilir (bkz. loadout.ts `abilities`).
 */
type AnimName =
  | "Idle" | "Walk" | "Run" | "Attack" | "Attack2" | "Attack3"
  | "Cast" | "Death" | "Hit" | "Recall"
  | "Q" | "W" | "E" | "R";

/** Kombo zincirindeki vurus durumlari (sirayla oynatilir). */
const COMBO: AnimName[] = ["Attack", "Attack2", "Attack3"];

/**
 * Kok hareketini (root motion) klipten ayiklar.
 *
 * `*_RM` klipleri karakteri kendi basina ilerletir; konumu oyun
 * mantigi belirledigi icin bu izler atilir, geriye yalnizca
 * govdenin savurma hareketi kalir.
 */
function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  const keep = clip.tracks.filter((t) => !/^root\.position$/i.test(t.name));
  if (keep.length === clip.tracks.length) return clip;
  return new THREE.AnimationClip(clip.name, clip.duration, keep, clip.blendMode);
}

/** Bir kez oynayip son karede duran (donguye girmeyen) durumlar. */
const ONCE = new Set<AnimName>(["Attack", "Attack2", "Attack3", "Cast", "Death", "Hit", "Q", "W", "E", "R"]);

/** Yetenek animasyonu oynarken hareket/beklemeye donmeyi engelleyen durumlar. */
const BUSY = new Set<AnimName>(["Attack", "Attack2", "Attack3", "Cast", "Q", "W", "E", "R"]);

/** Oyun ici durum adi -> varsayilan KayKit klip adi. */
const BASE_CLIPS: Record<"Idle" | "Walk" | "Run" | "Death" | "Hit" | "Recall", Clip> = {
  Idle: "Idle",
  Walk: "Walking_A",
  Run: "Running_A",
  Death: "Death_A",
  Hit: "Hit_A",
  Recall: "Cheer",
};

/**
 * KayKit karakterlerinin ayakta boyu; model kutusu havaya kalkik silahi da
 * kapsadigi icin olceklemede sabit bu referans kullanilir.
 */
export const KAYKIT_HEIGHT = 1.75;

/** Sampiyon boyu = yaricap x bu carpan (oyun birimi). */
const CHAMPION_HEIGHT = 2.55;

/** Yetenek animasyonunun suresi (saniye) — kisa tutulur ki kombo akici olsun. */
const ABILITY_ANIM_TIME = 0.5;

/**
 * Hazir bir silahi el kemigine takar.
 *
 * Kemik, govde olcegini de tasidigi icin dogrudan eklenen nesne o olcekle
 * carpilir ve devlesir; burada kemigin dunya olcegi geri alinir, boylece
 * silah `clone()` ile verilen gercek boyunda kalir.
 */
function attachToHand(body: THREE.Object3D, boneName: string, gear: THREE.Object3D): void {
  const bone = findBone(body, boneName);
  if (!bone) {
    body.add(gear);
    return;
  }
  bone.updateWorldMatrix(true, false);
  const ws = new THREE.Vector3();
  bone.getWorldScale(ws);
  const holder = new THREE.Object3D();
  holder.scale.setScalar(ws.x > 1e-6 ? 1 / ws.x : 1);
  holder.add(gear);
  bone.add(holder);
}

export class ChampionActor {
  readonly root = new THREE.Group();
  private body: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current: AnimName = "Idle";
  private ring: THREE.Mesh;
  private cape: THREE.Object3D | null = null;
  private shieldDome: THREE.Mesh;
  private aura: THREE.Mesh | null = null;
  private flashMats: THREE.MeshStandardMaterial[] = [];
  private baseColors: number[] = [];
  private swingCooldown = 0;
  private hitCooldown = 0;
  private lastHp = Infinity;
  private clipLength = new Map<AnimName, number>();
  /** Sampiyon govdesinin oyun birimi cinsinden boyu. */
  readonly bodyHeight: number;

  constructor(
    readonly champ: Champion,
    model: LoadedModel,
    loadout: Loadout,
    props: PropLibrary,
    isPlayer: boolean,
  ) {
    const def: CharModel = championModel(champ.def.id);
    const target = champ.radius * CHAMPION_HEIGHT * (loadout.scale ?? 1);
    this.bodyHeight = target;

    this.body = instantiate(model);
    this.body.scale.setScalar(target / (loadout.modelHeight ?? KAYKIT_HEIGHT));
    this.root.add(this.body);

    // --- Hazir ekipman parcalarindan sadece bu sampiyonunkiler acilir ---
    const all = GEAR_NODES[loadout.model] ?? [];
    const show = new Set(loadout.show);
    for (const name of all) {
      const node = findNode(this.body, name);
      if (node) node.visible = show.has(name);
    }
    this.cape = findNode(this.body, `${loadout.model.replace("champ-", "")}_Cape`);

    // Modelde hazir silahi olmayan sampiyonlara disaridan silah takilir
    const handHeight = target * (loadout.handScale ?? 0.5);
    if (loadout.mainHand && props.has(loadout.mainHand)) {
      attachToHand(this.body, loadout.handBone ?? "handslot.r", props.clone(loadout.mainHand, handHeight));
    }
    if (loadout.offHand && props.has(loadout.offHand)) {
      attachToHand(
        this.body,
        loadout.offHandBone ?? "handslot.l",
        props.clone(loadout.offHand, handHeight * 0.34),
      );
    }

    // Govde parcalari tek mesh'te birlestirilir (10 cizim cagrisi -> 1)
    mergeSkinned(this.body);

    // --- Govde rengi ---
    // `teamTint` acikken takim rengi kullanilir: iki takim da ayni
    // sampiyonu oynarken kimin kim oldugu anlasilsin diye.
    const tintHex = loadout.teamTint ? colorOf(TEAM_COLORS[champ.team]) : loadout.tint;
    if (tintHex !== undefined) {
      const tint = new THREE.Color(tintHex);
      const amount = loadout.teamTint ? 0.55 : 0.28;
      this.body.traverse((o) => {
        const m = o as THREE.Mesh;
        const skinned = (m as THREE.SkinnedMesh).isSkinnedMesh;
        if (!m.isMesh || !(skinned || /Cape|Cloak/i.test(m.name))) return;
        const list = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of list) {
          const std = mm as THREE.MeshStandardMaterial;
          if (std.color) std.color.lerp(tint, amount);
        }
      });
    }

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
    const combo = loadout.combo ?? [];
    const clips: Partial<Record<AnimName, Clip>> = {
      ...BASE_CLIPS,
      ...(loadout.base ?? {}),
      Attack: loadout.attack,
      Attack2: combo[0],
      Attack3: combo[1],
      Cast: loadout.cast,
      ...(loadout.abilities ?? {}),
    };
    this.mixer = new THREE.AnimationMixer(this.body);
    for (const [state, clipName] of Object.entries(clips) as [AnimName, Clip][]) {
      const found = model.animations.find((c) => c.name === clipName);
      if (!found) continue;
      const clip = stripRootMotion(found);
      const action = this.mixer.clipAction(clip);
      if (ONCE.has(state)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
      this.clipLength.set(state, clip.duration);
    }
    this.play("Idle", 0);
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

  /**
   * Tek seferlik animasyonu bastan oynatir.
   * `duration` verilirse klip o sureye sigacak sekilde hizlandirilir;
   * boylece saldiri animasyonu saldiri hizina uyar.
   */
  private trigger(name: AnimName, duration?: number): number {
    const a = this.actions.get(name);
    if (!a) return 0;
    const len = this.clipLength.get(name) ?? 1;
    const speed = duration && duration > 0.05 ? clamp(len / duration, 0.5, 4.5) : 1.5;
    const prev = this.actions.get(this.current);
    if (prev && prev !== a) prev.fadeOut(0.1);
    a.reset();
    a.setEffectiveTimeScale(speed);
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.fadeIn(0.06);
    a.play();
    this.current = name;
    return len / speed;
  }

  update(dt: number, time: number): void {
    const c = this.champ;
    this.root.visible = c.alive || c.deathTimer < 2.4;
    this.root.position.set(c.pos.x, terrainHeight(c.pos.x, c.pos.y), c.pos.y);
    this.root.rotation.y = facingToYaw(c.facing);

    this.swingCooldown = Math.max(0, this.swingCooldown - dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    // --- Animasyon durumu ---
    if (!c.alive) {
      this.play("Death", 0.15);
      this.ring.visible = false;
      this.lastHp = Infinity;
    } else {
      this.ring.visible = true;
      if (this.current === "Death") this.play("Idle", 0.1);

      const tookDamage = c.hp < this.lastHp - 1;
      this.lastHp = c.hp;

      if (c.castAnim > 0.24 && this.swingCooldown <= 0) {
        // Yetenege ozel klip varsa o, yoksa genel buyu animasyonu
        const key = c.castAnimKey as AnimName;
        const state: AnimName = this.actions.has(key) ? key : "Cast";
        // Yetenekler aninda etki ettigi icin animasyon da tok ve kisa
        // olmali; klip 2 saniye surse bile 0.5 saniyeye sigdirilir.
        this.trigger(state, ABILITY_ANIM_TIME);
        this.swingCooldown = ABILITY_ANIM_TIME * 0.6;
      } else if (c.swing > 0.1 && this.swingCooldown <= 0) {
        // Saldiri animasyonu saldiri hizina uydurulur
        // Hasar `windup` kadar sonra iniyor; klip temas anini oraya
        // denk getirsin diye sure kisa tutulur.
        const period = c.stats.attackSpeed > 0 ? 1 / c.stats.attackSpeed : 0.6;
        // Kombo: ardisik vuruslar sirayla farkli klip oynar, ucuncusu
        // bitirici oldugu icin daha yavas ve agir savurulur.
        const step = c.comboStep % COMBO.length;
        let state = COMBO[step];
        if (!this.actions.has(state)) state = "Attack";
        const span = Math.min(period * (step === 2 ? 0.95 : 0.7), step === 2 ? 0.95 : 0.75);
        // Bekleme her zaman saldiri periyodundan kisa kalir; yoksa hizli
        // saldiran sampiyonlarda araya giren vuruslar animasyonsuz gecerdi.
        this.swingCooldown = Math.min(this.trigger(state, span), period * 0.8);
      } else if (
        tookDamage &&
        this.hitCooldown <= 0 &&
        !BUSY.has(this.current) &&
        c.speedNow < 8
      ) {
        // Yerinde dururken hasar alinca kisa bir irkilme
        this.trigger("Hit", 0.35);
        this.hitCooldown = 1.4;
        this.swingCooldown = 0.2;
      } else if (c.recallTimer > 0 && !BUSY.has(this.current)) {
        this.play("Recall", 0.15);
      } else if (!BUSY.has(this.current) && this.current !== "Hit") {
        if (c.speedNow > 55) this.play("Run");
        else if (c.speedNow > 8) this.play("Walk");
        else this.play("Idle");
      } else if (this.swingCooldown <= 0) {
        this.play(c.speedNow > 8 ? "Walk" : "Idle", 0.12);
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
    if (sh > 0) this.shieldDome.scale.setScalar(1 + 0.04 * Math.sin(time * 6));

    if (this.aura) {
      this.aura.rotation.y = time * 0.6;
      (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.1 * Math.sin(time * 3);
    }

    if (this.cape) {
      const sway = Math.sin(time * 6 + this.champ.id) * (c.speedNow > 8 ? 0.18 : 0.04);
      this.cape.rotation.x = sway * 0.5;
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
// Minyonlar
// ---------------------------------------------------------------------------

/**
 * Minyonlar hazir iskelet karakterleriyle cizilir. Her minyon icin bir
 * aktor havuzda tutulur; olen minyonun aktoru geri verilir.
 */
class MinionActor {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = "";
  private attackClip: string;
  private body: THREE.Group;
  private mats: THREE.MeshStandardMaterial[] = [];
  private baseColors: THREE.Color[] = [];
  private baseEmissive: number[] = [];

  constructor(model: LoadedModel, weapon: THREE.Object3D | null, height: number) {
    this.body = instantiate(model);
    this.body.scale.setScalar(height / KAYKIT_HEIGHT);
    this.root.add(this.body);

    mergeSkinned(this.body);

    if (weapon) attachToHand(this.body, "handslot.r", weapon);

    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of list) {
        const std = mm as THREE.MeshStandardMaterial;
        if (std.color) {
          this.mats.push(std);
          this.baseColors.push(std.color.clone());
          this.baseEmissive.push(std.emissive ? std.emissive.getHex() : 0);
        }
      }
    });

    this.mixer = new THREE.AnimationMixer(this.body);
    for (const clip of model.animations) {
      const action = this.mixer.clipAction(clip);
      if (clip.name.startsWith("Death") || clip.name.startsWith("Hit")) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(clip.name, action);
    }
    this.attackClip = pickAttackClip(model);
    this.play("Idle", 0);
  }

  /** Takim rengini kumas parcalarina karistirir. */
  tint(color: THREE.Color): void {
    for (let i = 0; i < this.mats.length; i++) {
      this.mats[i].color.copy(this.baseColors[i]).lerp(color, 0.4);
    }
  }

  private play(name: string, fade = 0.15): void {
    const next = this.actions.get(name);
    if (!next || this.current === name) return;
    const prev = this.actions.get(this.current);
    next.reset().play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
    this.current = name;
  }

  update(mi: Minion, dt: number): void {
    this.root.position.set(mi.pos.x, terrainHeight(mi.pos.x, mi.pos.y), mi.pos.y);
    this.root.rotation.y = facingToYaw(mi.facing);
    if (!mi.alive) this.play("Death_A", 0.1);
    else if (mi.swing > 0.1) this.play(this.attackClip, 0.06);
    else if (mi.speedNow > 6) this.play("Walking_A");
    else this.play("Idle");
    this.mixer.update(dt);
    this.flash(mi.hitFlash);
  }

  /** Hasar alinca kisa bir beyaz parlama (vurusun hissedilmesi icin). */
  private flash(hitFlash: number): void {
    const f = clamp(hitFlash / 0.12, 0, 1);
    for (let i = 0; i < this.mats.length; i++) {
      const m = this.mats[i];
      if (!m.emissive) continue;
      if (f > 0.01) m.emissive.setRGB(f * 0.75, f * 0.7, f * 0.6);
      else if (m.emissive.getHex() !== this.baseEmissive[i]) m.emissive.setHex(this.baseEmissive[i]);
    }
  }
}

export class MinionField {
  readonly group = new THREE.Group();
  private models = new Map<string, LoadedModel>();
  private weapons = new Map<string, THREE.Object3D>();
  private actors = new Map<number, MinionActor>();
  private teamColors = [new THREE.Color(), new THREE.Color()];

  /** Minyon modellerini ve hazir silahlarini baglar. */
  build(models: Map<string, LoadedModel>, weapons: Map<string, THREE.Object3D>): void {
    this.models = models;
    this.weapons = weapons;
    for (const team of [0, 1] as const) {
      this.teamColors[team] = new THREE.Color(colorOf(TEAM_COLORS[team]));
    }
  }

  update(minions: Minion[], playerTeam: number, dt: number): void {
    const seen = new Set<number>();

    for (const mi of minions) {
      const visible = mi.alive || mi.deathTimer < 1.4;
      if (!visible) continue;
      if (mi.team !== playerTeam && !mi.visibleTo[playerTeam as 0 | 1]) continue;
      seen.add(mi.id);

      let a = this.actors.get(mi.id);
      if (!a) {
        const modelName = MINION_MODELS[mi.minionKind] ?? "minion-melee";
        const model = this.models.get(modelName);
        if (!model) continue;
        const weaponSrc = this.weapons.get(MINION_WEAPONS[mi.minionKind] ?? "sword-1handed");
        const height = MINION_HEIGHT[mi.minionKind];
        a = new MinionActor(model, weaponSrc ? weaponSrc.clone() : null, height);
        a.tint(this.teamColors[mi.team]);
        this.actors.set(mi.id, a);
        this.group.add(a.root);
      }
      a.update(mi, dt);
    }

    for (const [id, a] of this.actors) {
      if (seen.has(id)) continue;
      this.group.remove(a.root);
      this.actors.delete(id);
    }
  }
}

/** Minyon turune gore oyun birimi cinsinden boy. */
const MINION_HEIGHT: Record<Minion["minionKind"], number> = {
  melee: 13,
  caster: 12.5,
  cannon: 15,
  super: 18,
};

// ---------------------------------------------------------------------------
// Orman canavarlari
// ---------------------------------------------------------------------------

export class MonsterActor {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = "";
  private attackClip: string;
  private body: THREE.Group;
  private mats: THREE.MeshStandardMaterial[] = [];
  private baseEmissive: number[] = [];

  constructor(
    readonly monster: Monster,
    model: LoadedModel,
  ) {
    const cm = creatureModel(monster.spec.name);
    this.body = instantiate(model);
    const target = monster.radius * (monster.spec.epic ? 2.6 : 1.8);
    this.body.scale.setScalar(target / KAYKIT_HEIGHT);
    tintAll(this.body, colorOf(cm.body), monster.spec.epic ? colorOf(cm.accent) : 0x000000, 0.35);
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
    mergeSkinned(this.body);
    this.root.add(this.body);

    this.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mm of list) {
        const std = mm as THREE.MeshStandardMaterial;
        if (!std.emissive) continue;
        this.mats.push(std);
        this.baseEmissive.push(std.emissive.getHex());
      }
    });

    this.mixer = new THREE.AnimationMixer(this.body);
    for (const clip of model.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    this.attackClip = pickAttackClip(model);
    this.play("Idle");
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
    if (m.swing > 0.1) this.play(this.attackClip, 0.08);
    else if (m.speedNow > 45) this.play("Running_A");
    else if (m.speedNow > 6) this.play("Walking_A");
    else this.play("Idle");

    // Hasar alinca kisa beyaz parlama
    const f = clamp(m.hitFlash / 0.12, 0, 1);
    for (let i = 0; i < this.mats.length; i++) {
      const mm = this.mats[i];
      if (f > 0.01) mm.emissive.setRGB(f * 0.75, f * 0.7, f * 0.6);
      else if (mm.emissive.getHex() !== this.baseEmissive[i]) mm.emissive.setHex(this.baseEmissive[i]);
    }
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Yapilar
// ---------------------------------------------------------------------------

/** Yapilarda kullanilan hazir modeller (her takim icin ayri renk). */
export const STRUCTURE_PROPS = [
  "tower-a-blue", "tower-b-blue", "tower-c-blue", "inhibitor-blue", "nexus-blue",
  "tower-a-red", "tower-b-red", "tower-c-red", "inhibitor-red", "nexus-red",
  "rock-single-c", "rock-single-d",
];

/** Us cevresine konan hazir yapilar. */
export const BASE_PROPS = [
  "house-a-blue", "house-b-blue", "church-blue", "market-blue", "well-blue",
  "house-a-red", "house-b-red", "church-red", "market-red", "well-red",
];

export class StructureActor {
  readonly root = new THREE.Group();
  private crystal: THREE.Object3D | null = null;
  private glow: THREE.Mesh | null = null;
  private body: THREE.Object3D | null = null;
  private rubble: THREE.Object3D | null = null;
  private alivePart = new THREE.Group();
  private restY = 0;

  constructor(readonly s: Structure, props: PropLibrary) {
    const team = s.team === 0 ? "blue" : "red";
    const col = colorOf(TEAM_COLORS[s.team]);
    this.root.add(this.alivePart);
    const r = s.radius;

    // --- Hazir model govdesi ---
    let name: string;
    let height: number;
    if (s.kind === "tower") {
      name = s.tier >= 3 ? `tower-c-${team}` : s.tier === 2 ? `tower-b-${team}` : `tower-a-${team}`;
      height = r * (3.7 + s.tier * 0.3);
    } else if (s.kind === "inhibitor") {
      name = `inhibitor-${team}`;
      height = r * 2.15;
    } else {
      name = `nexus-${team}`;
      height = r * 2.6;
    }
    const body = props.clone(name, height);
    body.rotation.y = s.team === 0 ? Math.PI * 0.25 : Math.PI * 1.25;
    this.body = body;
    this.alivePart.add(body);
    this.restY = height + r * (s.kind === "tower" ? 0.35 : 0.6);

    // --- Takim kristali: hedef ve takim gostergesi ---
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(r * (s.kind === "tower" ? 0.3 : 0.55), 0),
      new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 1.6,
        roughness: 0.3,
      }),
    );
    crystal.scale.set(1, 1.4, 1);
    crystal.position.y = this.restY;
    this.crystal = crystal;
    this.glow = crystal;
    this.alivePart.add(crystal);

    this.alivePart.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    // --- Yikinti: hazir kaya modelleri ---
    const rubble = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + s.id;
      const chunk = props.clone(i % 2 === 0 ? "rock-single-c" : "rock-single-d", r * (0.4 + (i % 3) * 0.18));
      chunk.position.set(Math.cos(a) * r * 0.8, 0, Math.sin(a) * r * 0.8);
      chunk.rotation.y = i * 1.3;
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

    if (this.body && s.kind === "tower") {
      // Saldiri sirasinda hafif geri tepme
      this.body.position.y = -clamp(s.swing / 0.24, 0, 1) * s.radius * 0.1;
    }
    if (this.crystal) {
      this.crystal.rotation.y = time * 0.8;
      const want = this.restY + Math.sin(time * 1.4) * s.radius * 0.1;
      this.crystal.position.y += (want - this.crystal.position.y) * 0.2;
    }
    if (this.glow) {
      const m = this.glow.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = (1.2 + 0.5 * Math.sin(time * 3 + s.id)) * (s.invulnerable ? 0.5 : 1);
    }
  }
}

/** Modelde bulunan ilk uygun saldiri klibini secer. */
function pickAttackClip(model: LoadedModel): string {
  const prefs = [
    "1H_Melee_Attack_Chop",
    "Dualwield_Melee_Attack_Slice",
    "2H_Melee_Attack_Chop",
    "Spellcast_Shoot",
  ];
  for (const name of prefs) {
    if (model.animations.some((c) => c.name === name)) return name;
  }
  return model.animations[0]?.name ?? "Idle";
}
