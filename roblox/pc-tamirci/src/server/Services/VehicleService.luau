-- VehicleService: dealerships (display models, buying) and your own vehicles. Owned vehicles are
-- called up from the phone or the dealer; only the owner can take the driver's seat, and the
-- driver gets network ownership so the client-side controller can drive it smoothly.

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Vehicles = require(Shared.Data.Vehicles)
local VehicleModels = require(Shared.Models.VehicleModels)
local CityLayout = require(Shared.World.CityLayout)

local DataService = require(script.Parent.DataService)
local PlotService = require(script.Parent.PlotService)
local MarketService = require(script.Parent.MarketService)

local VehicleService = {}

local V = Net.V
local rng = Random.new()
local folder: Folder
local active: { [Player]: Model } = {}
local lastSpawn: { [Player]: number } = {}

local function plateFor(player: Player): string
	local p = DataService.get(player)
	if p and not p.plate then
		p.plate = Vehicles.plate(Random.new(player.UserId))
		DataService.touch(player)
	end
	return p and p.plate or "34 PC 001"
end

local function despawn(player: Player)
	local m = active[player]
	if m then
		local seat = m:FindFirstChild("Driver") :: VehicleSeat?
		if seat and seat.Occupant then
			seat.Occupant.Sit = false
		end
		m.Parent = nil
		m:Destroy()
		active[player] = nil
	end
end

-- A spot on the nearest road beside the player, in the right-hand lane, facing along it.
local function roadSpot(pos: Vector3): CFrame
	local road, closest = CityLayout.nearestRoad(pos)
	if road and closest then
		local d2 = road.b - road.a
		local dir = if d2.Magnitude > 1e-3 then Vector3.new(d2.X, 0, d2.Y).Unit else Vector3.new(0, 0, 1)
		-- drive in the direction that keeps the player's side on the right
		local toPlayer = Vector3.new(pos.X - closest.X, 0, pos.Z - closest.Y)
		local right = Vector3.new(-dir.Z, 0, dir.X)
		if toPlayer:Dot(right) < 0 then
			dir = -dir
			right = -right
		end
		local lane = Vector3.new(closest.X, CityLayout.ROAD_Y, closest.Y) + right * road.width * 0.22
		return CFrame.lookAt(lane, lane + dir)
	end
	return CFrame.new(pos + Vector3.new(6, 0, 0))
end

local function spawnFor(player: Player, id: string)
	local p = DataService.get(player)
	local def = Vehicles.get(id)
	if not p or not def or not p.vehicles[id] then
		return { ok = false, err = "not_owned" }
	end
	if lastSpawn[player] and os.clock() - lastSpawn[player] < 4 then
		return { ok = false, err = "wait" }
	end
	lastSpawn[player] = os.clock()
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then
		return { ok = false }
	end
	despawn(player)
	local cf = roadSpot(root.Position)
	-- the parking space in front of your shop, if you bought one and you're nearby
	local shop = PlotService.shopOf(player)
	if shop and p.shop.items.parking then
		local park = shop.points and shop.points:FindFirstChild("Parking")
		if park and (park.Position - root.Position).Magnitude < 80 then
			cf = CFrame.new(park.Position.X, CityLayout.ROAD_Y, park.Position.Z) * park.CFrame.Rotation
		end
	end
	local m = VehicleModels.build(nil, def, cf, { color = p.vehicles[id].color or 1, plate = plateFor(player) })
	m.Name = player.Name .. "_" .. id
	m:SetAttribute("Owner", player.UserId)
	m.Parent = folder
	active[player] = m
	local seat = m:FindFirstChild("Driver") :: VehicleSeat
	local conn
	conn = seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		if not m.Parent then
			conn:Disconnect()
			return
		end
		local hum = seat.Occupant
		local chassis = m.PrimaryPart
		if not hum then
			pcall(function()
				chassis:SetNetworkOwnershipAuto()
			end)
			return
		end
		local who = Players:GetPlayerFromCharacter(hum.Parent)
		if who ~= player then
			-- only the owner drives
			hum.Sit = false
			return
		end
		pcall(function()
			chassis:SetNetworkOwner(player)
		end)
	end)
	-- seat the owner right away
	local hum = char:FindFirstChildOfClass("Humanoid")
	if hum then
		task.defer(function()
			-- the car may be gone again (parked or the player left) before this runs
			pcall(function()
				if seat.Parent and hum.Parent then
					seat:Sit(hum)
				end
			end)
		end)
	end
	return { ok = true }
end

local function buy(player: Player, payload)
	if not V.tbl(payload) or not V.id(payload.id) then
		return { ok = false }
	end
	local def = Vehicles.get(payload.id)
	local p = DataService.get(player)
	if not def or not p then
		return { ok = false }
	end
	if p.vehicles[def.id] then
		return { ok = false, err = "owned" }
	end
	if p.level < (def.level or 1) then
		return { ok = false, err = "level" }
	end
	local color = if V.int(payload.color, 1, #def.colors) then payload.color else 1
	if not DataService.money(player, -def.price, "vehicle") then
		return { ok = false, err = "money" }
	end
	p.vehicles[def.id] = { color = color }
	DataService.addXp(player, math.floor(def.price / 200) + 20)
	DataService.touch(player)
	return { ok = true }
end

local function placeDisplays()
	local counters = {}
	for _, marker in CollectionService:GetTagged("DealerDisplay") do
		local dealer = marker:GetAttribute("Dealer")
		local list = {}
		for _, v in Vehicles.list do
			if v.dealer == dealer then
				table.insert(list, v)
			end
		end
		if #list > 0 then
			counters[dealer] = (counters[dealer] or 0) + 1
			local def = list[((counters[dealer] - 1) % #list) + 1]
			local cf = (marker :: BasePart).CFrame * CFrame.new(0, -0.5, 0)
			local m = VehicleModels.build(folder, def, cf, { color = rng:NextInteger(1, #def.colors), plate = "GALERİ", static = true })
			m.Name = "Display_" .. def.id
			m:SetAttribute("Display", true)
		end
	end
end

function VehicleService.init()
	folder = Instance.new("Folder")
	folder.Name = "Vehicles"
	folder.Parent = Workspace
end

function VehicleService.start()
	task.defer(placeDisplays)
	MarketService.opened:Connect(function(player, service)
		if service == "cars" or service == "bikes" or service == "bicycles" then
			local p = DataService.get(player)
			Net.push(player, "dealer.open", { dealer = service, owned = p and p.vehicles or {} })
		end
	end)
	Net.handle("vehicle.buy", buy)
	Net.handle("vehicle.spawn", function(player, payload)
		if not V.tbl(payload) or not V.id(payload.id) then
			return { ok = false }
		end
		return spawnFor(player, payload.id)
	end)
	Net.handle("vehicle.despawn", function(player)
		despawn(player)
		return { ok = true }
	end)
	Players.PlayerRemoving:Connect(function(player)
		despawn(player)
		lastSpawn[player] = nil
	end)
end

function VehicleService.active(player: Player): Model?
	return active[player]
end

return VehicleService
