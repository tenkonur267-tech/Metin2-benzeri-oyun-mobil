import { sfx } from "./core/audio";
import { clamp, dist, norm, type Vec2 } from "./core/math";
import { castAbility, castSummoner, type AimInput } from "./game/abilities";
import { World } from "./game/world";
import type { Unit } from "./game/units";
import { computeLayout, inCircle, inRect, type HudLayout } from "./render/layout";
import {
  aimTarget,
  drawHud,
  newUiState,
  smartTarget,
  type AimKey,
  type UiState,
} from "./render/hud";
import type { AimShape } from "./render3d/fx3d";
import { World3D } from "./render3d/world3d";
import { showMainMenu, showResult, showScoreboard, showShop } from "./ui/screens";

type Phase = "loading" | "menu" | "playing" | "shop" | "score" | "result";

export class App {
  private glCanvas: HTMLCanvasElement;
  private hudCanvas: HTMLCanvasElement;
  private hud: CanvasRenderingContext2D;
  private overlay: HTMLElement;
  view: World3D;
  private ui: UiState = newUiState();
  private layout: HudLayout;
  world: World | null = null;
  private phase: Phase = "loading";
  private last = 0;
  private dpr = 1;

  private championId = "kaya";
  private difficulty = 1;

  /** Saldiri dugmesi durumu. */
  private attackHeld = false;
  private attackPointer = -1;
  private forcedTarget: Unit | null = null;

  constructor(glCanvas: HTMLCanvasElement, hudCanvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.glCanvas = glCanvas;
    this.hudCanvas = hudCanvas;
    this.hud = hudCanvas.getContext("2d")!;
    this.overlay = overlay;
    this.view = new World3D(glCanvas);
    this.layout = computeLayout(window.innerWidth, window.innerHeight);

    // Zayif cihazlarda golgeleri kapat
    const lowEnd = (navigator.hardwareConcurrency ?? 4) <= 4 || window.innerWidth < 700;
    this.view.setQuality(lowEnd ? "low" : "high");

    this.bindEvents();
    try {
      sfx.setEnabled(localStorage.getItem("rift-sound") !== "0");
    } catch {
      /* depolama kapali olabilir */
    }
    const unlock = (): void => {
      sfx.init();
      sfx.resume();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    this.resize();
    this.boot();
    this.loop(performance.now());
  }

  // -------------------------------------------------------------------------

  private async boot(): Promise<void> {
    this.showLoading("Arazi hazirlaniyor...");
    await new Promise((r) => setTimeout(r, 30));
    await this.view.prepare((msg) => this.showLoading(msg));
    this.openMenu();
  }

  private showLoading(msg: string): void {
    this.overlay.innerHTML = `
      <div class="screen loading">
        <div class="loading-inner">
          <div class="loading-logo">⚔️</div>
          <h1>Rift Mobil</h1>
          <div class="sub">${msg}</div>
          <div class="loading-bar"><span></span></div>
        </div>
      </div>`;
  }

  private bindEvents(): void {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 150));

    const c = this.hudCanvas;
    c.addEventListener("pointerdown", (e) => this.onDown(e), { passive: false });
    c.addEventListener("pointermove", (e) => this.onMove(e), { passive: false });
    c.addEventListener("pointerup", (e) => this.onUp(e), { passive: false });
    c.addEventListener("pointercancel", (e) => this.onUp(e), { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.hudCanvas.width = Math.floor(w * this.dpr);
    this.hudCanvas.height = Math.floor(h * this.dpr);
    this.hudCanvas.style.width = `${w}px`;
    this.hudCanvas.style.height = `${h}px`;
    this.layout = computeLayout(w, h);
    this.view.resize(w, h);
  }

  // -------------------------------------------------------------------------
  // Ekranlar
  // -------------------------------------------------------------------------

  private openMenu(): void {
    this.phase = "menu";
    this.world = null;
    showMainMenu(this.overlay, (r) => {
      this.championId = r.championId;
      this.difficulty = r.difficulty;
      this.startMatch();
    });
  }

  private startMatch(): void {
    this.overlay.innerHTML = "";
    this.ui = newUiState();
    this.forcedTarget = null;
    this.attackHeld = false;
    this.world = new World({
      playerChampionId: this.championId,
      difficulty: this.difficulty,
    });
    this.view.attach(this.world);
    this.phase = "playing";
    this.toast("Mac basladi — koridorlari it, ana binayi yik!");
  }

  private openShop(): void {
    if (!this.world) return;
    this.phase = "shop";
    showShop(this.overlay, this.world.player, () => {
      this.overlay.innerHTML = "";
      this.phase = "playing";
    });
  }

  private openScore(): void {
    if (!this.world) return;
    this.phase = "score";
    showScoreboard(
      this.overlay,
      this.world,
      () => {
        this.overlay.innerHTML = "";
        this.phase = "playing";
      },
      () => {
        this.overlay.innerHTML = "";
        this.openMenu();
      },
    );
  }

  private openResult(): void {
    if (!this.world) return;
    this.phase = "result";
    showResult(
      this.overlay,
      this.world,
      () => {
        this.overlay.innerHTML = "";
        this.startMatch();
      },
      () => {
        this.overlay.innerHTML = "";
        this.openMenu();
      },
    );
  }

  private toast(text: string): void {
    this.ui.toast.push({ text, life: 2.6 });
    if (this.ui.toast.length > 3) this.ui.toast.shift();
  }

  // -------------------------------------------------------------------------
  // Girdi
  // -------------------------------------------------------------------------

  private pointerPos(e: PointerEvent): Vec2 {
    const r = this.hudCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown(e: PointerEvent): void {
    if (this.phase !== "playing" || !this.world) return;
    e.preventDefault();
    const p = this.pointerPos(e);
    const L = this.layout;
    const ui = this.ui;

    for (const key of ["Q", "W", "E", "R"] as const) {
      if (inCircle(L.abilities[key], p.x, p.y, 6)) {
        ui.aim = { key, id: e.pointerId, origin: { ...p }, cur: { ...p }, moved: 0 };
        return;
      }
    }
    if (inCircle(L.summoners[0], p.x, p.y, 6)) {
      ui.aim = { key: "D", id: e.pointerId, origin: { ...p }, cur: { ...p }, moved: 0 };
      return;
    }
    if (inCircle(L.summoners[1], p.x, p.y, 6)) {
      ui.aim = { key: "F", id: e.pointerId, origin: { ...p }, cur: { ...p }, moved: 0 };
      return;
    }
    if (inCircle(L.attack, p.x, p.y, 6)) {
      this.attackHeld = true;
      this.attackPointer = e.pointerId;
      this.pickForcedTarget();
      return;
    }
    if (inCircle(L.shop, p.x, p.y, 8)) {
      this.openShop();
      return;
    }
    if (inCircle(L.recall, p.x, p.y, 8)) {
      const pl = this.world.player;
      if (pl.recallTimer > 0) {
        pl.cancelRecall();
        this.toast("Geri donus iptal edildi");
      } else if (pl.alive) {
        pl.startRecall(this.world);
        this.toast("Usse donuluyor...");
      }
      return;
    }
    if (inCircle(L.scoreboard, p.x, p.y, 8)) {
      this.openScore();
      return;
    }
    if (inCircle(L.autoToggle, p.x, p.y, 8)) {
      ui.autoAttack = !ui.autoAttack;
      this.toast(ui.autoAttack ? "Otomatik saldiri: ACIK" : "Otomatik saldiri: KAPALI");
      return;
    }
    if (inCircle(L.soundToggle, p.x, p.y, 8)) {
      sfx.setEnabled(!sfx.enabled);
      try {
        localStorage.setItem("rift-sound", sfx.enabled ? "1" : "0");
      } catch {
        /* depolama kapali olabilir */
      }
      this.toast(sfx.enabled ? "Ses: ACIK" : "Ses: KAPALI");
      return;
    }
    if (inRect(L.minimap, p.x, p.y)) return;

    if (inRect(L.joystickZone, p.x, p.y) || p.x < L.w * 0.5) {
      ui.joystick = { active: true, id: e.pointerId, base: { ...p }, cur: { ...p } };
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.phase !== "playing") return;
    const p = this.pointerPos(e);
    const ui = this.ui;
    if (ui.joystick.active && ui.joystick.id === e.pointerId) {
      ui.joystick.cur = p;
      e.preventDefault();
    }
    if (ui.aim.key && ui.aim.id === e.pointerId) {
      ui.aim.cur = p;
      ui.aim.moved = Math.hypot(p.x - ui.aim.origin.x, p.y - ui.aim.origin.y);
      e.preventDefault();
    }
  }

  private onUp(e: PointerEvent): void {
    if (this.phase !== "playing" || !this.world) return;
    const ui = this.ui;
    if (ui.joystick.active && ui.joystick.id === e.pointerId) {
      ui.joystick.active = false;
      ui.joystick.id = -1;
      this.world.player.stopMoving();
    }
    if (this.attackPointer === e.pointerId) {
      this.attackHeld = false;
      this.attackPointer = -1;
    }
    if (ui.aim.key && ui.aim.id === e.pointerId) {
      this.releaseAim(ui.aim.key);
      ui.aim.key = null;
      ui.aim.id = -1;
      this.view.aim.hide();
    }
  }

  private releaseAim(key: AimKey): void {
    const world = this.world!;
    const p = world.player;
    if (!p.alive) return;
    const info = aimTarget(world, this.layout, this.ui, p);
    if (!info) return;
    const aim: AimInput = {
      point: info.point,
      dir: norm({ x: info.point.x - p.pos.x, y: info.point.y - p.pos.y }),
      target: info.target,
    };
    if (aim.dir.x === 0 && aim.dir.y === 0) {
      aim.dir = { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    }

    if (key === "D" || key === "F") {
      const idx = key === "D" ? 0 : 1;
      if (!castSummoner(world, p, idx, aim)) {
        const s = p.summoners[idx];
        this.toast(s.cd > 0 ? `${s.spell.name} hazir degil` : `${s.spell.name} kullanilamadi`);
      }
      return;
    }

    const st = p.abilities[key];
    if (st.rank === 0) {
      this.toast("Bu yetenek henuz acilmadi");
      return;
    }
    if (st.cd > 0) {
      this.toast(`${key} hazir degil (${st.cd.toFixed(1)}s)`);
      return;
    }
    if (p.mp < p.costFor(key)) {
      this.toast("Yeterli mana yok");
      return;
    }
    if (!castAbility(world, p, key, aim)) {
      this.toast("Hedef bulunamadi");
    } else if (info.target) {
      this.forcedTarget = info.target;
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.phase !== "playing" || !this.world) return;
    const p = this.world.player;
    const key = e.key.toLowerCase();
    const map: Record<string, AimKey> = { q: "Q", w: "W", e: "E", r: "R", d: "D", f: "F" };
    if (map[key]) {
      const ak = map[key];
      const center =
        ak === "D"
          ? this.layout.summoners[0]
          : ak === "F"
            ? this.layout.summoners[1]
            : this.layout.abilities[ak];
      this.ui.aim = {
        key: ak,
        id: -2,
        origin: { x: center.x, y: center.y },
        cur: { x: center.x, y: center.y },
        moved: 0,
      };
      this.releaseAim(ak);
      this.ui.aim.key = null;
      this.view.aim.hide();
      return;
    }
    if (key === " ") this.pickForcedTarget();
    else if (key === "b") p.alive && p.startRecall(this.world);
    else if (key === "p") this.openShop();
    else if (key === "tab") {
      e.preventDefault();
      this.openScore();
    }
  }

  // -------------------------------------------------------------------------
  // Oyuncu kontrolu
  // -------------------------------------------------------------------------

  private pickForcedTarget(): void {
    const world = this.world;
    if (!world) return;
    const p = world.player;
    this.forcedTarget = smartTarget(world, p, p.stats.attackRange + 150, "unit");
  }

  private controlPlayer(): void {
    const world = this.world!;
    const p = world.player;
    if (!p.alive) return;
    const ui = this.ui;

    if (ui.joystick.active) {
      const dx = ui.joystick.cur.x - ui.joystick.base.x;
      const dy = ui.joystick.cur.y - ui.joystick.base.y;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        const dir = { x: dx / d, y: dy / d };
        p.path = [{ x: p.pos.x + dir.x * 80, y: p.pos.y + dir.y * 80 }];
        p.moveTarget = null;
        p.facing = Math.atan2(dir.y, dir.x);
        p.cancelRecall();
      } else {
        p.path.length = 0;
      }
    }

    const reach = p.stats.attackRange + p.radius;
    let target: Unit | null = this.forcedTarget;
    if (target && (!target.alive || dist(target.pos, p.pos) > reach + 220)) target = null;
    if (!target && ui.autoAttack) target = this.nearestAutoTarget(reach + 24);
    if (target && !target.alive) target = null;
    this.forcedTarget = target;
    p.target = target && dist(target.pos, p.pos) <= reach + target.radius + 12 ? target : null;

    if (this.attackHeld && target && !ui.joystick.active) {
      const d = dist(p.pos, target.pos);
      const stop = reach + target.radius - 4;
      if (d > stop) {
        const dir = norm({ x: target.pos.x - p.pos.x, y: target.pos.y - p.pos.y });
        p.path = [{ x: p.pos.x + dir.x * 60, y: p.pos.y + dir.y * 60 }];
      } else {
        p.path.length = 0;
      }
      p.target = target;
    }
  }

  private nearestAutoTarget(range: number): Unit | null {
    const world = this.world!;
    const p = world.player;
    let best: Unit | null = null;
    let bestScore = -Infinity;
    for (const u of world.allUnits()) {
      if (!u.alive || u.team === p.team) continue;
      if (!u.visibleTo[p.team]) continue;
      if (u.isStructure && u.kind !== "tower") continue;
      const d = dist(u.pos, p.pos);
      if (d > range + u.radius) continue;
      let score = 200 - d;
      if (u.kind === "champion") score += 260;
      else if (u.kind === "minion") score += 60;
      else if (u.kind === "tower") score -= 60;
      if (u.kind === "minion" && u.hp < p.stats.ad * 1.15) score += 200;
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }

  /** Nisan gostergesini 3B sahnede gunceller. */
  private updateAim(): void {
    const world = this.world;
    const ui = this.ui;
    if (!world || !ui.aim.key || !world.player.alive) {
      this.view.aim.hide();
      return;
    }
    const p = world.player;
    const key = ui.aim.key;
    const info = aimTarget(world, this.layout, ui, p);
    if (!info) {
      this.view.aim.hide();
      return;
    }
    let shape: AimShape = "circle";
    let range = 175;
    let width = 55;
    let color = 0x8fd8ff;
    if (key === "D" || key === "F") {
      shape = "circle";
      range = 120;
      width = 26;
    } else {
      const def = p.def.abilities.find((a) => a.key === key)!;
      range = def.range || 150;
      width = def.width ?? 55;
      color = hexOf(p.def.color);
      switch (def.targeting) {
        case "skillshot":
        case "direction":
          shape = "line";
          break;
        case "cone":
          shape = "cone";
          break;
        case "self":
          shape = "self";
          break;
        case "unit":
          shape = "unit";
          break;
        default:
          shape = "circle";
      }
    }
    this.view.aim.show(shape, p.pos, info.point, range, width, color);
  }

  // -------------------------------------------------------------------------
  // Dongu
  // -------------------------------------------------------------------------

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;

    if (this.phase === "playing" && this.world) {
      this.controlPlayer();
      this.world.update(dt);
      for (const t of this.ui.toast) t.life -= dt;
      this.ui.toast = this.ui.toast.filter((t) => t.life > 0);
      if (this.world.winner !== null) this.openResult();
    }

    const g = this.hud;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.layout.w, this.layout.h);

    if (!this.world || !this.view.ready) {
      if (this.view.ready) this.view.render();
      return;
    }

    this.view.follow(this.world.player.pos, clamp(dt * 6, 0, 1));
    this.updateAim();
    this.view.update(this.world, this.phase === "playing" ? dt : 0.0001);
    this.view.render();

    if (this.phase === "playing" || this.phase === "shop" || this.phase === "score") {
      drawHud(g, this.world, this.view, this.layout, this.ui);
    }
  };
}

function hexOf(c: string): number {
  const n = parseInt(c.replace("#", ""), 16);
  return Number.isNaN(n) ? 0x8fd8ff : n;
}
