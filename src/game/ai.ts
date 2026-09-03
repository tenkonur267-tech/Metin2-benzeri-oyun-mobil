import { clamp, dirTo, dist, norm, type Vec2 } from "../core/math";
import { castAbility, castSummoner, type AimInput } from "./abilities";
import type { Champion } from "./champion";
import { CONFIG, NEXUS_POS, SPAWN_POS, lanePath } from "./constants";
import type { Unit } from "./units";
import { Structure } from "./units";
import type { World } from "./world";

interface AiState {
  think: number;
  order: "lane" | "fight" | "retreat" | "recall" | "push" | "jungle" | "group";
  focus: Unit | null;
  dest: Vec2 | null;
  laneIndex: number;
  nextItemCheck: number;
  aggression: number;
  wander: number;
}

function state(c: Champion): AiState {
  let s = c.ai.state as AiState | undefined;
  if (!s) {
    s = {
      think: 0,
      order: "lane",
      focus: null,
      dest: null,
      laneIndex: 0,
      nextItemCheck: 0,
      aggression: 0.5,
      wander: 0,
    };
    c.ai.state = s;
  }
  return s;
}

/** Bot zorluguna gore tepki gecikmesi. */
function thinkInterval(world: World): number {
  return [0.42, 0.28, 0.16][clamp(world.difficulty, 0, 2)];
}

export function updateAI(world: World, c: Champion, dt: number): void {
  if (c.isPlayer || !c.alive) return;
  const s = state(c);
  s.think -= dt;
  s.nextItemCheck -= dt;

  // Cesmede esya al
  if (c.inFountain && s.nextItemCheck <= 0) {
    s.nextItemCheck = 1.2;
    let item = c.nextBuildItem();
    while (item && c.gold >= item.cost && c.buy(item)) item = c.nextBuildItem();
  }

  if (s.think > 0) {
    keepEngaging(world, c, s);
    return;
  }
  s.think = thinkInterval(world);

  decide(world, c, s);
  keepEngaging(world, c, s);
}

// ---------------------------------------------------------------------------

function decide(world: World, c: Champion, s: AiState): void {
  const enemies = world.champions.filter((e) => {
    if (!e.alive || e.team === c.team || !e.visibleTo[c.team]) return false;
    const d = dist(e.pos, c.pos);
    // Uzaktakiler yalnizca canlari azaldiysa hedeflenir
    return d < 215 || (d < 330 && e.hpPct < 0.45);
  });
  const allies = world.champions.filter(
    (a) => a.alive && a.team === c.team && a !== c && dist(a.pos, c.pos) < 300,
  );

  const hp = c.hpPct;
  const outnumbered = enemies.length > allies.length + 1;
  const nextItem = c.nextBuildItem();
  const wantShop = !!nextItem && c.gold >= nextItem.cost;

  // --- Cesmede bekleme ---
  if (c.inFountain) {
    if (hp < 0.92 || c.mpPct < 0.6) {
      s.order = "recall";
      c.stopMoving();
      return;
    }
    s.order = "lane";
  }

  // --- Bitirme firsati: acikta kalan engelleyici/ana bina varsa usse donme ---
  const finisher = nearestAttackableStructure(world, c, 520);
  const finishing =
    finisher !== null &&
    hp > 0.4 &&
    (finisher.kind === "nexus" || finisher.kind === "inhibitor" || finisher.tier === 4);

  // --- Usse donus (dusman yokken) ---
  if (
    !c.inFountain &&
    !finishing &&
    c.recallTimer <= 0 &&
    enemies.length === 0 &&
    (hp < 0.4 || (wantShop && (hp < 0.6 || c.gold >= (nextItem?.cost ?? 0) + 700)))
  ) {
    s.order = "recall";
    c.startRecall(world);
    return;
  }

  // --- Kacis ---
  if (!c.inFountain && enemies.length > 0 && (hp < 0.3 || (hp < 0.46 && outnumbered))) {
    s.order = "retreat";
    c.setDestination(world, safeRetreatPoint(world, c));
    s.focus = null;
    tryEscapeSpells(world, c, enemies[0] ?? null);
    return;
  }

  if (c.recallTimer > 0) return;

  // --- Kusatma: yikilabilir yapi ve muttefik minyon varsa oncelik ver ---
  const siege = finisher ?? nearestAttackableStructure(world, c, 430);
  const siegeReady =
    siege !== null &&
    enemies.length <= allies.length &&
    hp > 0.42 &&
    (finishing || hasFriendlyMinionsNear(world, c, siege.pos));

  // --- Dovus ---
  const engageTarget = pickChampionTarget(world, c, enemies, allies.length);
  if (engageTarget && !(siegeReady && enemies.length === 0)) {
    s.order = "fight";
    s.focus = engageTarget;
    fightMove(world, c, engageTarget);
    useCombatSpells(world, c, engageTarget, true);
    return;
  }

  if (siegeReady && siege) {
    s.order = "push";
    s.focus = siege;
    approach(world, c, siege);
    return;
  }

  // --- Koridor / minyon temizleme ---
  const minion = nearestEnemyMinion(world, c, 230);
  if (minion) {
    s.order = "push";
    s.focus = minion;
    approach(world, c, minion);
    useCombatSpells(world, c, minion, false);
    return;
  }

  // --- Orman kampi ---
  if (c.hpPct > 0.55 && world.time > 60) {
    const camp = world.monsters.find(
      (m) => m.alive && dist(m.pos, c.pos) < 190 && (!m.spec.epic || world.time > 480),
    );
    if (camp) {
      s.order = "jungle";
      s.focus = camp;
      approach(world, c, camp);
      useCombatSpells(world, c, camp, false);
      return;
    }
  }

  // --- Koridorda ilerle ---
  s.order = "lane";
  s.focus = null;
  const dest = lanePushPoint(world, c, s);
  c.setDestination(world, dest);
}

/** Dusuk saglikta kacis yetenekleri. */
function tryEscapeSpells(world: World, c: Champion, threat: Unit | null): void {
  const away = threat ? norm({ x: c.pos.x - threat.pos.x, y: c.pos.y - threat.pos.y }) : dirTo(c.pos, SPAWN_POS[c.team]);
  const aim: AimInput = {
    point: { x: c.pos.x + away.x * 180, y: c.pos.y + away.y * 180 },
    dir: away,
    target: null,
  };
  const id = c.def.id;
  if (id === "golge" && c.canCastAbility("W")) castAbility(world, c, "W", aim);
  else if (id === "demir" && c.canCastAbility("E")) castAbility(world, c, "E", aim);
  else if (id === "selin" && c.canCastAbility("E")) castAbility(world, c, "E", aim);
  else if (id === "alev" && c.canCastAbility("E")) castAbility(world, c, "E", aim);
  else if (id === "ayla" && c.canCastAbility("E")) castAbility(world, c, "E", aim);
  else if (id === "deniz" && c.canCastAbility("W")) castAbility(world, c, "W", aim);
  else if (id === "kaya" && c.canCastAbility("W")) castAbility(world, c, "W", aim);

  if (c.hpPct < 0.16) {
    const heal = c.summoners.findIndex((x) => x.spell.id === "heal");
    if (heal >= 0 && c.summoners[heal].cd <= 0) castSummoner(world, c, heal, aim);
    const flash = c.summoners.findIndex((x) => x.spell.id === "flash");
    if (flash >= 0 && c.summoners[flash].cd <= 0 && threat && dist(threat.pos, c.pos) < 130) {
      castSummoner(world, c, flash, aim);
    }
  }
}

function pickChampionTarget(
  world: World,
  c: Champion,
  enemies: Champion[],
  allyCount: number,
): Champion | null {
  if (enemies.length === 0) return null;
  let best: Champion | null = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    const d = dist(e.pos, c.pos);
    let score = 150 - d * 0.65;
    score += (1 - e.hpPct) * 230;
    score -= (1 - c.hpPct) * 170;
    score += allyCount * 40;
    if (e.def.role === "Nisanci" || e.def.role === "Buyucu" || e.def.role === "Destek") score += 45;
    if (underEnemyTower(world, c, e.pos) && !hasFriendlyMinionsNear(world, c, e.pos)) score -= 260;
    if (c.hpPct < 0.4) score -= 120;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  const threshold = [95, 65, 35][clamp(world.difficulty, 0, 2)];
  return bestScore > threshold ? best : null;
}

function underEnemyTower(world: World, c: Champion, p: Vec2): boolean {
  for (const s of world.structures) {
    if (!s.alive || s.team === c.team || s.kind !== "tower") continue;
    if (dist(s.pos, p) < CONFIG.towerRange + 30) return true;
  }
  return false;
}

function hasFriendlyMinionsNear(world: World, c: Champion, p: Vec2): boolean {
  return world.minions.some((m) => m.alive && m.team === c.team && dist(m.pos, p) < 190);
}

function nearestEnemyMinion(world: World, c: Champion, range: number): Unit | null {
  let best: Unit | null = null;
  let bestScore = Infinity;
  for (const m of world.minions) {
    if (!m.alive || m.team === c.team) continue;
    const d = dist(m.pos, c.pos);
    if (d > range) continue;
    // Son vurus onceligi
    const killable = m.hp < c.stats.ad * 1.2 ? -400 : 0;
    const score = d + killable;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function nearestAttackableStructure(world: World, c: Champion, range: number): Structure | null {
  let best: Structure | null = null;
  let bd = range;
  for (const s of world.structures) {
    if (!s.alive || s.team === c.team) continue;
    if (s.protectedBy && s.protectedBy.alive) continue;
    const d = dist(s.pos, c.pos);
    if (d < bd) {
      // Kule altinda minyon yoksa yaklasma
      if (s.kind === "tower" && !hasFriendlyMinionsNear(world, c, s.pos) && c.hpPct < 0.9) continue;
      bd = d;
      best = s;
    }
  }
  return best;
}

function safeRetreatPoint(world: World, c: Champion): Vec2 {
  let best: Vec2 = SPAWN_POS[c.team];
  let bd = Infinity;
  for (const s of world.structures) {
    if (!s.alive || s.team !== c.team) continue;
    const d = dist(s.pos, c.pos);
    if (d < bd) {
      bd = d;
      best = s.pos;
    }
  }
  const toBase = dirTo(c.pos, NEXUS_POS[c.team]);
  return { x: best.x + toBase.x * 34, y: best.y + toBase.y * 34 };
}

/** Koridorda ilerlenecek nokta. */
function lanePushPoint(world: World, c: Champion, s: AiState): Vec2 {
  // Oyunun ilerleyen bolumlerinde toplan
  if (world.time > 600) {
    const target = world.structures
      .filter((st) => st.alive && st.team !== c.team && !(st.protectedBy && st.protectedBy.alive))
      .sort((a, b) => dist(a.pos, NEXUS_POS[c.team]) - dist(b.pos, NEXUS_POS[c.team]))[0];
    if (target) return target.pos;
  }

  const path = lanePath(c.team, c.lane);
  // Kendi minyon dalgasinin onune git
  const wave = world.minions.filter((m) => m.alive && m.team === c.team && m.lane === c.lane);
  if (wave.length > 0) {
    let front = wave[0];
    let bd = dist(front.pos, NEXUS_POS[c.team === 0 ? 1 : 0]);
    for (const m of wave) {
      const d = dist(m.pos, NEXUS_POS[c.team === 0 ? 1 : 0]);
      if (d < bd) {
        bd = d;
        front = m;
      }
    }
    return { x: front.pos.x, y: front.pos.y };
  }
  // Minyon yoksa koridor boyunca ilerle
  s.laneIndex = clamp(s.laneIndex, 0, path.length - 1);
  if (dist(c.pos, path[s.laneIndex]) < 60) s.laneIndex = Math.min(path.length - 1, s.laneIndex + 1);
  return path[s.laneIndex];
}

function approach(world: World, c: Champion, t: Unit): void {
  const reach = c.stats.attackRange + c.radius + t.radius;
  const d = dist(c.pos, t.pos);
  if (d > reach * 0.92) {
    const dir = dirTo(c.pos, t.pos);
    const stop = { x: t.pos.x - dir.x * reach * 0.8, y: t.pos.y - dir.y * reach * 0.8 };
    c.setDestination(world, stop, d < 260);
  } else {
    c.stopMoving();
  }
  c.target = t;
}

/** Dovus sirasinda mesafe yonetimi (menzilliler geri ceker). */
function fightMove(world: World, c: Champion, t: Unit): void {
  const reach = c.stats.attackRange + c.radius + t.radius;
  const d = dist(c.pos, t.pos);
  c.target = t;
  if (c.def.ranged && d < reach * 0.55 && c.hpPct < 0.75) {
    const away = norm({ x: c.pos.x - t.pos.x, y: c.pos.y - t.pos.y });
    c.setDestination(world, { x: c.pos.x + away.x * 80, y: c.pos.y + away.y * 80 }, true);
    return;
  }
  if (d > reach * 0.9) {
    const dir = dirTo(c.pos, t.pos);
    c.setDestination(world, { x: t.pos.x - dir.x * reach * 0.75, y: t.pos.y - dir.y * reach * 0.75 }, d < 300);
  } else {
    c.stopMoving();
  }
}

// ---------------------------------------------------------------------------
// Yetenek kullanimi
// ---------------------------------------------------------------------------

/** Hedefin tahmini konumu (mermi hizina gore). */
function predict(c: Champion, t: Unit, projSpeed: number): Vec2 {
  const d = dist(c.pos, t.pos);
  const lead = clamp(d / projSpeed, 0, 0.55);
  const dir = t.path.length > 0 ? dirTo(t.pos, t.path[0]) : { x: 0, y: 0 };
  const spd = t.effectiveMoveSpeed;
  return { x: t.pos.x + dir.x * spd * lead, y: t.pos.y + dir.y * spd * lead };
}

function aimAt(c: Champion, p: Vec2, t: Unit | null): AimInput {
  return { point: p, dir: dirTo(c.pos, p), target: t };
}

function useCombatSpells(world: World, c: Champion, t: Unit, vsChampion: boolean): void {
  if (!c.canCast) return;
  const d = dist(c.pos, t.pos);
  const id = c.def.id;

  // Ulti sadece sampiyonlara ve uygun kosullarda
  if (vsChampion && c.canCastAbility("R")) {
    const rDef = c.def.abilities.find((a) => a.key === "R")!;
    const inRange = d <= Math.max(180, rDef.range);
    const worthIt = t.hpPct < 0.75 || c.hpPct > 0.6;
    if (inRange && worthIt) {
      castAbility(world, c, "R", aimAt(c, predict(c, t, 700), t));
    }
  }

  for (const key of ["Q", "W", "E"] as const) {
    if (!c.canCastAbility(key)) continue;
    const def = c.def.abilities.find((a) => a.key === key)!;
    const range = def.range > 0 ? def.range : 170;
    if (def.targeting === "unit") {
      if (d <= range * 0.95) castAbility(world, c, key, aimAt(c, t.pos, t));
      continue;
    }
    if (def.targeting === "self") {
      if (shouldCastSelf(world, c, key, t, vsChampion, d)) {
        castAbility(world, c, key, aimAt(c, t.pos, t));
      }
      continue;
    }
    if (d > range * 1.05) continue;
    const speed = def.targeting === "skillshot" ? 640 : 900;
    const p = predict(c, t, speed);
    if (def.targeting === "cone" || def.targeting === "direction") {
      castAbility(world, c, key, aimAt(c, p, t));
    } else {
      castAbility(world, c, key, aimAt(c, p, t));
    }
  }

  // Tutusturma ile bitirme
  if (vsChampion && t.hpPct < 0.22 && d < 300) {
    const ig = c.summoners.findIndex((x) => x.spell.id === "ignite");
    if (ig >= 0 && c.summoners[ig].cd <= 0) castSummoner(world, c, ig, aimAt(c, t.pos, t));
  }
}

function shouldCastSelf(
  world: World,
  c: Champion,
  key: string,
  t: Unit,
  vsChampion: boolean,
  d: number,
): boolean {
  const id = `${c.def.id}:${key}`;
  switch (id) {
    case "kaya:W":
    case "deniz:W":
      return c.hpPct < 0.75 && d < 220;
    case "ayla:W":
      return world
        .alliesInRadius(c.team, c.pos, 230)
        .some((a) => a.hpPct < 0.68);
    case "ayla:E":
      return vsChampion || c.hpPct < 0.6;
    case "demir:Q":
      return d < c.stats.attackRange + 40;
    case "demir:W":
    case "bozkurt:E":
      return d < c.stats.attackRange + 70;
    case "golge:W":
      return vsChampion && d > 120 && d < 300;
    case "alev:W":
      return d < 120;
    default:
      return vsChampion && d < 200;
  }
}

/** Dusunme araligi disinda hedefi takip etmeye devam et. */
function keepEngaging(world: World, c: Champion, s: AiState): void {
  const f = s.focus;
  if (f && f.alive) {
    if (s.order === "fight") fightMove(world, c, f);
    else if (dist(c.pos, f.pos) < 320) {
      c.target = f;
      const reach = c.stats.attackRange + c.radius + f.radius;
      if (dist(c.pos, f.pos) <= reach * 0.95) c.stopMoving();
    }
  } else if (!c.target || !c.target.alive) {
    // Menzildeki en yakin dusmana otomatik saldiri
    const reach = c.stats.attackRange + c.radius + 30;
    let best: Unit | null = null;
    let bd = reach;
    for (const u of world.allUnits()) {
      if (!u.alive || u.team === c.team) continue;
      if (u.kind === "monster" && s.order !== "jungle") continue;
      const d = dist(u.pos, c.pos);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    c.target = best;
  }
}
