# 3B Model Kaynaklari

Bu klasordeki tum modeller acik lisansli, ucretsiz hazir varliklardir.
`node scripts/fetch-assets.mjs` (veya `npm run assets:fetch`) komutu bunlari
kaynagindan indirir, mobil icin optimize eder (WebP doku, meshopt sikistirma)
ve buraya yazar.

## Karakterler ve canavarlar

| Dosya | Kaynak | Yaratici | Lisans |
| --- | --- | --- | --- |
| `champion.glb` | [three.js — RobotExpressive](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive) | [Tomás Laulhé (Quaternius)](https://www.patreon.com/quaternius), donusturme [Don McCurdy](https://donmccurdy.com/) | **CC0 1.0** |
| `beast.glb` | [glTF Sample Assets — Fox](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox) | PixelMannen (model), Tom Kranis (rig/animasyon), AsoboStudio & Scurest (donusturme) | **CC0 1.0** |

## Harita, yapilar ve silahlar

Asagidaki modeller [BabylonJS/Assets](https://github.com/BabylonJS/Assets)
deposundan alinmistir — **CC BY 4.0**, © Babylon.js / Michel Rousseau.

| Dosya | Kaynak dosya |
| --- | --- |
| `tree-1` … `tree-8` | `meshes/graveYardPack/tree1…tree8` |
| `tree-9`, `tree-10` | `meshes/villagePack/tree1`, `tree2` |
| `bush-1` … `bush-4` | `meshes/villagePack/bush1…bush4` |
| `rock-1` … `rock-4` | `meshes/villagePack/rocks1…rocks4` |
| `stump`, `log` | `meshes/villagePack/stump`, `hollowLog` |
| `stump-2` | `meshes/graveYardPack/stump1` |
| `tower`, `tower-2` | `meshes/graveYardPack/obelisk1`, `obelisk2` |
| `inhibitor` | `meshes/graveYardPack/mausoleumSmall` |
| `nexus` | `meshes/graveYardPack/mausoleumLarge` |
| `cottage`, `well`, `lightpost` | `meshes/villagePack/cottage`, `waterwell`, `lightPost1` |
| `wall`, `wall-arch`, `fence` | `meshes/villagePack/wall`, `wallArch`, `fence` |
| `fence-2` | `meshes/graveYardPack/fenceASection1` |
| `weapon-sword`, `weapon-axe`, `weapon-dagger` | `meshes/Demos/weaponsDemo/meshes/runeSword`, `frostAxe_noMorph`, `moltenDagger` |

CC BY 4.0 atif zorunludur; bu dosya ve oyun icindeki kunye bu atfi saglar.
CC0 varliklar icin atif zorunlu degildir, tesekkur olarak belirtilmistir.

## Dokular

`public/textures/` altindaki `grass`, `dirt`, `rock`, `sand` dokulari
[ambientCG](https://ambientcg.com/) **CC0** kutuphanesinden alinmis ve
512 piksel WebP olarak yeniden kodlanmistir.

## Geri kalanlar

Efektler, arayuz, sesler ve arazi yukseklik alani bu depoda kodla uretilir.
