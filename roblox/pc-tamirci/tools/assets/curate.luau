-- Builds the game's asset library from the official Roblox packs (build/packs, fetched with
-- `python3 tools/assets/fetch.py packs`):
--   lune run tools/assets/curate.luau
-- Every item is cleaned (scripts, sounds, joints and prompts removed, parts anchored), wrapped in a
-- fresh Model whose pivot is the middle of its bottom face (so PivotTo(cf) stands it on cf) and
-- written to assets/server/<Library>.rbxm (ServerStorage.Assets) or assets/shared/<Library>.rbxm
-- (ReplicatedStorage.Assets, for things clients spawn themselves).

local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local process = require("@lune/process")

require("../../tests/lib/Bootstrap").run("tools/assets/curate.luau")

local Vector3, CFrame, Instance = roblox.Vector3, roblox.CFrame, roblox.Instance

local packs = {}
local function pack(id: number)
	if not packs[id] then
		local path = "build/packs/" .. id .. ".rbxm"
		if not fs.isFile(path) then
			error("missing " .. path .. " - run python3 tools/assets/fetch.py packs")
		end
		packs[id] = roblox.deserializeModel(fs.readFile(path))
	end
	return packs[id]
end

-- Finds an item by name anywhere in a pack; "Name#2" picks the second one with that name and
-- "Folder/Name" looks inside a folder.
local function find(id: number, path: string): Instance?
	local roots = pack(id)
	local nth = 1
	local name = path
	local hash = string.find(path, "#", 1, true)
	if hash then
		nth = tonumber(string.sub(path, hash + 1)) or 1
		name = string.sub(path, 1, hash - 1)
	end
	local scope = roots
	local slash = string.find(name, "/", 1, true)
	if slash then
		local folderName = string.sub(name, 1, slash - 1)
		name = string.sub(name, slash + 1)
		local found = {}
		for _, r in roots do
			for _, d in r:GetDescendants() do
				if d.Name == folderName then
					table.insert(found, d)
				end
			end
		end
		scope = found
	end
	local seen = 0
	for _, r in scope do
		local candidates = { r }
		for _, d in r:GetDescendants() do
			table.insert(candidates, d)
		end
		for _, d in candidates do
			if d.Name == name and (d:IsA("Model") or d:IsA("BasePart") or d:IsA("Folder")) then
				seen += 1
				if seen == nth then
					return d
				end
			end
		end
	end
	return nil
end

local STRIP = {
	"LuaSourceContainer", "Sound", "ProximityPrompt", "ClickDetector", "BillboardGui", "JointInstance",
	"Constraint", "NoCollisionConstraint", "WeldConstraint", "AnimationController", "Animator", "Animation",
	"Humanoid", "BindableEvent", "BindableFunction", "RemoteEvent", "RemoteFunction", "ValueBase",
	"ParticleEmitter", "Trail", "Beam", "ScreenGui", "Configuration",
}

local function strip(root: Instance)
	for _, d in root:GetDescendants() do
		if d.Parent then
			for _, cls in STRIP do
				if d:IsA(cls) then
					d:Destroy()
					break
				end
			end
			-- the furniture packs' invisible seat triggers
			if d.Parent and d.Name == "ClickTrigger" then
				d:Destroy()
			end
		end
	end
end

local function bounds(root: Instance)
	local lo, hi
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") then
			local cf, sz = d.CFrame, d.Size
			local r, u, l = cf.RightVector, cf.UpVector, cf.LookVector
			local e = Vector3.new(
				math.abs(r.X) * sz.X + math.abs(u.X) * sz.Y + math.abs(l.X) * sz.Z,
				math.abs(r.Y) * sz.X + math.abs(u.Y) * sz.Y + math.abs(l.Y) * sz.Z,
				math.abs(r.Z) * sz.X + math.abs(u.Z) * sz.Y + math.abs(l.Z) * sz.Z
			) / 2
			local p = cf.Position
			lo = if lo then lo:Min(p - e) else p - e
			hi = if hi then hi:Max(p + e) else p + e
		end
	end
	return lo, hi
end

-- opts: collide (default true), shadow (default true), turn (degrees about Y so the front faces -Z),
--       noLights (drop light objects: big buildings would bring dozens),
--       pivotAt (part whose foot becomes the pivot instead of the middle), soft (part names that
--       don't collide: leaves), bulb (part that lights up at night: gets the "Bulb" attribute)
local function prepare(item: Instance, name: string, opts): Model
	opts = opts or {}
	local src = item:Clone()
	strip(src)
	if opts.noLights then
		for _, d in src:GetDescendants() do
			if d:IsA("Light") or d:IsA("Seat") then
				d:Destroy()
			end
		end
	end
	local model = Instance.new("Model")
	model.Name = name
	if src:IsA("BasePart") then
		src.Parent = model
	else
		for _, c in src:GetChildren() do
			c.Parent = model
		end
	end
	local turn = CFrame.Angles(0, math.rad(opts.turn or 0), 0)
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.Anchored = true
			d.CanTouch = false
			if opts.collide == false then
				d.CanCollide = false
				d.CanQuery = false
			end
			if opts.shadow == false then
				d.CastShadow = false
			end
			if opts.soft and table.find(opts.soft, d.Name) then
				d.CanCollide = false
			end
			if opts.bulb and d.Name == opts.bulb then
				d:SetAttribute("Bulb", true)
			end
			d.CFrame = turn * d.CFrame
		end
	end
	local lo, hi = bounds(model)
	if not lo then
		error("no parts in " .. name)
	end
	local base = Vector3.new((lo.X + hi.X) / 2, lo.Y, (lo.Z + hi.Z) / 2)
	if opts.pivotAt then
		local foot = model:FindFirstChild(opts.pivotAt, true)
		if not foot then
			error(name .. ": no part " .. opts.pivotAt)
		end
		base = Vector3.new(foot.CFrame.Position.X, lo.Y, foot.CFrame.Position.Z)
	end
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CFrame = d.CFrame - base
		end
	end
	-- an invisible root at the foot is the primary part, so PivotTo/ScaleTo work from the foot
	local root = Instance.new("Part")
	root.Name = "Root"
	root.Size = Vector3.new(0.2, 0.2, 0.2)
	root.CFrame = CFrame.new()
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = false
	root.CanTouch = false
	root.CastShadow = false
	root.Transparency = 1
	root.Parent = model
	model.PrimaryPart = root
	model.WorldPivot = CFrame.new()
	model:SetAttribute("Size", hi - lo)
	model:SetAttribute("Source", opts.source or "")
	return model
end

----------------------------------------------------------------------------------------------------
-- What goes into each library: { packId, itemPath, ourName, opts }
----------------------------------------------------------------------------------------------------
local CITY, FOREST, GARDEN = 6370681139, 6432306802, 10840661513
local FURNITURE, HOUSE_PROPS = 10847897579, 10840642581
local CITY_BUILDINGS, MODULAR_KIT = 6418277837, 13168370735

local LIBRARIES = {
	{
		-- shop furniture and desk things from the House Furnishing and House Props packs (avatar
		-- scale; lights are dropped, the shop has its own)
		name = "Interior",
		where = "server",
		items = {
			{ FURNITURE, "Couch_Triple", "SofaTriple", { noLights = true } },
			{ FURNITURE, "Couch_Triple_Dark", "SofaTripleDark", { noLights = true } },
			{ FURNITURE, "Couch_Double", "SofaDouble", { noLights = true } },
			{ FURNITURE, "Couch_Double_Dark", "SofaDoubleDark", { noLights = true } },
			{ FURNITURE, "Couch_Single", "SofaSingle", { noLights = true } },
			{ FURNITURE, "Couch_Ottoman", "Ottoman", { noLights = true } },
			{ FURNITURE, "ArmChair", "ArmChair", { noLights = true } },
			{ FURNITURE, "Furniture_Study_Ottoman", "Pouf", { noLights = true } },
			{ FURNITURE, "Furniture_CoffeeTable", "CoffeeTable", { noLights = true } },
			{ FURNITURE, "Furniture_SideTable_A", "SideTable", { noLights = true } },
			{ FURNITURE, "Furniture_Entry_Table", "EntryTable", { noLights = true } },
			{ FURNITURE, "Furniture_Bookshelf_B", "Bookcase", { noLights = true } },
			{ FURNITURE, "Furniture_BookshelfTall_A", "BookcaseTall", { noLights = true } },
			{ FURNITURE, "Display_Case_Tall", "DisplayTall", { noLights = true } },
			{ FURNITURE, "Display_Case_Wide", "DisplayWide", { noLights = true } },
			{ FURNITURE, "Display_Case_Half", "DisplayHalf", { noLights = true } },
			{ FURNITURE, "Display_Cloche", "Cloche", { noLights = true } },
			{ FURNITURE, "Furniture_FilingCabinet", "FilingCabinet", { noLights = true } },
			{ FURNITURE, "Furniture_Study_Desk", "StudyDesk", { noLights = true } },
			{ FURNITURE, "Furniture_WorksStation", "WorkStation", { noLights = true } },
			{ FURNITURE, "Kitchen_BarStool", "BarStool", { noLights = true } },
			{ FURNITURE, "Kitchen_DiningTable", "DiningTable", { noLights = true } },
			{ FURNITURE, "Kitchen_DiningChair", "DiningChair", { noLights = true } },
			{ FURNITURE, "Furniture_Kitchen_Fridge_Normal", "Fridge", { noLights = true } },
			{ FURNITURE, "LowerCabinetMicrowave", "CabinetMicrowave", { noLights = true } },
			{ FURNITURE, "Lower-Dishwasher", "Dishwasher", { noLights = true } },
			{ FURNITURE, "Furniture_Kitchen_LowerCabinetDoors_Sink", "CabinetSink", { noLights = true } },
			{ FURNITURE, "KitchenIsland", "KitchenIsland", { noLights = true, turn = 180 } },
			{ FURNITURE, "Furniture_FloorLamp_On", "FloorLamp", { noLights = true } },
			{ FURNITURE, "Table_Lamp_B", "TableLamp", { noLights = true } },
			{ FURNITURE, "Desk Lamp", "DeskLamp", { noLights = true } },
			{ FURNITURE, "Bankers_Lamp_on", "BankersLamp", { noLights = true } },
			{ FURNITURE, "Furniture_Credenza_A", "Credenza", { noLights = true } },
			{ FURNITURE, "Furniture_Console_A", "Console", { noLights = true } },
			{ FURNITURE, "Furniture_FloorCoatRack", "CoatRack", { noLights = true } },
			{ FURNITURE, "GrandfatherClock", "GrandfatherClock", { noLights = true } },
			{ FURNITURE, "Bench", "BenchWood", { noLights = true } },
			{ FURNITURE, "Metal Shelf", "MetalShelf", { noLights = true } },
			{ FURNITURE, "Rolling_Stand", "RollingStand", { noLights = true } },
			{ HOUSE_PROPS, "CoffeeMachine", "CoffeeMachine", { noLights = true } },
			{ HOUSE_PROPS, "Telephone", "Telephone", { noLights = true } },
			{ HOUSE_PROPS, "Desk_Bell", "DeskBell", { noLights = true } },
			{ HOUSE_PROPS, "Paper_Stack", "PaperStack", { noLights = true } },
			{ HOUSE_PROPS, "Prop_Notepad", "Notepad", { noLights = true } },
			{ HOUSE_PROPS, "Coffee_Cup_White", "CupWhite", { noLights = true } },
			{ HOUSE_PROPS, "Tray", "Tray", { noLights = true } },
			{ HOUSE_PROPS, "TeaKettle", "Kettle", { noLights = true } },
		},
	},
	{
		-- whole buildings: the City Building Pack's blocks (Tower01-12, ~1.4x avatar scale, every side
		-- a facade, lobbies behind the glass) and the Modular Building Kit's prefabs (KitA-L, avatar
		-- scale, storefront ground floors, front on -Z)
		name = "CityBuildings",
		where = "server",
		items = {
			{ CITY_BUILDINGS, "building_01", "Tower01", { noLights = true } },
			{ CITY_BUILDINGS, "building_02", "Tower02", { noLights = true } },
			{ CITY_BUILDINGS, "building_03", "Tower03", { noLights = true, turn = 180 } },
			{ CITY_BUILDINGS, "building_04", "Tower04", { noLights = true } },
			{ CITY_BUILDINGS, "building_05", "Tower05", { noLights = true } },
			{ CITY_BUILDINGS, "building_06", "Tower06", { noLights = true } },
			{ CITY_BUILDINGS, "building_07", "Tower07", { noLights = true } },
			{ CITY_BUILDINGS, "building_08", "Tower08", { noLights = true } },
			{ CITY_BUILDINGS, "building_09", "Tower09", { noLights = true } },
			{ CITY_BUILDINGS, "building_10", "Tower10", { noLights = true } },
			{ CITY_BUILDINGS, "building_11", "Tower11", { noLights = true } },
			{ CITY_BUILDINGS, "building_12", "Tower12", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/A", "KitA", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/B", "KitB", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/C", "KitC", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/E", "KitE", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/F", "KitF", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/G", "KitG", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/H", "KitH", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/I", "KitI", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/J", "KitJ", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/K", "KitK", { noLights = true } },
			{ MODULAR_KIT, "PrefabBuildings/Model", "KitL", { noLights = true } },
		},
	},
	{
		name = "CityProps",
		where = "server",
		items = {
			{ CITY, "AC_Unit_01_A", "ACUnit" },
			{ CITY, "Bus_Stop_01_A", "BusStop", { turn = 180 } },
			{ CITY, "Crosswalk_Indicator_01_A", "CrosswalkSignal" },
			{ CITY, "FireHydrant_01_A", "HydrantYellow" },
			{ CITY, "FireHydrant_01_B", "HydrantRed" },
			{ CITY, "Garbage_Bin_01", "Dumpster" },
			{ CITY, "Kiosk_01_A", "InfoKiosk" },
			{ CITY, "Mailbox_01_A", "Mailbox" },
			{ CITY, "MetalBench_01_A", "BenchMetal" },
			{ CITY, "Newspaper_Stand_01_A", "NewsStandA" },
			{ CITY, "Newspaper_Stand_01_B", "NewsStandB" },
			{ CITY, "Newspaper_Stand_01_C", "NewsStandC" },
			{ CITY, "Newspaper_Stand_01_D", "NewsStandD" },
			{ CITY, "PlanterBase_01", "PlanterSmall", { collide = false } },
			{ CITY, "Planter_Rectangle_01_A", "PlanterLong" },
			{ CITY, "Planter_Round_01_A", "PlanterRound" },
			{ CITY, "Planter_Round_01_A#2", "PlanterRoundSmall" },
			{ CITY, "Planter_Square_01_A", "PlanterSquare" },
			{ CITY, "Powerline_01_A", "Pylon" },
			{ CITY, "Railing_01_A", "Railing" },
			{ CITY, "StreeBarrel_01_A", "TrafficBarrel" },
			{ CITY, "StreetLamp_Small_Var01", "BollardLamp", { bulb = "Light" } },
			{ CITY, "StreetLightPole_01_A", "StreetLight", { turn = 180, pivotAt = "Meshes/Traffic_Light_Frame_Street_Light_Tall004", bulb = "Meshes/Traffic_Light_Frame_Street_Light_Tall007" } },
			{ CITY, "Telephone_Pole_01_A", "TelephonePole" },
			{ CITY, "Traffic_Light_01", "TrafficLightArm", { turn = 180 } },
			{ CITY, "Traffic_Light_02", "TrafficLightPole", { turn = 180 } },
		},
	},
	{
		name = "Nature",
		where = "server",
		items = {
			{ FOREST, "BeechwoodTreeLarge_Var01", "TreeBeechHuge", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "BeechwoodTree_Var01", "TreeBeechBig", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "BeechwoodTree_Var02", "TreeBeechYoung", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "BeechwoodTree_Var03", "TreeBeech", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "BeechwoodSapling_Var01", "Sapling", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "BroadLeafTree_Var01", "TreeBroadleaf", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "DogwoodTree_Var01", "TreeDogwood", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "MapleLeafTreeVar01", "TreeMaple", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "RedwoodTree-Var01", "TreeRedwood", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "RedwoodTreeLarge-Var01", "TreeRedwoodHuge", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "FallenTree", "FallenTree" },
			{ FOREST, "FallenTreeMossyVar01", "FallenTreeMossy" },
			{ FOREST, "TreeStump", "Stump", { soft = { "Leaf", "Leaves", "Soil" } } },
			{ FOREST, "LargeBoulder_Var01", "BoulderTall" },
			{ FOREST, "LargeBoulder_Var02", "BoulderHuge" },
			{ FOREST, "MediumBoulderVar01", "Boulder" },
			{ FOREST, "MediumMossBoulder01", "BoulderMoss" },
			{ FOREST, "SmallRockGroupVar02", "Rocks", { collide = false } },
			{ FOREST, "SmallRockGroupVar03", "Rocks2", { collide = false } },
			{ FOREST, "SmallRockVar04", "Rock", { collide = false } },
			{ FOREST, "MountainLaurelBush_Var01", "BushLaurel", { collide = false } },
			{ FOREST, "RhododendronVar01", "BushRhodo", { collide = false } },
			{ FOREST, "RhododendronVar02", "BushRhodo2", { collide = false } },
			{ FOREST, "Fern_Var01", "Fern", { collide = false } },
			{ FOREST, "FernTallVar01", "FernTall", { collide = false } },
			{ FOREST, "WildFlower01", "WildFlowers", { collide = false, shadow = false } },
			{ FOREST, "Wildflower02", "WildFlowers2", { collide = false, shadow = false } },
			{ FOREST, "WildFlower03", "WildFlower3", { collide = false, shadow = false } },
			{ FOREST, "WildFlower04", "WildFlower4", { collide = false, shadow = false } },
			{ FOREST, "CloverPatch", "Clover", { collide = false, shadow = false } },
		},
	},
	{
		name = "Garden",
		where = "server",
		items = {
			{ GARDEN, "Hedge_Bush_Long", "HedgeLong" },
			{ GARDEN, "Hedge_Bush_Short", "HedgeShort" },
			{ GARDEN, "Flowering_Shrub_01", "Shrub1", { collide = false } },
			{ GARDEN, "Flowering_Shrub_02", "Shrub2", { collide = false } },
			{ GARDEN, "Flowering_Shrub_03", "Shrub3", { collide = false } },
			{ GARDEN, "Flowering_Shrub_04", "Shrub4", { collide = false } },
			{ GARDEN, "Flowering_Shrub_05", "Shrub5", { collide = false } },
			{ GARDEN, "Flowering_Shrub_06", "Shrub6", { collide = false } },
			{ GARDEN, "Flower_Plant_A_Lg", "FlowersA", { collide = false, shadow = false } },
			{ GARDEN, "Flower_Plant_B", "FlowersB", { collide = false, shadow = false } },
			{ GARDEN, "Flower_Plant_C", "FlowersC", { collide = false, shadow = false } },
			{ GARDEN, "Marigold_A", "Marigold", { collide = false, shadow = false } },
			{ GARDEN, "FlowerBedLeft", "FlowerBed", { collide = false } },
			{ GARDEN, "GardenBedRounded", "GardenBed", { collide = false } },
			{ GARDEN, "Ivy_A", "IvyA", { collide = false } },
			{ GARDEN, "Ivy_B", "IvyB", { collide = false } },
			{ GARDEN, "Ivy_G", "IvyG", { collide = false } },
			{ GARDEN, "PottedPlant_Dracaena", "PotDracaena" },
			{ GARDEN, "PottedPlant_RubberPlant", "PotRubber" },
			{ GARDEN, "PottedPlant_Bananna", "PotBanana" },
			{ GARDEN, "Planter_Snake", "PotSnake" },
			{ GARDEN, "Planter_Fern", "PotFern" },
			{ GARDEN, "Planter_Chinese_Evergreen", "PotEvergreen" },
			{ GARDEN, "FrontDoorPottedPlant", "PotDoor" },
			{ GARDEN, "SolariumPottedPlant_A", "PotTall" },
			{ GARDEN, "SolariumPottedPlant_F", "PotTree" },
			{ GARDEN, "Vase_w_Flowers_LG", "VaseFlowers" },
			{ GARDEN, "Fence_A", "FenceWood" },
			{ GARDEN, "Yard_Wall", "YardWall" },
			{ GARDEN, "Driveway_Gate", "Gate" },
			{ GARDEN, "Driveway_Gate_Column", "GateColumn" },
			{ GARDEN, "PuddleLarge", "PuddleLarge", { collide = false, shadow = false } },
			{ GARDEN, "PuddleMedium", "PuddleMedium", { collide = false, shadow = false } },
			{ GARDEN, "Furniture_Backyard_Shed", "Shed" },
			{ GARDEN, "Furniture_Backyard_DogHouse", "DogHouse" },
		},
	},
}

----------------------------------------------------------------------------------------------------
-- Vehicles: the official cars become visual kits for VehicleModels — Body (every panel, door,
-- light and the interior) plus four tires (Wheel1 front-left, Wheel2 front-right, Wheel3
-- rear-left, Wheel4 rear-right) whose rims are marked RimOf. Origin on the ground between the
-- axles, forward -Z; attributes give the wheelbase, track, wheel radius and the driver's seat.
-- Parts painted in the variant's colour carry Paint=true so any colour can be applied.
----------------------------------------------------------------------------------------------------
local VEHICLES = {
	{ 6418239833, "Sedan", { "roof_hood" } },
	{ 6418234850, "SUV", { "roof", "hood" } },
	{ 6418225759, "Pickup", { "body", "roof" } },
	{ 6433316269, "Van", { "roof_hood", "sides" } },
	{ 6433323089, "Sports", { "hood", "roof" } },
	{ 6418230807, "Police", { "hood", "roof" } },
	{ 6418221666, "Offroad", { "hood" } },
}
local WHEELS = { { "FL", 1 }, { "FR", 2 }, { "RL", 3 }, { "RR", 4 } }

local function vehicle(car: Instance, kind: string, paintNames: { string }): Model
	local body = car:FindFirstChild("Body")
	if not body then
		error(car.Name .. ": no Body")
	end
	body = body:Clone()
	strip(body)
	local m = Instance.new("Model")
	local variant = string.match(car.Name, "%((.-)%)") or "std"
	m.Name = kind .. "_" .. string.gsub(variant, "%s+", "")
	-- wheel centres and radius from the tires
	local centers, radius = {}, 0
	for _, w in WHEELS do
		local wm = body:FindFirstChild(w[1])
		local tire = wm and wm:FindFirstChild("tire")
		if not tire then
			error(car.Name .. ": no tire in " .. w[1])
		end
		centers[w[2]] = tire.CFrame.Position
		radius = math.max(radius, math.max(tire.Size.Y, tire.Size.Z) / 2)
	end
	local mid = (centers[1] + centers[2] + centers[3] + centers[4]) / 4
	local origin = Vector3.new(mid.X, mid.Y - radius, mid.Z)
	-- the paint colour of this variant
	local paint = nil
	for _, n in paintNames do
		local p = body:FindFirstChild(n, true)
		if p and p:IsA("BasePart") then
			paint = p.Color
			break
		end
	end
	local function move(part: BasePart, parent: Instance)
		part.CFrame = part.CFrame - origin
		part.Anchored = true
		part.CanCollide = false
		part.CanQuery = false
		part.CanTouch = false
		part.Parent = parent
	end
	local bodyModel = Instance.new("Model")
	bodyModel.Name = "Body"
	bodyModel.Parent = m
	for _, w in WHEELS do
		local wm = body:FindFirstChild(w[1])
		local name = "Wheel" .. w[2]
		local tire = wm:FindFirstChild("tire")
		for _, d in wm:GetDescendants() do
			if d:IsA("BasePart") and d ~= tire then
				d:SetAttribute("RimOf", name)
				d.Name = name .. "Rim"
				move(d, m)
			end
		end
		tire.Name = name
		tire:SetAttribute("Wheel", true)
		tire:SetAttribute("Front", w[2] <= 2)
		tire:SetAttribute("Radius", radius)
		move(tire, m)
		wm:Destroy()
	end
	for _, d in body:GetDescendants() do
		if d:IsA("BasePart") then
			if paint and d.Color == paint and not d.Name:match("light") and not d.Name:match("glass") then
				d:SetAttribute("Paint", true)
			end
			move(d, bodyModel)
		end
	end
	local lo, hi = bounds(m)
	local root = Instance.new("Part")
	root.Name = "Root"
	root.Size = Vector3.new(0.2, 0.2, 0.2)
	root.CFrame = CFrame.new()
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = false
	root.CanTouch = false
	root.Transparency = 1
	root.Parent = m
	m.PrimaryPart = root
	m.WorldPivot = CFrame.new()
	local seat = car:FindFirstChild("VehicleSeat", true)
	local seatPos = if seat then seat.CFrame.Position - origin else Vector3.new(-1, radius * 1.4, -2)
	m:SetAttribute("Size", hi - lo)
	m:SetAttribute("Front", lo.Z)
	m:SetAttribute("Back", hi.Z)
	m:SetAttribute("WheelBase", math.abs(centers[3].Z - centers[1].Z))
	m:SetAttribute("Track", math.abs(centers[2].X - centers[1].X))
	m:SetAttribute("Radius", radius)
	m:SetAttribute("Seat", seatPos)
	m:SetAttribute("Kind", kind)
	m:SetAttribute("Source", "vehicle:" .. car.Name)
	return m
end

local function buildVehicles()
	local folder = Instance.new("Folder")
	folder.Name = "Vehicles"
	local count, parts = 0, 0
	for _, v in VEHICLES do
		for _, car in pack(v[1]) do
			local m = vehicle(car, v[2], v[3])
			m.Parent = folder
			count += 1
			for _, d in m:GetDescendants() do
				if d:IsA("BasePart") then
					parts += 1
				end
			end
		end
	end
	fs.writeDir("assets/shared")
	fs.writeFile("assets/shared/Vehicles.rbxm", roblox.serializeModel({ folder }))
	print(string.format("%-12s %3d items, %5d parts -> assets/shared/Vehicles.rbxm", "Vehicles", count, parts))
end

-- Lists every item of a pack (to pick names from): lune run tools/assets/curate.luau list <packId>
if process.args[1] == "list" then
	local id = tonumber(process.args[2])
	for _, r in pack(id) do
		for _, d in r:GetDescendants() do
			if d:IsA("Model") and d.Parent and not d.Parent:IsA("Model") then
				local lo, hi = bounds(d)
				if lo then
					local s = hi - lo
					print(string.format("%-46s %6.1f %6.1f %6.1f   in %s", d.Name, s.X, s.Y, s.Z, d.Parent.Name))
				end
			end
		end
	end
	return
end

local only = process.args[1]
if not only or only == "Vehicles" then
	buildVehicles()
end
for _, lib in LIBRARIES do
	if not only or only == lib.name then
		local folder = Instance.new("Folder")
		folder.Name = lib.name
		local count, parts = 0, 0
		for _, spec in lib.items do
			local id, path, name, opts = spec[1], spec[2], spec[3], spec[4] or {}
			local item = find(id, path)
			if not item then
				error(string.format("%s: %s not found in pack %d", lib.name, path, id))
			end
			opts.source = id .. ":" .. path
			local m = prepare(item, name, opts)
			m.Parent = folder
			count += 1
			for _, d in m:GetDescendants() do
				if d:IsA("BasePart") then
					parts += 1
				end
			end
		end
		local dir = "assets/" .. lib.where
		fs.writeDir(dir)
		fs.writeFile(dir .. "/" .. lib.name .. ".rbxm", roblox.serializeModel({ folder }))
		print(string.format("%-12s %3d items, %5d parts -> %s/%s.rbxm", lib.name, count, parts, dir, lib.name))
	end
end
