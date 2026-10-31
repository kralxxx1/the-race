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
local B = require(Shared.Util.Builder)

local DataService = require(script.Parent.DataService)

local PlotService = {}
PlotService.built = Signal.new() -- (player, shop) after a shop is (re)built
PlotService.released = Signal.new() -- (player, plotId)
PlotService.opened = Signal.new() -- (player) the grand opening: the ribbon across the door was cut

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
	return player.DisplayName .. "'s PC Repair"
end

-- A new shop opens with a ceremony: a red ribbon on two posts across the doorway, a "grand
-- opening" board and a prompt (only its owner sees it) that cuts the ribbon.
local function addRibbon(player: Player, shop)
	local door = shop.points and shop.points:FindFirstChild("Door")
	if not door then
		return
	end
	local m = B.model("GrandOpening", shop.model)
	local base = door.CFrame * CFrame.new(0, -0.5, -4.2) -- on the pavement just outside the doorway
	for side = -1, 1, 2 do
		B.cylY(m, base * CFrame.new(side * 5.2, 2, 0), 4, 0.35, Color3.fromRGB(200, 200, 206), Enum.Material.Metal)
		B.cylY(m, base * CFrame.new(side * 5.2, 0.1, 0), 0.2, 1.2, Color3.fromRGB(60, 60, 66), Enum.Material.Metal)
	end
	local ribbon = B.box(m, base * CFrame.new(0, 3.5, 0), Vector3.new(10.4, 0.7, 0.08), Color3.fromRGB(210, 20, 40), Enum.Material.Fabric, { Name = "Ribbon", CanCollide = true })
	for side = -1, 1, 2 do
		B.box(m, base * CFrame.new(side * 0.55, 3.5, -0.08) * CFrame.Angles(0, 0, side * 0.5), Vector3.new(1.1, 0.9, 0.12), Color3.fromRGB(230, 30, 50), Enum.Material.Fabric, { CanCollide = false })
	end
	local board = B.box(m, base * CFrame.new(7.6, 2.6, 0.6) * CFrame.Angles(math.rad(-8), 0, 0), Vector3.new(3.6, 4.2, 0.2), Color3.fromRGB(250, 246, 236), Enum.Material.Wood, { CanCollide = false })
	B.sign(board, Enum.NormalId.Front, "🎉\nGRAND\nOPENING", { color = Color3.fromRGB(200, 20, 40), font = B.Fonts.Heavy })
	local prompt = B.prompt(ribbon, "Cut the ribbon", "Open the Shop", { name = "OpenPrompt", hold = 0.6, distance = 14 })
	prompt:SetAttribute("Owner", player.UserId)
	ribbon:AddTag("OpeningRibbon")
	ribbon:SetAttribute("Owner", player.UserId)
end

-- The ribbon is cut: the shop is open and customers start to come.
function PlotService.open(player: Player): boolean
	local p = DataService.get(player)
	local shop = shops[player]
	if not p or p.opened then
		return false
	end
	p.opened = true
	DataService.touch(player)
	local ceremony = shop and shop.model:FindFirstChild("GrandOpening")
	if ceremony then
		-- confetti over the doorway, then the posts go away
		local ribbon = ceremony:FindFirstChild("Ribbon")
		if ribbon then
			local burst = Instance.new("ParticleEmitter")
			burst.Texture = "rbxasset://textures/particles/sparkles_main.dds"
			burst.Color = ColorSequence.new({ ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 80, 80)), ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 220, 60)), ColorSequenceKeypoint.new(1, Color3.fromRGB(80, 160, 255)) })
			burst.Lifetime = NumberRange.new(1.2, 2)
			burst.Speed = NumberRange.new(10, 18)
			burst.SpreadAngle = Vector2.new(60, 60)
			burst.Acceleration = Vector3.new(0, -20, 0)
			burst.Size = NumberSequence.new(0.4)
			burst.Rate = 0
			burst.Parent = ribbon
			burst:Emit(80)
			ribbon.Transparency = 1
			ribbon.CanCollide = false
			-- (other PromptTriggered listeners still look at the prompt: it goes with the posts)
			local prompt = ribbon:FindFirstChild("OpenPrompt") :: ProximityPrompt?
			if prompt then
				prompt.Enabled = false
			end
		end
		task.delay(3, function()
			if ceremony.Parent then
				ceremony:Destroy()
			end
		end)
	end
	Net.push(player, "opened", {})
	PlotService.opened:Fire(player)
	return true
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
		counter = p.shop.counter,
		bench = p.shop.bench,
		awning = p.shop.awning,
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
	if not p.opened then
		addRibbon(player, shop)
	end
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
		if prompt.Name == "OpenPrompt" then
			if prompt:GetAttribute("Owner") == player.UserId then
				PlotService.open(player)
			end
			return
		end
		if prompt.Name ~= "ClaimPrompt" then
			return
		end
		local id = prompt:GetAttribute("Plot")
		if typeof(id) ~= "number" or owners[id] then
			return
		end
		-- one shop only: once the grand opening is done there is no second shop to rent (the factory
		-- is the only other site you will ever have)
		local data = DataService.get(player)
		if data and data.opened then
			Net.push(player, "toast", { key = "one_shop" })
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
