/** Harita dogrulama: koridorlar, yapilar ve dogus noktalari gecilebilir mi? */
import { CAMPS, LANES, NEXUS_POS, SPAWN_POS, inhibSpecs, lanePath, towerSpecs } from "../src/game/constants";
import { hasLineOfSight, isBlockedCircle, isWallAt, findPath } from "../src/game/grid";

let problems = 0;
const bad = (msg: string) => {
  console.log("  ✗ " + msg);
  problems++;
};

for (const team of [0, 1] as const) {
  for (const lane of LANES) {
    const p = lanePath(team, lane);
    for (let i = 0; i < p.length; i++) {
      if (isBlockedCircle(p[i].x, p[i].y, 12)) bad(`${team}/${lane} nokta ${i} duvarda (${p[i].x},${p[i].y})`);
      if (i > 0 && !hasLineOfSight(p[i - 1], p[i])) bad(`${team}/${lane} ${i - 1}->${i} arasi duvar var`);
    }
  }
  for (const t of towerSpecs(team)) {
    if (isWallAt(t.pos.x, t.pos.y)) bad(`kule ${team}/${t.lane}/${t.tier} duvarda`);
  }
  for (const s of inhibSpecs(team)) {
    if (isWallAt(s.pos.x, s.pos.y)) bad(`engelleyici ${team}/${s.lane} duvarda`);
  }
  if (isBlockedCircle(SPAWN_POS[team].x, SPAWN_POS[team].y, 16)) bad(`dogus noktasi ${team} duvarda`);
  if (isBlockedCircle(NEXUS_POS[team].x, NEXUS_POS[team].y, 20)) bad(`ana bina ${team} duvarda`);
}

for (const c of CAMPS) {
  if (isBlockedCircle(c.pos.x, c.pos.y, 22)) bad(`kamp ${c.id} (${c.name}) duvarda`);
}

// Uslerin birbirine ulasabilirligi
const path = findPath(SPAWN_POS[0], SPAWN_POS[1]);
if (path.length === 0) bad("mavi ustan kirmizi usse yol bulunamadi");
else console.log(`  ✓ usler arasi yol: ${path.length} nokta`);

// Her kamp iki usten de yuruyerek ulasilabilir olmali
// (ejderha ve baron cukurlarinin girisi kapanmasin)
for (const c of CAMPS) {
  for (const team of [0, 1] as const) {
    if (findPath(SPAWN_POS[team], c.pos).length === 0) {
      bad(`kamp ${c.id} (${c.name}) ${team === 0 ? "mavi" : "kirmizi"} ustan ulasilamiyor`);
    }
  }
}
console.log(`  ✓ ${CAMPS.length} kampin tamami iki usten de ulasilabilir`);

// Kamplara ulasilabilirlik
for (const c of CAMPS) {
  if (findPath(SPAWN_POS[0], c.pos).length === 0) bad(`kamp ${c.id} ulasilamaz`);
}

console.log(problems === 0 ? "HARITA TAMAM ✓" : `${problems} sorun bulundu`);
process.exit(problems === 0 ? 0 : 1);
