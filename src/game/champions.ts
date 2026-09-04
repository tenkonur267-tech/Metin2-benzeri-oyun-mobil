import type { ChampionDef } from "./types";

/**
 * Tum sampiyon tanimlari. Yetenek etkileri `abilities.ts` icinde
 * `<sampiyonId>:<tus>` anahtariyla eslesir.
 *
 * Oyunda hangilerinin yer alacagini asagidaki `ENABLED` listesi belirler.
 */
export const CHAMPION_POOL: ChampionDef[] = [
  // =========================================================================
  {
    id: "kaya",
    name: "Kaya",
    title: "Tas Muhafiz",
    role: "Tank",
    emoji: "🗿",
    color: "#7f9bb5",
    ranged: false,
    lore: "Daglarin kalbinden yontulmus muhafiz. Onunde duran her sey ufalanir.",
    base: {
      hp: 766, hpPerLvl: 125, mp: 340, mpPerLvl: 42,
      hpRegen: 2.1, mpRegen: 1.5,
      ad: 58, adPerLvl: 3.8,
      armor: 38, armorPerLvl: 4.2,
      mr: 32, mrPerLvl: 1.5,
      moveSpeed: 90, attackSpeed: 1.03, asPerLvl: 0.02, attackRange: 20,
    },
    preferredLane: "top",
    buildOrder: ["ruby", "boots_tank", "sunfire", "thornmail", "warmog", "spirit"],
    abilities: [
      { key: "Q", name: "Kaya Vurusu", desc: "Onundeki koniye <b>60/95/130/165/200 (+%80 SG)</b> fiziksel hasar verir ve 1.5sn <b>%30</b> yavaslatir.", range: 120, cooldown: [7, 6.5, 6, 5.5, 5], cost: [40, 45, 50, 55, 60], targeting: "cone" },
      { key: "W", name: "Granit Kalkan", desc: "3sn boyunca <b>80/130/180/230/280 (+%12 maks. can)</b> kalkan kazanir ve <b>+25</b> zirh alir.", range: 0, cooldown: [16, 15, 14, 13, 12], cost: [50, 55, 60, 65, 70], targeting: "self" },
      { key: "E", name: "Sarsinti", desc: "Belirtilen yone atilir; carptigi dusmanlara <b>70/115/160/205/250 (+%60 SG)</b> hasar verir ve <b>0.7sn</b> sersemletir.", range: 210, cooldown: [14, 13, 12, 11, 10], cost: [60, 65, 70, 75, 80], targeting: "direction" },
      { key: "R", name: "Yerin Ofkesi", desc: "Yeri parcalar: cevredeki dusmanlara <b>220/340/460 (+%90 SG)</b> hasar, <b>1.2sn</b> sersemletme.", range: 175, cooldown: [95, 85, 75], cost: [100, 100, 100], targeting: "self", ultimate: true },
    ],
  },

  // =========================================================================
  {
    id: "selin",
    name: "Selin",
    title: "Ay Buyucusu",
    role: "Buyucu",
    emoji: "🌙",
    color: "#8f7bff",
    ranged: true,
    lore: "Ay isigini silaha ceviren gezgin buyucu. Gecenin sessizligi onun ordusudur.",
    base: {
      hp: 603, hpPerLvl: 100, mp: 500, mpPerLvl: 62,
      hpRegen: 1.4, mpRegen: 2.4,
      ad: 48, adPerLvl: 3.0,
      armor: 24, armorPerLvl: 3.4,
      mr: 30, mrPerLvl: 1.3,
      moveSpeed: 87, attackSpeed: 1.00, asPerLvl: 0.018, attackRange: 88,
    },
    preferredLane: "mid",
    buildOrder: ["amulet", "boots_ap", "luden", "rabadon", "voidstaff", "hourglass"],
    abilities: [
      { key: "Q", name: "Ay Oku", desc: "Duz bir ay isini firlatir; ilk hedefe <b>70/110/150/190/230 (+%65 YG)</b> buyu hasari verir.", range: 300, cooldown: [5, 4.6, 4.2, 3.8, 3.4], cost: [45, 50, 55, 60, 65], targeting: "skillshot", width: 20 },
      { key: "W", name: "Yildiz Yagmuru", desc: "Hedef alana 2.5sn boyunca yildiz yagdirir; toplam <b>100/160/220/280/340 (+%70 YG)</b> hasar ve <b>%35</b> yavaslatma.", range: 260, cooldown: [12, 11, 10, 9, 8], cost: [60, 70, 80, 90, 100], targeting: "point", width: 90 },
      { key: "E", name: "Faz Adimi", desc: "Kisa mesafe isinlanir ve 2sn <b>60/90/120/150/180 (+%40 YG)</b> kalkan kazanir.", range: 165, cooldown: [18, 16.5, 15, 13.5, 12], cost: [70, 70, 70, 70, 70], targeting: "point" },
      { key: "R", name: "Dolunay", desc: "Devasa bir ay kuresi indirir: <b>280/430/580 (+%100 YG)</b> buyu hasari ve <b>1.2sn</b> koklendirme.", range: 330, cooldown: [100, 88, 76], cost: [120, 120, 120], targeting: "point", width: 120, ultimate: true },
    ],
  },

  // =========================================================================
  {
    id: "demir",
    name: "Demir",
    title: "Celik Nisanci",
    role: "Nisanci",
    emoji: "🏹",
    color: "#e0b24a",
    ranged: true,
    lore: "Hicbir oku hedefini sasirmadi. Sabri, yayindan daha gergindir.",
    base: {
      hp: 632, hpPerLvl: 107, mp: 380, mpPerLvl: 44,
      hpRegen: 1.5, mpRegen: 1.9,
      ad: 60, adPerLvl: 4.2,
      armor: 26, armorPerLvl: 3.6,
      mr: 28, mrPerLvl: 1.2,
      moveSpeed: 88, attackSpeed: 1.12, asPerLvl: 0.032, attackRange: 90,
    },
    preferredLane: "bot",
    buildOrder: ["dogger", "boots_ad", "sword_inf", "phantom", "bloodthirst", "lastwhisper"],
    abilities: [
      { key: "Q", name: "Delici Ok", desc: "Sonraki saldirin <b>%50/70/90/110/130 SG</b> ek fiziksel hasar verir ve 1.5sn <b>%25</b> yavaslatir.", range: 0, cooldown: [8, 7, 6, 5, 4], cost: [30, 35, 40, 45, 50], targeting: "self" },
      { key: "W", name: "Av Icgudusu", desc: "4sn boyunca <b>+%30/40/50/60/70</b> saldiri hizi ve <b>+%15</b> hareket hizi.", range: 0, cooldown: [16, 15, 14, 13, 12], cost: [50, 50, 50, 50, 50], targeting: "self" },
      { key: "E", name: "Geri Sicrama", desc: "Belirtilen yone hizla sicrar ve 1.5sn <b>+%20</b> saldiri hizi kazanir.", range: 175, cooldown: [15, 14, 13, 12, 11], cost: [60, 60, 60, 60, 60], targeting: "direction" },
      { key: "R", name: "Yildirim Oku", desc: "Cok uzun menzilli delici ok: <b>200/320/440 (+%120 SG)</b> fiziksel hasar, tum hedefleri deler.", range: 620, cooldown: [90, 78, 66], cost: [100, 100, 100], targeting: "skillshot", width: 26, ultimate: true },
    ],
  },

  // =========================================================================
  {
    id: "golge",
    name: "Golge",
    title: "Karanlik Suikastci",
    role: "Suikastci",
    emoji: "🥷",
    color: "#6a5acd",
    ranged: false,
    lore: "Adini duyanlar geriye donup bakar; goren olmaz.",
    base: {
      hp: 661, hpPerLvl: 109, mp: 340, mpPerLvl: 40,
      hpRegen: 1.7, mpRegen: 1.8,
      ad: 60, adPerLvl: 4.0,
      armor: 30, armorPerLvl: 3.8,
      mr: 30, mrPerLvl: 1.3,
      moveSpeed: 94, attackSpeed: 1.08, asPerLvl: 0.028, attackRange: 21,
    },
    preferredLane: "mid",
    buildOrder: ["dogger", "boots_ad", "hydra", "bloodthirst", "lastwhisper", "sword_inf"],
    abilities: [
      { key: "Q", name: "Golge Darbesi", desc: "Hedefe atilip <b>60/100/140/180/220 (+%75 SG)</b> fiziksel hasar verir.", range: 200, cooldown: [9, 8, 7, 6, 5], cost: [45, 45, 45, 45, 45], targeting: "unit" },
      { key: "W", name: "Sis Perdesi", desc: "2.5sn gizlenir, <b>+%30/35/40/45/50</b> hareket hizi kazanir. Saldirinca gizlilik bozulur.", range: 0, cooldown: [20, 19, 18, 17, 16], cost: [55, 55, 55, 55, 55], targeting: "self" },
      { key: "E", name: "Bicak Firlatma", desc: "Bicak firlatir: <b>55/90/125/160/195 (+%55 SG)</b> hasar ve 2sn <b>%30</b> yavaslatma.", range: 280, cooldown: [7, 6.5, 6, 5.5, 5], cost: [40, 45, 50, 55, 60], targeting: "skillshot", width: 16 },
      { key: "R", name: "Infaz", desc: "Hedefe sicrar; eksik canin her <b>%1</b>'i icin hasar artar: <b>150/250/350 (+%80 SG)</b>, en fazla 2 kat.", range: 300, cooldown: [80, 65, 50], cost: [100, 100, 100], targeting: "unit", ultimate: true },
    ],
  },

  // =========================================================================
  {
    id: "ayla",
    name: "Ayla",
    title: "Sifa Rahibesi",
    role: "Destek",
    emoji: "✨",
    color: "#ffd98a",
    ranged: true,
    lore: "Savas alaninda umudu tasiyan son isik.",
    base: {
      hp: 626, hpPerLvl: 102, mp: 480, mpPerLvl: 58,
      hpRegen: 1.6, mpRegen: 2.6,
      ad: 46, adPerLvl: 2.8,
      armor: 27, armorPerLvl: 3.5,
      mr: 32, mrPerLvl: 1.4,
      moveSpeed: 88, attackSpeed: 0.99, asPerLvl: 0.017, attackRange: 86,
    },
    preferredLane: "bot",
    buildOrder: ["amulet", "boots1", "ardent", "redemption", "spirit", "rabadon"],
    abilities: [
      { key: "Q", name: "Isik Huzmesi", desc: "Isik huzmesi firlatir: <b>65/105/145/185/225 (+%60 YG)</b> buyu hasari.", range: 290, cooldown: [6, 5.5, 5, 4.5, 4], cost: [45, 50, 55, 60, 65], targeting: "skillshot", width: 20 },
      { key: "W", name: "Kutsama", desc: "En yakin yarali muttefiki (veya kendini) <b>90/135/180/225/270 (+%55 YG)</b> iyilestirir.", range: 230, cooldown: [12, 11, 10, 9, 8], cost: [70, 80, 90, 100, 110], targeting: "self" },
      { key: "E", name: "Ruzgar Bereketi", desc: "Kendine ve yakin muttefiklere 3sn <b>+%25/30/35/40/45</b> hareket hizi verir.", range: 220, cooldown: [16, 15, 14, 13, 12], cost: [60, 60, 60, 60, 60], targeting: "self" },
      { key: "R", name: "Kutsal Firtina", desc: "Cevredeki dusmanlari <b>1.5sn</b> koklendirir, <b>150/230/310 (+%70 YG)</b> hasar verir; muttefikleri <b>150/250/350</b> iyilestirir.", range: 200, cooldown: [110, 95, 80], cost: [120, 120, 120], targeting: "self", ultimate: true },
    ],
  },

  // =========================================================================
  {
    id: "bozkurt",
    name: "Bozkurt",
    title: "Yaban Avcisi",
    role: "Savasci",
    emoji: "🐺",
    color: "#9a8c78",
    ranged: false,
    lore: "Ormanin gercek sahibi. Izini surdugu hicbir av kacamadi.",
    base: {
      hp: 742, hpPerLvl: 121, mp: 320, mpPerLvl: 38,
      hpRegen: 2.4, mpRegen: 1.6,
      ad: 62, adPerLvl: 4.1,
      armor: 34, armorPerLvl: 4.0,
      mr: 30, mrPerLvl: 1.4,
      moveSpeed: 92, attackSpeed: 1.05, asPerLvl: 0.027, attackRange: 19,
    },
    preferredLane: "top",
    buildOrder: ["ruby", "boots_ad", "triforce", "hydra", "sunfire", "bloodthirst"],
    abilities: [
      { key: "Q", name: "Kurt Sicrayisi", desc: "Hedef noktaya sicrar; inisi cevreye <b>70/115/160/205/250 (+%70 SG)</b> hasar verir.", range: 230, cooldown: [11, 10, 9, 8, 7], cost: [50, 55, 60, 65, 70], targeting: "point" },
      { key: "W", name: "Parcalayan Pence", desc: "Hedefe <b>50/85/120/155/190 (+%50 SG)</b> hasar, 4sn kanama (<b>%60 SG</b>) ve verilen hasarin <b>%40</b>'i kadar can calar.", range: 110, cooldown: [8, 7.5, 7, 6.5, 6], cost: [40, 45, 50, 55, 60], targeting: "cone" },
      { key: "E", name: "Av Cagrisi", desc: "5sn boyunca <b>+%35/45/55/65/75</b> saldiri hizi ve <b>+%12</b> can calma.", range: 0, cooldown: [18, 17, 16, 15, 14], cost: [50, 50, 50, 50, 50], targeting: "self" },
      { key: "R", name: "Bogazlama", desc: "Hedefi <b>1.3sn</b> etkisiz kilar ve <b>250/400/550 (+%100 SG)</b> fiziksel hasar verir.", range: 175, cooldown: [95, 80, 65], cost: [100, 100, 100], targeting: "unit", ultimate: true },
    ],
  },

  // =========================================================================
  {
    id: "deniz",
    name: "Deniz",
    title: "Dalga Bekcisi",
    role: "Tank",
    emoji: "🌊",
    color: "#4fc7d8",
    ranged: false,
    lore: "Firtinayi ehlilestiren tek kisi; dalgalar onun emriyle yukselir.",
    base: {
      hp: 754, hpPerLvl: 123, mp: 420, mpPerLvl: 50,
      hpRegen: 2.0, mpRegen: 2.0,
      ad: 55, adPerLvl: 3.5,
      armor: 36, armorPerLvl: 4.0,
      mr: 34, mrPerLvl: 1.6,
      moveSpeed: 89, attackSpeed: 1.00, asPerLvl: 0.02, attackRange: 21,
    },
    preferredLane: "bot",
    buildOrder: ["ruby", "boots_tank", "liandry", "spirit", "sunfire", "warmog"],
    abilities: [
      { key: "Q", name: "Dalga Kirici", desc: "Onundeki koniye <b>65/105/145/185/225 (+%55 YG)</b> buyu hasari verir ve <b>%35</b> yavaslatir.", range: 135, cooldown: [7, 6.5, 6, 5.5, 5], cost: [45, 50, 55, 60, 65], targeting: "cone" },
      { key: "W", name: "Su Kalkani", desc: "Kendine ve yakin muttefige <b>90/140/190/240/290 (+%45 YG)</b> kalkan verir.", range: 200, cooldown: [15, 14, 13, 12, 11], cost: [60, 65, 70, 75, 80], targeting: "self" },
      { key: "E", name: "Girdap", desc: "Hedef alanda girdap acar: dusmanlari merkeze ceker, <b>70/110/150/190/230 (+%50 YG)</b> hasar ve <b>%40</b> yavaslatma.", range: 250, cooldown: [14, 13, 12, 11, 10], cost: [70, 75, 80, 85, 90], targeting: "point", width: 95 },
      { key: "R", name: "Tsunami", desc: "Dev bir dalga gonderir: <b>240/380/520 (+%80 YG)</b> hasar, dusmanlari geri iter ve <b>1sn</b> sersemletir.", range: 380, cooldown: [105, 92, 80], cost: [120, 120, 120], targeting: "skillshot", width: 90, ultimate: true },
    ],
  },

  // =========================================================================
  {
    id: "alev",
    name: "Alev",
    title: "Ates Ruhu",
    role: "Buyucu",
    emoji: "🔥",
    color: "#ff7a3c",
    ranged: true,
    lore: "Kul olmus bir sehrin son korundan dogdu. Ofkesi hic sonmedi.",
    base: {
      hp: 597, hpPerLvl: 99, mp: 490, mpPerLvl: 60,
      hpRegen: 1.4, mpRegen: 2.3,
      ad: 48, adPerLvl: 3.0,
      armor: 23, armorPerLvl: 3.3,
      mr: 30, mrPerLvl: 1.3,
      moveSpeed: 86, attackSpeed: 0.99, asPerLvl: 0.017, attackRange: 87,
    },
    preferredLane: "mid",
    buildOrder: ["amulet", "boots_ap", "liandry", "rabadon", "voidstaff", "hourglass"],
    abilities: [
      { key: "Q", name: "Alev Topu", desc: "Alev topu firlatir: <b>75/115/155/195/235 (+%60 YG)</b> hasar ve 3sn yanma (<b>%25 YG</b>).", range: 290, cooldown: [5.5, 5, 4.5, 4, 3.5], cost: [50, 55, 60, 65, 70], targeting: "skillshot", width: 22 },
      { key: "W", name: "Ates Cemberi", desc: "Cevrende 4sn suren alev cemberi: saniyede <b>30/45/60/75/90 (+%20 YG)</b> hasar.", range: 130, cooldown: [14, 13, 12, 11, 10], cost: [60, 65, 70, 75, 80], targeting: "self" },
      { key: "E", name: "Kor Sicrama", desc: "Hedef noktaya isinlanir ve gectigi yerde <b>60/95/130/165/200 (+%40 YG)</b> hasar veren kor birakir.", range: 190, cooldown: [17, 16, 15, 14, 13], cost: [70, 70, 70, 70, 70], targeting: "point" },
      { key: "R", name: "Meteor", desc: "1sn sonra dusen dev meteor: <b>300/450/600 (+%110 YG)</b> hasar ve 3sn yanma.", range: 340, cooldown: [100, 88, 76], cost: [120, 120, 120], targeting: "point", width: 130, ultimate: true },
    ],
  },
];

/**
 * Su an oyunda yer alan sampiyonlar.
 *
 * Tek bir sampiyonla saglam bir temel kurulup digerleri sonra
 * eklenecek; geri acmak icin kimligini bu listeye yazmak yeter.
 */
const ENABLED = ["kaya"];

export const CHAMPIONS: ChampionDef[] = CHAMPION_POOL.filter((c) => ENABLED.includes(c.id));

export const CHAMPION_BY_ID = new Map(CHAMPIONS.map((c) => [c.id, c]));

export function getChampion(id: string): ChampionDef {
  const c = CHAMPION_BY_ID.get(id);
  if (!c) throw new Error(`Bilinmeyen sampiyon: ${id}`);
  return c;
}
