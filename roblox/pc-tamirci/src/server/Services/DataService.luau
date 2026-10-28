-- DataService: each player's save (money, XP, tools, parts, shop, staff, vehicles...).
-- Saves through a session-locked DataStore so two servers never overwrite each other; when
-- DataStores aren't available (Studio without API access) it keeps saves in memory instead.

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Parts = require(Shared.Data.Parts)
local Upgrades = require(Shared.Data.Upgrades)

local DataService = {}
DataService.loaded = Signal.new() -- (player, profile)
DataService.levelUp = Signal.new() -- (player, level)

local profiles: { [Player]: { [string]: any } } = {}
local dirty: { [Player]: boolean } = {}
local memory: { [number]: any } = {}
local store: DataStore? = nil
local memoryMode = false

local function deepCopy(t)
	if type(t) ~= "table" then
		return t
	end
	local c = {}
	for k, v in t do
		c[k] = deepCopy(v)
	end
	return c
end
DataService.deepCopy = deepCopy

local function defaults()
	local tools = {}
	for _, id in Config.StartTools do
		tools[id] = true
	end
	local stock = {}
	for id, n in Config.StartInventory do
		local p = Parts.get(id)
		stock[id] = n * (p and p.uses or 1)
	end
	return {
		v = 1,
		money = Config.StartMoney,
		xp = 0,
		level = 1,
		rep = 50,
		reviews = {},
		tools = tools,
		inv = {},
		stock = stock,
		shop = { plot = nil, level = 1, name = nil, wall = "white", floor = "tiles", accent = 1, items = {} },
		staff = {},
		vehicles = {},
		stats = { repairs = 0, earned = 0, perfect = 0, caught = 0, robbed = 0, failed = 0, customers = 0, days = 0 },
		tutorial = 1,
		nextUid = 0,
		last = 0,
		daily = { day = 0, streak = 0 },
		settings = { music = 0.5, sfx = 0.8 },
	}
end
DataService.defaults = defaults

-- Fills fields added after a save was written.
local function migrate(data)
	local d = defaults()
	for k, v in d do
		if data[k] == nil then
			data[k] = v
		elseif type(v) == "table" and type(data[k]) == "table" and #v == 0 then
			for k2, v2 in v do
				if data[k][k2] == nil then
					data[k][k2] = deepCopy(v2)
				end
			end
		end
	end
	data.v = d.v
	return data
end

local function keyOf(player: Player): string
	return "u_" .. player.UserId
end

----------------------------------------------------------------------------------------------------
-- Load / save
----------------------------------------------------------------------------------------------------
local function loadFromStore(player: Player)
	local key = keyOf(player)
	local result = nil
	for attempt = 1, 6 do
		local locked = false
		local ok, err = pcall(function()
			(store :: DataStore):UpdateAsync(key, function(old)
				if old and old.lock and old.lock.job ~= game.JobId and os.time() - (old.lock.t or 0) < 150 and attempt < 6 then
					locked = true
					return nil
				end
				local data = old or defaults()
				data.lock = { job = game.JobId, t = os.time() }
				result = data
				return data
			end)
		end)
		if ok and not locked and result then
			return result
		end
		if not ok then
			warn("[DataService] load failed for " .. player.Name .. ": " .. tostring(err))
		end
		task.wait(if locked then 5 else 2)
		if not player.Parent then
			return nil
		end
	end
	return result
end

local function saveToStore(player: Player, profile, release: boolean)
	local copy = deepCopy(profile)
	copy.last = os.time()
	copy.lock = if release then nil else { job = game.JobId, t = os.time() }
	if memoryMode or not store then
		memory[player.UserId] = copy
		return true
	end
	local ok, err = pcall(function()
		(store :: DataStore):UpdateAsync(keyOf(player), function(old)
			if old and old.lock and old.lock.job ~= game.JobId then
				return nil -- another server took over; never clobber it
			end
			return copy
		end)
	end)
	if not ok then
		warn("[DataService] save failed for " .. player.Name .. ": " .. tostring(err))
	end
	return ok
end

----------------------------------------------------------------------------------------------------
-- Client snapshot (coalesced to one push per frame)
----------------------------------------------------------------------------------------------------
local function snapshot(profile)
	local s = deepCopy(profile)
	s.lock = nil
	for _, item in s.inv do
		item.hiddenBroken = nil -- the player finds out by testing the part
	end
	s.capacity = DataService.capacityOf(profile)
	s.xpNext = DataService.xpFor(profile.level)
	return s
end

function DataService.touch(player: Player)
	if not profiles[player] or dirty[player] then
		return
	end
	dirty[player] = true
	task.defer(function()
		dirty[player] = nil
		local p = profiles[player]
		if p and player.Parent then
			Net.push(player, "data", snapshot(p))
			local ls = player:FindFirstChild("leaderstats")
			if ls then
				local money = ls:FindFirstChild("Para") :: IntValue
				local level = ls:FindFirstChild("Seviye") :: IntValue
				money.Value = math.floor(p.money)
				level.Value = p.level
			end
		end
	end)
end

local function makeLeaderstats(player: Player, p)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local money = Instance.new("IntValue")
	money.Name = "Para"
	money.Value = math.floor(p.money)
	money.Parent = ls
	local level = Instance.new("IntValue")
	level.Name = "Seviye"
	level.Value = p.level
	level.Parent = ls
	ls.Parent = player
end

local function onJoin(player: Player)
	local data
	if memoryMode then
		data = memory[player.UserId] and deepCopy(memory[player.UserId]) or defaults()
	else
		data = loadFromStore(player)
		if not data then
			if player.Parent then
				player:Kick("Kayıt yüklenemedi, lütfen tekrar gir. / Your save could not be loaded, please rejoin.")
			end
			return
		end
	end
	if not player.Parent then
		return
	end
	data = migrate(data)
	data.lock = nil
	if Config.StudioDebugMoney and game:GetService("RunService"):IsStudio() then
		data.money = math.max(data.money, 1e6)
	end
	profiles[player] = data
	makeLeaderstats(player, data)
	player:SetAttribute("Level", data.level)
	DataService.loaded:Fire(player, data)
	DataService.touch(player)
end

local function onLeave(player: Player)
	local p = profiles[player]
	if p then
		saveToStore(player, p, true)
		profiles[player] = nil
	end
	dirty[player] = nil
end

function DataService.init()
	local ok = pcall(function()
		store = DataStoreService:GetDataStore(Config.DataStoreName)
		-- a cheap read proves API access works
		;(store :: DataStore):GetAsync("__probe")
	end)
	if not ok then
		memoryMode = true
		warn("[DataService] DataStore unavailable (enable Studio API access to save); using memory saves.")
	end
end

function DataService.start()
	Players.PlayerAdded:Connect(onJoin)
	Players.PlayerRemoving:Connect(onLeave)
	-- language, volumes and tutorial progress from the phone
	Net.handle("settings.set", function(player, payload)
		local p = profiles[player]
		if not p or not Net.V.tbl(payload) then
			return { ok = false }
		end
		if payload.lang == "tr" or payload.lang == "en" then
			p.lang = payload.lang
		end
		if Net.V.num(payload.music, 0, 1) then
			p.settings.music = payload.music
		end
		if Net.V.num(payload.sfx, 0, 1) then
			p.settings.sfx = payload.sfx
		end
		if Net.V.int(payload.tutorial, 0, 99) then
			p.tutorial = payload.tutorial
		end
		DataService.touch(player)
		return { ok = true }
	end)
	for _, p in Players:GetPlayers() do
		task.spawn(onJoin, p)
	end
	task.spawn(function()
		while true do
			task.wait(Config.AutosaveSeconds)
			for player, p in profiles do
				task.spawn(saveToStore, player, p, false)
			end
		end
	end)
	game:BindToClose(function()
		local threads = 0
		for player, p in profiles do
			threads += 1
			task.spawn(function()
				saveToStore(player, p, true)
				threads -= 1
			end)
		end
		local t0 = os.clock()
		while threads > 0 and os.clock() - t0 < 25 do
			task.wait(0.2)
		end
	end)
end

----------------------------------------------------------------------------------------------------
-- Accessors used by the other services
----------------------------------------------------------------------------------------------------
function DataService.get(player: Player)
	return profiles[player]
end

function DataService.all()
	return profiles
end

function DataService.isMemoryMode(): boolean
	return memoryMode
end

-- Adds (or with a negative amount, takes) money. Refuses to go below zero.
function DataService.money(player: Player, delta: number, _reason: string?): boolean
	local p = profiles[player]
	if not p then
		return false
	end
	if p.money + delta < 0 then
		return false
	end
	p.money = math.floor((p.money + delta) * 100 + 0.5) / 100
	if delta > 0 then
		p.stats.earned += delta
	end
	DataService.touch(player)
	return true
end

function DataService.xpFor(level: number): number
	return math.floor(Config.XpBase * level ^ Config.XpExponent)
end

function DataService.addXp(player: Player, amount: number): number
	local p = profiles[player]
	if not p then
		return 0
	end
	p.xp += math.floor(amount)
	local gained = 0
	while p.level < Config.MaxLevel and p.xp >= DataService.xpFor(p.level) do
		p.xp -= DataService.xpFor(p.level)
		p.level += 1
		gained += 1
		DataService.levelUp:Fire(player, p.level)
	end
	if gained > 0 then
		player:SetAttribute("Level", p.level)
	end
	DataService.touch(player)
	return gained
end

function DataService.rep(player: Player, delta: number)
	local p = profiles[player]
	if p then
		p.rep = math.clamp(p.rep + delta, 0, 100)
		DataService.touch(player)
	end
end

function DataService.review(player: Player, stars: number, text: string, who: string)
	local p = profiles[player]
	if not p then
		return
	end
	table.insert(p.reviews, 1, { s = stars, t = text, w = who, at = os.time() })
	while #p.reviews > Config.ReviewHistory do
		table.remove(p.reviews)
	end
	DataService.touch(player)
end

-- Storage: shop level capacity + shelving upgrades.
function DataService.capacityOf(p): number
	local lvl = Upgrades.levels[p.shop.level] or Upgrades.levels[1]
	local cap = lvl.storage
	for _, item in Upgrades.items do
		if item.storage and p.shop.items[item.id] then
			cap += item.storage
		end
	end
	return cap
end

function DataService.newUid(player: Player): string
	local p = profiles[player]
	p.nextUid += 1
	return "i" .. p.nextUid
end

-- Inventory parts: { uid, part, cond, origin, broken }
function DataService.addPart(player: Player, partId: string, cond: number?, origin: string?, broken: any?): any?
	local p = profiles[player]
	if not p or not Parts.get(partId) then
		return nil
	end
	if #p.inv >= DataService.capacityOf(p) then
		return nil
	end
	local item = { uid = DataService.newUid(player), part = partId, cond = math.clamp(cond or 1, 0, 1), origin = origin or "new", broken = broken }
	table.insert(p.inv, item)
	DataService.touch(player)
	return item
end

function DataService.findPart(player: Player, uid: string): (any?, number?)
	local p = profiles[player]
	if not p then
		return nil, nil
	end
	for i, item in p.inv do
		if item.uid == uid then
			return item, i
		end
	end
	return nil, nil
end

-- Removes a part by uid (or the best-condition one of a part id) and returns it.
function DataService.takePart(player: Player, uid: string?, partId: string?): any?
	local p = profiles[player]
	if not p then
		return nil
	end
	local best, bestI = nil, nil
	for i, item in p.inv do
		if (uid and item.uid == uid) or (not uid and partId and item.part == partId) then
			if uid or not best or (not item.broken and (best.broken or item.cond > best.cond)) then
				best, bestI = item, i
			end
			if uid then
				break
			end
		end
	end
	if not best then
		return nil
	end
	table.remove(p.inv, bestI)
	DataService.touch(player)
	return best
end

-- Consumables (paste, solder, zip ties) are counted in uses.
function DataService.addStock(player: Player, id: string, uses: number)
	local p = profiles[player]
	if p then
		p.stock[id] = (p.stock[id] or 0) + uses
		DataService.touch(player)
	end
end

function DataService.useStock(player: Player, id: string, n: number?): boolean
	local p = profiles[player]
	local need = n or 1
	if not p or (p.stock[id] or 0) < need then
		return false
	end
	p.stock[id] -= need
	if p.stock[id] <= 0 then
		p.stock[id] = nil
	end
	DataService.touch(player)
	return true
end

-- Best thermal paste in stock; returns its quality or nil.
function DataService.usePaste(player: Player): number?
	local p = profiles[player]
	if not p then
		return nil
	end
	local bestId, bestQ = nil, -1
	for id, uses in p.stock do
		local part = Parts.get(id)
		if part and part.paste and uses > 0 and part.paste > bestQ then
			bestId, bestQ = id, part.paste
		end
	end
	if not bestId then
		return nil
	end
	DataService.useStock(player, bestId, 1)
	return bestQ
end

function DataService.ownsTool(player: Player, id: string): boolean
	local p = profiles[player]
	return id == "hand" or (p ~= nil and p.tools[id] == true)
end

function DataService.owned(player: Player): { [string]: boolean }
	local p = profiles[player]
	local t = { hand = true }
	if p then
		for id in p.tools do
			t[id] = true
		end
	end
	return t
end

function DataService.lang(player: Player): string
	local p = profiles[player]
	if p and p.lang then
		return p.lang
	end
	local ok, id = pcall(function()
		return player.LocaleId
	end)
	if ok and type(id) == "string" and string.sub(id, 1, 2) ~= "tr" then
		return "en"
	end
	return "tr"
end

return DataService
