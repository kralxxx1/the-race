-- Upgrades: shop expansion levels and everything you can buy for your shop (about 200 items in
-- twelve categories), plus the free looks (walls, floors, colours, counters, benches, awnings).
--   comfort  customers wait longer and tip more (sum of all owned items)
--   attract  more customers walk in;  patience = share longer customers wait;  tips = tip chance
--   security makes thefts harder / gets alerts; protect = share of cash a safe keeps from thieves
--   speed    bench work speed bonus;  storage = extra inventory slots;  quality = fewer mistakes
--            by the technicians;  xp = more experience from repairs
--   staffMorale / staffSpeed / staffLearn  the team's morale a day, work speed, learning
--   rep      reputation a day (reviews, a website people find...)
--   elec     daily electricity the item uses ($); elecSave = share taken off the electricity bill;
--            water / net = daily water / internet ($, negative saves)
--   taxRelief share taken off the income tax
--   required the municipal inspection (zabıta) fines a shop of this level or above without it
-- Where an item shows in the shop (Models/ShopExtras): place = wall (stands against a wall, w x d),
-- high (hangs on a wall, w wide, band eye/top), floor (free-standing, w x d), ceiling, counter,
-- bench (on every workbench), outside (the forecourt), roof, window (on the shop window), door,
-- facade or none; zone = front (the customers' side) / work (the workshop) / any.

local Upgrades = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

Upgrades.levels = {
	{ level = 1, name = N("Küçük Dükkân", "Small Shop"), cost = 0, req = 1, w = 56, d = 42, benches = 1, queue = 2, seats = 2, staff = 2, storage = 40 },
	{ level = 2, name = N("Esnaf Dükkânı", "Local Shop"), cost = 4000, req = 3, w = 68, d = 50, benches = 2, queue = 3, seats = 3, staff = 3, storage = 80 },
	{ level = 3, name = N("Servis Merkezi", "Service Centre"), cost = 15000, req = 6, w = 84, d = 58, benches = 3, queue = 4, seats = 4, staff = 5, storage = 150 },
	{ level = 4, name = N("Büyük Servis", "Big Service Centre"), cost = 45000, req = 10, w = 96, d = 66, benches = 4, queue = 5, seats = 6, staff = 7, storage = 250 },
	{ level = 5, name = N("Teknoloji Mağazası", "Tech Store"), cost = 120000, req = 15, w = 108, d = 70, benches = 6, queue = 6, seats = 8, staff = 10, storage = 400 },
	{ level = 6, name = N("Mega Teknoloji Merkezi", "Mega Tech Centre"), cost = 350000, req = 22, w = 136, d = 72, benches = 8, queue = 8, seats = 10, staff = 14, storage = 700, floors = 2 },
}

Upgrades.items = {
	-- Comfort / decoration
	{ id = "carpet", cat = "decor", name = N("Halı", "Rug"), cost = 400, level = 1, comfort = 3, icon = "🟥" },
	{ id = "plants", cat = "decor", name = N("Saksı Bitkileri", "Potted Plants"), cost = 300, level = 1, comfort = 4, icon = "🪴" },
	{ id = "posters", cat = "decor", name = N("Donanım Posterleri", "Hardware Posters"), cost = 250, level = 1, comfort = 3, icon = "🖼️" },
	{ id = "tea", cat = "decor", name = N("Çay Ocağı (Semaver)", "Tea Urn"), cost = 600, level = 1, comfort = 8, icon = "🫖", elec = 2 },
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
	{ id = "motion_lights", cat = "security", name = N("Hareket Sensörlü Projektör", "Motion-Sensor Floodlights"), cost = 900, level = 2, security = 1, elec = 1, icon = "🔦", desc = N("Gece yaklaşan hırsızı ışığa boğar; çoğu kaçıp gider.", "Floods a night prowler with light; most of them give up.") },
	{ id = "smart_lock", cat = "security", name = N("Şifreli Akıllı Kilit", "Smart Keypad Lock"), cost = 1400, level = 2, security = 1, icon = "🔐", desc = N("Gece kapıyı zorlamak daha uzun sürer.", "Forcing the door at night takes longer.") },
	{ id = "steel_door", cat = "security", name = N("Çelik Kapı", "Steel Door"), cost = 3800, level = 3, security = 2, icon = "🚪", desc = N("Gece hırsızlarının kırması neredeyse iki kat uzun sürer.", "Night burglars take almost twice as long to break in.") },
	{ id = "cctv_hd", cat = "security", name = N("HD Kamera Sistemi ve Kayıt Cihazı", "HD CCTV with Recorder"), cost = 4200, level = 3, security = 1, elec = 1, icon = "🎥", desc = N("Kaçan hırsızı polis kayıttan çoğunlukla bulur ve malı geri getirir.", "The police usually trace an escaped thief from the footage and bring your things back.") },
	{ id = "guard_dog", cat = "security", name = N("Bekçi Köpeği Dost", "Guard Dog Buddy"), cost = 3000, level = 3, security = 2, comfort = 3, icon = "🐕", desc = N("Kapının önünde yatar; kaçan hırsızı çoğu zaman yakalar.", "Lies by the door and usually catches a runner.") },
	{ id = "panic_button", cat = "security", name = N("Polise Bağlı Panik Butonu", "Police-Linked Panic Button"), cost = 5500, level = 4, security = 2, icon = "🆘", desc = N("Alarm çalınca polis gelir; hırsızın kaçma şansı azalır.", "When the alarm goes off the police come; thieves rarely get away.") },
	{ id = "insurance", cat = "security", name = N("İşyeri Sigortası", "Business Insurance"), cost = 1000, level = 2, icon = "📄", desc = N("Çalınan paranın ve malın %70'ini öder. Haftalık prim faturası gelir.", "Pays back 70% of anything stolen. A weekly premium bill comes with it.") },
	{ id = "cctv_sticker", cat = "security", name = N("\"Kamerayla İzlenmektedir\" Levhası", "\"CCTV in Operation\" Sign"), cost = 40, level = 1, security = 0.5, icon = "📹", place = "window" },
	{ id = "safe", cat = "security", name = N("Çelik Kasa", "Steel Safe"), cost = 4000, level = 4, security = 3, protect = 0.5, icon = "🗄️", desc = N("Paranın yarısı çalınamaz.", "Half of your cash can't be stolen.") },
	-- Energy
	{ id = "led_lighting", cat = "energy", name = N("LED Aydınlatma", "LED Lighting"), cost = 900, level = 1, elecSave = 0.12, icon = "💡", desc = N("Elektrik faturası %12 düşer.", "Electricity bill 12% lower.") },
	{ id = "smart_plugs", cat = "energy", name = N("Akıllı Prizler", "Smart Plugs"), cost = 600, level = 2, elecSave = 0.06, icon = "🔌", desc = N("Gece boşta çalışan cihazlar kapanır: elektrik %6 düşer.", "Idle equipment switches off at night: electricity 6% lower.") },
	{ id = "inverter_ac", cat = "energy", name = N("İnverter Klima Dönüşümü", "Inverter AC Upgrade"), cost = 3200, level = 3, elecSave = 0.08, icon = "🌬️", desc = N("Klimalar yarı enerjiyle çalışır.", "The air conditioning uses half the power.") },
	{ id = "solar", cat = "energy", name = N("Çatı Güneş Paneli (10 kW)", "Rooftop Solar (10 kW)"), cost = 18000, level = 4, elecSave = 0.35, icon = "☀️", place = "roof", desc = N("Elektrik faturası %35 düşer.", "Electricity bill 35% lower.") },
	{ id = "battery_wall", cat = "energy", name = N("Ev Tipi Batarya Duvarı", "Battery Wall"), cost = 14000, level = 5, elecSave = 0.12, icon = "🔋", place = "wall", w = 3, d = 1.2, zone = "work", desc = N("Güneşten artan enerji gece kullanılır: %12 daha.", "Spare solar power runs the night: 12% more off.") },
	-- Workshop
	{ id = "bench_mat", cat = "workshop", name = N("ESD Tezgah Matı", "ESD Bench Mat"), cost = 200, level = 1, esd = 0.5, icon = "🟦", desc = N("Bileklik unutulsa bile statik riski yarıya iner.", "Halves the static risk even without a strap.") },
	{ id = "bench_led", cat = "workshop", name = N("Tezgah LED Lambası", "Bench LED Lamp"), cost = 350, level = 1, speed = 0.05, icon = "🔦", elec = 1 },
	{ id = "tool_wall", cat = "workshop", name = N("Alet Panosu", "Tool Wall"), cost = 800, level = 2, speed = 0.05, icon = "🧰" },
	{ id = "parts_shelves", cat = "workshop", name = N("Parça Rafları", "Parts Shelving"), cost = 1500, level = 2, storage = 60, icon = "📦" },
	{ id = "test_bench", cat = "workshop", name = N("Test Monitörü (27\")", "27\" Test Monitor"), cost = 1100, level = 2, speed = 0.05, icon = "🖥️", elec = 1 },
	{ id = "microscope", cat = "workshop", name = N("Dijital Mikroskop", "Digital Microscope"), cost = 2500, level = 7, speed = 0.1, icon = "🔬", desc = N("Lehim işleri hızlanır.", "Soldering work goes faster."), elec = 1 },
	{ id = "warehouse", cat = "workshop", name = N("Depo Odası", "Storeroom"), cost = 8000, level = 4, storage = 300, icon = "🏬" },

	-- Decor
	{ id = "wall_clock", cat = "decor", name = N("Duvar Saati", "Wall Clock"), cost = 120, level = 1, comfort = 1, icon = "🕰️", place = "high", w = 1.6, band = "top", zone = "front" },
	{ id = "framed_art", cat = "decor", name = N("Tablo Seti (Şehir Manzaraları)", "Framed Prints (City Skylines)"), cost = 450, level = 1, comfort = 3, icon = "🖼️", place = "high", w = 5.6, band = "eye", zone = "front" },
	{ id = "evil_eye", cat = "decor", name = N("Nazar Boncuğu Duvar Süsü", "Lucky Horseshoe"), cost = 80, level = 1, comfort = 1, tips = 0.01, icon = "🧿", place = "high", w = 1.6, band = "eye", zone = "front", desc = N("Göz değmesin!", "Brings the shop good luck!") },
	{ id = "turkish_flag", cat = "decor", name = N("Şirket Bayrağı", "Company Flag"), cost = 150, level = 1, comfort = 1, icon = "🚩", place = "high", w = 4.2, band = "top", zone = "front" },
	{ id = "world_map", cat = "decor", name = N("Dünya Haritası", "World Map"), cost = 300, level = 2, comfort = 2, icon = "🗺️", place = "high", w = 5, band = "top", zone = "any" },
	{ id = "calligraphy", cat = "decor", name = N("Hat Sanatı Levhası", "Calligraphy Panel"), cost = 700, level = 3, comfort = 3, icon = "✒️", place = "high", w = 3.4, band = "eye", zone = "front" },
	{ id = "lava_lamp", cat = "decor", name = N("Lav Lambası", "Lava Lamp"), cost = 120, level = 1, comfort = 1, elec = 0.5, icon = "🫧", place = "counter" },
	{ id = "diffuser", cat = "decor", name = N("Oda Kokusu Difüzörü", "Scent Diffuser"), cost = 180, level = 1, comfort = 2, icon = "🌸", place = "counter" },
	{ id = "bonsai", cat = "decor", name = N("Bonsai Ağacı", "Bonsai Tree"), cost = 650, level = 3, comfort = 3, icon = "🌳", place = "counter" },
	{ id = "monstera", cat = "decor", name = N("Büyük Deve Tabanı Bitkisi", "Big Monstera Plant"), cost = 400, level = 2, comfort = 3, icon = "🌿", place = "floor", w = 2.4, d = 2.4, zone = "front" },
	{ id = "kilim", cat = "decor", name = N("El Dokuması Kilim", "Handwoven Rug"), cost = 900, level = 3, comfort = 4, icon = "🧶", place = "floor", w = 6, d = 4, zone = "front", flat = true },
	{ id = "bookshelf", cat = "decor", name = N("Kitaplık (Teknik Kitaplar)", "Bookcase (Tech Books)"), cost = 900, level = 2, comfort = 3, xp = 0.03, icon = "📚", place = "wall", w = 4, d = 1.6, zone = "any" },
	{ id = "hanging_plants", cat = "decor", name = N("Sarkan Sarmaşıklar", "Hanging Plants"), cost = 500, level = 3, comfort = 3, icon = "🪴", place = "ceiling" },
	{ id = "neon_quote", cat = "decor", name = N("Neon Yazı: \"Format Atmadan Olmaz\"", "Neon Quote: \"Have You Tried a Reformat?\""), cost = 1400, level = 4, comfort = 4, attract = 3, elec = 1, icon = "💬", place = "high", w = 7, band = "top", zone = "front" },
	{ id = "figures", cat = "decor", name = N("Oyun Figürü Koleksiyonu", "Game Figure Collection"), cost = 1800, level = 5, comfort = 4, attract = 2, icon = "🦸", place = "wall", w = 3.2, d = 1.6, zone = "front" },
	{ id = "mural", cat = "decor", name = N("Siberpunk Duvar Resmi", "Cyberpunk Wall Mural"), cost = 2200, level = 6, comfort = 6, icon = "🎨", place = "high", w = 10, band = "top", zone = "any" },
	{ id = "retro_museum", cat = "decor", name = N("Retro Bilgisayar Müzesi", "Retro Computer Museum"), cost = 4500, level = 8, comfort = 8, attract = 6, icon = "💾", place = "wall", w = 6, d = 2.4, zone = "front", desc = N("Commodore 64, 386 ve ilk Pentium'lar camlı vitrinde.", "A Commodore 64, a 386 and early Pentiums behind glass.") },
	{ id = "kutahya_plates", cat = "decor", name = N("Seramik Duvar Tabakları", "Delft Tile Plates"), cost = 350, level = 2, comfort = 3, icon = "🍽️", place = "high", w = 3.6, band = "eye", zone = "front" },
	{ id = "canary", cat = "decor", name = N("Kanarya Kafesi", "Canary in a Cage"), cost = 500, level = 2, comfort = 4, icon = "🐤", place = "floor", w = 1.4, d = 1.4, zone = "front", desc = N("Dükkânda kuş sesi eksik olmasın.", "A shop isn't complete without birdsong.") },
	{ id = "old_radio", cat = "decor", name = N("Nostaljik Lambalı Radyo", "Vintage Valve Radio"), cost = 280, level = 1, comfort = 2, icon = "📻", place = "counter" },
	{ id = "gpu_wall", cat = "decor", name = N("Ekran Kartı Koleksiyon Duvarı", "Graphics Card Wall"), cost = 6500, level = 10, comfort = 6, attract = 8, icon = "🎮", place = "high", w = 8, band = "eye", zone = "front" },

	-- Waiting lounge
	{ id = "water_cooler", cat = "lounge", name = N("Su Sebili", "Water Cooler"), cost = 350, level = 1, comfort = 4, water = 1, icon = "🚰", place = "wall", w = 1.6, d = 1.6, zone = "front" },
	{ id = "magazine_rack", cat = "lounge", name = N("Dergi Standı", "Magazine Rack"), cost = 200, level = 1, comfort = 2, icon = "📰", place = "wall", w = 2, d = 1.2, zone = "front" },
	{ id = "newspapers", cat = "lounge", name = N("Günlük Gazeteler", "Daily Papers"), cost = 60, level = 1, comfort = 1, icon = "🗞️", place = "counter" },
	{ id = "coat_rack", cat = "lounge", name = N("Ayaklı Askılık", "Coat Stand"), cost = 140, level = 1, comfort = 1, icon = "🧥", place = "floor", w = 1.6, d = 1.6, zone = "front" },
	{ id = "umbrella_stand", cat = "lounge", name = N("Şemsiyelik", "Umbrella Stand"), cost = 90, level = 1, comfort = 1, icon = "☂️", place = "floor", w = 1.2, d = 1.2, zone = "front" },
	{ id = "guest_wifi", cat = "lounge", name = N("Misafir Wi-Fi", "Guest Wi-Fi"), cost = 400, level = 1, comfort = 4, patience = 0.05, net = 1, icon = "📶", place = "counter", desc = N("Bekleyen müşteri internete girer, sıkılmaz.", "Waiting customers get online and don't get bored.") },
	{ id = "charging_station", cat = "lounge", name = N("Telefon Şarj İstasyonu", "Phone Charging Station"), cost = 600, level = 2, comfort = 4, patience = 0.05, elec = 1, icon = "🔌", place = "wall", w = 1.6, d = 1.2, zone = "front" },
	{ id = "queue_ticket", cat = "lounge", name = N("Sıra Numaratörü", "Queue Ticket Machine"), cost = 800, level = 3, patience = 0.06, icon = "🎫", place = "floor", w = 1.4, d = 1.4, zone = "front" },
	{ id = "bean_bags", cat = "lounge", name = N("Armut Koltuklar", "Bean Bags"), cost = 900, level = 3, comfort = 5, icon = "🫘", place = "floor", w = 5, d = 3, zone = "front" },
	{ id = "kids_corner", cat = "lounge", name = N("Çocuk Oyun Köşesi", "Kids' Play Corner"), cost = 1500, level = 4, comfort = 6, patience = 0.08, icon = "🧸", place = "floor", w = 5, d = 4, zone = "front" },
	{ id = "queue_screen", cat = "lounge", name = N("Sıra Takip Ekranı", "Queue Display"), cost = 2400, level = 5, patience = 0.12, elec = 1, icon = "📟", place = "high", w = 4, band = "top", zone = "front" },
	{ id = "game_console", cat = "lounge", name = N("Oyun Konsolu Köşesi", "Game Console Corner"), cost = 3200, level = 6, comfort = 9, patience = 0.1, elec = 2, icon = "🎮", place = "wall", w = 5, d = 3.6, zone = "front" },
	{ id = "foosball", cat = "lounge", name = N("Langırt Masası", "Foosball Table"), cost = 2600, level = 7, comfort = 7, icon = "⚽", place = "floor", w = 5, d = 3.4, zone = "front" },
	{ id = "massage_chair", cat = "lounge", name = N("Masaj Koltuğu", "Massage Chair"), cost = 4800, level = 9, comfort = 10, elec = 2, icon = "💺", place = "wall", w = 3, d = 3.6, zone = "front" },
	{ id = "big_screen", cat = "lounge", name = N("75 inç Bekleme Ekranı", "75-inch Lounge Screen"), cost = 5500, level = 10, comfort = 8, elec = 2, icon = "📺", place = "high", w = 7, band = "eye", zone = "front" },
	{ id = "vr_demo", cat = "lounge", name = N("VR Deneyim Alanı", "VR Demo Area"), cost = 7500, level = 12, comfort = 8, attract = 8, elec = 2, icon = "🥽", place = "floor", w = 5, d = 5, zone = "front" },

	-- Refreshments
	{ id = "lokum", cat = "kitchen", name = N("Şeker Kasesi", "Candy Bowl"), cost = 60, level = 1, comfort = 2, tips = 0.01, icon = "🍬", place = "counter" },
	{ id = "cologne", cat = "kitchen", name = N("Kolonya İkramı", "Cologne for Guests"), cost = 50, level = 1, comfort = 2, icon = "🍋", place = "counter", desc = N("Gelen müşterinin eline limon kolonyası.", "A splash of lemon cologne for every customer.") },
	{ id = "tea_glasses", cat = "kitchen", name = N("İnce Belli Çay Bardakları", "Tea Glasses"), cost = 120, level = 1, comfort = 2, icon = "🍵", place = "counter" },
	{ id = "simit_tray", cat = "kitchen", name = N("Simit ve Poğaça İkramı", "Bagel and Pastry Tray"), cost = 400, level = 2, comfort = 4, tips = 0.02, icon = "🥯", place = "counter" },
	{ id = "turkish_coffee", cat = "kitchen", name = N("Barista Kahve Makinesi", "Barista Coffee Machine"), cost = 1100, level = 3, comfort = 6, tips = 0.03, elec = 1, icon = "☕", place = "wall", w = 2.4, d = 2.2, zone = "front" },
	{ id = "microwave", cat = "kitchen", name = N("Mikrodalga Fırın", "Microwave"), cost = 350, level = 2, staffMorale = 0.5, elec = 1, icon = "🍲", place = "wall", w = 2.4, d = 2.2, zone = "work" },
	{ id = "drinks_fridge", cat = "kitchen", name = N("Camlı İçecek Dolabı", "Glass-Door Drinks Fridge"), cost = 1800, level = 4, comfort = 6, elec = 3, icon = "🥤", place = "wall", w = 2.6, d = 2.4, zone = "front" },
	{ id = "dishwasher", cat = "kitchen", name = N("Bulaşık Makinesi", "Dishwasher"), cost = 900, level = 4, staffMorale = 1, elec = 2, water = 2, icon = "🍽️", place = "wall", w = 2.4, d = 2.2, zone = "work" },
	{ id = "ice_cream", cat = "kitchen", name = N("Dondurma Dolabı", "Ice Cream Freezer"), cost = 2600, level = 7, comfort = 6, elec = 3, icon = "🍦", place = "wall", w = 3.4, d = 2.4, zone = "front" },
	{ id = "espresso_bar", cat = "kitchen", name = N("Espresso Bar", "Espresso Bar"), cost = 6800, level = 10, comfort = 10, tips = 0.05, elec = 3, icon = "☕", place = "wall", w = 5, d = 2.6, zone = "front" },

	-- Lighting
	{ id = "floor_lamp", cat = "lighting", name = N("Lambader", "Floor Lamp"), cost = 300, level = 1, comfort = 2, elec = 0.5, icon = "🛋️", place = "floor", w = 1.4, d = 1.4, zone = "front" },
	{ id = "pendant_lamps", cat = "lighting", name = N("Sarkıt Lambalar", "Pendant Lamps"), cost = 700, level = 2, comfort = 3, elec = 1, icon = "💡", place = "ceiling" },
	{ id = "edison_bulbs", cat = "lighting", name = N("Edison Ampuller", "Edison Bulbs"), cost = 500, level = 2, comfort = 3, elec = 1, icon = "🔆", place = "ceiling" },
	{ id = "counter_led", cat = "lighting", name = N("Tezgâh Altı LED Şerit", "Under-Counter LED Strip"), cost = 350, level = 2, comfort = 2, elec = 0.5, icon = "✨", place = "counter_glow" },
	{ id = "track_lights", cat = "lighting", name = N("Ray Spot Aydınlatma", "Track Spotlights"), cost = 1200, level = 4, comfort = 2, attract = 3, elec = 1, icon = "🔦", place = "ceiling" },
	{ id = "window_lightbox", cat = "lighting", name = N("Vitrin Işıklı Pano", "Window Lightbox"), cost = 1600, level = 4, attract = 5, elec = 2, icon = "🪧", place = "window" },
	{ id = "window_led", cat = "lighting", name = N("Vitrin LED Çerçevesi", "Window LED Frame"), cost = 450, level = 2, attract = 3, elec = 0.5, icon = "🟦", place = "window" },
	{ id = "smart_lighting", cat = "lighting", name = N("Sensörlü Akıllı Aydınlatma", "Sensor Smart Lighting"), cost = 2400, level = 6, elecSave = 0.06, icon = "📡", place = "ceiling" },
	{ id = "skylight", cat = "lighting", name = N("Çatı Penceresi", "Skylight"), cost = 3500, level = 6, comfort = 5, elecSave = 0.04, icon = "🌤️", place = "ceiling" },
	{ id = "chandelier", cat = "lighting", name = N("Kristal Avize", "Crystal Chandelier"), cost = 4200, level = 9, comfort = 7, attract = 2, elec = 2, icon = "🕯️", place = "ceiling" },

	-- Business (more)
	{ id = "price_tags", cat = "business", name = N("Fiyat Listesi ve Etiketler", "Price List and Tags"), cost = 100, level = 1, required = 2, icon = "🏷️", place = "high", w = 3.6, band = "eye", zone = "front", desc = N("Fiyatların görünür olması kanunen zorunludur.", "Prices must be on display by law.") },
	{ id = "pos_terminal", cat = "business", name = N("Kredi Kartı POS Cihazı", "Card Payment Terminal"), cost = 300, level = 1, tips = 0.03, attract = 3, icon = "💳", place = "counter", desc = N("Kartla ödeyebilen müşteri daha çok gelir.", "Customers who can pay by card come more often.") },
	{ id = "business_cards", cat = "business", name = N("Kartvizit Standı", "Business Card Stand"), cost = 80, level = 1, attract = 2, icon = "📇", place = "counter" },
	{ id = "opening_hours", cat = "business", name = N("Çalışma Saatleri Levhası", "Opening Hours Sticker"), cost = 60, level = 1, attract = 1, icon = "🕘", place = "window" },
	{ id = "sidewalk_sign", cat = "business", name = N("Kaldırım Tabelası (A Pano)", "Sidewalk A-Board"), cost = 150, level = 1, attract = 3, icon = "🪧", place = "outside", w = 2, row = "street" },
	{ id = "cash_register", cat = "business", name = N("Yazar Kasa (ÖKC)", "Cash Register (Fiscal)"), cost = 900, level = 2, required = 3, taxRelief = 0.03, icon = "🧾", place = "counter", desc = N("Fiş kesmek zorunludur; kayıtlar vergiyi düzenler.", "Receipts are compulsory; proper records trim the tax.") },
	{ id = "open_sign", cat = "business", name = N("Neon \"AÇIK\" Tabelası", "Neon OPEN Sign"), cost = 350, level = 2, attract = 3, elec = 1, icon = "🟢", place = "window" },
	{ id = "map_listing", cat = "business", name = N("İnternet Haritası Kaydı", "Online Map Listing"), cost = 300, level = 2, attract = 5, icon = "📍", place = "window" },
	{ id = "social_media", cat = "business", name = N("Sosyal Medya Hesapları", "Social Media Pages"), cost = 600, level = 2, attract = 6, rep = 0.2, icon = "📱", place = "window" },
	{ id = "flag_banner", cat = "business", name = N("Yelken Bayrak Reklam", "Feather Flag"), cost = 400, level = 2, attract = 4, icon = "🚩", place = "outside", w = 2 },
	{ id = "review_qr", cat = "business", name = N("QR Kodlu Yorum Standı", "QR Review Stand"), cost = 90, level = 1, rep = 0.1, icon = "🔳", place = "counter" },
	{ id = "gift_wrap", cat = "business", name = N("Hediye Paketi Servisi", "Gift Wrapping"), cost = 250, level = 2, tips = 0.02, icon = "🎁", place = "counter" },
	{ id = "loyalty_cards", cat = "business", name = N("Sadakat Kartı Programı", "Loyalty Card Scheme"), cost = 1200, level = 4, attract = 4, tips = 0.02, icon = "🎟️", place = "counter" },
	{ id = "warranty_system", cat = "business", name = N("Yazılı Garanti Belgesi", "Written Warranty"), cost = 1500, level = 4, rep = 0.2, tips = 0.02, icon = "📜", place = "high", w = 2.4, band = "eye", zone = "front" },
	{ id = "reviews_screen", cat = "business", name = N("Müşteri Yorumları Ekranı", "Customer Reviews Screen"), cost = 2800, level = 6, attract = 4, rep = 0.3, elec = 1, icon = "⭐", place = "high", w = 4, band = "top", zone = "front" },
	{ id = "delivery_scooter", cat = "business", name = N("Servis Motosikleti", "Service Scooter"), cost = 9000, level = 10, attract = 6, icon = "🛵", place = "outside", w = 4, desc = N("Logolu motor kapıda: semtte herkes dükkânını tanır.", "A branded scooter at the door: the whole district knows your shop.") },
	{ id = "iso_cert", cat = "business", name = N("ISO 9001 Kalite Belgesi", "ISO 9001 Certificate"), cost = 6000, level = 12, rep = 0.4, quality = 0.03, icon = "🏅", place = "high", w = 2.4, band = "eye", zone = "front" },
	{ id = "roof_billboard", cat = "business", name = N("Çatı Reklam Panosu", "Rooftop Billboard"), cost = 12000, level = 14, attract = 15, elec = 2, icon = "🏙️", place = "roof", w = 16, d = 2 },
	{ id = "authorised", cat = "business", name = N("Yetkili Servis Levhası", "Authorised Service Plaque"), cost = 15000, level = 16, attract = 12, rep = 0.5, icon = "🎖️", place = "facade" },

	-- Safety and licences (the municipal inspection checks these)
	{ id = "license", cat = "safety", name = N("İşyeri Açma ve Çalışma Ruhsatı", "Business Licence"), cost = 800, level = 1, required = 2, icon = "📃", place = "high", w = 2, band = "eye", zone = "front" },
	{ id = "fire_extinguisher", cat = "safety", name = N("Yangın Söndürme Tüpü", "Fire Extinguisher"), cost = 150, level = 1, required = 2, icon = "🧯", place = "high", w = 1.2, band = "low", zone = "any" },
	{ id = "first_aid", cat = "safety", name = N("İlk Yardım Dolabı", "First Aid Cabinet"), cost = 120, level = 1, required = 2, icon = "⛑️", place = "high", w = 1.6, band = "eye", zone = "work" },
	{ id = "fire_blanket", cat = "safety", name = N("Yangın Battaniyesi", "Fire Blanket"), cost = 60, level = 1, icon = "🟥", place = "high", w = 1.2, band = "eye", zone = "work" },
	{ id = "safety_kit", cat = "safety", name = N("Gözlük ve Eldiven Seti", "Goggles and Gloves Kit"), cost = 120, level = 1, staffMorale = 0.5, icon = "🥽", place = "high", w = 1.6, band = "eye", zone = "work" },
	{ id = "exit_sign", cat = "safety", name = N("Acil Çıkış Levhası", "Emergency Exit Sign"), cost = 70, level = 1, required = 3, icon = "🚪", place = "door" },
	{ id = "smoke_detector", cat = "safety", name = N("Duman Dedektörü", "Smoke Detector"), cost = 90, level = 1, required = 4, icon = "🔔", place = "ceiling" },
	{ id = "emergency_light", cat = "safety", name = N("Acil Durum Aydınlatması", "Emergency Lighting"), cost = 300, level = 2, required = 5, elec = 0.5, icon = "🔋", place = "high", w = 1.6, band = "top", zone = "any" },
	{ id = "kvkk_notice", cat = "safety", name = N("KVKK Aydınlatma Metni", "Data Privacy Notice"), cost = 300, level = 3, required = 5, rep = 0.1, icon = "🔏", place = "high", w = 2, band = "eye", zone = "front", desc = N("Müşteri verilerini nasıl koruduğunu yazar.", "Tells customers how their data is protected.") },
	{ id = "cleaning_cart", cat = "safety", name = N("Profesyonel Temizlik Arabası", "Cleaning Trolley"), cost = 400, level = 1, comfort = 2, icon = "🧽", place = "wall", w = 1.8, d = 1.4, zone = "work" },
	{ id = "fume_extractor", cat = "safety", name = N("Lehim Dumanı Emici", "Solder Fume Extractor"), cost = 950, level = 4, staffMorale = 1, quality = 0.02, elec = 1, icon = "🌀", place = "bench" },
	{ id = "ergo_chairs", cat = "safety", name = N("Ergonomik Teknisyen Sandalyeleri", "Ergonomic Technician Chairs"), cost = 2400, level = 5, staffSpeed = 0.04, staffMorale = 1, icon = "🪑", place = "bench_chair" },
	{ id = "esd_floor", cat = "safety", name = N("Antistatik Zemin Kaplaması", "Antistatic Flooring"), cost = 3600, level = 6, quality = 0.02, icon = "🟩", place = "work_floor", desc = N("Atölyede statik elektrik birikmez.", "No static builds up in the workshop.") },
	{ id = "sprinklers", cat = "safety", name = N("Yangın Sprinkler Sistemi", "Fire Sprinklers"), cost = 4800, level = 8, required = 6, security = 1, icon = "🚿", place = "ceiling" },

	-- Workshop (more)
	{ id = "label_maker", cat = "workshop", name = N("Etiket Yazıcı", "Label Printer"), cost = 250, level = 1, speed = 0.02, icon = "🏷️", place = "counter" },
	{ id = "parts_drawers", cat = "workshop", name = N("Küçük Parça Çekmeceleri", "Small Parts Drawers"), cost = 450, level = 1, speed = 0.03, storage = 10, icon = "🗃️", place = "bench" },
	{ id = "cable_reels", cat = "workshop", name = N("Kablo Makaraları", "Cable Reels"), cost = 300, level = 2, speed = 0.02, icon = "🧵", place = "high", w = 3, band = "top", zone = "work" },
	{ id = "lab_psu", cat = "workshop", name = N("Laboratuvar Güç Kaynağı", "Bench Power Supply"), cost = 900, level = 3, speed = 0.03, elec = 0.5, icon = "🔋", place = "bench" },
	{ id = "tool_cart", cat = "workshop", name = N("Alet Arabası", "Tool Trolley"), cost = 900, level = 3, speed = 0.03, icon = "🛒", place = "floor", w = 2.4, d = 1.6, zone = "work" },
	{ id = "esd_vacuum", cat = "workshop", name = N("Antistatik Elektrik Süpürgesi", "ESD Vacuum"), cost = 650, level = 3, speed = 0.02, comfort = 1, icon = "🧹", place = "wall", w = 1.6, d = 1.6, zone = "work" },
	{ id = "dual_monitors", cat = "workshop", name = N("Çift Monitör Kurulumu", "Dual Monitor Setup"), cost = 1300, level = 4, speed = 0.04, elec = 1, icon = "🖥️", place = "bench" },
	{ id = "compressor", cat = "workshop", name = N("Hava Kompresörü", "Air Compressor"), cost = 1900, level = 4, speed = 0.04, elec = 2, icon = "💨", place = "floor", w = 2.4, d = 1.8, zone = "work", desc = N("Toz temizliği çok daha hızlı.", "Dust cleaning goes much faster.") },
	{ id = "hot_air", cat = "workshop", name = N("Sıcak Hava İstasyonu", "Hot Air Rework Station"), cost = 1600, level = 5, speed = 0.04, quality = 0.02, elec = 1, icon = "🔥", place = "bench" },
	{ id = "ultrasonic", cat = "workshop", name = N("Ultrasonik Temizleyici", "Ultrasonic Cleaner"), cost = 1200, level = 5, quality = 0.03, elec = 1, icon = "🫧", place = "bench", desc = N("Sıvı temaslı kartlar tertemiz olur.", "Liquid-damaged boards come out spotless.") },
	{ id = "spare_cabinet", cat = "workshop", name = N("Yedek Parça Dolabı", "Spare Parts Cabinet"), cost = 2600, level = 6, storage = 40, icon = "🗄️", place = "wall", w = 3, d = 1.8, zone = "work" },
	{ id = "screen_separator", cat = "workshop", name = N("Ekran Ayırma Makinesi", "Screen Separator"), cost = 2800, level = 7, speed = 0.04, elec = 1, icon = "📱", place = "bench" },
	{ id = "oscilloscope", cat = "workshop", name = N("Osiloskop", "Oscilloscope"), cost = 3800, level = 8, speed = 0.04, quality = 0.03, elec = 1, icon = "📈", place = "bench" },
	{ id = "pallet_jack", cat = "workshop", name = N("Transpalet", "Pallet Jack"), cost = 2200, level = 8, staffSpeed = 0.02, storage = 20, icon = "🛻", place = "floor", w = 2, d = 4, zone = "work" },
	{ id = "burn_in_rack", cat = "workshop", name = N("Stres Testi Rafı (Burn-in)", "Burn-in Test Rack"), cost = 5200, level = 9, quality = 0.05, elec = 4, icon = "🌡️", place = "wall", w = 4, d = 2, zone = "work", desc = N("Teslimden önce her PC saatlerce test edilir.", "Every PC runs for hours before it goes back.") },
	{ id = "printer_3d", cat = "workshop", name = N("3D Yazıcı (Yedek Parça Basımı)", "3D Printer (Spare Parts)"), cost = 3400, level = 9, quality = 0.02, elec = 1, icon = "🖨️", place = "wall", w = 2.6, d = 2.2, zone = "work" },
	{ id = "pallet_rack", cat = "workshop", name = N("Endüstriyel Raf Sistemi", "Industrial Racking"), cost = 7000, level = 11, storage = 150, icon = "🏗️", place = "wall", w = 8, d = 2.6, zone = "work" },
	{ id = "bga_station", cat = "workshop", name = N("BGA Rework İstasyonu", "BGA Rework Station"), cost = 12000, level = 14, speed = 0.06, quality = 0.04, elec = 3, icon = "🔬", place = "wall", w = 3, d = 2.6, zone = "work" },

	-- IT and network
	{ id = "signature_tablet", cat = "it", name = N("Dijital İmza Tableti", "Signature Pad"), cost = 600, level = 3, patience = 0.03, icon = "✍️", place = "counter", desc = N("Teslim formu kâğıtsız, saniyeler içinde imzalanır.", "Hand-over forms are signed on screen in seconds.") },
	{ id = "office_pc", cat = "it", name = N("Ofis Bilgisayarı ve Programları", "Office PC and Software"), cost = 1500, level = 2, taxRelief = 0.02, speed = 0.02, elec = 1, icon = "💻", place = "counter" },
	{ id = "laser_printer", cat = "it", name = N("Lazer Yazıcı", "Laser Printer"), cost = 700, level = 2, speed = 0.01, elec = 0.5, icon = "🖨️", place = "wall", w = 2, d = 1.6, zone = "any" },
	{ id = "mesh_wifi", cat = "it", name = N("Mesh Wi-Fi Sistemi", "Mesh Wi-Fi"), cost = 900, level = 3, comfort = 2, net = 1, icon = "🛜", place = "ceiling" },
	{ id = "fiber", cat = "it", name = N("Fiber İnternet (1000 Mbps)", "Fibre Internet (1 Gbps)"), cost = 1800, level = 4, speed = 0.03, net = 6, icon = "⚡", place = "high", w = 1.6, band = "top", zone = "work", desc = N("Sürücü ve güncellemeler saniyeler içinde iner.", "Drivers and updates download in seconds.") },
	{ id = "ups", cat = "it", name = N("Kesintisiz Güç Kaynağı (UPS)", "Uninterruptible Power Supply"), cost = 2400, level = 5, quality = 0.03, elec = 1, icon = "🔋", place = "wall", w = 1.6, d = 1.8, zone = "work" },
	{ id = "nas_backup", cat = "it", name = N("NAS Yedekleme Sistemi", "NAS Backup"), cost = 2800, level = 6, quality = 0.03, rep = 0.1, elec = 1, icon = "💽", place = "counter" },
	{ id = "crm", cat = "it", name = N("Müşteri Takip Programı (CRM)", "Customer Tracking (CRM)"), cost = 3000, level = 7, patience = 0.06, rep = 0.2, icon = "🗂️", place = "counter" },
	{ id = "network_cabinet", cat = "it", name = N("Ağ Kabini ve Patch Panel", "Network Cabinet"), cost = 3200, level = 7, speed = 0.02, net = 2, icon = "🔗", place = "high", w = 2, band = "eye", zone = "work" },
	{ id = "diag_software", cat = "it", name = N("Profesyonel Arıza Tespit Yazılımı", "Pro Diagnostics Suite"), cost = 4200, level = 8, speed = 0.05, icon = "🩺", place = "none" },
	{ id = "smart_panel", cat = "it", name = N("Akıllı Bina Paneli", "Smart Building Panel"), cost = 3600, level = 9, elecSave = 0.04, icon = "🎛️", place = "high", w = 1.6, band = "eye", zone = "front" },
	{ id = "server_rack", cat = "it", name = N("Sunucu Kabini", "Server Rack"), cost = 9500, level = 12, quality = 0.02, xp = 0.04, elec = 6, icon = "🗄️", place = "wall", w = 2.4, d = 2.6, zone = "work" },

	-- Energy (more)
	{ id = "timer_switches", cat = "energy", name = N("Zaman Ayarlı Anahtarlar", "Timer Switches"), cost = 250, level = 1, elecSave = 0.03, icon = "⏲️", place = "high", w = 1.2, band = "eye", zone = "work" },
	{ id = "water_tank", cat = "energy", name = N("Çatı Su Deposu", "Rooftop Water Tank"), cost = 600, level = 1, water = -1, icon = "🛢️", place = "roof", w = 4, d = 3 },
	{ id = "window_film", cat = "energy", name = N("Güneş Kontrol Cam Filmi", "Solar Window Film"), cost = 900, level = 3, elecSave = 0.02, comfort = 1, icon = "🪟", place = "none" },
	{ id = "solar_water", cat = "energy", name = N("Güneş Enerjili Su Isıtıcı", "Solar Water Heater"), cost = 2600, level = 5, elecSave = 0.03, icon = "🌞", place = "roof", w = 5, d = 4 },
	{ id = "rainwater", cat = "energy", name = N("Yağmur Suyu Toplama", "Rainwater Harvesting"), cost = 3000, level = 7, water = -3, icon = "🌧️", place = "outside", w = 3 },
	{ id = "sensor_taps", cat = "energy", name = N("Sensörlü Musluklar", "Sensor Taps"), cost = 400, level = 2, water = -1, icon = "🚰", place = "none" },
	{ id = "insulation", cat = "energy", name = N("Isı Yalıtımı (Mantolama)", "Wall Insulation"), cost = 7000, level = 8, elecSave = 0.07, icon = "🧱", place = "none" },
	{ id = "ev_charger", cat = "energy", name = N("Elektrikli Araç Şarj Ünitesi", "EV Charger"), cost = 6500, level = 9, attract = 5, elec = 2, icon = "🔌", place = "outside", w = 2 },
	{ id = "heat_pump", cat = "energy", name = N("Isı Pompası", "Heat Pump"), cost = 9800, level = 10, elecSave = 0.08, comfort = 3, icon = "♨️", place = "roof", w = 4, d = 3 },
	{ id = "wind_turbine", cat = "energy", name = N("Mini Rüzgâr Türbini", "Small Wind Turbine"), cost = 12000, level = 13, elecSave = 0.1, icon = "🌬️", place = "roof", w = 4, d = 4 },

	-- The staff room
	{ id = "lockers", cat = "staffroom", name = N("Personel Dolapları", "Staff Lockers"), cost = 900, level = 2, staffMorale = 1, icon = "🔐", place = "wall", w = 3.2, d = 1.6, zone = "work" },
	{ id = "staff_fridge", cat = "staffroom", name = N("Personel Buzdolabı", "Staff Fridge"), cost = 600, level = 2, staffMorale = 0.5, elec = 2, icon = "🧊", place = "wall", w = 2, d = 2, zone = "work" },
	{ id = "staff_tea", cat = "staffroom", name = N("Personel Çay Ocağı", "Staff Tea Corner"), cost = 450, level = 1, staffMorale = 1, icon = "🫖", place = "wall", w = 2.4, d = 2, zone = "work" },
	{ id = "break_table", cat = "staffroom", name = N("Mola Masası", "Break Table"), cost = 700, level = 2, staffMorale = 1, icon = "🍽️", place = "floor", w = 4, d = 4, zone = "work" },
	{ id = "uniforms", cat = "staffroom", name = N("Kurumsal Personel Kıyafetleri", "Staff Uniforms"), cost = 1800, level = 4, rep = 0.2, staffMorale = 0.5, attract = 2, icon = "👕", place = "none" },
	{ id = "bonus_scheme", cat = "staffroom", name = N("Prim Sistemi", "Bonus Scheme"), cost = 2500, level = 6, staffMorale = 1, staffSpeed = 0.02, icon = "💰", place = "none" },
	{ id = "training", cat = "staffroom", name = N("Eğitim Seti ve Online Kurslar", "Training Kit and Online Courses"), cost = 5000, level = 8, staffMorale = 0.5, staffLearn = 0.4, icon = "🎓", place = "high", w = 5, band = "top", zone = "work" },
	{ id = "health_plan", cat = "staffroom", name = N("Özel Sağlık Sigortası (Personel)", "Staff Health Insurance"), cost = 4000, level = 8, staffMorale = 2, icon = "🩺", place = "none" },
	{ id = "gym_corner", cat = "staffroom", name = N("Mini Spor Köşesi", "Mini Gym Corner"), cost = 4200, level = 9, staffMorale = 1.5, comfort = 1, icon = "🏋️", place = "floor", w = 4, d = 3, zone = "work" },
	{ id = "staff_shuttle", cat = "staffroom", name = N("Personel Servisi", "Staff Shuttle"), cost = 6000, level = 10, staffMorale = 1.5, icon = "🚐", place = "none" },
	{ id = "nap_pod", cat = "staffroom", name = N("Şekerleme Kapsülü", "Nap Pod"), cost = 8500, level = 12, staffMorale = 2, staffSpeed = 0.03, elec = 1, icon = "😴", place = "wall", w = 3, d = 4, zone = "work" },

	-- Outside
	{ id = "bike_rack", cat = "exterior", name = N("Bisiklet Parkı", "Bike Rack"), cost = 250, level = 1, attract = 2, icon = "🚲", place = "outside", w = 4, row = "street" },
	{ id = "satellite", cat = "exterior", name = N("Çanak Anten", "Satellite Dish"), cost = 200, level = 1, comfort = 1, icon = "📡", place = "roof", w = 2, d = 2 },
	{ id = "door_chime", cat = "exterior", name = N("Kapı Zili ve Müşteri Sensörü", "Door Chime Sensor"), cost = 120, level = 1, patience = 0.02, icon = "🔔", place = "door" },
	{ id = "outdoor_bench", cat = "exterior", name = N("Dış Bekleme Bankı", "Outdoor Bench"), cost = 400, level = 2, patience = 0.03, icon = "🪑", place = "outside", w = 4 },
	{ id = "string_lights", cat = "exterior", name = N("Tente Işık Zinciri", "Awning String Lights"), cost = 350, level = 2, attract = 2, comfort = 1, elec = 0.5, icon = "🎇", place = "facade" },
	{ id = "awning_led", cat = "exterior", name = N("Tente Altı LED Aydınlatma", "Awning LED Lights"), cost = 800, level = 2, attract = 3, elec = 1, icon = "💫", place = "facade" },
	{ id = "flag_pole", cat = "exterior", name = N("Bayrak Direği", "Flagpole"), cost = 900, level = 3, attract = 2, icon = "🏳️", place = "outside", w = 2 },
	{ id = "big_planters", cat = "exterior", name = N("Zeytin Ağaçlı Büyük Saksılar", "Olive Tree Planters"), cost = 1200, level = 4, comfort = 3, attract = 2, icon = "🫒", place = "outside", w = 3, count = 2 },
	{ id = "street_art", cat = "exterior", name = N("Sokak Sanatı Duvarı", "Street Art Wall"), cost = 2400, level = 6, attract = 5, comfort = 1, icon = "🖌️", place = "facade" },
	{ id = "pergola", cat = "exterior", name = N("Ahşap Pergola", "Timber Pergola"), cost = 3800, level = 7, comfort = 4, attract = 3, icon = "⛱️", place = "outside", w = 8, d = 5 },
	{ id = "sidewalk_logo", cat = "exterior", name = N("Kaldırıma Logo Projeksiyonu", "Sidewalk Logo Projector"), cost = 2800, level = 8, attract = 6, elec = 1, icon = "🔦", place = "outside", w = 4, row = "street" },
	{ id = "cladding", cat = "exterior", name = N("Kompozit Cephe Kaplama", "Composite Facade Cladding"), cost = 8000, level = 9, attract = 6, comfort = 2, icon = "🏢", place = "facade" },
	{ id = "auto_door", cat = "exterior", name = N("Otomatik Cam Kapı", "Automatic Glass Door"), cost = 5200, level = 9, comfort = 3, attract = 3, elec = 1, icon = "🚪", place = "door" },
	{ id = "roof_letters", cat = "exterior", name = N("Çatı Işıklı Harfleri", "Rooftop Letters"), cost = 7500, level = 11, attract = 10, elec = 3, icon = "🔠", place = "roof", w = 18, d = 2 },
	{ id = "digital_signage", cat = "exterior", name = N("Dijital Reklam Totemi", "Digital Signage Totem"), cost = 9500, level = 12, attract = 10, elec = 2, icon = "📺", place = "outside", w = 2.4 },
}

Upgrades.byId = {}
for _, it in Upgrades.items do
	Upgrades.byId[it.id] = it
end

Upgrades.categories = {
	{ id = "decor", icon = "🖼️", name = N("Konfor & Dekor", "Comfort & Decor") },
	{ id = "lounge", icon = "🛋️", name = N("Bekleme Salonu", "Waiting Lounge") },
	{ id = "kitchen", icon = "☕", name = N("İkram & Mutfak", "Refreshments") },
	{ id = "lighting", icon = "💡", name = N("Aydınlatma", "Lighting") },
	{ id = "business", icon = "💼", name = N("İşletme & Reklam", "Business & Marketing") },
	{ id = "security", icon = "🛡️", name = N("Güvenlik", "Security") },
	{ id = "safety", icon = "🧯", name = N("İş Güvenliği & Ruhsat", "Safety & Licences") },
	{ id = "workshop", icon = "🔧", name = N("Atölye", "Workshop") },
	{ id = "it", icon = "🌐", name = N("Bilişim & Ağ", "IT & Network") },
	{ id = "energy", icon = "☀️", name = N("Enerji & Su", "Energy & Water") },
	{ id = "staffroom", icon = "🧑‍🤝‍🧑", name = N("Personel Alanı", "Staff Room") },
	{ id = "exterior", icon = "🏪", name = N("Dış Cephe", "Outside") },
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
	{ id = "cream", name = N("Krem", "Cream"), color = { 240, 228, 200 }, material = "Plaster" },
	{ id = "sky", name = N("Gök Mavisi", "Sky Blue"), color = { 170, 205, 230 }, material = "Plaster" },
	{ id = "sage", name = N("Adaçayı Yeşili", "Sage"), color = { 170, 190, 150 }, material = "Plaster" },
	{ id = "charcoal", name = N("Füme", "Charcoal"), color = { 55, 58, 64 }, material = "SmoothPlastic" },
	{ id = "stone", name = N("Doğal Taş", "Natural Stone"), color = { 200, 190, 170 }, material = "Limestone" },
	{ id = "slate", name = N("Arduvaz", "Slate"), color = { 90, 96, 104 }, material = "Slate" },
	{ id = "subway", name = N("Metro Fayans", "Subway Tiles"), color = { 240, 240, 236 }, material = "CeramicTiles" },
	{ id = "darkwood", name = N("Koyu Ahşap", "Dark Wood"), color = { 90, 60, 40 }, material = "WoodPlanks" },
	{ id = "oak", name = N("Meşe", "Oak"), color = { 190, 150, 100 }, material = "Wood" },
	{ id = "granite", name = N("Granit", "Granite"), color = { 150, 145, 140 }, material = "Granite" },
	{ id = "plum", name = N("Mürdüm", "Plum"), color = { 110, 60, 100 }, material = "Plaster" },
	{ id = "sunflower", name = N("Ayçiçeği", "Sunflower"), color = { 240, 200, 80 }, material = "Plaster" },
	{ id = "teal", name = N("Petrol Mavisi", "Teal"), color = { 40, 130, 130 }, material = "Plaster" },
	{ id = "blush", name = N("Pudra", "Blush"), color = { 230, 180, 180 }, material = "Plaster" },
	{ id = "metal", name = N("Endüstriyel Metal", "Industrial Metal"), color = { 140, 144, 150 }, material = "DiamondPlate" },
	{ id = "sandstone", name = N("Kum Taşı", "Sandstone"), color = { 210, 180, 140 }, material = "Sandstone" },
}
Upgrades.floorStyles = {
	{ id = "tiles", name = N("Seramik", "Ceramic Tiles"), color = { 214, 210, 202 }, material = "CeramicTiles" },
	{ id = "parquet", name = N("Parke", "Parquet"), color = { 168, 122, 82 }, material = "WoodPlanks" },
	{ id = "epoxy", name = N("Epoksi", "Epoxy"), color = { 70, 76, 86 }, material = "SmoothPlastic" },
	{ id = "marble", name = N("Mermer", "Marble"), color = { 230, 228, 222 }, material = "Marble" },
	{ id = "checker", name = N("Dama", "Checkerboard"), color = { 30, 30, 30 }, material = "SmoothPlastic", checker = true },
	{ id = "carpet", name = N("Halı Kaplama", "Carpet"), color = { 70, 70, 96 }, material = "Carpet" },
	{ id = "oak", name = N("Meşe Parke", "Oak Boards"), color = { 190, 150, 100 }, material = "WoodPlanks" },
	{ id = "walnut", name = N("Ceviz Parke", "Walnut Boards"), color = { 100, 70, 50 }, material = "WoodPlanks" },
	{ id = "slate", name = N("Arduvaz Taşı", "Slate"), color = { 80, 84, 90 }, material = "Slate" },
	{ id = "granite", name = N("Granit", "Granite"), color = { 140, 136, 130 }, material = "Granite" },
	{ id = "terrazzo", name = N("Mozaik (Terrazzo)", "Terrazzo"), color = { 210, 205, 195 }, material = "Pebble" },
	{ id = "concrete", name = N("Cilalı Beton", "Polished Concrete"), color = { 160, 160, 158 }, material = "Concrete" },
	{ id = "rubber", name = N("Kauçuk", "Rubber"), color = { 50, 52, 56 }, material = "Rubber" },
	{ id = "white", name = N("Beyaz Seramik", "White Tiles"), color = { 245, 245, 242 }, material = "CeramicTiles" },
	{ id = "terracotta", name = N("Kiremit Karo", "Terracotta Tiles"), color = { 190, 110, 80 }, material = "CeramicTiles" },
	{ id = "bluecarpet", name = N("Lacivert Halı", "Navy Carpet"), color = { 40, 60, 110 }, material = "Carpet" },
}
Upgrades.accentColors = {
	{ 0, 170, 220 }, { 230, 70, 60 }, { 255, 170, 30 }, { 120, 200, 80 }, { 170, 90, 230 }, { 240, 240, 240 }, { 255, 105, 180 }, { 30, 30, 30 },
	{ 0, 120, 90 }, { 120, 60, 200 }, { 250, 220, 60 }, { 200, 30, 90 }, { 90, 180, 250 }, { 140, 90, 60 }, { 80, 200, 160 }, { 255, 120, 60 },
}
-- The counter, the workbenches and the awning (free looks too).
Upgrades.counterStyles = {
	{ id = "classic", name = N("Klasik Beyaz", "Classic White"), color = { 236, 236, 236 }, top = { 40, 40, 46 }, topMaterial = "Marble" },
	{ id = "walnut", name = N("Ceviz", "Walnut"), color = { 100, 70, 50 }, top = { 230, 228, 222 }, topMaterial = "Marble", material = "Wood" },
	{ id = "black", name = N("Mat Siyah", "Matte Black"), color = { 34, 34, 38 }, top = { 200, 170, 100 }, topMaterial = "Wood" },
	{ id = "concrete", name = N("Brüt Beton", "Raw Concrete"), color = { 150, 150, 148 }, top = { 70, 50, 36 }, topMaterial = "WoodPlanks", material = "Concrete" },
	{ id = "navy", name = N("Lacivert", "Navy"), color = { 40, 56, 92 }, top = { 240, 240, 236 }, topMaterial = "Marble" },
	{ id = "steel", name = N("Paslanmaz Çelik", "Stainless Steel"), color = { 180, 182, 186 }, top = { 60, 60, 66 }, topMaterial = "Granite", material = "Metal" },
	{ id = "mint", name = N("Mint", "Mint"), color = { 170, 214, 196 }, top = { 250, 250, 248 }, topMaterial = "Marble" },
	{ id = "brick", name = N("Tuğla", "Brick"), color = { 150, 80, 60 }, top = { 50, 40, 32 }, topMaterial = "Wood", material = "Brick" },
}
Upgrades.benchStyles = {
	{ id = "steel", name = N("Endüstriyel Gri", "Industrial Grey"), color = { 70, 74, 82 }, legs = { 40, 42, 46 }, drawers = { 200, 40, 40 } },
	{ id = "wood", name = N("Masif Kayın", "Solid Beech"), color = { 200, 160, 110 }, legs = { 60, 60, 64 }, drawers = { 70, 90, 120 }, material = "Wood" },
	{ id = "white", name = N("Laboratuvar Beyazı", "Lab White"), color = { 236, 236, 232 }, legs = { 150, 150, 156 }, drawers = { 40, 120, 200 } },
	{ id = "black", name = N("Siyah ESD", "Black ESD"), color = { 34, 34, 38 }, legs = { 20, 20, 22 }, drawers = { 240, 140, 30 } },
	{ id = "blue", name = N("Atölye Mavisi", "Workshop Blue"), color = { 40, 80, 150 }, legs = { 30, 32, 36 }, drawers = { 220, 220, 220 } },
	{ id = "green", name = N("Askeri Yeşil", "Olive Green"), color = { 80, 96, 60 }, legs = { 40, 44, 34 }, drawers = { 150, 120, 70 } },
}
Upgrades.awningStyles = {
	{ id = "stripes", name = N("Çizgili (renk + beyaz)", "Striped (colour + white)") },
	{ id = "solid", name = N("Düz Renk", "Solid Colour"), b = "accent" },
	{ id = "redwhite", name = N("Kırmızı-Beyaz", "Red and White"), a = { 200, 40, 40 }, b = { 245, 243, 236 } },
	{ id = "greenwhite", name = N("Yeşil-Beyaz", "Green and White"), a = { 40, 130, 70 }, b = { 245, 243, 236 } },
	{ id = "navycream", name = N("Lacivert-Krem", "Navy and Cream"), a = { 30, 44, 80 }, b = { 240, 228, 200 } },
	{ id = "black", name = N("Siyah", "Black"), a = { 30, 30, 34 }, b = { 30, 30, 34 } },
	{ id = "orange", name = N("Turuncu-Beyaz", "Orange and White"), a = { 240, 130, 30 }, b = { 245, 243, 236 } },
	{ id = "canvas", name = N("Kanvas Bej", "Beige Canvas"), a = { 210, 190, 150 }, b = { 190, 168, 126 } },
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
