# THE RACE — Gerçekçi 3D Trafik Motosiklet Sürüşü

Vite + TypeScript + three.js ile yazılmış, tarayıcıda çalışan 3D trafik motosiklet oyunu.
Yoğun otoyol trafiğinde, gerçek motosiklet modellerinin fizik ve ses karakterleriyle sürüş.

## Öne çıkanlar

- **61 gerçek model, 18 marka** — Honda, Yamaha, Kawasaki, Suzuki, Ducati, BMW, KTM, Aprilia,
  Triumph, Harley-Davidson, LiveWire, MV Agusta, Royal Enfield, Indian, Husqvarna, Vespa, Benelli, CFMoto.
  Her modelin beygir/tork (ve devirleri), ıslak ağırlık, azami hız, vites sayısı, quickshifter, şanzıman tipi (manuel/CVT/elektrik)
  ve motor dizilimi tanımlı.
- **Spesifikasyondan türetilen fizik** — tork eğrisi beyan edilen güç ve torku birebir üretir; vites oranları ve aerodinamik
  sürükleme katsayısı (CdA) her motosikletin gerçek azami hızına ulaşacak şekilde çözülür. Ağırlık transferi, arka teker
  çekişi, ABS/şaha kalkma sınırı, wheelie kontrolü, kavrama kaydırarak kalkış, devir kesici, motor freni, rüzgâr tüneli (draft),
  yokuş etkisi. Sonuç: R1 0-100 ≈ 3,1 sn, H2 ≈ 2,9 sn, Classic 350 ≈ 15 sn — hepsi simülasyondan ölçülür ve garajda gösterilir.
- **Gerçekçi sürüş dinamiği** — direksiyon girdisi bir yönelim → yatış → sapma kontrol zinciri üzerinden çalışır; motosiklet
  virajlara kendiliğinden yatar, ters direksiyonla doğrulur, ağır motorlar daha yavaş yatar.
- **Ateşleme sırasına dayalı motor sesi** — her motorun gerçek krank ateşleme açıları ile sentezlenir: sıralı-4 (180°),
  Yamaha crossplane (270-180-90-180), Ducati V4 “Twin Pulse” (90-200-90-340), Aprilia 65° V4, 90° L-twin, Harley 45° V-twin
  (“potato-potato”), 75° KTM, üçlüler, boxer, sıralı-6, tek silindir. Ek olarak süperşarj ıslığı ve blow-off (H2/H2R),
  elektrik motoru vınlaması (LiveWire), emme sesi, kapanışta egzoz patlamaları, vites kesmesi, marş motoru, rüzgâr,
  lastik, bariyer sürtünmesi, Doppler etkili trafik sesleri, araç kornaları, kaza sesleri, yağmur ve gök gürültüsü.
- **Trafik yapay zekâsı** — Intelligent Driver Model ile takip, fren lambaları, sinyal verip şerit değiştirme
  (çarpışma süresi/TTC kontrollü — motorun önüne haksızca kırmaz), ağır araçlar sağ şeritte, polis çakarları, kaza sonrası
  dörtlü flaşörle duran trafik. Sedan, hatchback, SUV, pikap, van, kamyon, tır, otobüs, taksi, polis.
- **Görsel** — ACES ton eşleme, PBR + clearcoat boyalar, gölgeler, bloom, hıza bağlı radyal bulanıklık / kromatik sapma /
  vinyet, prosedürel asfalt (aşınma izleri, çatlaklar, ıslak zeminde su birikintileri), yağmur, şimşek, gece ışık havuzları.
  Motosikletler süperelips kesitlerden lofted kaporta ile her stile (süpersport, naked, macera, tur, cruiser, klasik, skuter)
  ve modele özgü ayrıntılarla (boxer silindirleri, tek kollu salıncak, kanatçıklar, süperşarj, batwing kaporta, org egzoz…)
  üretilir; canlı TFT gösterge, Türk plakası.
- **Animasyon** — IK iskeletli sürücü: eller gidonda, ayaklar marşpedalında, virajda içe sarkma, yüksek hızda yatma,
  fren/ivmede gövde kayması, vites değiştirirken sol ayak, dururken ayak yere; süspansiyon dalışı/çökmesi, dönen ve hızda
  bulanıklaşan jantlar, ragdoll kaza ve kayan motosiklet + kıvılcımlar + parçalar.
- **4 mod** — Sonsuz Tek Yön, Sonsuz Çift Yön (ters şerit ×2 puan), Zamana Karşı, Serbest Sürüş.
- **4 ortam** — Ege Otoyolu (gündüz), Çöl Otoyolu (gün batımı), İstanbul Çevre Yolu (gece), Karadeniz (yağmur, düşük tutuş).
- **Kameralar** — takip, kask içi (gidon ve gösterge görünür), uzak, alçak; başlangıçta sinematik giriş, kazada yavaş çekim.
- **Garaj** — satın alma, renk seçenekleri, motor/fren/yol tutuş yükseltmeleri, “Motoru dinle” (basılı tutarak gazlama).
- **Kayıt** — `localStorage` (şema sürümü, göç, doğrulama, bozuk kayıt yedekleme; depolama kapalıysa bellek içi çalışma).
- **Kontroller** — klavye, dokunmatik butonlar, telefon eğim (jiroskop) ve oyun kolu.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| ↑ / W | Gaz |
| ↓ / S | Fren |
| ← → / A D | Direksiyon |
| Boşluk | Wheelie |
| Q / E | Vites küçült / büyüt (manuel mod) |
| C | Kamera değiştir |
| H | Korna |
| M | Sesi kapat/aç |
| Esc / P | Duraklat |
| ` | FPS / performans göstergesi |

Oyun kolu: RT gaz, LT fren, sol çubuk direksiyon, A wheelie, LB/RB vites, Y kamera, Start duraklat.

## Puanlama

- 40 km/s üstünde hız arttıkça puan akışı hızlanır; **100 km/s üstünde** bonus ve kıl payı geçişler açılır.
- **Kıl payı** (< 0,9 m yanından geçiş) kombo başlatır; 3,2 sn içindeki her yeni geçiş çarpanı artırır (×4'e kadar).
- Çift yönlü yolda **ters şeritte** 100 km/s üstü ×2 puan; karşıdan gelen araçla kıl payı ×1,5.
- Wheelie ve rüzgâr tüneli de puan/hız kazandırır. Kazanılan para ile yeni motosiklet ve yükseltme alınır.

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

`dev/preview.html?bike=ducati-panigale-v4s&yaw=1.2` tek bir motosikleti incelemek için geliştirici aracıdır.

## Testler

- **Birim (235 test)** — her motosikletin tork eğrisinin beyan edilen güç/torku üretmesi, azami hız ve 0-100 aralıkları,
  fren mesafesi, otomatik vites, yatış/şerit değiştirme, viraj takibi, wheelie sınırları, bariyer temas/çarpma,
  rastgele girdilerle NaN oluşmaması; yol geometrisi (300 km/s'de yanal ivme sınırı), trafikte 5 dakikalık simülasyonda
  araçlar arası çakışma olmaması, sabit sürücünün arkasında frenleme; oyun oturumu (geri sayım, kaza, mod kuralları,
  adillik için otopilot); puanlama; kayıt doğrulama/göç/bozuk veri/kota hatası; ateşleme ritimleri ve ses döngüsü sentezi.
- **Uçtan uca (14 test, Playwright)** — üretim derlemesi `vite preview` ile sunulur ve yazılım WebGL (SwiftShader)
  üzerinde: açılış, menülerden tam sürüş akışı, HUD, duraklatma, kaza ve sonuç ekranı, satın alma ve ayarların sayfa yenilemede
  korunması, bozuk/kurcalanmış kayıt, tüm mod/ortamlar, serbest sürüşte yeniden doğma, manuel vites, ses kilidi, mobil
  dokunmatik kontroller, motor sesinin gerçekten duyulabilir olması ve art arda sürüşlerde GPU bellek sızıntısı olmaması.

## Dağıtım

`npm run build` sonrası `dist/` klasörü herhangi bir statik sunucuda çalışır (göreli `base`). Depoda iki GitHub Actions
iş akışı vardır: `ci.yml` her push'ta tip kontrolü, birim testleri, derleme ve uçtan uca testleri çalıştırır;
`deploy.yml` `main` dalını GitHub Pages'e yayımlar (Settings → Pages → Source: GitHub Actions).

## Mimari

```
src/
  data/       motosiklet kataloğu, araçlar, modlar, ortamlar
  physics/    tork eğrisi, şanzıman, motosiklet dinamiği
  world/      yol geometrisi (road-space), trafik yapay zekâsı
  game/       oyun oturumu (render'dan bağımsız simülasyon), puanlama, durum makinesi
  storage/    kayıt yönetimi
  audio/      ateşleme sırası sentezi, motor sesi, oyun sesleri
  render/     motosiklet/sürücü/araç modelleri, dünya akışı, gökyüzü, efektler, kamera, post-process
  input/      klavye, dokunmatik, eğim, oyun kolu
  ui/         menüler, garaj, HUD, takometre
```

Oyun mantığı tamamen `GameSession` içinde sabit 120 Hz adımla çalışır ve three.js'e bağımlı değildir; bu sayede
fizik, trafik ve kurallar Node üzerinde test edilebilir. Dünya, kayan nokta hassasiyeti için her 2 km'de orijin
kaydırılarak sonsuz akar.

---

Marka ve model adları sahiplerinin ticari markalarıdır; bu hayran oyunu herhangi bir üreticiyle bağlantılı değildir.
Sesler örnek kayıt değil, gerçek ateşleme sıraları kullanılarak gerçek zamanlı sentezlenir.
