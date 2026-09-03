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

### 2) Android APK (istege bagli)
Bilgisayar erisimin olursa:

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/android
npm run build
npx cap add android
npx cap sync
npx cap open android      # Android Studio'da APK/AAB uret
```

`capacitor.config.json` hazir; `webDir` olarak `dist` kullanilir.

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
├─ render/        kamera, statik harita cizimi, birim cizimi, HUD, yerlesim
├─ ui/            DOM ekranlari (menu, magaza, skor, sonuc)
└─ app.ts         girdi + oyun dongusu
scripts/          harita dogrulama ve denge simulasyonu araclari
```

### Tasarim notlari
- **Tek dosyalik varlik yok:** tum grafikler Canvas 2D ile prosedurel cizilir,
  sampiyonlar emoji + gradyan daire olarak temsil edilir.
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
