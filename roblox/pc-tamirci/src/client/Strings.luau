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
	store_board = { "Belediye — Liderler", "City Hall — Leaders" },
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
	staff_refresh = { "Yeni Adaylar (50)", "New Candidates (50)" },
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
	t_wages_paid = { "💼 Maaşlar ödendi: {amount}", "💼 Wages paid: {amount}" },
	t_staff_quit = { "😞 Maaş ödenemedi, {name} işi bıraktı.", "😞 Couldn't pay wages, {name} quit." },
	t_thief_caught = { "🚨 Hırsız yakalandı! {by} • ödül {bounty}", "🚨 Thief caught! {by} • bounty {bounty}" },
	t_bounty = { "Ödül: {amount}", "Bounty: {amount}" },
	t_thief_escaped = { "🦹 Hırsız kaçtı! {cash} {part}", "🦹 The thief escaped! {cash} {part}" },
	t_camera_alert = { "📹 Kamera: dükkâna şüpheli biri girdi!", "📹 Camera: a suspicious person just walked in!" },
	t_alarm = { "🚨 ALARM! Hırsız kasada! Yakala (F)!", "🚨 ALARM! Thief at the register! Catch them (F)!" },
	reason_need_part = { "parça lazım:", "needs a part:" },
	reason_need_tool = { "alet lazım:", "needs a tool:" },
	reason_stuck = { "çözemedi", "couldn't solve it" },
	level_up = { "🎉 Seviye atladın! Seviye {n}", "🎉 Level up! Level {n}" },

	-- errors
	e_money = { "Yeterli paran yok.", "Not enough money." },
	e_storage = { "Depon dolu! Parça sat ya da raf al.", "Storage full! Sell parts or buy shelving." },
	e_level = { "Seviyen yetmiyor.", "Your level is too low." },
	e_far = { "Tezgâhtan uzaklaştın.", "You walked away from the counter." },
	e_sold = { "Bu ürün satıldı.", "That's already sold." },
	e_owned = { "Bu zaten sende var.", "You already own that." },
	e_capacity = { "Personel kapasiten dolu. Dükkânı büyüt.", "Staff capacity full. Expand your shop." },
	e_shop_level = { "Dükkân seviyen yetmiyor.", "Your shop level is too low." },
	e_role_max = { "Bu pozisyon dolu.", "That position is filled." },
	e_cooldown = { "Biraz bekle ({wait} sn).", "Wait a moment ({wait}s)." },
	e_too_fast = { "Yavaş ol!", "Slow down!" },
	e_rate_limited = { "Çok hızlı tıklıyorsun.", "You're clicking too fast." },
	e_network = { "Bağlantı sorunu, tekrar dene.", "Connection problem, try again." },
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
