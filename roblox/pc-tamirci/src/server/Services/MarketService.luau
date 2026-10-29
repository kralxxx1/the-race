-- MarketService: the city's shops. Opens the right UI when a player walks up to a service counter
-- and handles buying/selling: new parts (depot, bazaar), second-hand deals, the scrapyard's junk
-- PCs, tools, consumables and everything for your own shop (levels, items, looks).

local Players = game:GetService("Players")
local CollectionService = game:GetService("CollectionService")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Parts = require(Shared.Data.Parts)
local Tools = require(Shared.Data.Tools)
local Upgrades = require(Shared.Data.Upgrades)
local Employees = require(Shared.Data.Employees)
local Market = require(Shared.Economy.Market)
local DeviceGen = require(Shared.Repair.DeviceGen)
local Builder = require(Shared.Util.Builder)

local DataService = require(script.Parent.DataService)
local PlotService = require(script.Parent.PlotService)
local RepairService = require(script.Parent.RepairService)
local QuestService = require(script.Parent.QuestService)

local MarketService = {}
MarketService.opened = Signal.new() -- (player, service, poi) for services owned by other modules

local V = Net.V
local rng = Random.new()
local bought: { [string]: boolean } = {} -- used/junk listings sold today (per server)
local nearService: { [Player]: { service: string, poi: string, t: number, pos: Vector3 } } = {}

local OTHER = { cars = true, bikes = true, bicycles = true, staff = true, contracts = true }

-- the player must still be close to the counter they opened
local function at(player: Player, services: { string }): boolean
	local n = nearService[player]
	if not n or not table.find(services, n.service) then
		return false
	end
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	return root ~= nil and (root.Position - n.pos).Magnitude < 60
end

local function openPayload(service: string, poi: string)
	local day = Market.day()
	if service == "parts" or service == "parts_bazaar" then
		return { catalog = Market.catalog(service, day) }
	elseif service == "used" then
		local list = {}
		for _, l in Market.used(poi, day) do
			if not bought[l.id] then
				table.insert(list, l)
			end
		end
		return { listings = list }
	elseif service == "scrap" then
		local list = {}
		for _, j in Market.junk(day) do
			if not bought[j.id] then
				table.insert(list, j)
			end
		end
		return { junk = list }
	elseif service == "tools" then
		return {}
	elseif service == "realty" then
		local free = {}
		for _, plot in require(Shared.World.CityLayout).get().plots do
			if not PlotService.ownerOf(plot.id) then
				table.insert(free, plot.id)
			end
		end
		return { free = free }
	elseif service == "board" then
		return { rows = MarketService.leaders() }
	elseif service == "police" then
		return {}
	end
	return {}
end

-- Everyone on the server, best technicians first.
function MarketService.leaders()
	local rows = {}
	for p, prof in DataService.all() do
		table.insert(rows, { name = p.DisplayName, level = prof.level, money = math.floor(prof.money), rep = math.floor(prof.rep), repairs = prof.stats.repairs })
	end
	table.sort(rows, function(a, b)
		return a.repairs * 10 + a.level > b.repairs * 10 + b.level
	end)
	return rows
end

-- The board in front of city hall shows the server's top technicians.
local function paintBoards()
	local lines = { "<b>🏆 EN İYİ TAMİRCİLER</b>" }
	local rows = MarketService.leaders()
	for i = 1, math.min(8, #rows) do
		local r = rows[i]
		table.insert(lines, string.format("%d. %s  •  Sv.%d  •  %d tamir", i, r.name, r.level, r.repairs))
	end
	if #rows == 0 then
		table.insert(lines, "—")
	end
	local text = table.concat(lines, "\n")
	for _, board in CollectionService:GetTagged("Leaderboard") do
		if board:IsA("BasePart") then
			local gui = board:FindFirstChild("Leaders")
			local existing = gui and gui:FindFirstChild("Text") :: TextLabel?
			local label = existing or Builder.sign(board, Enum.NormalId.Front, "", { name = "Leaders", rich = true, color = Color3.fromRGB(250, 236, 190), background = Color3.fromRGB(24, 28, 38), glow = true, brightness = 1.2, padding = 0.05 })
			label.Text = text
		end
	end
end

MarketService._paintBoards = paintBoards

function MarketService.open(player: Player, service: string, poi: string, pos: Vector3)
	nearService[player] = { service = service, poi = poi, t = os.clock(), pos = pos }
	if OTHER[service] then
		MarketService.opened:Fire(player, service, poi)
		return
	end
	Net.push(player, "service.open", { service = service, poi = poi, data = openPayload(service, poi) })
end

----------------------------------------------------------------------------------------------------
-- Buying parts and consumables
----------------------------------------------------------------------------------------------------
-- A courier on the staff fetches what you order from the phone, for a delivery charge.
local DELIVERY = 1.08
local function courier(player: Player): boolean
	local p = DataService.get(player)
	return p ~= nil and Employees.has(p.staff, "courier")
end

local function buyPart(player: Player, payload)
	local delivery = V.tbl(payload) and payload.delivery == true and courier(player)
	if not delivery and not at(player, { "parts", "parts_bazaar" }) then
		return { ok = false, err = if V.tbl(payload) and payload.delivery then "no_courier" else "far" }
	end
	if not V.tbl(payload) or not V.id(payload.id) then
		return { ok = false }
	end
	local qty = if V.int(payload.qty, 1, 20) then payload.qty else 1
	local service = if delivery then "parts" else nearService[player].service
	local p = Parts.get(payload.id)
	if not p then
		return { ok = false }
	end
	if service == "parts_bazaar" and (p.cat == "misc" or (p.year or 2030) > 2019) then
		return { ok = false, err = "not_sold_here" }
	end
	if p.cat == "case" and service ~= "parts" then
		return { ok = false }
	end
	local unit = Market.price(p)
	if service == "parts_bazaar" then
		unit = math.max(1, math.floor(unit * 0.72))
	end
	if delivery then
		unit = math.ceil(unit * DELIVERY)
	end
	local cost = unit * qty
	local prof = DataService.get(player)
	if not prof or prof.money < cost then
		return { ok = false, err = "money" }
	end
	-- consumables go to stock (counted in uses)
	if p.uses then
		DataService.money(player, -cost, "buy")
		DataService.addStock(player, p.id, p.uses * qty)
		QuestService.bump(player, "buy", qty)
		return { ok = true }
	end
	if p.cat == "case" then
		-- a case starts a build project instead of sitting on a shelf
		DataService.money(player, -cost, "buy")
		local dev = DeviceGen.emptyCase(p.id)
		local job = RepairService.createJob(player, { device = dev, kind = "build", own = true, price = 0, text = p.name })
		if not job then
			DataService.money(player, cost)
			return { ok = false, err = "jobs_full" }
		end
		return { ok = true, job = job.id }
	end
	if #prof.inv + qty > DataService.capacityOf(prof) then
		return { ok = false, err = "storage" }
	end
	DataService.money(player, -cost, "buy")
	QuestService.bump(player, "buy", qty)
	for _ = 1, qty do
		local cond = if service == "parts_bazaar" then math.floor((0.82 + rng:NextNumber() * 0.18) * 100) / 100 else 1
		local broken = if service == "parts_bazaar" and rng:NextNumber() < 0.08 then true else nil
		DataService.addPart(player, p.id, cond, if service == "parts_bazaar" then "bazaar" else "new", broken)
	end
	return { ok = true }
end

local function buyUsed(player: Player, payload)
	if not at(player, { "used" }) or not V.tbl(payload) or not V.id(payload.id) then
		return { ok = false, err = "far" }
	end
	local poi = nearService[player].poi
	local listing = nil
	for _, l in Market.used(poi) do
		if l.id == payload.id then
			listing = l
		end
	end
	if not listing or bought[listing.id] then
		return { ok = false, err = "sold" }
	end
	local prof = DataService.get(player)
	if not prof or prof.money < listing.price then
		return { ok = false, err = "money" }
	end
	if #prof.inv >= DataService.capacityOf(prof) then
		return { ok = false, err = "storage" }
	end
	bought[listing.id] = true
	DataService.money(player, -listing.price, "used")
	QuestService.bump(player, "buy")
	local broken = if rng:NextNumber() * 100 < listing.risk then true else nil
	-- hidden: the player only finds out when testing it
	local item = DataService.addPart(player, listing.part, listing.cond, "used", nil)
	if item and broken then
		item.hiddenBroken = true
	end
	return { ok = true }
end

local function sell(player: Player, payload)
	if not at(player, { "used", "scrap" }) or not V.tbl(payload) or not V.id(payload.uid) then
		return { ok = false, err = "far" }
	end
	local service = nearService[player].service
	local item = DataService.findPart(player, payload.uid)
	if not item then
		return { ok = false }
	end
	local price = if service == "scrap" then Market.scrapPrice(item) else Market.sellPrice(item)
	if service == "used" and item.hiddenBroken then
		-- the dealer tests it: broken goods fetch scrap money
		price = math.max(1, math.floor(price * 0.15))
	end
	DataService.takePart(player, payload.uid)
	DataService.money(player, price, "sell")
	QuestService.bump(player, "sell")
	return { ok = true, price = price }
end

local function buyJunk(player: Player, payload)
	if not at(player, { "scrap" }) or not V.tbl(payload) or not V.id(payload.id) then
		return { ok = false, err = "far" }
	end
	local listing = nil
	for _, j in Market.junk() do
		if j.id == payload.id then
			listing = j
		end
	end
	if not listing or bought[listing.id] then
		return { ok = false, err = "sold" }
	end
	if not DataService.money(player, -listing.price, "junk") then
		return { ok = false, err = "money" }
	end
	bought[listing.id] = true
	QuestService.bump(player, "junk")
	local dev = DeviceGen.junk(Random.new(listing.seed))
	local job = RepairService.createJob(player, { device = dev, kind = "refurb", own = true, price = 0, faults = {}, text = DeviceGen.name(dev) })
	if not job then
		DataService.money(player, listing.price)
		bought[listing.id] = nil
		return { ok = false, err = "jobs_full" }
	end
	return { ok = true, job = job.id }
end

local function buyTool(player: Player, payload)
	if not at(player, { "tools" }) or not V.tbl(payload) or not V.id(payload.id) then
		return { ok = false, err = "far" }
	end
	local tool = Tools.get(payload.id)
	local prof = DataService.get(player)
	if not tool or not prof or prof.tools[tool.id] then
		return { ok = false }
	end
	if prof.level < (tool.level or 1) then
		return { ok = false, err = "level" }
	end
	if not DataService.money(player, -tool.price, "tool") then
		return { ok = false, err = "money" }
	end
	prof.tools[tool.id] = true
	DataService.touch(player)
	return { ok = true }
end

local function buyGear(player: Player, payload)
	if not at(player, { "tools" }) or not V.tbl(payload) or not V.id(payload.id) then
		return { ok = false, err = "far" }
	end
	local g = Tools.gearById[payload.id]
	local prof = DataService.get(player)
	if not g or not prof or prof.gear[g.id] then
		return { ok = false }
	end
	if prof.level < (g.level or 1) then
		return { ok = false, err = "level" }
	end
	if not DataService.money(player, -g.price, "tool") then
		return { ok = false, err = "money" }
	end
	prof.gear[g.id] = true
	DataService.touch(player)
	DataService.gearChanged:Fire(player)
	return { ok = true }
end

----------------------------------------------------------------------------------------------------
-- Your shop: levels, items, looks (from the estate agent or anywhere with the phone)
----------------------------------------------------------------------------------------------------
local function upgradeShop(player: Player)
	local prof = DataService.get(player)
	if not prof then
		return { ok = false }
	end
	local nextLevel = Upgrades.levels[prof.shop.level + 1]
	if not nextLevel then
		return { ok = false, err = "max" }
	end
	if prof.level < nextLevel.req then
		return { ok = false, err = "level", need = nextLevel.req }
	end
	if not DataService.money(player, -nextLevel.cost, "upgrade") then
		return { ok = false, err = "money" }
	end
	prof.shop.level += 1
	DataService.addXp(player, 60 * prof.shop.level)
	DataService.touch(player)
	PlotService.build(player)
	return { ok = true, level = prof.shop.level }
end

local function buyItem(player: Player, payload)
	if not V.tbl(payload) or not V.id(payload.id) then
		return { ok = false }
	end
	local item = Upgrades.get(payload.id)
	local prof = DataService.get(player)
	if not item or not prof or prof.shop.items[item.id] then
		return { ok = false }
	end
	if prof.level < (item.level or 1) then
		return { ok = false, err = "level" }
	end
	if not DataService.money(player, -item.cost, "item") then
		return { ok = false, err = "money" }
	end
	prof.shop.items[item.id] = true
	DataService.touch(player)
	PlotService.build(player)
	return { ok = true }
end

local function setStyle(player: Player, payload)
	local prof = DataService.get(player)
	if not prof or not V.tbl(payload) then
		return { ok = false }
	end
	local changed = false
	local function valid(list, id)
		for _, s in list do
			if s.id == id then
				return true
			end
		end
		return false
	end
	if payload.wall and V.id(payload.wall) and valid(Upgrades.wallStyles, payload.wall) then
		prof.shop.wall = payload.wall
		changed = true
	end
	if payload.floor and V.id(payload.floor) and valid(Upgrades.floorStyles, payload.floor) then
		prof.shop.floor = payload.floor
		changed = true
	end
	if payload.accent and V.int(payload.accent, 1, #Upgrades.accentColors) then
		prof.shop.accent = payload.accent
		changed = true
	end
	for _, key in { "counter", "bench", "awning" } do
		local list = (Upgrades :: any)[key .. "Styles"]
		if payload[key] and V.id(payload[key]) and valid(list, payload[key]) then
			prof.shop[key] = payload[key]
			changed = true
		end
	end
	if changed then
		DataService.touch(player)
		PlotService.build(player)
	end
	return { ok = changed }
end

----------------------------------------------------------------------------------------------------
function MarketService.init() end

function MarketService.start()
	ProximityPromptService.PromptTriggered:Connect(function(prompt, player)
		if prompt.Name ~= "ServicePrompt" then
			return
		end
		local anchor = prompt.Parent
		local service = anchor and anchor:GetAttribute("Service")
		local poi = anchor and anchor:GetAttribute("Poi")
		if typeof(service) ~= "string" or typeof(poi) ~= "string" then
			return
		end
		MarketService.open(player, service, poi, (anchor :: BasePart).Position)
	end)
	Net.handle("market.buy", buyPart)
	-- the depot's catalogue for a phone order, delivery included
	Net.handle("market.catalog", function(player)
		if not courier(player) then
			return { ok = false, err = "no_courier" }
		end
		local list = {}
		for _, e in Market.catalog("parts", Market.day()) do
			local copy = table.clone(e)
			copy.price = math.ceil(e.price * DELIVERY)
			table.insert(list, copy)
		end
		return { ok = true, catalog = list }
	end)
	Net.handle("market.buyUsed", buyUsed)
	Net.handle("market.sell", sell)
	Net.handle("market.buyJunk", buyJunk)
	Net.handle("tools.buy", buyTool)
	Net.handle("gear.buy", buyGear)
	Net.handle("shop.upgrade", upgradeShop)
	Net.handle("shop.buyItem", buyItem)
	Net.handle("shop.style", setStyle)
	Net.handle("market.close", function(player)
		nearService[player] = nil
		return { ok = true }
	end)
	Net.handle("daily.claim", function(player)
		local prof = DataService.get(player)
		local day = Market.day()
		if not prof or prof.daily.day == day then
			return { ok = false, err = "claimed" }
		end
		prof.daily.streak = if prof.daily.day == day - 1 then prof.daily.streak + 1 else 1
		prof.daily.day = day
		local reward = 100 + math.min(prof.daily.streak, 7) * 75 + prof.level * 15
		DataService.money(player, reward, "daily")
		DataService.addXp(player, 20 * math.min(prof.daily.streak, 7))
		return { ok = true, reward = reward, streak = prof.daily.streak }
	end)
	Players.PlayerRemoving:Connect(function(player)
		nearService[player] = nil
	end)
	task.spawn(function()
		while true do
			pcall(paintBoards)
			task.wait(20)
		end
	end)
	-- and right away when someone arrives
	DataService.loaded:Connect(function()
		task.defer(pcall, paintBoards)
	end)
	-- forget today's sold listings at midnight
	task.spawn(function()
		local day = Market.day()
		while true do
			task.wait(60)
			if Market.day() ~= day then
				day = Market.day()
				bought = {}
			end
		end
	end)
end

return MarketService
