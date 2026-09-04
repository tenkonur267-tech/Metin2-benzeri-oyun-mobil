/**
 * Three.js sahnesi: kamera, isiklar, golgeler ve ekran/dunya donusumleri.
 *
 * Koordinat esleme: oyun mantigi 2B calisir (x, y). 3B'de X = oyun x,
 * Z = oyun y, Y = yukseklik. Boylece harita ustten bakildiginda 2B
 * minimap ile ayni yonde durur.
 */
import * as THREE from "three";
import { clamp, type Vec2 } from "../core/math";
import { MAP_SIZE } from "../game/constants";

export interface CameraRig {
  /** Kameranin baktigi zemin noktasi. */
  target: THREE.Vector3;
  /** Yatayla yaptigi aci (radyan). */
  pitch: number;
  /** Hedefe uzaklik. */
  distance: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly rig: CameraRig = {
    target: new THREE.Vector3(MAP_SIZE / 2, 0, MAP_SIZE / 2),
    pitch: 0.96,
    distance: 330,
  };

  vw = 1;
  vh = 1;
  /** Golge kalitesi / efekt yogunlugu (dusuk guclu cihazlarda kisilir). */
  quality: "low" | "high" = "high";

  private projV = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setClearColor(0x060f1a, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.fog = new THREE.Fog(0x0a1c2b, 320, 620);

    this.camera = new THREE.PerspectiveCamera(46, 1, 1, 1400);
    this.scene.add(this.camera);

    // --- Isiklar ---
    const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x2b3a24, 1.15);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
    this.sun.position.set(-160, 260, 120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 230;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 700;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Hafif dolgu isigi (golgeler tamamen siyah olmasin)
    const fill = new THREE.DirectionalLight(0x7fa8d8, 0.35);
    fill.position.set(140, 120, -160);
    this.scene.add(fill);
  }

  setQuality(q: "low" | "high"): void {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === "high";
    this.sun.castShadow = q === "high";
    this.sun.shadow.mapSize.set(q === "high" ? 2048 : 1024, q === "high" ? 2048 : 1024);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, q === "high" ? 2 : 1.25),
    );
  }

  resize(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.quality === "high" ? 2 : 1.25),
    );
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Genis ekranlarda gorus alani sabit kalsin diye dikey FOV'u ayarla
    const aspect = w / h;
    this.camera.fov = clamp(46 * (aspect > 1.7 ? 1 : 1.7 / aspect), 40, 74);
    this.camera.updateProjectionMatrix();
  }

  /** Kamerayi hedefe yumusak sekilde tasir. */
  follow(p: Vec2, lerpAmount: number): void {
    const t = this.rig.target;
    t.x += (p.x - t.x) * lerpAmount;
    t.z += (p.y - t.z) * lerpAmount;
    t.x = clamp(t.x, -60, MAP_SIZE + 60);
    t.z = clamp(t.z, -60, MAP_SIZE + 60);
    this.updateCamera();
  }

  snapTo(p: Vec2): void {
    this.rig.target.set(p.x, 0, p.y);
    this.updateCamera();
  }

  private updateCamera(): void {
    const { target, pitch, distance } = this.rig;
    const y = Math.sin(pitch) * distance;
    const z = Math.cos(pitch) * distance;
    this.camera.position.set(target.x, target.y + y, target.z + z);
    this.camera.lookAt(target);

    // Golge kamerasi oyuncuyu takip etsin
    this.sun.position.set(target.x - 160, 260, target.z + 120);
    this.sun.target.position.set(target.x, 0, target.z);
    this.sun.target.updateMatrixWorld();
  }

  /** Dunya noktasini ekran (CSS piksel) koordinatina cevirir. */
  toScreen(x: number, y: number, height = 0): Vec2 {
    this.projV.set(x, height, y).project(this.camera);
    return {
      x: (this.projV.x * 0.5 + 0.5) * this.vw,
      y: (-this.projV.y * 0.5 + 0.5) * this.vh,
    };
  }

  /** Noktanin kamera onunde olup olmadigi (arkadakiler cizilmemeli). */
  isBehind(x: number, y: number, height = 0): boolean {
    this.projV.set(x, height, y).project(this.camera);
    return this.projV.z > 1;
  }

  /** Ekran noktasindan zemin duzlemine isin gonderir. */
  toWorld(sx: number, sy: number): Vec2 {
    const ndc = new THREE.Vector2((sx / this.vw) * 2 - 1, -(sy / this.vh) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, hit);
    return { x: hit.x, y: hit.z };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
