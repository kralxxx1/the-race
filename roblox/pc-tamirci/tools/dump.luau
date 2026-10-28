-- Builds models in the headless engine and dumps their parts to JSON for the three.js previewer.
--   lune run tools/dump.luau world            -> tools/render/out/world.json
--   lune run tools/dump.luau shop <level> [showcase] -> a player shop at a level (with PCs on display)
--   lune run tools/dump.luau device <kind>    -> a repair bench device (desktop/laptop)
--   lune run tools/dump.luau vehicles         -> every vehicle in a row

local fs = require("@lune/fs")
local serde = require("@lune/serde")
local process = require("@lune/process")
local roblox = require("@lune/roblox")

local Engine = require("../tests/lib/Engine")

local what = process.args[1] or "world"

require("../tests/lib/Bootstrap").run("tools/dump.luau")
Engine.context = "server"
Engine.load("build/PCTamirci.rbxlx")

local function hex(c)
	return string.format("%02x%02x%02x", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5))
end

local function r3(x)
	return math.floor(x * 1000 + 0.5) / 1000
end

local function dumpParts(root)
	local out = {}
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") then
			local okT, transp = pcall(function()
				return d.Transparency
			end)
			transp = if okT then transp else 0
			if transp < 0.98 then
				local shape = "box"
				if d:IsA("WedgePart") then
					shape = "wedge"
				elseif d:IsA("CornerWedgePart") then
					shape = "cwedge"
				elseif d:IsA("Part") then
					local s = d.Shape
					if s == roblox.Enum.PartType.Cylinder then
						shape = "cyl"
					elseif s == roblox.Enum.PartType.Ball then
						shape = "ball"
					elseif s == roblox.Enum.PartType.Wedge then
						shape = "wedge"
					end
				end
				local mesh = d:FindFirstChildOfClass("SpecialMesh")
				if mesh and mesh.MeshType == roblox.Enum.MeshType.Sphere then
					shape = "ball"
				end
				local cf = d.CFrame
				local x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = cf:GetComponents()
				local sz = d.Size
				local hasGui = d:FindFirstChildOfClass("SurfaceGui") ~= nil
				local label = nil
				if hasGui then
					local gui = d:FindFirstChildOfClass("SurfaceGui")
					local tl = gui:FindFirstChildOfClass("TextLabel")
					if tl then
						label = { text = tl.Text, face = gui.Face.Name, color = hex(tl.TextColor3), bg = if tl.BackgroundTransparency < 1 then hex(tl.BackgroundColor3) else nil }
					end
				end
				table.insert(out, {
					s = shape,
					p = { r3(x), r3(y), r3(z) },
					r = { r3(r00), r3(r01), r3(r02), r3(r10), r3(r11), r3(r12), r3(r20), r3(r21), r3(r22) },
					z = { r3(sz.X), r3(sz.Y), r3(sz.Z) },
					c = hex(d.Color),
					m = d.Material.Name,
					t = r3(transp),
					l = label,
				})
			end
		end
	end
	return out
end

local result = { parts = {} }
local outName = what
if what == "world" then
	local WorldBuilder = Engine.mod("ServerScriptService.Server.World.WorldBuilder")
	local Terrain = Engine.mod("ServerScriptService.Server.World.TerrainBuilder")
	local CityLayout = Engine.mod("ReplicatedStorage.Shared.World.CityLayout")
	local world = WorldBuilder.build({ bake = true })
	result.parts = dumpParts(world)
	local hills = {}
	for _, h in Terrain.Hills do
		table.insert(hills, { h[1], h[2], h[3], h[4] })
	end
	result.terrain = {
		hills = hills,
		lake = { Terrain.Lake.x, Terrain.Lake.z, Terrain.Lake.radius },
		seaZ = CityLayout.SEA_Z,
		beachZ = CityLayout.BEACH_Z,
		bounds = CityLayout.get().bounds,
	}
elseif what == "shop" then
	local level = tonumber(process.args[2]) or 1
	local ShopBuilder = Engine.mod("ReplicatedStorage.Shared.Models.ShopBuilder")
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	local front = roblox.CFrame.lookAt(roblox.Vector3.new(0, 0.75, 0), roblox.Vector3.new(0, 0.75, -1))
	local shopModel = ShopBuilder.build(folder, front, { level = level, name = "Kral Bilgisayar", wall = "brick", floor = "parquet", accent = 1, items = { plants = true, tea = true, tv = true, neon = true, sofa = true, aquarium = level >= 4, arcade = level >= 5, rgb_lights = level >= 4, posters = true, coffee = true, camera = true, tool_wall = true, parts_shelves = true, showcase = level >= 4 }, plotWidth = 62, plotDepth = 84 })
	if process.args[3] == "showcase" then
		-- the same placement ShowcaseService uses
		local DeviceGen = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceGen")
		local PCModel = Engine.mod("ReplicatedStorage.Shared.Models.PCModel")
		local Rules = Engine.mod("ReplicatedStorage.Shared.Repair.RepairRules")
		local Mock = require("../tests/lib/Mock")
		for _, pt in shopModel.Points:GetChildren() do
			local slot = pt:GetAttribute("Showcase")
			if slot then
				local dev = DeviceGen.desktop(Mock.Random.new(slot * 7), "high")
				local view = Rules.view(dev)
				PCModel.build(shopModel, view, PCModel.displayCFrame(pt.CFrame, view), { animate = false })
			end
		end
	end
	result.parts = dumpParts(folder)
	outName = "shop" .. level
elseif what == "device" then
	local kind = process.args[2] or "desktop"
	local DeviceGen = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceGen")
	local PCModel = Engine.mod("ReplicatedStorage.Shared.Models.PCModel")
	local Rules = Engine.mod("ReplicatedStorage.Shared.Repair.RepairRules")
	local Mock = require("../tests/lib/Mock")
	local rng = Mock.Random.new(tonumber(process.args[3]) or 3)
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	local dev = if kind == "laptop" then DeviceGen.laptop(rng) else DeviceGen.desktop(rng, process.args[4] or "high")
	-- extra args: steps like "remove:side_panel" "remove:gpu" "flip" "lid"; "open" = the usual cover
	local Technician = require("../tests/lib/Technician")
	local tech = Technician.new(Rules, Engine.mod("ReplicatedStorage.Shared.Data.Parts"), Engine.mod("ReplicatedStorage.Shared.Data.Tools"), dev, rng)
	for i = 5, #process.args do
		local a = process.args[i]
		if a == "open" then
			tech:ensure("remove", if kind == "laptop" then "bottom_cover" else "side_panel")
		else
			local action, target = string.match(a, "^(%w+):?([%w_]*)$")
			if action == "flip" or action == "lid" then
				local r = Rules.apply(dev, action, nil, {}, { tool = "hand", lang = "tr" })
				if not r.ok then
					print("step failed:", a, r.msg)
				end
			elseif action and target ~= "" then
				tech:ensure(action, target)
			end
		end
	end
	local model = PCModel.build(folder, Rules.view(dev), roblox.CFrame.new(0, 0, 0))
	result.parts = dumpParts(model.model)
	outName = "device_" .. kind
elseif what == "vehicles" then
	local Vehicles = Engine.mod("ReplicatedStorage.Shared.Data.Vehicles")
	local VehicleModels = Engine.mod("ReplicatedStorage.Shared.Models.VehicleModels")
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	for i, v in Vehicles.list do
		VehicleModels.build(folder, v, roblox.CFrame.new((i - 1) * 16 - 160, 0, 0), { color = v.colors[1], plate = "34 TMR " .. i, static = true })
	end
	result.parts = dumpParts(folder)
end

fs.writeDir("tools/render/out")
local path = "tools/render/out/" .. outName .. ".json"
fs.writeFile(path, serde.encode("json", result))
print(string.format("wrote %s (%d parts)", path, #result.parts))
