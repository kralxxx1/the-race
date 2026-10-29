-- ContractService: bulk work from the internet café and the data centre. A contract is a batch
-- of machines (maintenance, upgrades or repairs) paid per machine as each one is finished, with
-- a bonus when every machine came back working. One contract at a time; the data centre only
-- deals with shops that have the "Corporate Contracts Desk".

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Faults = require(Shared.Data.Faults)
local Employees = require(Shared.Data.Employees)
local DeviceGen = require(Shared.Repair.DeviceGen)
local Rules = require(Shared.Repair.RepairRules)
local Market = require(Shared.Economy.Market)
local Rand = require(Shared.Util.Rand)

local DataService = require(script.Parent.DataService)
local RepairService = require(script.Parent.RepairService)
local MarketService = require(script.Parent.MarketService)
local QuestService = require(script.Parent.QuestService)

local ContractService = {}

local V = Net.V
local rng = Random.new()

local function N(tr, en)
	return { tr = tr, en = en }
end

local CLIENTS = {
	internet_cafe = {
		name = N("Pixel İnternet Kafe", "Pixel Internet Café"),
		level = 3,
		offers = {
			{ key = "cafe_care", kind = "maintenance", tiers = { "mid", "high" }, count = { 3, 4 }, pay = 75, bonus = 140, title = N("Oyun bilgisayarlarının bakımı", "Gaming PC maintenance") },
			{ key = "cafe_fix", kind = "repair", tiers = { "budget", "mid" }, count = { 2, 3 }, pay = 125, bonus = 160, title = N("Arızalanan kafe bilgisayarları", "Broken café PCs") },
			{ key = "cafe_ssd", kind = "upgrade_ssd", tiers = { "office", "budget" }, count = { 2, 4 }, pay = 95, bonus = 150, title = N("Eski bilgisayarlara SSD", "SSDs for the old PCs") },
		},
	},
	datacenter = {
		name = N("Bulut Veri Merkezi", "Cloud Data Centre"),
		level = 6,
		item = "contracts",
		offers = {
			{ key = "dc_fix", kind = "repair", tiers = { "workstation", "high" }, count = { 3, 5 }, pay = 290, bonus = 700, title = N("Arızalı iş istasyonları", "Faulty workstations") },
			{ key = "dc_ram", kind = "upgrade_ram", tiers = { "workstation", "high" }, count = { 3, 4 }, pay = 230, bonus = 520, title = N("Bellek yükseltmesi", "Memory upgrades") },
			{ key = "dc_care", kind = "maintenance", tiers = { "workstation", "enthusiast" }, count = { 4, 5 }, pay = 190, bonus = 560, title = N("Sunucu odası bakımı", "Server room maintenance") },
		},
	},
}

-- the outer districts' clients
CLIENTS.osb = {
	name = N("OSB Fabrika Ofisleri", "Industrial Zone Offices"),
	level = 2,
	offers = {
		{ key = "osb_care", kind = "maintenance", tiers = { "office", "budget" }, count = { 3, 5 }, pay = 60, bonus = 120, title = N("Fabrika ofislerinin bakımı", "Factory office maintenance") },
		{ key = "osb_ssd", kind = "upgrade_ssd", tiers = { "office" }, count = { 3, 4 }, pay = 80, bonus = 130, title = N("Muhasebe bilgisayarlarına SSD", "SSDs for the accounts PCs") },
		{ key = "osb_fix", kind = "repair", tiers = { "office", "budget" }, count = { 2, 3 }, pay = 110, bonus = 140, title = N("Üretim bandındaki bozuk bilgisayarlar", "Broken PCs on the production line") },
	},
}
CLIENTS.teknopark = {
	name = N("Teknopark", "Technopark"),
	level = 4,
	offers = {
		{ key = "tkp_ram", kind = "upgrade_ram", tiers = { "mid", "high" }, count = { 3, 4 }, pay = 150, bonus = 300, title = N("Geliştirici bilgisayarlarına bellek", "Memory for the developers' PCs") },
		{ key = "tkp_gpu", kind = "upgrade_gpu", tiers = { "high", "workstation" }, count = { 2, 3 }, pay = 240, bonus = 420, title = N("Yapay zekâ ekibine ekran kartı", "Graphics cards for the AI team") },
		{ key = "tkp_fix", kind = "repair", tiers = { "mid", "high" }, count = { 2, 4 }, pay = 170, bonus = 320, title = N("Arızalı test bilgisayarları", "Faulty test machines") },
	},
}
CLIENTS.airport = {
	name = N("Şehir Havalimanı", "City Airport"),
	level = 5,
	offers = {
		{ key = "air_kiosk", kind = "repair", tiers = { "office", "budget" }, count = { 3, 5 }, pay = 150, bonus = 380, title = N("Check-in kiosklarının arızaları", "Check-in kiosk faults") },
		{ key = "air_care", kind = "maintenance", tiers = { "mid", "office" }, count = { 4, 5 }, pay = 120, bonus = 340, title = N("Uçuş bilgi ekranlarının bilgisayarları", "Flight-display PCs") },
		{ key = "air_ssd", kind = "upgrade_ssd", tiers = { "budget", "mid" }, count = { 3, 4 }, pay = 130, bonus = 300, title = N("Kule bilgisayarlarına hızlı disk", "Fast drives for the tower PCs") },
	},
}
CLIENTS.villa_club = {
	name = N("Villa Tepe Kulübü", "Villa Hill Club"),
	level = 8,
	offers = {
		{ key = "vil_gpu", kind = "upgrade_gpu", tiers = { "enthusiast", "high" }, count = { 2, 3 }, pay = 420, bonus = 900, title = N("Villa sahiplerine en yeni ekran kartı", "The newest graphics cards for the villa owners") },
		{ key = "vil_care", kind = "maintenance", tiers = { "enthusiast" }, count = { 2, 3 }, pay = 300, bonus = 700, title = N("Oyun odalarının bakımı", "Gaming room maintenance") },
		{ key = "vil_fix", kind = "repair", tiers = { "enthusiast", "high" }, count = { 2, 3 }, pay = 380, bonus = 820, title = N("Pahalı sistemlerin arızaları", "Faults in expensive rigs") },
	},
}
ContractService.CLIENTS = CLIENTS

local active: { [Player]: { [string]: any } } = {}
local near: { [Player]: { poi: string, t: number } } = {}
local nextId = 0

-- Today's numbers for an offer (the same for everyone on a day).
local function countFor(poi: string, offer): number
	local h = Rand.hash(poi .. offer.key .. Market.day())
	return offer.count[1] + h % (offer.count[2] - offer.count[1] + 1)
end

local function eligible(player: Player, client): (boolean, string?)
	local p = DataService.get(player)
	if not p then
		return false, "bad"
	end
	if p.level < client.level then
		return false, "level"
	end
	if client.item and not p.shop.items[client.item] then
		return false, "contract_desk"
	end
	return true, nil
end

local function payload(player: Player, poi: string)
	local client = CLIENTS[poi]
	local ok, why = eligible(player, client)
	local offers = {}
	for _, o in client.offers do
		table.insert(offers, { key = o.key, kind = o.kind, title = o.title, count = countFor(poi, o), pay = o.pay, bonus = o.bonus })
	end
	local a = active[player]
	return {
		poi = poi,
		name = client.name,
		locked = not ok,
		why = why,
		level = client.level,
		offers = offers,
		active = a and { title = a.title, done = a.done, total = a.total, client = a.name } or nil,
	}
end

-- One machine for the contract: a device of the right tier with the fault or request.
local function machine(offer, level: number)
	for _ = 1, 8 do
		local dev = DeviceGen.desktop(rng, Rand.pick(rng, offer.tiers))
		if offer.kind == "repair" then
			local hasGpu = Rules.part(dev, "gpu") ~= nil
			local pool = Faults.pool("desktop", math.max(level, 4), { hasGpu = hasGpu, hasHdd = false })
			for _ = 1, 10 do
				local f = Rand.weighted(rng, pool)
				if DeviceGen.applyFault(dev, f.id, rng) then
					return { device = dev, faults = { f.id }, kind = "repair" }
				end
			end
		else
			local req = DeviceGen.applyRequest(dev, offer.kind, rng)
			if req then
				return { device = dev, faults = {}, request = req, requestId = offer.kind, kind = if offer.kind == "maintenance" then "maintenance" else "upgrade" }
			end
		end
	end
	return nil
end

local function accept(player: Player, args)
	if not V.tbl(args) or not V.id(args.poi) or not V.id(args.key) then
		return { ok = false, err = "bad" }
	end
	local client = CLIENTS[args.poi]
	local n = near[player]
	if not client or not n or n.poi ~= args.poi or os.clock() - n.t > 600 then
		return { ok = false, err = "far" }
	end
	local ok, why = eligible(player, client)
	if not ok then
		return { ok = false, err = why }
	end
	if active[player] then
		return { ok = false, err = "contract_busy" }
	end
	local offer
	for _, o in client.offers do
		if o.key == args.key then
			offer = o
		end
	end
	if not offer then
		return { ok = false, err = "bad" }
	end
	local count = countFor(args.poi, offer)
	local jobs = 0
	for _ in RepairService.jobs(player) do
		jobs += 1
	end
	if jobs + count > RepairService.MAX_JOBS then
		return { ok = false, err = "jobs_full" }
	end
	nextId += 1
	local c = { id = "C" .. nextId, poi = args.poi, name = client.name, title = offer.title, total = count, done = 0, fixed = 0, pay = offer.pay, bonus = offer.bonus, jobs = {} }
	local p = DataService.get(player)
	local lang = DataService.lang(player)
	for i = 1, count do
		local m = machine(offer, p and p.level or 1)
		if m then
			m.price = offer.pay
			m.text = string.format("%s — %s #%d", if lang == "en" then client.name.en else client.name.tr, if lang == "en" then offer.title.en else offer.title.tr, i)
			m.contract = { id = c.id, name = client.name }
			local job = RepairService.createJob(player, m)
			if job then
				c.jobs[job.id] = true
			end
		end
	end
	c.total = 0
	for _ in c.jobs do
		c.total += 1
	end
	if c.total == 0 then
		return { ok = false, err = "internal" }
	end
	active[player] = c
	return { ok = true, count = c.total }
end

-- A contract machine left the bench: pay for it (if it works) and close the contract when the
-- last one is done.
local function finished(player: Player, job)
	local c = active[player]
	if not job.contract or not c or job.contract.id ~= c.id or not c.jobs[job.id] then
		return
	end
	c.jobs[job.id] = nil
	c.done += 1
	local fixed = job.verdict and job.verdict.fixed
	local p = DataService.get(player)
	-- (a network technician on the staff gets more out of the client)
	local extra = 1 + Employees.effect(p and p.staff, "contracts")
	if fixed then
		c.fixed += 1
		DataService.money(player, math.floor(c.pay * extra), "contract")
		QuestService.bump(player, "contract")
		DataService.addXp(player, 22)
		if p then
			p.stats.repairs += 1
		end
	else
		DataService.rep(player, -1.5)
		if p then
			p.stats.failed += 1
		end
	end
	RepairService.removeJob(player, job.id)
	Net.push(player, "toast", { key = if fixed then "contract_machine" else "contract_machine_bad", vars = { n = c.done, m = c.total, price = c.pay } })
	if c.done >= c.total then
		active[player] = nil
		if c.fixed == c.total then
			DataService.money(player, math.floor(c.bonus * extra), "contract")
			DataService.addXp(player, 80)
			DataService.rep(player, 3)
			Net.push(player, "toast", { key = "contract_done", vars = { bonus = c.bonus } })
		else
			Net.push(player, "toast", { key = "contract_partial", vars = { n = c.fixed, m = c.total } })
		end
	end
end

function ContractService.active(player: Player)
	return active[player]
end

function ContractService.init() end

function ContractService.start()
	MarketService.opened:Connect(function(player, service, poi)
		if service ~= "contracts" or not CLIENTS[poi] then
			return
		end
		near[player] = { poi = poi, t = os.clock() }
		Net.push(player, "contracts.open", payload(player, poi))
	end)
	Net.handle("contracts.accept", accept)
	RepairService.jobFinished:Connect(finished)
	-- a contract job thrown away (e.g. the player sold it) still counts as done, unpaid
	RepairService.jobRemoved:Connect(function(player, id)
		local c = active[player]
		if c and c.jobs[id] then
			c.jobs[id] = nil
			c.done += 1
			if c.done >= c.total then
				active[player] = nil
			end
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		active[player] = nil
		near[player] = nil
	end)
end

return ContractService
