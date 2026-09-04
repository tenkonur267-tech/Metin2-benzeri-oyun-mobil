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

Arazi yukseklik alani, savas sisi, efektler, sesler ve arayuz bu depoda
kodla uretilir.
