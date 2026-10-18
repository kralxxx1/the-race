# THE RACE — Birinci Şahıs Trafik Motosiklet Sürüşü

Vite + TypeScript + three.js ile yazılmış, tarayıcıda çalışan, Traffic Rider tarzı 3D trafik motosiklet oyunu.
Oyun **yalnızca birinci şahıs (kask içi) kamerayla** oynanır: gidon, gösterge paneli, aynalar ve eldivenli eller
her zaman görüş alanındadır.

## Öne çıkanlar

- **61 gerçek model, 18 marka** — Honda, Yamaha, Kawasaki, Suzuki, Ducati, BMW, KTM, Aprilia, Triumph,
  Harley-Davidson, LiveWire, MV Agusta, Royal Enfield, Indian, Husqvarna, Vespa, Benelli, CFMoto. Her model için ayrı
  bir **plan (blueprint)** yazılmıştır (`src/render/bike/blueprints/family-*.ts`): şasi ve salıncak tipi, depo ve
  kaporta kesitleri, far/stop imzası, egzoz yerleşimi, jant deseni, gösterge tipi, fabrika renk şemaları. Yüksek
  kalitede (LOD0) motor blokları, soğutma kanatları, zincir/kayış, fren diskleri ve kaliperler, kablolar ve hortumlar ayrı
  geometri olarak üretilir; düşük kalitede (LOD1) daha hafif bir sürüm kullanılır.
- **Spesifikasyondan türetilen fizik** — tork eğrisi beyan edilen güç ve torku birebir üretir; vites oranları ve
  aerodinamik sürükleme katsayısı her motosikletin gerçek azami hızına ulaşacak şekilde çözülür. Ağırlık transferi,
  arka teker çekişi, ABS/şaha kalkma sınırı, wheelie kontrolü, kavrama kaydırarak kalkış, devir kesici, motor freni,
  rüzgâr tüneli (draft), yokuş etkisi; yağmur ve karda düşük yol tutuşu.
- **Motora özgü ses** — her motosiklet kendi sesini krank açısına dayalı gerçek zamanlı bir AudioWorklet modelinden
  alır (`src/audio/voices.ts`): ateşleme sırası (sıralı-4, crossplane, V4 “Twin Pulse”, L-twin, 45° V-twin, üçlü, boxer,
  sıralı-6, tek silindir), egzoz boru uzunlukları ve birleşimi (dalga kılavuzu modeli), susturucu tipi, emme/hava kutusu
  sesi, supap ve dişli gürültüsü, yüke bağlı tını, kapanışta patlamalar, süperşarj ıslığı (H2/H2R), elektrik motoru
  vınlaması (LiveWire). Birim testleri her modelin sesinin diğerlerinden ölçülebilir biçimde farklı olduğunu denetler.
  Ayrıca rüzgâr, lastik, yağmur, Doppler etkili trafik, kornalar, katmanlı kaza sesleri ve ortama göre yankı (tünel,
  şehir, açık arazi).
- **Kaza sistemi** — sürücü, motosiklet ve çarpılan araç için XPBD tabanlı fizik çözücüsü: ragdoll sürücü, kayan
  motosiklet, kıvılcımlar, duman, lastik izleri ve kopan parçalar; çarpılan araç fiziksel olarak itilir ve savrulur.
  Kask içi görüş çarpma anında sarsılır, vizör çatlar; ardından aynı kaza (deterministik çözücü) sinematik olarak
  tekrar oynatılır.
- **Trafik** — 14 araç türü (sedan, hatchback, SUV, pikap, panelvan, dolmuş, kamyon, tır, tanker, şehir otobüsü,
  şehirlerarası otobüs, taksi, polis, ambulans), Türk plakaları, tek çizimde yüzlerce örnek (instancing). Yapay zekâ
  sinyal verip şerit değiştirir, sağdan gider, sollar, fren lambası yakar, kazadan sonra dörtlü flaşörle durur.
- **8 harita, 4 zaman, 5 hava** — Banliyö (Bursa), Ege Otoyolu, Çöl Yolu (Konya), İstanbul Gece, Sahil Yolu (Kaş),
  Karadeniz Ormanı, Karlı Dağ Geçidi (Palandöken), Sanayi ve Tüneller (D-100). Şafak/gündüz/gün batımı/gece ve
  açık/bulutlu/yağmurlu/sisli/karlı hava; her harita kendi binalarını, bitki örtüsünü, köprülerini ve tabelalarını üretir.
- **Görsel** — PBR malzemeler, CC0 fotoğraf dokuları ve HDRI gökyüzleri (Poly Haven, ambientCG; lisanslar
  `public/assets/LICENSES.md`), kademeli gölgeler (CSM), GTAO/SSAO, ekran uzayı yansımaları, dinamik ortam yansıması,
  TAA/SMAA/FXAA/MSAA, bloom, ışık hüzmeleri, hacimsel sis, hareket bulanıklığı, alan derinliği, LUT renk derecelendirme,
  ıslak yolda yansımalar, vizörde yağmur damlaları, render-to-texture aynalar.
- **Modlar** — Kariyer (80 görev), Sonsuz Tek Yön, Sonsuz Çift Yön (ters şerit ×2 puan), Zamana Karşı, Serbest Sürüş.
- **Garaj ve sürücü** — satın alma, renk şemaları, motor/fren/yol tutuş yükseltmeleri, filtreleme ve karşılaştırma,
  “Motoru dinle”; sürücü ekranında kask, tulum, eldiven ve vizör tasarımı (oyunda kolda ve ragdoll'da görünür).
- **Kayıt** — `localStorage` (şema sürümü 5, göç, doğrulama, bozuk kayıt yedekleme; depolama kapalıysa bellek içi çalışma).
- **Kontroller** — klavye, dokunmatik butonlar, telefon eğim (jiroskop) ve oyun kolu; menüler klavye ve oyun koluyla
  tamamen gezilebilir.

## Ayarlar

Ayarlar şemadan üretilir (`src/settings/schema.ts`): **159 seçenek, 9 sekme** — Grafik (34), Efektler (26), Dünya (3),
Kamera (18), Ses (27), Kontroller (2), Oynanış (7), Arayüz (33), Erişilebilirlik (9). Beş grafik ön ayarı vardır:
Düşük, Orta, Yüksek, Ultra ve **Ekstrem (RTX)**. Ekstrem; 8192 gölge haritası, her karede ortam yansıması, 4K
dokular, GTAO, SSR ve tüm efektleri açar ve güçlü masaüstü kartlarını bile zorlamak için tasarlanmıştır. Herhangi bir
seçeneği elle değiştirmek ön ayarı “Özel” yapar; ayrıntılı seçenekler “Gelişmiş” altında gizlidir. İlk açılışta cihaz
sınıfına göre ön ayar seçilir; uyarlanabilir çözünürlük FPS düşünce render ölçeğini azaltır.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| ↑ / W | Gaz |
| ↓ / S | Fren |
| ← → / A D | Direksiyon |
| Boşluk | Wheelie |
| Q / E | Vites küçült / büyüt (manuel mod) |
| B | Geriye bak (basılı tut) |
| H | Korna |
| M | Sesi kapat/aç |
| Esc / P | Duraklat |
| ` | FPS / performans göstergesi |

Oyun kolu: RT gaz, LT fren, sol çubuk direksiyon, A wheelie, B korna, LB/RB vites, L3/R3 geriye bak, Start duraklat.
Menülerde Q / E (oyun kolunda LB / RB) sekme değiştirir, Esc geri gider.

## Puanlama

- 40 km/s üstünde hız arttıkça puan akışı hızlanır; **100 km/s üstünde** bonus ve kıl payı geçişler açılır.
- **Kıl payı** (< 0,9 m yanından geçiş) kombo başlatır; 3,2 sn içindeki her yeni geçiş çarpanı artırır (×4'e kadar).
- Çift yönlü yolda **ters şeritte** 100 km/s üstü ×2 puan; karşıdan gelen araçla kıl payı ×1,5.
- Wheelie ve rüzgâr tüneli de puan/hız kazandırır. Kazanılan para ile yeni motosiklet ve yükseltme alınır.

## Kariyer ve ilerleme

- **Kariyer:** 8 haritada 10'ar, toplam **80 görev** (`src/data/career.ts`). Bir haritanın ilk görevi, önceki haritanın son görevi
  bitince açılır. 11 hedef türü vardır: mesafe (süreli/süresiz), kontrol noktaları, sollama, kıl payı, ters şeritte sürüş,
  hız koruma, azami hız, wheelie (toplam/tek seferde), puan, hayatta kalma ve kombo. Her görev 1 yıldız (tamamla) + 2/3 yıldız
  (daha hızlı / daha fazla pay) verir; para, XP, ilk tamamlama bonusu ve harita finallerinde motosiklet kilidi kazandırır.
- **Sürücü seviyesi (1-50):** mesafe, kıl payı, sollama, görev yıldızları, başarımlar ve günlük ödül XP verir. Her motosikletin bir
  seviyesi vardır (fiyat basamağına göre, başlangıç motorları seviye 1); satın almak için seviye ya da kariyer kilidi gerekir.
  Kariyer dışı haritalar `MapDef.unlockLevel` ile açılır.
- **Başarımlar (50), istatistikler (toplam/motor/harita), yerel skor tabloları (mod × harita, ilk 10) ve günlük ödül**
  (yerel takvim gününe göre, seri büyür, kaçırılan gün seriyi sıfırlar, saat geri alınsa bile ikinci kez alınamaz).
- Görevler tarayıcıdan bağımsız `MissionTracker` ile ölçülür (`src/game/missions.ts`); görev sayıları, yıldız eşikleri ve kısıtlar,
  başsız bir **referans sürücü** (`tests/unit/helpers/pilot.ts`) ile gerçek trafik simülasyonunda kalibre edilmiştir.
- Hata ayıklama: `window.__THE_RACE__.startMission('suburb-01')`, `.mission`, `.level`, `.xp`, `.achievementCount`, `.lastOutcome`.

## Geliştirme

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tip kontrolü + üretim derlemesi (dist/)
npm run preview      # derlemeyi http://localhost:4173 adresinde sunar
npm test             # birim testleri (Vitest)
npm run test:e2e     # derler ve Playwright uçtan uca testlerini çalıştırır
npm run check        # hepsi
```

Geliştirici araçları:

- `dev/preview.html?bike=ducati-panigale-v4s&yaw=1.2` tek bir motosikleti incelemek için.
- `node tools/shot.mjs <klasör> <g> <y> "<url>::<ad>"` sayfa ekran görüntüsü, `node tools/play.mjs <url> <önek> [mod] [harita] [zaman] [hava] [ön ayar] [sn]`
  oyunu açıp sürüş başlatır ve ekran görüntüsü alır.
- Alt sistem notları: `docs/dev/` (AUDIO, BIKE_BLUEPRINTS, FPV, TRAFFIC, UI).

## Testler

- **Birim (903 test, Vitest)** — her motosikletin tork eğrisi, azami hız ve 0-100 aralıkları, fren mesafesi, yatış ve
  şerit değiştirme, wheelie sınırları; tüm planların (blueprint) geçerli ve sonlu geometri üretmesi; motor seslerinin
  birbirinden ayırt edilebilirliği ve ateşleme ritimleri; kaza çözücüsünün kararlılığı; trafikte çakışma olmaması ve
  şerit davranışı; her hedef türünden görevlerin referans sürücüyle gerçek trafikte tamamlanabilmesi (80 görevin tam
  taraması: `FULL_CAREER=1 npx vitest run tests/unit/missionSession.test.ts`); puanlama, başarımlar, günlük ödül; ayar
  şeması (ön ayarlar, “Özel” geçişi, her seçeneğin gerçekten okunması); kayıt doğrulama, v1→v5 göçleri, bozuk veri ve
  kota hatası.
- **Uçtan uca (29 test, Playwright)** — üretim derlemesi `vite preview` ile sunulur ve yazılım WebGL (SwiftShader)
  üzerinde: açılış, menülerden tam sürüş akışı, kariyer görevleri, garaj ve sürücü ekranı, ayar ön ayarları ve kalıcılığı,
  bozuk/kurcalanmış kayıt, tüm harita/zaman/hava birleşimleri, duraklatma, kaza ve sonuç ekranı, mobil dokunmatik
  kontroller, motor sesinin gerçekten duyulabilmesi ve art arda sürüşlerde GPU bellek sızıntısı olmaması.

## Dağıtım

`npm run build` sonrası `dist/` klasörü herhangi bir statik sunucuda çalışır (göreli `base`). Depoda iki GitHub Actions
iş akışı vardır: `ci.yml` her push'ta tip kontrolü, birim testleri, derleme ve uçtan uca testleri çalıştırır;
`deploy.yml` `main` dalını GitHub Pages'e yayımlar (Settings → Pages → Source: GitHub Actions).

## Mimari

```
src/
  data/       motosiklet kataloğu, araçlar, modlar, haritalar, kariyer, başarımlar, sürücü ekipmanı
  physics/    tork eğrisi, şanzıman, motosiklet dinamiği, kaza çözücüsü (crash/)
  world/      yol geometrisi (road-space), trafik yapay zekâsı
  game/       oyun oturumu (render'dan bağımsız simülasyon), puanlama, görevler, ilerleme, durum makinesi
  settings/   ayar şeması ve kayıt defteri
  storage/    kayıt yönetimi
  audio/      motor sesi modelleri (dsp/, worklet/), dünya ve trafik sesleri, yankı
  render/     motosiklet planları (bike/), araçlar (vehicle/), haritalar (world/), kask içi görüş (fpv/),
              son işleme (postfx/), gökyüzü, kamera, showroom
  input/      klavye, dokunmatik, eğim, oyun kolu
  ui/         menüler, garaj, kariyer, ayarlar, HUD, takometre
```

Oyun mantığı tamamen `GameSession` içinde sabit 120 Hz adımla çalışır ve three.js'e bağımlı değildir; bu sayede
fizik, trafik ve kurallar Node üzerinde test edilebilir. Dünya, kayan nokta hassasiyeti için her 2 km'de orijin
kaydırılarak sonsuz akar.

## Sınırlar

- Motosikletler üretici CAD verisi değil, gerçek modellerin ölçü ve tasarım özelliklerine göre kodla yazılmış
  yeniden yorumlarıdır. Gerçek zamanlı bir tarayıcı oyununda “milyarlarca parçacık” mümkün değildir; ayrıntı
  geometri, PBR malzemeler, fotoğraf dokuları ve ışıklandırmadan gelir.
- Sesler örnek kayıt değil, fiziksel olarak bilgilendirilmiş gerçek zamanlı sentezdir.

---

Marka ve model adları sahiplerinin ticari markalarıdır; bu hayran oyunu herhangi bir üreticiyle bağlantılı değildir.
