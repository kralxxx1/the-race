-- Faults: what can be wrong with a device, how customers describe it and how to fix it.
-- DeviceGen applies a fault to a generated device; RepairRules.evaluate() decides whether it is fixed.
--
-- diag      the diagnosis group the player can pick in the job card
-- level     minimum shop/player level before customers bring this fault
-- tools     tools needed to fix it (customers still bring it; the job card warns you)
-- difficulty 1..5 scales pay and XP

local Faults = {}

export type Fault = { [string]: any }

local function S(tr: { string }, en: { string })
	return { tr = tr, en = en }
end

Faults.list = {
	-- Desktop: power
	{
		id = "psu_dead", device = "desktop", diag = "psu", weight = 10, level = 1, difficulty = 2, tools = { "screwdriver_ph2" },
		symptoms = S({
			"Düğmeye basıyorum, hiçbir şey olmuyor. Ne fan ne ışık.",
			"Dün akşam 'pat' diye bir ses geldi, o günden beri açılmıyor.",
			"Prizi de değiştirdim, kabloyu da. Bilgisayar ölü gibi.",
			"Elektrikler gidip gelince kapandı, bir daha açılmadı.",
		}, {
			"I press the button and nothing happens. No fans, no lights.",
			"There was a 'pop' last night and it hasn't turned on since.",
			"I tried another socket and cable. It's completely dead.",
			"It died during a power cut and never came back.",
		}),
		fix = { tr = "PSU arızalı: multimetre veya PSU test cihazıyla doğrula, güç kaynağını değiştir.", en = "Dead PSU: confirm with a multimeter or PSU tester, replace the power supply." },
	},
	{
		id = "psu_weak", device = "desktop", diag = "psu", weight = 6, level = 3, difficulty = 2, tools = { "screwdriver_ph2" }, needsGpu = true,
		symptoms = S({
			"Oyun açınca birden kapanıyor, masaüstünde sorun yok.",
			"Yeni ekran kartı taktım, ağır oyunlarda kasa kapanıp açılıyor.",
			"Render alırken bilgisayar resetleniyor.",
		}, {
			"It shuts off as soon as I start a game; desktop is fine.",
			"I installed a new GPU and now heavy games make it restart.",
			"It resets whenever I render something.",
		}),
		fix = { tr = "Güç kaynağı yetersiz/zayıf: stres testinde kapanır. Sistemin çekişine yetecek kaliteli bir PSU tak.", en = "Weak PSU: it shuts down under stress. Fit a quality PSU with enough wattage." },
	},
	-- Desktop: graphics
	{
		id = "gpu_dead", device = "desktop", diag = "gpu", weight = 8, level = 2, difficulty = 2, tools = { "screwdriver_ph2" }, needsGpu = true,
		symptoms = S({
			"Kasa çalışıyor, fanlar dönüyor ama ekrana görüntü gelmiyor.",
			"Monitör 'sinyal yok' diyor. Kabloyu da değiştirdim.",
			"Oyun oynarken ekran karardı, bir daha görüntü gelmedi.",
		}, {
			"The PC runs, fans spin, but there's no picture.",
			"The monitor says 'no signal'. I already changed the cable.",
			"The screen went black mid-game and never came back.",
		}),
		fix = { tr = "Ekran kartı ölü: POST kartı 'd6' verir. Kartı değiştir.", en = "Dead GPU: POST card shows 'd6'. Replace the card." },
	},
	{
		id = "gpu_artifacts", device = "desktop", diag = "gpu", weight = 6, level = 3, difficulty = 2, tools = { "screwdriver_ph2" }, needsGpu = true,
		symptoms = S({
			"Ekranda renkli kareler ve çizgiler çıkıyor.",
			"Oyunda dokular bozuluyor, sonra oyun donuyor.",
			"Ekran kartı galiba yandı, her yer yeşil mor kare oldu.",
		}, {
			"Coloured squares and lines appear on the screen.",
			"Textures glitch in games, then the game freezes.",
			"I think my GPU is fried, everything is green and purple blocks.",
		}),
		fix = { tr = "VRAM arızası: stres testinde artefakt görülür. Ekran kartını değiştir.", en = "VRAM failure: artefacts under stress. Replace the graphics card." },
	},
	-- Desktop: memory
	{
		id = "ram_faulty", device = "any", diag = "ram", weight = 9, level = 1, difficulty = 2, tools = { "usb_boot" },
		symptoms = S({
			"Sürekli mavi ekran veriyor, MEMORY_MANAGEMENT diye bir şey yazıyor.",
			"Rastgele yeniden başlıyor, bazen dosyalar bozuk açılıyor.",
			"Chrome'da bile sekmeler çöküyor, mavi ekran da aldım.",
		}, {
			"Constant blue screens saying MEMORY_MANAGEMENT.",
			"It restarts randomly and files sometimes open corrupted.",
			"Even browser tabs crash, and I got a blue screen.",
		}),
		fix = { tr = "Bozuk RAM: USB'den bellek testi hangi modülün arızalı olduğunu gösterir. O modülü değiştir.", en = "Bad RAM: the USB memory test shows which stick fails. Replace it." },
	},
	{
		id = "ram_unseated", device = "desktop", diag = "ram", weight = 8, level = 1, difficulty = 1, tools = {},
		symptoms = S({
			"Taşındık, o günden beri açılmıyor; sürekli bip bip öttüyor.",
			"Kasayı temizlemek için açtım, kapattım, şimdi ekran gelmiyor.",
			"Açılıyor gibi yapıyor sonra uzun bip sesleri.",
		}, {
			"We moved house and now it just beeps and won't start.",
			"I opened it to clean it, closed it, now no picture.",
			"It tries to start, then long beeps.",
		}),
		fix = { tr = "RAM yerine oturmamış: büyüteçle bak, mandalı aç, çıkar ve tekrar sıkıca tak.", en = "RAM not seated: inspect, open the clip, remove and firmly reseat." },
	},
	-- Desktop: thermals
	{
		id = "cpu_paste", device = "desktop", diag = "thermal", weight = 9, level = 1, difficulty = 2, tools = { "screwdriver_ph2", "isopropyl", "paste_syringe" },
		symptoms = S({
			"Fan uçak gibi ses çıkarıyor, oyunda kendi kendine kapanıyor.",
			"İşlemci 100 derece oluyormuş, oyun kasıyor.",
			"Beş yıldır hiç bakım yapılmadı, çok ısınıyor.",
		}, {
			"The fan sounds like a jet and it shuts down in games.",
			"The CPU hits 100 degrees and games stutter.",
			"No maintenance in five years and it runs very hot.",
		}),
		fix = { tr = "Termal macun kurumuş: soğutucuyu sök, eski macunu alkolle temizle, yeni macun sür.", en = "Dried paste: remove the cooler, clean with isopropyl, apply fresh paste." },
	},
	{
		id = "dust", device = "desktop", diag = "dust", weight = 9, level = 1, difficulty = 1, tools = { "screwdriver_ph2", "air_can" },
		symptoms = S({
			"Kasadan uğultu geliyor, eskisi gibi değil, ısınıyor.",
			"Evde kedi var, kasanın içi toz dolu galiba.",
			"Sesi çok arttı, yavaşladı da.",
		}, {
			"It hums loudly and runs hotter than before.",
			"We have a cat, the case is probably full of fur.",
			"It got much louder and slower.",
		}),
		fix = { tr = "Toz birikmiş: yan kapağı aç, fan, soğutucu, ekran kartı ve PSU'yu hava ile temizle.", en = "Dust build-up: blow out fans, cooler, GPU and PSU." },
	},
	{
		id = "no_paste", device = "desktop", diag = "thermal", weight = 4, level = 2, difficulty = 2, tools = { "screwdriver_ph2", "paste_syringe" },
		symptoms = S({
			"Bilgisayarı kendim topladım, açılıyor ama 1 dakikada kapanıyor.",
			"YouTube'dan bakıp topladım, çok ısınıyor, bir şey mi unuttum?",
		}, {
			"I built it myself; it starts but shuts off after a minute.",
			"I built it from a YouTube guide and it overheats. Did I forget something?",
		}),
		fix = { tr = "Macun hiç sürülmemiş: soğutucuyu sök, macun sür, geri tak.", en = "No paste at all: remove the cooler, apply paste, refit." },
	},
	{
		id = "fan_dead", device = "desktop", diag = "fan", weight = 6, level = 1, difficulty = 1, tools = { "screwdriver_ph2" },
		symptoms = S({
			"Açılışta 'CPU Fan Error' yazıyor.",
			"Arkadaki fan dönmüyor, kasa çok sıcak.",
		}, {
			"It says 'CPU Fan Error' on boot.",
			"The rear fan doesn't spin and the case is hot.",
		}),
		fix = { tr = "Bozuk fan: hangi fanın dönmediğini güç testinde gör, fanı değiştir.", en = "Dead fan: see which fan stays still on power-up and replace it." },
	},
	{
		id = "fan_noisy", device = "desktop", diag = "fan", weight = 5, level = 1, difficulty = 1, tools = { "screwdriver_ph2" },
		symptoms = S({
			"Kasadan tık tık diye bir ses geliyor, gece uyuyamıyorum.",
			"Fanlardan biri traktör gibi ses yapıyor.",
		}, {
			"There's a clicking noise from the case, I can't sleep.",
			"One of the fans sounds like a tractor.",
		}),
		fix = { tr = "Fan yatağı bitmiş: büyüteçle bul, fanı değiştir.", en = "Worn fan bearing: find it and replace the fan." },
	},
	-- Desktop: storage and software
	{
		id = "hdd_failing", device = "any", diag = "storage", weight = 7, level = 2, difficulty = 3, tools = { "usb_boot" }, needsHdd = true,
		symptoms = S({
			"Açılması 5 dakika sürüyor, diskten tık tık ses geliyor.",
			"Dosyalarım bozuluyor, bilgisayar donup kalıyor.",
			"Her şey çok yavaş, diskin ışığı hep yanıyor.",
		}, {
			"Boot takes 5 minutes and the drive clicks.",
			"My files get corrupted and the PC freezes.",
			"Everything is so slow and the drive light is always on.",
		}),
		fix = { tr = "Disk ölüyor: S.M.A.R.T. testiyle doğrula, yeni disk (tercihen SSD) tak, Windows kur.", en = "Failing disk: confirm with S.M.A.R.T., fit a new drive (ideally SSD), install Windows." },
	},
	{
		id = "ssd_dead", device = "any", diag = "storage", weight = 5, level = 2, difficulty = 3, tools = { "usb_boot" },
		symptoms = S({
			"'Boot device not found' yazıyor, Windows açılmıyor.",
			"BIOS'ta diskim görünmüyor.",
		}, {
			"It says 'Boot device not found' and Windows won't load.",
			"My drive doesn't show up in the BIOS.",
		}),
		fix = { tr = "SSD ölmüş: değiştir ve USB ile Windows kur.", en = "Dead SSD: replace it and install Windows from USB." },
	},
	{
		id = "os_corrupt", device = "any", diag = "os", weight = 8, level = 1, difficulty = 1, tools = { "usb_boot" },
		symptoms = S({
			"Güncelleme yaptı, sonra sürekli 'Otomatik Onarım' ekranında kalıyor.",
			"Windows logosunda takılıp kalıyor.",
			"Mavi bir ekranda 'bilgisayarınız düzgün başlatılamadı' yazıyor.",
		}, {
			"It updated and now it's stuck in 'Automatic Repair'.",
			"It hangs on the Windows logo.",
			"A blue screen says 'your PC did not start correctly'.",
		}),
		fix = { tr = "Sistem dosyaları bozuk: donanım sağlam, USB'den Windows'u yeniden kur.", en = "Corrupted system: hardware is fine, reinstall Windows from USB." },
	},
	{
		id = "virus", device = "any", diag = "virus", weight = 8, level = 1, difficulty = 1, tools = { "usb_boot" },
		symptoms = S({
			"Saçma reklamlar çıkıyor, tarayıcının ana sayfası değişmiş.",
			"Bedava oyun hilesi indirdim, o günden beri bilgisayar çok yavaş.",
			"Fan sürekli çalışıyor, görev yöneticisini açamıyorum.",
		}, {
			"Weird ads pop up and my browser homepage changed.",
			"I downloaded a free game cheat and now it's super slow.",
			"The fan never stops and I can't open Task Manager.",
		}),
		fix = { tr = "Virüs: USB'deki antivirüs ile tara ve temizle (veya Windows'u yeniden kur).", en = "Malware: scan and clean with the USB antivirus (or reinstall Windows)." },
	},
	{
		id = "cmos_low", device = "any", diag = "cmos", weight = 6, level = 2, difficulty = 1, tools = {},
		symptoms = S({
			"Her açılışta saat ve tarih sıfırlanıyor.",
			"Açılışta 'CMOS checksum error' yazıyor, F1'e basmam gerekiyor.",
		}, {
			"Time and date reset every time I boot.",
			"It says 'CMOS checksum error' and I have to press F1.",
		}),
		fix = { tr = "BIOS pili bitmiş: multimetreyle ölç (3V olmalı), CR2032 pili değiştir.", en = "Flat CMOS battery: measure it (should be 3V), replace the CR2032." },
	},
	{
		id = "bios_outdated", device = "desktop", diag = "bios", weight = 4, level = 4, difficulty = 2, tools = { "usb_boot" },
		symptoms = S({
			"Yeni işlemci aldım taktım, ekrana hiçbir şey gelmiyor.",
			"İşlemciyi yükselttim, şimdi açılmıyor. Eski işlemciyle çalışıyordu.",
		}, {
			"I installed a new CPU and there's no picture at all.",
			"I upgraded the CPU and now it won't boot. It worked with the old one.",
		}),
		fix = { tr = "BIOS eski, yeni işlemciyi tanımıyor: USB ile BIOS Flashback güncellemesi yap.", en = "Old BIOS doesn't know the new CPU: do a USB BIOS Flashback update." },
	},
	-- Desktop: board level
	{
		id = "cap_bulged", device = "desktop", diag = "caps", weight = 4, level = 7, difficulty = 5, tools = { "soldering_station", "screwdriver_ph2" },
		symptoms = S({
			"Bazen açılıyor bazen açılmıyor, yanık kokusu da geldi.",
			"Üç kere basıyorum ancak açılıyor, sonra kendi kendine kapanıyor.",
		}, {
			"Sometimes it starts, sometimes not, and there was a burning smell.",
			"I have to press three times to start it, then it shuts down.",
		}),
		fix = { tr = "Şişmiş kondansatör: anakartı sök, büyüteçle bul, lehimini al, yenisini lehimle.", en = "Bulged capacitor: remove the board, find it, desolder, solder a new one." },
	},
	{
		id = "mobo_dead", device = "desktop", diag = "mobo", weight = 4, level = 5, difficulty = 4, tools = { "screwdriver_ph2" },
		symptoms = S({
			"Fanlar dönüyor ama hiçbir tepki yok, ışıklar da yanmıyor.",
			"Yıldırım düştü, o günden beri bilgisayar açılmıyor.",
		}, {
			"Fans spin but nothing else happens, no lights.",
			"Lightning struck nearby and it hasn't worked since.",
		}),
		fix = { tr = "Anakart ölü: PSU sağlam ama POST kodu '00'. Aynı soketli anakartla değiştir.", en = "Dead motherboard: PSU is fine but POST code '00'. Replace with a same-socket board." },
	},
	{
		id = "cpu_dead", device = "desktop", diag = "cpu", weight = 2, level = 6, difficulty = 3, tools = { "screwdriver_ph2", "paste_syringe" },
		symptoms = S({
			"Hız aşırtma yapıyordum, bir anda kapandı, bir daha açılmadı.",
		}, {
			"I was overclocking, it suddenly shut down and never came back.",
		}),
		fix = { tr = "İşlemci yanmış: aynı sokete uygun işlemci tak, macun sür.", en = "Burnt CPU: fit a compatible CPU, apply paste." },
	},
	{
		id = "bent_pins", device = "desktop", diag = "pins", weight = 3, level = 5, difficulty = 4, tools = { "screwdriver_ph2", "tweezers", "magnifier" },
		symptoms = S({
			"İşlemciyi kendim değiştirdim, şimdi bip sesi veriyor.",
			"İşlemci taktım ama biraz zorladım galiba.",
		}, {
			"I swapped the CPU myself and now it beeps.",
			"I installed the CPU but I may have forced it a little.",
		}),
		fix = { tr = "Eğik soket pinleri: işlemciyi çıkar, büyüteçle bak, cımbızla düzelt.", en = "Bent socket pins: remove the CPU, inspect, straighten with tweezers." },
	},
	{
		id = "cable_loose", device = "desktop", diag = "cable", weight = 7, level = 1, difficulty = 1, tools = {}, needsGpu = true,
		symptoms = S({
			"Kasayı taşırken bir şey oldu, görüntü gelmiyor ama fanlar dönüyor.",
			"Ekran kartı fanları çok hızlı dönüyor, görüntü yok.",
		}, {
			"Something happened when I moved the case; fans spin but no picture.",
			"The GPU fans spin at full speed and there's no picture.",
		}),
		fix = { tr = "Gevşek kablo: ekran kartı güç kablosu yarım takılı. Sıkıca tak.", en = "Loose cable: the GPU power plug is half-in. Push it home." },
	},
	-- Laptop
	{
		id = "lap_battery_worn", device = "laptop", diag = "battery", weight = 9, level = 2, difficulty = 2, tools = { "precision_kit", "spudger_kit" },
		symptoms = S({
			"Şarjı yarım saatte bitiyor.",
			"Prizden çekince anında kapanıyor.",
		}, {
			"The battery is empty in half an hour.",
			"It turns off instantly when unplugged.",
		}),
		fix = { tr = "Batarya ömrünü doldurmuş: alt kapağı aç, batarya kablosunu çıkar, bataryayı değiştir.", en = "Worn battery: open the bottom, unplug and replace the battery." },
	},
	{
		id = "lap_battery_swollen", device = "laptop", diag = "battery", weight = 4, level = 3, difficulty = 3, tools = { "precision_kit", "spudger_kit" },
		symptoms = S({
			"Touchpad kalktı, laptop masada sallanıyor.",
			"Alt kapak şişti gibi, kapanmıyor tam.",
		}, {
			"The touchpad is lifting and the laptop wobbles on the desk.",
			"The bottom cover bulges and doesn't close properly.",
		}),
		fix = { tr = "Şişmiş batarya — tehlikeli! Delmeden dikkatle çıkar ve değiştir.", en = "Swollen battery — dangerous! Remove carefully without puncturing, replace." },
	},
	{
		id = "lap_screen", device = "laptop", diag = "screen", weight = 8, level = 3, difficulty = 3, tools = { "precision_kit", "spudger_kit" },
		symptoms = S({
			"Laptopun üstüne oturdum... ekran kırıldı.",
			"Çantada ezilmiş, ekranda siyah lekeler ve çatlak var.",
			"Kedi masadan düşürdü, ekran örümcek ağı gibi.",
		}, {
			"I sat on my laptop... the screen cracked.",
			"It got crushed in my bag; black blotches and cracks.",
			"The cat knocked it off the desk; the screen is a spider web.",
		}),
		fix = { tr = "Kırık panel: bataryayı ayır, çerçeveyi sök, panel vidalarını ve eDP kablosunu çıkar, yeni paneli tak.", en = "Cracked panel: disconnect the battery, remove the bezel, screws and eDP cable, fit a new panel." },
	},
	{
		id = "lap_keyboard", device = "laptop", diag = "keyboard", weight = 7, level = 3, difficulty = 4, tools = { "precision_kit", "spudger_kit", "isopropyl" },
		symptoms = S({
			"Klavyeye çay döküldü, bazı tuşlar çalışmıyor.",
			"Şekerli çay döktüm, tuşlar yapış yapış.",
			"A, S, D tuşları basmıyor, oyun oynayamıyorum.",
		}, {
			"I spilled tea on the keyboard and some keys don't work.",
			"I spilled sweet tea, the keys are sticky.",
			"A, S and D don't work, I can't game.",
		}),
		fix = { tr = "Sıvı temaslı klavye: kartı alkolle temizle, klavyeyi değiştir.", en = "Liquid-damaged keyboard: clean the board, replace the keyboard." },
	},
	{
		id = "lap_overheat", device = "laptop", diag = "thermal", weight = 9, level = 2, difficulty = 3, tools = { "precision_kit", "air_can", "isopropyl", "paste_syringe" },
		symptoms = S({
			"Laptop çok ısınıyor, oyunda FPS yarıya düşüyor.",
			"Fanı çok ses yapıyor, kucağımda tutamıyorum.",
		}, {
			"The laptop gets very hot and FPS halves in games.",
			"The fan is so loud and it's too hot to keep on my lap.",
		}),
		fix = { tr = "Toz + kurumuş macun: fanı sök, tozunu al, macunu yenile.", en = "Dust and dry paste: remove the fan assembly, clean it, repaste." },
	},
	{
		id = "lap_fan_noisy", device = "laptop", diag = "fan", weight = 5, level = 2, difficulty = 2, tools = { "precision_kit" },
		symptoms = S({
			"Fandan cızırtı geliyor, kütüphanede herkes bana bakıyor.",
		}, {
			"The fan rattles and everyone in the library stares at me.",
		}),
		fix = { tr = "Fan yatağı bitmiş: fan + soğutucu setini değiştir.", en = "Worn fan: replace the fan & heatsink unit." },
	},
	{
		id = "lap_dcjack", device = "laptop", diag = "dcjack", weight = 6, level = 4, difficulty = 3, tools = { "precision_kit" },
		symptoms = S({
			"Şarj olmuyor, kabloyu oynatınca bazen ışık yanıyor.",
			"Adaptörü taktığımda şarj ışığı yanmıyor.",
		}, {
			"It won't charge; wiggling the cable sometimes lights it up.",
			"The charging light doesn't come on with the adapter.",
		}),
		fix = { tr = "Şarj soketi kırık: soketi değiştir (bazı modellerde lehimli!).", en = "Broken DC jack: replace it (soldered on some models!)." },
	},
	{
		id = "lap_hinge", device = "laptop", diag = "hinge", weight = 5, level = 4, difficulty = 3, tools = { "precision_kit", "spudger_kit" },
		symptoms = S({
			"Menteşe kırıldı, kapağı açınca çatırdıyor.",
			"Ekran kendi kendine kapanıyor, menteşe gevşek.",
		}, {
			"The hinge broke and it crackles when I open the lid.",
			"The screen falls shut by itself; the hinge is loose.",
		}),
		fix = { tr = "Kırık menteşe: çerçeveyi sök, menteşe vidalarını çıkar, yeni menteşe tak.", en = "Broken hinge: remove the bezel and hinge screws, fit new hinges." },
	},
	{
		id = "lap_liquid", device = "laptop", diag = "liquid", weight = 5, level = 5, difficulty = 4, tools = { "precision_kit", "isopropyl", "brush" },
		symptoms = S({
			"Laptopa kola döküldü, hemen kapandı.",
			"Kahvem devrildi, laptop açılmıyor artık.",
		}, {
			"Cola got spilled on the laptop and it died instantly.",
			"My coffee tipped over and now it won't turn on.",
		}),
		fix = { tr = "Sıvı teması: bataryayı hemen ayır, kartı alkol ve fırçayla (veya ultrasonik) temizle.", en = "Liquid damage: disconnect the battery, clean the board with isopropyl and a brush (or ultrasonic)." },
	},
	{
		id = "lap_wifi", device = "laptop", diag = "wifi", weight = 4, level = 2, difficulty = 2, tools = { "precision_kit" },
		symptoms = S({
			"İnternete bağlanmıyor, Wi-Fi simgesi hiç çıkmıyor.",
		}, {
			"It won't connect; the Wi-Fi icon doesn't even show up.",
		}),
		fix = { tr = "Wi-Fi kartı arızalı: kartı değiştir, anten kablolarını tak.", en = "Dead Wi-Fi card: replace it and reconnect the antennas." },
	},
}

-- Variants: the same mechanics as another fault (`base`) with their own story, so the customers
-- bring many different problems. They count as faults of their own for the pool, the job cards
-- and the staff, and are repaired exactly like their base.
Faults.variants = {
	{
		id = "psu_surge", base = "psu_dead", device = "desktop", diag = "psu", weight = 5, level = 2, difficulty = 2,
		symptoms = S({
			"Gök gürlerken bir 'çat' sesi geldi, ekran karardı, bir daha açılmadı.",
			"Fırtınada priz atladı, o günden beri kasa tepkisiz.",
			"Elektrik dalgalanınca ışıklar sönüp gitti, düğmeye basınca hiçbir şey olmuyor.",
		}, {
			"There was a crack during the thunderstorm, the screen went dark and it never started again.",
			"The power tripped in the storm and the case has been lifeless since.",
			"The lights flickered with a power surge and now the button does nothing.",
		}),
		fix = { tr = "Yıldırım/dalgalanma PSU'yu yaktı: multimetre veya PSU test cihazıyla doğrula, güç kaynağını değiştir.", en = "A surge burnt the PSU: confirm with a multimeter or tester, replace the power supply." },
	},
	{
		id = "psu_cat", base = "psu_dead", device = "desktop", diag = "psu", weight = 4, level = 1, difficulty = 2,
		symptoms = S({
			"Kedi kasanın arkasındaki kabloyu kemirmiş, o günden beri ölü.",
			"Köpek kablolara sarıldı, kasa açılmıyor; yanık kokusu var.",
			"Çocuk fişi yanlış prize takmış galiba, bir şey patladı.",
		}, {
			"The cat chewed the cable at the back and it's been dead since.",
			"The dog got tangled in the cables; it won't turn on and smells burnt.",
			"My kid plugged it into the wrong socket and something popped.",
		}),
		fix = { tr = "Kemirilen/yanık güç kaynağı: kabloyu ve PSU'yu kontrol et, güç kaynağını değiştir.", en = "Chewed/burnt power supply: check cables and the PSU, replace the power supply." },
	},
	{
		id = "psu_old", base = "psu_dead", device = "desktop", diag = "psu", weight = 5, level = 1, difficulty = 2,
		symptoms = S({
			"On yıllık bilgisayar bir sabah hiç açılmadı, fan bile dönmüyor.",
			"Çok eski kasam, güç kaynağı yaşlı; dün akşam kapanıp bir daha açılmadı.",
			"Hep çalışırdı, bugün sessiz kaldı. Güç düğmesi tepkisiz.",
		}, {
			"My ten-year-old computer just wouldn't start one morning; not even a fan.",
			"Very old case with an elderly PSU; it shut down last night and never came back.",
			"It always worked, today it's silent. The power button does nothing.",
		}),
		fix = { tr = "Eski PSU ömrünü doldurmuş: test et ve yenisini tak.", en = "Worn-out old PSU: test it and fit a new one." },
	},
	{
		id = "psu_mining", base = "psu_weak", device = "desktop", diag = "psu", weight = 4, level = 3, difficulty = 2,
		symptoms = S({
			"Madencilik yaptırıyorum, saatlerce sonra kasa kapanıp açılıyor.",
			"İkinci ekran kartını taktım, yük gelince hemen kapanıyor.",
			"Overclock yaptım, oyunda ve render'da bilgisayar kendi kendine resetleniyor.",
		}, {
			"I run it mining and after hours it shuts off and on again.",
			"I added a second GPU and it shuts down as soon as the load comes.",
			"I overclocked it; games and renders make it reset itself.",
		}),
		fix = { tr = "Yük altında yetersiz güç: stres testi kapanır, daha güçlü bir PSU tak.", en = "Not enough power under load: the stress test shuts down, fit a stronger PSU." },
	},
	{
		id = "gpu_mining", base = "gpu_dead", device = "desktop", diag = "gpu", weight = 4, level = 3, difficulty = 2,
		symptoms = S({
			"İki yıl madencilik yaptı, geçen hafta görüntü kesildi, bir daha gelmedi.",
			"İkinci elden aldığım kart bir ay dayandı, şimdi sinyal yok.",
			"Ekran kartı çok sıcak çalışıyordu, sonra ekran kapandı.",
		}, {
			"It mined for two years; last week the picture cut out and never came back.",
			"The second-hand card lasted a month, now there's no signal.",
			"The GPU ran really hot, then the screen went off.",
		}),
		fix = { tr = "Yorgun ekran kartı: POST kartı 'd6' verir, kartı değiştir.", en = "Worn-out card: the POST card shows 'd6', replace the graphics card." },
	},
	{
		id = "gpu_overclock", base = "gpu_artifacts", device = "desktop", diag = "gpu", weight = 4, level = 3, difficulty = 2,
		symptoms = S({
			"Overclock yaptım, şimdi oyunlarda ekranda ışıklı noktalar çıkıyor.",
			"Fan hızını kıstım, kartı zorladım, ekran karıncalandı.",
			"Oyun ortasında ekran mor çizgilerle doldu, sonra kapandı.",
		}, {
			"I overclocked and now games show bright dots all over the screen.",
			"I turned the fan down and pushed the card; the screen went fuzzy.",
			"Mid-game the screen filled with purple lines, then switched off.",
		}),
		fix = { tr = "Zorlanmış VRAM: stres testinde artefakt görülür, ekran kartını değiştir.", en = "Overstressed VRAM: artefacts under stress, replace the graphics card." },
	},
	{
		id = "ram_xmp", base = "ram_faulty", device = "any", diag = "ram", weight = 5, level = 2, difficulty = 2,
		symptoms = S({
			"XMP'yi açtım, o günden beri rastgele mavi ekran alıyorum.",
			"Bellekleri hızlandırdım, oyun açılırken donuyor.",
			"İki farklı marka RAM taktım, bazen açılıyor bazen mavi ekran.",
		}, {
			"I switched XMP on and have had random blue screens ever since.",
			"I overclocked the memory, now it freezes when a game starts.",
			"I put in two different brands of RAM; sometimes it boots, sometimes a blue screen.",
		}),
		fix = { tr = "Kararsız/bozuk RAM: bellek testi hangi modülün arızalı olduğunu gösterir, o modülü değiştir.", en = "Unstable/faulty RAM: the memory test shows which stick fails, replace it." },
	},
	{
		id = "ram_blue", base = "ram_faulty", device = "any", diag = "ram", weight = 5, level = 1, difficulty = 2,
		symptoms = S({
			"Photoshop açınca bilgisayar kapanıyor, mavi ekranda 'PAGE FAULT' yazıyor.",
			"Bilgisayar günde üç dört kez resetleniyor, dosyalarım da bozuluyor.",
			"Yeni program yükledikçe donuyor, hep aynı mavi ekran.",
		}, {
			"Opening Photoshop shuts the computer down, the blue screen says 'PAGE FAULT'.",
			"It resets three or four times a day and my files get corrupted.",
			"It freezes whenever I install something, always the same blue screen.",
		}),
		fix = { tr = "Bozuk bellek: USB bellek testi arızalı modülü bulur, onu değiştir.", en = "Bad memory: the USB memory test finds the failing stick, replace it." },
	},
	{
		id = "ram_moved", base = "ram_unseated", device = "desktop", diag = "ram", weight = 5, level = 1, difficulty = 1,
		symptoms = S({
			"Kasayı taşırken sallandı galiba, şimdi sadece bip sesi geliyor.",
			"Fuarda kasa çantadan düştü, bilgisayar açılmıyor ve ötüyor.",
			"LAN partiye götürdüm, geri getirince ekran gelmiyor.",
		}, {
			"I think the case rattled when I moved it; now it only beeps.",
			"The case fell out of the bag at the fair; it won't start and it beeps.",
			"I took it to a LAN party; back home there's no picture.",
		}),
		fix = { tr = "Sarsıntıyla çıkan RAM: mandalı aç, çıkar ve sıkıca tak.", en = "A shaken-loose RAM stick: open the clip, remove it and reseat it firmly." },
	},
	{
		id = "ram_kid", base = "ram_unseated", device = "desktop", diag = "ram", weight = 4, level = 1, difficulty = 1,
		symptoms = S({
			"Oğlum içini kurcaladı, şimdi uzun uzun bip bip öttüyor.",
			"Kardeşim 'temizlik' yaptı, kasa açılmıyor sadece ses çıkarıyor.",
			"Temizlerken bir şeye dokundum galiba, ekran hiç gelmiyor.",
		}, {
			"My son poked around inside and now it beeps long and loud.",
			"My brother 'cleaned' it and now it only makes noises.",
			"I touched something while cleaning, I guess; there's no picture at all.",
		}),
		fix = { tr = "Kurcalanmış RAM: büyüteçle bak, mandalı aç, tekrar tak.", en = "A tampered RAM stick: look closely with the magnifier, open the clip and reseat." },
	},
	{
		id = "cpu_summer", base = "cpu_paste", device = "desktop", diag = "thermal", weight = 6, level = 1, difficulty = 2,
		symptoms = S({
			"Yaz geldi, bilgisayar sürekli ısınıyor, oyunda kapanıyor.",
			"Odamdaki sıcakta bilgisayar fırın gibi oluyor, fan çok bağırıyor.",
			"Havalar ısındı, işlemci 95 derece, oyun kasıyor.",
		}, {
			"Summer came and the computer keeps overheating, shutting down in games.",
			"In the heat of my room it turns into an oven and the fan screams.",
			"The weather warmed up; the CPU is at 95 degrees and games stutter.",
		}),
		fix = { tr = "Macun kurumuş: soğutucuyu sök, alkolle temizle, yeni macun sür.", en = "Dried paste: remove the cooler, clean with isopropyl, apply fresh paste." },
	},
	{
		id = "cpu_noise", base = "cpu_paste", device = "desktop", diag = "thermal", weight = 5, level = 2, difficulty = 2,
		symptoms = S({
			"Açılışta uçak gibi ses yapıyor, sonra kapanıyor.",
			"İşlemci fanı sürekli tam hızda, bilgisayar yavaşladı.",
			"Tarayıcıda bile fan bağırıyor, ısı alarmı veriyor.",
		}, {
			"It roars like a plane at start-up, then switches off.",
			"The CPU fan always runs at full speed and the PC slowed down.",
			"Even in the browser the fan screams and there's a temperature alarm.",
		}),
		fix = { tr = "Isı transferi bozuk: soğutucuyu sök, eski macunu temizle, yeni macun sür.", en = "Poor heat transfer: remove the cooler, clean the old paste, apply fresh paste." },
	},
	{
		id = "dust_smoke", base = "dust", device = "desktop", diag = "dust", weight = 5, level = 1, difficulty = 1,
		symptoms = S({
			"Evde sigara içilir, kasa sararmış ve çok ısınıyor.",
			"Mutfağın yanında duruyor, içi yağlı bir toz bağlamış.",
			"Yıllardır kapağı açılmadı, fanlar yapışkan tozla dolu.",
		}, {
			"People smoke at home; the case turned yellow and runs hot.",
			"It stands next to the kitchen and has an oily layer of dust inside.",
			"The side panel hasn't been opened in years; the fans are full of sticky dust.",
		}),
		fix = { tr = "Yağlı/yapışkan toz: hava ve fırça ile temizle.", en = "Oily/sticky dust: clean with air and a brush." },
	},
	{
		id = "dust_pet", base = "dust", device = "desktop", diag = "dust", weight = 6, level = 1, difficulty = 1,
		symptoms = S({
			"Kedi tüyü içeri dolmuş, kasa çok ısınıp ses yapıyor.",
			"Köpeğim kasanın yanında yatıyor, içi tüy dolu.",
			"Kasanın önü tüy kaplı, hava almıyor galiba.",
		}, {
			"Cat hair has got inside; the case runs hot and loud.",
			"My dog sleeps next to the case; it's full of fur inside.",
			"The front is covered in fur; I think it can't breathe.",
		}),
		fix = { tr = "Tüy ve toz: hava spreyi ve fırça ile temizle.", en = "Fur and dust: clean with compressed air and a brush." },
	},
	{
		id = "dust_work", base = "dust", device = "desktop", diag = "dust", weight = 4, level = 1, difficulty = 1,
		symptoms = S({
			"Evde tadilat vardı, bilgisayar beyaz tozla kaplandı, sesi arttı.",
			"Atölyede kullanıyorum, kasanın içi talaş dolu.",
			"İnşaat tozu yüzünden bilgisayar iki günde kızardı.",
		}, {
			"There was building work at home; the PC is covered in white dust and louder.",
			"I use it in the workshop and the case is full of sawdust.",
			"Building dust made the computer overheat in two days.",
		}),
		fix = { tr = "Yoğun toz: hava spreyi ve fırça ile iyice temizle.", en = "Heavy dust: clean thoroughly with compressed air and a brush." },
	},
	{
		id = "fan_seized", base = "fan_dead", device = "desktop", diag = "fan", weight = 4, level = 1, difficulty = 1,
		symptoms = S({
			"Fanlardan biri hiç dönmüyor, parmakla itince dönüyor.",
			"Kasa fanı takılı kalmış gibi, bilgisayar ısınıyor.",
			"Fan yağsız kalmış, çarkı elle çevirince sıkışıyor.",
		}, {
			"One fan won't spin by itself; it turns if I flick it with a finger.",
			"A case fan seems stuck and the computer runs hot.",
			"The fan ran dry, the blades jam when I turn them by hand.",
		}),
		fix = { tr = "Takılan fan: değiştir ve fan kablosunu tak.", en = "Seized fan: replace it and plug in the fan cable." },
	},
	{
		id = "fan_rattle", base = "fan_noisy", device = "desktop", diag = "fan", weight = 5, level = 1, difficulty = 1,
		symptoms = S({
			"Kasadan tırtıl gibi 'trrr' diye ses geliyor.",
			"Gece uyuyamıyorum, kasadan tıkırtı geliyor.",
			"Fan dönüyor ama çok gürültü yapıyor, vidalar gevşek galiba.",
		}, {
			"The case makes a 'brrr' rattling sound.",
			"I can't sleep, there's a ticking sound from the case.",
			"The fan spins but it's very loud; maybe the screws are loose.",
		}),
		fix = { tr = "Gürültülü fan: bakım yap ya da değiştir.", en = "Noisy fan: service or replace it." },
	},
	{
		id = "hdd_click", base = "hdd_failing", device = "any", diag = "storage", weight = 5, level = 2, difficulty = 3,
		symptoms = S({
			"Diskten 'tık tık tık' sesi geliyor, dosyalarım açılmıyor.",
			"Bilgisayar açılırken disk tıklıyor, sonra mavi ekran.",
			"Harici diske attığım dosyalar kayboluyor, disk tıkırdıyor.",
		}, {
			"The drive clicks 'tick tick tick' and my files won't open.",
			"The disk clicks at start-up, then a blue screen.",
			"Files I copy vanish and the disk keeps clicking.",
		}),
		fix = { tr = "Arızalı HDD: SMART testi bozuk sektör gösterir, diski değiştir ve işletim sistemini kur.", en = "Failing HDD: SMART shows bad sectors; replace the drive and reinstall the OS." },
	},
	{
		id = "hdd_slow", base = "hdd_failing", device = "any", diag = "storage", weight = 5, level = 2, difficulty = 3,
		symptoms = S({
			"Bilgisayar açılması beş dakika sürüyor, her şey donuyor.",
			"Dosya kopyalarken ilerleme çubuğu duruyor, disk yüzde yüzde.",
			"Eskiden bu kadar yavaş değildi, disk sürekli çalışıyor.",
		}, {
			"It takes five minutes to boot and everything freezes.",
			"The progress bar stops when I copy files; the disk is at 100%.",
			"It never used to be this slow; the disk works non-stop.",
		}),
		fix = { tr = "Ölen disk: SMART sorunu gösterir, diski yenisiyle değiştir.", en = "A dying drive: SMART shows trouble; swap it for a new drive." },
	},
	{
		id = "ssd_ro", base = "ssd_dead", device = "any", diag = "storage", weight = 4, level = 2, difficulty = 3,
		symptoms = S({
			"SSD birden 'salt okunur' oldu, hiçbir şey kaydedemiyorum.",
			"Bilgisayar disk bulamıyor, BIOS'ta SSD görünmüyor.",
			"Dün çalışıyordu, bugün 'önyükleme aygıtı yok' diyor.",
		}, {
			"The SSD suddenly went read-only; I can't save anything.",
			"The computer can't find the disk; the SSD doesn't show in the BIOS.",
			"It worked yesterday; today it says 'no boot device'.",
		}),
		fix = { tr = "Ölü SSD: yeni bir disk tak ve Windows'u kur.", en = "Dead SSD: fit a new drive and install Windows." },
	},
	{
		id = "os_update", base = "os_corrupt", device = "any", diag = "os", weight = 6, level = 1, difficulty = 1,
		symptoms = S({
			"Güncelleme sırasında elektrik gitti, şimdi açılmıyor.",
			"Windows güncellemesi yüzde otuzda kaldı, sonra siyah ekran.",
			"Güncelleme sonrası sürekli yeniden başlıyor, açılış döngüsü.",
		}, {
			"The power went out during an update and now it won't start.",
			"The Windows update got stuck at 30%, then a black screen.",
			"After the update it keeps restarting in a boot loop.",
		}),
		fix = { tr = "Bozuk işletim sistemi: USB ile Windows'u yeniden kur.", en = "Corrupt operating system: reinstall Windows from the USB stick." },
	},
	{
		id = "os_ntldr", base = "os_corrupt", device = "any", diag = "os", weight = 5, level = 1, difficulty = 1,
		symptoms = S({
			"Açılışta 'İşletim sistemi bulunamadı' yazıyor.",
			"Siyah ekranda yanıp sönen bir imleç var, başka bir şey yok.",
			"Her açışta 'boot failure' diyor, F1 tuşu da bir şey yapmıyor.",
		}, {
			"At start-up it says 'Operating system not found'.",
			"A black screen with a blinking cursor, nothing else.",
			"Every time it says 'boot failure' and F1 does nothing.",
		}),
		fix = { tr = "Önyükleme bozuk: USB'den Windows'u yeniden kur.", en = "Broken boot: reinstall Windows from the USB." },
	},
	{
		id = "virus_popup", base = "virus", device = "any", diag = "virus", weight = 6, level = 1, difficulty = 1,
		symptoms = S({
			"Tarayıcıda sürekli reklam açılıyor, ana sayfam değişti.",
			"Bilgisayarı açınca ekranda onlarca pencere açılıyor.",
			"Ücretsiz program yükledim, şimdi her şey reklam dolu.",
		}, {
			"Ads keep popping up in the browser and my home page changed.",
			"Dozens of windows open as soon as I turn it on.",
			"I installed a free program and now everything is full of ads.",
		}),
		fix = { tr = "Zararlı yazılım: USB'den antivirüs taraması yap.", en = "Malware: run an antivirus scan from the USB stick." },
	},
	{
		id = "virus_miner", base = "virus", device = "any", diag = "virus", weight = 4, level = 2, difficulty = 1,
		symptoms = S({
			"Hiçbir şey açık değilken fan bağırıyor, işlemci yüzde yüz.",
			"Bilgisayar çok yavaşladı, elektrik faturam da arttı.",
			"Görev yöneticisinde bilmediğim bir program işlemciyi yiyor.",
		}, {
			"The fan screams with nothing open; the CPU is at 100%.",
			"The computer became very slow and my power bill went up.",
			"An unknown program in the task manager is eating the CPU.",
		}),
		fix = { tr = "Gizli madenci yazılım: antivirüs taramasıyla temizle.", en = "Hidden miner software: clean it with an antivirus scan." },
	},
	{
		id = "virus_ransom", base = "virus", device = "any", diag = "virus", weight = 3, level = 3, difficulty = 2,
		symptoms = S({
			"Dosyalarımın hepsi garip bir uzantıyla değişti, açılmıyorlar.",
			"Ekranda 'dosyalarınız şifrelendi' yazıyor, çok korktum.",
			"Fotoğraflarım açılmıyor, masaüstünde bir not var.",
		}, {
			"All my files got a strange extension and won't open.",
			"The screen says 'your files are encrypted' and I'm scared.",
			"My photos won't open and there's a note on the desktop.",
		}),
		fix = { tr = "Fidye yazılımı: antivirüs taraması yap, gerekirse Windows'u yeniden kur.", en = "Ransomware: run an antivirus scan, reinstall Windows if needed." },
	},
	{
		id = "cmos_time", base = "cmos_low", device = "any", diag = "cmos", weight = 5, level = 2, difficulty = 1,
		symptoms = S({
			"Bilgisayar her açışta saati 2009'a döndürüyor.",
			"Saat ve tarih sürekli sıfırlanıyor, siteler güvenli değil diyor.",
			"Her kapatınca BIOS ayarları siliniyor, saat yanlış.",
		}, {
			"Every start-up the computer sets the clock back to 2009.",
			"The time and date keep resetting and websites say they're not safe.",
			"Every shutdown wipes the BIOS settings and the clock is wrong.",
		}),
		fix = { tr = "BIOS pili bitmiş: CR2032 pilini değiştir.", en = "Dead CMOS battery: replace the CR2032." },
	},
	{
		id = "bios_cpu", base = "bios_outdated", device = "desktop", diag = "bios", weight = 3, level = 4, difficulty = 2,
		symptoms = S({
			"Yeni işlemci taktım ama bilgisayar hiç açılmıyor, ekran yok.",
			"Yeni nesil işlemci aldım, anakart tanımıyor.",
			"İşlemciyi yükselttim, bip sesleri geliyor.",
		}, {
			"I fitted a new processor and the computer won't start, no picture.",
			"I bought a new generation CPU and the motherboard doesn't recognise it.",
			"I upgraded the CPU and it beeps.",
		}),
		fix = { tr = "BIOS eski: USB ile BIOS'u güncelle.", en = "Outdated BIOS: update it from the USB stick." },
	},
	{
		id = "cable_panel", base = "cable_loose", device = "desktop", diag = "cable", weight = 6, level = 1, difficulty = 1,
		symptoms = S({
			"Güç düğmesi kasaya basıyor ama hiçbir şey olmuyor.",
			"Kasayı temizledim, şimdi ön paneldeki düğme çalışmıyor.",
			"Ön USB'ler artık çalışmıyor, düğme de tepkisiz.",
		}, {
			"The power button clicks but nothing happens.",
			"I cleaned the case and now the front button doesn't work.",
			"The front USB ports stopped working and the button does nothing.",
		}),
		fix = { tr = "Gevşek kablo: kapağı aç, kabloları kontrol et ve sıkıca tak.", en = "Loose cable: open the case, check the cables and plug them in firmly." },
	},
	{
		id = "cable_sata", base = "cable_loose", device = "desktop", diag = "cable", weight = 5, level = 1, difficulty = 1,
		symptoms = S({
			"Disk görünmüyor, 'önyükleme aygıtı yok' diyor.",
			"Yeni disk taktım ama bilgisayar bulamıyor.",
			"Taşındıktan sonra bilgisayar diskimi bulamıyor.",
		}, {
			"The disk doesn't show up; it says 'no boot device'.",
			"I fitted a new disk and the computer can't find it.",
			"After moving house the computer can't find my disk.",
		}),
		fix = { tr = "Gevşek SATA/güç kablosu: kabloyu kontrol et, sıkıca tak.", en = "Loose SATA/power cable: check the cable and plug it in firmly." },
	},
	{
		id = "lap_battery_dead", base = "lap_battery_worn", device = "laptop", diag = "battery", weight = 6, level = 2, difficulty = 2,
		symptoms = S({
			"Laptop fişten çekince hemen kapanıyor.",
			"Pil yüzde elliden ani sıfıra düşüyor.",
			"Şarjdayken çalışıyor ama fişi çekince bir dakika bile dayanmıyor.",
		}, {
			"The laptop shuts off the moment I unplug it.",
			"The battery drops from 50% straight to zero.",
			"It works on the charger but won't last a minute unplugged.",
		}),
		fix = { tr = "Aşınmış batarya: bataryayı değiştir.", en = "Worn battery: replace the battery." },
	},
	{
		id = "lap_screen_dropped", base = "lap_screen", device = "laptop", diag = "screen", weight = 5, level = 3, difficulty = 3,
		symptoms = S({
			"Laptop yere düştü, ekranda dev bir çatlak ve çizgiler var.",
			"Çantada ezilmiş, ekranın yarısı karardı.",
			"Kapağı sert kapattım, ekran lekeli ve çizgili.",
		}, {
			"The laptop was dropped, there's a huge crack and lines on the screen.",
			"It got crushed in a bag and half the screen is black.",
			"I slammed the lid and now the screen is blotchy with lines.",
		}),
		fix = { tr = "Kırık panel: alt kapağı aç, ekranı değiştir.", en = "Cracked panel: open the base, replace the screen." },
	},
	{
		id = "lap_key_spill", base = "lap_keyboard", device = "laptop", diag = "keyboard", weight = 4, level = 3, difficulty = 3,
		symptoms = S({
			"Üstüne çay döktüm, bazı tuşlar yazmıyor.",
			"Klavyedeki harfler kendi kendine basılıyor.",
			"Birkaç tuş yapışıp kalıyor, yazı yazamıyorum.",
		}, {
			"I spilled tea on it and some keys don't type.",
			"Letters on the keyboard press themselves.",
			"A few keys stick, I can't type.",
		}),
		fix = { tr = "Bozuk klavye: kapağı aç, klavyeyi değiştir.", en = "Faulty keyboard: open it up, replace the keyboard." },
	},
	{
		id = "lap_hot_lap", base = "lap_overheat", device = "laptop", diag = "thermal", weight = 6, level = 2, difficulty = 3,
		symptoms = S({
			"Laptopu dizime koyunca yanıyor, fan sürekli bağırıyor.",
			"Oyunda ısınıp kapanıyor, klavye sıcak.",
			"Fan çok yüksek sesle dönüyor, sonra aniden kapanıyor.",
		}, {
			"It burns my lap, and the fan screams all the time.",
			"It overheats in games and shuts down; the keyboard is hot.",
			"The fan runs very loud, then it shuts off suddenly.",
		}),
		fix = { tr = "Aşırı ısınma: alt kapağı aç, tozu temizle, termal macunu yenile.", en = "Overheating: open the base, clean the dust, renew the thermal paste." },
	},
	{
		id = "lap_charger", base = "lap_dcjack", device = "laptop", diag = "dcjack", weight = 5, level = 4, difficulty = 3,
		symptoms = S({
			"Şarj kablosunu oynatınca şarj oluyor, bırakınca kesiliyor.",
			"Şarj ışığı yanıp sönüyor, pil dolmuyor.",
			"Şarj girişi gevşemiş, kabloyu tutarak kullanıyorum.",
		}, {
			"It charges only if I wiggle the cable.",
			"The charge light flickers and the battery doesn't fill.",
			"The charging socket is loose; I have to hold the cable.",
		}),
		fix = { tr = "Şarj soketi arızalı: alt kapağı aç, DC jack'i değiştir.", en = "Faulty charging socket: open the base, replace the DC jack." },
	},
	{
		id = "lap_lid", base = "lap_hinge", device = "laptop", diag = "hinge", weight = 4, level = 4, difficulty = 3,
		symptoms = S({
			"Ekranın kapağı sallanıyor, açık durmuyor.",
			"Menteşe çıtlıyor ve ekranın kenarı ayrılıyor.",
			"Kapak bir yana kayıyor, kapatınca ses çıkarıyor.",
		}, {
			"The lid wobbles and won't stay open.",
			"The hinge creaks and the screen's edge is coming off.",
			"The lid slips to one side and makes a noise when closed.",
		}),
		fix = { tr = "Menteşe kırık: kapağı aç, menteşeyi değiştir.", en = "Broken hinge: open it up, replace the hinge." },
	},
	{
		id = "lap_juice", base = "lap_liquid", device = "laptop", diag = "liquid", weight = 4, level = 5, difficulty = 4,
		symptoms = S({
			"Meyve suyu döktüm, ekran gidip geliyor, kokuyor.",
			"Kahve dökülünce laptop kapandı, bir daha açılmadı.",
			"Su içerken üstüne döktüm, şimdi kapak aralığından ses geliyor.",
		}, {
			"I spilled juice and the screen flickers and smells.",
			"Coffee spilled and the laptop shut off and never came back.",
			"I spilled water on it; now there's a noise from under the lid.",
		}),
		fix = { tr = "Sıvı teması: alt kapağı aç, isopropil ile temizle, bozuk parçaları değiştir.", en = "Liquid damage: open the base, clean with isopropyl, replace damaged parts." },
	},
	{
		id = "lap_nowifi", base = "lap_wifi", device = "laptop", diag = "wifi", weight = 5, level = 2, difficulty = 2,
		symptoms = S({
			"Wi-Fi simgesi hiç görünmüyor, internete giremiyorum.",
			"Wi-Fi bazen geliyor, bazen hiç yok; Bluetooth da çalışmıyor.",
			"Cihaz hiç ağ bulamıyor, başka telefonlar bulabiliyor.",
		}, {
			"The Wi-Fi icon never shows and I can't get online.",
			"Wi-Fi comes and goes; Bluetooth doesn't work either.",
			"The device finds no network, though other phones do.",
		}),
		fix = { tr = "Wi-Fi kartı arızalı: alt kapağı aç, kartı değiştir, anten kablolarını tak.", en = "Dead Wi-Fi card: open the base, replace it and reconnect the antennas." },
	},
}

-- Requests that are not repairs
Faults.requests = {
	{
		id = "upgrade_ram", device = "any", diag = "upgrade", weight = 6, level = 2, difficulty = 1,
		symptoms = S({ "RAM'imi {target} GB'a çıkarmak istiyorum.", "Bilgisayar yetmiyor, {target} GB RAM olsun." , "Tarayıcı açınca bilgisayar donuyor, belleği büyütelim: {target} GB.", "Çocuklar oyun oynuyor, çok kasıyor; RAM'i {target} GB yapar mısın?", "Video düzenliyorum, bellek yetmiyor. {target} GB olsun."}, { "I'd like my RAM upgraded to {target} GB.", "It's not enough, make it {target} GB of RAM." , "The computer freezes with the browser open, let's make it {target} GB.", "The kids play games on it and it lags; can you make the RAM {target} GB?", "I edit videos and the memory isn't enough. Make it {target} GB."}),
	},
	{
		id = "upgrade_ssd", device = "any", diag = "upgrade", weight = 6, level = 2, difficulty = 2,
		symptoms = S({ "Herkes SSD tak diyor, benimkine de takar mısın? Windows da kurulsun.", "HDD'den SSD'ye geçmek istiyorum." , "Açılış çok yavaş, SSD takalım, her şey uçsun.", "Eski diskim çok yavaş; SSD ve temiz bir Windows istiyorum.", "Arkadaşım SSD ile bilgisayarı roket gibi olmuş dedi, bana da yap."}, { "Everyone says get an SSD; can you fit one and install Windows?", "I want to move from HDD to SSD." , "Start-up is very slow; let's fit an SSD and make it fly.", "My old disk is slow; I want an SSD and a clean Windows.", "A friend says an SSD made their PC a rocket; do mine too."}),
	},
	{
		id = "upgrade_gpu", device = "desktop", diag = "upgrade", weight = 5, level = 3, difficulty = 2,
		symptoms = S({ "Daha iyi bir ekran kartı istiyorum, bütçem {budget}.", "Yeni oyunlar kasıyor, ekran kartını yükseltelim." , "Yeni çıkan oyunu oynayamıyorum, ekran kartını değiştirelim; param {budget}.", "Daha akıcı oyun için ekran kartı, harcayabileceğim {budget}.", "Ekran kartım eskidi; {budget} bütçeyle en iyisini tak."}, { "I want a better graphics card, my budget is {budget}.", "New games stutter, let's upgrade the GPU." , "I can't play the new game; let's change the graphics card, I have {budget}.", "A graphics card for smoother games, I can spend {budget}.", "My card is old; fit the best one for {budget}."}),
	},
	{
		id = "maintenance", device = "any", diag = "upgrade", weight = 7, level = 1, difficulty = 1,
		symptoms = S({ "Genel bakım istiyorum: toz alma ve termal macun.", "Senelik bakım zamanı geldi." , "Bilgisayarı yıllardır açmadım, bir bakım yap.", "Fanlar çok ses yapıyor, tam bakım lazım.", "Garanti bitti, bakımını yaptırmak istiyorum."}, { "I'd like a full service: dust and thermal paste.", "Time for the yearly maintenance." , "I haven't opened it in years; please give it a service.", "The fans are loud, it needs a full service.", "The warranty ended, I'd like it serviced."}),
	},
	{
		id = "build", device = "desktop", diag = "upgrade", weight = 3, level = 4, difficulty = 4,
		symptoms = S({ "Bana {budget} bütçeyle bir oyun bilgisayarı toplar mısın?", "Yeni sistem istiyorum, bütçem {budget}, oyunları akıcı oynasın." , "Sıfırdan yeni bir bilgisayar istiyorum, bütçem {budget}.", "Oğluma oyun bilgisayarı toplayalım, {budget} harcarım.", "Hem iş hem oyun için {budget} bütçeyle bir sistem kur."}, { "Can you build me a gaming PC for {budget}?", "I want a new system, budget {budget}, games must run smoothly." , "I want a brand new computer from scratch, my budget is {budget}.", "Let's build a gaming PC for my son, I'll spend {budget}.", "Build me a system for work and play with a {budget} budget."}),
	},
}

Faults.byId = {}
for _, f in Faults.list do
	Faults.byId[f.id] = f
end
-- the variants join the list, with the tools and conditions of the fault they are made on
for _, v in Faults.variants do
	local base = Faults.byId[v.base]
	assert(base, "fault variant " .. v.id .. " has no base " .. v.base)
	v.tools = v.tools or base.tools
	v.needsGpu = v.needsGpu or base.needsGpu
	v.needsHdd = v.needsHdd or base.needsHdd
	v.variant = true
	table.insert(Faults.list, v)
	Faults.byId[v.id] = v
end
for _, f in Faults.requests do
	Faults.byId[f.id] = f
	f.request = true
end

-- Diagnosis groups offered on the job card
Faults.diagGroups = {
	{ id = "psu", tr = "Güç Kaynağı", en = "Power Supply" },
	{ id = "gpu", tr = "Ekran Kartı", en = "Graphics Card" },
	{ id = "ram", tr = "RAM", en = "Memory" },
	{ id = "cpu", tr = "İşlemci", en = "Processor" },
	{ id = "mobo", tr = "Anakart", en = "Motherboard" },
	{ id = "caps", tr = "Kondansatör", en = "Capacitor" },
	{ id = "pins", tr = "Soket Pinleri", en = "Socket Pins" },
	{ id = "thermal", tr = "Isınma / Macun", en = "Overheating / Paste" },
	{ id = "dust", tr = "Toz", en = "Dust" },
	{ id = "fan", tr = "Fan", en = "Fan" },
	{ id = "storage", tr = "Disk", en = "Storage" },
	{ id = "os", tr = "İşletim Sistemi", en = "Operating System" },
	{ id = "virus", tr = "Virüs", en = "Malware" },
	{ id = "cmos", tr = "BIOS Pili", en = "CMOS Battery" },
	{ id = "bios", tr = "BIOS Sürümü", en = "BIOS Version" },
	{ id = "cable", tr = "Kablo", en = "Cable" },
	{ id = "battery", tr = "Batarya", en = "Battery" },
	{ id = "screen", tr = "Ekran Paneli", en = "Display" },
	{ id = "keyboard", tr = "Klavye", en = "Keyboard" },
	{ id = "dcjack", tr = "Şarj Soketi", en = "DC Jack" },
	{ id = "hinge", tr = "Menteşe", en = "Hinge" },
	{ id = "liquid", tr = "Sıvı Teması", en = "Liquid Damage" },
	{ id = "wifi", tr = "Wi-Fi", en = "Wi-Fi" },
}

function Faults.get(id: string): Fault?
	return Faults.byId[id]
end

-- The fault whose mechanics a fault uses (itself, unless it is a variant).
function Faults.base(id: string): string
	local f = Faults.byId[id]
	return if f and f.base then f.base else id
end

-- Faults a customer can bring for a given device kind and player level.
function Faults.pool(deviceKind: string, level: number, opts: { [string]: any }?): { Fault }
	local o = opts or {}
	local out = {}
	for _, f in Faults.list do
		if (f.device == "any" or f.device == deviceKind) and f.level <= level then
			if (not f.needsGpu or o.hasGpu) and (not f.needsHdd or o.hasHdd) then
				table.insert(out, f)
			end
		end
	end
	return out
end

return Faults
