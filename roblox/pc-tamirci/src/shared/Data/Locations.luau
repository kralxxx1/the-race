-- Locations: named places on the map. CityLayout decides where each one goes;
-- `service` marks places with gameplay (opened through a ProximityPrompt and a UI).

local Locations = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

Locations.categories = {
	shop = { name = N("Parça & Alet", "Parts & Tools"), color = { 0, 170, 220 } },
	market = { name = N("Pazar & Hurda", "Markets & Scrap"), color = { 240, 160, 40 } },
	vehicle = { name = N("Araç Galerileri", "Vehicle Dealers"), color = { 220, 70, 70 } },
	business = { name = N("İş & Hizmet", "Business & Services"), color = { 150, 110, 230 } },
	food = { name = N("Yeme & İçme", "Food & Drink"), color = { 250, 120, 140 } },
	leisure = { name = N("Eğlence", "Leisure"), color = { 90, 200, 120 } },
	civic = { name = N("Kamu", "Civic"), color = { 120, 150, 200 } },
	landmark = { name = N("Simge Yapılar", "Landmarks"), color = { 255, 215, 90 } },
	nature = { name = N("Doğa", "Nature"), color = { 80, 170, 90 } },
}

Locations.list = {
	-- Gameplay places
	{ id = "megastore", cat = "shop", icon = "🏬", service = "parts", name = N("Mega Parça Deposu", "Mega Parts Depot"), desc = N("Tüm yeni parçalar, günlük kampanyalar.", "Every new part, daily deals.") },
	{ id = "bazaar_parts", cat = "shop", icon = "🔌", service = "parts_bazaar", name = N("Çarşı Parçacısı", "Bazaar Parts Stall"), desc = N("Eski nesil parçalar, pazarlıkla ucuz.", "Older-generation parts, cheaper with haggling.") },
	{ id = "toolshop", cat = "shop", icon = "🧰", service = "tools", name = N("Usta Alet-Edevat", "Master Tools & Hardware"), desc = N("Tornavida, havya, multimetre ve tüm tamir aletleri.", "Screwdrivers, soldering, multimeters and every repair tool.") },
	{ id = "used_market", cat = "market", icon = "♻️", service = "used", name = N("2. El Pazarı", "Second-hand Market"), desc = N("İkinci el parça al-sat. Gizli arıza riskine dikkat!", "Buy and sell used parts. Beware of hidden faults!") },
	{ id = "flea_market", cat = "market", icon = "🧺", service = "used", name = N("Bit Pazarı", "Flea Market"), desc = N("Tezgâhlarda ucuz, şansa kalmış parçalar.", "Cheap, luck-of-the-draw parts on stalls.") },
	{ id = "scrapyard", cat = "market", icon = "🏗️", service = "scrap", name = N("Hurdalık", "Scrapyard"), desc = N("Hurda kasa al, parçalarını sök, sat.", "Buy junk PCs, strip them, sell the parts.") },
	{ id = "car_dealer", cat = "vehicle", icon = "🚗", service = "cars", name = N("Oto Galeri", "Car Dealership"), desc = N("Klasik Şahin'den süper spora.", "From the classic Şahin to supercars.") },
	{ id = "bike_dealer", cat = "vehicle", icon = "🏍️", service = "bikes", name = N("Motor Bayi", "Motorcycle Dealer"), desc = N("Kurye motorundan yarış motoruna.", "From courier mopeds to race bikes.") },
	{ id = "bicycle_shop", cat = "vehicle", icon = "🚲", service = "bicycles", name = N("Bisiklet & Scooter", "Bikes & Scooters"), desc = N("İlk aracın burada.", "Your first ride is here.") },
	{ id = "staff_agency", cat = "business", icon = "🧑‍💼", service = "staff", name = N("Personel Ajansı", "Staff Agency"), desc = N("Teknisyen, müdür, güvenlik işe al.", "Hire technicians, managers and guards.") },
	{ id = "realty", cat = "business", icon = "🔑", service = "realty", name = N("Emlak Ofisi", "Estate Agent"), desc = N("Boş dükkânları gör, taşın.", "See free shops and relocate.") },
	{ id = "internet_cafe", cat = "business", icon = "🎮", service = "contracts", name = N("Pixel İnternet Kafe", "Pixel Internet Café"), desc = N("Toplu bakım sözleşmeleri.", "Bulk maintenance contracts.") },
	{ id = "datacenter", cat = "business", icon = "🗄️", service = "contracts", name = N("Bulut Veri Merkezi", "Cloud Data Centre"), desc = N("Büyük kurumsal işler.", "Big corporate jobs.") },
	{ id = "police", cat = "civic", icon = "🚓", service = "police", name = N("Polis Merkezi", "Police Station"), desc = N("Yakalanan hırsızların ödülü burada.", "Bounties for caught thieves.") },
	{ id = "cityhall", cat = "civic", icon = "🏛️", service = "board", name = N("Belediye Binası", "City Hall"), desc = N("Lider tablosu ve günlük görevler.", "Leaderboards and daily tasks.") },
	{ id = "bank", cat = "civic", icon = "🏦", name = N("Şehir Bankası", "City Bank"), desc = N("ATM ve kasalar.", "ATMs and vaults.") },
	{ id = "post", cat = "civic", icon = "📮", name = N("PTT Postane", "Post Office"), desc = N("Kargo ve mektuplar.", "Parcels and letters.") },
	{ id = "hospital", cat = "civic", icon = "🏥", name = N("Şehir Hastanesi", "City Hospital"), desc = N("Helikopter pistiyle.", "With a helipad.") },
	{ id = "fire_station", cat = "civic", icon = "🚒", name = N("İtfaiye", "Fire Station"), desc = N("Kırmızı kamyonlar.", "Red trucks.") },
	{ id = "school", cat = "civic", icon = "🏫", name = N("Atatürk İlkokulu", "Primary School"), desc = N("Bahçesinde basketbol potası.", "Basketball hoop in the yard.") },
	{ id = "university", cat = "civic", icon = "🎓", name = N("Teknik Üniversite", "Technical University"), desc = N("Kampüs, kütüphane, yurtlar.", "Campus, library, dorms.") },
	{ id = "library", cat = "civic", icon = "📚", name = N("Kampüs Kütüphanesi", "Campus Library"), desc = N("Sessiz çalışma salonu.", "Quiet study hall.") },
	{ id = "gas_north", cat = "business", icon = "⛽", name = N("Akaryakıt İstasyonu", "Fuel Station"), desc = N("Market ve oto yıkama.", "Shop and car wash.") },
	{ id = "gas_west", cat = "business", icon = "⛽", name = N("Sanayi Akaryakıt", "Industrial Fuel Station"), desc = N("Kamyon pompaları.", "Truck pumps.") },
	{ id = "cargo", cat = "business", icon = "📦", name = N("Kargo Deposu", "Cargo Depot"), desc = N("Parça siparişleri buradan çıkar.", "Part orders ship from here.") },
	{ id = "mall", cat = "business", icon = "🛍️", name = N("Elektronik AVM", "Electronics Mall"), desc = N("Telefon, oyun ve elektronik mağazaları.", "Phone, game and electronics stores.") },
	-- Food and drink
	{ id = "cafe_plaza", cat = "food", icon = "☕", name = N("Meydan Kafe", "Plaza Café"), desc = N("Meydana bakan teras.", "Terrace over the plaza.") },
	{ id = "teahouse", cat = "food", icon = "🫖", name = N("Kahvehane", "Tea House"), desc = N("Tavla, okey ve demli çay.", "Backgammon, okey and strong tea.") },
	{ id = "bakery", cat = "food", icon = "🥖", name = N("Taş Fırın", "Stone Bakery"), desc = N("Sıcak simit ve pide.", "Warm simit and pide.") },
	{ id = "kebab", cat = "food", icon = "🥙", name = N("Dönerci Usta", "Döner House"), desc = N("Gece yarısı kurtarıcısı.", "The midnight saviour.") },
	{ id = "fish", cat = "food", icon = "🐟", name = N("Balıkçı Barınağı", "Fisherman's Wharf"), desc = N("Deniz manzaralı balık restoranı.", "Seafood with a sea view.") },
	{ id = "icecream", cat = "food", icon = "🍦", name = N("Maraş Dondurmacısı", "Ice Cream Parlour"), desc = N("Uzayan dondurma.", "Stretchy ice cream.") },
	{ id = "pizzeria", cat = "food", icon = "🍕", name = N("Napoli Pizza", "Napoli Pizza"), desc = N("Odun ateşinde pizza.", "Wood-fired pizza.") },
	{ id = "market_hall", cat = "food", icon = "🍅", name = N("Semt Pazarı", "Market Hall"), desc = N("Manav, kasap, peynirci.", "Greengrocer, butcher, cheesemonger.") },
	-- Leisure
	{ id = "lunapark", cat = "leisure", icon = "🎡", name = N("Lunapark", "Funfair"), desc = N("Dönme dolap ve atlıkarınca.", "Ferris wheel and carousel.") },
	{ id = "stadium", cat = "leisure", icon = "🏟️", name = N("Şehir Stadyumu", "City Stadium"), desc = N("Cumartesi maçları.", "Saturday matches.") },
	{ id = "cinema", cat = "leisure", icon = "🎬", name = N("Yıldız Sineması", "Star Cinema"), desc = N("Vizyondaki filmler.", "Now showing.") },
	{ id = "gym", cat = "leisure", icon = "🏋️", name = N("Demir Spor Salonu", "Iron Gym"), desc = N("Ağırlık ve kardiyo.", "Weights and cardio.") },
	{ id = "arena", cat = "leisure", icon = "🕹️", name = N("E-Spor Arenası", "Esports Arena"), desc = N("Turnuvalar ve LAN partileri.", "Tournaments and LAN parties.") },
	{ id = "hotel", cat = "leisure", icon = "🏨", name = N("Grand Sahil Oteli", "Grand Seaside Hotel"), desc = N("Denize sıfır.", "Right on the sea.") },
	{ id = "marina", cat = "leisure", icon = "⛵", name = N("Yat Limanı", "Marina"), desc = N("Yatlar ve yelkenliler.", "Yachts and sailboats.") },
	{ id = "beach", cat = "nature", icon = "🏖️", name = N("Altın Kum Plajı", "Golden Sand Beach"), desc = N("Şemsiyeler, şezlonglar, voleybol.", "Umbrellas, loungers, volleyball.") },
	-- Landmarks and nature
	{ id = "plaza", cat = "landmark", icon = "⛲", name = N("Cumhuriyet Meydanı", "Republic Square"), desc = N("Fıskiye ve saat kulesi; şehrin kalbi.", "Fountain and clock tower; the city's heart.") },
	{ id = "clocktower", cat = "landmark", icon = "🕰️", name = N("Saat Kulesi", "Clock Tower"), desc = N("Oyun saatini gösterir.", "Shows the in-game time.") },
	{ id = "lighthouse", cat = "landmark", icon = "🗼", name = N("Deniz Feneri", "Lighthouse"), desc = N("Geceleri ışığı döner.", "Its light sweeps at night.") },
	{ id = "pier", cat = "landmark", icon = "⚓", name = N("Tarihi İskele", "Old Pier"), desc = N("Vapur iskelesi ve balıkçılar.", "Ferry pier and anglers.") },
	{ id = "harbor", cat = "landmark", icon = "🚢", name = N("Konteyner Limanı", "Container Port"), desc = N("Vinçler ve gemiler.", "Cranes and ships.") },
	{ id = "old_han", cat = "landmark", icon = "🕌", name = N("Tarihi Han", "Historic Caravanserai"), desc = N("Avlulu taş han.", "Stone inn with a courtyard.") },
	{ id = "covered_bazaar", cat = "landmark", icon = "🏮", name = N("Kapalı Çarşı", "Covered Bazaar"), desc = N("Kubbeli eski çarşı.", "The domed old bazaar.") },
	{ id = "park", cat = "nature", icon = "🌳", name = N("Göl Park", "Lake Park"), desc = N("Göl, köprü, çardak ve ördekler.", "Lake, bridge, gazebo and ducks.") },
	{ id = "viewpoint", cat = "nature", icon = "🔭", name = N("Seyir Tepesi", "Viewpoint Hill"), desc = N("Şehrin en güzel manzarası.", "The best view of the city.") },
	{ id = "windfarm", cat = "nature", icon = "🌬️", name = N("Rüzgâr Tarlası", "Wind Farm"), desc = N("Dönen dev türbinler.", "Giant spinning turbines.") },
	{ id = "camp", cat = "nature", icon = "🏕️", name = N("Kamp Alanı", "Campsite"), desc = N("Çadırlar ve kamp ateşi.", "Tents and a campfire.") },
	{ id = "radio_tower", cat = "nature", icon = "📡", name = N("Radyo Kulesi", "Radio Tower"), desc = N("Tepedeki kırmızı ışıklı kule.", "The hilltop tower with red lights.") },
	{ id = "farm", cat = "nature", icon = "🚜", name = N("Çiftlik", "Farm"), desc = N("Tarlalar ve ahır.", "Fields and a barn.") },
	{ id = "industrial", cat = "business", icon = "🏭", name = N("Sanayi Sitesi", "Industrial Estate"), desc = N("Atölyeler ve fabrikalar.", "Workshops and factories.") },
}

Locations.byId = {}
for _, l in Locations.list do
	Locations.byId[l.id] = l
end

function Locations.get(id: string)
	return Locations.byId[id]
end

return Locations
