import { NEXUS_POS, RADIUS, inhibSpecs, towerSpecs } from "../src/game/constants";
import { isBlockedCircle } from "../src/game/grid";

for (const team of [0, 1] as const) {
  const items = [
    ...towerSpecs(team).map((t) => ({ n: `T${t.tier}${t.lane}`, p: t.pos, r: RADIUS.tower })),
    ...inhibSpecs(team).map((i) => ({ n: `I-${i.lane}`, p: i.pos, r: RADIUS.inhibitor })),
    { n: "NEXUS", p: NEXUS_POS[team], r: RADIUS.nexus },
  ];
  for (let i = 0; i < items.length; i++) {
    if (isBlockedCircle(items[i].p.x, items[i].p.y, items[i].r)) console.log(`  ! ${team}/${items[i].n} duvarda`);
    for (let j = i + 1; j < items.length; j++) {
      const d = Math.hypot(items[i].p.x - items[j].p.x, items[i].p.y - items[j].p.y);
      const need = items[i].r + items[j].r + 22;
      if (d < need) console.log(`  ! ${team}: ${items[i].n} <-> ${items[j].n} = ${d.toFixed(0)} (gerekli ${need})`);
    }
  }
}
console.log("aralik kontrolu bitti");
