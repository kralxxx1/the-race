-- Strings: every piece of UI text in Turkish and English. S.t(key, vars) picks the player's
-- language; {name} placeholders are filled from vars.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

local S = {}

local lang = "tr"

local T = {
	-- HUD and general
	money = { "Para", "Money" },
	level = { "Seviye", "Level" },
	rep = { "İtibar", "Reputation" },
	day = { "Gün {d}", "Day {d}" },
	close = { "Kapat", "Close" },
	back = { "Geri", "Back" },
	buy = { "Satın Al", "Buy" },
	sell = { "Sat", "Sell" },
	owned = { "Sahipsin", "Owned" },
	use = { "Kullan", "Use" },
	confirm = { "Onayla", "Confirm" },
	cancel = { "Vazgeç", "Cancel" },
	free = { "Ücretsiz", "Free" },
	needs_level = { "Seviye {n} gerekli", "Requires level {n}" },
	search = { "Ara...", "Search..." },
	all = { "Tümü", "All" },
	sort_price = { "↑ Fiyat", "↑ Price" },
	sort_perf = { "↓ Performans", "↓ Performance" },
	rows_more = { "+{n} ürün daha: filtre ya da arama kullan", "+{n} more: use a filter or search" },
	empty = { "Burada henüz bir şey yok.", "Nothing here yet." },
	loading = { "Yükleniyor...", "Loading..." },
	phone = { "Telefon", "Phone" },
	map = { "Harita", "Map" },
	inventory = { "Envanter", "Inventory" },
	jobs = { "İşler", "Jobs" },
	shop = { "Dükkânım", "My Shop" },
	staff = { "Personel", "Staff" },
	garage = { "Garaj", "Garage" },
	settings = { "Ayarlar", "Settings" },
	stats = { "İstatistik", "Statistics" },
	home = { "Dükkâna Dön", "Back to Shop" },
	language = { "Dil", "Language" },
	music = { "Müzik", "Music" },
	sfx = { "Efektler", "Effects" },
	storage = { "Depo {n}/{m}", "Storage {n}/{m}" },
	daily = { "Günlük Ödül", "Daily Reward" },
	daily_claimed = { "Günlük ödül alındı: {amount} (seri {streak})", "Daily reward claimed: {amount} (streak {streak})" },

	-- categories
	cat_gpu = { "Ekran Kartı", "Graphics Cards" },
	cat_cpu = { "İşlemci", "Processors" },
	cat_mobo = { "Anakart", "Motherboards" },
	cat_ram = { "RAM", "Memory" },
	cat_storage = { "Disk", "Storage" },
	cat_psu = { "Güç Kaynağı", "Power Supplies" },
	cat_cooler = { "Soğutucu", "Coolers" },
	cat_fan = { "Kasa Fanı", "Case Fans" },
	cat_case = { "Kasa", "Cases" },
	cat_misc = { "Sarf & Küçük", "Consumables" },
	cat_laptop = { "Laptop Parçası", "Laptop Parts" },
	cat_peripheral = { "Çevre Birimleri", "Peripherals" },

	-- condition
	cond_new = { "Sıfır", "New" },
	cond = { "Durum %{n}", "Condition {n}%" },
	broken = { "ARIZALI", "FAULTY" },
	removed = { "Sökülmüş", "Removed" },
	deal = { "KAMPANYA", "DEAL" },

	-- stores
	store_parts = { "Mega Parça Deposu", "Mega Parts Depot" },
	store_bazaar = { "Çarşı Parçacısı", "Bazaar Parts Stall" },
	store_used = { "2. El Pazarı", "Second-hand Market" },
	store_scrap = { "Hurdalık", "Scrapyard" },
	store_tools = { "Alet-Edevat", "Tools & Hardware" },
	store_realty = { "Emlak Ofisi", "Estate Agent" },
	store_board = { "Belediye — Görev Panosu", "City Hall — Task Board" },
	store_police = { "Polis Merkezi", "Police Station" },
	bought = { "Satın alındı: {name}", "Bought: {name}" },
	sold = { "Satıldı: {price}", "Sold for {price}" },
	sell_tab = { "Elindekini Sat", "Sell Yours" },
	buy_tab = { "Satılanlar", "For Sale" },
	risk = { "Gizli arıza riski %{n}", "Hidden fault risk {n}%" },
	junk_pc = { "Hurda Kasa", "Junk PC" },
	junk_desc = { "İçinde ne var belli değil. Tezgâhta söküp onar, sat.", "Who knows what's inside. Strip it, fix it, sell it." },
	project_added = { "Proje iş listene eklendi.", "Project added to your jobs." },
	tool_owned = { "Sende var", "You own this" },
	bits = { "Uçlar: {list}", "Bits: {list}" },

	-- jobs
	job_waiting = { "Sırada", "Waiting" },
	job_bench = { "Tezgâhta", "On a bench" },
	job_ready = { "Teslime hazır", "Ready for pickup" },
	job_own = { "Kendi projen", "Own project" },
	job_none = { "Bekleyen iş yok. Tezgâhtaki müşteriyle konuşarak iş al.", "No jobs. Talk to a customer at the counter to take one." },
	job_sell = { "Sat ({price})", "Sell ({price})" },
	job_blocked = { "{by}: {reason}", "{by}: {reason}" },
	needs_tools = { "Gereken aletler: {list}", "Tools needed: {list}" },
	missing_tool = { "Eksik alet: {list}", "Missing tool: {list}" },

	-- customer dialog
	talk_title = { "{name} • {arch}", "{name} • {arch}" },
	talk_device = { "Cihaz: {device}", "Device: {device}" },
	talk_offer = { "Teklif: {price}", "Offer: {price}" },
	talk_accept = { "Kabul Et ({price})", "Accept ({price})" },
	talk_haggle = { "Pazarlık Et", "Haggle" },
	talk_ask = { "İste: {price}", "Ask: {price}" },
	talk_reject = { "Reddet", "Decline" },
	talk_rounds = { "Kalan pazarlık hakkı: {n}", "Haggle rounds left: {n}" },
	talk_buy = { "Satın Al ({price})", "Buy ({price})" },
	talk_counter = { "Karşı teklif: {price}", "Counter offer: {price}" },
	talk_walked = { "Müşteri sinirlendi ve gitti.", "The customer got annoyed and left." },
	talk_sell_warn = { "Kutusu yok, faturası yok... Çalıntı olabilir!", "No box, no receipt... might be stolen!" },
	request_label = { "İstek", "Request" },

	-- payment
	paid = { "{name} ödedi: {price} (+{tip} bahşiş) {stars}", "{name} paid {price} (+{tip} tip) {stars}" },
	paid_fail = { "{name} ödemedi: cihaz düzgün çalışmıyor!", "{name} refused to pay: the device isn't working!" },

	-- bench
	bench_title = { "Tezgâh {n}", "Bench {n}" },
	bench_pick = { "Tezgâha bir iş koy", "Put a job on the bench" },
	bench_load = { "Tezgâha Al", "Load" },
	bench_unload = { "Raftan Kaldır", "Put Away" },
	bench_leave = { "Kalk", "Stand Up" },
	bench_labels = { "Etiketler", "Labels" },
	bench_finish = { "İşi Bitir", "Finish Job" },
	bench_power = { "Güç", "Power" },
	bench_stress = { "Stres Testi", "Stress Test" },
	bench_post = { "POST Kartı", "POST Card" },
	bench_psu = { "PSU Testi", "PSU Test" },
	bench_thermal = { "Termal Kamera", "Thermal Camera" },
	bench_usb = { "USB Araçları", "USB Tools" },
	bench_flip = { "Çevir", "Flip" },
	bench_lid = { "Kapak", "Lid" },
	bench_ties = { "Kabloları Topla", "Tidy Cables" },
	bench_strap = { "Bileklik", "Wrist Strap" },
	bench_parts = { "Parça Tak", "Install Part" },
	bench_notes = { "Bulgular", "Findings" },
	bench_hint_pick = { "Bir alet seç ve parçanın üzerine gel.", "Pick a tool and hover a part." },
	bench_no_job = { "Tezgâh boş.", "The bench is empty." },
	bench_install_none = { "Envanterinde buraya uyan parça yok.", "Nothing in your inventory fits here." },
	bench_install_title = { "{slot} için parça", "Part for {slot}" },
	bench_from_tray = { "Tepsiden (sökülen)", "From the tray (removed)" },
	bench_finish_q = { "İş bitti mi? Cihaz test edilecek.", "Done? The device will be tested." },
	bench_verdict_ok = { "Cihaz kusursuz çalışıyor! Müşteri teslim almaya geliyor.", "Everything works! The customer is coming to collect it." },
	bench_verdict_bad = { "Cihaz hâlâ sorunlu: {why}", "The device still has problems: {why}" },
	bench_not_assembled = { "{n} eksik montaj adımı var", "{n} assembly steps are missing" },
	bench_kept = { "{n} sökülen parça envanterine eklendi.", "{n} removed parts went to your inventory." },
	bench_resale = { "Projeyi satabilirsin: {price}", "You can sell this project for {price}" },
	hold = { "Basılı tut", "Hold" },
	paste_hint = { "Basılı tut ve ideal miktarda bırak", "Hold and release at the right amount" },
	paste_amount = { "Macun: %{n}", "Paste: {n}%" },
	paste_q = { "Macun kalitesi: %{n}", "Paste quality: {n}%" },

	-- actions shown in hints
	act_unscrew = { "Vidayı sök", "Unscrew" },
	act_screw = { "Vidala", "Screw in" },
	act_unplug = { "Kabloyu çıkar", "Unplug" },
	act_plug = { "Kabloyu tak", "Plug in" },
	act_open_latch = { "Mandalı aç", "Open latch" },
	act_close_latch = { "Mandalı kapat", "Close latch" },
	act_remove = { "Çıkar", "Remove" },
	act_install = { "Yerine tak", "Install" },
	act_pry = { "Kanırt", "Pry open" },
	act_peel = { "Ayağı kaldır", "Peel foot" },
	act_blow_dust = { "Tozunu üfle", "Blow dust" },
	act_brush = { "Fırçala", "Brush" },
	act_clean_paste = { "Eski macunu temizle", "Clean old paste" },
	act_apply_paste = { "Termal macun sür", "Apply paste" },
	act_clean_liquid = { "Sıvı kalıntısını temizle", "Clean liquid residue" },
	act_desolder = { "Lehimini al", "Desolder" },
	act_solder = { "Lehimle", "Solder" },
	act_straighten_pins = { "Pinleri düzelt", "Straighten pins" },
	act_inspect = { "İncele", "Inspect" },
	act_measure = { "Ölç", "Measure" },
	act_discard = { "Tepsiye koy", "Put in tray" },

	-- power/eval
	eval_title = { "Test Sonucu", "Test Result" },
	temps = { "CPU {cpu}°C • GPU {gpu}°C", "CPU {cpu}°C • GPU {gpu}°C" },
	post_code = { "POST kodu: {code}", "POST code: {code}" },
	issues = { "Sorunlar:", "Issues:" },

	-- software
	sw_memtest = { "Bellek Testi (MemTest)", "Memory Test (MemTest)" },
	sw_smart = { "Disk Sağlığı (S.M.A.R.T.)", "Drive Health (S.M.A.R.T.)" },
	sw_antivirus = { "Antivirüs Taraması", "Antivirus Scan" },
	sw_os_install = { "Windows Kurulumu", "Install Windows" },
	sw_bios_update = { "BIOS Güncelleme", "BIOS Update" },

	-- shop panel
	shop_level = { "{name} (Seviye {n})", "{name} (Level {n})" },
	shop_upgrade = { "Büyüt: {name} — {price}", "Expand: {name} — {price}" },
	shop_max = { "Dükkânın en büyük seviyede!", "Your shop is at the top level!" },
	shop_items = { "Eşyalar", "Items" },
	shop_expand_tab = { "Büyüt", "Expand" },
	shop_looks = { "Görünüm", "Looks" },
	shop_rename = { "Dükkân Adı", "Shop Name" },
	shop_benches = { "{n} tezgâh • {q} sıra • {s} koltuk • {st} personel", "{n} benches • {q} queue • {s} seats • {st} staff" },
	wall = { "Duvar", "Walls" },
	floor = { "Zemin", "Floor" },
	accent = { "Renk", "Accent" },
	free_plots = { "{n} boş dükkân var. Haritada 🔑 ile işaretli; kiralık tabelasına bas.", "{n} free shops. Marked 🔑 on the map; use the 'for rent' sign." },

	-- staff
	staff_hire = { "İşe Al ({price})", "Hire ({price})" },
	staff_fire = { "Çıkar", "Dismiss" },
	staff_wage = { "Günlük maaş {wage}", "Daily wage {wage}" },
	staff_skill = { "Yetenek {n}/5", "Skill {n}/5" },
	staff_refresh = { "🔄 Yeni Adaylar ({price})", "🔄 New Candidates ({price})" },
	staff_capacity = { "Personel {n}/{m}", "Staff {n}/{m}" },
	staff_yours = { "Ekibin", "Your Team" },
	staff_candidates = { "Adaylar", "Candidates" },

	-- vehicles
	dealer_buy = { "Satın Al — {price}", "Buy — {price}" },
	vehicle_call = { "Çağır", "Call" },
	vehicle_park = { "Park Et", "Park" },
	vehicle_speed = { "Hız {n}", "Speed {n}" },
	vehicle_none = { "Henüz aracın yok. Bisikletçiden başla!", "No vehicles yet. Start at the bike shop!" },
	kmh = { "km/s", "km/h" },

	-- map
	map_title = { "Şehir Haritası", "City Map" },
	map_you = { "Sen", "You" },
	map_shop = { "Dükkânın", "Your Shop" },
	map_route = { "Yol Tarifi", "Directions" },
	map_taxi = { "Taksi ({price})", "Taxi ({price})" },
	map_clear = { "Rotayı Sil", "Clear Route" },
	map_legend = { "Lejant", "Legend" },
	map_free_plot = { "Boş dükkân", "Free shop" },
	map_hint = { "Bir yere tıkla • Tekerlek: yakınlaştır • Sürükle: kaydır • M: kapat", "Click a place • Wheel: zoom • Drag: pan • M: close" },
	gps_arrived = { "Vardın: {name}", "Arrived: {name}" },
	gps_dist = { "{name} • {d} m", "{name} • {d} m" },

	-- board
	board_title = { "En İyi Tamirciler", "Top Technicians" },
	board_cols = { "Oyuncu • Seviye • Tamir • İtibar", "Player • Level • Repairs • Rep" },

	-- stats
	stat_repairs = { "Tamir: {n}", "Repairs: {n}" },
	stat_perfect = { "Kusursuz: {n}", "Perfect: {n}" },
	stat_failed = { "Başarısız: {n}", "Failed: {n}" },
	stat_earned = { "Toplam kazanç: {n}", "Total earned: {n}" },
	stat_caught = { "Yakalanan hırsız: {n}", "Thieves caught: {n}" },
	stat_customers = { "Müşteri: {n}", "Customers: {n}" },

	-- toasts from the server
	t_move_wait = { "Biraz bekle, az önce taşındın.", "Wait a moment, you just moved." },
	t_moved = { "Dükkânın {plot} numaralı yere taşındı!", "Your shop moved to plot {plot}!" },
	t_esd_zap = { "⚡ Statik elektrik! {node} zarar görmüş olabilir. Bileklik tak!", "⚡ Static shock! {node} may be damaged. Wear the strap!" },
	t_bench_staff = { "Bu tezgâhta personelin çalışıyor.", "One of your staff is working at this bench." },
	t_not_your_bench = { "Bu senin dükkânın değil.", "This isn't your shop." },
	t_jobs_full = { "İş listen dolu! Önce bazılarını bitir.", "Your job list is full! Finish some first." },
	t_not_your_customer = { "Bu müşteri başka dükkânın.", "That customer belongs to another shop." },
	t_police_fine = { "🚓 Polis: {part} çalıntı çıktı! El konuldu, {fine} ceza.", "🚓 Police: the {part} was stolen goods! Confiscated, {fine} fine." },
	t_customer_left = { "😠 {name} beklemekten sıkıldı, cihazını alıp gitti.", "😠 {name} got tired of waiting and left with the device." },
	t_scammer_escaped = { "💸 {name} parayı vermeden kaçtı!", "💸 {name} ran off without paying!" },
	t_caught_scammer = { "🚨 Dolandırıcı yakalandı! {amount} tahsil edildi.", "🚨 Scammer caught! Collected {amount}." },
	t_scammer_running = { "🏃 {name} parayı vermeden kaçıyor! Yakala (F)!", "🏃 {name} is running off without paying! Catch them (F)!" },
	t_manager_bought = { "👔 Müdür parça aldı: {part} ({price})", "👔 Manager ordered: {part} ({price})" },
	t_tech_done = { "🧑‍🔧 {name} işi bitirdi: {job}", "🧑‍🔧 {name} finished: {job}" },
	t_tech_blocked = { "🧑‍🔧 {name} takıldı ({job}): {reason} {detail}", "🧑‍🔧 {name} is stuck ({job}): {reason} {detail}" },
	t_offline_income = { "👔 Sen yokken müdürün dükkânı işletti: +{amount} ({hours} saat)", "👔 Your manager ran the shop while you were away: +{amount} ({hours} h)" },
	t_wages_paid = { "💼 Maaşlar ödendi: {amount}", "💼 Wages paid: {amount}" },
	t_factory_done = { "🏭 Fabrikada {n} adet {part} üretildi.", "🏭 Your factory made {n} × {part}." },
	t_factory_stopped = { "🏭 Hat {line} durdu: malzeme parası ya da depo yeri yok.", "🏭 Line {line} stopped: no money for materials or no warehouse room." },
	t_inspection_fail = { "👮 Zabıta denetimi: {n} eksik bulundu (ruhsat, yangın tüpü, fiyat listesi...). Ceza kesildi!", "👮 Municipal inspection: {n} things missing (licence, extinguisher, price list...). Fined!" },
	t_inspection_ok = { "👮 Zabıta denetimi: her şey yolunda, tebrikler!", "👮 Municipal inspection: all in order, well done!" },
	t_bill_new = { "🧾 Yeni fatura: {kind} — {amount} (telefon ▸ Faturalar)", "🧾 New bill: {kind} — {amount} (phone ▸ Bills)" },
	t_power_cut = { "⚡ Elektrik kesildi! Geciken faturayı ödeyene kadar ışıklar, testler ve müşteriler yok.", "⚡ The power is cut! No lights, tests or customers until the late bill is paid." },
	t_power_back = { "💡 Elektrik geri geldi.", "💡 The power is back on." },
	t_staff_quit = { "😞 Maaş ödenemedi, {name} işi bıraktı.", "😞 Couldn't pay wages, {name} quit." },
	t_staff_quit_morale = { "😠 {name} morali sıfırlandı ve istifa etti.", "😠 {name}'s morale hit rock bottom and they quit." },
	t_staff_promoted = { "🎓 {name} çıraklıktan teknisyenliğe yükseldi! Maaşını gözden geçir.", "🎓 {name} has gone from apprentice to technician! Time to review their pay." },
	t_staff_levelup = { "⭐ {name} ustalaştı: artık {stars} yıldız!", "⭐ {name} got better: now {stars} stars!" },
	t_qa_caught = { "🧪 {name}, {tech} adlı teknisyenin unuttuğu kabloyu teslimden önce yakaladı.", "🧪 {name} caught a cable {tech} forgot, before it went back." },
	t_staff_sticky = { "🕵️ Raftan bir {part} kayboldu... {name} bugün çok sessiz.", "🕵️ A {part} vanished from the shelf... {name} is very quiet today." },
	t_support_income = { "🎧 Uzaktan destek geliri: +{amount}", "🎧 Remote support income: +{amount}" },
	t_staff_restock = { "📦 Depo sorumlusu sarf malzemesi aldı: {list}", "📦 The storekeeper restocked: {list}" },
	t_thief_caught = { "🚨 Hırsız yakalandı! {by} • ödül {bounty}", "🚨 Thief caught! {by} • bounty {bounty}" },
	t_bounty = { "Ödül: {amount}", "Bounty: {amount}" },
	t_thief_escaped = { "🦹 Hırsız kaçtı! {cash} {part}", "🦹 The thief escaped! {cash} {part}" },
	t_camera_alert = { "📹 Kamera: dükkâna şüpheli biri girdi!", "📹 Camera: a suspicious person just walked in!" },
	t_alarm = { "🚨 ALARM! Hırsız kasada! Yakala (F)!", "🚨 ALARM! Thief at the register! Catch them (F)!" },
	t_burglar_camera = { "📹 Kamera: gece dükkânının kepengini zorlayan biri var! Hemen dön!", "📹 Camera: someone is forcing your shop's shutter tonight! Get back there!" },
	t_burglar_scared = { "💡 Gece hırsızı ışıklar ve alarmdan korkup kaçtı.", "💡 A night prowler took fright and ran off." },
	t_police_recovered = { "🚓 Polis kamera kaydından hırsızı buldu: {amount} değerindeki malın geri geldi!", "🚓 The police traced the thief from the footage: {amount} worth of your things is back!" },
	t_insurance_paid = { "📄 Sigorta ödedi: {amount}", "📄 The insurance paid out: {amount}" },
	t_bat_hit = { "🏏 {by} hırsıza sopayı geçirdi!", "🏏 {by} whacked the thief with the bat!" },
	t_contract_machine = { "🏢 Sözleşme: makine {n}/{m} teslim edildi (+{price})", "🏢 Contract: machine {n}/{m} delivered (+{price})" },
	t_contract_machine_bad = { "🏢 Sözleşme: makine {n}/{m} çalışmıyor, ödeme yok!", "🏢 Contract: machine {n}/{m} doesn't work, no pay!" },
	t_contract_done = { "🏢 Sözleşme tamam! Bonus: {bonus}", "🏢 Contract complete! Bonus: {bonus}" },
	t_contract_partial = { "🏢 Sözleşme bitti: {n}/{m} makine sorunsuzdu, bonus yok.", "🏢 Contract over: {n}/{m} machines worked, no bonus." },
	t_showcase_back = { "🖥️ {name} vitrinden alındı.", "🖥️ {name} taken off the showcase." },
	t_showcase_none = { "🖥️ Vitrine koyacak bitmiş bir projen yok. Hurda kasa al ya da PC topla!", "🖥️ No finished project to display. Buy a junk PC or build one!" },
	t_showcase_setup = { "🖥️ {name} vitrinde, {n} çevre birimiyle SET olarak! Satış fiyatı: {price}", "🖥️ {name} is on display as a SETUP with {n} peripherals! Price: {price}" },
	t_showcase_put = { "🖥️ {name} vitrinde! Satış fiyatı: {price}", "🖥️ {name} is on display! Price: {price}" },
	t_showcase_sold = { "💰 Vitrindeki {name} satıldı: {price}", "💰 The {name} on display sold for {price}" },
	reason_need_part = { "parça lazım:", "needs a part:" },
	reason_need_tool = { "alet lazım:", "needs a tool:" },
	reason_stuck = { "çözemedi", "couldn't solve it" },
	level_up = { "🎉 Seviye atladın! Seviye {n}", "🎉 Level up! Level {n}" },

	-- customer dialog (more)
	talk_taken = { "İş alındı: {device} • {price}", "Job taken: {device} • {price}" },
	talk_more = { "Daha fazla iste:", "Ask for more:" },
	talk_tools_ok = { "Gereken aletler sende var.", "You have every tool this needs." },
	talk_retail = { "Mağaza fiyatı: {price}", "Store price: {price}" },
	talk_deal = { "Anlaştınız: {price}", "Deal at {price}" },
	talk_quote = { "“{text}”", "“{text}”" },
	talk_bought = { "Satın aldın: {name}", "You bought: {name}" },

	-- stores (more)
	store_bazaar_hint = { "Eski nesil parçalar %28 daha ucuz ama bazıları kusurlu çıkabilir.", "Older-generation parts, 28% cheaper, but some turn out faulty." },
	store_used_hint = { "İkinci el: ucuz ama gizli arıza riski var. Satarken bayi test eder.", "Second-hand: cheap, but parts may hide faults. The dealer tests what you sell." },
	store_scrap_hint = { "Hurda kasaların içinden ne çıkacağı belli değil. Her parçayı hurda fiyatına satabilirsin.", "Nobody knows what's inside a junk PC. You can sell any part here for scrap." },
	store_tools_hint = { "İyi alet, hızlı ve temiz iş demek.", "Good tools mean fast, clean work." },
	store_police_text = { "Yakaladığın hırsızların ödülü anında ödenir.\n\nYakalanan hırsız: {caught}\nUğradığın soygun: {robbed}", "Bounties for thieves you catch are paid on the spot.\n\nThieves caught: {caught}\nRobberies suffered: {robbed}" },
	store_realty_hint = { "Kiralık bir dükkânın tabelasına basarak oraya taşınabilirsin. Dükkânın her şeyiyle taşınır.", "Use the 'for rent' sign of a free shop to move there. Everything moves with you." },
	store_sell_none = { "Satacak parçan yok.", "You have no parts to sell." },
	board_you = { "(sen)", "(you)" },
	stock_uses = { "{n} kullanım", "{n} uses" },
	per_unit = { "adet", "each" },
	consumable = { "Sarf", "Consumable" },
	sold_out = { "Tükendi", "Sold out" },

	-- daily tasks
	quests_title = { "Günlük Görevler", "Daily Tasks" },
	quest_claim = { "Ödülü Al", "Claim" },
	quest_claimed = { "Alındı", "Claimed" },
	quest_reward = { "Ödül {reward} + {xp} XP", "Reward {reward} + {xp} XP" },
	quest_new = { "Yeni görevler her gün gece yarısı (UTC) gelir.", "New tasks arrive every day at midnight (UTC)." },
	board_leaders = { "Liderler", "Leaders" },
	phone_quests = { "Görevler", "Tasks" },
	t_quest_done = { "✅ Görev tamamlandı! Ödülünü telefondan ya da Görev Panosu'ndan al ({reward}).", "✅ Task done! Claim your reward on the phone or the city hall board ({reward})." },

	-- contracts
	contracts_title = { "Toplu İşler", "Bulk Contracts" },
	contract_count = { "{n} makine", "{n} machines" },
	contract_pay = { "Makine başı {pay} • tamamı sorunsuzsa bonus {bonus}", "{pay} per machine • bonus {bonus} if all work" },
	contract_accept = { "Sözleşmeyi Al", "Take Contract" },
	contract_active = { "Devam eden sözleşme: {title} ({done}/{total})", "Contract in progress: {title} ({done}/{total})" },
	contract_hint = { "Makineler iş listene eklenir; sen ya da teknisyenlerin tamir edin. Her makine bitince ödenir.", "The machines join your job list; you or your technicians fix them. Each one is paid when done." },
	contract_taken = { "Sözleşme alındı: {n} makine iş listende!", "Contract taken: {n} machines are in your jobs!" },

	-- inventory
	inv_parts = { "Parçalar", "Parts" },
	inv_stock = { "Sarf Malzemesi", "Consumables" },
	inv_tools = { "Aletler", "Tools" },
	origin_new = { "Sıfır", "New" },
	origin_used = { "2. el", "Used" },
	origin_bazaar = { "Çarşı", "Bazaar" },
	origin_removed = { "Sökülen", "Salvaged" },
	origin_shady = { "Kaçak", "Shady" },
	origin_tray = { "Tepsi", "Tray" },
	broken_known = { "Arızalı (test edildi)", "Faulty (tested)" },

	-- jobs (more)
	job_status_waiting = { "Sırada", "Queued" },
	job_status_bench = { "Tezgâhta", "On bench" },
	job_status_ready = { "Teslimat", "Pickup" },
	job_status_showcase = { "Vitrinde", "On display" },
	job_resale = { "Satış değeri: {price}", "Resale value: {price}" },
	job_sold = { "Proje satıldı: {price}", "Project sold for {price}" },
	job_count = { "{n} iş", "{n} jobs" },

	-- staff (more)
	staff_none = { "Henüz çalışanın yok.", "No staff yet." },
	staff_needs_shop = { "🔒 Dükkân Sv. {n}", "🔒 Shop Lv. {n}" },
	staff_hired = { "{name} işe başladı!", "{name} started working!" },
	staff_fired = { "{name} işten ayrıldı.", "{name} left." },
	staff_agency = { "Personel Ajansı", "Staff Agency" },
	staff_free = { "ücretsiz", "free" },
	staff_hire_free = { "İşe Al (ücretsiz)", "Hire (free)" },
	staff_filled = { "Pozisyon dolu", "Position filled" },
	staff_full = { "Kadro dolu", "Team is full" },
	staff_interview = { "🗣️ Mülakat Yap", "🗣️ Interview" },
	staff_cv = { "Özgeçmiş: {stars}", "CV: {stars}" },
	staff_real = { "Gerçek: {stars}", "Actual: {stars}" },
	staff_hidden = { "❔ + gizli bir özellik", "❔ + a hidden trait" },
	staff_bio = { "{age} yaş • {town} • {edu} • {years} yıl deneyim", "Age {age} • {town} • {edu} • {years} yrs experience" },
	staff_bio_new = { "{age} yaş • {town} • {edu} • deneyimsiz", "Age {age} • {town} • {edu} • no experience" },
	staff_remote = { "🏠 dışarıdan", "🏠 off-site" },
	staff_day_wage = { "Günlük {wage}", "{wage}/day" },
	staff_raise = { "Zam %10", "Raise 10%" },
	staff_raised = { "{name} zamma çok sevindi! Yeni maaşı {wage}", "{name} loved the raise! New wage {wage}" },
	staff_fire_pay = { "Çıkar (tazminat {price})", "Dismiss ({price} severance)" },
	staff_morale = { "Moral {n}", "Morale {n}" },
	staff_xp = { "sonraki yıldız %{p}", "next star {p}%" },
	staff_group_all = { "Tümü", "All" },
	staff_lock_shop = { "🔒 Dükkân Sv. {n} gerekli", "🔒 Needs shop Lv. {n}" },
	staff_lock_staff = { "🔒 Önce en az bir çalışan al", "🔒 Hire someone first" },
	staff_fee = { "İşe alım ücreti: {fee}", "Hiring fee: {fee}" },
	staff_fee_days = { "{n} günlük maaş", "{n} days' wages" },
	staff_none_here = { "Bu filtrede aday yok.", "No candidates for this filter." },
	factory = { "Fabrikam", "My Factory" },
	phone_factory = { "Fabrikam", "Factory" },
	phone_leaders = { "Liderlik", "Leaders" },
	lead_worth = { "Servet", "Net Worth" },
	lead_money = { "Nakit", "Cash" },
	lead_repairs = { "Tamir", "Repairs" },
	lead_level = { "Seviye", "Level" },
	lead_rep = { "İtibar", "Reputation" },
	lead_caught = { "Hırsız", "Thieves" },
	lead_made = { "Üretim", "Factory" },
	lead_global = { "Tüm Zamanlar", "All Time" },
	lead_hint_worth = { "Bu sunucuda en değerli işletmeler: nakit + parçalar + dükkân + araçlar + fabrika.", "The most valuable businesses on this server: cash + parts + shop + vehicles + factory." },
	lead_hint_money = { "Bu sunucuda en çok nakdi olanlar.", "The most cash on this server." },
	lead_hint_repairs = { "Bu sunucuda en çok cihaz onaranlar.", "The most devices repaired on this server." },
	lead_hint_level = { "Bu sunucunun en tecrübeli tamircileri.", "The most experienced technicians on this server." },
	lead_hint_rep = { "Müşterilerin en çok sevdiği dükkânlar.", "The shops customers love most." },
	lead_hint_caught = { "En çok hırsız ve dolandırıcı yakalayanlar.", "The most thieves and scammers caught." },
	lead_hint_made = { "Fabrikasında en çok ürün üretenler.", "The most goods made in their factories." },
	lead_hint_global = { "Bütün sunucularda, bugüne kadarki en değerli işletmeler (birkaç dakikada bir güncellenir).", "The most valuable businesses ever, across every server (updated every few minutes)." },
	lead_alltime = { "Tüm sunucular", "Every server" },
	lead_worth_short = { "servet {worth}", "worth {worth}" },
	lead_none = { "Henüz kimse yok.", "Nobody yet." },
	lead_global_none = { "Tüm zamanlar tablosu yükleniyor ya da bu sunucuda kapalı.", "The all-time table is loading or unavailable on this server." },
	factory_lines = { "Üretim Hatları", "Production Lines" },
	factory_products = { "Ürünler", "Products" },
	factory_stock = { "Fabrika Deposu", "Warehouse" },
	factory_pitch = { "Kendi markanla RAM, SSD, PSU, kasa, soğutucu ve çevre birimi üret. Dükkânına gönderip PC ve setup topla ya da toptancıya sat.", "Make RAM, SSDs, PSUs, cases, coolers and peripherals under your own brand. Ship them to your shop for PCs and setups, or sell them wholesale." },
	factory_buy = { "🏭 Fabrika Kur ({price})", "🏭 Set Up a Factory ({price})" },
	factory_none = { "Henüz fabrikan yok.", "No factory yet." },
	factory_info = { "{name} (Sv. {level})  •  {lines} hat  •  hız ×{speed}  •  depo {used}/{max}  •  elektrik {elec}/gün", "{name} (Lv. {level})  •  {lines} lines  •  speed ×{speed}  •  warehouse {used}/{max}  •  power {elec}/day" },
	factory_upgrade = { "⬆️ Büyüt ({price})", "⬆️ Upgrade ({price})" },
	factory_max = { "En büyük fabrika!", "Biggest factory!" },
	factory_line = { "Hat", "Line" },
	factory_stop = { "Durdur", "Stop" },
	factory_idle = { "boşta", "idle" },
	factory_pick = { "Sağdaki listeden bir ürün seç: ilk boş hatta üretim başlar.", "Pick a product on the right: it starts on the first free line." },
	factory_product_sub = { "×{n} adet • {s} sn • malzeme {cost} • toptan {each}/adet", "×{n} units • {s} s • materials {cost} • wholesale {each} each" },
	factory_needs = { "🔒 Fabrika Sv. {n}", "🔒 Factory Lv. {n}" },
	factory_make = { "▶ Üret", "▶ Make" },
	factory_stock_sub = { "{n} adet • toptan {each}/adet", "{n} units • wholesale {each} each" },
	factory_ship = { "🚚 Dükkâna Gönder", "🚚 Ship to Shop" },
	factory_shipped = { "🚚 {n} ürün dükkâna gönderildi.", "🚚 {n} items shipped to your shop." },
	factory_sell = { "💰 Toptan Sat ({price})", "💰 Sell Wholesale ({price})" },
	factory_sold = { "💰 {n} ürün satıldı: {price}", "💰 {n} items sold: {price}" },
	factory_empty = { "Depo boş. Bir hat çalıştır!", "The warehouse is empty. Start a line!" },
	factory_left = { "{s} sn kaldı", "{s} s left" },
	factory_ready = { "Tamamlandı ✔", "Done ✔" },
	phone_courier = { "Kurye Sipariş", "Courier Order" },
	store_courier = { "Kurye ile Parça Siparişi", "Parts by Courier" },
	store_courier_hint = { "Fiyatlara %8 teslimat payı dahil, kurye dükkâna getirir.", "Prices include an 8% delivery charge; the courier brings them to the shop." },

	-- vehicles (more)
	garage_title = { "Araçlarım", "My Vehicles" },
	vehicle_seats = { "{n} kişilik", "{n} seats" },
	vehicle_color = { "Renk seç", "Pick a colour" },
	vehicle_called = { "Aracın yolun kenarında!", "Your ride is by the road!" },
	drive_hint = { "W/S gaz-fren • A/D direksiyon • Boşluk: in", "W/S throttle • A/D steer • Space: get out" },

	-- phone
	phone_shop = { "Dükkân", "Shop" },
	phone_staff = { "Ekibim", "My Team" },
	phone_garage = { "Garaj", "Garage" },
	phone_daily = { "Günlük Ödül", "Daily Reward" },
	phone_stats = { "İstatistik", "Stats" },
	phone_reviews = { "Yorumlar", "Reviews" },
	phone_settings = { "Ayarlar", "Settings" },
	phone_help = { "Nasıl Oynanır", "How to Play" },
	phone_bills = { "Faturalar", "Bills" },
	hud_bills = { "{n} ödenmemiş fatura", "{n} unpaid bills" },
	bills_week = { "Bu hafta: gelir {income} • gider {expense} • kâr {profit}", "This week: income {income} • spending {expense} • profit {profit}" },
	bills_lastweek = { "Geçen hafta kâr: {profit}", "Last week's profit: {profit}" },
	bills_none = { "Ödenmemiş fatura yok. 👍", "No unpaid bills. 👍" },
	bills_due = { "Son gün: {n} gün sonra", "Due in {n} days" },
	bills_today = { "Son gün: bugün", "Due today" },
	bills_late = { "{n} gün gecikti (+%{pct})", "{n} days late (+{pct}%)" },
	bills_pay = { "Öde", "Pay" },
	bills_payall = { "Hepsini Öde ({amount})", "Pay All ({amount})" },
	bills_paid = { "Ödenenler", "Paid" },
	bills_auto = { "🤖 Otomatik ödeme açık (muhasebeci / banka talimatı).", "🤖 Auto-pay is on (accountant / bank order)." },
	bills_hint = { "Faturalar her sabah gelir; kira, SGK ve vergi 7 günde bir. Geciken elektrik faturası elektriği keser.", "Bills come every morning; rent, social security and tax every 7 days. A late power bill cuts the power." },
	bills_detail = { "Elektrik {elec} • Su {water} • İnternet {net}", "Electricity {elec} • Water {water} • Internet {net}" },
	bills_profit = { "Haftalık kâr: {profit}", "Week's profit: {profit}" },
	bills_powercut = { "⚡ ELEKTRİK KESİK — faturayı öde!", "⚡ POWER CUT — pay the bill!" },
	bill_utilities = { "Elektrik • Su • İnternet", "Electricity • Water • Internet" },
	bill_rent = { "Dükkân Kirası", "Shop Rent" },
	bill_sgk = { "SGK Primleri", "Social Security" },
	bill_tax = { "Gelir Vergisi", "Income Tax" },
	bill_fine = { "Vergi Cezası", "Tax Penalty" },
	bill_insurance = { "Sigorta Primi", "Insurance Premium" },
	bill_inspection = { "Zabıta Cezası", "Inspection Fine" },
	bills_missing = { "Eksik: {list}", "Missing: {list}" },
	day_short = { "gün", "day" },
	look_counter = { "Tezgâh", "Counter" },
	look_bench = { "Çalışma Masaları", "Workbenches" },
	look_awning = { "Tente", "Awning" },
	shop_required = { "👮 Dükkân Sv. {n}+ zorunlu", "👮 Required from shop Lv. {n}" },
	store_gear = { "Ekipman", "Gear" },
	gear_hint = { "Envanter tuşlarıyla (1, 2...) eline al; sol tık ile kullan.", "Equip with the number keys (1, 2...); click to use." },
	reviews_none = { "Henüz yorum yok.", "No reviews yet." },
	settings_lang = { "Dil / Language", "Language / Dil" },
	settings_music = { "Müzik sesi", "Music volume" },
	settings_sfx = { "Efekt sesi", "Effects volume" },
	help_text = {
		"<b>1.</b> Tezgâhın önündeki müşteriyle konuş (E), pazarlık et, işi al.\n<b>2.</b> Tezgâha otur, işi yükle. Aleti seç (1-0), parçanın üzerine gel: yeşil = yapılabilir, kırmızı = neden olmadığını yazar.\n<b>3.</b> Vidaları sök, kabloları çıkar, arızalı parçayı bul. Güç, stres, POST kartı ve USB araçlarıyla test et.\n<b>4.</b> Parça lazımsa Mega Parça Deposu, Çarşı Parçacısı veya 2. El Pazarı'ndan al. Taksi ya da kendi aracınla git (M: harita).\n<b>5.</b> Her şeyi geri tak, işi bitir; müşteri gelip öder. Para ile dükkânı büyüt, alet ve araç al, personel tut.\n<b>Dikkat:</b> Hırsız ve dolandırıcıları F ile yakala! Bileklik takmadan kartlara dokunma.",
		"<b>1.</b> Talk to the customer at the counter (E), haggle, take the job.\n<b>2.</b> Sit at your bench and load the job. Pick a tool (1-0) and hover a part: green = possible, red tells you why not.\n<b>3.</b> Undo screws, unplug cables and find the faulty part. Test with power, stress test, POST card and USB tools.\n<b>4.</b> Need parts? Mega Parts Depot, the Bazaar stall or the Second-hand Market. Take a taxi or your own ride (M: map).\n<b>5.</b> Put everything back, finish the job and the customer pays. Expand your shop, buy tools and vehicles, hire staff.\n<b>Watch out:</b> catch thieves and scammers with F! Don't touch cards without your wrist strap.",
	},

	-- tutorial
	tut_step = { "EĞİTİM • ADIM {n}/{total}", "TUTORIAL • STEP {n}/{total}" },
	tut_open = { "🏠 Burası senin dükkânın! Kapıdaki kırmızı kurdeleye git ve E'ye basılı tutarak kes: dükkânın açılsın.", "🏠 This is your shop! Go to the red ribbon at the door and hold E to cut it: your shop opens." },
	tut_talk = { "👤 İlk müşterin geliyor! Tezgâhın önünde onunla konuş (E) ve işi kabul et.", "👤 Your first customer is coming! Talk to them at the counter (E) and accept the job." },
	tut_bench = { "🧰 Cihaz sende. Oka doğru git: tamir tezgâhına otur (E) ve cihazı tezgâha al.", "🧰 You have the device. Follow the arrow: sit at the repair bench (E) and load it." },
	tut_diagnose = { "🔍 Üstteki sarı Koç kartı sıradaki adımı söyler. Önce ⏻ Güç'e bas, ne olduğunu oku. Takılırsan 💡 ipucu iste: parçayı oklu gösterir.", "🔍 The yellow Coach card at the top tells you the next step. Press ⏻ Power first and read what happens. Stuck? Ask for a 💡 hint: it points at the part." },
	tut_finish = { "✅ Koç 'sorun yok' deyince her şeyi geri tak, ⏻ Güç ile tekrar dene ve 'İşi Bitir'e bas. Müşteri cihazını alıp ödemesini yapacak.", "✅ When the Coach says it looks good, put everything back, test again with ⏻ Power and press 'Finish Job'. The customer picks it up and pays." },
	tut_parts = { "🛒 Kazandın! Yedek parça lazım olunca Mega Parça Deposu'na gidersin. Yerdeki sarı yolu ve oku takip et (ya da arabanla git).", "🛒 You got paid! When you need spare parts, go to the Mega Parts Depot. Follow the yellow trail and the arrow (or drive)." },
	tut_phone = { "📱 Telefonundan dükkânı geliştir, eleman al, görev ve faturalara bak. Telefon düğmesine bas (P).", "📱 Your phone upgrades the shop, hires staff, shows tasks and bills. Press the phone button (P)." },
	tut_map = { "🗺️ Haritada (M) her yer yazar: dükkânın 🏠, parçacılar, pazarlar, galeriler. Bir yere tıkla, yol tarifi al. İyi işler usta!", "🗺️ The map (M) shows everything: your shop 🏠, parts stores, markets, dealers. Click a place for directions. Good luck!" },
	guide_dist = { "{m} m", "{m} m" },
	guide_home = { "DÜKKANIN", "YOUR SHOP" },
	tut_skip = { "Geç", "Skip" },

	-- misc
	travel_home = { "Dükkâna ışınlanıyorsun...", "Heading back to your shop..." },
	taxi_paid = { "🚕 Taksi: {fare}", "🚕 Taxi: {fare}" },
	daily_ready = { "🎁 Günlük ödülün hazır! (Telefon)", "🎁 Your daily reward is ready! (Phone)" },

	-- errors
	e_money = { "Yeterli paran yok.", "Not enough money." },
	e_storage = { "Depon dolu! Parça sat ya da raf al.", "Storage full! Sell parts or buy shelving." },
	e_level = { "Seviyen yetmiyor.", "Your level is too low." },
	e_far = { "Tezgâhtan uzaklaştın.", "You walked away from the counter." },
	e_sold = { "Bu ürün satıldı.", "That's already sold." },
	e_owned = { "Bu zaten sende var.", "You already own that." },
	e_capacity = { "Personel kapasiten dolu. Dükkânı büyüt.", "Staff capacity full. Expand your shop." },
	e_factory_level = { "Bu ürün için fabrikanı büyüt.", "Upgrade your factory to make this." },
	e_factory_full = { "Fabrika deposu dolu: ürünleri dükkâna gönder ya da sat.", "The factory warehouse is full: ship or sell some goods." },
	e_no_factory = { "Önce Sanayi Sitesi'nden bir fabrika al.", "Buy a factory at the Industrial Estate first." },
	e_none = { "Depoda bu üründen yok.", "None of that in the warehouse." },
	e_bad_request = { "Geçersiz istek.", "Invalid request." },
	e_need_staff = { "Önce en az bir çalışanın olmalı.", "You need at least one employee first." },
	e_raised_today = { "Bugün ona zaten zam yaptın.", "You already gave them a raise today." },
	e_no_courier = { "Telefondan sipariş için önce bir kurye işe al.", "Hire a courier to order from the phone." },
	e_shop_level = { "Dükkân seviyen yetmiyor.", "Your shop level is too low." },
	e_role_max = { "Bu pozisyon dolu.", "That position is filled." },
	e_cooldown = { "Biraz bekle ({wait} sn).", "Wait a moment ({wait}s)." },
	e_too_fast = { "Yavaş ol!", "Slow down!" },
	e_rate_limited = { "Çok hızlı tıklıyorsun.", "You're clicking too fast." },
	e_network = { "Bağlantı sorunu, tekrar dene.", "Connection problem, try again." },
	e_gone = { "Müşteri gitti.", "The customer left." },
	e_not_sold_here = { "Bu parça burada satılmıyor.", "That part isn't sold here." },
	e_jobs_full = { "İş listen dolu! Önce bazılarını bitir.", "Your job list is full! Finish some first." },
	e_claimed = { "Bugünkü ödülü zaten aldın.", "You already claimed today's reward." },
	e_already = { "Bu zaten var.", "Already done." },
	e_internal = { "Sunucu hatası, tekrar dene.", "Server error, try again." },
	e_not_owned = { "Bu araç sende yok.", "You don't own that vehicle." },
	e_wait = { "Biraz bekle.", "Wait a moment." },
	e_filter = { "Bu isim kullanılamaz.", "That name can't be used." },
	e_max = { "En üst seviyedesin.", "Already at the top level." },
	e_not_sellable = { "Bu iş satılamaz.", "That job can't be sold." },
	e_no_job = { "Tezgâhta iş yok.", "There's no job on the bench." },
	e_no_session = { "Önce tezgâha otur.", "Sit at a bench first." },
	e_busy = { "Bu iş başka bir tezgâhta.", "That job is on another bench." },
	e_bench_busy = { "Tezgâh dolu.", "The bench is busy." },
	e_not_found = { "Bulunamadı.", "Not found." },
	e_bad = { "Geçersiz istek.", "Invalid request." },
	e_not_done = { "Bu görev henüz bitmedi.", "That task isn't finished yet." },
	e_contract_busy = { "Önce elindeki sözleşmeyi bitir.", "Finish your current contract first." },
	e_contract_desk = { "Bunun için dükkânında Kurumsal Sözleşme Ofisi olmalı.", "You need the Corporate Contracts Desk in your shop." },
	e_power_cut = { "⚡ Elektrik kesik! Önce faturayı öde (telefon ▸ Faturalar).", "⚡ The power is cut! Pay the bill first (phone ▸ Bills)." },
	e_generic = { "Olmadı: {err}", "That didn't work: {err}" },
}

local function lookup(key: string): string
	local e = T[key]
	if not e then
		return key
	end
	return if lang == "en" then e[2] else e[1]
end

function S.t(key: string, vars: { [string]: any }?): string
	local s = lookup(key)
	if vars then
		s = string.gsub(s, "{(%w+)}", function(k)
			local v = vars[k]
			return if v ~= nil then tostring(v) else ""
		end)
	end
	return s
end

function S.has(key: string): boolean
	return T[key] ~= nil
end

-- Localised picks from data tables shaped { tr = ..., en = ... }
function S.pick(t: any): string
	if type(t) ~= "table" then
		return tostring(t or "")
	end
	return (if lang == "en" then t.en else t.tr) or t.tr or t.en or ""
end

function S.lang(): string
	return lang
end

function S.setLang(l: string)
	lang = if l == "en" then "en" else "tr"
end

function S.detect()
	local ok, id = pcall(function()
		return Players.LocalPlayer.LocaleId
	end)
	if ok and type(id) == "string" and string.sub(id, 1, 2) ~= "tr" then
		lang = "en"
	end
end

function S.money(n: number?): string
	local v = math.floor((n or 0) + 0.5)
	local s = tostring(math.abs(v))
	local out = s:reverse():gsub("(%d%d%d)", "%1."):reverse()
	if string.sub(out, 1, 1) == "." then
		out = string.sub(out, 2)
	end
	return (if v < 0 then "-" else "") .. Config.CurrencySymbol .. out
end

function S.err(e: string?, vars: { [string]: any }?): string
	if e and T["e_" .. e] then
		return S.t("e_" .. e, vars)
	end
	return S.t("e_generic", { err = e or "?" })
end

function S.stars(n: number): string
	return string.rep("★", math.clamp(n, 0, 5)) .. string.rep("☆", 5 - math.clamp(n, 0, 5))
end

return S
