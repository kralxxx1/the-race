# PC Repair Tycoon (Roblox)

Bilgisayar tamircisi simülatörü + tycoon. Müşteriyle pazarlık edip arızalı masaüstü ve laptopları
tezgâhında gerçek bir teknisyen gibi sökersin, arızayı bulur, parçayı değiştirir, toplar ve test
edersin. Kazandığın parayla alet, parça, araç alırsın. Dükkânını 6 seviyede büyütür, 200'den fazla
eşyayla döşersin. 22 meslekten personel tutar, kendi fabrikanda kendi markanı üretirsin. Faturaları,
vergiyi ve gece hırsızlarını da sen idare edersin.

Şehir 16 × 9 bloktan oluşur. Eski şehirde merkez, teknoloji çarşısı, eski çarşı, sahil ve liman var;
çevresinde havalimanı, organize sanayi, tersane, balıkçı köyü, villa tepesi, teknopark, çiftlikler,
golf kulübü, karavan parkı ve yazlıklar yer alır. Toplam 60'tan fazla mekân var. Sunucu 20 kişiliktir;
34 geniş dükkân arsası hazırdır (her biri eskisinin 3 katı; dükkânlar da 2 kat geniş ve yüksek),
liderlik tabloları en zenginleri ve en değerli işletmeleri gösterir.

Oyun ilk açılışta **dil sorar** (English / Türkçe); sonradan **Ayarlar**'ın (O tuşu) en üstündeki dil
satırından her sekmede değiştirilir ve kayıtla birlikte saklanır. Türkçede arayüzün yanında dünyadaki
tabelalar, panolar ve etkileşim ipuçları da Türkçe olur (`src/shared/Data/WorldTextTR.luau`); yer, dükkân,
kişi ve marka adları yabancı kalır. Ayarlar penceresi ses (ana, müzik, efekt, şehir
sesleri; hepsi açılıp kapanır), görüntü (hazır kalite düzeyleri, gölge, parlama, güneş ışınları,
derinlik bulanıklığı, bulut, parlaklık, görüş açısı, arayüz boyutu, sokak yoğunluğu, isim
etiketleri) ve oyun (yardım seviyesi, zorluk, dil) ayarlarını içerir.

Telefon gerçek bir telefon gibidir (ekran, saat, uygulama simgeleri, rozetler). **Reklam** uygulamasından
broşürden TV reklamına ve e-spor sponsorluğuna kadar kampanyalar başlatırsın: müşteri akışı ve marka
bilinirliği artar, zengin müşteriler (VIP, şirket sahibi) gelir. Müşteri memnuniyeti de ayrı bir göstergedir;
memnuniyet düşünce zor müşteriler (hak arayan, gıcık, ukala) daha sık gelir. Müşterinin türü isim
etiketinde yazar (zenginler altın, zorlar kırmızı renkte).

Hiç bilgisayar bilmeyenler için tezgâhta bir **Koç** kartı vardır: sıradaki adımı söyler, parçayı oklarla
gösterir, parçaların ne işe yaradığını anlatır. Yardım seviyesi (adım adım / sadece ipucu / kapalı)
Ayarlar'dan değişir. İlk üç tamir kolaydır; müşteri sayısı yavaş başlar ve zorluk seçilebilir.

---

## Hızlı başlangıç (Rojo kurmadan)

1. **`PCTamirci.rbxl`** dosyasını Roblox Studio ile aç (Dosya → Aç).
2. Üstteki **Play** (F5) ile dene. Sunucu açılışta şehri koddan kurar (birkaç saniye sürer).
3. Yayınlamak için aşağıdaki **Yayınlama** adımlarını uygula.

> Dosyayı kaynak koddan yeniden üretmek için: `rojo build default.project.json -o PCTamirci.rbxl`

### Rojo ile çalışmak (geliştiriciler için)

```bash
rojo serve
```

Studio'daki Rojo eklentisinden **Connect** dediğinde `src/` klasöründeki her değişiklik anında
Studio'ya yansır.

---

## Yayınlama (herkese açık, 20 kişilik sunucu)

Adım adım rehber: **[YAYINLAMA.md](YAYINLAMA.md)**. Rehber Studio kurulumunu, yüklemeyi, 20 kişilik
sunucuyu, herkese açmayı, içerik anketini, çocuk hesaplarını, sayfa metinlerini, güncellemeyi ve
sorun gidermeyi anlatır. Simge ve kapak görselleri `publish/` klasöründe hazır.

Kısaca:

1. `PCTamirci.rbxl` dosyasını Studio'da aç → **File → Publish**. Simge olarak `publish/icon.png`,
   kapak olarak `publish/thumbnail_1.jpg` yükle. Adı, türü (Simulation / Tycoon) ve açıklamayı yazıp
   **Save**'e bas.
2. [Creator Dashboard](https://create.roblox.com/dashboard/creations) → oyun → **Configurations →
   Places** → yer → **Access**: **Max Players** değerini `20` yap (yer dosyasında zaten 20 yazılı; Studio'da ilk yayında bu değer kullanılır).
3. Studio'da tekrar **File → Publish → Continue**. Yaşa kısıtlı içerik sorusuna **No** deyip
   **Publish**'e bas.
4. Dashboard → **Publish settings → Manage Audience → Manage access → Public**: **Friends**
   seçeneğini kapat → **Save Changes**.

Hesabın en az 2 günlük olmalı ve yaş doğrulaması (yüz tahmini ya da kimlik) yapılmış olmalı.

Sesler hazır gelir. `src/shared/Config.luau` → `Sounds` bölümünde şunlar var:

- gündüz kuş cıvıltısı, gece cırcır böcekleri, yağmur ve sahil dalgaları
- 7 parçalık sakin lo-fi müzik listesi
- tezgâh sesleri: tornavida, basınçlı hava, fırça, klips, güç düğmesi, POST bip kodları

Hepsi Roblox'un lisanslı kütüphanesinden (Pro Sound Effects, APM Music, Roblox) ve her oyunda
ücretsiz kullanılabilir. Bir sesi değiştirmek istersen Creator Store → Audio'dan kimliğini kopyala
(`"rbxassetid://123..."`); boş bırakılan ses çalınmaz. Oyuncular sesi (müzik, efekt, şehir sesi),
görüntüyü ve yardımı **Ayarlar** penceresinden (O tuşu, soldaki ⚙️ düğmesi ya da Telefon → Ayarlar)
değiştirir.

### Şehri Studio'da görünür yapmak (isteğe bağlı)

Şehir normalde sunucu açılınca koddan kurulur, düzenleme modunda boş bir zemin görürsün. Şehri yerin
içine "pişirmek" (görmek/düzenlemek) için Studio'da **View → Command Bar** aç ve şunu çalıştır:

```lua
require(game.ServerScriptService.Server.World.WorldBuilder).build({ bake = true })
```

Sonra yeri kaydet. Sunucu bir dahaki açılışta hazır şehri kullanır. (Dosya boyutu büyür.)

---

## Kontroller

| Tuş | İşlev |
| --- | --- |
| **WASD / Boşluk** | Yürü / zıpla |
| **E** | Konuş (müşteri), tezgâha otur, mağaza/galeri/ajans tezgâhları |
| **M** | Şehir haritası (yakınlaştır, kaydır, yere tıkla: yol tarifi / taksi) |
| **J** | İş listesi |
| **B** | Envanter (parçalar, sarf malzemesi, aletler) |
| **P** | Telefon (dükkân, ekip, garaj, günlük ödül, istatistik, yorumlar, ayarlar, yardım) |
| **O** | Ayarlar (ses, görüntü, oyun, tuşlar) |
| **H** | Dükkâna dön (bekleme süreli) |
| **F** | Hırsızı / kaçan dolandırıcıyı yakala |

**Tezgâhta:** `1–0` alet seç · parçanın üzerine gel (yeşil = yapılabilir, kırmızı = neden yapılamadığını
yazar) · **sol tık** uygula (söküm, lehim, toz üflemek basılı tutmalıdır) · **sağ tık** o parçayla
yapılabilecek her şeyin menüsü · **sağ tık sürükle / Q, E** kamerayı döndür · **tekerlek** imlecin olduğu yere yakınlaştır · **R** kamerayı sıfırla · **L** parça etiketleri ·
sağ paneldeki **Güç, Stres Testi, POST kartı, PSU testi, termal kamera, USB araçları** ile test et ·
**Boşluk** veya **Kalk** ile tezgâhtan kalk. Termal macun: basılı tut, yeşil bölgede bırak.

**Araçta:** `W/S` gaz-fren · `A/D` direksiyon · `Boşluk` in. Telefon → Garaj'dan aracını yola çağır.

Dokunmatik cihazlarda tüm pencereler soldaki düğmelerle açılır; mini harita sağ üsttedir.

---

## Oynanış

1. **Müşteri gelir** (26 farklı tip: öğrenci, oyuncu genç, yayıncı, teyze, pazarlıkçı amca, dede,
   gıcık müşteri, ukala, aceleci, cimri, zengin, fenomen, kripto madenci, turist, şüpheli satıcı,
   dolandırıcı…). Şikâyetini dinle, teklifini kabul et ya da pazarlık et (fazla zorlarsan gider).
2. **Tezgâhta tamir:** vidaları uygun uçla sök, kabloları çıkar, mandalları aç; arızayı test ve
   ölçümle bul (güç, stres, POST kodu, multimetre, termal kamera, MemTest, S.M.A.R.T., antivirüs…).
   Kulak da ipucu verir: tek kısa bip = POST tamam, üç bip = bellek (ya da eğik soket pini),
   dört bip = ekran kartı, hiç ses yok = güç, anakart ya da işlemci.
   30'dan fazla arıza: ölü PSU/GPU, bozuk RAM, kuruyup bitmiş termal macun, toz, ölü fan, ölen disk,
   bozuk Windows, virüs, CMOS pili, şişmiş kondansatör, eğik soket pini, gevşek kablo, laptop batarya
   şişmesi, kırık ekran, sıvı teması, menteşe, şarj soketi… Ayrıca RAM/SSD/ekran kartı yükseltme,
   bakım ve sıfırdan PC toplama işleri.
3. **Parça bul:** Mega Parça Deposu (300+ gerçek parça, günlük fiyat ve kampanyalar), Çarşı
   Parçacısı (eski nesil, ucuz), 2. El Pazarı ve Bit Pazarı (gizli arıza riski!), Hurdalık (hurda
   kasa al, sök, sat). Aletler Usta Alet-Edevat'ta.
4. **Teslim ve ödeme:** müşteri gelir, çalıştırır, öder; memnunsa bahşiş bırakır ve yorum yazar.
   Yorumlar itibarını, itibar da gelen müşteri sayısını belirler.
5. **Büyü:** Emlak Ofisi/Telefon → Dükkân. 6 seviye var (1→8 tezgâh) ve 12 kategoride 200'den
   fazla eşya: dekor, bekleme salonu, mutfak, aydınlatma, iş, güvenlik, iş güvenliği, atölye, BT,
   enerji, personel odası ve dış cephe. Her eşya dükkânda görünür ve bir etki verir: daha çok
   müşteri, bahşiş, sabır, hız, kalite, depo, güvenlik, düşük fatura. Duvar, zemin, renk, tezgâh,
   vitrin ve tente stilini sen seçersin. Zabıta haftada bir denetler; yangın tüpü, ilk yardım
   dolabı gibi zorunlu ekipman eksikse ceza keser.
6. **Ekip:** 22 meslek var: teknisyen, çırak, ustabaşı, laptop teknisyeni, kart tamir uzmanı, veri
   kurtarma, sistem toplayıcı, kalite kontrol, resepsiyonist, kasiyer, satış danışmanı, çaycı,
   temizlikçi, depo sorumlusu, müdür, mali müşavir, sosyal medya, uzaktan destek, ağ teknisyeni,
   kurye, güvenlik görevlisi ve gece bekçisi. Adayları 6 kanaldan bulursun: ajans, İŞKUR, kampüs,
   ilan sitesi, headhunter ve tavsiye. 50 farklı kişilik özelliği var; mülakat yapar, işe alır,
   zam verir, gerekirse tazminatla çıkarırsın. Teknisyenler boş tezgâhta işleri kendileri bitirir,
   öğrenir ve terfi eder.
7. **Faturalar ve vergi:** Her sabah elektrik, su ve internet faturası gelir. Haftada bir kira, SGK,
   sigorta ve haftalık kâr üzerinden gelir vergisi ödenir. Geciken fatura büyür; çok gecikirse
   elektrik kesilir ve müşteri gelmez. Telefon → Faturalar.
8. **Gece güvenliği:** Geceleri hırsızlar dükkâna girer. Kamera ve alarm uyarır; kepenk, çelik kasa
   ve bekçi köpeği korur. Güvenlik görevlisi ve gece bekçisi hırsızı yakalar. Sen de beyzbol
   sopasıyla (Usta Alet-Edevat) kovalayabilir ya da **F** ile yakalayabilirsin; ödülü Polis
   Merkezi'nden alırsın.
9. **Fabrika ve kendi markan:** Sanayi Sitesi'nde fabrika kurarsın (5 seviye). Fabrikada "Atölye"
   markalı RAM, SSD, PSU, kasa ve çevre birimi üretirsin. Ürünleri dükkâna sevk eder ya da
   toptancılara satarsın. Ayrıca PC toplar, monitör, klavye ve fareyle set yapıp vitrinde satarsın.
10. **Toplu işler ve görevler:** Makine başı ödemeli sözleşmeleri altı yer verir: Pixel İnternet
    Kafe, Bulut Veri Merkezi, Organize Sanayi, Teknopark, Havalimanı ve Villa Tepe Kulübü. Her gün 3
    **günlük görev** gelir: cihaz teslim et, 5 yıldız al, parça al/sat, hırsız yakala… Görevler
    Belediye'deki Görev Panosu'nda ve telefondadır; ödüller seviyeyle büyür. Müdürün varsa sen
    oyunda yokken de dükkân kazanır (en fazla 8 saat).
11. **Liderlik tabloları:** Sunucudaki tablolar en zengini, en değerli işletmeyi, en çok tamiri,
    seviyeyi, itibarı, yakalanan hırsızı ve fabrika üretimini gösterir. Tüm sunucularda tüm
    zamanların serveti de tutulur. Belediye önündeki pano tabloları sırayla gösterir; hepsi
    telefonda da var. Oyuncu listesinde para, servet ve seviye görünür.
12. **Kendi projelerin:** Hurda kasaları onar ya da boş kasa alıp PC topla. Sonra 2. el pazarına sat
    ya da dükkân vitrinine koy; vitrindeki PC'yi gelen alıcılar daha pahalıya alır.
13. **Şehir hayatı:** Trafik sağdan akar, kırmızıda durur, yaya geçidini bekler. Kaldırımlarda
    yayalar yürür; martı ve güvercin sürüleri, gökyüzünden geçen uçaklar ve sıcak hava balonları
    görünür. Dönme dolap ve rüzgâr türbinleri döner; deniz feneri ve saat kulesi çalışır. Gece
    pencereler ve sokak lambaları yanar. Yağmurda kamera çevresinde yağmur çizgileri düşer, gökyüzü
    kararır, fırtınada şimşek çakar ve birkaç saniye sonra gök gürültüsü gelir; kapalı mekânda yağmur
    boğuklaşır. Gündüz kuşlar, gece cırcır böcekleri duyulur;
    sahile yaklaştıkça dalga sesi artar, arkada sakin lo-fi müzik çalar.
14. **Olaylar:** Parayı vermeden kaçan dolandırıcı olur. "Kutusu yok faturası yok" çalıntı parça
    satan şüpheli tip gelir; polis gelebilir! Yağmur ve gün/gece döngüsü de var.
15. **Ulaşım:** Bisiklet, scooter, motorlar, Şahin/Doğan tadında klasikler, servis vanı, dolmuş,
    pikap, SUV, elektrikli sedan ve süper spor var. Harita'dan taksi de çağırabilirsin.
16. **Genişleyen şehir:** Eski şehrin batısında havalimanı (pist, terminal, kule, hangarlar),
    organize sanayi bölgesi (fabrikalar, silolar, güneş tarlası, tır parkı), tersane ve balıkçı
    köyü var. Doğusunda villa tepesi, teknopark, çiftlikler, golf kulübü, karavan parkı ve
    yazlıklar yer alır. Haritadaki 🌍 düğmesi bütün şehri gösterir; uzaklaştıkça semt adları
    görünür.

---

## Hazır modeller (Toolbox) ve kendi yaptıklarımız

Şehrin görünen büyük kısmı **hazır, yayınlanmış modellerdir**: binalar, sokak eşyaları, ağaçlar ve bahçe
bitkileri, dükkân mobilyaları (raflar, vitrinler, koltuklar, masa eşyaları), araçlar ve oyuncu
görünüşleri Roblox'un resmî paketlerinden gelir (`assets/`, `tools/assets/curate.luau` ayıklar; betikler
ve sesler atılır). Gökyüzü sesleri, yağmur ve gök gürültüsü de Roblox'un kendi ses kütüphanesindendir.

Kendi çizdiğimiz yerler: **PC'nin içi** (parçalar tamir mantığına bağlı — çıkar, takılır, tozlanır, bozulur —
bu yüzden her parça kodla çizilir), **dükkân kabuğu** (6 seviye, 200+ yükseltme ve yerleşim planı seviyeye
göre değişir) ve **yollar**. Toolbox'taki tam hazır bir dükkân ya da PC modeli sabit bir heykeldir; seviye
atlayan dükkâna, tezgâh/kuyruk noktalarına ve parça parça tamire uymaz. Toolbox'ı taramak için:

```bash
python3 tools/assets/toolbox.py search "gaming pc case" 1
python3 tools/assets/toolbox.py sheet out.png <id> <id> ...
```

---

## Ayarlar (`src/shared/Config.luau`)

Dengeyi bu dosyadan değiştirebilirsin: başlangıç parası ve aletleri, gün süresi, müşteri sıklığı ve
sabrı, pazarlık hakkı, hırsızlık aralıkları ve ödülü, taksi ücreti, XP eğrisi, termal macun ideal
aralığı, statik elektrik riski, 2. el fiyat oranları, para birimi sembolü, ses kimlikleri.

Veri dosyaları `src/shared/Data/` altındadır:

- `Parts.luau`: parçalar
- `Vehicles.luau`: araçlar
- `Upgrades.luau`: dükkân seviyeleri, eşyalar ve stiller
- `Employees.luau`: meslekler, özellikler ve aday kanalları
- `Bills.luau`: faturalar, kira ve vergi
- `Factory.luau`: fabrika seviyeleri ve ürünler
- `Customers.luau`: müşteri tipleri ve replikleri
- `Faults.luau`: arızalar
- `Locations.luau`: mekânlar

Şehir planı (bloklar, semtler, yollar) `src/shared/World/CityLayout.luau` içindedir.

> `DataStoreName` değerini değiştirirsen herkesin kaydı sıfırlanır.

---

## Proje yapısı

```
default.project.json   Rojo projesi (Future ışıklandırma, StreamingEnabled, atmosfer…)
PCTamirci.rbxl        Studio'da açılabilen hazır yer dosyası
YAYINLAMA.md           Studio'dan herkese açık yayına adım adım rehber
publish/               Oyun sayfası simgesi (512×512) ve kapak görselleri (1920×1080)
src/shared/            ReplicatedStorage.Shared — veri, şehir düzeni, 3B modeller, tamir kuralları
src/server/            ServerScriptService.Server — dünya kurucu ve servisler (kayıt, arsa, müşteri,
                       tamir, pazar, çalışan, hırsız, araç, sözleşme, vitrin, fatura, fabrika,
                       liderlik, görev, zaman)
src/client/            StarterPlayerScripts.Client — HUD, pencereler (Ayarlar dahil), tezgâh ve Koç,
                       harita/GPS, araç, trafik ve yayalar, ortam, hava durumu (yağmur, şimşek),
                       dünya yazıları (Türkçe), öğretici; Prefs (ayarlar) ve Controllers/Display
assets/                Roblox'un resmî paketlerinden ayıklanmış modeller (şehir, bitki örtüsü, mobilya,
                       araçlar); tools/assets/curate.luau ile üretilir
tests/                 Lune ile Studio'suz testler
tools/                 Önizleme araçları (3B ve arayüz görüntüleri)
```

Sunucu yetkilidir: para, envanter, tamir adımları, satın alma ve pazarlık sunucuda doğrulanır; istemci
yalnızca istek yollar (hız sınırlı). Kayıtlar oturum kilitli DataStore ile tutulur. Dükkân adları
Roblox metin filtresinden geçer.

---

## Geliştirme

Gerekenler: [Rojo](https://rojo.space) 7, [Lune](https://lune-org.github.io/docs) 0.11,
[selene](https://kampfkarren.github.io/selene/), Python 3 (`pip install msgpack`).

```bash
selene src
```

```bash
lune run tests/run.luau
```

Testler Rojo ile yeri kurar, Roblox motorunu taklit eden başsız bir ortamda **gerçek sunucu ve istemci
betiklerini** çalıştırır: kurallar ve katalog, şehir, dükkân yerleşimi, cihaz modelleri, sunucu
servisleri (müşteri → tezgâh → ödeme), istemci (her pencere, tezgâh, harita/GPS, mağazalar, araç,
trafik, gece ışıkları), sözleşmeler/vitrin ve tamir botunun her arızayı her makine sınıfında
onarabilmesi. Faturalar, gece güvenliği, ekip, fabrika ve liderlik tabloları da test edilir. Şehirde
havada kalan parça, çimden çıkan ince parça, boş arsa ya da tezgâhı eksik mekân kalmaması da
denetlenir. Belirli bir dosya için: `lune run tests/run.luau client`.

Şehrin parça bütçesi için: `lune run tools/worldstats.luau`. Oyundaki yazılar için (Türkçe kalıp
kalmadığına): `lune run tools/scantext.luau world` ve `lune run tools/uidump.luau <sahne>`.

Görsel önizleme (Chromium + Playwright):

```bash
lune run tools/dump.luau shop 4 showcase
```

```bash
node tools/render/shoot.mjs shop4 custom "cam=-14.5,7.5,-4&look=-14.5,4.5,10&fov=50"
```

```bash
lune run tools/uidump.luau bench
```

```bash
node tools/render/shootui.mjs bench
```

Oyun sayfası görselleri (`publish/`). Önce dünyayı, dükkânı ve cihazı dök, sonra görselleri üret:

```bash
lune run tools/dump.luau world
```

```bash
lune run tools/dump.luau shop 6 showcase
```

```bash
lune run tools/dump.luau device desktop 3 high open
```

```bash
node tools/render/promo.mjs
```
