import { World } from "../src/game/world";

const world = new World({ playerChampionId: "kaya", seed: Number(process.argv[2] ?? 1), difficulty: 1 });
world.player.isPlayer = false;

const dt = 1 / 30;
const orderCount: Record<string, number> = {};
for (let i = 0; i < 30 * 60 * 40 && world.winner === null; i++) {
  world.update(dt);
  if (i % 30 === 0) {
    for (const c of world.champions) {
      const st = (c.ai.state as { order?: string } | undefined)?.order ?? "-";
      orderCount[st] = (orderCount[st] ?? 0) + 1;
    }
  }
}
console.log("sure", (world.time / 60).toFixed(1), "kazanan", world.winner);
console.log("emirler:", orderCount);
for (const team of [0, 1] as const) {
  const st = world.structures.filter((s) => s.team === team);
  const alive = st.filter((s) => s.alive);
  console.log(
    `takim ${team}: ayakta ${alive.length}/${st.length} ->`,
    alive.map((s) => `${s.kind[0]}${s.tier}${s.lane}:${Math.round(s.hpPct * 100)}%`).join(" "),
  );
}
console.log("minyon dagilimi:", ["top", "mid", "bot"].map((l) => `${l}=${world.minions.filter((m) => m.lane === l).length}`).join(" "));
for (const c of world.champions) {
  console.log(`  [${c.team}] ${c.def.name} lane=${c.lane} pos=${Math.round(c.pos.x)},${Math.round(c.pos.y)} order=${(c.ai.state as any)?.order}`);
}
