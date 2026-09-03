import { clamp, dist, norm, type Vec2 } from "./core/math";
import { castAbility, castSummoner, type AimInput } from "./game/abilities";
import type { Champion } from "./game/champion";
import { World } from "./game/world";
import type { Unit } from "./game/units";
import { computeLayout, inCircle, inRect, type HudLayout } from "./render/layout";
import { Renderer } from "./render/renderer";
import {
  aimTarget,
  drawHud,
  newUiState,
  smartTarget,
  type AimKey,
  type UiState,
} from "./render/hud";
import { showMainMenu, showResult, showScoreboard, showShop } from "./ui/screens";

type Phase = "menu" | "playing" | "shop" | "score" | "result";

export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private overlay: HTMLElement;
  renderer = new Renderer();
  private ui: UiState = newUiState();
  private layout: HudLayout;
  world: World | null = null;
  private phase: Phase = "menu";
  private last = 0;
  private raf = 0;
  private dpr = 1;

  private championId = "kaya";
  private difficulty = 1;

  /** Saldiri dugmesi durumu. */
  private attackHeld = false;
  private attackPointer = -1;
  private forcedTarget: Unit | null = null;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.overlay = overlay;
    this.layout = computeLayout(window.innerWidth, window.innerHeight);
    this.bindEvents();
    this.resize();
    this.openMenu();
    this.loop(performance.now());
  }

  // -------------------------------------------------------------------------

  private bindEvents(): void {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 120));

    const c = this.canvas;
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
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.layout = computeLayout(w, h);
    this.renderer.resize(w, h);
  }

  // -------------------------------------------------------------------------
  // Ekran gecisleri
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
    this.renderer.cam.x = this.world.player.pos.x;
    this.renderer.cam.y = this.world.player.pos.y;
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
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown(e: PointerEvent): void {
    if (this.phase !== "playing" || !this.world) return;
    e.preventDefault();
    const p = this.pointerPos(e);
    const L = this.layout;
    const ui = this.ui;

    // Dugmeler
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
    if (inRect(L.minimap, p.x, p.y)) return;

    // Hareket cubugu
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
    }
  }

  private releaseAim(key: AimKey): void {
    const world = this.world!;
    const p = world.player;
    if (!p.alive) return;
    const info = aimTarget(world, this.renderer, this.layout, this.ui, p);
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
      return;
    }
    if (key === " ") {
      this.pickForcedTarget();
    } else if (key === "b") {
      p.alive && p.startRecall(this.world);
    } else if (key === "p") {
      this.openShop();
    } else if (key === "tab") {
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
    const t = smartTarget(world, p, p.stats.attackRange + 150, "unit");
    this.forcedTarget = t;
  }

  private controlPlayer(dt: number): void {
    const world = this.world!;
    const p = world.player;
    if (!p.alive) return;
    const ui = this.ui;

    // Hareket
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

    // Hedefleme
    const reach = p.stats.attackRange + p.radius;
    let target: Unit | null = this.forcedTarget;
    if (target && (!target.alive || dist(target.pos, p.pos) > reach + 220)) target = null;

    if (!target && ui.autoAttack) {
      target = this.nearestAutoTarget(reach + 24);
    }
    if (target && !target.alive) target = null;
    this.forcedTarget = target;
    p.target = target && dist(target.pos, p.pos) <= reach + target.radius + 12 ? target : null;

    // Saldiri dugmesi basiliyken hedefe yaklas
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
      // Son vurus onceligi
      if (u.kind === "minion" && u.hp < p.stats.ad * 1.15) score += 200;
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Dongu
  // -------------------------------------------------------------------------

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;

    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (!this.world) {
      g.fillStyle = "#06101c";
      g.fillRect(0, 0, this.layout.w, this.layout.h);
      return;
    }

    if (this.phase === "playing") {
      this.controlPlayer(dt);
      this.world.update(dt);
      for (const t of this.ui.toast) t.life -= dt;
      this.ui.toast = this.ui.toast.filter((t) => t.life > 0);
      if (this.world.winner !== null) {
        this.openResult();
      }
    }

    const p = this.world.player;
    const follow = p.alive ? p.pos : p.pos;
    this.renderer.centerOn(follow, this.phase === "playing" ? clamp(dt * 7, 0, 1) : 0.05);

    g.fillStyle = "#040b14";
    g.fillRect(0, 0, this.layout.w, this.layout.h);
    this.renderer.draw(g, this.world);
    if (this.phase === "playing" || this.phase === "shop" || this.phase === "score") {
      drawHud(g, this.world, this.renderer, this.layout, this.ui);
    }
  };
}
