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

	-- Hata ayıklama: Studio'da her şeyi açık başlat
	StudioDebugMoney = false,
}

return Config
