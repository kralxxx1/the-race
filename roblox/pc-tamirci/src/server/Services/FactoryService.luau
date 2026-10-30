-- FactoryService: the player's own factory at the industrial estate (Data/Factory). Production
-- lines make batches of "Benchcraft" products from bought-in materials; a finished batch goes into the
-- factory warehouse and, with "repeat" on, the line starts the next one if the materials can be
-- paid. From the warehouse the goods are shipped to the shop's inventory or sold to distributors.
-- Batches run on the clock (os.time), so one that was running when you left is ready when you
-- come back. The factory's electricity goes on the shop's daily utility bill (p.factory.elec).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Factory = require(Shared.Data.Factory)
local Parts = require(Shared.Data.Parts)

local DataService = require(script.Parent.DataService)
local MarketService = require(script.Parent.MarketService)
local QuestService = require(script.Parent.QuestService)

local FactoryService = {}
FactoryService.clock = os.time -- (the tests wind it forward)

local V = Net.V

local function stateOf(p)
	local f = p.factory
	if type(f) ~= "table" or not f.level then
		return nil
	end
	f.lines = f.lines or {}
	f.stock = f.stock or {}
	f.made = f.made or 0
	f.elec = Factory.level(f.level).elec
	return f
end
FactoryService.stateOf = stateOf

local function room(f): number
	return Factory.level(f.level).storage - Factory.stocked(f)
end

-- Starts a batch on a line (materials paid now). false + reason when it can't.
local function startBatch(player: Player, f, line: number, partId: string, repeatOn: boolean): (boolean, string?)
	local pr = Factory.byPart[partId]
	if not pr then
		return false, "bad_request"
	end
	if f.level < pr.minLevel then
		return false, "factory_level"
	end
	if line < 1 or line > Factory.level(f.level).lines then
		return false, "bad_request"
	end
	local cur = f.lines[line]
	if type(cur) == "table" and cur.endsAt and cur.endsAt > FactoryService.clock() then
		return false, "busy"
	end
	if room(f) < pr.batch then
		return false, "factory_full"
	end
	if not DataService.money(player, -Factory.materials(pr), "materials") then
		return false, "money"
	end
	local now = FactoryService.clock()
	f.lines[line] = { part = partId, n = pr.batch, started = now, endsAt = now + Factory.batchSeconds(pr, f.level), rep = repeatOn }
	return true
end

-- Finished batches into the warehouse; repeating lines start again.
function FactoryService.tick(player: Player, p)
	local f = stateOf(p)
	if not f then
		return
	end
	local now = FactoryService.clock()
	local changed = false
	for i = 1, Factory.level(f.level).lines do
		local l = f.lines[i]
		if type(l) == "table" and l.endsAt and l.endsAt <= now then
			local part = Parts.get(l.part)
			f.stock[l.part] = (f.stock[l.part] or 0) + l.n
			f.made += l.n
			changed = true
			Net.push(player, "toast", { key = "factory_done", vars = { n = l.n, part = part and part.name or l.part } })
			QuestService.bump(player, "factory", l.n)
			f.lines[i] = false
			if l.rep then
				local ok = startBatch(player, f, i, l.part, true)
				if not ok then
					Net.push(player, "toast", { key = "factory_stopped", vars = { line = i } })
				end
			end
		end
	end
	if changed then
		DataService.touch(player)
	end
end

local function buy(player: Player)
	local p = DataService.get(player)
	if not p then
		return { ok = false }
	end
	if stateOf(p) then
		return { ok = false, err = "already" }
	end
	local L = Factory.levels[1]
	if p.level < L.req then
		return { ok = false, err = "level", need = L.req }
	end
	if not DataService.money(player, -L.cost, "factory") then
		return { ok = false, err = "money" }
	end
	p.factory = { level = 1, lines = {}, stock = {}, made = 0, elec = L.elec }
	DataService.touch(player)
	return { ok = true }
end

local function upgrade(player: Player)
	local p = DataService.get(player)
	local f = p and stateOf(p)
	if not f then
		return { ok = false, err = "no_factory" }
	end
	local nextL = Factory.levels[f.level + 1]
	if not nextL then
		return { ok = false, err = "max" }
	end
	if p.level < nextL.req then
		return { ok = false, err = "level", need = nextL.req }
	end
	if not DataService.money(player, -nextL.cost, "factory") then
		return { ok = false, err = "money" }
	end
	f.level += 1
	f.elec = nextL.elec
	DataService.touch(player)
	return { ok = true, level = f.level }
end

local function start(player: Player, payload)
	local p = DataService.get(player)
	local f = p and stateOf(p)
	if not f then
		return { ok = false, err = "no_factory" }
	end
	if not V.tbl(payload) or not V.int(payload.line, 1, 10) or not V.id(payload.part) then
		return { ok = false, err = "bad_request" }
	end
	local ok, err = startBatch(player, f, payload.line, payload.part, payload.rep ~= false)
	if ok then
		DataService.touch(player)
	end
	return { ok = ok, err = err }
end

local function stop(player: Player, payload)
	local p = DataService.get(player)
	local f = p and stateOf(p)
	if not f or not V.tbl(payload) or not V.int(payload.line, 1, 10) then
		return { ok = false }
	end
	local l = f.lines[payload.line]
	if type(l) == "table" then
		l.rep = false
		DataService.touch(player)
	end
	return { ok = true }
end

-- Warehouse to the shop's inventory (as far as the shelves take it).
local function ship(player: Player, payload)
	local p = DataService.get(player)
	local f = p and stateOf(p)
	if not f or not V.tbl(payload) or not V.id(payload.part) or not V.int(payload.n, 1, 1000) then
		return { ok = false, err = "bad_request" }
	end
	local have = f.stock[payload.part] or 0
	local n = 0
	while n < math.min(have, payload.n) do
		if not DataService.addPart(player, payload.part, 1, "factory") then
			break
		end
		n += 1
	end
	if n == 0 then
		return { ok = false, err = if have == 0 then "none" else "storage" }
	end
	f.stock[payload.part] = have - n
	if f.stock[payload.part] <= 0 then
		f.stock[payload.part] = nil
	end
	DataService.touch(player)
	return { ok = true, n = n }
end

-- Warehouse to the distributors.
local function sell(player: Player, payload)
	local p = DataService.get(player)
	local f = p and stateOf(p)
	if not f or not V.tbl(payload) or not V.id(payload.part) or not V.int(payload.n, 1, 10000) then
		return { ok = false, err = "bad_request" }
	end
	local have = f.stock[payload.part] or 0
	local n = math.min(have, payload.n)
	if n <= 0 then
		return { ok = false, err = "none" }
	end
	local total = Factory.wholesale(payload.part) * n
	f.stock[payload.part] = if have - n > 0 then have - n else nil
	DataService.money(player, total, "wholesale")
	QuestService.bump(player, "sell", n)
	DataService.touch(player)
	return { ok = true, n = n, total = total }
end

function FactoryService.init() end

function FactoryService.start()
	MarketService.opened:Connect(function(player, service)
		if service == "factory" then
			Net.push(player, "factory.open", {})
		end
	end)
	DataService.loaded:Connect(function(player, p)
		-- a batch that finished while you were away
		FactoryService.tick(player, p)
	end)
	Net.handle("factory.buy", buy)
	Net.handle("factory.upgrade", upgrade)
	Net.handle("factory.start", start)
	Net.handle("factory.stop", stop)
	Net.handle("factory.ship", ship)
	Net.handle("factory.sell", sell)
	-- the factory's clock, for the progress bars
	Net.handle("factory.time", function()
		return { ok = true, t = FactoryService.clock() }
	end)
	task.spawn(function()
		while true do
			task.wait(1)
			for player, p in DataService.all() do
				local ok, err = pcall(FactoryService.tick, player, p)
				if not ok then
					warn("[FactoryService] " .. tostring(err))
				end
			end
		end
	end)
end

FactoryService._buy, FactoryService._upgrade, FactoryService._start, FactoryService._ship, FactoryService._sell = buy, upgrade, start, ship, sell

return FactoryService
