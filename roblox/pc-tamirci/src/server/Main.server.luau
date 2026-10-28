-- PC Tamircisi Simülatörü — server entry point.
-- Builds the city (or reuses a baked copy), then starts every service in dependency order.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local CityLayout = require(Shared.World.CityLayout)

local Server = script.Parent
local WorldBuilder = require(Server.World.WorldBuilder)
local Services = Server.Services

Net.init()

local world = WorldBuilder.build()
print(string.format("[PC Tamircisi] city ready (%s, %.1fs)", if world:GetAttribute("Reused") then "baked" else "built", world:GetAttribute("BuildSeconds") or 0))

local DataService = require(Services.DataService)
local PlotService = require(Services.PlotService)
local NpcService = require(Services.NpcService)
local RepairService = require(Services.RepairService)
local CustomerService = require(Services.CustomerService)
local MarketService = require(Services.MarketService)
local EmployeeService = require(Services.EmployeeService)
local ThiefService = require(Services.ThiefService)
local VehicleService = require(Services.VehicleService)
local TimeService = require(Services.TimeService)

local order = { DataService, PlotService, NpcService, RepairService, CustomerService, MarketService, EmployeeService, ThiefService, VehicleService, TimeService }
for _, s in order do
	s.init()
end
for _, s in order do
	s.start()
end

TimeService.newDay:Connect(function()
	EmployeeService.payday()
end)

----------------------------------------------------------------------------------------------------
-- Getting around: your shop on first spawn, taxi rides and "back to my shop"
----------------------------------------------------------------------------------------------------
local lastHome: { [Player]: number } = {}

local function moveTo(player: Player, cf: CFrame)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not char or not hum then
		return false
	end
	if hum.SeatPart then
		hum.Sit = false
		task.wait(0.15)
	end
	char:PivotTo(cf + Vector3.new(0, 3.5, 0))
	return true
end

local function shopDoor(player: Player): CFrame?
	local shop = PlotService.shopOf(player)
	local outside = shop and shop.points and shop.points:FindFirstChild("Outside")
	if outside then
		local door = shop.points:FindFirstChild("Door")
		return CFrame.lookAt(outside.Position, if door then door.Position else outside.Position + Vector3.new(0, 0, 1))
	end
	return nil
end

-- the first time a player's shop appears, bring them to it
local welcomed: { [Player]: boolean } = {}
PlotService.built:Connect(function(player)
	if welcomed[player] then
		return
	end
	welcomed[player] = true
	task.spawn(function()
		local char = player.Character
		for _ = 1, 100 do
			if char or not player.Parent then
				break
			end
			task.wait(0.1)
			char = player.Character
		end
		if not char then
			return
		end
		char:WaitForChild("HumanoidRootPart", 10)
		task.wait(0.5)
		local cf = shopDoor(player)
		if cf then
			moveTo(player, cf)
		end
	end)
end)
Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(function(char)
		-- respawns put you back at the shop
		if welcomed[player] then
			task.defer(function()
				char:WaitForChild("HumanoidRootPart", 10)
				local cf = shopDoor(player)
				if cf then
					moveTo(player, cf)
				end
			end)
		end
	end)
end)
Players.PlayerRemoving:Connect(function(player)
	welcomed[player] = nil
	lastHome[player] = nil
end)

Net.handle("travel.home", function(player)
	if lastHome[player] and os.clock() - lastHome[player] < Config.ShopTeleportCooldown then
		return { ok = false, err = "cooldown", wait = math.ceil(Config.ShopTeleportCooldown - (os.clock() - lastHome[player])) }
	end
	local cf = shopDoor(player)
	if not cf then
		return { ok = false }
	end
	lastHome[player] = os.clock()
	return { ok = moveTo(player, cf) }
end)

-- Taxi: pay by distance, get dropped on the pavement in front of the place.
Net.handle("travel.taxi", function(player, poiId)
	if not Net.V.id(poiId) then
		return { ok = false }
	end
	local poi = CityLayout.get().poiById[poiId]
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not poi or not root then
		return { ok = false }
	end
	local dist = (root.Position - poi.pos).Magnitude
	local fare = math.floor(Config.TaxiBaseFare + dist * Config.TaxiPerStud)
	if not DataService.money(player, -fare, "taxi") then
		return { ok = false, err = "money", fare = fare }
	end
	local road, closest = CityLayout.nearestRoad(poi.pos)
	local drop = poi.pos
	if road and closest then
		local p = Vector3.new(closest.X, CityLayout.WALK_Y, closest.Y)
		local away = (Vector3.new(poi.pos.X, 0, poi.pos.Z) - Vector3.new(p.X, 0, p.Z))
		if away.Magnitude > 1 then
			p += away.Unit * (road.width / 2 + 4)
		end
		drop = p
	end
	moveTo(player, CFrame.lookAt(drop, Vector3.new(poi.pos.X, drop.Y, poi.pos.Z)))
	return { ok = true, fare = fare }
end)

print("[PC Tamircisi] server started")
