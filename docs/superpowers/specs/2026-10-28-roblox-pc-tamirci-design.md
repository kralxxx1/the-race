# PC Tamircisi Simülatörü (Roblox) — Tasarım

Tarih: 2026-10-28 · Konum: `roblox/pc-tamirci/`

## 1. İstenen (kullanıcının söyledikleri)

- Roblox Studio'da açılıp **herkese açık** yayınlanabilecek bir bilgisayar tamircisi simülatörü + tycoon.
- Para kazanma, dükkân geliştirme/büyütme, çalışan ve müdür tutma.
- Tüm ekran kartları, anakartlar ve bilgisayar parçaları; parçacı ve 2. elci gibi ek yerler.
- Gerçekten tamir ediyormuş hissi: gerçek aletler, gerçekçi animasyonlar, üst düzey modeller.
- 60 kişilik sunucu, çok sayıda dükkân yeri, çok sayıda lokasyon ("çeşitlilik 100 katı").
- **M** tuşu ile harita.
- Satın alınarak sürülen araba ve motorlar.
- Gıcık müşteri, hırsız gibi olaylar; müşteri çeşitliliği çok yüksek.
- Rahatlatıcı, muazzam bir dünya ambiyansı.

## 2. Varsayımlar (benim kararlarım — değiştirilebilir)

| Konu | Karar | Neden |
| --- | --- | --- |
| Teslim biçimi | Rojo kaynak ağacı + hazır `build/PCTamirci.rbxlx` | Studio'da tek dosya ile açılır; kod Git'te okunur kalır |
| Dil | Türkçe + İngilizce, oyuncunun diline göre otomatik, ayarlardan değişir | Herkese açık oyun |
| Para birimi | `$` (gerçekçi donanım fiyatları), `Config.CurrencySymbol` ile değişir | Parça fiyatları dünyada dolar ile bilinir |
| Görseller | Tamamı koddan, Roblox parçaları + malzemeleri + Future ışıklandırma | Buradan mesh/doku yüklenemez |
| Sesler | Yerleşik `rbxasset://sounds` sesleri + `Sounds` modülünde boş bırakılan ortam/müzik kimlikleri | Ses kimlikleri Creator Store'dan oyun sahibince seçilmeli |
| Ürün adları | Gerçek model adları (RTX 4090, Ryzen 7 7800X3D…), logo yok | "Tüm parçalar" isteği; `Data/Parts` içinden değiştirilebilir |
| Harita | Sunucu açılışında koddan üretilir; istenirse Studio komut çubuğuyla kalıcı hale getirilir | Küçük dosya, belirlenimci düzen (harita ekranı aynı veriyi kullanır) |

## 3. Mimari

```
roblox/pc-tamirci/
  default.project.json      Rojo projesi (servis özellikleri: Future ışık, StreamingEnabled…)
  src/shared   → ReplicatedStorage.Shared   (veri, düzen, modeller, tamir kuralları, yardımcılar)
  src/server   → ServerScriptService.Server (servisler)
  src/client   → StarterPlayerScripts.Client (kontrolcüler, arayüz)
  tests/       Lune ile Studio'suz testler (Roblox API'si yansıma veritabanından doğrulanır)
  tools/       önizleme ve yardımcı betikler
  build/       Rojo çıktısı (.rbxlx)
```

- **Sunucu yetkilidir:** para, envanter, tamir adımları, satın almalar, müşteri pazarlığı sunucuda doğrulanır.
  İstemci yalnızca istekte bulunur (`Net` modülü: tek `Request` RemoteFunction + olay RemoteEvent'leri, hız sınırı).
- **Paylaşılan belirlenimci veri:** `World/CityLayout` aynı tohumdan şehri üretir; sunucu 3B dünyayı, istemci harita/mini
  harita/GPS/ortam trafiğini aynı veriden çizer.
- **Performans (60 oyuncu):** StreamingEnabled; ortam yayaları, trafik, kuşlar, tekneler, yağmur yalnızca istemcide;
  sunucuda yalnızca oynanışla ilgili NPC'ler (müşteri, çalışan, hırsız) ve bunlar boştayken sabitlenir.

## 4. Alt sistemler

1. **Şehir (≈2400×2400 stud):** 9×8 cadde ızgarası, sahil bulvarı ve çevre yolu; ilçeler: Teknoloji Çarşısı, Şehir
   Merkezi, Eski Çarşı, Sahil, Banliyö, Sanayi/Liman, Üniversite, Park/Göl, Galeri bölgesi, Lunapark, kuzey tepeleri.
   **66 dükkân arsası** (her blokta 6). 50+ benzersiz mekân: Mega Parça Deposu, Çarşı Parçacısı, 2. El Pazarı, Bit Pazarı,
   Hurdalık, Alet-Edevat, Oto Galeri, Motor Bayi, Bisikletçi, Personel Ajansı, İnternet Kafe, Veri Merkezi, Polis, Belediye,
   kafe/kahvehane/fırın/eczane vb. cepheler, saat kulesi, fıskiyeli meydan, iskele, deniz feneri, marina, dönme dolap,
   rüzgâr türbinleri, seyir tepesi, kamp alanı.
2. **Dükkân (arsa):** 6 seviye (1→8 tezgâh), dekor/güvenlik/vitrin/otopark yükseltmeleri, özel tabela adı (filtreli).
   Giriş yapan oyuncuya boş arsa atanır, boş arsalardaki "Kirala" ile taşınabilir.
3. **Tamir (çekirdek):** Cihaz = düğüm grafı (bileşenler, vidalar, kablolar, mandallar, toz, termal macun, yazılım).
   Her eylem (vida sök/tak, kablo çek/tak, mandal, çıkar/tak, macun temizle/sür, toz üfle, lehim, ölçüm, POST kartı,
   yazılım testleri, güç ve stres testi) `Repair/RepairRules` tarafından doğrulanır. 30+ arıza (PSU, GPU, RAM, termal,
   toz, fan, HDD/SSD, işletim sistemi, virüs, CMOS pili, şişmiş kondansatör, eğik pin, gevşek kablo, laptop batarya/ekran/
   klavye/şarj soketi/menteşe/sıvı teması), yükseltme işleri, sıfırdan sistem toplama. Masaüstü ve laptop. İstemci cihazı
   tezgâhta yerel olarak ayrıntılı kurar, kamera tezgâha geçer, aletler 3B modelleriyle canlandırılır.
4. **Müşteriler:** 26 kişilik tipi (öğrenci, oyuncu, yayıncı, teyze, amca, dede, iş insanı, gıcık, ukala, aceleci,
   kararsız, cimri, zengin, turist, şüpheli satıcı, dolandırıcı, kılık değiştirmiş hırsız…), yüzlerce isim, binlerce görünüm
   kombinasyonu, pazarlık, sabır, bırak-bekle-teslim al döngüsü, puan/yorum ve itibar.
5. **Pazar:** Parça deposu (300+ parça, günlük fiyat dalgası, kampanyalar), alet dükkânı, 2. el al-sat (gizli arıza riski),
   hurdalıktan hurda kasa alıp parçalama, vitrinden toplama PC satışı.
6. **Çalışanlar:** teknisyen, resepsiyonist, müdür (otomatik parça siparişi, çevrimdışı kazanç), güvenlik, temizlikçi;
   beceri, maaş, özellik.
7. **Hırsızlar ve olaylar:** gece artan hırsızlık, kamera/alarm, "Yakala!", polis, ödül; dolandırıcı ve çalıntı parça
   satıcısı seçimleri.
8. **Araçlar:** bisiklet, scooter, motorlar, klasik Şahin/Doğan esintili sedanlar, servis vanı, SUV, spor ve süper
   araba. Arcade fizik (LinearVelocity + AlignOrientation), satın alma, renk seçimi, çağırma, yolcu koltuğu, plaka.
9. **Harita (M), mini harita, GPS rotası** (yol ağı üzerinde A*), taksi ile ücretli ışınlanma, dükkâna ışınlanma.
10. **Ambiyans:** gün/gece döngüsü ve ışık ön ayarları, bulutlar, ara sıra yağmur/sis, gece yanan sokak lambaları ve bina
    pencereleri, trafik ışıklı yerel trafik, yayalar, martılar/güvercinler, ördekli göl, yelkenliler, uçak, sıcak hava
    balonu, dönen dönme dolap/türbinler/deniz feneri, saat kulesi, fıskiye.
11. **Kayıt:** DataStore, oturum kilidi, otomatik kayıt, şema sürümü; Studio'da API kapalıysa bellekte çalışır.

## 5. Hata yönetimi

- Tüm istekler türüne göre doğrulanır; geçersiz istek reddedilir ve istemciye açıklama döner.
- DataStore çağrıları yeniden denenir; kayıt başarısızsa oyuncu uyarılır, oyun bellekte devam eder.
- Ses/animasyon yüklenemezse sessizce atlanır (oyun akışı bunlara bağlı değildir).

## 6. Doğrulama

- `selene` (özel Roblox global tanımları) ile statik denetim.
- **Lune test koşucusu:** Rojo'nun ürettiği yeri yükler, motor servislerini taklit eder, gerçek modülleri çalıştırır.
  Örnek nesnelerin her özelliği Roblox yansıma veritabanına karşı doğrulanır. Testler: katalog bütünlüğü, şehir
  düzeni değişmezleri, dünya/dükkân/cihaz/araç modellerinin hatasız kurulması, **her arıza için otomatik teknisyen**
  (sök → değiştir → tak → test geçer; düzeltmeden önce test kalır), müşteri çeşitliliği istatistikleri, metin anahtarları.
- Üretilen dünyanın ve modellerin JSON dökümü three.js ile çizilip ekran görüntüsüyle gözden geçirilir.

## 7. Sınırlar

- Studio'da gerçek oynanış testi buradan yapılamaz; fizik ayarları (araçlar) Studio'da ince ayar isteyebilir.
- Özel mesh, doku ve ses yüklenemez; görünüm parça tabanlıdır.
- Sunucu boyutu (60) ve oyun ayarları Studio'daki Game Settings'ten yapılır (README'de adım adım).
