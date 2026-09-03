import { CHAMPIONS } from "../game/champions";
import { ITEMS } from "../game/items";
import type { Champion } from "../game/champion";
import type { World } from "../game/world";
import { TEAM_NAMES } from "../game/constants";
import { clear, el, onTap } from "./dom";
import { ABILITY_ICON } from "../render/hud";
import { championPortrait } from "../render/portrait";

export interface MenuResult {
  championId: string;
  difficulty: number;
}

/** Ana menu + sampiyon secimi. */
export function showMainMenu(root: HTMLElement, onStart: (r: MenuResult) => void): void {
  clear(root);
  let selected = CHAMPIONS[0].id;
  let difficulty = 1;

  const screen = el("div", { class: "screen" });
  screen.append(
    el("h1", {}, "Rift Mobil"),
    el("div", { class: "sub" }, "5v5 MOBA — sampiyonunu sec, dusman ana binasini yik"),
  );

  const scroll = el("div", { class: "scroll" });
  const grid = el("div", { class: "champ-grid" });
  const detail = el("div", { class: "detail" });

  const renderDetail = (): void => {
    const c = CHAMPIONS.find((x) => x.id === selected)!;
    clear(detail);
    const head = el("div", { class: "detail-head" });
    head.append(championPortrait(c.id, 54, "#4aa8ff"));
    head.append(
      el(
        "div",
        {},
        el("div", { class: "title" }, `${c.name} — ${c.title}`),
        el(
          "div",
          { class: "lore" },
          `${c.role} • ${c.ranged ? "Menzilli" : "Yakin dovus"} — ${c.lore}`,
        ),
      ),
    );
    detail.append(head);
    for (const a of c.abilities) {
      detail.append(
        el(
          "div",
          { class: "ability-line" },
          el("div", { class: "ability-key" }, ABILITY_ICON[`${c.id}:${a.key}`] ?? a.key),
          el(
            "div",
            { class: "ability-body", html: `<b>${a.key} — ${a.name}</b><br>${a.desc}` },
          ),
        ),
      );
    }
  };

  const renderGrid = (): void => {
    clear(grid);
    for (const c of CHAMPIONS) {
      const card = el("div", { class: `champ-card${c.id === selected ? " sel" : ""}` });
      const portrait = el("div", { class: "portrait" });
      portrait.append(championPortrait(c.id, 96, "#4aa8ff"));
      card.append(portrait, el("div", { class: "name" }, c.name), el("div", { class: "role" }, c.role));
      onTap(card, () => {
        selected = c.id;
        renderGrid();
        renderDetail();
      });
      grid.append(card);
    }
  };

  renderGrid();
  renderDetail();
  scroll.append(grid, detail);

  const diffRow = el("div", { class: "row wrap", style: "margin:10px 0 8px" });
  const diffLabels = ["Kolay", "Normal", "Zor"];
  const diffBtns: HTMLButtonElement[] = [];
  diffLabels.forEach((label, i) => {
    const b = el("button", { class: `btn small${i === difficulty ? " primary" : " ghost"}` }, label);
    onTap(b, () => {
      difficulty = i;
      diffBtns.forEach((x, j) => (x.className = `btn small${j === difficulty ? " primary" : " ghost"}`));
    });
    diffBtns.push(b);
    diffRow.append(b);
  });
  diffRow.prepend(el("span", { class: "hint", style: "margin-right:6px" }, "Bot zorlugu:"));

  const play = el("button", { class: "btn primary", style: "width:100%;padding:16px" }, "SAVASA GIR");
  onTap(play, () => onStart({ championId: selected, difficulty }));

  const help = el("div", {
    class: "hint",
    style: "margin-top:8px;text-align:center",
    html:
      "Sol taraf: hareket cubugu • Sag alt: <span class='kbd'>⚔️</span> saldiri, <span class='kbd'>Q W E R</span> yetenekler<br>" +
      "Yetenek dugmesini basili tutup surukleyerek nisan al, birakinca kullan.",
  });

  screen.append(scroll, diffRow, play, help);
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
