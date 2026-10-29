-- Oyun ayarları. Dengeyi değiştirmek için bu dosyadaki sayıları düzenleyin.
-- (Game tuning. Change the numbers below to rebalance the game.)

local Config = {
	Version = "1.0.0",
	GameName = "PC Tamircisi Simülatörü",

	-- Para birimi sembolü (ör. "$", "₺", "€")
	CurrencySymbol = "$",

	-- Kayıt (DataStore) — adı değiştirirseniz herkes sıfırdan başlar
	DataStoreName = "PCTamirci_Save_v1",
	AutosaveSeconds = 90,

	-- Başlangıç
	StartMoney = 1500,
	StartTools = { "hand", "screwdriver_ph2", "esd_strap", "air_can", "isopropyl", "paste_syringe" },
	StartInventory = { paste_arctic_mx4 = 3, zip_ties = 20 },

	-- Şehir
	WorldSeed = 20261028,
	PlotCount = 66,

	-- Gün / gece: bir oyun günü kaç gerçek dakika sürer; gece daha hızlı geçer
	DayLengthMinutes = 22,
	NightSpeed = 2.2,
	NightStart = 19.5,
	NightEnd = 6.0,

	-- Müşteriler
	CustomerSpawnBase = 28, -- saniye (dükkân seviyesi ve itibarla kısalır)
	CustomerSpawnMin = 9,
	CustomerPatienceMinutes = { 4, 11 }, -- gerçek dakika
	MaxCustomersPerServer = 140,
	ReviewHistory = 40,

	-- Pazarlık
	MaxHaggleRounds = 3,

	-- Hırsızlar
	ThiefIntervalDay = { 150, 260 },
	ThiefIntervalNight = { 55, 120 },
	ThiefStealSeconds = 4,
	ThiefMaxStealFraction = 0.06,
	ThiefMaxStealCap = 2500,
	ThiefBountyBase = 120,

	-- Çalışanlar maaşı oyun günü bitince öder
	OfflineEarningsMaxHours = 8,

	-- Araçlar
	TaxiBaseFare = 25,
	TaxiPerStud = 0.06,
	ShopTeleportCooldown = 45,

	-- Seviye eğrisi: bir sonraki seviye için gereken XP = XpBase * seviye ^ XpExponent
	XpBase = 120,
	XpExponent = 1.45,
	MaxLevel = 100,

	-- Tamir
	PasteIdealRange = { 0.42, 0.62 }, -- macun miktarı (0-1) için ideal aralık
	EsdDamageChance = 0.12, -- bileklik takılı değilken hassas parçaya dokunma başına
	HoldActionSeconds = {
		unscrew = 0.5,
		screw = 0.45,
		clean_paste = 1.6,
		apply_paste = 0, -- basılı tutma süresi oyuncuya bağlı
		blow_dust = 0.9,
		desolder = 2.2,
		solder = 1.8,
		straighten_pins = 1.2,
		peel = 0.8,
		pry = 1.0,
		brush = 1.2,
	},
	SoftwareSeconds = {
		memtest = 6,
		smart = 4,
		antivirus = 7,
		os_install = 9,
		bios_update = 6,
		stress = 8,
		post = 3,
	},

	-- Ekonomi çarpanları
	LaborBase = 35,
	PartMarkupFair = 1.2, -- "adil" fiyatın parça çarpanı
	UsedSellRate = 0.42, -- 2. ele satarken yeni fiyatın oranı (durumla çarpılır)
	DailyPriceSwing = 0.12,

	-- Sesler: "rbxassetid://123" biçiminde. Hazır gelenler Roblox'un lisanslı kütüphanesinden
	-- (Pro Sound Effects, APM Music, Roblox) — her deneyimde ücretsiz kullanılabilir. Değiştirmek
	-- için Creator Store > Audio'dan kimlik kopyalayın; boş bırakılan ses çalınmaz.
	Sounds = {
		-- ortam sesleri; volume: kısık kayıtları dengeler (ölçülen ses düzeyine göre)
		AmbienceDay = { id = "rbxassetid://9112831284", volume = 3 }, -- gündüz: kuş cıvıltısı (Morning Birds 1)
		AmbienceNight = { id = "rbxassetid://9112764573", volume = 6 }, -- gece: cırcır böcekleri (Crickets Night 3)
		Rain = { id = "rbxassetid://9112794265", volume = 1.6 }, -- dışarıda yağmur (Heavy Rain 1, beton üstüne)
		RainIndoor = { id = "rbxassetid://9112853554", volume = 8 }, -- içeride: çatıya vuran yağmur (Rain Hitting Roof 1)
		Sea = { id = "rbxassetid://9119677305", volume = 0.8 }, -- sahilde dalgalar (Surf Ocean Wave, Zuma Beach)
		-- rahatlatıcı arka plan müziği: liste karışık sırayla, kesintisiz çalar (APM Music)
		Music = {
			"rbxassetid://9047104336", -- Sunday In Bed
			"rbxassetid://9047104411", -- Beach Cushions
			"rbxassetid://9047104571", -- Home Town Easy
			"rbxassetid://9047104650", -- Decompression
			"rbxassetid://9047104919", -- Time Goes By
			"rbxassetid://9047105000", -- I'll Show Ya
			"rbxassetid://9047105308", -- Dusk To Dawn
			"rbxassetid://9047105108", -- Moving Round The Block
			"rbxassetid://9047105702", -- Light Dreamer
			"rbxassetid://9046862941", -- Sunset Chill (Bed Version)
			"rbxassetid://9046863253", -- Poolside
		},
		Click = "rbxasset://sounds/clickfast.wav",
		Cash = "rbxasset://sounds/electronicpingshort.wav",
		-- tezgâhtaki işlerin sesleri (eylem adına göre); tornavida, hava, fırça ve temizlik
		-- basılı tutulurken döngüde çalar, diğerleri iş bitince bir kez
		Bench = {
			unscrew = { id = "rbxassetid://9118855069", volume = 6 }, -- Screwdriver 2
			screw = { id = "rbxassetid://9118855273", volume = 5 }, -- Screwdriver 3
			blow_dust = { id = "rbxassetid://9113865022", volume = 0.6 }, -- Compressed Air Bursts 3
			brush = { id = "rbxassetid://9113595595", volume = 0.45 }, -- Brush Scrub Rubbing On Wood 14
			clean_paste = { id = "rbxassetid://9116198866", volume = 5 }, -- bez sürtme (Fast Swipes On Trousers 2)
			clean_liquid = { id = "rbxassetid://9116198866", volume = 5 },
			peel = { id = "rbxassetid://9113836369", volume = 1.2 }, -- bant sökme (Cloth Rip Zippy 5)
			pry = "rbxasset://sounds/snap.wav", -- plastik klips açılır
			install = "rbxasset://sounds/switch.wav",
			plug = "rbxasset://sounds/switch.wav",
			remove = "rbxasset://sounds/snap.wav",
			unplug = "rbxasset://sounds/snap.wav",
			open_latch = { id = "rbxassetid://16480551554", volume = 0.9 }, -- küçük metal klik (Roblox)
			close_latch = { id = "rbxassetid://16480551554", volume = 0.9 },
			wear_strap = "rbxasset://sounds/snap.wav",
			discard = "rbxasset://sounds/swoosh.wav",
			measure = { id = "rbxassetid://9113880400", volume = 1.2 }, -- multimetre bip (Computer Keyboard Beep 1)
			press_power = "rbxassetid://16480556621", -- güç düğmesi (Roblox plastik düğme)
			beep = { id = "rbxassetid://9113880400", volume = 1.2 }, -- anakart hoparlörü: POST bip kodları
		},
	},

	-- Hata ayıklama: Studio'da her şeyi açık başlat
	StudioDebugMoney = false,
}

return Config
