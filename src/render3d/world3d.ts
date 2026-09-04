/**
 * Oyun dunyasini 3B sahneye baglayan katman.
 * Oyun mantigi tamamen 2B calisir; burada her karede sahne ona gore guncellenir.
 */
import * as THREE from "three";
import { clamp, type Vec2 } from "../core/math";
import { MAP_SIZE } from "../game/constants";
import type { World } from "../game/world";
import { BASE_PROPS, ChampionActor, MinionField, MonsterActor, STRUCTURE_PROPS, StructureActor } from "./actors";
import { AimIndicator, Fx3D } from "./fx3d";
import { loadModel, type LoadedModel } from "./assets";
import { Stage } from "./scene";
import { buildPortraits } from "./portrait3d";
import {
  PROP_NAMES,
  applyVisionToProps,
  buildTerrain,
  terrainHeight,
  type TerrainBuild,
} from "./terrain";
import { PropLibrary } from "./props";
import {
  CHAMPION_MODEL_FILES,
  CHAMPION_WEAPONS,
  MINION_MODELS,
  MINION_WEAPONS,
  MONSTER_MODELS,
  loadoutOf,
} from "./loadout";

export class World3D {
  readonly stage: Stage;
  readonly fx = new Fx3D();
  readonly aim = new AimIndicator();

  private terrain: TerrainBuild | null = null;
  private props = new PropLibrary();
  /** Yuklenen iskeletli karakter modelleri (dosya adi -> model). */
  private characters = new Map<string, LoadedModel>();
  private loaded = false;

  private champions = new Map<number, ChampionActor>();
  private monsters = new Map<number, MonsterActor>();
  private structures = new Map<number, StructureActor>();
  private minions = new MinionField();
  private matchGroup = new THREE.Group();

  private explored: Float32Array;
  private current: Float32Array;
  private visionFrame = 0;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new Stage(canvas);
    this.stage.scene.add(this.fx.group);
    this.stage.scene.add(this.aim.group);
    this.stage.scene.add(this.matchGroup);
    this.matchGroup.add(this.minions.group);
    const n = 96 * 96;
    this.explored = new Float32Array(n);
    this.current = new Float32Array(n);
  }

  /** Modelleri ve araziyi hazirlar. */
  async prepare(onProgress?: (msg: string) => void): Promise<void> {
    onProgress?.("Harita modelleri yukleniyor...");
    const names = [...new Set([
      ...PROP_NAMES, ...STRUCTURE_PROPS, ...BASE_PROPS,
      ...Object.values(MINION_WEAPONS), ...CHAMPION_WEAPONS,
    ])];
    await this.props.load(names, (done, total) => {
      onProgress?.(`Harita modelleri yukleniyor... ${done}/${total}`);
    });
    onProgress?.("Arazi olusturuluyor...");
    this.terrain = buildTerrain(this.props);
    applyVisionToProps(this.terrain.decor, this.terrain.visionTexture);
    this.stage.scene.add(this.terrain.group);
    onProgress?.("Karakter modelleri yukleniyor...");
    const charFiles = [
      ...new Set([
        ...CHAMPION_MODEL_FILES,
        ...Object.values(MINION_MODELS),
        ...MONSTER_MODELS,
      ]),
    ];
    let done = 0;
    for (const file of charFiles) {
      this.characters.set(file, await loadModel(`${file}.glb`));
      onProgress?.(`Karakter modelleri yukleniyor... ${++done}/${charFiles.length}`);
    }
    this.minions.build(this.characters, this.weaponSources());

    onProgress?.("Portreler hazirlaniyor...");
    buildPortraits(this.characters);
    this.loaded = true;
    onProgress?.("Hazir");
  }

  /** Minyonlarin eline takilacak hazir silahlarin sablonlari. */
  private weaponSources(): Map<string, THREE.Object3D> {
    const out = new Map<string, THREE.Object3D>();
    for (const name of new Set(Object.values(MINION_WEAPONS))) {
      if (!this.props.has(name)) continue;
      // Minyon boyunun yaklasik yarisi kadar (dunya birimi)
      out.set(name, this.props.clone(name, 8));
    }
    return out;
  }

  get ready(): boolean {
    return this.loaded && !!this.terrain;
  }

  /** Yeni mac icin sahneyi kurar. */
  attach(world: World): void {
    this.clearMatch();
    if (!this.loaded) return;

    for (const c of world.champions) {
      const lo = loadoutOf(c.def.id);
      const model = this.characters.get(lo.model);
      if (!model) continue;
      const a = new ChampionActor(c, model, lo, this.props, c.isPlayer);
      this.champions.set(c.id, a);
      this.matchGroup.add(a.root);
    }
    for (const m of world.monsters) {
      const file = m.spec.epic
        ? MONSTER_MODELS[0]
        : m.spec.buff === "blue"
          ? MONSTER_MODELS[1]
          : m.spec.buff === "red"
            ? MONSTER_MODELS[0]
            : MONSTER_MODELS[(m.id % 2) + 1];
      const model = this.characters.get(file) ?? this.characters.get(MONSTER_MODELS[0]);
      if (!model) continue;
      const a = new MonsterActor(m, model);
      this.monsters.set(m.id, a);
      this.matchGroup.add(a.root);
    }
    for (const s of world.structures) {
      const a = new StructureActor(s, this.props);
      this.structures.set(s.id, a);
      this.matchGroup.add(a.root);
    }
    this.explored.fill(0);
    this.stage.snapTo(world.player.pos);
  }

  private clearMatch(): void {
    for (const a of this.champions.values()) this.matchGroup.remove(a.root);
    for (const a of this.monsters.values()) this.matchGroup.remove(a.root);
    for (const a of this.structures.values()) this.matchGroup.remove(a.root);
    this.champions.clear();
    this.monsters.clear();
    this.structures.clear();
  }

  resize(w: number, h: number): void {
    this.stage.resize(w, h);
  }

  setQuality(q: "low" | "high"): void {
    this.stage.setQuality(q);
  }

  follow(p: Vec2, lerpAmount: number): void {
    this.stage.follow(p, lerpAmount);
  }

  toScreen(x: number, y: number, height = 0): Vec2 {
    return this.stage.toScreen(x, y, height);
  }

  toWorld(sx: number, sy: number): Vec2 {
    return this.stage.toWorld(sx, sy);
  }

  isBehind(x: number, y: number, height = 0): boolean {
    return this.stage.isBehind(x, y, height);
  }

  groundHeight(x: number, y: number): number {
    return terrainHeight(x, y);
  }

  get vw(): number {
    return this.stage.vw;
  }
  get vh(): number {
    return this.stage.vh;
  }

  update(world: World, dt: number): void {
    this.time += dt;
    const team = world.player.team;

    for (const c of world.champions) {
      const a = this.champions.get(c.id);
      if (!a) continue;
      a.update(dt, this.time);
      if (c.team !== team && !c.visibleTo[team]) a.root.visible = false;
    }
    for (const m of world.monsters) {
      this.monsters.get(m.id)?.update(dt);
    }
    for (const s of world.structures) {
      this.structures.get(s.id)?.update(this.time);
    }
    this.minions.update(world.minions, team, dt);
    this.fx.update(world, this.time);

    if (++this.visionFrame % 2 === 0) this.updateVision(world);
  }

  /** Savas sisi maskesini muttefik gorus alanindan gunceller. */
  private updateVision(world: World): void {
    const t = this.terrain;
    if (!t) return;
    const N = t.visionSize;
    const cell = MAP_SIZE / N;
    this.current.fill(0);
    const team = world.player.team;

    for (const u of world.allUnits()) {
      if (!u.alive || u.team !== team) continue;
      const r = u.stats.sightRange;
      const cx = u.pos.x / cell;
      const cy = u.pos.y / cell;
      const cr = r / cell;
      const x0 = Math.max(0, Math.floor(cx - cr));
      const x1 = Math.min(N - 1, Math.ceil(cx + cr));
      const y0 = Math.max(0, Math.floor(cy - cr));
      const y1 = Math.min(N - 1, Math.ceil(cy + cr));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const d = Math.sqrt(dx * dx + dy * dy) / cr;
          if (d > 1) continue;
          const v = clamp(1.25 - d * 1.25, 0, 1);
          const i = y * N + x;
          if (v > this.current[i]) this.current[i] = v;
        }
      }
    }

    const data = t.visionData;
    for (let i = 0; i < data.length; i++) {
      const cur = this.current[i];
      if (cur > this.explored[i]) this.explored[i] = cur;
      const v = Math.max(cur, this.explored[i] * 0.42);
      data[i] = Math.round(clamp(v, 0, 1) * 255);
    }
    t.visionTexture.needsUpdate = true;
  }

  render(): void {
    this.stage.render();
  }
}
