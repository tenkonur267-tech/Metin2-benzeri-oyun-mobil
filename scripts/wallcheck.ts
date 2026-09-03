import { CAMPS, LANES, WALLS, lanePath } from "../src/game/constants";
import { closestPointOnSegment } from "../src/core/math";
import { isBlockedCircle, nearestFree } from "../src/game/grid";

const segs: { a: { x: number; y: number }; b: { x: number; y: number }; id: string }[] = [];
for (const team of [0, 1] as const) {
  for (const lane of LANES) {
    const p = lanePath(team, lane);
    for (let i = 1; i < p.length; i++) segs.push({ a: p[i - 1], b: p[i], id: `${team}/${lane}/${i}` });
  }
}

console.log("--- Koridorlara cok yakin duvarlar ---");
WALLS.forEach((w, idx) => {
  const corners = [
    { x: w.x, y: w.y },
    { x: w.x + w.w, y: w.y },
    { x: w.x, y: w.y + w.h },
    { x: w.x + w.w, y: w.y + w.h },
    { x: w.x + w.w / 2, y: w.y + w.h / 2 },
  ];
  let min = Infinity;
  let which = "";
  for (const s of segs) {
    for (const c of corners) {
      const cp = closestPointOnSegment(c, s.a, s.b);
      const d = Math.hypot(cp.x - c.x, cp.y - c.y);
      if (d < min) {
        min = d;
        which = s.id;
      }
    }
  }
  if (min < 46) {
    console.log(`  duvar[${idx}] (${w.x},${w.y},${w.w}x${w.h}) mesafe ${min.toFixed(0)} -> ${which}`);
  }
});

console.log("--- Kamp duzeltmeleri ---");
for (const c of CAMPS) {
  if (isBlockedCircle(c.pos.x, c.pos.y, 22)) {
    const f = nearestFree(c.pos, 24);
    console.log(`  ${c.id} ${c.name}: (${c.pos.x},${c.pos.y}) -> (${Math.round(f.x)},${Math.round(f.y)})`);
  }
}
