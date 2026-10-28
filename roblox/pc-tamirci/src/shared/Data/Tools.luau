-- Tools: the repair tools a technician can own. Sold at the "Alet-Edevat" hardware shop.
-- `actions` lists the repair actions the tool performs (see Repair/RepairRules).
-- `speed` scales how fast the tool works (electric screwdriver, blower).

local Tools = {}

export type Tool = { [string]: any }

Tools.list = {
	{
		id = "hand", icon = "✋", model = "hand", price = 0, level = 1, order = 1, speed = 1,
		name = { tr = "El", en = "Hands" },
		desc = { tr = "Kablo çek/tak, mandal aç, parça çıkar/tak, kelebek vidalar, güç düğmesi.", en = "Unplug/plug cables, open latches, remove/install parts, thumbscrews, power button." },
		actions = { "unplug", "plug", "open_latch", "close_latch", "remove", "install", "press_power", "flip", "lid", "tie_cables", "unscrew", "screw" },
		bits = { "thumb", "toolless" },
	},
	{
		id = "screwdriver_ph2", icon = "🪛", model = "screwdriver", price = 12, level = 1, order = 2, speed = 1,
		name = { tr = "PH2 Yıldız Tornavida", en = "PH2 Phillips Screwdriver" },
		desc = { tr = "Kasa, anakart, PSU, soğutucu ve disk vidaları için.", en = "Case, motherboard, PSU, cooler and drive screws." },
		actions = { "unscrew", "screw" }, bits = { "PH2" }, color = { 220, 60, 40 },
	},
	{
		id = "precision_kit", icon = "🔩", model = "precision", price = 35, level = 2, order = 3, speed = 1,
		name = { tr = "Hassas Tornavida Seti", en = "Precision Screwdriver Kit" },
		desc = { tr = "PH0, PH1, T5 uçları: laptop ve M.2 vidaları.", en = "PH0, PH1, T5 bits: laptop and M.2 screws." },
		actions = { "unscrew", "screw" }, bits = { "PH0", "PH1", "T5", "PH2" }, color = { 30, 120, 220 },
	},
	{
		id = "electric_screwdriver", icon = "⚡", model = "electric_screwdriver", price = 90, level = 6, order = 4, speed = 2.6,
		name = { tr = "Akülü Hassas Tornavida", en = "Electric Precision Screwdriver" },
		desc = { tr = "Tüm uçlar, vidaları 2,5 kat hızlı söker.", en = "All bits, drives screws 2.5x faster." },
		actions = { "unscrew", "screw" }, bits = { "PH0", "PH1", "PH2", "T5" }, color = { 40, 40, 44 },
	},
	{
		id = "esd_strap", icon = "📿", model = "strap", price = 8, level = 1, order = 5, speed = 1,
		name = { tr = "Antistatik Bileklik", en = "Anti-static Wrist Strap" },
		desc = { tr = "Takılıyken statik elektrik parçalara zarar vermez.", en = "While worn, static discharge cannot damage parts." },
		actions = { "wear_strap" }, passive = true,
	},
	{
		id = "air_can", icon = "🌬️", model = "air_can", price = 9, level = 1, order = 6, speed = 1,
		name = { tr = "Basınçlı Hava Spreyi", en = "Compressed Air Can" },
		desc = { tr = "Fan, soğutucu ve kartlardaki tozu üfler.", en = "Blows dust out of fans, heatsinks and cards." },
		actions = { "blow_dust" },
	},
	{
		id = "air_blower", icon = "💨", model = "blower", price = 75, level = 5, order = 7, speed = 2.5,
		name = { tr = "Elektrikli Hava Üfleyici", en = "Electric Air Duster" },
		desc = { tr = "Tozu 2,5 kat hızlı temizler.", en = "Clears dust 2.5x faster." },
		actions = { "blow_dust" },
	},
	{
		id = "brush", icon = "🖌️", model = "brush", price = 6, level = 1, order = 8, speed = 1,
		name = { tr = "Antistatik Fırça", en = "Anti-static Brush" },
		desc = { tr = "Hassas yüzeylerdeki toz ve sıvı kalıntısını fırçalar.", en = "Brushes dust and liquid residue off delicate boards." },
		actions = { "brush" },
	},
	{
		id = "isopropyl", icon = "🧴", model = "bottle", price = 10, level = 1, order = 9, speed = 1,
		name = { tr = "İzopropil Alkol %99 + Bez", en = "99% Isopropyl + Cloth" },
		desc = { tr = "Eski termal macunu ve sıvı temas izlerini temizler.", en = "Cleans old thermal paste and liquid residue." },
		actions = { "clean_paste", "clean_liquid" },
	},
	{
		id = "paste_syringe", icon = "💉", model = "syringe", price = 0, level = 1, order = 10, speed = 1,
		name = { tr = "Termal Macun", en = "Thermal Paste" },
		desc = { tr = "İşlemcinin ortasına bezelye büyüklüğünde sür. Envanterden macun harcar.", en = "Apply a pea-sized dot. Uses paste from inventory." },
		actions = { "apply_paste" },
	},
	{
		id = "magnifier", icon = "🔍", model = "magnifier", price = 18, level = 1, order = 11, speed = 1,
		name = { tr = "LED'li Büyüteç", en = "LED Magnifier" },
		desc = { tr = "Şişmiş kondansatör, yanık, eğik pin ve gevşek parçaları gösterir.", en = "Reveals bulged capacitors, burns, bent pins and loose parts." },
		actions = { "inspect" },
	},
	{
		id = "usb_boot", icon = "💾", model = "usb", price = 15, level = 1, order = 12, speed = 1,
		name = { tr = "Önyüklenebilir USB", en = "Bootable USB Toolkit" },
		desc = { tr = "Windows kurulumu, bellek testi, antivirüs, disk ve BIOS araçları.", en = "Windows installer, memory test, antivirus, disk and BIOS tools." },
		actions = { "software" },
	},
	{
		id = "multimeter", icon = "📟", model = "multimeter", price = 45, level = 2, order = 13, speed = 1,
		name = { tr = "Dijital Multimetre", en = "Digital Multimeter" },
		desc = { tr = "PSU hatları, BIOS pili ve kondansatörleri ölçer.", en = "Measures PSU rails, the BIOS battery and capacitors." },
		actions = { "measure" },
	},
	{
		id = "spudger_kit", icon = "🪚", model = "spudger", price = 12, level = 2, order = 14, speed = 1,
		name = { tr = "Plastik Açma Aparatı Seti", en = "Spudger / Pry Tool Kit" },
		desc = { tr = "Laptop kapaklarını, çerçeveleri ve kauçuk ayakları açar.", en = "Opens laptop covers, bezels and rubber feet." },
		actions = { "pry", "peel" },
	},
	{
		id = "post_card", icon = "🃏", model = "post_card", price = 25, level = 3, order = 15, speed = 1,
		name = { tr = "POST Debug Kartı", en = "POST Debug Card" },
		desc = { tr = "PCIe yuvasına takılır, açılış hata kodunu gösterir.", en = "Plugs into PCIe, shows the boot error code." },
		actions = { "post_code" },
	},
	{
		id = "psu_tester", icon = "🔌", model = "psu_tester", price = 30, level = 4, order = 16, speed = 1,
		name = { tr = "PSU Test Cihazı", en = "PSU Tester" },
		desc = { tr = "Güç kaynağını anakarttan bağımsız test eder.", en = "Tests a power supply without the motherboard." },
		actions = { "psu_test" },
	},
	{
		id = "tweezers", icon = "🥢", model = "tweezers", price = 10, level = 4, order = 17, speed = 1,
		name = { tr = "Antistatik Cımbız", en = "ESD Tweezers" },
		desc = { tr = "Eğik soket pinlerini düzeltir, küçük parçaları tutar.", en = "Straightens bent socket pins, handles tiny parts." },
		actions = { "straighten_pins" },
	},
	{
		id = "soldering_station", icon = "🔥", model = "soldering_iron", price = 120, level = 7, order = 18, speed = 1,
		name = { tr = "Havya İstasyonu", en = "Soldering Station" },
		desc = { tr = "Kondansatör ve soket lehimler/söker. Lehim teli harcar.", en = "Solders and desolders capacitors and jacks. Uses solder wire." },
		actions = { "desolder", "solder" },
	},
	{
		id = "hot_air", icon = "♨️", model = "hot_air", price = 220, level = 10, order = 19, speed = 1.8,
		name = { tr = "Sıcak Hava İstasyonu", en = "Hot Air Rework Station" },
		desc = { tr = "Lehim sökmeyi hızlandırır, şarj soketi işlerinde şart değil ama çok hızlı.", en = "Desolders much faster; great for DC jack jobs." },
		actions = { "desolder" },
	},
	{
		id = "ultrasonic", icon = "🫧", model = "ultrasonic", price = 300, level = 14, order = 20, speed = 2,
		name = { tr = "Ultrasonik Temizleyici", en = "Ultrasonic Cleaner" },
		desc = { tr = "Sıvı temaslı kartları kusursuz temizler.", en = "Perfectly cleans liquid-damaged boards." },
		actions = { "clean_liquid" },
	},
	{
		id = "thermal_camera", icon = "🌡️", model = "thermal_camera", price = 400, level = 12, order = 21, speed = 1,
		name = { tr = "Termal Kamera", en = "Thermal Camera" },
		desc = { tr = "Çalışırken ısınan parçaları renkli gösterir.", en = "Shows hot components in colour while running." },
		actions = { "thermal_view" },
	},
}

Tools.byId = {}
for _, t in Tools.list do
	Tools.byId[t.id] = t
end
table.sort(Tools.list, function(a, b)
	return a.order < b.order
end)

function Tools.get(id: string): Tool?
	return Tools.byId[id]
end

-- Which owned tool can perform `action` (fastest wins). Returns the tool id or nil.
function Tools.bestFor(action: string, owned: { [string]: boolean }, bit: string?): string?
	local best, bestSpeed = nil, -1
	for _, t in Tools.list do
		if owned[t.id] and table.find(t.actions, action) then
			if bit == nil or (t.bits and table.find(t.bits, bit)) then
				if t.speed > bestSpeed then
					best, bestSpeed = t.id, t.speed
				end
			end
		end
	end
	return best
end

function Tools.canDo(toolId: string, action: string, bit: string?): boolean
	local t = Tools.byId[toolId]
	if not t or not table.find(t.actions, action) then
		return false
	end
	if bit and (action == "unscrew" or action == "screw") then
		return t.bits ~= nil and table.find(t.bits, bit) ~= nil
	end
	return true
end

return Tools
