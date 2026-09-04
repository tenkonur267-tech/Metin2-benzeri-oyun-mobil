/**
 * Takim halkasi ve renk yardimcilari.
 *
 * Silah, baslik ve pelerin gibi ekipmanlar artik kodla uretilmez;
 * hepsi hazir KayKit modellerinin kendi parcalaridir (bkz. loadout.ts).
 */
import * as THREE from "three";

export function buildTeamRing(color: number, radius: number, player = false): THREE.Mesh {
  const geo = new THREE.RingGeometry(radius * 0.82, radius, 28);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: player ? 0.95 : 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  m.renderOrder = 2;
  return m;
}

/** "#rrggbb" veya sayi -> sayi */
export function colorOf(c: string | number | undefined): number {
  if (c === undefined) return 0xffffff;
  if (typeof c === "number") return c;
  return new THREE.Color(c).getHex();
}
