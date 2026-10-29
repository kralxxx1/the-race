-- Upgrades: shop expansion levels and everything you can buy for your shop.
--   comfort  customers wait longer and tip more (sum of all owned items)
--   attract  more customers walk in
--   security makes thefts harder / gets alerts; protect = share of cash a safe keeps from thieves
--   speed    bench work speed bonus;  storage = extra inventory slots
--   elec     daily electricity the item uses ($); elecSave = share taken off the electricity bill
--   taxRelief share taken off the income tax

local Upgrades = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

Upgrades.levels = {
	{ level = 1, name = N("Küçük Dükkân", "Small Shop"), cost = 0, req = 1, w = 28, d = 30, benches = 1, queue = 2, seats = 2, staff = 1, storage = 40 },
	{ level = 2, name = N("Esnaf Dükkânı", "Local Shop"), cost = 4000, req = 3, w = 34, d = 36, benches = 2, queue = 3, seats = 3, staff = 2, storage = 80 },
	{ level = 3, name = N("Servis Merkezi", "Service Centre"), cost = 15000, req = 6, w = 42, d = 42, benches = 3, queue = 4, seats = 4, staff = 3, storage = 150 },
	{ level = 4, name = N("Büyük Servis", "Big Service Centre"), cost = 45000, req = 10, w = 48, d = 50, benches = 4, queue = 5, seats = 6, staff = 5, storage = 250 },
	{ level = 5, name = N("Teknoloji Mağazası", "Tech Store"), cost = 120000, req = 15, w = 54, d = 56, benches = 6, queue = 6, seats = 8, staff = 7, storage = 400 },
	{ level = 6, name = N("Mega Teknoloji Merkezi", "Mega Tech Centre"), cost = 350000, req = 22, w = 56, d = 60, benches = 8, queue = 8, seats = 10, staff = 10, storage = 700, floors = 2 },
}

Upgrades.items = {
	-- Comfort / decoration
	{ id = "carpet", cat = "decor", name = N("Halı", "Rug"), cost = 400, level = 1, comfort = 3, icon = "🟥" },
	{ id = "plants", cat = "decor", name = N("Saksı Bitkileri", "Potted Plants"), cost = 300, level = 1, comfort = 4, icon = "🪴" },
	{ id = "posters", cat = "decor", name = N("Donanım Posterleri", "Hardware Posters"), cost = 250, level = 1, comfort = 3, icon = "🖼️" },
	{ id = "tea", cat = "decor", name = N("Çay Ocağı (Semaver)", "Tea Samovar"), cost = 600, level = 1, comfort = 8, icon = "🫖", elec = 2 },
	{ id = "coffee", cat = "decor", name = N("Kahve Makinesi", "Coffee Machine"), cost = 900, level = 2, comfort = 8, icon = "☕", elec = 2 },
	{ id = "music", cat = "decor", name = N("Müzik Sistemi", "Sound System"), cost = 1200, level = 2, comfort = 7, icon = "🔊", elec = 1 },
	{ id = "tv", cat = "decor", name = N("Bekleme Salonu TV", "Waiting Room TV"), cost = 1500, level = 2, comfort = 10, icon = "📺", elec = 2 },
	{ id = "neon", cat = "decor", name = N("Neon Tabela", "Neon Sign"), cost = 1800, level = 2, comfort = 4, attract = 10, icon = "💡", elec = 3 },
	{ id = "ac", cat = "decor", name = N("Klima", "Air Conditioning"), cost = 2200, level = 3, comfort = 10, icon = "❄️", elec = 12 },
	{ id = "sofa", cat = "decor", name = N("Deri Koltuk Takımı", "Leather Sofa Set"), cost = 2800, level = 3, comfort = 10, icon = "🛋️" },
	{ id = "vending", cat = "decor", name = N("Atıştırmalık Otomatı", "Snack Machine"), cost = 1600, level = 3, comfort = 7, icon = "🍫", elec = 2 },
	{ id = "rgb_lights", cat = "decor", name = N("RGB Tavan Işıkları", "RGB Ceiling Lights"), cost = 2500, level = 4, comfort = 6, attract = 8, icon = "🌈", elec = 3 },
	{ id = "aquarium", cat = "decor", name = N("Akvaryum", "Aquarium"), cost = 3500, level = 4, comfort = 12, icon = "🐠", elec = 2 },
	{ id = "arcade", cat = "decor", name = N("Retro Atari Makinesi", "Retro Arcade Cabinet"), cost = 5000, level = 5, comfort = 12, icon = "🕹️", elec = 4 },
	{ id = "trophy", cat = "decor", name = N("Ödül Vitrini", "Trophy Cabinet"), cost = 7500, level = 6, comfort = 8, attract = 10, icon = "🏆", elec = 1 },
	-- Business
	{ id = "sign_pro", cat = "business", name = N("Işıklı Kutu Tabela", "Lightbox Sign"), cost = 1200, level = 1, attract = 6, icon = "🪧", elec = 2 },
	{ id = "parking", cat = "business", name = N("Otopark Yeri", "Parking Spot"), cost = 2000, level = 2, icon = "🅿️", desc = N("Aracın dükkânının önünde doğar.", "Your vehicle spawns outside your shop.") },
	{ id = "website", cat = "business", name = N("Web Sitesi", "Website"), cost = 3000, level = 3, attract = 12, icon = "🌐" },
	{ id = "ads", cat = "business", name = N("Gazete ve Radyo Reklamı", "Newspaper & Radio Ads"), cost = 4500, level = 5, attract = 15, icon = "📻" },
	{ id = "showcase", cat = "business", name = N("PC Vitrini", "PC Showcase"), cost = 6000, level = 4, icon = "🖥️", desc = N("Topladığın PC'leri vitrine koy; gelen alıcılar satın alır.", "Display PCs you build; walk-in buyers purchase them.") },
	{ id = "autopay", cat = "business", name = N("Banka Otomatik Ödeme Talimatı", "Bank Auto-Pay Order"), cost = 500, level = 1, icon = "🏦", desc = N("Faturalar geldiği sabah otomatik ödenir; gecikme cezası olmaz.", "Bills are paid the morning they arrive; no late fees.") },
	{ id = "accounting_sw", cat = "business", name = N("Ön Muhasebe Programı", "Bookkeeping Software"), cost = 2500, level = 2, icon = "🧮", taxRelief = 0.1, net = 1, desc = N("Giderler eksiksiz yazılır: vergi %10 azalır.", "Every expense gets booked: 10% less tax.") },
	{ id = "contracts", cat = "business", name = N("Kurumsal Sözleşme Ofisi", "Corporate Contracts Desk"), cost = 12000, level = 6, attract = 5, icon = "📑", desc = N("İnternet kafe ve şirketlerden toplu işler gelir.", "Bulk jobs from internet cafés and companies.") },
	-- Security
	{ id = "camera", cat = "security", name = N("Güvenlik Kamerası", "Security Camera"), cost = 1500, level = 2, security = 1, icon = "📹", desc = N("Hırsız içeri girince haber verir.", "Alerts you when a thief walks in."), elec = 1 },
	{ id = "alarm", cat = "security", name = N("Alarm Sistemi", "Alarm System"), cost = 3000, level = 3, security = 2, icon = "🚨", desc = N("Hırsızlıkta siren ve ışıklar çalışır, hırsız yavaşlar.", "Siren and lights during a theft; thieves panic and slow down."), elec = 1 },
	{ id = "shutter", cat = "security", name = N("Kepenk", "Roller Shutter"), cost = 2500, level = 3, security = 2, icon = "🔒", desc = N("Gece hırsız gelme ihtimali düşer.", "Fewer break-ins at night.") },
	{ id = "safe", cat = "security", name = N("Çelik Kasa", "Steel Safe"), cost = 4000, level = 4, security = 3, protect = 0.5, icon = "🗄️", desc = N("Paranın yarısı çalınamaz.", "Half of your cash can't be stolen.") },
	-- Energy
	{ id = "led_lighting", cat = "energy", name = N("LED Aydınlatma", "LED Lighting"), cost = 900, level = 1, elecSave = 0.12, icon = "💡", desc = N("Elektrik faturası %12 düşer.", "Electricity bill 12% lower.") },
	{ id = "smart_plugs", cat = "energy", name = N("Akıllı Prizler", "Smart Plugs"), cost = 600, level = 2, elecSave = 0.06, icon = "🔌", desc = N("Gece boşta çalışan cihazlar kapanır: elektrik %6 düşer.", "Idle equipment switches off at night: electricity 6% lower.") },
	{ id = "inverter_ac", cat = "energy", name = N("İnverter Klima Dönüşümü", "Inverter AC Upgrade"), cost = 3200, level = 3, elecSave = 0.08, icon = "🌬️", desc = N("Klimalar yarı enerjiyle çalışır.", "The air conditioning uses half the power.") },
	{ id = "solar", cat = "energy", name = N("Çatı Güneş Paneli (10 kW)", "Rooftop Solar (10 kW)"), cost = 18000, level = 4, elecSave = 0.35, icon = "☀️", desc = N("Elektrik faturası %35 düşer.", "Electricity bill 35% lower.") },
	{ id = "battery_wall", cat = "energy", name = N("Ev Tipi Batarya Duvarı", "Battery Wall"), cost = 14000, level = 5, elecSave = 0.12, icon = "🔋", desc = N("Güneşten artan enerji gece kullanılır: %12 daha.", "Spare solar power runs the night: 12% more off.") },
	-- Workshop
	{ id = "bench_mat", cat = "workshop", name = N("ESD Tezgah Matı", "ESD Bench Mat"), cost = 200, level = 1, esd = 0.5, icon = "🟦", desc = N("Bileklik unutulsa bile statik riski yarıya iner.", "Halves the static risk even without a strap.") },
	{ id = "bench_led", cat = "workshop", name = N("Tezgah LED Lambası", "Bench LED Lamp"), cost = 350, level = 1, speed = 0.05, icon = "🔦", elec = 1 },
	{ id = "tool_wall", cat = "workshop", name = N("Alet Panosu", "Tool Wall"), cost = 800, level = 2, speed = 0.05, icon = "🧰" },
	{ id = "parts_shelves", cat = "workshop", name = N("Parça Rafları", "Parts Shelving"), cost = 1500, level = 2, storage = 60, icon = "📦" },
	{ id = "test_bench", cat = "workshop", name = N("Test Monitörü (27\")", "27\" Test Monitor"), cost = 1100, level = 2, speed = 0.05, icon = "🖥️", elec = 1 },
	{ id = "microscope", cat = "workshop", name = N("Dijital Mikroskop", "Digital Microscope"), cost = 2500, level = 7, speed = 0.1, icon = "🔬", desc = N("Lehim işleri hızlanır.", "Soldering work goes faster."), elec = 1 },
	{ id = "warehouse", cat = "workshop", name = N("Depo Odası", "Storeroom"), cost = 8000, level = 4, storage = 300, icon = "🏬" },
}

Upgrades.byId = {}
for _, it in Upgrades.items do
	Upgrades.byId[it.id] = it
end

Upgrades.categories = {
	{ id = "decor", name = N("Konfor & Dekor", "Comfort & Decor") },
	{ id = "business", name = N("İşletme", "Business") },
	{ id = "security", name = N("Güvenlik", "Security") },
	{ id = "workshop", name = N("Atölye", "Workshop") },
	{ id = "energy", name = N("Enerji", "Energy") },
}

-- Wall / floor / facade looks you can pick (free) in the shop panel.
Upgrades.wallStyles = {
	{ id = "white", name = N("Beyaz Sıva", "White Plaster"), color = { 236, 232, 224 }, material = "Plaster" },
	{ id = "brick", name = N("Tuğla", "Brick"), color = { 150, 80, 60 }, material = "Brick" },
	{ id = "wood", name = N("Ahşap Lambri", "Wood Panels"), color = { 150, 110, 76 }, material = "WoodPlanks" },
	{ id = "concrete", name = N("Brüt Beton", "Raw Concrete"), color = { 150, 150, 148 }, material = "Concrete" },
	{ id = "navy", name = N("Lacivert", "Navy"), color = { 40, 56, 92 }, material = "SmoothPlastic" },
	{ id = "mint", name = N("Mint Yeşili", "Mint"), color = { 170, 214, 196 }, material = "Plaster" },
	{ id = "gamer", name = N("Oyuncu Siyahı", "Gamer Black"), color = { 26, 26, 30 }, material = "SmoothPlastic" },
	{ id = "terracotta", name = N("Kiremit", "Terracotta"), color = { 196, 110, 76 }, material = "Plaster" },
}
Upgrades.floorStyles = {
	{ id = "tiles", name = N("Seramik", "Ceramic Tiles"), color = { 214, 210, 202 }, material = "CeramicTiles" },
	{ id = "parquet", name = N("Parke", "Parquet"), color = { 168, 122, 82 }, material = "WoodPlanks" },
	{ id = "epoxy", name = N("Epoksi", "Epoxy"), color = { 70, 76, 86 }, material = "SmoothPlastic" },
	{ id = "marble", name = N("Mermer", "Marble"), color = { 230, 228, 222 }, material = "Marble" },
	{ id = "checker", name = N("Dama", "Checkerboard"), color = { 30, 30, 30 }, material = "SmoothPlastic", checker = true },
	{ id = "carpet", name = N("Halı Kaplama", "Carpet"), color = { 70, 70, 96 }, material = "Carpet" },
}
Upgrades.accentColors = {
	{ 0, 170, 220 }, { 230, 70, 60 }, { 255, 170, 30 }, { 120, 200, 80 }, { 170, 90, 230 }, { 240, 240, 240 }, { 255, 105, 180 }, { 30, 30, 30 },
}

function Upgrades.level(n: number)
	return Upgrades.levels[math.clamp(n, 1, #Upgrades.levels)]
end

function Upgrades.get(id: string)
	return Upgrades.byId[id]
end

-- Sums a numeric field over the owned items { [id] = true }.
function Upgrades.total(owned: { [string]: boolean }?, field: string): number
	local sum = 0
	if not owned then
		return 0
	end
	for id, has in owned do
		local it = Upgrades.byId[id]
		if has and it and it[field] then
			sum += it[field]
		end
	end
	return sum
end

return Upgrades
