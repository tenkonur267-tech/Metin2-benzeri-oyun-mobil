# 3B Model Kaynaklari

Oyundaki tum karakterler, silahlar, yapilar ve harita susleri hazir
**KayKit** paketlerinden gelir. Uc paket de **CC0 1.0** (kamu mali)
lisanslidir: kisisel ve ticari kullanim serbest, atif zorunlu degil.
Yine de yaraticiya tesekkur olarak burada belirtilmistir.

**Yaratici:** Kay Lousberg — [kaylousberg.itch.io](https://kaylousberg.itch.io/)

| Paket | Depo | Oyunda kullanilan |
| --- | --- | --- |
| Adventurers Character Pack | [KayKit-Character-Pack-Adventures-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | Sampiyonlar (`champ-*.glb`) ve silahlar (kilic, balta, hancer, asa, degnek, arbalet, kalkan, buyu kitabi) |
| Skeletons Character Pack | [KayKit-Character-Pack-Skeletons-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) | Minyonlar (`minion-*.glb`) ve orman canavarlari (`monster-*.glb`) |
| Medieval Hexagon Pack | [KayKit-Medieval-Hexagon-Pack-1.0](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | Kuleler, engelleyiciler, ana bina, us binalari (`tower-*`, `inhibitor-*`, `nexus-*`, `house-*`, `church-*`, `market-*`, `well-*`) ve doga (`tree-*`, `trees-*`, `rock-*`, `mountain-*`, `waterplant-*`) |

Yapilar mavi ve kirmizi olmak uzere iki takim renginde indirilir; oyunda
renk degistirilmez, paketteki hazir varyantlar kullanilir.

## Orman: genis yaprakli agaclar, calilar ve kayalar

`nat-*` ile baslayan modeller **Kenney Nature Kit 2.1** paketinden gelir —
**CC0 1.0**, atif zorunlu degil.

**Yaratici:** [Kenney](https://kenney.nl/assets/nature-kit)
**Ayna depo:** [ETdoFresh/kenney.nl](https://github.com/ETdoFresh/kenney.nl)

| Dosya | Kaynak |
| --- | --- |
| `nat-tree-a` … `nat-tree-f` | `tree_default`, `tree_fat`, `tree_oak`, `tree_detailed`, `tree_tall`, `tree_thin` |
| `nat-bush-a` … `nat-bush-c` | `plant_bush`, `plant_bushDetailed`, `plant_bushLarge` |
| `nat-grass-a`, `nat-grass-b` | `grass_leafs`, `grass_large` |
| `nat-rock-a`, `nat-rock-b` | `rock_largeA`, `rock_largeB` |
| `nat-cliff*` | `cliff_block_rock`, `cliff_top_rock`, `cliff_large_rock` |
| `nat-stump`, `nat-log` | `stump_old`, `log` |

Bu modeller nane yesili / seftali paletiyle gelir; oyunda materyal adina
gore (`leafsGreen`, `woodBark`, `grass`, `dirt`) ormana uyacak sekilde
yeniden boyanir.

## Dokular

`public/textures/` altindaki `grass`, `dirt`, `rock`, `sand` zemin dokulari
[ambientCG](https://ambientcg.com/) **CC0** kutuphanesinden alinmis ve
512 piksel WebP olarak yeniden kodlanmistir.

## Varliklari yeniden indirme

```
npm run assets:fetch
```

`scripts/fetch-assets.mjs` dosyalari kaynagindan indirir, karakterlerde
kullanilmayan animasyon kliplerini atar (`scripts/strip-anims.mjs`) ve
hepsini mobil icin optimize eder (256 piksel WebP doku + meshopt
sikistirma). Ham 40 MB -> yaklasik 4.5 MB.

## Geri kalanlar

Arazi yukseklik alani (koridorlar, nehir yatagi, orman duvarlarinin
kayalik yukseltileri), nehir yuzeyi golgelendiricisi, savas sisi,
efektler, sesler ve arayuz bu depoda kodla uretilir.

## Quaternius — Universal Animation Library (CC0 1.0)

`champ-mannequin.glb` — Quaternius'un Universal Animation Library'sinin
ucretsiz surumu: tek bir Rigify iskeleti (53 kemik) uzerinde manken govde
ve animasyon klipleri. Gercek karakter modeli gelene kadar sampiyon
govdesi olarak kullanilir.

- Kaynak: https://quaternius.com/packs/universalanimationlibrary.html
- Kullanilan glTF surumu: https://github.com/J-Ponzo/gltf-universal-animation-library
- Lisans: CC0 1.0 (atif zorunlu degil)

Bu iskelet Quaternius'un Universal Base Characters ve Ultimate Modular
Characters paketleriyle ayni; o paketlerden bir model eklendiginde
animasyon kurulumu degismeden calisir.
