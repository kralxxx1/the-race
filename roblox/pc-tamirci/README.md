# PC Tamircisi Simülatörü (Roblox)

Bilgisayar tamircisi simülatörü + tycoon. Müşteriyle pazarlık edip arızalı masaüstü ve laptopları
tezgâhında gerçek bir teknisyen gibi sökersin, arızayı bulur, parçayı değiştirir, toplar ve test
edersin. Kazandığın parayla alet, parça, araç alır; dükkânını büyütür, teknisyen/müdür/güvenlik
tutarsın. Şehirde parçacılar, 2. el pazarı, hurdalık, galeriler, internet kafe, veri merkezi ve
50'den fazla mekân var. 60 kişilik sunucu için 66 dükkân arsası hazır.

Oyun Türkçe ve İngilizce'dir (oyuncunun diline göre otomatik, telefondaki Ayarlar'dan değişir).

---

## Hızlı başlangıç (Rojo kurmadan)

1. **`PCTamirci.rbxlx`** dosyasını Roblox Studio ile aç (Dosya → Aç).
2. Üstteki **Play** (F5) ile dene. Sunucu açılışta şehri koddan kurar (birkaç saniye sürer).
3. Yayınlamak için aşağıdaki **Yayınlama** adımlarını uygula.

> Dosyayı kaynak koddan yeniden üretmek için: `rojo build default.project.json -o PCTamirci.rbxlx`

### Rojo ile çalışmak (geliştiriciler için)

```bash
rojo serve
```

Studio'daki Rojo eklentisinden **Connect** dediğinde `src/` klasöründeki her değişiklik anında
Studio'ya yansır.

---

## Yayınlama (herkese açık, 60 kişilik sunucu)

Adım adım rehber: **[YAYINLAMA.md](YAYINLAMA.md)**. Rehber Studio kurulumunu, yüklemeyi, 60 kişilik
sunucuyu, herkese açmayı, içerik anketini, çocuk hesaplarını, sayfa metinlerini, güncellemeyi ve
sorun gidermeyi anlatır. Simge ve kapak görselleri `publish/` klasöründe hazır.

Kısaca:

1. `PCTamirci.rbxlx` dosyasını Studio'da aç → **File → Publish**. Simge olarak `publish/icon.png`,
   kapak olarak `publish/thumbnail_1.jpg` yükle. Adı, türü (Simulation / Tycoon) ve açıklamayı yazıp
   **Save**'e bas.
2. [Creator Dashboard](https://create.roblox.com/dashboard/creations) → oyun → **Configurations →
   Places** → yer → **Access**: **Max Players** değerini `60` yap.
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
(`"rbxassetid://123..."`); boş bırakılan ses çalınmaz. Oyuncular müzik ve efekt seviyesini telefondaki
**Ayarlar**'dan değiştirir.

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
| **H** | Dükkâna dön (bekleme süreli) |
| **F** | Hırsızı / kaçan dolandırıcıyı yakala |

**Tezgâhta:** `1–0` alet seç · parçanın üzerine gel (yeşil = yapılabilir, kırmızı = neden yapılamadığını
yazar) · **sol tık** uygula (söküm, lehim, toz üflemek basılı tutmalıdır) · **sağ tık** o parçayla
yapılabilecek her şeyin menüsü · **sağ tık sürükle / Q, E** kamerayı döndür · **tekerlek** yakınlaştır ·
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
5. **Büyü:** Emlak Ofisi/Telefon → Dükkân: 6 seviye (1→8 tezgâh), dekor (semaver, akvaryum, atari…),
   güvenlik (kamera, alarm, kepenk, çelik kasa), atölye (ESD mat, LED lamba, mikroskop), PC vitrini,
   kurumsal sözleşme ofisi. Personel Ajansı'ndan teknisyen, resepsiyonist, müdür, güvenlik görevlisi,
   temizlikçi tut — teknisyenler boş tezgâhta işleri kendileri bitirir, müdür eksik parçayı sipariş eder.
6. **Toplu işler:** Pixel İnternet Kafe ve Bulut Veri Merkezi makine başı ödemeli sözleşmeler verir.
   **Günlük görevler** (her gün 3 tane: cihaz teslim et, 5 yıldız al, parça al/sat, hırsız yakala…)
   Belediye'deki Görev Panosu'nda ve telefonda; ödüller seviyeyle büyür. Belediye önündeki pano
   sunucunun en iyi tamircilerini gösterir. Müdürün varsa sen oyunda yokken de dükkân kazanır
   (en fazla 8 saat).
7. **Kendi projelerin:** hurda kasaları onar ya da boş kasa alıp PC topla; 2. el pazarına sat ya da
   dükkân vitrinine koy (vitrindeki PC'yi gelen alıcılar daha pahalıya alır).
8. **Şehir hayatı:** sağdan akan trafik (kırmızıda durur, yaya geçidini bekler), kaldırımlarda
   yürüyen yayalar, martı ve güvercin sürüleri, gökyüzünden geçen uçaklar, sıcak hava balonları,
   dönen dönme dolap ve rüzgâr türbinleri, deniz feneri, saat kulesi, gece yanan pencereler ve
   sokak lambaları, yağmur; gündüz kuşlar, gece cırcır böcekleri, sahile yaklaştıkça artan dalga
   sesi ve arka planda sakin lo-fi müzik.
9. **Olaylar:** gece artan hırsızlık (kamera/alarm uyarır, F ile yakala, ödül al), parayı vermeden
   kaçan dolandırıcı, "kutusu yok faturası yok" çalıntı parça satan şüpheli tip (polis gelebilir!),
   yağmur, gün/gece döngüsü.
10. **Ulaşım:** bisiklet, scooter, motorlar, Şahin/Doğan tadında klasikler, servis vanı, dolmuş,
   pikap, SUV, elektrikli sedan, süper spor. Harita'dan taksi de çağırabilirsin.

---

## Ayarlar (`src/shared/Config.luau`)

Dengeyi bu dosyadan değiştirebilirsin: başlangıç parası ve aletleri, gün süresi, müşteri sıklığı ve
sabrı, pazarlık hakkı, hırsızlık aralıkları ve ödülü, taksi ücreti, XP eğrisi, termal macun ideal
aralığı, statik elektrik riski, 2. el fiyat oranları, para birimi sembolü, ses kimlikleri.

Parçalar `Data/Parts.luau`, araçlar `Data/Vehicles.luau`, dükkân seviyeleri ve eşyalar
`Data/Upgrades.luau`, müşteri tipleri ve replikleri `Data/Customers.luau`, arızalar `Data/Faults.luau`,
mekânlar `Data/Locations.luau` içindedir.

> `DataStoreName` değerini değiştirirsen herkesin kaydı sıfırlanır.

---

## Proje yapısı

```
default.project.json   Rojo projesi (Future ışıklandırma, StreamingEnabled, atmosfer…)
PCTamirci.rbxlx        Studio'da açılabilen hazır yer dosyası
YAYINLAMA.md           Studio'dan herkese açık yayına adım adım rehber
publish/               Oyun sayfası simgesi (512×512) ve kapak görselleri (1920×1080)
src/shared/            ReplicatedStorage.Shared — veri, şehir düzeni, 3B modeller, tamir kuralları
src/server/            ServerScriptService.Server — dünya kurucu ve servisler (kayıt, arsa, müşteri,
                       tamir, pazar, çalışan, hırsız, araç, sözleşme, vitrin, zaman)
src/client/            StarterPlayerScripts.Client — HUD, pencereler, tezgâh, harita/GPS, araç,
                       trafik ve yayalar, ortam, öğretici
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
onarabilmesi. Belirli bir dosya için: `lune run tests/run.luau client`.

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
