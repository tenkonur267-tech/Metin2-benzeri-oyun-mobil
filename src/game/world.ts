import { sfx } from "../core/audio";
import { clamp, dist, dist2, dirTo, norm, type Vec2 } from "../core/math";
import { Rng } from "../core/rng";
import {
  BUSHES,
  CAMPS,
  CONFIG,
  LANES,
  MAP_SIZE,
  NEXUS_POS,
  SPAWN_POS,
  TEAM_NAMES,
  inhibSpecs,
  lanePath,
  towerSpecs,
} from "./constants";
import { CHAMPIONS, getChampion } from "./champions";
import { updateAI } from "./ai";
import { Champion } from "./champion";
import { Fx } from "./fx";
import { findPath, hasLineOfSight } from "./grid";
import { Minion, Monster, Structure, Unit, resetIds } from "./units";
import { makeProjectile, type Projectile, type Zone } from "./projectile";
import type { CombatEvent, Lane, MinionKind, Team } from "./types";

export interface WorldOptions {
  playerChampionId: string;
  seed?: number;
  /** Bot zorlugu 0..2 */
  difficulty?: number;
}

export interface TeamState {
  kills: number;
  gold: number;
  towers: number;
  dragons: number;
  barons: number;
  baronTimer: number;
}

export class World {
  time = 0;
  rng: Rng;
  fx = new Fx();
  difficulty: number;

  champions: Champion[] = [];
  minions: Minion[] = [];
  structures: Structure[] = [];
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];

  nexus: Record<Team, Structure> = {} as Record<Team, Structure>;
  inhibitors: Structure[] = [];

  player!: Champion;
  winner: Team | null = null;
  /**
   * Ekran ortasinda gosterilecek buyuk bildirimler (ilk kan, coklu
   * kirim, seri...). HUD her karede suresi dolanlari atar.
   */
  announcements: { text: string; sub: string; color: string; life: number; maxLife: number }[] = [];
  /** Ilk kan alindi mi. */
  private firstBlood = false;
  events: CombatEvent[] = [];

  teams: [TeamState, TeamState] = [
    { kills: 0, gold: 0, towers: 0, dragons: 0, barons: 0, baronTimer: 0 },
    { kills: 0, gold: 0, towers: 0, dragons: 0, barons: 0, baronTimer: 0 },
  ];

  private waveTimer: number = CONFIG.firstWaveDelay;

  /** 12. dakikadan sonra yapilar giderek daha kirilgan olur (mac uzamasin). */
  get structureDamageMultiplier(): number {
    return 1 + Math.max(0, (this.time - 720) / 60) * 0.12;
  }
  private waveCount = 0;
  private unitById = new Map<number, Unit>();

  constructor(opts: WorldOptions) {
    this.rng = new Rng(opts.seed ?? (Date.now() >>> 0));
    this.difficulty = opts.difficulty ?? 1;
    resetIds();
    this.buildStructures();
    this.buildMonsters();
    this.buildTeams(opts.playerChampionId);
    this.reindex();
  }

  // -------------------------------------------------------------------------
  // Kurulum
  // -------------------------------------------------------------------------

  private buildStructures(): void {
    for (const team of [0, 1] as Team[]) {
      const byLane: Record<Lane, Structure[]> = { top: [], mid: [], bot: [] };
      const nexusTowers: Structure[] = [];

      for (const spec of towerSpecs(team)) {
        const t = new Structure("tower", team, spec.pos, spec.lane, spec.tier);
        this.structures.push(t);
        if (spec.tier === 4) nexusTowers.push(t);
        else byLane[spec.lane].push(t);
      }
      // Koruma zinciri: dis kule yikilmadan icteki hasar almaz
      for (const lane of LANES) {
        const arr = byLane[lane].sort((a, b) => a.tier - b.tier);
        for (let i = 1; i < arr.length; i++) arr[i].protectedBy = arr[i - 1];
      }

      const inhibs: Structure[] = [];
      for (const spec of inhibSpecs(team)) {
        const inhib = new Structure("inhibitor", team, spec.pos, spec.lane, 3);
        const t3 = byLane[spec.lane].find((t) => t.tier === 3) ?? null;
        inhib.protectedBy = t3;
        this.structures.push(inhib);
        this.inhibitors.push(inhib);
        inhibs.push(inhib);
      }

      const nx = new Structure("nexus", team, NEXUS_POS[team], "mid", 4);
      this.structures.push(nx);
      this.nexus[team] = nx;

      // Ana bina kuleleri, bir engelleyici yikilana kadar korumali
      for (const nt of nexusTowers) {
        nt.protectedBy = null;
        (nt as Structure & { guardInhibs?: Structure[] }).guardInhibs = inhibs;
      }
      (nx as Structure & { guardTowers?: Structure[] }).guardTowers = nexusTowers;
    }
  }

  private buildMonsters(): void {
    for (const spec of CAMPS) {
      const m = new Monster(spec);
      m.alive = false;
      m.respawnTimer = spec.epic ? (spec.epic === "baron" ? 300 : 180) : 20;
      this.monsters.push(m);
    }
  }

  private buildTeams(playerChampionId: string): void {
    const pool = CHAMPIONS.map((c) => c.id).filter((id) => id !== playerChampionId);
    this.rng.shuffle(pool);

    const laneOrder: Lane[] = ["top", "mid", "bot", "bot", "top"];
    const playerDef = getChampion(playerChampionId);

    // Mavi takim (oyuncu)
    this.player = new Champion(playerDef, 0, true, "Sen");
    this.player.lane = playerDef.preferredLane;
    this.champions.push(this.player);

    const usedBlue = [playerChampionId];
    for (let i = 0; i < CONFIG.teamSize - 1; i++) {
      const id = pool.pop() ?? this.rng.pick(CHAMPIONS).id;
      usedBlue.push(id);
      const c = new Champion(getChampion(id), 0, false);
      c.lane = laneOrder[i % laneOrder.length];
      this.champions.push(c);
    }

    // Kirmizi takim
    const redPool = CHAMPIONS.map((c) => c.id);
    this.rng.shuffle(redPool);
    for (let i = 0; i < CONFIG.teamSize; i++) {
      const id = redPool.pop() ?? this.rng.pick(CHAMPIONS).id;
      const c = new Champion(getChampion(id), 1, false);
      c.lane = laneOrder[i % laneOrder.length];
      this.champions.push(c);
    }

    // Baslangic koridor dagilimi (her koridorda en az bir kisi)
    for (const team of [0, 1] as Team[]) {
      const list = this.champions.filter((c) => c.team === team);
      const lanes: Lane[] = ["top", "mid", "bot", "bot", "top"];
      list.forEach((c, i) => (c.lane = lanes[i] ?? "mid"));
    }

    for (const c of this.champions) {
      c.pos = { ...SPAWN_POS[c.team] };
      c.pos.x += this.rng.range(-26, 26);
      c.pos.y += this.rng.range(-26, 26);
    }
  }

  private reindex(): void {
    this.unitById.clear();
    for (const u of this.allUnits()) this.unitById.set(u.id, u);
  }

  // -------------------------------------------------------------------------
  // Erisim
  // -------------------------------------------------------------------------

  *allUnits(): Generator<Unit> {
    for (const c of this.champions) yield c;
    for (const m of this.minions) yield m;
    for (const s of this.structures) yield s;
    for (const m of this.monsters) yield m;
  }

  getUnit(id: number): Unit | undefined {
    return this.unitById.get(id);
  }

  teamName(t: Team): string {
    return TEAM_NAMES[t];
  }

  log(text: string, color = "#dce8f5"): void {
    this.events.push({ text, time: this.time, color });
    if (this.events.length > 60) this.events.shift();
  }

  pathTo(from: Vec2, to: Vec2): Vec2[] {
    const p = findPath(from, to);
    return p.length > 0 ? p : [{ x: to.x, y: to.y }];
  }

  // -------------------------------------------------------------------------
  // Hedefleme yardimcilari
  // -------------------------------------------------------------------------

  /** Belirtilen yaricapta dusman birimler. */
  enemiesInRadius(team: Team, pos: Vec2, radius: number, includeStructures = true): Unit[] {
    const out: Unit[] = [];
    const r2 = radius * radius;
    for (const u of this.allUnits()) {
      if (!u.alive || u.team === team) continue;
      if (!includeStructures && u.isStructure) continue;
      if (dist2(u.pos, pos) <= r2 + u.radius * u.radius) out.push(u);
    }
    return out;
  }

  alliesInRadius(team: Team, pos: Vec2, radius: number, championsOnly = true): Unit[] {
    const out: Unit[] = [];
    const r2 = radius * radius;
    const src: Unit[] = championsOnly ? this.champions : [...this.champions, ...this.minions];
    for (const u of src) {
      if (!u.alive || u.team !== team) continue;
      if (dist2(u.pos, pos) <= r2) out.push(u);
    }
    return out;
  }

  nearestEnemyChampion(team: Team, pos: Vec2, maxRange = Infinity): Champion | null {
    let best: Champion | null = null;
    let bd = maxRange * maxRange;
    for (const c of this.champions) {
      if (!c.alive || c.team === team) continue;
      const d = dist2(c.pos, pos);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

/**
   * Minyonun hedefi: menzil icindeki **en yakin** dusman.
   * Tur onceligi yoktur; yanindaki dusmani birakip uzaktakine yurumez.
   */
  findMinionTarget(m: Minion): Unit | null {
    let best: Unit | null = null;
    let bd = Infinity;
    const R = 210;
    for (const u of this.allUnits()) {
      if (!u.alive || u.team === m.team) continue;
      if (u.kind === "monster") continue;
      // Dokunulmaz yapilar (henuz acilmamis kuleler) hedeflenmez
      if (u.isStructure && (u as Structure).invulnerable) continue;
      const d = dist(u.pos, m.pos) - u.radius;
      if (d > R) continue;
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  findTowerTarget(t: Structure): Unit | null {
    const range = t.stats.attackRange + t.radius;

    // Kule korumasi: muttefik sampiyona saldiran dusman kilitlenir ve
    // menzilden cikana kadar birakilmaz.
    if (t.aggroTimer > 0) {
      const locked = this.getUnit(t.aggroId);
      if (locked && locked.alive && dist(locked.pos, t.pos) <= range + locked.radius) return locked;
      t.aggroTimer = 0;
    }

    let minion: Unit | null = null;
    let minionD = Infinity;
    let champ: Unit | null = null;
    let champD = Infinity;
    let aggressor: Unit | null = null;

    for (const u of this.allUnits()) {
      if (!u.alive || u.team === t.team || u.isStructure || u.kind === "monster") continue;
      const d = dist(u.pos, t.pos);
      if (d > range + u.radius) continue;
      if (u.kind === "minion") {
        if (d < minionD) {
          minionD = d;
          minion = u;
        }
      } else if (u.kind === "champion") {
        if (d < champD) {
          champD = d;
          champ = u;
        }
        // Muttefik sampiyona saldiran dusman onceliklidir
        const tgt = u.target;
        if (tgt && tgt.kind === "champion" && tgt.team === t.team && this.time - (tgt.recentDamage.get(u.id) ?? -9) < 2.5) {
          aggressor = u;
        }
      }
    }
    if (aggressor) {
      const isNew = t.aggroId !== aggressor.id;
      t.aggroId = aggressor.id;
      t.aggroTimer = 4;
      if (isNew && aggressor.kind === "champion" && (aggressor as Champion).isPlayer) {
        this.log("Kule seni hedef aldi!", "#ff9b8f");
        sfx.play("tower");
      }
    }
    return aggressor ?? minion ?? champ;
  }

/**
   * Orman canavarinin hedefi: kendisine yakin zamanda vuran veya
   * kampina fazla sokulan birimlerden **en yakin** olani.
   */
  findMonsterTarget(m: Monster): Unit | null {
    let best: Unit | null = null;
    let bd = Infinity;

    for (const c of this.champions) {
      if (!c.alive) continue;
      const d = dist(c.pos, m.pos) - c.radius;
      const provoked = this.time - (m.recentDamage.get(c.id) ?? -99) < 6;
      if (d < 175 && provoked && d < bd) {
        bd = d;
        best = c;
      }
    }
    for (const mi of this.minions) {
      if (!mi.alive) continue;
      const d = dist(mi.pos, m.pos) - mi.radius;
      if (d < 90 && d < bd) {
        bd = d;
        best = mi;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Mermiler ve alanlar
  // -------------------------------------------------------------------------

  spawnAutoProjectile(attacker: Unit, target: Unit, damage: number, crit: boolean, slow?: number): void {
    const p = makeProjectile({
      team: attacker.team,
      sourceId: attacker.id,
      pos: { x: attacker.pos.x, y: attacker.pos.y },
      dir: dirTo(attacker.pos, target.pos),
      speed: 520,
      damage,
      damageType: "physical",
      isAuto: true,
      crit,
      homing: target,
      range: 700,
      radius: 9,
      color: attacker.kind === "champion" ? (attacker as Champion).def.color : "#d6e6ff",
      label: "saldiri",
      shape: "arrow",
      slow,
      slowTime: 1.5,
    });
    this.projectiles.push(p);
  }

  spawnTowerShot(tower: Structure, target: Unit, damage: number): void {
    this.projectiles.push(
      makeProjectile({
        team: tower.team,
        sourceId: tower.id,
        pos: { x: tower.pos.x, y: tower.pos.y - 12 },
        dir: dirTo(tower.pos, target.pos),
        speed: 430,
        damage,
        damageType: "true",
        isAuto: true,
        homing: target,
        range: 700,
        radius: 9,
        color: tower.team === 0 ? "#7fd0ff" : "#ff9b8f",
        label: "kule",
        shape: "orb",
      }),
    );
  }

  addProjectile(p: Projectile): void {
    this.projectiles.push(p);
  }

  addZone(z: Zone): void {
    this.zones.push(z);
  }

  // -------------------------------------------------------------------------
  // Olum ve oduller
  // -------------------------------------------------------------------------

  onUnitDeath(unit: Unit, killer: Unit | null, label?: string): void {
    if (!unit.alive) return;
    unit.alive = false;
    unit.path.length = 0;
    unit.target = null;
    unit.windupTarget = null;
    unit.dash = null;

    if (unit.kind === "minion") {
      const m = unit as Minion;
      this.fx.death(unit.pos, "#c9d6e6");
      this.grantMinionRewards(m, killer);
      return;
    }

    if (unit.kind === "monster") {
      const mo = unit as Monster;
      mo.respawnTimer = mo.spec.respawn;
      this.fx.death(unit.pos, "#a8e08a");
      this.grantMonsterRewards(mo, killer);
      return;
    }

    if (unit.isStructure) {
      const s = unit as Structure;
      this.fx.death(unit.pos, "#ffd27a");
      this.fx.ring(unit.pos, 90, "#ffb347", 0.9, 5);
      sfx.play("tower");
      this.onStructureDestroyed(s, killer);
      return;
    }

    if (unit.kind === "champion") {
      const c = unit as Champion;
      c.deaths++;
      c.killStreak = 0;
      c.respawnTimer = c.deathTime();
      c.effects.length = 0;
      c.recallTimer = 0;
      this.fx.death(c.pos, c.def.color);
      if (c.isPlayer) sfx.play("death");
      else if (killer && killer.kind === "champion" && (killer as Champion).isPlayer) sfx.play("kill");
      this.grantChampionKill(c, killer, label);
    }
  }

  /**
   * Altin ve tecrube minyon oldugunde dagitilir.
   *
   * Son vurusu bir minyon veya kule yapmis olsa bile altin, minyona
   * en son vuran sampiyona gider (`CREDIT_WINDOW` icinde vurmussa).
   * Boylece altin hicbir zaman "kaybolmaz" ve minyonlara gitmez.
   */
  private grantMinionRewards(m: Minion, killer: Unit | null): void {
    const gold = m.goldValue();
    const xp = m.xpValue();

    /** Son vurusu sampiyona baglamak icin sure penceresi (saniye). */
    const CREDIT_WINDOW = 8;
    let credit: Champion | null =
      killer && killer.kind === "champion" ? (killer as Champion) : null;
    if (!credit && m.lastChampionHitAgo <= CREDIT_WINDOW) {
      const u = this.getUnit(m.lastChampionHit);
      if (u && u.kind === "champion" && u.team !== m.team) credit = u as Champion;
    }

    if (credit) {
      credit.addGold(gold);
      credit.cs++;
      this.teams[credit.team].gold += gold;
      this.fx.goldNumber(m.pos, gold);
      if (credit.isPlayer) sfx.play("coin");
    }

    // Tecrube cevredeki tum dusman sampiyonlara paylastirilir
    const nearby = this.champions.filter(
      (c) => c.alive && c.team !== m.team && dist(c.pos, m.pos) < 240,
    );
    if (nearby.length > 0) {
      const share = xp / Math.max(1, nearby.length * 0.75);
      for (const c of nearby) c.gainXp(this, share);
    }
    // Son vurus odulu: minyonu kesen sampiyon ek tecrube alir
    if (credit && credit.alive) credit.gainXp(this, xp * CONFIG.lastHitXpBonus);
  }

  private grantMonsterRewards(mo: Monster, killer: Unit | null): void {
    if (!killer || killer.kind !== "champion") return;
    const c = killer as Champion;
    const spec = mo.spec;
    if (spec.epic) {
      const t = c.team;
      if (spec.epic === "dragon") {
        this.teams[t].dragons++;
        this.log(`${this.teamName(t)} takim EJDERHA'yi aldi! (${this.teams[t].dragons})`, "#ffb347");
      } else {
        this.teams[t].barons++;
        this.teams[t].baronTimer = 180;
        this.log(`${this.teamName(t)} takim KADIM EJDER'i aldi!`, "#c9a0ff");
      }
      for (const m of this.champions) {
        if (m.team === t) {
          m.addGold(spec.gold);
          m.gainXp(this, spec.xp);
        }
      }
      this.syncEpicBuffs();
    } else {
      c.addGold(spec.gold);
      c.gainXp(this, spec.xp);
      this.fx.goldNumber(mo.pos, spec.gold);
      if (spec.buff) this.grantJungleBuff(c, spec.buff);
    }
  }

  /**
   * Orman buff kamplari (LoL'deki mavi/kizil buff karsiligi).
   * Mavi: mana yenilenmesi ve bekleme suresi hissi icin hizlanma + iyilesme.
   * Kizil: saldiri gucu ve can calma.
   */
  private grantJungleBuff(c: Champion, buff: "blue" | "red" | "scuttle"): void {
    const time = CONFIG.jungleBuffTime;
    if (buff === "scuttle") {
      // LoL'deki Kacak Yengec gibi: kisa sureli hiz ve gorus
      c.addEffect({ id: "buffScuttle", kind: "haste", time: 45, value: 0.15, label: "🦀", color: "#7fe0c8" });
      c.addEffect({ id: "buffScuttleEye", kind: "reveal", time: 45, value: 1, label: "", color: "#7fe0c8" });
      this.log(`${c.displayName()} Kacak Yengec'i aldi`, "#7fe0c8");
      return;
    }
    if (buff === "blue") {
      c.addEffect({ id: "buffBlue", kind: "haste", time, value: 0.12, label: "💙", color: "#6fa8ff" });
      c.addEffect({ id: "buffBlueHeal", kind: "heal", time, value: 6, label: "", color: "#6fa8ff" });
      this.log(`${c.displayName()} Mavi Muhafiz buffini aldi`, "#6fa8ff");
    } else {
      c.addEffect({ id: "buffRed", kind: "adBuff", time, value: 14, label: "❤️", color: "#ff7a5c" });
      c.addEffect({ id: "buffRedLs", kind: "lifestealBuff", time, value: 0.1, label: "", color: "#ff7a5c" });
      this.log(`${c.displayName()} Kizil Yaban buffini aldi`, "#ff7a5c");
    }
  }

  private onStructureDestroyed(s: Structure, killer: Unit | null): void {
    const enemy: Team = s.team === 0 ? 1 : 0;
    if (s.kind === "tower") {
      this.teams[enemy].towers++;
      this.log(`${this.teamName(s.team)} takimin ${s.lane.toUpperCase()} kulesi yikildi!`, "#ffd27a");
      if (killer && killer.kind === "champion") {
        (killer as Champion).addGold(CONFIG.towerLocalGold);
      }
      for (const c of this.champions) {
        if (c.team === enemy) c.addGold(CONFIG.towerGold / CONFIG.teamSize);
      }
    } else if (s.kind === "inhibitor") {
      s.respawnTimer = CONFIG.inhibRespawn;
      this.log(`${this.teamName(s.team)} takimin ${s.lane.toUpperCase()} engelleyicisi yikildi!`, "#ff9b8f");
      for (const c of this.champions) if (c.team === enemy) c.addGold(150);
    } else if (s.kind === "nexus") {
      this.winner = enemy;
      this.log(`${this.teamName(enemy)} takim ZAFERI kazandi!`, "#ffe08a");
      sfx.play(enemy === this.player.team ? "win" : "lose");
    }
  }

  /** Ekran ortasi bildirim ekler. */
  announce(text: string, sub: string, color: string, life = 2.6): void {
    this.announcements.push({ text, sub, color, life, maxLife: life });
    if (this.announcements.length > 4) this.announcements.shift();
  }

  private grantChampionKill(victim: Champion, killer: Unit | null, label?: string): void {
    const bounty = CONFIG.championKillGold + Math.min(300, victim.killStreak * CONFIG.shutdownBonus);
    let killerChamp: Champion | null = null;
    if (killer && killer.kind === "champion") killerChamp = killer as Champion;

    if (killerChamp) {
      killerChamp.kills++;
      killerChamp.killStreak++;
      killerChamp.addGold(bounty);
      killerChamp.gainXp(this, 220 + victim.level * 24);
      this.teams[killerChamp.team].kills++;
      this.fx.goldNumber(victim.pos, bounty);
      const streakMsg =
        killerChamp.killStreak >= 5
          ? " DURDURULAMIYOR!"
          : killerChamp.killStreak >= 3
            ? " SERI!"
            : "";
      this.log(`${killerChamp.displayName()} → ${victim.displayName()}${streakMsg}`, killerChamp.team === 0 ? "#7fd0ff" : "#ff9b8f");

      // --- Ekran ortasi bildirim ---
      const mine = killerChamp.team === this.player.team;
      const col = mine ? "#ffd24a" : "#ff7a6a";
      // Kisa sure icinde ust uste kirimlar coklu sayilir
      killerChamp.multiKill = this.time - killerChamp.lastKillAt < 10 ? killerChamp.multiKill + 1 : 1;
      killerChamp.lastKillAt = this.time;
      const multi = ["", "", "CIFTE KIRIM", "UCLU KIRIM", "DORTLU KIRIM", "PENTA KILL"][
        Math.min(5, killerChamp.multiKill)
      ];

      if (!this.firstBlood) {
        this.firstBlood = true;
        this.announce("ILK KAN", killerChamp.displayName(), "#ff6a4a", 3);
      } else if (multi) {
        this.announce(multi, killerChamp.displayName(), col, 3);
      } else if (killerChamp.killStreak >= 3) {
        this.announce(streakMsg.trim(), killerChamp.displayName(), col, 2.4);
      } else if (killerChamp.isPlayer || victim.isPlayer) {
        this.announce(
          killerChamp.isPlayer ? "KIRIM" : "OLDURULDUN",
          killerChamp.isPlayer ? victim.displayName() : killerChamp.displayName(),
          killerChamp.isPlayer ? "#ffd24a" : "#ff7a6a",
          2,
        );
      }
    } else {
      const t: Team = victim.team === 0 ? 1 : 0;
      this.teams[t].kills++;
      this.log(`${victim.displayName()} oldu`, "#9fb3c8");
    }

    // Yardimlar
    for (const [id, t] of victim.recentDamage) {
      if (this.time - t > 10) continue;
      const u = this.getUnit(id);
      if (!u || u.kind !== "champion") continue;
      const c = u as Champion;
      if (c === killerChamp || c.team === victim.team) continue;
      c.assists++;
      c.addGold(CONFIG.assistGold);
      c.gainXp(this, 110 + victim.level * 12);
      if (c.isPlayer) this.announce("ASIST", victim.displayName(), "#8fd8ff", 1.8);
    }
    victim.recentDamage.clear();
  }

  respawnChampion(c: Champion): void {
    c.alive = true;
    c.pos = { ...SPAWN_POS[c.team] };
    c.pos.x += this.rng.range(-22, 22);
    c.pos.y += this.rng.range(-22, 22);
    c.computeStats();
    c.hp = c.stats.maxHp;
    c.mp = c.stats.maxMp;
    c.effects.length = 0;
    c.path.length = 0;
    c.target = null;
    c.recentDamage.clear();
    this.syncEpicBuffs();
  }

  /** Ejderha/Kadim Ejder guclendirmelerini sampiyonlara uygular. */
  private syncEpicBuffs(): void {
    for (const team of [0, 1] as Team[]) {
      const st = this.teams[team];
      for (const c of this.champions) {
        if (c.team !== team || !c.alive) continue;
        c.removeEffect("dragonAd");
        c.removeEffect("dragonAp");
        c.removeEffect("baronAd");
        c.removeEffect("baronAp");
        c.removeEffect("dragonArmor");
        c.removeEffect("dragonHaste");
        c.removeEffect("baronHaste");
        if (st.dragons > 0) {
          // Her ejderha yigini: saldiri, yetenek, dayaniklilik ve hiz
          const n = st.dragons;
          const soul = n >= 4 ? 1.6 : 1;
          c.addEffect({ id: "dragonAd", kind: "adBuff", time: 1e9, value: n * 7 * soul, label: "🐉", color: "#ffb347" });
          c.addEffect({ id: "dragonAp", kind: "apBuff", time: 1e9, value: n * 10 * soul, label: "", color: "#ffb347" });
          c.addEffect({ id: "dragonArmor", kind: "armorBuff", time: 1e9, value: n * 6 * soul, label: "", color: "#ffb347" });
          c.addEffect({ id: "dragonHaste", kind: "haste", time: 1e9, value: n * 0.02 * soul, label: "", color: "#ffb347" });
        }
        if (st.baronTimer > 0) {
          c.addEffect({ id: "baronAd", kind: "adBuff", time: st.baronTimer, value: 28, label: "🐲", color: "#c9a0ff" });
          c.addEffect({ id: "baronAp", kind: "apBuff", time: st.baronTimer, value: 36, label: "", color: "#c9a0ff" });
          c.addEffect({ id: "baronHaste", kind: "haste", time: st.baronTimer, value: 0.12, label: "", color: "#c9a0ff" });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Minyon dalgalari
  // -------------------------------------------------------------------------

  private spawnWave(): void {
    this.waveCount++;
    const minutes = this.time / 60;
    const scale = 1 + minutes * 0.09;
    const withCannon = this.waveCount % CONFIG.cannonEveryNWaves === 0;

    for (const team of [0, 1] as Team[]) {
      for (const lane of LANES) {
        const path = lanePath(team, lane);
        const enemyInhibDown = this.inhibitors.some(
          (i) => i.team !== team && i.lane === lane && !i.alive,
        );
        const kinds: MinionKind[] = ["melee", "melee", "melee", "caster", "caster", "caster"];
        if (withCannon) kinds.push("cannon");
        if (enemyInhibDown) kinds.push("super");

        // Minyonlar koridorun ilk bacaginda sirayla dizilir; boylece
        // uc koridorun dogus noktasi usse yigilmaz.
        const d = norm({ x: path[1].x - path[0].x, y: path[1].y - path[0].y });
        kinds.forEach((kind, i) => {
          const m = new Minion(team, kind, lane, path, scale);
          const off = 34 + i * 16;
          m.pos = {
            x: path[0].x + d.x * off + this.rng.range(-7, 7),
            y: path[0].y + d.y * off + this.rng.range(-7, 7),
          };
          m.wpIndex = 1;
          this.minions.push(m);
          this.unitById.set(m.id, m);
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Gorunurluk
  // -------------------------------------------------------------------------

  bushAt(p: Vec2): number {
    for (let i = 0; i < BUSHES.length; i++) {
      const b = BUSHES[i];
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx * dx + dy * dy < b.r * b.r) return i;
    }
    return -1;
  }

  private updateVision(): void {
    const observers: Unit[][] = [[], []];
    for (const u of this.allUnits()) {
      if (!u.alive) continue;
      observers[u.team].push(u);
    }

    for (const u of this.allUnits()) {
      u.visibleTo[u.team] = true;
      const enemy: Team = u.team === 0 ? 1 : 0;
      if (!u.alive) {
        u.visibleTo[enemy] = false;
        continue;
      }
      if (u.isStructure) {
        u.visibleTo[enemy] = true;
        continue;
      }
      const bush = u.kind === "champion" ? this.bushAt(u.pos) : -1;
      // Calida saldiri yapmak gizlenmeyi kisa sureligine bozar (LoL kurali)
      const revealedByAttack = bush >= 0 && u.outOfAttack < 1.5;
      let seen = false;
      for (const o of observers[enemy]) {
        const d = dist(o.pos, u.pos);
        if (d > o.stats.sightRange) continue;
        if (bush >= 0 && !revealedByAttack) {
          // Caliyi ancak icine giren gorur
          if (this.bushAt(o.pos) !== bush) continue;
        }
        if (!o.isStructure && d > 90 && !hasLineOfSight(o.pos, u.pos)) continue;
        seen = true;
        break;
      }
      if (u.hasEffect("stealth")) seen = false;
      if (u.hasEffect("reveal")) seen = true;
      u.visibleTo[enemy] = seen;
    }
  }

  // -------------------------------------------------------------------------
  // Ana guncelleme
  // -------------------------------------------------------------------------

  update(dt: number): void {
    if (this.winner !== null) {
      this.fx.update(dt);
      return;
    }
    this.time += dt;

    // Ekran ortasi bildirimlerin omru
    if (this.announcements.length > 0) {
      for (const a of this.announcements) a.life -= dt;
      this.announcements = this.announcements.filter((a) => a.life > 0);
    }

    // Dalga zamanlayici
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer = CONFIG.minionWaveInterval;
      this.spawnWave();
    }

    // Pasif altin ve tecrube
    const passive = CONFIG.passiveGoldPerSec * dt;
    for (const c of this.champions) {
      c.addGold(passive);
      if (c.alive) c.gainXp(this, 2.6 * dt);
    }

    // Kadim ejder guclendirme sayaci
    for (const t of [0, 1] as Team[]) {
      if (this.teams[t].baronTimer > 0) {
        this.teams[t].baronTimer -= dt;
        if (this.teams[t].baronTimer <= 0) this.syncEpicBuffs();
      }
    }

    for (const s of this.structures) this.updateStructureProtection(s);

    for (const c of this.champions) {
      updateAI(this, c, dt);
      c.update(this, dt);
    }
    for (const m of this.minions) m.update(this, dt);
    for (const s of this.structures) s.update(this, dt);
    for (const m of this.monsters) m.update(this, dt);

    for (const u of this.allUnits()) u.tickAnim(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.separateUnits();
    this.updateVision();
    this.fx.update(dt);

    // Olu minyonlari temizle
    if (this.minions.length > 0) {
      const before = this.minions.length;
      this.minions = this.minions.filter((m) => m.alive);
      if (this.minions.length !== before) this.reindex();
    }

    if (this.time > CONFIG.matchTimeLimit && this.winner === null) {
      const score = (t: Team): number =>
        this.teams[t].towers * 1000 + this.teams[t].kills * 10 + (1 - this.nexus[t].hpPct) * -500;
      this.winner = score(0) >= score(1) ? 0 : 1;
      this.log("Sure doldu!", "#ffe08a");
      sfx.play(this.winner === this.player.team ? "win" : "lose");
    }
  }

  /** Oyuncunun takimi teslim olur; mac rakibin galibiyetiyle biter. */
  surrender(): void {
    if (this.winner !== null) return;
    this.winner = this.player.team === 0 ? 1 : 0;
    this.log("Takiminiz teslim oldu.", "#ff9b8f");
    sfx.play("lose");
  }

  private updateStructureProtection(s: Structure): void {
    const ext = s as Structure & { guardInhibs?: Structure[]; guardTowers?: Structure[] };
    if (ext.guardInhibs) {
      // Ana bina kuleleri: en az bir engelleyici yikilana kadar korumali
      const anyDown = ext.guardInhibs.some((i) => !i.alive);
      s.protectedBy = anyDown ? null : ext.guardInhibs[0];
      if (!anyDown) {
        // Ayakta olan bir engelleyiciyi koruyucu olarak isaretle
        s.protectedBy = ext.guardInhibs.find((i) => i.alive) ?? null;
      }
    }
    if (ext.guardTowers) {
      s.protectedBy = ext.guardTowers.find((t) => t.alive) ?? null;
    }
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      if (p.homing) {
        if (!p.homing.alive) {
          p.dead = true;
          continue;
        }
        p.dir = dirTo(p.pos, p.homing.pos);
      }
      const step = p.speed * dt;
      p.pos.x += p.dir.x * step;
      p.pos.y += p.dir.y * step;
      p.traveled += step;
      p.trail += dt;

      if (p.homing) {
        const target = p.homing;
        if (dist(p.pos, target.pos) <= target.radius + p.radius) {
          this.projectileHit(p, target);
          p.dead = true;
        }
      } else {
        for (const u of this.allUnits()) {
          if (!u.alive || u.team === p.team || p.hit.has(u.id)) continue;
          if (u.kind === "monster" && p.team === u.team) continue;
          if (u.isStructure && u.kind !== "tower") continue;
          if (u.isStructure) continue;
          const rr = u.radius + p.radius;
          if (dist2(u.pos, p.pos) <= rr * rr) {
            this.projectileHit(p, u);
            p.hit.add(u.id);
            if (!p.pierce) {
              p.dead = true;
              break;
            }
          }
        }
      }

      if (p.traveled >= p.range) {
        p.onEnd?.(this, p.pos);
        p.dead = true;
      }
      if (p.pos.x < 0 || p.pos.y < 0 || p.pos.x > MAP_SIZE || p.pos.y > MAP_SIZE) p.dead = true;
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private projectileHit(p: Projectile, target: Unit): void {
    target.takeDamage(this, {
      amount: p.damage,
      type: p.damageType,
      sourceId: p.sourceId,
      isAuto: p.isAuto,
      crit: p.crit,
      label: p.label,
    });
    if (p.crit) this.fx.critMark(target.pos);
    if (p.isAuto) this.fx.rangedImpact(target.pos, p.color, p.crit);
    else this.fx.burst(target.pos, p.color, 9, 110);
    if (p.slow) {
      target.addEffect({
        id: `slow_${p.sourceId}`,
        kind: "slow",
        time: p.slowTime ?? 1.2,
        value: p.slow,
        label: "Yavas",
        color: "#7fd0ff",
      });
    }
    if (p.stun) {
      target.addEffect({
        id: `stun_${p.sourceId}`,
        kind: "stun",
        time: p.stun,
        value: 1,
        label: "Sersem",
        color: "#ffd27a",
      });
    }
    p.onHit?.(this, target);
  }

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      if (z.dead) continue;
      z.time -= dt;
      z.tickAcc += dt;
      z.onTick?.(this, z, dt);

      const targets = this.enemiesInRadius(z.team, z.pos, z.radius, false);
      for (const u of targets) {
        if (z.once && z.hit.has(u.id)) continue;
        if (z.once) z.hit.add(u.id);
        if (z.dps > 0) {
          const amount = z.once ? z.dps : z.dps * dt;
          u.takeDamage(
            this,
            { amount, type: z.damageType, sourceId: z.sourceId, label: z.label, noLifesteal: !z.once },
            !z.once && z.tickAcc < 0.25,
          );
        }
        if (z.slow) {
          u.addEffect({
            id: `zslow_${z.sourceId}`,
            kind: "slow",
            time: 0.4,
            value: z.slow,
            label: "Yavas",
            color: "#7fd0ff",
          });
        }
        if (z.pull) {
          const d = dirTo(u.pos, z.pos);
          u.pos.x += d.x * z.pull * dt;
          u.pos.y += d.y * z.pull * dt;
        }
      }
      if (z.tickAcc >= 0.25) z.tickAcc = 0;

      if (z.time <= 0) {
        z.onExpire?.(this, z);
        z.dead = true;
      }
    }
    this.zones = this.zones.filter((z) => !z.dead);
  }

  /** Birimlerin ust uste binmesini engeller. */
  private separateUnits(): void {
    const movers: Unit[] = [];
    for (const c of this.champions) if (c.alive && !c.dash) movers.push(c);
    for (const m of this.minions) if (m.alive) movers.push(m);
    for (const m of this.monsters) if (m.alive) movers.push(m);

    for (let i = 0; i < movers.length; i++) {
      const a = movers[i];
      for (let j = i + 1; j < movers.length; j++) {
        const b = movers[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        a.pos.x -= nx * push;
        a.pos.y -= ny * push;
        b.pos.x += nx * push;
        b.pos.y += ny * push;
      }
      // Yapilarla sert carpisma
      for (const s of this.structures) {
        if (!s.alive) continue;
        const dx = a.pos.x - s.pos.x;
        const dy = a.pos.y - s.pos.y;
        const rr = a.radius + s.radius * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        a.pos.x = s.pos.x + (dx / d) * rr;
        a.pos.y = s.pos.y + (dy / d) * rr;
      }
      a.pos.x = clamp(a.pos.x, a.radius, MAP_SIZE - a.radius);
      a.pos.y = clamp(a.pos.y, a.radius, MAP_SIZE - a.radius);
    }
  }
}
