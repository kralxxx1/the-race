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

-- Requests that are not repairs
Faults.requests = {
	{
		id = "upgrade_ram", device = "any", diag = "upgrade", weight = 6, level = 2, difficulty = 1,
		symptoms = S({ "RAM'imi {target} GB'a çıkarmak istiyorum.", "Bilgisayar yetmiyor, {target} GB RAM olsun." }, { "I'd like my RAM upgraded to {target} GB.", "It's not enough, make it {target} GB of RAM." }),
	},
	{
		id = "upgrade_ssd", device = "any", diag = "upgrade", weight = 6, level = 2, difficulty = 2,
		symptoms = S({ "Herkes SSD tak diyor, benimkine de takar mısın? Windows da kurulsun.", "HDD'den SSD'ye geçmek istiyorum." }, { "Everyone says get an SSD; can you fit one and install Windows?", "I want to move from HDD to SSD." }),
	},
	{
		id = "upgrade_gpu", device = "desktop", diag = "upgrade", weight = 5, level = 3, difficulty = 2,
		symptoms = S({ "Daha iyi bir ekran kartı istiyorum, bütçem {budget}.", "Yeni oyunlar kasıyor, ekran kartını yükseltelim." }, { "I want a better graphics card, my budget is {budget}.", "New games stutter, let's upgrade the GPU." }),
	},
	{
		id = "maintenance", device = "any", diag = "upgrade", weight = 7, level = 1, difficulty = 1,
		symptoms = S({ "Genel bakım istiyorum: toz alma ve termal macun.", "Senelik bakım zamanı geldi." }, { "I'd like a full service: dust and thermal paste.", "Time for the yearly maintenance." }),
	},
	{
		id = "build", device = "desktop", diag = "upgrade", weight = 3, level = 4, difficulty = 4,
		symptoms = S({ "Bana {budget} bütçeyle bir oyun bilgisayarı toplar mısın?", "Yeni sistem istiyorum, bütçem {budget}, oyunları akıcı oynasın." }, { "Can you build me a gaming PC for {budget}?", "I want a new system, budget {budget}, games must run smoothly." }),
	},
}

Faults.byId = {}
for _, f in Faults.list do
	Faults.byId[f.id] = f
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
