# PC Tamircisi Simülatörü — Kurulum ve Yayınlama Rehberi

Bu rehber, oyunu Roblox Studio'da açmaktan herkese açık yayına kadar her adımı anlatır.
Toplam süre yaklaşık 20–30 dakika (yaş doğrulaması hariç).

> Roblox menülerinin adları zaman zaman değişir. Buradaki adımlar Ekim 2026'daki Roblox
> belgelerine göre yazıldı; bir menüyü bulamazsan en yakın benzer adı ara.

## İçindekiler

- [0. Gerekenler](#0-gerekenler)
- [1. Roblox Studio'yu kur](#1-roblox-studioyu-kur)
- [2. Oyunu Studio'da aç](#2-oyunu-studioda-aç)
- [3. Studio'da dene](#3-studioda-dene)
- [4. Roblox'a yükle](#4-roblox-a-yükle)
- [5. Oyun ayarları](#5-oyun-ayarları)
- [6. Herkese açık yayınla](#6-herkese-açık-yayınla)
- [7. Çocuk hesaplarına açmak (16 yaş altı)](#7-çocuk-hesaplarına-açmak-16-yaş-altı)
- [8. Oyun sayfası metinleri](#8-oyun-sayfası-metinleri)
- [9. Güncelleme yayınlamak](#9-güncelleme-yayınlamak)
- [10. Sorun giderme](#10-sorun-giderme)

---

## 0. Gerekenler

| Ne | Not |
|---|---|
| Windows 10/11 veya macOS bilgisayar | Roblox Studio telefonda ve tablette çalışmaz. |
| Roblox hesabı | En az **2 günlük** olmalı ve hesapta yaptırım bulunmamalı. |
| Yaş doğrulaması | Oyunu 16 yaş ve üstü herkese açmak için gerekli: yüz ile yaş tahmini ya da kimlik. |
| `PCTamirci.rbxlx` | Oyunun tamamı: şehir, kodlar, arayüz, sesler. |
| `publish/` klasörü | `icon.png` (512×512) ve `thumbnail_1.jpg` … `thumbnail_4.jpg` (1920×1080). |

---

## 1. Roblox Studio'yu kur

1. <https://create.roblox.com> adresine git ve Roblox hesabınla giriş yap.
2. **Start Creating** (veya **Download Studio**) düğmesiyle Studio'yu indir ve kur.
3. Studio'yu aç ve aynı hesapla giriş yap.

## 2. Oyunu Studio'da aç

1. `PCTamirci.rbxlx` dosyasına çift tıkla. Olmazsa Studio'da **File → Open from File…** ile seç.
2. Düzenleme modunda **boş bir zemin** görürsün. Bu normal: şehir, oyun başlarken koddan kurulur.
   - İstersen şehri düzenleme modunda da görebilirsin. **View → Command Bar**'ı aç, aşağıdaki
     satırı yapıştırıp Enter'a bas ve dosyayı kaydet:
     ```lua
     require(game.ServerScriptService.Server.World.WorldBuilder).build({ bake = true })
     ```
     Bu adım dosyayı büyütür ve zorunlu değildir.

## 3. Studio'da dene

1. Üstteki **▶ Play** düğmesine bas (F5). 5–10 saniye içinde şehir kurulur ve sana bir dükkân verilir.
2. Kontroller:

   | Tuş | İşlev |
   |---|---|
   | E | Konuş, tezgâha otur, mağazaları aç |
   | M | Harita |
   | P | Telefon |
   | J | İşler |
   | B | Envanter |
   | H | Dükkâna dön |
   | F | Hırsızı yakala |

   Tezgâhta `1–0` tuşlarıyla alet seçilir. Ayrıntılar `README.md` dosyasında.
3. Çok oyunculu deneme: **Test** sekmesi → **Clients and Servers** → oyuncu sayısını **2** yap → **Start**.
4. Durdurmak için **■ Stop**.

> Studio'da ilerlemenin kaydedilmesi için önce oyunu yayınlaman (4. adım), sonra 5. adımdaki
> **API Services** ayarını açman gerekir. Ayar kapalıyken oyun Studio'da kayıtları bellekte tutar;
> yayındaki oyun bundan etkilenmez.

## 4. Roblox'a yükle

1. **File → Publish to Roblox** (yeni sürümlerde yalnızca **File → Publish**) seç. **Game details**
   penceresi açılır.
2. Pencereyi şöyle doldur:

   | Alan | Değer |
   |---|---|
   | Icon | `publish/icon.png` |
   | Thumbnail | `publish/thumbnail_1.jpg` |
   | Name | `PC Tamircisi Simülatörü` |
   | Genre / Subgenre | **Simulation** / **Tycoon** |
   | Description | 8. bölümdeki Türkçe metin |
   | Devices | **Computer**, **Phone**, **Tablet** (Console kapalı kalsın) |

3. **Save** (veya **Create**) düğmesine bas. Oyun Roblox'a yüklenir ama henüz **gizlidir**.
4. Diğer kapak görsellerini ekle: <https://create.roblox.com/dashboard/creations> → oyunu seç →
   **Configurations → Places** → yeri seç → **Thumbnails**. Ardından `thumbnail_2.jpg`,
   `thumbnail_3.jpg` ve `thumbnail_4.jpg` dosyalarını yükle. En fazla 10 görsel eklenebilir.
   Ana sayfa önerileri için en az 2 görselin etkin olması gerekir.

## 5. Oyun ayarları

1. **Sunucu boyutu: 60.** Creator Dashboard → oyun → **Configurations → Places** → yeri seç →
   **Access** sekmesinde **Max Players** (veya **Server Size**) değerini `60` yap ve kaydet.
   - Studio'dan yapmak istersen: **File → Experience Settings → Places** → yerin yanındaki **⋯** →
     **Edit**.
   - Şehirde 66 dükkân arsası var. 60 kişide herkese bir dükkân düşer.
2. **Avatar:** **File → Experience Settings → Avatar** → **R15**. NPC animasyonları R15'e göre.
3. **API Services** (yalnızca Studio'da kayıt denemek için): **File → Experience Settings →
   Security** → **Enable Studio Access to API Services** açık.
4. **Kaydet:** pencerenin altındaki **Save**.

Ses ve müzik için ek ayar gerekmez. Hazır gelen sesler Roblox'un lisanslı kütüphanesinden ve her
oyunda kullanılabilir.

## 6. Herkese açık yayınla

Yeni oyunlar varsayılan olarak gizlidir. Açmak iki aşamalıdır:

**a) Yayına çıkar (Release)**

1. Studio'da yine **File → Publish** → **Continue**.
2. İlk soru, oyunda yaşa kısıtlı içerik olup olmadığını sorar. Bu oyunda kan, sert şiddet, korku,
   kumar ya da yetişkin içerik yok; doğru yanıt **No**. **Publish**'e bas.
   - Bu seçimle oyun **"Content May Vary"** etiketi alır ve yaşını doğrulamış 16+ oyunculara açılır.

**b) Kitleyi aç**

1. <https://create.roblox.com/dashboard/creations> → oyunu seç.
2. **Publish settings → Manage Audience** → **Manage access**.
3. **Public** sekmesinde **Friends** seçeneğini **kapat**. Böylece yalnızca arkadaşların değil,
   herkes girebilir.
4. **Save Changes**.

**c) İçerik derecelendirme anketi (önerilir)**

Dashboard → oyun → **Publish settings → Content rating** → **Start**. Soruları dürüstçe yanıtla.
Bu oyun için beklenen yanıtlar:

| Konu | Yanıt |
|---|---|
| Şiddet | Yok. Hırsız tek tuşla yakalanır, dövüş yok. |
| Kan | Yok |
| Korku | Yok |
| Kaba mizah ve küfür | Yok |
| Alkol veya uyuşturucu | Yok. Semaverde çay var. |
| Kumar | Yok. Robux ile şans oyunu yok. |
| Romantizm | Yok |

Sonuçta büyük olasılıkla **Minimal** ya da **Mild** etiketi çıkar. Yanlış bilgi vermek oyunun ve
hesabın kapatılmasına yol açabilir.

Yayından sonra oyunun bağlantısı Dashboard'da görünür (`roblox.com/games/...`). Bu bağlantıyı
paylaşabilirsin.

## 7. Çocuk hesaplarına açmak (16 yaş altı)

Roblox, 16 yaş altı oyuncuları iki gruba ayırır:

- **Roblox Kids:** 5–8 yaş
- **Roblox Select:** 9–15 yaş

Bu oyuncular yeni oyunları ancak şu koşullar sağlanınca görür:

| Koşul | Ayrıntı |
|---|---|
| Hesap doğrulaması | 18 yaş altıysan yüz ile yaş tahmini, 18 ve üstüysen kimlik. |
| 2 Adımlı Doğrulama | Hesap ayarlarından açılır. |
| İçerik etiketi | Tam anket doldurulmuş olmalı. Kids için **Minimal/Mild**, Select için en fazla **Moderate (9+)**. |
| Yayın ücreti | Oyun başına iade edilebilir bir ücret **ya da** üst üste 2 aydır aktif bir **Roblox Plus/Premium** aboneliği. |
| Değerlendirme | Son 60 günde, oyunla çok ilgilenen oyunculardan **250 farklı oynanma**. Durumu Creator Hub'daki **Audience Reach** panelinden izleyebilirsin. |

Değerlendirme bitene kadar oyun yalnızca yaşını doğrulamış 16+ oyunculara görünür. Bu kuralların
son hali için: <https://create.roblox.com/docs/production/publishing/kids-and-select>

## 8. Oyun sayfası metinleri

**Ad (Türkçe):** `PC Tamircisi Simülatörü`

**Açıklama (Türkçe):**

```
🔧 Kendi bilgisayar tamir dükkânını aç, şehrin en iyi tamircisi ol!

Müşteriler bozuk masaüstü ve laptoplarını getirir: derdini dinle, pazarlık et, tezgâhta gerçek
bir teknisyen gibi sök, arızayı bul ve tamir et. Vidaları doğru uçla sök, tozu basınçlı havayla
temizle, termal macun sür, RAM'i yerine oturt ve POST bip sesini dinle!

⭐ 300+ gerçek parça: ekran kartı, işlemci, anakart, RAM, SSD, PSU…
⭐ 30+ gerçekçi arıza; multimetre, POST kartı ve termal kamera ile teşhis
⭐ Dükkânını büyüt: 8 tezgâh, dekor, vitrin, güvenlik
⭐ Teknisyen, müdür, güvenlik görevlisi tut; sen yokken de kazan
⭐ Kocaman şehir: parçacı, 2. el pazarı, hurdalık, galeri, lunapark, sahil
⭐ Araba ve motor al, şehri gez (M: harita)
⭐ Gıcık müşterilere, dolandırıcılara ve hırsızlara dikkat!
⭐ Günlük görevler, internet kafe ve veri merkezi sözleşmeleri

Rahatlatıcı müzik, gece-gündüz döngüsü ve yağmur eşliğinde tamir keyfi. 🎧
```

**İngilizce sürüm:** Dashboard → oyun → **Localization** bölümünden İngilizce ad ve açıklama
eklenebilir. Oyunun kendisi zaten Türkçe ve İngilizce.

- **Name:** `PC Repair Shop Simulator`
- **Description:**

```
🔧 Open your own computer repair shop and become the best technician in town!

Customers bring broken desktops and laptops: hear them out, haggle, then strip the machine down
on your bench like a real technician, find the fault and fix it. Pick the right screwdriver bit,
blow out the dust, apply thermal paste, reseat the RAM and listen for the POST beep!

⭐ 300+ real parts: graphics cards, CPUs, motherboards, RAM, SSDs, PSUs…
⭐ 30+ realistic faults; diagnose with a multimeter, POST card and thermal camera
⭐ Grow your shop: up to 8 benches, decor, showcase, security
⭐ Hire technicians, a manager and a guard; earn even while you're away
⭐ A huge city: parts dealers, second-hand market, scrapyard, car dealers, fun park, beach
⭐ Buy cars and motorbikes and explore (M: map)
⭐ Watch out for difficult customers, scammers and thieves!
⭐ Daily tasks, internet café and data centre contracts

Relaxing music, a day/night cycle and rainy days while you work. 🎧
```

## 9. Güncelleme yayınlamak

1. Değişikliği Studio'da yap, sonra **File → Publish**.
2. Açık sunucular eski sürümde kalır. Hepsini güncellemek için: Dashboard → oyun →
   **Configure → Server Management** → yeri seç → **Restart Servers**. **Restart only outdated**
   seçeneğini işaretle; oyuncular otomatik olarak yeni sürüme taşınır.

Kodu dosyalardan (Rojo ile) geliştiriyorsan `README.md` dosyasındaki **Geliştirme** bölümüne bak.

## 10. Sorun giderme

| Sorun | Çözüm |
|---|---|
| Studio'da şehir yok | Normal. **▶ Play**'e bas; şehir oyun başlarken kurulur (bkz. 2. adım). |
| Studio'da ilerleme kaydedilmiyor | Oyunu yayınla, sonra **Security → Enable Studio Access to API Services** ayarını aç. |
| Yayınla düğmesi hata veriyor | Hesap 2 günden yeni olabilir ya da yaş doğrulaması bitmemiş olabilir. |
| Arkadaşlarım giremiyor | 6b'deki **Friends** kapalı mı? Oyuncunun yaş doğrulaması var mı (16+)? |
| Bir ses çalmıyor | **View → Output**'ta "Failed to load sound" uyarısına bak. `src/shared/Config.luau` dosyasındaki `Sounds` bölümünde o sesin kimliğini değiştir ya da boş bırak. |
| Telefonda düğmeler küçük | Oyun dokunmatiği destekler. Studio'da **Test → Device** menüsünden telefon görünümünü deneyebilirsin. |
| Türkiye'den girilemiyor | Türkiye'de 2024'ten beri Roblox'a erişim engeli vardı. 2026'da kalkıp kalkmadığına dair haberler çelişkili; sorun buysa oyunla ilgili değildir. Oyun İngilizce de oynanabilir. |
