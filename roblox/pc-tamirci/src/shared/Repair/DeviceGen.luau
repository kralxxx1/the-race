-- DeviceGen: builds believable, internally consistent devices for customers, the scrapyard and
-- custom-build orders, then applies faults or upgrade requests to them.

local Shared = script.Parent.Parent
local Parts = require(Shared.Data.Parts)
local Devices = require(Shared.Data.Devices)
local Faults = require(Shared.Data.Faults)
local Templates = require(script.Parent.DeviceTemplates)
local Rules = require(script.Parent.RepairRules)
local Rand = require(Shared.Util.Rand)

local DeviceGen = {}

-- Desktop tiers: cpu/gpu perf windows, years, memory and style preferences.
DeviceGen.Tiers = {
	retro = { cpu = { 0, 20 }, years = { 2007, 2014 }, gpu = { 0, 14 }, gpuChance = 0.6, ram = { 2, 8 }, sticks = 2, storage = "hdd", cooler = "stock", cases = { "case_retro" }, fans = { 1, 1 }, psu = "cheap" },
	office = { cpu = { 8, 45 }, years = { 2015, 2024 }, gpu = nil, gpuChance = 0, igpu = true, ram = { 4, 16 }, sticks = 1, storage = "ssd", cooler = "stock", cases = { "case_office", "case_sff" }, fans = { 1, 1 }, psu = "oem" },
	budget = { cpu = { 14, 45 }, years = { 2017, 2024 }, gpu = { 8, 30 }, gpuChance = 1, ram = { 8, 8 }, sticks = 2, storage = "ssd", cooler = "stock", cases = { "case_budgetrgb", "case_q300l", "case_popair", "case_versah18", "case_jonsbod41", "case_air903" }, fans = { 1, 3 }, psu = "budget" },
	mid = { cpu = { 30, 62 }, years = { 2019, 2025 }, gpu = { 24, 52 }, gpuChance = 1, ram = { 8, 16 }, sticks = 2, storage = "nvme", cooler = "air", cases = { "case_4000d", "case_h5flow", "case_popair", "case_north", "case_budgetrgb", "case_lancool216", "case_xtpro", "case_td500", "case_ch560", "case_pb500dx", "case_h7flow", "case_3500x" }, fans = { 2, 4 }, psu = "good" },
	high = { cpu = { 50, 86 }, years = { 2020, 2025 }, gpu = { 45, 82 }, gpuChance = 1, ram = { 16, 32 }, sticks = 2, storage = "nvme", cooler = "aio", cases = { "case_o11evo", "case_4000dw", "case_north", "case_nv7", "case_h5flow", "case_lancool3w", "case_5000d", "case_h9flow", "case_o11airmini", "case_y60" }, fans = { 3, 6 }, psu = "good" },
	enthusiast = { cpu = { 75, 101 }, years = { 2022, 2025 }, gpu = { 70, 130 }, gpuChance = 1, ram = { 16, 48 }, sticks = 2, storage = "nvme2", cooler = "aio", cases = { "case_o11vision", "case_nv7", "case_define7xl", "case_o11evo", "case_torrent", "case_northxl", "case_hyperion", "case_h9flow" }, fans = { 4, 6 }, psu = "premium" },
	workstation = { cpu = { 60, 141 }, years = { 2021, 2025 }, gpu = { 28, 95 }, gpuChance = 1, workstationGpu = true, ram = { 32, 64 }, sticks = 4, storage = "nvme2", cooler = "air", cases = { "case_define7xl", "case_north", "case_torrent", "case_5000d" }, fans = { 3, 6 }, psu = "premium" },
}

local PSU_GROUPS = {
	cheap = { "psu_turbox500", "psu_lite450", "psu_fsp500" },
	oem = { "psu_oem300", "psu_lite450", "psu_dell240" },
	budget = { "psu_mwe550", "psu_cv650", "psu_turbox500", "psu_cx550", "psu_a650bn", "psu_evga600", "psu_smart500" },
	good = { "psu_pp12m650", "psu_rm750e", "psu_focus750", "psu_a850gl", "psu_rm850x", "psu_focus650", "psu_mwe750", "psu_pq750m", "psu_c850", "psu_v850", "psu_g6_850" },
	premium = { "psu_rm850x", "psu_vertex1000", "psu_thor1200", "psu_dpp1300", "psu_ax1600i", "psu_sp12_850", "psu_gf3_1000", "psu_rm1000x", "psu_prime1300", "psu_hx1500i" },
}

local function filter(list, fn)
	local out = {}
	for _, p in list do
		if fn(p) then
			table.insert(out, p)
		end
	end
	return out
end

local function pick(rng, list, fallback)
	if #list == 0 then
		return fallback
	end
	return list[rng:NextInteger(1, #list)]
end

local function chooseCpu(rng, tier)
	local cands = filter(Parts.byCat.cpu, function(c)
		return c.perf >= tier.cpu[1] and c.perf <= tier.cpu[2] and c.year >= tier.years[1] - 1 and c.year <= tier.years[2] and (not tier.igpu or c.igpu)
	end)
	return pick(rng, cands, Parts.get("cpu_i5_12400f"))
end

local function chooseBoard(rng, cpu, tierName)
	local cands = filter(Parts.byCat.mobo, function(m)
		return m.socket == cpu.socket
	end)
	if tierName == "budget" or tierName == "office" then
		local cheap = filter(cands, function(m)
			return m.price <= 130
		end)
		if #cheap > 0 then
			cands = cheap
		end
	elseif tierName == "high" or tierName == "enthusiast" then
		local fancy = filter(cands, function(m)
			return m.price >= 150 and m.form == "ATX"
		end)
		if #fancy > 0 then
			cands = fancy
		end
	end
	if tierName == "office" then
		local withVideo = filter(cands, function(m)
			return m.video and m.form ~= "ATX"
		end)
		if #withVideo > 0 then
			cands = withVideo
		end
	end
	return pick(rng, cands, Parts.byCat.mobo[1])
end

local function chooseRam(rng, mobo, tier)
	local cands = filter(Parts.byCat.ram, function(r)
		return r.form == "DIMM" and r.mem == mobo.mem and r.size >= tier.ram[1] / 2 and r.size <= tier.ram[2]
	end)
	if #cands == 0 then
		cands = filter(Parts.byCat.ram, function(r)
			return r.form == "DIMM" and r.mem == mobo.mem
		end)
	end
	return pick(rng, cands, nil)
end

local function chooseGpu(rng, tier, cpu, case)
	if not tier.gpu or rng:NextNumber() > tier.gpuChance then
		return nil
	end
	local cands = filter(Parts.byCat.gpu, function(g)
		local ok = g.perf >= tier.gpu[1] and g.perf <= tier.gpu[2] and g.year <= cpu.year + 3 and g.year >= cpu.year - 4
		if tier.workstationGpu then
			ok = ok and g.workstation == true
		elseif g.workstation then
			ok = false
		end
		if case then
			ok = ok and g.len <= case.gpuMax and (not case.lowProfileOnly or g.lowProfile)
		end
		return ok
	end)
	if #cands == 0 then
		cands = filter(Parts.byCat.gpu, function(g)
			return g.perf >= tier.gpu[1] and g.perf <= tier.gpu[2] and not g.workstation and (not case or g.len <= case.gpuMax)
		end)
	end
	return pick(rng, cands, nil)
end

local function chooseCooler(rng, tier, cpu)
	local socket = cpu.socket
	local kind = tier.cooler
	if cpu.tdp > 110 and kind == "stock" then
		kind = "air"
	end
	-- the cooler has to keep up with the CPU (a 350 W Threadripper needs a 360 mm AIO)
	local cands = filter(Parts.byCat.cooler, function(c)
		return c.kind == kind and Parts.coolerFits(c, socket) and c.rating >= cpu.tdp * 0.9
	end)
	if #cands == 0 then
		cands = filter(Parts.byCat.cooler, function(c)
			return Parts.coolerFits(c, socket) and c.rating >= cpu.tdp * 0.9
		end)
	end
	if #cands == 0 then
		cands = filter(Parts.byCat.cooler, function(c)
			return Parts.coolerFits(c, socket)
		end)
	end
	return pick(rng, cands, Parts.get("cool_hyper212"))
end

local function choosePsu(rng, tier, cpu, gpu)
	local draw = Parts.systemDraw(cpu, gpu)
	local group = PSU_GROUPS[tier.psu] or PSU_GROUPS.good
	local cands = {}
	for _, id in group do
		local p = Parts.get(id)
		if p and p.watt >= draw * 1.25 then
			table.insert(cands, p)
		end
	end
	if #cands == 0 then
		cands = filter(Parts.byCat.psu, function(p)
			return p.watt >= draw * 1.25 and p.form == "ATX"
		end)
	end
	return pick(rng, cands, Parts.get("psu_rm850x"))
end

local function chooseCase(rng, tier, mobo)
	local cands = {}
	for _, id in tier.cases do
		local c = Parts.get(id)
		if c and Parts.caseFits(c, mobo.form) then
			table.insert(cands, c)
		end
	end
	if mobo.form == "ITX" and rng:NextNumber() < 0.6 then
		return Parts.get(if rng:NextNumber() < 0.7 then "case_nr200p" else "case_terra")
	end
	if #cands == 0 then
		cands = filter(Parts.byCat.case, function(c)
			return Parts.caseFits(c, mobo.form) and c.style ~= "retro"
		end)
	end
	return pick(rng, cands, Parts.get("case_4000d"))
end

local function storageFor(rng, tierName, tier)
	local s = tier.storage
	local out = {}
	local function any(kind, maxPrice)
		return pick(rng, filter(Parts.byCat.storage, function(p)
			return p.kind == kind and p.price <= maxPrice
		end), nil)
	end
	if s == "hdd" then
		out.hdd1 = any("hdd35", 60)
	elseif s == "ssd" then
		if rng:NextNumber() < 0.35 then
			out.hdd1 = any("hdd35", 60)
		else
			out.ssd1 = any("ssd25", 90)
		end
		if tierName == "budget" and rng:NextNumber() < 0.4 then
			out.hdd1 = out.hdd1 or any("hdd35", 60)
		end
	elseif s == "nvme" then
		out.nvme1 = any("nvme", 170)
		if rng:NextNumber() < 0.45 then
			out.hdd1 = any("hdd35", 90)
		end
	elseif s == "nvme2" then
		out.nvme1 = any("nvme", 320)
		if rng:NextNumber() < 0.6 then
			out.nvme2 = any("nvme", 320)
		end
	end
	return out
end

----------------------------------------------------------------------------------------------------
-- State construction
----------------------------------------------------------------------------------------------------
local function initState(kind: string, model: string)
	local T = Templates[kind]
	local dev = {
		kind = kind,
		model = model,
		nodes = {},
		paste = { st = "old", q = 0.55 },
		sw = { bios = "ok" },
		orient = "top",
		lid = "closed",
		liquid = 0,
		tray = {},
		strap = false,
		ties = false,
		tests = 0,
		hidden = {},
		orig = {},
		nextUid = 0,
	}
	for _, id in T.order do
		local tn = T.nodes[id]
		local s: { [string]: any } = {}
		if tn.kind == "root" or tn.kind == "panel" or tn.kind == "board" or tn.kind == "feet" then
			s.st = "in"
		elseif tn.kind == "comp" then
			s.st = "empty"
		elseif tn.kind == "screw" or tn.kind == "cable" then
			s.st = "out"
		elseif tn.kind == "latch" then
			s.st = "closed"
		elseif tn.kind == "pins" then
			s.st = "ok"
		end
		if tn.dusty then
			s.dust = 0
		end
		dev.nodes[id] = s
	end
	if kind == "laptop" then
		dev.nodes.lboard.dust = 0
	end
	return dev
end

local function setPart(dev, id: string, partId: string?, cond: number?)
	if not partId then
		return
	end
	local s = dev.nodes[id]
	s.part = partId
	s.st = "in"
	s.cond = cond or 1
	dev.orig[id] = true
end

-- After parts are placed: screws in where the owner is fitted, cables plugged where both ends are.
local function settle(dev)
	local T = Templates[dev.kind]
	for _, id in T.order do
		local tn = T.nodes[id]
		local s = dev.nodes[id]
		if not Rules.available(dev, id) then
			if tn.kind == "comp" then
				s.st = "empty"
				s.part = nil
				dev.orig[id] = nil
			end
		end
	end
	for _, id in T.order do
		local tn = T.nodes[id]
		local s = dev.nodes[id]
		if tn.kind == "screw" then
			local os = dev.nodes[tn.owner].st
			s.st = if os == "in" and Rules.available(dev, id) then "in" else "out"
		elseif tn.kind == "cable" then
			local a, b = dev.nodes[tn.ends[1]].st, dev.nodes[tn.ends[2]].st
			s.st = if a == "in" and b == "in" and Rules.available(dev, id) then "in" else "out"
		end
	end
end

local function baseDust(dev, rng, lo, hi)
	for _, s in dev.nodes do
		if s.dust ~= nil then
			s.dust = Rand.range(rng, lo, hi)
		end
	end
end

local function setBootDrive(dev)
	for _, d in Rules.drives(dev) do
		local s = dev.nodes[d]
		if s and s.st == "in" and s.part then
			if not dev.boot then
				dev.boot = d
				s.os = "ok"
				s.virus = 0
			else
				s.os = "none"
				s.virus = 0
			end
		end
	end
end

-- Desktop for a tier ("retro", "office", "budget", "mid", "high", "enthusiast", "workstation").
function DeviceGen.desktop(rng: Random, tierName: string)
	local tier = DeviceGen.Tiers[tierName] or DeviceGen.Tiers.mid
	local cpu = chooseCpu(rng, tier)
	local mobo = chooseBoard(rng, cpu, tierName)
	local case = if tierName == "retro" then Parts.get("case_retro") else chooseCase(rng, tier, mobo)
	if not Parts.caseFits(case, mobo.form) then
		case = Parts.get("case_4000d")
	end
	local gpu = chooseGpu(rng, tier, cpu, case)
	if not gpu and not (cpu.igpu and mobo.video) then
		-- every PC needs a picture: give it a cheap card
		gpu = pick(rng, filter(Parts.byCat.gpu, function(g)
			return g.perf <= 20 and not g.workstation and g.len <= case.gpuMax and (not case.lowProfileOnly or g.lowProfile)
		end), Parts.get("gpu_gt710"))
	end
	local ram = chooseRam(rng, mobo, tier)
	local cooler = chooseCooler(rng, tier, cpu)
	local psu = choosePsu(rng, tier, cpu, gpu)
	if case.style == "itx" then
		psu = Parts.get("psu_sf750")
	end

	local dev = initState("desktop", case.id)
	setPart(dev, "mobo", mobo.id)
	setPart(dev, "psu", psu.id, Rand.range(rng, 0.6, 1))
	setPart(dev, "cpu", cpu.id)
	setPart(dev, "cooler", cooler.id, Rand.range(rng, 0.6, 1))
	if gpu then
		setPart(dev, "gpu", gpu.id, Rand.range(rng, 0.6, 1))
	end
	local sticks = math.min(tier.sticks, mobo.memSlots)
	if ram then
		local order = if sticks == 2 and mobo.memSlots == 4 then { 2, 4 } else { 1, 2, 3, 4 }
		for i = 1, sticks do
			setPart(dev, "ram" .. order[i], ram.id, Rand.range(rng, 0.7, 1))
		end
	end
	for slot, part in storageFor(rng, tierName, tier) do
		if slot == "hdd1" and (case.style == "itx" or case.style == "sff") then
			slot = "ssd1"
			part = Parts.get("st_ssd480")
		end
		if string.match(slot, "^nvme") and mobo.m2 == 0 then
			slot = "ssd1"
			part = Parts.get("st_ssd480")
		end
		if part then
			setPart(dev, slot, part.id, Rand.range(rng, 0.6, 1))
		end
	end
	setPart(dev, "cmos", "cmos_cr2032")
	for i = 1, 6 do
		setPart(dev, "cap" .. i, "cap_470")
	end
	-- fans
	local nFans = math.min(case.fanSlots, rng:NextInteger(tier.fans[1], tier.fans[2]))
	local fanModel
	if tierName == "retro" then
		fanModel = "fan_std80"
	elseif tierName == "high" or tierName == "enthusiast" then
		fanModel = Rand.pick(rng, { "fan_af120rgb", "fan_sl120", "fan_nfa12", "fan_p12" })
	elseif tierName == "mid" then
		fanModel = Rand.pick(rng, { "fan_p12", "fan_af120rgb", "fan_std120", "fan_p14" })
	else
		fanModel = "fan_std120"
	end
	for i = 1, nFans do
		setPart(dev, Rules.FanOrder[i], fanModel, Rand.range(rng, 0.6, 1))
	end
	settle(dev)
	setBootDrive(dev)
	local age = 2026 - cpu.year
	dev.paste = if age >= 4 then { st = "old", q = 0.45 } else { st = "fresh", q = 0.8 }
	baseDust(dev, rng, 0.02, math.clamp(age * 0.04, 0.05, 0.22))
	dev.ties = rng:NextNumber() < (if tierName == "high" or tierName == "enthusiast" then 0.6 else 0.15)
	dev.tier = tierName
	return dev
end

function DeviceGen.laptop(rng: Random, classFilter: { string }?)
	local cands = filter(Devices.laptops, function(l)
		return not classFilter or table.find(classFilter, l.class) ~= nil
	end)
	local model = pick(rng, cands, Devices.laptops[1])
	local dev = initState("laptop", model.id)
	dev.lclass = model.class
	setPart(dev, "battery", "lp_battery_" .. model.class, Rand.range(rng, 0.5, 1))
	setPart(dev, "lfan", "lp_fan_" .. model.class, Rand.range(rng, 0.6, 1))
	setPart(dev, "keyboard", "lp_keyboard_" .. model.class)
	setPart(dev, "screen", "lp_screen_" .. model.class)
	setPart(dev, "hinges", "lp_hinge_" .. model.class)
	setPart(dev, "dcjack", "lp_dcjack_" .. model.class)
	setPart(dev, "lcmos", "cmos_cr2032")
	setPart(dev, "lwifi", Rand.pick(rng, { "wifi_ax200", "wifi_ax210" }))
	local ram = pick(rng, filter(Parts.byCat.ram, function(r)
		return r.form == "SODIMM" and r.mem == model.mem and r.size <= 16
	end), nil)
	if ram then
		for i = 1, model.ramSlots do
			if i == 1 or rng:NextNumber() < 0.6 then
				setPart(dev, "lram" .. i, ram.id, Rand.range(rng, 0.7, 1))
			end
		end
	end
	if model.class == "budget15" and rng:NextNumber() < 0.45 then
		setPart(dev, "lsata", Rand.pick(rng, { "st_hdd25_500", "st_hdd25_1t" }), Rand.range(rng, 0.5, 0.9))
		if rng:NextNumber() < 0.5 then
			setPart(dev, "lnvme", "st_nv500sn580")
		end
	else
		setPart(dev, "lnvme", Rand.pick(rng, { "st_nv500sn580", "st_nv1tnv2", "st_nv1tsn770", "st_nv1t970" }))
	end
	settle(dev)
	-- a 2.5" HDD is the boot drive on old budget machines
	if dev.nodes.lsata.st == "in" and (dev.nodes.lnvme.st ~= "in" or rng:NextNumber() < 0.5) then
		dev.boot = "lsata"
		dev.nodes.lsata.os = "ok"
		dev.nodes.lsata.virus = 0
		if dev.nodes.lnvme.st == "in" then
			dev.nodes.lnvme.os = "none"
			dev.nodes.lnvme.virus = 0
		end
	else
		setBootDrive(dev)
	end
	local age = 2026 - model.year
	dev.paste = if age >= 3 then { st = "old", q = 0.45 } else { st = "fresh", q = 0.8 }
	baseDust(dev, rng, 0.02, math.clamp(age * 0.05, 0.05, 0.22))
	dev.nodes.lboard.dust = 0
	return dev
end

-- An empty case for custom builds.
function DeviceGen.emptyCase(caseId: string)
	local dev = initState("desktop", caseId)
	dev.paste = { st = "none", q = 0 }
	dev.build = true
	settle(dev)
	return dev
end

----------------------------------------------------------------------------------------------------
-- Faults
----------------------------------------------------------------------------------------------------
local function installedOf(dev, ids)
	local out = {}
	for _, id in ids do
		local s = dev.nodes[id]
		if s and s.st == "in" and s.part then
			table.insert(out, id)
		end
	end
	return out
end

local function bootKind(dev)
	local b = dev.boot
	local p = b and Rules.part(dev, b)
	return p and p.kind
end
DeviceGen.bootKind = bootKind

-- Applies fault `id`. Returns false if the fault doesn't fit this device.
function DeviceGen.applyFault(dev, id: string, rng: Random): boolean
	local H = dev.hidden
	local desktop = dev.kind == "desktop"
	if id == "psu_dead" then
		H.psu = "dead"
	elseif id == "psu_weak" then
		local gpu = Rules.part(dev, "gpu")
		if not gpu then
			return false
		end
		dev.nodes.psu.part = Rand.pick(rng, { "psu_turbox500", "psu_lite450" })
		H.psu = "weak"
	elseif id == "gpu_dead" or id == "gpu_artifacts" then
		if not Rules.part(dev, "gpu") then
			return false
		end
		H.gpu = if id == "gpu_dead" then "dead" else "artifacts"
	elseif id == "ram_faulty" then
		local sticks = installedOf(dev, if desktop then { "ram1", "ram2", "ram3", "ram4" } else { "lram1", "lram2" })
		if #sticks == 0 then
			return false
		end
		H[Rand.pick(rng, sticks)] = "faulty"
	elseif id == "ram_unseated" then
		local sticks = installedOf(dev, { "ram1", "ram2", "ram3", "ram4" })
		if #sticks == 0 then
			return false
		end
		H[Rand.pick(rng, sticks)] = "unseated"
	elseif id == "cpu_paste" then
		local cpu = Rules.part(dev, "cpu")
		if not cpu or cpu.tdp < 45 then
			return false
		end
		dev.paste = { st = "dry", q = 0.1 }
	elseif id == "no_paste" then
		dev.paste = { st = "none", q = 0 }
	elseif id == "dust" then
		for nid, s in dev.nodes do
			if s.dust ~= nil and nid ~= "lboard" then
				s.dust = Rand.range(rng, 0.7, 1)
			end
		end
	elseif id == "fan_dead" or id == "fan_noisy" then
		local fans = installedOf(dev, Rules.FanOrder)
		if #fans == 0 then
			if id == "fan_dead" then
				H.cooler = "fan_dead"
				return true
			end
			return false
		end
		if id == "fan_dead" and rng:NextNumber() < 0.35 then
			H.cooler = "fan_dead"
		else
			H[Rand.pick(rng, fans)] = if id == "fan_dead" then "dead" else "noisy"
		end
	elseif id == "hdd_failing" then
		local k = bootKind(dev)
		if k ~= "hdd35" and k ~= "hdd25" then
			return false
		end
		H[dev.boot] = "failing"
	elseif id == "ssd_dead" then
		if not dev.boot then
			return false
		end
		H[dev.boot] = "dead"
	elseif id == "os_corrupt" then
		if not dev.boot then
			return false
		end
		dev.nodes[dev.boot].os = "corrupt"
	elseif id == "virus" then
		if not dev.boot then
			return false
		end
		dev.nodes[dev.boot].virus = rng:NextInteger(5, 42)
	elseif id == "cmos_low" then
		H[if desktop then "cmos" else "lcmos"] = "low"
	elseif id == "bios_outdated" then
		local cpu = Rules.part(dev, "cpu")
		local mobo = Rules.part(dev, "mobo")
		if not cpu or not mobo or cpu.year <= mobo.year then
			return false
		end
		dev.sw.bios = "old"
	elseif id == "cap_bulged" then
		H["cap" .. rng:NextInteger(1, 6)] = "bulged"
	elseif id == "mobo_dead" then
		H.mobo = "dead"
	elseif id == "cpu_dead" then
		H.cpu = "dead"
	elseif id == "bent_pins" then
		dev.nodes.socket.st = "bent"
	elseif id == "cable_loose" then
		local gpu = Rules.part(dev, "gpu")
		if gpu and #Parts.gpuConnectors(gpu) > 0 then
			dev.nodes.cpcie1.st = "loose"
		else
			dev.nodes.ceps.st = "loose"
		end
	elseif id == "lap_battery_worn" then
		H.battery = "worn"
	elseif id == "lap_battery_swollen" then
		H.battery = "swollen"
	elseif id == "lap_screen" then
		H.screen = "cracked"
	elseif id == "lap_keyboard" then
		H.keyboard = "dead_keys"
		dev.liquid = 0.22
	elseif id == "lap_overheat" then
		dev.paste = { st = "dry", q = 0.1 }
		dev.nodes.lfan.dust = Rand.range(rng, 0.75, 1)
	elseif id == "lap_fan_noisy" then
		H.lfan = "noisy"
	elseif id == "lap_dcjack" then
		H.dcjack = "dead"
	elseif id == "lap_hinge" then
		H.hinges = "broken"
	elseif id == "lap_liquid" then
		dev.liquid = Rand.range(rng, 0.7, 1)
	elseif id == "lap_wifi" then
		H.lwifi = "dead"
	else
		return false
	end
	dev.faults = dev.faults or {}
	table.insert(dev.faults, id)
	return true
end

----------------------------------------------------------------------------------------------------
-- Requests (upgrades, maintenance, builds) and their checks
----------------------------------------------------------------------------------------------------
function DeviceGen.applyRequest(dev, id: string, rng: Random, budget: number?): { [string]: any }?
	if id == "upgrade_ram" then
		local total = Rules.ramTotal(dev, false)
		-- the most this machine can take with the sticks that exist for it
		local mem, form, slots, soldered
		if dev.kind == "laptop" then
			local m = Rules.laptopModel(dev)
			if not m or m.ramSlots == 0 then
				return nil
			end
			mem, form, slots, soldered = m.mem, "SODIMM", m.ramSlots, m.soldered
		else
			local mobo = Rules.part(dev, "mobo")
			if not mobo then
				return nil
			end
			mem, form, slots, soldered = mobo.mem, "DIMM", mobo.memSlots, 0
		end
		local biggest = 0
		for _, r in Parts.byCat.ram do
			if r.mem == mem and r.form == form then
				biggest = math.max(biggest, r.size)
			end
		end
		local maxTotal = biggest * slots + soldered
		local target = math.min(math.max(16, total * 2), maxTotal)
		if target <= total then
			return nil
		end
		return { id = id, ramMin = target, vars = { target = target } }
	elseif id == "upgrade_ssd" then
		local k = bootKind(dev)
		if k ~= "hdd35" and k ~= "hdd25" then
			return nil
		end
		return { id = id, bootSsd = true }
	elseif id == "upgrade_gpu" then
		local gpu = Rules.part(dev, "gpu")
		if dev.kind ~= "desktop" or not gpu then
			return nil
		end
		local minPerf = math.floor(gpu.perf * 1.4 + 6)
		local b = budget or 400
		-- only ask for what exists, fits the case and roughly fits the budget
		local case = Parts.get(dev.model)
		local possible = false
		for _, p in Parts.byCat.gpu do
			if p.perf >= minPerf and not p.workstation and p.price <= b * 1.5 and (not case or not case.gpuMax or p.len <= case.gpuMax) then
				possible = true
				break
			end
		end
		if not possible then
			return nil
		end
		return { id = id, gpuMin = minPerf, partBudget = b, vars = { budget = b } }
	elseif id == "maintenance" then
		for nid, s in dev.nodes do
			if s.dust ~= nil and nid ~= "lboard" then
				s.dust = Rand.range(rng, 0.45, 0.8)
			end
		end
		dev.paste = { st = "old", q = 0.4 }
		return { id = id, dustMax = 0.15, pasteFresh = true }
	elseif id == "build" then
		local b = budget or 1200
		local tierPerf = math.clamp(math.floor(b / 30), 18, 100)
		return {
			id = id,
			build = true,
			gpuMin = math.floor(tierPerf * 0.9),
			cpuMin = math.floor(math.clamp(tierPerf * 0.7, 20, 90)),
			ramMin = if b >= 1500 then 32 else 16,
			ssd = true,
			partBudget = b,
			vars = { budget = b },
		}
	end
	return nil
end

-- Does the device satisfy the job requirements? Returns ok, list of unmet keys.
function DeviceGen.meets(dev, req: { [string]: any }?): (boolean, { string })
	local unmet = {}
	if not req then
		return true, unmet
	end
	if req.ramMin and Rules.ramTotal(dev, true) < req.ramMin then
		table.insert(unmet, "ram")
	end
	if req.bootSsd or req.ssd then
		local k = bootKind(dev)
		local ev = Rules.evaluate(dev, "post")
		if (k ~= "ssd25" and k ~= "nvme") or ev.boot ~= dev.boot then
			table.insert(unmet, "ssd")
		end
	end
	if req.gpuMin then
		local gpu = Rules.part(dev, "gpu")
		if not gpu or dev.nodes.gpu.st ~= "in" or gpu.perf < req.gpuMin then
			table.insert(unmet, "gpu")
		end
	end
	if req.cpuMin then
		local cpu = Rules.part(dev, "cpu")
		if not cpu or cpu.perf < req.cpuMin then
			table.insert(unmet, "cpu")
		end
	end
	if req.dustMax then
		for id, s in dev.nodes do
			if s.dust and s.dust > req.dustMax and Rules.available(dev, id) and s.st ~= "empty" and id ~= "lboard" then
				table.insert(unmet, "dust")
				break
			end
		end
	end
	if req.pasteFresh and dev.paste.st ~= "fresh" then
		table.insert(unmet, "paste")
	end
	return #unmet == 0, unmet
end

-- Total new-part value of the device (used for prices and the "value" shown on cards).
function DeviceGen.value(dev): number
	if dev.kind == "laptop" then
		local m = Rules.laptopModel(dev)
		return m and m.value or 500
	end
	local v = 0
	for _, s in dev.nodes do
		if s.part then
			local p = Parts.get(s.part)
			if p and p.cat ~= "misc" then
				v += p.price
			end
		end
	end
	local case = Parts.get(dev.model)
	return v + (case and case.price or 0)
end

-- Rough cost of the replacement parts a fault needs (so customers offer sensible money).
function DeviceGen.partsEstimate(dev, faultId: string): number
	local function priceOf(id)
		local p = Rules.part(dev, id)
		return p and p.price or 0
	end
	if faultId == "psu_dead" or faultId == "psu_weak" then
		return math.max(60, priceOf("psu"))
	elseif faultId == "gpu_dead" or faultId == "gpu_artifacts" then
		return math.max(80, priceOf("gpu") * 0.9)
	elseif faultId == "ram_faulty" then
		return math.max(15, priceOf("ram1") + priceOf("ram2") + priceOf("lram1")) * 0.5
	elseif faultId == "fan_dead" or faultId == "fan_noisy" then
		return 15
	elseif faultId == "hdd_failing" or faultId == "ssd_dead" then
		return 50
	elseif faultId == "cmos_low" then
		return 2
	elseif faultId == "cap_bulged" then
		return 2
	elseif faultId == "mobo_dead" then
		return math.max(80, priceOf("mobo"))
	elseif faultId == "cpu_dead" then
		return math.max(60, priceOf("cpu"))
	elseif faultId == "cpu_paste" or faultId == "no_paste" or faultId == "lap_overheat" then
		return 3
	elseif string.sub(faultId, 1, 4) == "lap_" then
		local m = Rules.laptopModel(dev)
		local cls = m and m.class or "budget15"
		local map = { lap_battery_worn = "battery", lap_battery_swollen = "battery", lap_screen = "screen", lap_keyboard = "keyboard", lap_fan_noisy = "fan", lap_dcjack = "dcjack", lap_hinge = "hinge", lap_wifi = "wifi" }
		local sub = map[faultId]
		if sub == "wifi" then
			return 22
		end
		local p = sub and Parts.get("lp_" .. sub .. "_" .. cls)
		return p and p.price or 5
	end
	return 0
end

-- Junk PC from the scrapyard: old, dusty, several random faults, worn parts.
function DeviceGen.junk(rng: Random)
	local tier = Rand.pick(rng, { "retro", "retro", "office", "office", "budget", "budget", "mid" })
	local dev = DeviceGen.desktop(rng, tier)
	baseDust(dev, rng, 0.5, 1)
	dev.paste = { st = "dry", q = 0.05 }
	for _, s in dev.nodes do
		if s.part and s.cond then
			s.cond = Rand.range(rng, 0.25, 0.75)
		end
	end
	local pool = { "psu_dead", "gpu_dead", "ram_faulty", "hdd_failing", "os_corrupt", "virus", "cmos_low", "fan_dead", "mobo_dead", "cap_bulged" }
	Rand.shuffle(rng, pool)
	local n = rng:NextInteger(1, 4)
	for i = 1, n do
		DeviceGen.applyFault(dev, pool[i], rng)
	end
	dev.junk = true
	return dev
end

-- Display name for a device ("Lenovo IdeaPad 3 15", "Corsair 4000D • RTX 4070").
function DeviceGen.name(dev): string
	if dev.kind == "laptop" then
		local m = Rules.laptopModel(dev)
		return m and m.name or "Laptop"
	end
	local gpu = Rules.part(dev, "gpu")
	local cpu = Rules.part(dev, "cpu")
	local bits = {}
	if cpu then
		table.insert(bits, cpu.name)
	end
	if gpu then
		local short = string.gsub(gpu.name, "^GeForce ", "")
		short = string.gsub(short, "^Radeon ", "")
		table.insert(bits, short)
	end
	if #bits == 0 then
		local case = Parts.get(dev.model)
		return case and case.name or "PC"
	end
	return table.concat(bits, " • ")
end

-- Generates a job device for a customer profile.
-- profile = { device = "desktop"|"laptop"|nil, tiers = {...}, classes = {...} }
function DeviceGen.forJob(rng: Random, profile: { [string]: any }, level: number)
	local kind = profile.device
	if not kind then
		kind = if rng:NextNumber() < (profile.laptopChance or 0.4) then "laptop" else "desktop"
	end
	if kind == "laptop" and level < 2 then
		kind = "desktop"
	end
	local dev
	if kind == "laptop" then
		dev = DeviceGen.laptop(rng, profile.classes)
	else
		dev = DeviceGen.desktop(rng, Rand.pick(rng, profile.tiers or { "budget", "mid" }))
	end

	-- Request or fault?
	local job = { kind = "repair", faults = {}, request = nil }
	local reqChance = profile.requestChance or 0.22
	if rng:NextNumber() < reqChance then
		local reqs = filter(Faults.requests, function(r)
			return r.level <= level and (r.device == "any" or r.device == kind) and (r.id ~= "build" or (profile.builds and kind == "desktop"))
		end)
		Rand.shuffle(rng, reqs)
		for _, r in reqs do
			local budget = nil
			if r.id == "upgrade_gpu" then
				budget = Rand.pick(rng, { 250, 350, 450, 600, 800, 1100 })
			elseif r.id == "build" then
				budget = Rand.pick(rng, { 700, 900, 1200, 1500, 2000, 2800, 3600 })
			end
			if r.id == "build" then
				local caseId = Rand.pick(rng, { "case_4000d", "case_4000dw", "case_popair", "case_h5flow", "case_o11evo", "case_o11vision", "case_north", "case_budgetrgb", "case_lancool216", "case_h9flow", "case_5000d", "case_y60", "case_3500x", "case_northxl" })
				dev = DeviceGen.emptyCase(caseId)
			end
			local req = DeviceGen.applyRequest(dev, r.id, rng, budget)
			if req then
				job.kind = if r.id == "build" then "build" elseif r.id == "maintenance" then "maintenance" else "upgrade"
				job.request = req
				job.requestId = r.id
				break
			end
		end
	end
	if not job.request then
		local hasGpu = dev.kind == "desktop" and Rules.part(dev, "gpu") ~= nil
		local k = bootKind(dev)
		local pool = Faults.pool(dev.kind, level, { hasGpu = hasGpu, hasHdd = k == "hdd35" or k == "hdd25" })
		if profile.onlyFaults then
			-- (the first customers bring simple, well-known faults)
			local easy = filter(pool, function(f)
				return table.find(profile.onlyFaults, f.id) ~= nil
			end)
			if #easy > 0 then
				pool = easy
			end
		end
		local tries = 0
		while #job.faults == 0 and tries < 12 do
			tries += 1
			local f = Rand.weighted(rng, pool)
			if DeviceGen.applyFault(dev, f.id, rng) then
				table.insert(job.faults, f.id)
			end
		end
		-- harder customers sometimes bring two problems
		if profile.extraFaultChance and rng:NextNumber() < profile.extraFaultChance and level >= 3 then
			local f = Rand.weighted(rng, pool)
			if not table.find(job.faults, f.id) and DeviceGen.applyFault(dev, f.id, rng) then
				table.insert(job.faults, f.id)
			end
		end
	end
	job.device = dev
	return job
end

return DeviceGen
