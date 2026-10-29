-- LeaderService: who's ahead. On this server: the richest (cash), the biggest business (net worth,
-- Economy/Worth), the most repairs, the highest level, the best reputation, the most thieves
-- caught and the biggest factory output. Across every server and all time: net worth, kept in an
-- OrderedDataStore (written every few minutes and on leaving, read back for the top ten). The
-- player list shows cash, net worth and level (leaderstats); the board at city hall cycles through
-- the tables; the phone and the board's window show all of them.

local Players = game:GetService("Players")
local CollectionService = game:GetService("CollectionService")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Builder = require(Shared.Util.Builder)
local Worth = require(Shared.Economy.Worth)

local DataService = require(script.Parent.DataService)

local LeaderService = {}

LeaderService.STORE = "PCTamirci_Worth_v1"
LeaderService.SAVE_EVERY = 300 -- seconds between writes to the all-time board
LeaderService.READ_EVERY = 180

-- category id -> how a profile scores in it
LeaderService.categories = {
	{ id = "money", icon = "💰", score = function(p)
		return math.floor(p.money or 0)
	end },
	{ id = "worth", icon = "🏢", score = function(p)
		return Worth.of(p).total
	end },
	{ id = "repairs", icon = "🔧", score = function(p)
		return p.stats and p.stats.repairs or 0
	end },
	{ id = "level", icon = "⭐", score = function(p)
		return (p.level or 1) * 100000 + (p.xp or 0)
	end },
	{ id = "rep", icon = "👍", score = function(p)
		return math.floor(p.rep or 0)
	end },
	{ id = "caught", icon = "🚨", score = function(p)
		return p.stats and p.stats.caught or 0
	end },
	{ id = "made", icon = "🏭", score = function(p)
		return type(p.factory) == "table" and p.factory.made or 0
	end },
}

local store = nil
local globalRows = {}
local names: { [number]: string } = {}
local lastSaved: { [Player]: number } = {}

-- One table: everyone on the server, best first.
function LeaderService.rows(categoryId: string)
	local cat = nil
	for _, c in LeaderService.categories do
		if c.id == categoryId then
			cat = c
		end
	end
	if not cat then
		return {}
	end
	local rows = {}
	for player, p in DataService.all() do
		table.insert(rows, { name = player.DisplayName, userId = player.UserId, score = cat.score(p), level = p.level, worth = Worth.of(p).total, money = math.floor(p.money or 0), repairs = p.stats and p.stats.repairs or 0, rep = math.floor(p.rep or 0) })
	end
	table.sort(rows, function(a, b)
		if a.score ~= b.score then
			return a.score > b.score
		end
		return a.name < b.name
	end)
	return rows
end

-- Every table at once (for the phone and the board's window).
function LeaderService.all()
	local out = { categories = {}, global = globalRows }
	for _, c in LeaderService.categories do
		out.categories[c.id] = LeaderService.rows(c.id)
	end
	return out
end

-- The player list: cash, net worth, level.
local function stats(player: Player, p)
	local ls = player:FindFirstChild("leaderstats")
	if not ls then
		return
	end
	local worth = ls:FindFirstChild("Servet") :: IntValue?
	if not worth then
		worth = Instance.new("IntValue")
		worth.Name = "Servet"
		worth.Parent = ls
	end
	worth.Value = Worth.of(p).total
end
LeaderService.stats = stats

----------------------------------------------------------------------------------------------------
-- All time, every server
----------------------------------------------------------------------------------------------------
local function save(player: Player, p)
	if not store or not p then
		return
	end
	local value = Worth.of(p).total
	lastSaved[player] = os.clock()
	local ok, err = pcall(function()
		store:SetAsync(tostring(player.UserId), value)
	end)
	if not ok then
		warn("[LeaderService] save failed: " .. tostring(err))
	end
end

local function nameOf(userId: number): string
	if names[userId] then
		return names[userId]
	end
	local ok, n = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	names[userId] = if ok and n then n else ("#" .. userId)
	return names[userId]
end

local function readGlobal()
	if not store then
		return
	end
	local ok, pages = pcall(function()
		return store:GetSortedAsync(false, 10)
	end)
	if not ok or not pages then
		return
	end
	local rows = {}
	for _, entry in pages:GetCurrentPage() do
		local id = tonumber(entry.key)
		if id then
			table.insert(rows, { name = nameOf(id), userId = id, score = entry.value })
		end
	end
	globalRows = rows
end

----------------------------------------------------------------------------------------------------
-- The board at city hall: one table at a time
----------------------------------------------------------------------------------------------------
local TITLES = {
	money = "💰 EN ZENGİN TAMİRCİLER",
	worth = "🏢 EN DEĞERLİ İŞLETMELER",
	repairs = "🔧 EN ÇOK TAMİR",
	global = "🌍 TÜM ZAMANLAR • SERVET",
}
local ROTATION = { "money", "worth", "repairs", "global" }
local turn = 0

local function money(n: number): string
	local s = tostring(math.floor(n))
	local out = s:reverse():gsub("(%d%d%d)", "%1."):reverse()
	if string.sub(out, 1, 1) == "." then
		out = string.sub(out, 2)
	end
	return "$" .. out
end

function LeaderService.paint(which: string?)
	turn += 1
	local kind = which or ROTATION[(turn - 1) % #ROTATION + 1]
	if kind == "global" and #globalRows == 0 then
		kind = "worth"
	end
	local rows = if kind == "global" then globalRows else LeaderService.rows(kind)
	local lines = { "<b>" .. TITLES[kind] .. "</b>" }
	for i = 1, math.min(8, #rows) do
		local r = rows[i]
		local value = if kind == "repairs" then tostring(r.score) .. " tamir" else money(r.score)
		table.insert(lines, string.format("%d. %s  •  %s", i, r.name, value))
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

function LeaderService.init() end

function LeaderService.start()
	if not DataService.isMemoryMode() then
		local ok, s = pcall(function()
			return DataStoreService:GetOrderedDataStore(LeaderService.STORE)
		end)
		store = if ok then s else nil
	end
	Net.handle("leaders.get", function()
		return { ok = true, data = LeaderService.all() }
	end)
	DataService.loaded:Connect(function(player, p)
		task.defer(function()
			stats(player, p)
			pcall(LeaderService.paint)
		end)
	end)
	Players.PlayerRemoving:Connect(function(player)
		local p = DataService.get(player)
		if p then
			task.spawn(save, player, p)
		end
		lastSaved[player] = nil
	end)
	-- the player list's net worth, the all-time saves
	task.spawn(function()
		while true do
			task.wait(15)
			for player, p in DataService.all() do
				pcall(stats, player, p)
				if store and os.clock() - (lastSaved[player] or 0) > LeaderService.SAVE_EVERY then
					task.spawn(save, player, p)
				end
			end
		end
	end)
	task.spawn(function()
		while true do
			pcall(readGlobal)
			task.wait(LeaderService.READ_EVERY)
		end
	end)
	task.spawn(function()
		while true do
			pcall(LeaderService.paint)
			task.wait(12)
		end
	end)
end

return LeaderService
