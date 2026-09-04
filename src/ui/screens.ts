import { CHAMPIONS } from "../game/champions";
import { ITEMS } from "../game/items";
import type { Champion } from "../game/champion";
import type { World } from "../game/world";
import { TEAM_NAMES } from "../game/constants";
import { sfx } from "../core/audio";
import type { Quality } from "../render3d/scene";
import { clear, el, onTap } from "./dom";
import { ABILITY_ICON } from "../render/hud";
import { championPortrait } from "../render3d/portrait3d";

export interface MenuResult {
  championId: string;
  difficulty: number;
}

/** Rol suzgeci sekmelerinde kullanilan sira. */
const ROLE_ORDER = ["Savasci", "Tank", "Suikastci", "Nisanci", "Buyucu", "Destek"];

/** Rolun kisa simgesi. */
const ROLE_ICON: Record<string, string> = {
  Savasci: "⚔️",
  Tank: "🛡️",
  Suikastci: "🗡️",
  Nisanci: "🏹",
  Buyucu: "🔮",
  Destek: "✨",
};

/**
 * Lobi ekrani.
 *
 * Mobile Legends'daki duzen: ustte oyuncu seridi, solda secili
 * kahramanin buyuk gorunumu ve yetenekleri, sagda rol sekmeleriyle
 * suzulen kahraman listesi ve savasa girme dugmesi.
 */
export function showMainMenu(root: HTMLElement, onStart: (r: MenuResult) => void): void {
  clear(root);
  let selected = CHAMPIONS[0].id;
  let difficulty = 1;
  let roleFilter = "";
  let abilityKey = "Q";

  const screen = el("div", { class: "screen lobby" });

  // ---------------------------------------------------------------- ust serit
  const roles = ROLE_ORDER.filter((r) => CHAMPIONS.some((c) => c.role === r));
  const bar = el("div", { class: "lobby-bar" });
  const me = el("div", { class: "lobby-me" });
  me.append(
    el("div", { class: "lobby-avatar" }, "🎮"),
    el(
      "div",
      {},
      el("div", { class: "lobby-name" }, "Komutan"),
      el("div", { class: "lobby-rank" }, "Egitim Maci • Tek oyunculu"),
    ),
  );
  const chips = el("div", { class: "lobby-chips" });
  chips.append(
    el("div", { class: "chip" }, "🏆 " + String(CHAMPIONS.length) + " kahraman"),
    el("div", { class: "chip" }, "🗺️ Rift"),
  );
  bar.append(me, el("div", { class: "grow" }), chips);

  // ------------------------------------------------------------- sol: kahraman
  const stage = el("div", { class: "lobby-stage" });
  const hero = el("div", { class: "hero-shot" });
  const heroName = el("div", { class: "hero-name" });
  const heroTitle = el("div", { class: "hero-title" });
  const heroTags = el("div", { class: "hero-tags" });
  const heroLore = el("div", { class: "hero-lore" });
  const skillRow = el("div", { class: "skill-row" });
  const skillText = el("div", { class: "skill-text" });

  const heroInfo = el("div", { class: "hero-info" });
  heroInfo.append(heroName, heroTitle, heroTags, heroLore, skillRow, skillText);
  stage.append(hero, heroInfo);

  const renderHero = (): void => {
    const c = CHAMPIONS.find((x) => x.id === selected)!;
    clear(hero);
    const shot = el("canvas", { class: "hero-canvas" }) as HTMLCanvasElement;
    const src = championPortrait(c.id);
    shot.width = src.width;
    shot.height = src.height;
    shot.getContext("2d")!.drawImage(src, 0, 0);
    hero.append(shot);
    hero.style.setProperty("--hero-color", c.color);

    heroName.textContent = c.name;
    heroTitle.textContent = c.title;
    clear(heroTags);
    heroTags.append(
      el("span", { class: "tag" }, `${ROLE_ICON[c.role] ?? "•"} ${c.role}`),
      el("span", { class: "tag" }, c.ranged ? "Menzilli" : "Yakin dovus"),
    );
    heroLore.textContent = c.lore;

    if (!c.abilities.some((a) => a.key === abilityKey)) abilityKey = c.abilities[0].key;
    clear(skillRow);
    for (const a of c.abilities) {
      const b = el(
        "div",
        { class: `skill${a.key === abilityKey ? " sel" : ""}${a.ultimate ? " ult" : ""}` },
        ABILITY_ICON[`${c.id}:${a.key}`] ?? a.key,
      );
      b.append(el("span", { class: "skill-key" }, a.key));
      onTap(b, () => {
        abilityKey = a.key;
        renderHero();
      });
      skillRow.append(b);
    }
    const a = c.abilities.find((x) => x.key === abilityKey)!;
    skillText.innerHTML = `<b>${a.name}</b><br>${a.desc}`;
  };

  // ------------------------------------------------------------ sag: liste
  const side = el("div", { class: "lobby-side" });
  const tabs = el("div", { class: "role-tabs" });
  const grid = el("div", { class: "champ-grid" });
  const list = el("div", { class: "scroll" }, grid);

  const renderTabs = (): void => {
    clear(tabs);
    const add = (label: string, value: string): void => {
      const t = el("div", { class: `role-tab${roleFilter === value ? " sel" : ""}` }, label);
      onTap(t, () => {
        roleFilter = value;
        renderTabs();
        renderGrid();
      });
      tabs.append(t);
    };
    add("Tumu", "");
    for (const r of roles) add(`${ROLE_ICON[r] ?? ""} ${r}`, r);
  };

  const renderGrid = (): void => {
    clear(grid);
    for (const c of CHAMPIONS) {
      if (roleFilter && c.role !== roleFilter) continue;
      const card = el("div", { class: `champ-card${c.id === selected ? " sel" : ""}` });
      const portrait = el("div", { class: "portrait" });
      portrait.append(championPortrait(c.id));
      card.append(portrait, el("div", { class: "name" }, c.name), el("div", { class: "role" }, c.role));
      onTap(card, () => {
        selected = c.id;
        renderGrid();
        renderHero();
      });
      grid.append(card);
    }
  };

  // -------------------------------------------------------------- alt: baslat
  const foot = el("div", { class: "lobby-foot" });
  const diffRow = el("div", { class: "diff-row" });
  const diffLabels = ["Kolay", "Normal", "Zor"];
  const diffBtns: HTMLElement[] = [];
  diffLabels.forEach((label, i) => {
    const b = el("div", { class: `diff${i === difficulty ? " sel" : ""}` }, label);
    onTap(b, () => {
      difficulty = i;
      diffBtns.forEach((x, j) => (x.className = `diff${j === difficulty ? " sel" : ""}`));
    });
    diffBtns.push(b);
    diffRow.append(b);
  });
  diffRow.prepend(el("span", { class: "diff-label" }, "Bot zorlugu"));

  const play = el("button", { class: "btn primary play-btn" }, "SAVASA GIR");
  onTap(play, () => onStart({ championId: selected, difficulty }));
  foot.append(diffRow, play);

  const help = el("div", {
    class: "hint lobby-help",
    html:
      "Sol taraf: hareket cubugu • Sag alt: <span class='kbd'>⚔️</span> saldiri, <span class='kbd'>Q W E R</span> yetenekler<br>" +
      "Sampiyon kendiliginden vurmaz: saldiri tusunu basili tut (ardisik " +
      "vuruslar kombo yapar). Basili tutup surukleyerek hedef secebilirsin.<br>" +
      "Bos alanda parmagi kaydir: kamerayi cevir • iki parmak: yakinlastir • " +
      "cift dokunus: acyi sifirla",
  });

  side.append(tabs, list, foot, help);

  renderTabs();
  renderGrid();
  renderHero();

  screen.append(bar, el("div", { class: "lobby-body" }, stage, side));
  root.append(screen);
}

/** Ayarlar ekraninin oyuna baglandigi noktalar. */
export interface SettingsHooks {
  zoom: number;
  zoomMin: number;
  zoomMax: number;
  autoTarget: boolean;
  quality: Quality;
  autoQuality: boolean;
  fps: number;
  onZoom: (v: number) => void;
  onAutoTarget: (v: boolean) => void;
  onQuality: (v: Quality) => void;
  onAutoQuality: (v: boolean) => void;
  onSound: (v: boolean) => void;
  onResetCamera: () => void;
  onSurrender: () => void;
  onQuit: () => void;
  onClose: () => void;
}

/**
 * Ayarlar.
 *
 * Kamera uzakligi, otomatik hedef ve ses buradan yonetilir; maci
 * birakma ve teslim olma da burada.
 */
export function showSettings(root: HTMLElement, h: SettingsHooks): void {
  clear(root);
  const screen = el("div", { class: "screen transparent settings" });

  const close = el("button", { class: "btn small" }, "Kapat ✕");
  onTap(close, h.onClose);
  screen.append(
    el("div", { class: "shop-head" }, el("strong", { class: "grow" }, "⚙️ Ayarlar"), close),
  );

  const scroll = el("div", { class: "scroll" });

  // --- Kamera uzakligi ---
  const zoomVal = el("span", { class: "set-val" }, `${Math.round(h.zoom)}`);
  const zoom = el("input", {
    type: "range",
    class: "set-range",
    min: String(h.zoomMin),
    max: String(h.zoomMax),
    step: "5",
    value: String(Math.round(h.zoom)),
  }) as HTMLInputElement;
  zoom.addEventListener("input", () => {
    const v = Number(zoom.value);
    zoomVal.textContent = `${v}`;
    h.onZoom(v);
  });
  scroll.append(
    el(
      "div",
      { class: "set-row" },
      el(
        "div",
        { class: "grow" },
        el("div", { class: "set-name" }, "Kamera uzakligi"),
        el("div", { class: "set-hint" }, "Kucuk deger = yakin plan. Oyunda iki parmakla da ayarlanir."),
      ),
      zoomVal,
    ),
    zoom,
  );

  // --- Anahtarlar ---
  const toggle = (
    name: string,
    hint: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ): HTMLElement => {
    let on = value;
    const btn = el("button", { class: `set-toggle${on ? " on" : ""}` }, on ? "ACIK" : "KAPALI");
    onTap(btn, () => {
      on = !on;
      btn.className = `set-toggle${on ? " on" : ""}`;
      btn.textContent = on ? "ACIK" : "KAPALI";
      onChange(on);
    });
    return el(
      "div",
      { class: "set-row" },
      el("div", { class: "grow" }, el("div", { class: "set-name" }, name), el("div", { class: "set-hint" }, hint)),
      btn,
    );
  };

  // --- Gorsel kalite ---
  const QUALITIES: { id: Quality; label: string; hint: string }[] = [
    { id: "low", label: "Dusuk", hint: "Golge ve orman sisi kapali, en akici" },
    { id: "medium", label: "Orta", hint: "Golge acik, cozunurluk orta" },
    { id: "high", label: "Yuksek", hint: "Tam golge ve cozunurluk" },
  ];
  let quality = h.quality;
  const qHint = el("div", { class: "set-hint" });
  const qRow = el("div", { class: "seg" });
  const paintQuality = (): void => {
    clear(qRow);
    for (const q of QUALITIES) {
      const btn = el("div", { class: `seg-item${q.id === quality ? " sel" : ""}` }, q.label);
      onTap(btn, () => {
        quality = q.id;
        paintQuality();
        h.onQuality(q.id);
      });
      qRow.append(btn);
    }
    qHint.textContent = QUALITIES.find((q) => q.id === quality)!.hint;
  };
  paintQuality();
  scroll.append(
    el(
      "div",
      { class: "set-row" },
      el(
        "div",
        { class: "grow" },
        el("div", { class: "set-name" }, "Gorsel kalite"),
        qHint,
      ),
      el("span", { class: "set-val" }, `${Math.round(h.fps)} fps`),
    ),
    qRow,
  );

  scroll.append(
    toggle(
      "Otomatik kalite",
      "Kareler dususe gecerse kaliteyi kendiliginden bir kademe indirir.",
      h.autoQuality,
      h.onAutoQuality,
    ),
    toggle(
      "Otomatik hedef",
      "Saldiri tusuna basinca en uygun dusmani kendiliginden secer. Kapaliyken hedefi surukleyerek sen secersin.",
      h.autoTarget,
      h.onAutoTarget,
    ),
    toggle("Ses", "Vurus, yetenek ve uyari sesleri.", sfx.enabled, h.onSound),
  );

  const resetCam = el("button", { class: "btn small ghost", style: "width:100%;margin-top:6px" }, "Kamera acisini sifirla");
  onTap(resetCam, h.onResetCamera);
  scroll.append(resetCam);

  // --- Mac islemleri ---
  scroll.append(el("div", { class: "set-sep" }, "Mac"));
  const surrender = el("button", { class: "btn small danger", style: "width:100%" }, "🏳️ Teslim ol");
  onTap(surrender, () => {
    if (surrender.dataset.armed) h.onSurrender();
    else {
      surrender.dataset.armed = "1";
      surrender.textContent = "Emin misin? Tekrar dokun";
    }
  });
  const quit = el("button", { class: "btn small ghost", style: "width:100%;margin-top:6px" }, "🚪 Maçtan cik");
  onTap(quit, () => {
    if (quit.dataset.armed) h.onQuit();
    else {
      quit.dataset.armed = "1";
      quit.textContent = "Emin misin? Tekrar dokun";
    }
  });
  scroll.append(surrender, quit);

  screen.append(scroll);
  root.append(screen);
}

/** Magaza ekrani. */
export function showShop(root: HTMLElement, p: Champion, onClose: () => void): void {
  clear(root);
  const screen = el("div", { class: "screen transparent" });

  const head = el("div", { class: "shop-head" });
  const goldLabel = el("span", { class: "gold" }, `⛁ ${Math.floor(p.gold)}`);
  const close = el("button", { class: "btn small" }, "Kapat ✕");
  onTap(close, onClose);
  head.append(
    el("strong", { class: "grow" }, `🛒 Magaza — ${p.def.name}`),
    goldLabel,
    close,
  );

  const inv = el("div", { class: "inv-row" });
  const grid = el("div", { class: "item-grid" });

  const refresh = (): void => {
    goldLabel.textContent = `⛁ ${Math.floor(p.gold)}`;
    clear(inv);
    for (let i = 0; i < 6; i++) {
      const it = p.items[i];
      const slot = el("div", { class: `inv-slot${it ? " filled" : ""}` }, it ? it.emoji : "");
      if (it) {
        slot.title = `${it.name} — sat (${Math.round(it.cost * 0.6)})`;
        onTap(slot, () => {
          p.sell(i);
          refresh();
        });
      }
      inv.append(slot);
    }
    clear(grid);
    for (const item of ITEMS) {
      const can = p.canBuy(item);
      const owned = p.items.some((x) => x.id === item.id);
      const card = el("div", { class: `item-card${can ? "" : " cant"}` });
      const icon = el("div", { class: "item-icon" }, item.emoji);
      icon.style.background = `linear-gradient(160deg, ${item.color}, rgba(0,0,0,.5))`;
      card.append(
        icon,
        el(
          "div",
          { class: "grow" },
          el("div", { class: "item-name" }, item.name + (owned ? " ✓" : "")),
          el("div", { class: "item-stats" }, item.desc),
          el("div", { class: "item-cost gold" }, `⛁ ${item.cost}`),
        ),
      );
      onTap(card, () => {
        if (p.buy(item)) refresh();
      });
      grid.append(card);
    }
  };
  refresh();

  const scroll = el("div", { class: "scroll" });
  scroll.append(grid);
  screen.append(head, el("div", { class: "hint" }, "Envanter (dokunarak sat):"), inv, scroll);
  root.append(screen);
}

/** Skor tablosu. */
export function showScoreboard(
  root: HTMLElement,
  world: World,
  onClose: () => void,
  onQuit?: () => void,
): void {
  clear(root);
  const screen = el("div", { class: "screen transparent" });
  const close = el("button", { class: "btn small" }, "Kapat ✕");
  onTap(close, onClose);
  const head = el("div", { class: "shop-head" }, el("strong", { class: "grow" }, "📊 Skor Tablosu"));
  if (onQuit) {
    const quit = el("button", { class: "btn small ghost" }, "Maci birak");
    onTap(quit, onQuit);
    head.append(quit);
  }
  head.append(close);
  screen.append(head);

  const scroll = el("div", { class: "scroll" });
  for (const team of [0, 1] as const) {
    const t = world.teams[team];
    scroll.append(
      el(
        "div",
        { style: "margin:8px 0 4px;font-weight:700", class: team === 0 ? "team-blue" : "team-red" },
        `${TEAM_NAMES[team]} Takim — ${t.kills} kill • ${t.towers} kule • 🐉${t.dragons}`,
      ),
    );
    const table = el("table", { class: "score" });
    table.innerHTML =
      "<tr><th>Sampiyon</th><th>Sv</th><th>K/D/A</th><th>CS</th><th>Altin</th><th>Esya</th></tr>";
    for (const c of world.champions.filter((x) => x.team === team)) {
      const row = el("tr");
      row.innerHTML =
        `<td>${c.def.emoji} ${c.displayName()}${c.isPlayer ? " ⭐" : ""}</td>` +
        `<td>${c.level}</td><td>${c.scoreLine()}</td><td>${c.cs}</td>` +
        `<td class="gold">${Math.floor(c.totalGold)}</td>` +
        `<td>${c.items.map((i) => i.emoji).join("")}</td>`;
      table.append(row);
    }
    scroll.append(table);
  }
  screen.append(scroll);
  root.append(screen);
}

/** Mac sonu ekrani. */
export function showResult(
  root: HTMLElement,
  world: World,
  onRestart: () => void,
  onMenu: () => void,
): void {
  clear(root);
  const win = world.winner === world.player.team;
  const screen = el("div", { class: "screen" });
  screen.append(
    el("div", { class: `result-banner ${win ? "win" : "lose"}` }, win ? "ZAFER" : "YENILGI"),
    el(
      "div",
      { class: "sub" },
      `Sure ${Math.floor(world.time / 60)}:${String(Math.floor(world.time % 60)).padStart(2, "0")} — ` +
        `${world.teams[0].kills} / ${world.teams[1].kills}`,
    ),
  );

  const scroll = el("div", { class: "scroll" });
  for (const team of [0, 1] as const) {
    scroll.append(
      el(
        "div",
        { style: "margin:10px 0 4px;font-weight:700", class: team === 0 ? "team-blue" : "team-red" },
        `${TEAM_NAMES[team]} Takim`,
      ),
    );
    const table = el("table", { class: "score" });
    table.innerHTML = "<tr><th>Sampiyon</th><th>Sv</th><th>K/D/A</th><th>CS</th><th>Altin</th></tr>";
    for (const c of world.champions.filter((x) => x.team === team)) {
      const row = el("tr");
      row.innerHTML =
        `<td>${c.def.emoji} ${c.displayName()}${c.isPlayer ? " ⭐" : ""}</td>` +
        `<td>${c.level}</td><td>${c.scoreLine()}</td><td>${c.cs}</td>` +
        `<td class="gold">${Math.floor(c.totalGold)}</td>`;
      table.append(row);
    }
    scroll.append(table);
  }

  const row = el("div", { class: "row", style: "margin-top:10px" });
  const again = el("button", { class: "btn primary grow" }, "TEKRAR OYNA");
  const menu = el("button", { class: "btn grow" }, "ANA MENU");
  onTap(again, onRestart);
  onTap(menu, onMenu);
  row.append(again, menu);

  screen.append(scroll, row);
  root.append(screen);
}
