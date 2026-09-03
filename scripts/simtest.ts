/** Basit basli olmayan simulasyon testi: mac cokmeden ilerliyor mu? */
import { World } from "../src/game/world";
import { CHAMPIONS } from "../src/game/champions";

const t0 = Date.now();
const world = new World({ playerChampionId: process.argv[2] ?? "kaya", seed: Number(process.argv[3] ?? 1234), difficulty: 1 });
world.player.isPlayer = false; // tum takim bot olsun

const dt = 1 / 30;
let steps = 0;
const maxSteps = 30 * 60 * 40; // 40 dakika

while (steps < maxSteps && world.winner === null) {
  world.update(dt);
  steps++;
}

const mins = (world.time / 60).toFixed(1);
console.log(`sure: ${mins} dk, adim: ${steps}, kazanan: ${world.winner ?? "yok"}`);
console.log(`gercek sure: ${((Date.now() - t0) / 1000).toFixed(1)} sn (${(steps / ((Date.now() - t0) / 1000)).toFixed(0)} adim/sn)`);
console.log(`skor ${world.teams[0].kills} - ${world.teams[1].kills}, kule ${world.teams[0].towers} - ${world.teams[1].towers}`);
console.log(`minyon: ${world.minions.length}, mermi: ${world.projectiles.length}, alan: ${world.zones.length}`);
for (const c of world.champions) {
  console.log(
    `  [${c.team}] ${c.def.name.padEnd(9)} sv${String(c.level).padStart(2)} ${c.scoreLine().padEnd(9)} cs=${String(c.cs).padStart(3)} altin=${Math.floor(c.totalGold)} esya=${c.items.map((i) => i.id).join(",")}`,
  );
}
const alive = world.structures.filter((s) => s.alive).length;
console.log(`ayakta yapi: ${alive}/${world.structures.length}`);
console.log("son olaylar:");
for (const e of world.events.slice(-6)) console.log("   " + e.text);
