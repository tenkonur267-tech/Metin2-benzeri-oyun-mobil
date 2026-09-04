# ⚔️ Rift Mobil

Mobil tarayici icin yazilmis, **League of Legends benzeri 5v5 MOBA**. Tamamen
TypeScript + HTML5 Canvas ile yazildi; sunucu, oyun motoru veya harici varlik
dosyasi yok. Telefonda tarayicidan acilir, ana ekrana eklenebilir (PWA) ve
istenirse Android APK'sina paketlenebilir.

> Bilgisayarin yoksa sorun degil: kodu GitHub Actions derleyip GitHub Pages'te
> yayinlar, sen sadece telefondan linke girip oynarsin.

---

## 🎮 Oyun nasil oynanir

| Kontrol | Ne yapar |
| --- | --- |
| **Sol yarim ekran** | Parmagini bas ve surukle → yuzen hareket cubugu |
| **⚔️ (sag alt buyuk dugme)** | Otomatik saldiri; basili tutunca hedefe yaklasir |
| **Q / W / E / R** | Yetenekler. **Basili tut + surukle** = nisan al, birak = kullan. Kisa dokunus = en uygun hedefe otomatik atar |
| **⚡ / 🔥💚 (sag kenar)** | Sihirdar buyuleri (Sicrama + Tutusturma/Iyilestirme) |
| **🛒** | Magaza (oyun durur) |
| **🏠** | Usse geri donus (7 sn, hareket edince iptal) |
| **📊** | Skor tablosu |
| **🤖** | Otomatik saldiri ac/kapa |
| Klavye (masaustu) | `Q W E R D F` yetenekler, `Boşluk` hedef sec, `B` geri don, `P` magaza |

### Kazanma kosulu
Dusman **ana binasini (nexus)** yik. Yolda 3 koridordaki kuleleri ve
engelleyicileri dusurmen gerekir — bir kule yikilmadan arkasindaki kule hasar
almaz. Engelleyici dusunce o koridorda **super minyon** cikar.

### Harita
- 1000x1000 birimlik, nokta-simetrik harita: **ust / orta / alt** koridor + nehir.
- Her takimda **3 katmanli 9 kule + 2 ana bina kulesi + 3 engelleyici + nexus**.
- Ormanda 8 kamp, nehirde **🐉 Ejderha** (kalici takim guclendirmesi) ve
  **🐲 Kadim Ejder** (180 sn boyunca guclu takim buffu).
- Calilar gizlenme saglar, duvarlar gorusu ve hareketi keser (savas sisi aktif).

### Sampiyonlar
| | Sampiyon | Rol | Oynanis |
| --- | --- | --- | --- |
| 🗿 | **Kaya** | Tank | Koni hasari, kalkan, atilma + sersemletme, dev alan ultisi |
| 🌙 | **Selin** | Buyucu | Isin, yildiz yagmuru, isinlanma, dev ay kuresi |
| 🏹 | **Demir** | Nisanci | Guclendirilmis saldiri, saldiri hizi, sicrama, delici ok |
| 🥷 | **Golge** | Suikastci | Hedefe atilma, gizlenme, bicak, eksik cana gore infaz |
| ✨ | **Ayla** | Destek | Isik huzmesi, iyilestirme, hiz, alan koklendirme + sifa |
| 🐺 | **Bozkurt** | Savasci | Sicrayis, kanama + can calma, av modu, bogazlama |
| 🌊 | **Deniz** | Tank | Dalga, kalkan, girdap (ceker), tsunami (iter + sersemletir) |
| 🔥 | **Alev** | Buyucu | Alev topu, ates cemberi, kor sicramasi, meteor |

Yetenek siralari seviye atladikca **otomatik** dagitilir (6/11/16'da ulti).

### Ekonomi
Son vurus altin verir, cevredeki herkes tecrube alir. 28 esyalik magaza; her
sampiyon en fazla **6 esya** ve **1 cizme** tasiyabilir. Esyalar dokunularak
%60 degerine satilir.

---

## 🚀 Calistirma

```bash
npm install
npm run dev        # http://localhost:5173 (telefondan ayni Wi-Fi'da IP ile de acilir)
```

Diger komutlar:

```bash
npm run build      # uretim derlemesi (dist/)
npm run preview    # derlenmis surumu sun
npm run typecheck  # TypeScript kontrolu
npm run check:map  # harita dogrulamasi (koridorlar tikali mi, kamplar duvarda mi)
npm run sim        # 10 botla basli olmayan mac simulasyonu (denge testi)
npm test           # typecheck + harita kontrolu
npm run android:apk    # APK uret (Android SDK gerekir)
npm run assets:generate # uygulama simgesi/acilis ekrani uret
```

`npm run sim kaya 42` seklinde sampiyon ve tohum verebilirsin.

---

## 📱 Telefonda oynamak

### 1) GitHub Pages (en kolay)
`claude/mobile-lol-game-0tjq8j` veya `main` dalina her push'ta
`.github/workflows/deploy.yml` otomatik derleyip yayinlar.

Repo → **Settings → Pages → Source: GitHub Actions** secili olmali. Sonra adres:

```
https://tenkonur267-tech.github.io/Metin2-benzeri-oyun-mobil/
```

Telefonda ac → tarayici menusunden **"Ana ekrana ekle"** → tam ekran, cevrimdisi
calisan bir uygulama gibi acilir (PWA + servis calisani).

### 2) Android APK — hazir indirilebilir paket
Her push'ta `.github/workflows/android.yml` Capacitor + Gradle ile **APK**
uretir, icerigini dogrular ve `apk-latest` etiketli surume yukler.

**Dogrudan indirme (baglanti hep ayni kalir):**
<https://github.com/tenkonur267-tech/Metin2-benzeri-oyun-mobil/releases/download/apk-latest/rift-mobil.apk>

Surum sayfasi:
<https://github.com/tenkonur267-tech/Metin2-benzeri-oyun-mobil/releases/tag/apk-latest>

Kurulum: APK'yi telefonuna indir → Android "bilinmeyen kaynaklardan yukleme"
iznini ver → dosyayi ac. Uygulama tam ekran ve yatay modda acilir, oyun
sirasinda ekran kapanmaz.

> Depo **ozel (private)** oldugu icin APK'yi indirirken telefonda GitHub
> hesabinla giris yapmis olman gerekir. Depoyu herkese acik yaparsan link
> girissiz de calisir.

> Paket **debug** anahtariyla imzalanmistir; dogrudan kurulur ama Google Play'e
> yuklemek icin kendi imza anahtarinla `assembleRelease` alip imzalaman gerekir.

Bilgisayarda uretmek istersen (Android SDK + JDK 17 gerekir):

```bash
npm run android:apk     # dist -> cap sync -> gradlew assembleDebug
# cikti: android/app/build/outputs/apk/debug/app-debug.apk
npx cap open android    # ya da Android Studio'da ac
```

Uygulama simgesi ve acilis ekrani `assets/` altindaki kaynaklardan
`npm run assets:generate` ile uretilir.

---

## 🧱 Proje yapisi

```
src/
├─ core/          matematik (Vec2), rastgele sayi ureteci
├─ game/
│  ├─ constants   harita geometrisi, ekonomi ayarlari, kule/koridor konumlari
│  ├─ grid        arazi izgarasi, gorus hatti, A* yol bulma
│  ├─ types       ortak tipler (Stats, StatusEffect, ChampionDef...)
│  ├─ units       Unit temel sinifi + Minion / Structure / Monster
│  ├─ champion    Champion sinifi (seviye, esya, mana, geri donus)
│  ├─ champions   8 sampiyonun veri tanimi
│  ├─ abilities   32 yetenek + sihirdar buyuleri (uygulama)
│  ├─ items       magaza esyalari
│  ├─ ai          bot karar agaci (koridor / dovus / kusatma / kacis / alisveris)
│  ├─ projectile  mermi ve alan efekti tanimlari
│  ├─ fx          hasar sayilari, parcaciklar, halkalar
│  └─ world       simulasyon: dalgalar, gorunurluk, olum/odul, kazanan
├─ render/
│  ├─ models      sampiyon/canavar tanimlari (renk, silah tipi, baslik)
│  ├─ hud         dokunmatik kontroller, minimap, paneller, can cubuklari
│  ├─ layout      ekran boyutuna gore dugme yerlesimi
│  └─ draw        2B cizim yardimcilari
├─ render3d/
│  ├─ scene       Three.js sahnesi, kamera, isik, golge, izdusum
│  ├─ terrain     prosedurel arazi, kayalar, calilar, agaclar, savas sisi
│  ├─ assets      GLB yukleme, iskelet klonlama, materyal boyama
│  ├─ gear        prosedurel silah / baslik / pelerin / kalkan
│  ├─ actors      sampiyon, minyon, canavar ve yapi temsilleri
│  ├─ fx3d        mermiler, alan etkileri, parcaciklar, nisan gostergesi
│  ├─ portrait3d  modelden menu/HUD portresi uretimi
│  └─ world3d     oyun dunyasini sahneye baglayan katman
├─ dev/           3B model galerisi (gelistirici araci)
├─ ui/            DOM ekranlari (menu, magaza, skor, sonuc)
└─ app.ts         girdi + oyun dongusu
scripts/          harita dogrulama ve denge simulasyonu araclari
```

### Grafikler — gercek 3B
Oyun **Three.js / WebGL** ile 3B olarak cizilir. Oyun mantigi 2B calisir
(x, y); cizim katmani bunu 3B sahneye baglar (X = x, Z = y, Y = yukseklik).

**Karakter modelleri** acik lisansli (CC0) hazir varliklardir:

| Model | Kullanim | Yaratici | Lisans |
| --- | --- | --- | --- |
| `champion.glb` (RobotExpressive) | 8 sampiyonun ortak iskeletli govdesi | Tomás Laulhé (Quaternius) / Don McCurdy | CC0 1.0 |
| `beast.glb` (Fox) | orman canavarlari ve ejderhalar | PixelMannen / Tom Kranis / AsoboStudio | CC0 1.0 |

Ayrintilar: `public/models/CREDITS.md`.

Sampiyonlar ayni iskeleti paylasir ama **hicbiri ayni gorunmez**:
- Govde, aksan ve golge renkleri sampiyona gore materyal bazinda degistirilir.
- **Silahlar kodla uretilip el kemigine takilir** (`Palm2R`): buyuk kilic, kilic,
  balta, asa, deynek, yay, hancer, mizrak, pence — 9 tip.
- **Basliklar** kafa kemigine takilir: kukuleta, migfer, boynuz, tac, maske.
- Kalkan/hancer/kure sol ele, pelerin govde kemigine baglanir.
- Isik veren kureler, aura halkalari ve kalkan kubbesi ayri katmanlardir.

**Animasyonlar** modelin kendi iskelet animasyonlaridir; oyun durumundan
turetilen bir durum makinesi ile calisir: `Idle` (bekleme), `Walking` /
`Running` (hiza gore), `Punch` (saldiri), `Wave` (yetenek), `Death` (olum).
Canavarlar `Survey` / `Walk` / `Run` kullanir.

**Harita tamamen prosedureldir** — disaridan alinan harita gorseli yoktur:
- Yukseklik alani: koridorlar duz ve alcak, orman tepelik, nehir cukur,
  usler yukseltilmis platform, harita kenari yukselen kayalik.
- Kose renkleri (vertex color) ile toprak yol / cimen / nehir yatagi / us
  renkleri gecisli boyanir.
- 190x190 bolmeli tek zemin mesh'i + saydam su yuzeyi.
- Duvarlar dodekahedron kaya kumeleri, calilar yari saydam yaprak kumeleri,
  ~260 agac `InstancedMesh` ile tek cizim cagrisinda.
- Kuleler, engelleyiciler ve ana bina tamamen kodla modellenir: kule hedefe
  donen taret basina, geri tepmeye ve hasar aldikca sonen kristale sahiptir.

**Savas sisi** zemin materyaline enjekte edilen bir shader ile calisir:
96x96'lik bir gorus dokusu her karede muttefik gorus alanlarindan uretilir,
kesfedilmemis bolgeler karartilir, kesfedilmis ama su an gorulmeyen bolgeler
sonuk gosterilir.

**HUD** ayri bir 2B tuvalde cizilir; can cubuklari ve isimler 3B konumlarin
kamera izdusumu ile yerlestirilir. Nisan gostergeleri (cizgi, koni, daire)
zeminde 3B olarak cizilir.

Tum modelleri, silahlari ve animasyonlari incelemek icin:
`npm run dev` → <http://localhost:5173/models.html>

### Tasarim notlari
- **Neredeyse hicbir hazir varlik yok:** iki CC0 karakter modeli disinda
  arazi, yapilar, silahlar, efektler, arayuz ve tum sesler calisma aninda
  uretilir. Uretim paketi ~1.6 MB (215 KB gzip kod + 624 KB model).
- **WebGL gerekir.** Modern her mobil tarayici destekler; golgeler dusuk
  guclu cihazlarda otomatik kapatilir.
- **Harita simetrisi:** koridorlar iki takim icin ayni fiziksel yoldur; kirmizi
  takim ters yonde yurur. Nokta-simetri ust/alt koridoru yer degistirdigi icin
  yapi konumlari aynalanirken koridor etiketi de degisir (`swapLane`).
- **Yol bulma:** 20 birimlik izgarada A* + gorus hatti ile yol duzlestirme.
  Minyonlar yol noktalarini dogrudan takip eder, botlar A* kullanir.
- **Mac suresi:** 12. dakikadan sonra yapilar giderek daha kirilgan olur, boylece
  maclar 22-30 dakikada biter; 30. dakikada sure sinirinda kule/kill farkina gore
  kazanan belirlenir.
- **Denge:** `npm run sim` ile 10 bot birbirine karsi oynatilarak sure, skor ve
  esya dagilimi olculur.
