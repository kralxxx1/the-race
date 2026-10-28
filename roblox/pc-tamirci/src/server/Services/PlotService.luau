-- PlotService: the 66 shop plots. Every online player owns one shop; free plots show a "for rent"
-- lot. Shops are rebuilt when they level up or get new items.

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextService = game:GetService("TextService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local CityLayout = require(Shared.World.CityLayout)
local ShopBuilder = require(Shared.Models.ShopBuilder)
local Upgrades = require(Shared.Data.Upgrades)
local Signal = require(Shared.Util.Signal)
local Net = require(Shared.Net)

local DataService = require(script.Parent.DataService)

local PlotService = {}
PlotService.built = Signal.new() -- (player, shop) after a shop is (re)built
PlotService.released = Signal.new() -- (player, plotId)

local folder: Folder
local owners: { [number]: Player } = {}
local shops: { [Player]: { [string]: any } } = {}
local lots: { [number]: Model } = {}
local moveCooldown: { [Player]: number } = {}

local function plotById(id: number)
	return CityLayout.get().plots[id]
end

local function buildLot(id: number)
	local plot = plotById(id)
	if lots[id] then
		lots[id]:Destroy()
	end
	local holder = folder:FindFirstChild("Plot_" .. id) or Instance.new("Model")
	holder.Name = "Plot_" .. id
	holder:SetAttribute("Plot", id)
	holder.Parent = folder
	lots[id] = ShopBuilder.emptyLot(holder, plot.cf, plot.width, plot.depth, id)
end

local function shopName(player: Player, p): string
	if p.shop.name and #p.shop.name > 0 then
		return p.shop.name
	end
	return player.DisplayName .. " Bilgisayar"
end

-- (Re)builds the player's shop on its plot.
function PlotService.build(player: Player)
	local p = DataService.get(player)
	local id = p and p.shop.plot
	if not p or not id or owners[id] ~= player then
		return nil
	end
	local plot = plotById(id)
	local old = shops[player]
	if old and old.model then
		old.model:Destroy()
	end
	if lots[id] then
		lots[id]:Destroy()
		lots[id] = nil
	end
	local holder = folder:FindFirstChild("Plot_" .. id) or Instance.new("Model")
	holder.Name = "Plot_" .. id
	holder:SetAttribute("Plot", id)
	holder:SetAttribute("Owner", player.UserId)
	holder.Parent = folder
	local model, info = ShopBuilder.build(holder, plot.cf, {
		level = p.shop.level,
		name = shopName(player, p),
		owner = player.DisplayName,
		wall = p.shop.wall,
		floor = p.shop.floor,
		accent = p.shop.accent,
		items = p.shop.items,
		plotWidth = plot.width,
		plotDepth = plot.depth,
		seed = id * 31 + p.shop.level,
	})
	model:SetAttribute("Owner", player.UserId)
	model:SetAttribute("OwnerName", player.DisplayName)
	model:SetAttribute("Plot", id)
	local benches = {}
	for _, d in model:GetChildren() do
		local idx = d:GetAttribute("Bench")
		if d:IsA("Model") and idx then
			benches[idx] = d
		end
	end
	local shop = {
		player = player,
		plotId = id,
		plot = plot,
		model = model,
		info = info,
		level = p.shop.level,
		benches = benches,
		points = model:FindFirstChild("Points"),
	}
	shops[player] = shop
	player:SetAttribute("Plot", id)
	PlotService.built:Fire(player, shop)
	Net.push(player, "shop", { plot = id, level = p.shop.level, name = shopName(player, p), benches = #benches })
	return shop
end

function PlotService.claim(player: Player, id: number): boolean
	local plot = plotById(id)
	if not plot or (owners[id] and owners[id] ~= player) then
		return false
	end
	local p = DataService.get(player)
	if not p then
		return false
	end
	local previous = shops[player]
	if previous and previous.plotId ~= id then
		PlotService.release(player)
	end
	owners[id] = player
	p.shop.plot = id
	DataService.touch(player)
	PlotService.build(player)
	return true
end

function PlotService.release(player: Player)
	local shop = shops[player]
	if not shop then
		return
	end
	if shop.model then
		shop.model:Destroy()
	end
	shops[player] = nil
	owners[shop.plotId] = nil
	buildLot(shop.plotId)
	PlotService.released:Fire(player, shop.plotId)
end

-- The saved plot if it is free, otherwise the free plot closest to the city centre.
local function assign(player: Player)
	local p = DataService.get(player)
	if not p then
		return
	end
	local want = p.shop.plot
	if want and plotById(want) and not owners[want] then
		PlotService.claim(player, want)
		return
	end
	local best, bestD = nil, math.huge
	for _, plot in CityLayout.get().plots do
		if not owners[plot.id] then
			local d = plot.cf.Position.Magnitude + math.random() * 120
			if d < bestD then
				best, bestD = plot.id, d
			end
		end
	end
	if best then
		PlotService.claim(player, best)
	end
end

function PlotService.shopOf(player: Player)
	return shops[player]
end

function PlotService.ownerOf(id: number): Player?
	return owners[id]
end

function PlotService.shops()
	return shops
end

-- Which shop (and its owner) a world position lies in.
function PlotService.shopAt(pos: Vector3)
	for player, shop in shops do
		local l = shop.plot.cf:PointToObjectSpace(pos)
		if math.abs(l.X) < shop.plot.width / 2 and l.Z > -2 and l.Z < shop.plot.depth then
			return shop, player
		end
	end
	return nil, nil
end

function PlotService.init()
	folder = Instance.new("Folder")
	folder.Name = "Plots"
	folder.Parent = Workspace
	for _, plot in CityLayout.get().plots do
		buildLot(plot.id)
	end
end

function PlotService.start()
	DataService.loaded:Connect(function(player)
		assign(player)
	end)
	Players.PlayerRemoving:Connect(function(player)
		PlotService.release(player)
		moveCooldown[player] = nil
	end)
	-- renting an empty lot moves your shop there
	game:GetService("ProximityPromptService").PromptTriggered:Connect(function(prompt, player)
		if prompt.Name ~= "ClaimPrompt" then
			return
		end
		local id = prompt:GetAttribute("Plot")
		if typeof(id) ~= "number" or owners[id] then
			return
		end
		if moveCooldown[player] and os.clock() - moveCooldown[player] < 20 then
			Net.push(player, "toast", { key = "move_wait" })
			return
		end
		moveCooldown[player] = os.clock()
		if PlotService.claim(player, id) then
			Net.push(player, "toast", { key = "moved", vars = { plot = id } })
		end
	end)
	Net.handle("shop.rename", function(player, name)
		local p = DataService.get(player)
		if not p or not Net.V.str(name, 28) then
			return { ok = false }
		end
		local clean = string.gsub(name, "[%c<>]", "")
		-- shop names are shown to everyone on the sign: run them through Roblox's text filter
		local ok, filtered = pcall(function()
			local result = TextService:FilterStringAsync(clean, player.UserId, Enum.TextFilterContext.PublicChat)
			return result:GetNonChatStringForBroadcastAsync()
		end)
		if not ok or typeof(filtered) ~= "string" then
			return { ok = false, err = "filter" }
		end
		p.shop.name = filtered
		DataService.touch(player)
		PlotService.build(player)
		return { ok = true }
	end)
end

function PlotService.levelInfo(player: Player)
	local p = DataService.get(player)
	return p and Upgrades.levels[p.shop.level]
end

return PlotService
