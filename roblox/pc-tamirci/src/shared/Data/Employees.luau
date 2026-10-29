-- Employees: the people you can hire. 22 roles in four groups (the workshop, the front of the shop,
-- the office and security), 50 traits (one on the CV, a second that only shows at the interview),
-- schooling, years of experience, home towns, and six places to look for staff, from the state
-- employment office to a headhunter. CVs can promise more than the person can do; the interview
-- tells. Hired staff gain experience and stars, and have a morale that pay, raises, tea and a
-- comfortable shop keep up; with none left they quit.
--
-- Role fields: group, icon, wage (a day, for a 3-star hand), max (per shop), minShop (shop level),
-- look (avatar outfit), spot (where they stand in the shop; nil = works from outside), bench (repairs
-- jobs at a bench), speed / learn (multipliers), focus (the jobs they're best at: kind or diags) with
-- focusSpeed / focusSuccess, maxDifficulty (the hardest job they'll take), fx (what they add to the
-- shop; scaled by stars, see Employees.effect).
--
-- Team effects (fx and trait fields summed over the staff): comfort, tips, customers, rep (a day),
-- till (share of the register a thief can't take), sales / salesPrice (showcase), contracts (pay),
-- storage, teamSpeed, catchMistake (best one counts), discount (parts the manager orders),
-- support (remote-support income a day), teamMorale (a day).

local Rand = require(script.Parent.Parent.Util.Rand)
local Customers = require(script.Parent.Customers)
local Faults = require(script.Parent.Faults)
local Avatars = require(script.Parent.Avatars)

local Employees = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

Employees.groups = {
	{ id = "workshop", icon = "🔧", name = N("Atölye", "Workshop") },
	{ id = "front", icon = "🛎️", name = N("Ön Büro", "Front of Shop") },
	{ id = "office", icon = "🗂️", name = N("Ofis", "Office") },
	{ id = "security", icon = "🛡️", name = N("Güvenlik", "Security") },
}

local BOARD = { mobo = true, caps = true, pins = true, cpu = true, bios = true, cmos = true, dcjack = true, liquid = true }
local DATA = { storage = true, os = true, virus = true }
local BUILDS = { upgrade = true }

Employees.roles = {
	-- the workshop
	technician = {
		group = "workshop", icon = "🧑‍🔧", wage = 120, max = 8, minShop = 1, look = "technician", bench = true,
		name = N("Teknisyen", "Technician"),
		desc = N("Boş bir tezgâhta sıradaki işi kendisi onarır. Parçaları envanterden kullanır.", "Repairs queued jobs at a free bench using parts from your inventory."),
	},
	apprentice = {
		group = "workshop", icon = "🧑‍🎓", wage = 55, max = 3, minShop = 1, look = "technician", bench = true, speed = 0.7, learn = 2.5, maxDifficulty = 2,
		name = N("Çırak", "Apprentice"),
		desc = N("Ucuzdur, kolay işleri yavaş yapar ama çabuk öğrenir. Ustabaşının yanında iki kat hızlı ustalaşır.", "Cheap; slow on the easy jobs but learns fast, twice as fast next to a foreman."),
	},
	foreman = {
		group = "workshop", icon = "🧔", wage = 240, max = 1, minShop = 3, look = "technician", bench = true, spot = "qa", speed = 1.1,
		fx = { teamSpeed = 0.08, catchMistake = 0.5 },
		name = N("Ustabaşı", "Foreman"),
		desc = N("Kendisi de onarır; atölyeyi hızlandırır, teslimden önce hataları yakalar, çırakları yetiştirir.", "Repairs too; speeds up the workshop, catches mistakes before delivery and trains apprentices."),
	},
	laptop_tech = {
		group = "workshop", icon = "💻", wage = 140, max = 3, minShop = 2, look = "technician", bench = true,
		focus = { kind = "laptop" }, focusSpeed = 1.5, focusSuccess = 0.08,
		name = N("Laptop Teknisyeni", "Laptop Technician"),
		desc = N("Önce dizüstüleri alır: ekran, menteşe, klavye, batarya işlerinde çok hızlıdır.", "Takes the laptops first: very quick with screens, hinges, keyboards and batteries."),
	},
	board_tech = {
		group = "workshop", icon = "🔬", wage = 190, max = 2, minShop = 3, look = "technician", bench = true,
		focus = { diags = BOARD }, focusSpeed = 1.6, focusSuccess = 0.1,
		name = N("Kart Tamir Uzmanı", "Board Repair Specialist"),
		desc = N("Mikro lehim ustası: anakart, kondansatör, soket pini ve BIOS arızalarına koşar.", "Micro-soldering expert: goes for motherboards, capacitors, socket pins and BIOS faults."),
	},
	data_recovery = {
		group = "workshop", icon = "💾", wage = 170, max = 2, minShop = 3, look = "developer", bench = true,
		focus = { diags = DATA }, focusSpeed = 1.6, focusSuccess = 0.08,
		name = N("Veri Kurtarma Uzmanı", "Data Recovery Specialist"),
		desc = N("Disk, işletim sistemi ve virüs işlerini önce alır; verileri kaybetmeden kurtarır.", "Takes the drive, OS and malware jobs first and gets the data back intact."),
	},
	builder = {
		group = "workshop", icon = "🧩", wage = 130, max = 3, minShop = 2, look = "technician", bench = true,
		focus = { diags = BUILDS }, focusSpeed = 1.6, focusSuccess = 0.06,
		name = N("Sistem Toplayıcı", "PC Builder"),
		desc = N("Sıfırdan sistem toplama, yükseltme ve bakım işlerinde atölyenin en hızlısı.", "The quickest hand in the workshop at new builds, upgrades and servicing."),
	},
	engineer = {
		group = "workshop", icon = "🧪", wage = 230, max = 1, minShop = 4, look = "developer", spot = "qa",
		fx = { catchMistake = 0.85, teamSpeed = 0.03 },
		name = N("Kalite Kontrol Mühendisi", "Quality Control Engineer"),
		desc = N("Teslimden önce her cihazı test eder; teknisyenlerin unuttuğu kabloyu, vidayı yakalar.", "Tests every device before it goes back and catches the cable or screw a technician forgot."),
	},
	-- the front of the shop
	receptionist = {
		group = "front", icon = "🧑‍💼", wage = 90, max = 1, minShop = 2, look = "receptionist", spot = "counter",
		fx = { tips = 0.03 },
		name = N("Resepsiyonist", "Receptionist"),
		desc = N("Sen meşgulken müşteriyle konuşur, iş kabul eder ve teslim eder.", "Talks to customers, accepts and delivers jobs while you're busy."),
	},
	cashier = {
		group = "front", icon = "💵", wage = 85, max = 1, minShop = 2, look = "shopkeeper", spot = "register",
		fx = { till = 0.35, tips = 0.04 },
		name = N("Kasiyer", "Cashier"),
		desc = N("Kasanın başında durur: hırsız kasadan çok daha az alır, ödemeler hızlanır.", "Minds the till: a thief gets far less from the register and payments go smoothly."),
	},
	salesperson = {
		group = "front", icon = "🛍️", wage = 110, max = 2, minShop = 3, look = "business", spot = "sales",
		fx = { sales = 0.4, salesPrice = 0.06 },
		name = N("Satış Danışmanı", "Sales Consultant"),
		desc = N("Vitrindeki bilgisayarları müşterilere anlatır: daha çabuk ve daha iyi fiyata satılır.", "Talks customers through the showcase PCs: they sell sooner and for more."),
	},
	tea_maker = {
		group = "front", icon = "🫖", wage = 60, max = 1, minShop = 2, look = "shopkeeper", spot = "tea",
		fx = { comfort = 8, teamSpeed = 0.04, teamMorale = 2 },
		name = N("Çaycı", "Tea Maker"),
		desc = N("Müşterilere ve ekibe çay dağıtır: müşteri sabırlı, ekip mutlu ve biraz daha hızlı.", "Brings tea round to customers and staff: patient customers, a happier and quicker team."),
	},
	cleaner = {
		group = "front", icon = "🧹", wage = 70, max = 2, minShop = 2, look = "cleaner", spot = "clean",
		fx = { comfort = 6 },
		name = N("Temizlikçi", "Cleaner"),
		desc = N("Dükkânı temiz tutar; müşteriler daha mutlu olur.", "Keeps the shop clean; customers are happier."),
	},
	storekeeper = {
		group = "front", icon = "📦", wage = 95, max = 1, minShop = 3, look = "shopkeeper", spot = "shelf",
		fx = { storage = 0.3 },
		name = N("Depo Sorumlusu", "Storekeeper"),
		desc = N("Rafları düzenler (%30 daha fazla yer) ve biten macun, lehim teli, kablo bağını sabah kendisi alır.", "Keeps the shelves in order (30% more room) and restocks paste, solder and zip ties every morning."),
	},
	-- the office
	manager = {
		group = "office", icon = "👔", wage = 260, max = 1, minShop = 3, look = "manager", spot = "manager",
		fx = { teamSpeed = 0.1 },
		name = N("Müdür", "Manager"),
		desc = N("Eksik parçaları otomatik sipariş eder, çalışanları hızlandırır, sen yokken dükkânı işletir.", "Auto-orders missing parts, boosts staff and runs the shop while you're away."),
	},
	accountant = {
		group = "office", icon = "🧮", wage = 150, max = 1, minShop = 2, look = "business",
		name = N("Muhasebeci (Mali Müşavir)", "Accountant"),
		desc = N("Faturaları geldiği sabah öder, vergiyi %25 azaltır. Kendi bürosundan çalışır.", "Pays the bills the morning they arrive and cuts the tax by 25%. Works from their own office."),
	},
	marketer = {
		group = "office", icon = "📣", wage = 140, max = 1, minShop = 2, look = "influencer",
		fx = { customers = 0.2, rep = 1 },
		name = N("Sosyal Medya Uzmanı", "Social Media Marketer"),
		desc = N("Tamir videoları ve kampanyalarla dükkânı tanıtır: daha çok müşteri, her gün biraz itibar.", "Promotes the shop with repair videos and campaigns: more customers and a little reputation every day."),
	},
	support = {
		group = "office", icon = "🎧", wage = 120, max = 2, minShop = 2, look = "developer",
		fx = { support = 140 },
		name = N("Uzaktan Destek Uzmanı", "Remote Support Agent"),
		desc = N("Telefonla ve uzak masaüstüyle müşterilere yardım eder; her gün kendi maaşından fazlasını kazandırabilir.", "Helps clients over the phone and remote desktop; can earn more than their wage every day."),
	},
	network_tech = {
		group = "office", icon = "🌐", wage = 160, max = 1, minShop = 3, look = "developer",
		fx = { contracts = 0.2 },
		name = N("Ağ Teknisyeni", "Network Technician"),
		desc = N("Kurumsal sözleşmelerde %20 daha fazla kazandırır, dükkânın internetini ücretsiz kurar.", "Earns 20% more on business contracts and runs the shop's internet for free."),
	},
	courier = {
		group = "office", icon = "🛵", wage = 80, max = 1, minShop = 2, look = "casual",
		name = N("Kurye", "Courier"),
		desc = N("Telefondan sipariş ettiğin parçaları depodan getirir (%8 teslimat payı).", "Fetches the parts you order from the phone (8% delivery charge)."),
	},
	-- security
	security = {
		group = "security", icon = "💂", wage = 110, max = 2, minShop = 2, look = "guard", spot = "guard",
		name = N("Güvenlik Görevlisi", "Security Guard"),
		desc = N("Kapının yanında durur, hırsızları kovalar ve yakalar.", "Stands by the door, chases and catches thieves."),
	},
	night_guard = {
		group = "security", icon = "🔦", wage = 100, max = 1, minShop = 2, look = "guard", spot = "night", night = true,
		name = N("Gece Bekçisi", "Night Watchman"),
		desc = N("Geceleri dükkânın önünde nöbet tutar: hırsız çoğu zaman yaklaşmaz, yaklaşanı kovalar.", "Keeps watch outside at night: most burglars stay away and he chases the rest."),
	},
}
Employees.roleOrder = {
	"technician", "apprentice", "foreman", "laptop_tech", "board_tech", "data_recovery", "builder", "engineer",
	"receptionist", "cashier", "salesperson", "tea_maker", "cleaner", "storekeeper",
	"manager", "accountant", "marketer", "support", "network_tech", "courier",
	"security", "night_guard",
}
for _, id in Employees.roleOrder do
	Employees.roles[id].id = id
end

-- How often each role turns up among the candidates.
local ROLE_WEIGHT = {
	technician = 6, apprentice = 3, foreman = 1, laptop_tech = 2, board_tech = 1, data_recovery = 1, builder = 2, engineer = 1,
	receptionist = 2, cashier = 2, salesperson = 2, tea_maker = 1.5, cleaner = 2, storekeeper = 1.5,
	manager = 1, accountant = 1.5, marketer = 1.5, support = 1.5, network_tech = 1, courier = 1.5,
	security = 2, night_guard = 1.5,
}

-- speed / success: work at the bench; catch: chasing thieves; learn: experience; morale: a day;
-- the rest add to the shop (see the header). say: what they tell you at the interview.
Employees.traits = {
	{ id = "fast", name = N("Hızlı", "Fast"), speed = 0.2, wage = 0.1, say = N("İşimi hızlı yaparım, beklemeyi sevmem.", "I work fast; I don't like keeping people waiting.") },
	{ id = "careful", name = N("Dikkatli", "Careful"), success = 0.12, wage = 0.08, say = N("Her vidayı iki kere kontrol ederim.", "I check every screw twice.") },
	{ id = "tea", name = N("Çaycı Ruhlu", "Tea Lover"), comfort = 6, say = N("Gelen müşteriye bir çay ikram etmeden olmaz.", "Every customer gets a glass of tea from me.") },
	{ id = "chatty", name = N("Konuşkan", "Chatty"), tips = 0.1, say = N("Müşteriyle sohbeti severim, bahşişi de severler bana.", "I love a chat with the customers, and they tip me for it.") },
	{ id = "lazy", name = N("Tembel", "Lazy"), speed = -0.25, wage = -0.2, bad = true, say = N("Acele işe şeytan karışır abi.", "No point rushing, mate.") },
	{ id = "night", name = N("Gece Kuşu", "Night Owl"), nightSpeed = 0.3, say = N("Gece daha iyi çalışırım.", "I do my best work at night.") },
	{ id = "strong", name = N("Kuvvetli", "Strong"), catch = 0.25, say = N("Kimse elimden kaçamaz.", "Nobody gets away from me.") },
	{ id = "veteran", name = N("Tecrübeli", "Veteran"), speed = 0.1, success = 0.1, wage = 0.3, say = N("Bu işin içinde yıllarımı geçirdim.", "I've spent years in this trade.") },
	{ id = "rookie", name = N("Acemi", "Rookie"), success = -0.12, wage = -0.25, learn = 0.3, bad = true, say = N("Daha yeniyim ama öğrenmeye hevesliyim.", "I'm new, but I'm keen to learn.") },
	{ id = "polyglot", name = N("Yabancı Dil Bilir", "Multilingual"), tips = 0.08, comfort = 2, say = N("İngilizce ve Almanca konuşurum, turistler bayılır.", "I speak English and German; tourists love it.") },
	{ id = "tidy", name = N("Titiz", "Tidy"), comfort = 4, success = 0.04, say = N("Masam hep tertemizdir.", "My desk is always spotless.") },
	{ id = "clumsy", name = N("Sakar", "Clumsy"), success = -0.08, speed = 0.05, wage = -0.15, bad = true, say = N("Geçen ay bir tornavida düşürdüm ama kimse ölmedi.", "I dropped a screwdriver last month, but nobody died.") },
	{ id = "punctual", name = N("Dakik", "Punctual"), speed = 0.05, morale = 0.5, say = N("Hayatımda hiç geç kalmadım.", "I've never been late in my life.") },
	{ id = "late", name = N("Hep Geç Kalan", "Always Late"), speed = -0.1, wage = -0.1, bad = true, say = N("Trafik işte... ama iş çıkarırım.", "Traffic, you know... but I get things done.") },
	{ id = "perfectionist", name = N("Mükemmeliyetçi", "Perfectionist"), success = 0.15, speed = -0.1, say = N("Yarım iş teslim etmem.", "I never hand over half a job.") },
	{ id = "hasty", name = N("Aceleci", "Hasty"), speed = 0.25, success = -0.1, bad = true, say = N("Hızlıyımdır, bazen biraz fazla.", "I'm quick, sometimes a bit too quick.") },
	{ id = "friendly", name = N("Güler Yüzlü", "Friendly"), tips = 0.08, comfort = 3, say = N("Müşteriyi gülümsemeden göndermem.", "No customer leaves without a smile.") },
	{ id = "grumpy", name = N("Asık Suratlı", "Grumpy"), tips = -0.08, comfort = -3, wage = -0.1, bad = true, say = N("Ben işimi yaparım, sohbet sevmem.", "I do my job; I don't do small talk.") },
	{ id = "honest", name = N("Dürüst", "Honest"), till = 0.05, morale = 0.5, say = N("Kuruşun hesabını veririm.", "I account for every penny.") },
	{ id = "sticky", name = N("Eli Uzun", "Light-Fingered"), wage = -0.1, bad = true, hidden = true, say = N("(Gözlerini kaçırıyor...) Raflarınız çok güzelmiş.", "(Avoids your eyes...) Nice shelves you've got.") },
	{ id = "ambitious", name = N("Hırslı", "Ambitious"), learn = 0.5, morale = -0.5, say = N("Beş yıl sonra kendimi usta olarak görüyorum.", "In five years I see myself as a master.") },
	{ id = "loyal", name = N("Sadık", "Loyal"), morale = 1, loyal = true, say = N("Bir yere girdim mi yıllarca çalışırım.", "Once I join a place, I stay for years.") },
	{ id = "moody", name = N("Huysuz", "Moody"), moody = true, bad = true, say = N("Bazı günler pek konuşmam, kusura bakmayın.", "Some days I don't talk much, sorry.") },
	{ id = "gamer", name = N("Oyuncu", "Gamer"), speed = 0.05, tips = 0.03, say = N("Oyun bilgisayarlarını ezbere bilirim.", "I know gaming rigs by heart.") },
	{ id = "overclocker", name = N("Overclock Meraklısı", "Overclocker"), focus = BUILDS, focusSpeed = 0.25, say = N("Her sistemi sınırına kadar zorlarım.", "I push every system to its limit.") },
	{ id = "solderer", name = N("Lehim Ustası", "Soldering Pro"), focus = BOARD, focusSpeed = 0.3, say = N("0402 kondansatörü elle değiştiririm.", "I swap 0402 capacitors by hand.") },
	{ id = "linux", name = N("Linux Gurusu", "Linux Guru"), focus = DATA, focusSpeed = 0.3, say = N("Komut satırı benim evim.", "The command line is my home.") },
	{ id = "macfan", name = N("Laptop Meraklısı", "Laptop Geek"), focusKind = "laptop", focusSpeed = 0.2, say = N("İnce kasaları açmak benim işim.", "Opening slim laptops is my thing.") },
	{ id = "sales_talent", name = N("Satış Yeteneği", "Born Seller"), sales = 0.15, tips = 0.04, say = N("Kuma kum satarım.", "I could sell sand in the desert.") },
	{ id = "negotiator", name = N("Pazarlıkçı", "Haggler"), discount = 0.08, say = N("Toptancıyla pazarlıkta üstüme yoktur.", "Nobody haggles with suppliers like me.") },
	{ id = "organized", name = N("Düzenli", "Organised"), storage = 0.08, comfort = 2, say = N("Her parçanın etiketi olur bende.", "Every part gets a label with me.") },
	{ id = "forgetful", name = N("Unutkan", "Forgetful"), success = -0.06, bad = true, say = N("Neydi sorunuz? Ha, evet...", "What was the question? Oh, right...") },
	{ id = "tea_addict", name = N("Çay Tiryakisi", "Tea Addict"), speed = -0.05, morale = 1, say = N("Günde yirmi bardak çay içerim.", "I drink twenty glasses of tea a day.") },
	{ id = "phone_addict", name = N("Telefon Bağımlısı", "Phone Addict"), speed = -0.12, bad = true, say = N("(Telefonuna bakıyor) Pardon, devam edin.", "(Checks phone) Sorry, go on.") },
	{ id = "quick_learner", name = N("Çabuk Öğrenen", "Quick Learner"), learn = 1, say = N("Bir kere göstermeniz yeter.", "Show me once and I've got it.") },
	{ id = "stubborn", name = N("İnatçı", "Stubborn"), learn = -0.4, success = 0.04, say = N("Ben bildiğim yoldan şaşmam.", "I stick to the way I know.") },
	{ id = "calm", name = N("Sakin", "Calm"), comfort = 2, morale = 0.5, say = N("Kızgın müşteri beni germez.", "Angry customers don't rattle me.") },
	{ id = "brave", name = N("Cesur", "Brave"), catch = 0.2, say = N("Hırsızın üstüne ilk ben atlarım.", "I'm the first to jump on a thief.") },
	{ id = "coward", name = N("Korkak", "Timid"), catch = -0.3, bad = true, say = N("Kavga gürültü işi bana göre değil.", "Fights and trouble aren't for me.") },
	{ id = "athletic", name = N("Sporcu", "Athletic"), catch = 0.15, speed = 0.05, say = N("Her sabah beş kilometre koşarım.", "I run five kilometres every morning.") },
	{ id = "early_bird", name = N("Erkenci", "Early Bird"), speed = 0.06, say = N("Dükkânı ben açarım, siz gelmeden.", "I'll open up before you get here.") },
	{ id = "funny", name = N("Esprili", "Funny"), comfort = 3, teamMorale = 1, say = N("Ekibi güldürmeden gün bitmez.", "No day ends without a laugh from the team.") },
	{ id = "versatile", name = N("Çok Yönlü", "Versatile"), speed = 0.08, say = N("Ne iş verirseniz yaparım.", "Give me any job, I'll do it.") },
	{ id = "certified", name = N("Sertifikalı", "Certified"), success = 0.08, wage = 0.12, say = N("Üretici sertifikalarım var.", "I hold manufacturer certifications.") },
	{ id = "veteran_army", name = N("Askerliğini Yapmış", "Ex-Military"), catch = 0.15, morale = 0.5, say = N("Disiplin benim için her şeydir.", "Discipline is everything to me.") },
	{ id = "student", name = N("Öğrenci (Yarı Zamanlı)", "Student (Part-Time)"), wage = -0.3, speed = -0.1, learn = 0.4, say = N("Okuldan sonra çalışabilirim.", "I can work after classes.") },
	{ id = "family", name = N("Evli Barklı", "Family Person"), morale = 0.5, loyal = true, say = N("Evime ekmek götürmem lazım, işimi severim.", "I've a family to feed and I love my job.") },
	{ id = "eco", name = N("Çevreci", "Eco-Minded"), comfort = 1, say = N("Boşta yanan ışığı söndürürüm.", "I switch off every light nobody needs.") },
	{ id = "greedy", name = N("Paragöz", "Money-Minded"), wage = 0.15, morale = -1, bad = true, say = N("Maaş konuşalım önce.", "Let's talk salary first.") },
	{ id = "kind", name = N("Yardımsever", "Helpful"), teamMorale = 1, say = N("Ekipte kim zorlanırsa yardım ederim.", "Whoever is struggling on the team, I help.") },
}
Employees.traitById = {}
for _, t in Employees.traits do
	Employees.traitById[t.id] = t
end

-- years: of school after 18 (for the age); learn / success: at work; uni: a degree (careers day).
Employees.educations = {
	{ id = "primary", name = N("İlkokul", "Primary school"), years = -4, wage = 0.9, learn = 0.9 },
	{ id = "middle", name = N("Ortaokul", "Middle school"), years = -2, wage = 0.94, learn = 0.95 },
	{ id = "highschool", name = N("Lise", "High school"), years = 0, wage = 1, learn = 1 },
	{ id = "vocational", name = N("Meslek Lisesi (Bilişim)", "Vocational school (IT)"), years = 0, wage = 1.03, learn = 1.05, success = 0.03 },
	{ id = "associate", name = N("Ön Lisans (Bilgisayar Teknolojisi)", "Associate degree (Computer Tech)"), years = 2, wage = 1.07, learn = 1.1, success = 0.03, uni = true },
	{ id = "bachelor_ce", name = N("Lisans (Bilgisayar Mühendisliği)", "BSc Computer Engineering"), years = 4, wage = 1.18, learn = 1.2, success = 0.04, uni = true },
	{ id = "bachelor_ee", name = N("Lisans (Elektronik Mühendisliği)", "BSc Electronics Engineering"), years = 4, wage = 1.18, learn = 1.15, success = 0.05, uni = true },
	{ id = "bachelor_biz", name = N("Lisans (İşletme)", "BA Business"), years = 4, wage = 1.12, learn = 1.1, uni = true },
	{ id = "bachelor_acc", name = N("Lisans (Muhasebe ve Finans)", "BA Accounting and Finance"), years = 4, wage = 1.12, learn = 1.1, uni = true },
	{ id = "bachelor_comm", name = N("Lisans (İletişim)", "BA Communications"), years = 4, wage = 1.1, learn = 1.1, uni = true },
	{ id = "master", name = N("Yüksek Lisans", "Master's degree"), years = 6, wage = 1.3, learn = 1.25, success = 0.05, uni = true },
}
Employees.eduById = {}
for _, e in Employees.educations do
	Employees.eduById[e.id] = e
end

-- Which schooling each kind of job tends to come with.
local EDU_BY_GROUP = {
	workshop = { primary = 1, middle = 2, highschool = 2, vocational = 5, associate = 3, bachelor_ce = 1, bachelor_ee = 1 },
	front = { primary = 1, middle = 2, highschool = 5, vocational = 1, associate = 2, bachelor_biz = 1, bachelor_comm = 1 },
	office = { highschool = 1, associate = 2, bachelor_biz = 3, bachelor_acc = 1, bachelor_comm = 1, bachelor_ce = 2, master = 1 },
	security = { primary = 2, middle = 3, highschool = 4, associate = 1 },
}
local EDU_BY_ROLE = {
	apprentice = { primary = 2, middle = 4, highschool = 2, vocational = 3 },
	board_tech = { vocational = 3, associate = 3, bachelor_ee = 3 },
	engineer = { bachelor_ee = 3, bachelor_ce = 3, master = 2 },
	accountant = { associate = 1, bachelor_acc = 5, bachelor_biz = 2, master = 1 },
	marketer = { bachelor_comm = 4, bachelor_biz = 2, associate = 1, master = 1 },
	network_tech = { vocational = 2, associate = 3, bachelor_ce = 3 },
	support = { highschool = 1, vocational = 2, associate = 3, bachelor_ce = 2 },
	manager = { highschool = 1, associate = 2, bachelor_biz = 4, master = 1 },
	courier = { primary = 2, middle = 3, highschool = 4 },
}

Employees.towns = {
	"İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Konya", "Adana", "Gaziantep", "Kayseri", "Eskişehir",
	"Trabzon", "Samsun", "Diyarbakır", "Erzurum", "Mersin", "Malatya", "Sakarya", "Denizli", "Manisa", "Van",
	"Rize", "Sivas", "Hatay", "Kocaeli", "Tekirdağ", "Edirne", "Çanakkale", "Aydın", "Muğla", "Ordu",
	"Giresun", "Kastamonu", "Balıkesir", "Afyonkarahisar", "Elazığ", "Şanlıurfa", "Mardin", "Zonguldak", "Bolu", "Artvin",
}

-- Where you find people. fee: the hiring fee in days of wages; lie: how likely a CV oversells;
-- roles: who you meet there (nil = anyone); refresh: what a new list costs.
Employees.channels = {
	{
		id = "agency", icon = "🏢", fee = 2, count = 10, skill = { 1, 5 }, years = { 0, 15 }, lie = 0.2, refresh = 50, sure = { "technician", "technician" },
		name = N("Özel İstihdam Bürosu", "Recruitment Agency"),
		desc = N("Her meslekten aday. İşe alım ücreti iki günlük maaş.", "Candidates for every job. The fee is two days' wages."),
	},
	{
		id = "iskur", icon = "🏛️", fee = 0, count = 8, skill = { 1, 3 }, years = { 0, 6 }, lie = 0.1, refresh = 0, wageMul = 0.92,
		roles = { "technician", "apprentice", "receptionist", "cashier", "tea_maker", "cleaner", "storekeeper", "courier", "security", "night_guard", "builder" },
		name = N("İŞKUR", "State Employment Office"),
		desc = N("Devletin iş kurumu: ücretsiz, yeni başlayanlar ve ara elemanlar.", "The state employment office: free, newcomers and entry-level staff."),
	},
	{
		id = "campus", icon = "🎓", fee = 1, count = 8, skill = { 1, 3 }, years = { 0, 1 }, lie = 0.15, refresh = 80, uni = true, learn = 1.5,
		roles = { "technician", "laptop_tech", "data_recovery", "builder", "engineer", "network_tech", "support", "accountant", "marketer", "manager" },
		name = N("Üniversite Kariyer Günü", "University Careers Day"),
		desc = N("Taze mezunlar: deneyimsiz ama diplomalı, %50 daha hızlı öğrenirler.", "Fresh graduates: no experience but a degree, and they learn 50% faster."),
	},
	{
		id = "listing", icon = "📰", fee = 1, count = 12, skill = { 1, 5 }, years = { 0, 22 }, lie = 0.45, refresh = 30,
		name = N("İş İlanı Sitesi", "Job Listings Site"),
		desc = N("Çok başvuru gelir, ucuzdur; ama özgeçmişler sık sık abartılıdır. Mülakat yap!", "Lots of applicants and cheap, but the CVs often oversell. Interview them!"),
	},
	{
		id = "headhunter", icon = "🎯", fee = 6, count = 6, skill = { 4, 5 }, years = { 6, 25 }, lie = 0.05, refresh = 400, wageMul = 1.15, minShop = 3,
		roles = { "technician", "foreman", "laptop_tech", "board_tech", "data_recovery", "engineer", "manager", "accountant", "network_tech", "salesperson", "marketer" },
		name = N("Kelle Avcısı", "Headhunter"),
		desc = N("Sektörün en iyileri. Ücreti altı günlük maaş, maaşları da yüksek.", "The best in the trade. The fee is six days' wages and they cost more."),
	},
	{
		id = "referral", icon = "🤝", fee = 0.5, count = 5, skill = { 2, 4 }, years = { 1, 12 }, lie = 0, refresh = 100, needStaff = 1, morale = 82,
		name = N("Çalışan Tavsiyesi", "Staff Referrals"),
		desc = N("Ekibinin tanıdıkları: özgeçmişleri dürüst, işe moralli başlarlar. En az bir çalışanın olmalı.", "People your staff know: honest CVs and they start in good spirits. You need at least one employee."),
	},
}
Employees.channelById = {}
for _, c in Employees.channels do
	Employees.channelById[c.id] = c
end

local function weightedKey(rng: Random, weights: { [string]: number }, allowed: { [string]: boolean }?): string
	local total = 0
	for k, w in weights do
		if not allowed or allowed[k] then
			total += w
		end
	end
	local r = rng:NextNumber() * total
	local last = nil
	-- (sorted, so the same seed gives the same pick everywhere)
	local keys = {}
	for k in weights do
		table.insert(keys, k)
	end
	table.sort(keys)
	for _, k in keys do
		if not allowed or allowed[k] then
			last = k
			r -= weights[k]
			if r <= 0 then
				return k
			end
		end
	end
	return last :: string
end

local function round5(x: number): number
	return math.max(5, math.floor(x / 5 + 0.5) * 5)
end

-- The pay a person of this role, stars and schooling would expect.
function Employees.fairWage(roleId: string, skill: number, eduId: string?, years: number?): number
	local role = Employees.roles[roleId]
	local edu = eduId and Employees.eduById[eduId]
	return round5((role and role.wage or 100) * (0.7 + skill * 0.1) * (edu and edu.wage or 1) * (1 + math.min(years or 0, 20) * 0.01))
end

local function pickGender(rng: Random, look: string): string
	local def = Avatars.OUTFITS[look]
	local share = def and def.female or 0.5
	if share <= 0 then
		return "m"
	elseif share >= 1 then
		return "f"
	end
	return if rng:NextNumber() < 0.5 then "f" else "m"
end

-- Candidates from one place on one day (the same list until the day changes or a refresh).
-- Each has a true skill and a second trait that only an interview shows (Employees.public).
function Employees.candidates(seed: number, count: number?, channelId: string?): { { [string]: any } }
	local ch = Employees.channelById[channelId or "agency"] or Employees.channels[1]
	local rng = Rand.new(seed)
	local allowed = nil
	if ch.roles then
		allowed = {}
		for _, id in ch.roles do
			allowed[id] = true
		end
	end
	local out = {}
	for i = 1, count or ch.count do
		local roleId = if ch.sure and ch.sure[i] then ch.sure[i] else weightedKey(rng, ROLE_WEIGHT, allowed)
		local role = Employees.roles[roleId]
		local look = role.look or "casual"
		local gender = pickGender(rng, look)
		local name = Customers.randomName(rng, false, gender)
		local skill = rng:NextInteger(ch.skill[1], ch.skill[2])
		if roleId == "apprentice" then
			skill = math.min(skill, 2)
		end
		-- the CV: sometimes a star or two more than the truth
		local cvSkill = skill
		if rng:NextNumber() < ch.lie then
			cvSkill = math.min(5, skill + (if rng:NextNumber() < 0.3 then 2 else 1))
		end
		local eduW = table.clone(EDU_BY_ROLE[roleId] or EDU_BY_GROUP[role.group])
		local allowedEdu = nil
		if ch.uni then
			allowedEdu = {}
			for _, e in Employees.educations do
				if e.uni then
					allowedEdu[e.id] = true
					eduW[e.id] = eduW[e.id] or 0.5
				end
			end
		end
		local eduId = weightedKey(rng, eduW, allowedEdu)
		local edu = Employees.eduById[eduId]
		local years = math.clamp(skill * 2 + rng:NextInteger(-3, 4), ch.years[1], ch.years[2])
		if roleId == "apprentice" then
			years = math.min(years, 1)
		end
		local age = math.clamp(18 + math.max(0, edu.years) + years + rng:NextInteger(0, 4) + (if edu.years < 0 then edu.years + 3 else 0), 16, 64)
		local trait = Rand.pick(rng, Employees.traits)
		while trait.hidden do
			trait = Rand.pick(rng, Employees.traits)
		end
		local trait2 = Rand.pick(rng, Employees.traits)
		while trait2.id == trait.id do
			trait2 = Rand.pick(rng, Employees.traits)
		end
		-- they ask for what the CV says they're worth
		local wage = round5(Employees.fairWage(roleId, cvSkill, eduId, years) * (1 + (trait.wage or 0)) * (ch.wageMul or 1))
		table.insert(out, {
			uid = string.format("%s%d_%d", string.sub(ch.id, 1, 2), seed % 100000, i),
			channel = ch.id,
			role = roleId,
			name = name,
			gender = gender,
			age = age,
			town = Rand.pick(rng, Employees.towns),
			edu = eduId,
			years = years,
			skill = skill,
			cvSkill = cvSkill,
			trait = trait.id,
			trait2 = trait2.id,
			wage = wage,
			hireCost = if ch.fee > 0 then round5(wage * ch.fee) else 0,
			look = rng:NextInteger(1, 1e6),
			learnBoost = ch.learn,
			morale = ch.morale,
		})
	end
	return out
end

-- What the player sees of a candidate: the CV, plus the truth once interviewed.
function Employees.public(c, interviewed: boolean?): { [string]: any }
	local v = table.clone(c)
	if not interviewed then
		v.skill = nil
		v.trait2 = nil
	else
		v.interviewed = true
	end
	return v
end

local function traitsOf(e)
	local a = e.trait and Employees.traitById[e.trait]
	local b = e.trait2 and Employees.traitById[e.trait2]
	return a, b
end

local function traitSum(e, key: string): number
	local a, b = traitsOf(e)
	return (a and a[key] or 0) + (b and b[key] or 0)
end
Employees.traitSum = traitSum

function Employees.hasTrait(e, id: string): boolean
	return e.trait == id or e.trait2 == id
end

-- Stars make a role's contribution bigger: 0.7 at one star, 1.1 at five.
function Employees.skillScale(e): number
	return 0.6 + 0.1 * (e.skill or 1)
end

function Employees.moraleOf(e): number
	return e.morale or 70
end

-- 0.85 for a miserable employee, 1.1 for a delighted one.
function Employees.moraleFactor(e): number
	return 0.85 + Employees.moraleOf(e) / 100 * 0.25
end

-- A team effect summed over the staff (see the header); catchMistake takes the best.
function Employees.effect(staff, key: string): number
	local n = 0
	for _, e in staff or {} do
		local role = Employees.roles[e.role]
		local v = role and role.fx and role.fx[key]
		local t = traitSum(e, key)
		if key == "catchMistake" then
			n = math.max(n, (v or 0) * Employees.skillScale(e) * Employees.moraleFactor(e))
		else
			n += (v or 0) * Employees.skillScale(e) + t
		end
	end
	return n
end

function Employees.has(staff, roleId: string): boolean
	for _, e in staff or {} do
		if e.role == roleId then
			return true
		end
	end
	return false
end

function Employees.count(staff, roleId: string): number
	local n = 0
	for _, e in staff or {} do
		if e.role == roleId then
			n += 1
		end
	end
	return n
end

-- Efficiency at the bench (before the job's own match).
function Employees.speed(e): number
	local role = Employees.roles[e.role]
	return (0.6 + (e.skill or 1) * 0.12) * (1 + traitSum(e, "speed")) * (role and role.speed or 1) * Employees.moraleFactor(e)
end

function Employees.success(e): number
	local edu = e.edu and Employees.eduById[e.edu]
	return math.clamp(0.72 + (e.skill or 1) * 0.05 + traitSum(e, "success") + (edu and edu.success or 0), 0.4, 0.99)
end

-- How a job suits someone: (speed multiplier, success bonus, a specialist's job?).
function Employees.fit(e, kind: string?, faults: { string }?, requestId: string?): (number, number, boolean)
	local role = Employees.roles[e.role]
	local diags = {}
	for _, fid in faults or {} do
		local f = Faults.get(fid)
		if f then
			diags[f.diag] = true
		end
	end
	local req = requestId and Faults.get(requestId)
	if req then
		diags[req.diag] = true
	end
	local function matches(focusDiags, focusKind)
		if focusKind and kind == focusKind then
			return true
		end
		for d in focusDiags or {} do
			if diags[d] then
				return true
			end
		end
		return false
	end
	local speed, success, special = 1, 0, false
	if role and role.focus and matches(role.focus.diags, role.focus.kind) then
		speed *= role.focusSpeed or 1
		success += role.focusSuccess or 0
		special = true
	end
	for _, t in { traitsOf(e) } do
		if t and (t.focus or t.focusKind) and matches(t.focus, t.focusKind) then
			speed *= 1 + (t.focusSpeed or 0)
		end
	end
	return speed, success, special
end

-- Will they take this job at all? (apprentices stay off the hard ones)
function Employees.canTake(e, faults: { string }?, requestId: string?): boolean
	local role = Employees.roles[e.role]
	if not role or not role.bench then
		return false
	end
	local cap = role.maxDifficulty
	if not cap then
		return true
	end
	for _, fid in faults or {} do
		local f = Faults.get(fid)
		if f and (f.difficulty or 1) > cap then
			return false
		end
	end
	local req = requestId and Faults.get(requestId)
	return not req or (req.difficulty or 1) <= cap
end

-- Experience for the next star.
function Employees.xpNeeded(skill: number): number
	return 30 + skill * 25
end

-- One day at work: experience (stars) and morale. ctx: { teach, teamMorale, comfort, paid,
-- learn (a training bonus), rng }. Returns "levelup" when they earned a star.
function Employees.dayPass(e, ctx): string?
	local role = Employees.roles[e.role]
	local edu = e.edu and Employees.eduById[e.edu]
	local learn = (role and role.learn or 1) * (edu and edu.learn or 1) * (e.learnBoost or 1) * math.max(0.2, 1 + traitSum(e, "learn")) * (1 + (ctx.learn or 0))
	if e.role == "apprentice" and ctx.teach then
		learn *= 2
	end
	e.days = (e.days or 0) + 1
	local event = nil
	if (e.skill or 1) < 5 then
		e.xp = (e.xp or 0) + 10 * learn
		local need = Employees.xpNeeded(e.skill or 1)
		if e.xp >= need then
			e.xp -= need
			e.skill = (e.skill or 1) + 1
			event = "levelup"
		end
	end
	-- morale: pay, fair pay, tea and a nice shop, their own nature
	local m = Employees.moraleOf(e)
	m += if ctx.paid then 1 else -25
	local fair = Employees.fairWage(e.role, e.skill or 1, e.edu, e.years)
	if (e.wage or 0) < fair * 0.85 then
		m -= 4
	end
	m += math.min(6, ctx.teamMorale or 0)
	if (ctx.comfort or 0) >= 25 then
		m += 1
	end
	m += traitSum(e, "morale")
	if Employees.hasTrait(e, "moody") and ctx.rng then
		m += ctx.rng:NextInteger(-4, 4)
	end
	e.morale = math.clamp(math.floor(m * 10 + 0.5) / 10, 0, 100)
	return event
end

-- Severance when you let someone go: nothing in the first week, then two days' wages for every
-- week worked (up to ten days).
function Employees.severance(e): number
	local weeks = math.floor((e.days or 0) / 7)
	return math.min(weeks * 2, 10) * (e.wage or 0)
end

return Employees
