/**
 * 3B savas efektleri: mermiler, alan etkileri, halkalar, isinlar,
 * parcaciklar ve nisan gostergesi.
 */
import * as THREE from "three";
import { clamp } from "../core/math";
import type { World } from "../game/world";
import { terrainHeight } from "./terrain";
import { colorOf } from "./gear";

const MAX_PARTICLES = 700;

export class Fx3D {
  readonly group = new THREE.Group();

  private projPool: THREE.Mesh[] = [];
  private zonePool: THREE.Mesh[] = [];
  private ringPool: THREE.Mesh[] = [];
  private beamPool: THREE.Mesh[] = [];

  private particles: THREE.Points;
  private particlePos: Float32Array;
  private particleCol: Float32Array;
  private particleSize: Float32Array;

  private geoOrb = new THREE.IcosahedronGeometry(1, 1);
  private geoBolt = new THREE.CapsuleGeometry(0.55, 1.6, 3, 6);
  private geoArrow = new THREE.ConeGeometry(0.55, 2.4, 5);
  private geoBlade = new THREE.BoxGeometry(2.2, 0.25, 0.7);
  private geoWave = new THREE.BoxGeometry(0.6, 1.4, 2.2);
  private geoDisc: THREE.CircleGeometry;
  private geoRing: THREE.RingGeometry;
  private geoBeam = new THREE.CylinderGeometry(1, 1, 1, 5);

  /**
   * Parcacik boyutunu dunya biriminden piksele ceviren carpan.
   * Her karede kamera ve tuval yuksekligine gore guncellenir.
   */
  private viewScale = { value: 600 };

  constructor() {
    this.geoDisc = new THREE.CircleGeometry(1, 28);
    this.geoDisc.rotateX(-Math.PI / 2);
    this.geoRing = new THREE.RingGeometry(0.88, 1, 32);
    this.geoRing.rotateX(-Math.PI / 2);

    // --- Parcaciklar ---
    const g = new THREE.BufferGeometry();
    this.particlePos = new Float32Array(MAX_PARTICLES * 3);
    this.particleCol = new Float32Array(MAX_PARTICLES * 3);
    this.particleSize = new Float32Array(MAX_PARTICLES);
    g.setAttribute("position", new THREE.BufferAttribute(this.particlePos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.particleCol, 3));
    g.setAttribute("size", new THREE.BufferAttribute(this.particleSize, 1));
    g.setDrawRange(0, 0);
    // PointsMaterial parcacik basina boyutu yok sayar; hepsi tek bir
    // uniform boyutta cizilir ve oyun kamerasindan bakinca 2-3 piksel
    // kaliyordu, yani kivilcimlar goze carpmiyordu. Kendi shader'imiz
    // `size` niteligini dunya birimi olarak kullanir.
    const pm = new THREE.ShaderMaterial({
      uniforms: { uScale: this.viewScale },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        uniform float uScale;
        varying vec3 vCol;
        void main() {
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(2.0, size * uScale / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vCol;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.08, d);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol, a);
        }
      `,
    });
    this.particles = new THREE.Points(g, pm);
    this.particles.frustumCulled = false;
    this.group.add(this.particles);
  }

  private take(
    pool: THREE.Mesh[],
    index: number,
    geo: THREE.BufferGeometry,
    additive: boolean,
  ): THREE.Mesh {
    let m = pool[index];
    if (!m) {
      m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
      );
      m.frustumCulled = false;
      pool[index] = m;
      this.group.add(m);
    }
    if (m.geometry !== geo) m.geometry = geo;
    m.visible = true;
    return m;
  }

  /** Kamera ve tuval degistiginde parcacik olcegini tazeler. */
  setViewScale(pixelHeight: number, fovDeg: number): void {
    this.viewScale.value = pixelHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  update(world: World, time: number): void {
    this.updateProjectiles(world, time);
    this.updateZones(world, time);
    this.updateRingsAndBeams(world);
    this.updateParticles(world);
  }

  private updateProjectiles(world: World, time: number): void {
    let i = 0;
    for (const p of world.projectiles) {
      const geo =
        p.shape === "arrow"
          ? this.geoArrow
          : p.shape === "orb"
            ? this.geoOrb
            : p.shape === "blade"
              ? this.geoBlade
              : p.shape === "wave"
                ? this.geoWave
                : this.geoBolt;
      const m = this.take(this.projPool, i++, geo, true);
      const h = terrainHeight(p.pos.x, p.pos.y) + 12;
      m.position.set(p.pos.x, h, p.pos.y);
      const yaw = Math.atan2(p.dir.x, p.dir.y);
      m.rotation.set(0, yaw, 0);
      if (p.shape === "arrow") {
        m.rotation.set(Math.PI / 2, 0, 0);
        m.rotation.y = 0;
        m.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(p.dir.x, 0, p.dir.y).normalize(),
        );
      } else if (p.shape === "blade") {
        m.rotation.y = time * 14;
      }
      const s = p.radius * (p.shape === "wave" ? 1.6 : 1.1);
      m.scale.setScalar(Math.max(2, s));
      if (p.shape === "wave") m.scale.set(p.radius * 0.4, p.radius * 0.5, p.radius * 1.2);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(colorOf(p.color));
      mat.opacity = 0.95;
    }
    for (let k = i; k < this.projPool.length; k++) this.projPool[k].visible = false;
  }

  private updateZones(world: World, time: number): void {
    let i = 0;
    for (const z of world.zones) {
      const t = clamp(z.time / Math.max(0.01, z.maxTime), 0, 1);
      const isWarn = z.shape === "warning";

      // Dis halka
      const ring = this.take(this.zonePool, i++, this.geoRing, false);
      ring.position.set(z.pos.x, terrainHeight(z.pos.x, z.pos.y) + 0.9, z.pos.y);
      ring.scale.setScalar(z.radius);
      const rm = ring.material as THREE.MeshBasicMaterial;
      rm.color.set(colorOf(z.color));
      rm.opacity = isWarn ? 0.85 : 0.7;

      // Ic dolgu
      const disc = this.take(this.zonePool, i++, this.geoDisc, true);
      disc.position.set(z.pos.x, terrainHeight(z.pos.x, z.pos.y) + 0.7, z.pos.y);
      const fill = isWarn ? z.radius * (1 - t) : z.radius * 0.98;
      disc.scale.setScalar(Math.max(0.01, fill));
      const dm = disc.material as THREE.MeshBasicMaterial;
      dm.color.set(colorOf(z.color));
      dm.opacity = isWarn ? 0.5 : z.shape === "storm" ? 0.3 + 0.1 * Math.sin(time * 8) : 0.26;
      disc.rotation.y = z.shape === "storm" ? time * 1.5 : 0;
    }
    for (let k = i; k < this.zonePool.length; k++) this.zonePool[k].visible = false;
  }

  private updateRingsAndBeams(world: World): void {
    let i = 0;
    for (const r of world.fx.rings) {
      const m = this.take(this.ringPool, i++, this.geoRing, true);
      m.position.set(r.pos.x, terrainHeight(r.pos.x, r.pos.y) + 1.4, r.pos.y);
      m.scale.setScalar(Math.max(0.01, r.r));
      const mm = m.material as THREE.MeshBasicMaterial;
      mm.color.set(colorOf(r.color));
      mm.opacity = clamp(r.life / r.maxLife, 0, 1) * 0.9;
    }
    for (let k = i; k < this.ringPool.length; k++) this.ringPool[k].visible = false;

    let j = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const beam of world.fx.beams) {
      const m = this.take(this.beamPool, j++, this.geoBeam, true);
      a.set(beam.a.x, terrainHeight(beam.a.x, beam.a.y) + 14, beam.a.y);
      b.set(beam.b.x, terrainHeight(beam.b.x, beam.b.y) + 14, beam.b.y);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b);
      m.position.copy(mid);
      m.scale.set(beam.width * 0.5, Math.max(0.01, len), beam.width * 0.5);
      m.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      );
      const mm = m.material as THREE.MeshBasicMaterial;
      mm.color.set(colorOf(beam.color));
      mm.opacity = clamp(beam.life / beam.maxLife, 0, 1);
    }
    for (let k = j; k < this.beamPool.length; k++) this.beamPool[k].visible = false;
  }

  private updateParticles(world: World): void {
    const list = world.fx.particles;
    const n = Math.min(list.length, MAX_PARTICLES);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const life = clamp(p.life / p.maxLife, 0, 1);
      this.particlePos[i * 3] = p.pos.x;
      this.particlePos[i * 3 + 1] = terrainHeight(p.pos.x, p.pos.y) + 12 + (1 - life) * 8;
      this.particlePos[i * 3 + 2] = p.pos.y;
      col.set(colorOf(p.color));
      this.particleCol[i * 3] = col.r * life;
      this.particleCol[i * 3 + 1] = col.g * life;
      this.particleCol[i * 3 + 2] = col.b * life;
      this.particleSize[i] = p.size * 3.2;
    }
    const g = this.particles.geometry;
    g.setDrawRange(0, n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Nisan gostergesi (zeminde)
// ---------------------------------------------------------------------------

export type AimShape = "line" | "cone" | "circle" | "self" | "unit" | "none";

export class AimIndicator {
  readonly group = new THREE.Group();
  private range: THREE.Mesh;
  private line: THREE.Mesh;
  private cone: THREE.Mesh;
  private circle: THREE.Mesh;
  private unitRing: THREE.Mesh;

  constructor() {
    const geoRing = new THREE.RingGeometry(0.985, 1, 48);
    geoRing.rotateX(-Math.PI / 2);
    this.range = new THREE.Mesh(
      geoRing,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
    );

    const geoLine = new THREE.PlaneGeometry(1, 1);
    geoLine.rotateX(-Math.PI / 2);
    geoLine.translate(0, 0, 0.5);
    this.line = new THREE.Mesh(geoLine, this.aimMat());

    const geoCone = new THREE.CircleGeometry(1, 24, -0.95, 1.9);
    geoCone.rotateX(-Math.PI / 2);
    this.cone = new THREE.Mesh(geoCone, this.aimMat());

    const geoCircle = new THREE.CircleGeometry(1, 32);
    geoCircle.rotateX(-Math.PI / 2);
    this.circle = new THREE.Mesh(geoCircle, this.aimMat());

    const geoUnit = new THREE.RingGeometry(0.8, 1, 24);
    geoUnit.rotateX(-Math.PI / 2);
    this.unitRing = new THREE.Mesh(
      geoUnit,
      new THREE.MeshBasicMaterial({ color: 0xff5f52, transparent: true, opacity: 0.9, depthWrite: false }),
    );

    for (const m of [this.range, this.line, this.cone, this.circle, this.unitRing]) {
      m.renderOrder = 3;
      m.visible = false;
      this.group.add(m);
    }
  }

  private aimMat(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: 0x8fd8ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }

  hide(): void {
    for (const m of [this.range, this.line, this.cone, this.circle, this.unitRing]) {
      m.visible = false;
    }
  }

  show(
    shape: AimShape,
    from: { x: number; y: number },
    to: { x: number; y: number },
    range: number,
    width: number,
    color: number,
  ): void {
    this.hide();
    if (shape === "none") return;
    const baseY = terrainHeight(from.x, from.y) + 1.6;
    this.range.position.set(from.x, baseY, from.y);
    this.range.scale.setScalar(Math.max(1, range));
    this.range.visible = true;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const yaw = Math.atan2(dx, dy);

    if (shape === "line") {
      this.line.position.set(from.x, baseY, from.y);
      this.line.rotation.y = yaw;
      this.line.scale.set(Math.max(4, width), 1, Math.max(4, range));
      (this.line.material as THREE.MeshBasicMaterial).color.setHex(color);
      this.line.visible = true;
    } else if (shape === "cone") {
      this.cone.position.set(from.x, baseY, from.y);
      this.cone.rotation.y = -yaw + Math.PI / 2;
      this.cone.scale.setScalar(Math.max(4, range));
      (this.cone.material as THREE.MeshBasicMaterial).color.setHex(color);
      this.cone.visible = true;
    } else if (shape === "circle") {
      this.circle.position.set(to.x, terrainHeight(to.x, to.y) + 1.6, to.y);
      this.circle.scale.setScalar(Math.max(4, width || 55));
      (this.circle.material as THREE.MeshBasicMaterial).color.setHex(color);
      this.circle.visible = true;
    } else if (shape === "self") {
      this.circle.position.set(from.x, baseY, from.y);
      this.circle.scale.setScalar(Math.max(30, range));
      (this.circle.material as THREE.MeshBasicMaterial).color.setHex(color);
      this.circle.visible = true;
    } else if (shape === "unit") {
      this.unitRing.position.set(to.x, terrainHeight(to.x, to.y) + 1.6, to.y);
      this.unitRing.scale.setScalar(18);
      this.unitRing.visible = true;
    }
  }
}
