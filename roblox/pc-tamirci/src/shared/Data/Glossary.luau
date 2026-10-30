-- Glossary: plain-language explanations for people who have never opened a computer. What each part
-- is and what happens when it fails (shown when you hover a part at the bench), and what each
-- result of the power test usually means and where to look next (used by the coach).

local Glossary = {}

local function T(en, tr)
	return { en = en, tr = tr }
end

-- by template node category / id prefix: { name, what it is, what it does when it breaks }
Glossary.parts = {
	case = T("The metal box around everything. Take the side panel off to get inside.", "Her şeyi saran metal kutu. İçeri girmek için yan kapağı çıkar."),
	side_panel = T("The side cover. Undo its screws (or thumb screws) and lift it off.", "Yan kapak. Vidalarını çöz ve kaldır."),
	psu = T("Power supply: turns wall power into what the parts need. If it's dead, nothing turns on.", "Güç kaynağı: prizdeki elektriği parçaların istediği hale getirir. Ölüyse hiçbir şey açılmaz."),
	mobo = T("Motherboard: the big circuit board that everything plugs into.", "Anakart: her şeyin takıldığı büyük devre kartı."),
	cpu = T("Processor (CPU): the brain. It needs a cooler and thermal paste, and its socket pins must be straight.", "İşlemci (CPU): beyin. Soğutucu ve termal macun ister, soket pinleri düz olmalı."),
	socket = T("CPU socket: look closely for bent pins. Bent pins can stop the PC from starting.", "İşlemci soketi: eğik pin var mı bak. Eğik pin bilgisayarı açılmaz yapabilir."),
	cooler = T("CPU cooler: a heatsink with a fan that keeps the processor cool. A dead fan or dry paste means overheating.", "İşlemci soğutucusu: işlemciyi serin tutar. Fan ölürse ya da macun kurursa ısınma olur."),
	ram = T("Memory (RAM): the PC's short-term memory. Loose or faulty RAM causes beeps, crashes or no start.", "Bellek (RAM): bilgisayarın kısa süreli hafızası. Gevşek ya da bozuksa bip, çökme, açılmama olur."),
	gpu = T("Graphics card: draws the picture. A dead one gives no image or coloured artefacts.", "Ekran kartı: görüntüyü çizer. Bozulursa görüntü gelmez ya da renkli bozulmalar olur."),
	nvme = T("M.2 drive: a very fast stick-shaped drive that holds Windows and files.", "M.2 disk: Windows'u ve dosyaları tutan çok hızlı çubuk disk."),
	storage = T("Drive: stores Windows and your files. A dying drive is slow or says 'boot device not found'.", "Disk: Windows'u ve dosyaları saklar. Ölen disk yavaşlar ya da 'boot device not found' der."),
	fan = T("Case fan: moves air through the case. Dust or a dead fan makes the PC overheat.", "Kasa fanı: kasadan hava geçirir. Toz ya da ölü fan ısınmaya yol açar."),
	cmos = T("BIOS battery: keeps the clock and settings. When it's flat the date resets.", "BIOS pili: saati ve ayarları tutar. Bitince tarih sıfırlanır."),
	cap = T("Capacitor: a small cylinder on the board. A bulging top means it has failed.", "Kondansatör: kart üzerindeki küçük silindir. Üstü şişmişse bozulmuştur."),
	latch = T("A clip or lever that holds a part in place. Open it before you pull the part out.", "Parçayı yerinde tutan klips ya da kol. Parçayı çekmeden önce aç."),
	screw = T("A fastener. It needs the right screwdriver head (PH2 for most).", "Vida. Doğru uçlu tornavida ister (çoğu PH2)."),
	cable = T("A cable. A loose connector is a very common fault: plug it in firmly.", "Kablo. Gevşek soket çok sık görülen bir arızadır: sıkıca tak."),
	-- laptops
	battery = T("Battery: powers the laptop away from the wall. A swollen one is dangerous: replace it.", "Batarya: laptopu prizsiz çalıştırır. Şişmişse tehlikelidir, değiştir."),
	screen = T("Display panel. If it's cracked or blank, it has to be replaced.", "Ekran paneli. Kırık ya da boşsa değiştirilir."),
	keyboard = T("Keyboard. Spilled drinks can kill keys; clean the board before replacing.", "Klavye. Dökülen sıvı tuşları öldürür; değiştirmeden önce kartı temizle."),
	lboard = T("Laptop logic board: the laptop's motherboard. Liquid damage shows as corrosion.", "Laptop ana kartı. Sıvı hasarı korozyon olarak görünür."),
	lfan = T("Laptop fan: cools the processor. Clicking means it's failing.", "Laptop fanı: işlemciyi soğutur. Tıkırtı yapıyorsa bozuluyor."),
	hinges = T("Hinges: they hold the screen to the body. Broken hinges mean a loose or cracked lid.", "Menteşeler: ekranı gövdeye bağlar. Kırılırsa kapak sallanır."),
	dcjack = T("Charging socket. A worn one stops the laptop charging.", "Şarj soketi. Yıpranırsa laptop şarj olmaz."),
	lwifi = T("Wi-Fi card. If it isn't detected there's no wireless internet.", "Wi-Fi kartı. Algılanmazsa kablosuz internet olmaz."),
	feet = T("Rubber feet: peel them off, there are screws underneath.", "Lastik ayaklar: sök, altlarında vida var."),
}

-- Which entry of Glossary.parts describes a template node (cat, kind or id prefix)
function Glossary.key(tn): string?
	if not tn then
		return nil
	end
	local id = tn.id or ""
	if Glossary.parts[id] then
		return id
	end
	if string.sub(id, 1, 4) == "nvme" then
		return "nvme"
	elseif string.sub(id, 1, 3) == "fan" then
		return "fan"
	elseif string.sub(id, 1, 3) == "cap" and tn.kind == "comp" then
		return "cap"
	elseif tn.kind == "latch" then
		return "latch"
	elseif tn.kind == "screw" then
		return "screw"
	elseif tn.kind == "cable" then
		return "cable"
	elseif tn.kind == "feet" then
		return "feet"
	elseif string.sub(id, 1, 3) == "ram" or string.sub(id, 1, 4) == "lram" then
		return "ram"
	elseif tn.cat and Glossary.parts[tn.cat] then
		return tn.cat
	elseif tn.kind == "panel" then
		return "side_panel"
	end
	return nil
end

-- What each result of the power test usually means: { what you see, what it usually means, suspects (node ids) }
Glossary.symptoms = {
	ok = {
		see = T("It starts normally.", "Normal açılıyor."),
		means = T("It boots, so the fault may only show under load, or it's a software or cleaning job. Run the Stress test, read the customer's complaint again, and check for dust inside.", "Açılıyor; arıza yük altında çıkıyor olabilir ya da yazılım/temizlik işidir. Stres testi yap, müşterinin şikâyetini tekrar oku, içeride toz var mı bak."),
		suspects = {},
	},
	no_power = {
		see = T("Nothing happens: no fans, no lights.", "Hiçbir şey olmuyor: fan yok, ışık yok."),
		means = T("The PC isn't getting power. Start with the power supply and the cables. A PSU tester or a multimeter tells you if the PSU is alive.", "Bilgisayar elektrik almıyor. Güç kaynağından ve kablolardan başla. PSU test cihazı ya da multimetre PSU'nun canlı olup olmadığını söyler."),
		suspects = { "psu", "ceps", "mobo" },
	},
	no_post = {
		see = T("Fans spin but it never starts.", "Fanlar dönüyor ama hiç açılmıyor."),
		means = T("It has power but cannot finish starting (POST). Usual suspects: the processor (bent pins, dry paste), RAM that isn't seated, or the motherboard. A POST card shows an error code.", "Elektrik var ama açılış (POST) tamamlanmıyor. Şüpheliler: işlemci (eğik pin, kuru macun), oturmamış RAM, anakart. POST kartı hata kodu gösterir."),
		suspects = { "cpu", "socket", "ram1", "mobo" },
	},
	beeps = {
		see = T("Long beeps.", "Uzun bip sesleri."),
		means = T("The PC can't find its memory. Remove the RAM and push it back in firmly until the clips click, or replace the stick.", "Bilgisayar belleği bulamıyor. RAM'i çıkarıp klipsler tık diyene kadar sıkıca tak ya da değiştir."),
		suspects = { "ram1", "ram2" },
	},
	no_display = {
		see = T("It runs but there's no picture.", "Çalışıyor ama görüntü yok."),
		means = T("Look at the graphics card and its power cable. A dead card or a loose cable gives a black screen.", "Ekran kartına ve güç kablosuna bak. Bozuk kart ya da gevşek kablo siyah ekran verir."),
		suspects = { "gpu", "cpcie1" },
	},
	fan_error = {
		see = T("BIOS warns: CPU Fan Error.", "BIOS uyarıyor: CPU Fan Error."),
		means = T("The CPU cooler's fan isn't turning or isn't plugged in. Check the cooler and replace it if the fan is dead.", "İşlemci soğutucusunun fanı dönmüyor ya da takılı değil. Soğutucuyu kontrol et, fan ölüyse değiştir."),
		suspects = { "cooler" },
	},
	no_boot = {
		see = T("'Boot device not found'.", "'Boot device not found'."),
		means = T("The PC can't find a drive to start from. The drive is dead, missing or its cable is loose. A dead drive needs replacing, then Windows has to be installed from the USB tools.", "Bilgisayar açılacak disk bulamıyor. Disk ölü, takılı değil ya da kablosu gevşek. Ölü diski değiştir, sonra USB araçlarından Windows kur."),
		suspects = { "nvme1", "ssd1", "hdd1" },
	},
	no_os = {
		see = T("The drive is empty: no operating system.", "Disk boş: işletim sistemi yok."),
		means = T("Install Windows with the USB tools (💾 on the right).", "USB araçlarıyla Windows kur (sağdaki 💾)."),
		suspects = {},
	},
	os_error = {
		see = T("Windows is stuck in an 'Automatic Repair' loop.", "Windows 'Otomatik Onarım' döngüsünde."),
		means = T("Windows itself is damaged. Reinstall it with the USB tools (💾). The hardware is probably fine.", "Windows bozulmuş. USB araçlarıyla (💾) yeniden kur. Donanım büyük ihtimalle sağlam."),
		suspects = {},
	},
	overheat = {
		see = T("It overheats and shuts itself down.", "Aşırı ısınıp kendini kapatıyor."),
		means = T("Heat: dust in the heatsink, a dead fan, or dried thermal paste. Clean the inside (air can, brush), then check the fans and re-apply thermal paste on the CPU.", "Isı sorunu: soğutucuda toz, ölü fan ya da kurumuş termal macun. İçini temizle (hava, fırça), fanları kontrol et, işlemciye yeni macun sür."),
		suspects = { "cooler", "cpu" },
	},
	unstable = {
		see = T("Unstable under load.", "Yük altında kararsız."),
		means = T("It works until it's pushed. Common causes: a weak power supply, heat, or a failing RAM stick or graphics card.", "Zorlanana kadar çalışıyor. Sık nedenler: zayıf güç kaynağı, ısı, bozulan RAM ya da ekran kartı."),
		suspects = { "psu", "ram1", "gpu" },
	},
}

-- The tools in one line each, for "which tool do I need?"
Glossary.tools = {
	hand = T("Your hands: panels with thumb screws, clips, cables.", "Ellerin: elle sökülen kapak, klips, kablo."),
	screwdriver_ph2 = T("The everyday screwdriver: most case and part screws.", "Günlük tornavida: kasadaki çoğu vida."),
	precision_kit = T("Small screwdrivers for laptops and M.2 screws.", "Laptop ve M.2 vidaları için küçük tornavidalar."),
	air_can = T("Compressed air: blow dust out of fans and heatsinks.", "Basınçlı hava: fan ve soğutucudaki tozu üfler."),
	brush = T("Soft brush: sweeps dust from places air can't reach.", "Yumuşak fırça: havanın ulaşmadığı yerlerin tozunu alır."),
	multimeter = T("Measures voltage: tells you if a PSU rail or a battery is alive.", "Gerilim ölçer: PSU hattının ya da pilin canlı olduğunu söyler."),
	psu_tester = T("Plug the PSU into it: it shows whether every power line works.", "PSU'yu takarsın: tüm güç hatlarının çalışıp çalışmadığını gösterir."),
	post_card = T("Shows the start-up error code of a PC that won't boot.", "Açılmayan bilgisayarın başlangıç hata kodunu gösterir."),
	paste_syringe = T("Thermal paste: a thin layer between the CPU and its cooler.", "Termal macun: işlemci ve soğutucu arasına ince bir katman."),
	isopropyl = T("Alcohol for cleaning old paste and liquid damage.", "Eski macun ve sıvı hasarını temizleyen alkol."),
	tweezers = T("Straightens bent CPU socket pins.", "Eğik işlemci soket pinlerini düzeltir."),
	soldering_station = T("Soldering iron: swap bulged capacitors and charging jacks.", "Havya: şişmiş kondansatör ve şarj soketi değiştirir."),
	usb_boot = T("A USB stick with Windows, antivirus, memory test and BIOS tools.", "Windows, antivirüs, bellek testi ve BIOS araçları olan USB bellek."),
	esd_strap = T("Wrist strap: stops static electricity from killing sensitive parts.", "Bilek bandı: statik elektriğin hassas parçaları öldürmesini önler."),
	thermal_camera = T("Shows hot spots, so you can see what is overheating.", "Sıcak noktaları gösterir; neyin ısındığını görürsün."),
	magnifier = T("Look closely at a part for bulged capacitors or bent pins.", "Şişmiş kondansatör ve eğik pinleri yakından incelersin."),
	spudger_kit = T("Plastic levers for prying laptop covers and ribbon connectors.", "Laptop kapaklarını ve flat kabloları açan plastik levyeler."),
}

return Glossary
