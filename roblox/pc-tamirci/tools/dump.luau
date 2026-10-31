-- Builds models in the headless engine and dumps their parts to JSON for the three.js previewer.
--   lune run tools/dump.luau world            -> tools/render/out/world.json
--   lune run tools/dump.luau shop <level> [showcase] -> a player shop at a level (with PCs on display)
--   lune run tools/dump.luau device <kind>    -> a repair bench device (desktop/laptop)
--   lune run tools/dump.luau vehicles         -> every vehicle in a row
--   lune run tools/dump.luau street <x> <z> [r] -> the city around a point with client traffic

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

local function dumpParts(root, center: any?, radius: number?)
	local out = {}
	for _, d in root:GetDescendants() do
		local inRange = true
		if center and d:IsA("BasePart") then
			local p = d.Position
			inRange = (p.X - center.X) ^ 2 + (p.Z - center.Z) ^ 2 < radius * radius
		end
		if d:IsA("BasePart") and inRange then
			local okT, transp = pcall(function()
				return d.Transparency
			end)
			transp = if okT then transp else 0
			-- clear parts still count when they carry text (stickers, logos)
			if transp < 0.98 or d:FindFirstChildOfClass("SurfaceGui") then
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
						local okG, glow = pcall(function()
							return gui.LightInfluence == 0
						end)
						label = { text = tl.Text, face = gui.Face.Name, color = hex(tl.TextColor3), bg = if tl.BackgroundTransparency < 1 then hex(tl.BackgroundColor3) else nil, glow = okG and glow or nil }
					end
				end
				-- MeshParts: the mesh and its texture (ids), drawn by the previewer
				local meshId, texId = nil, nil
				if d:IsA("MeshPart") then
					-- newer files keep MeshContent/TextureContent, older ones MeshId/TextureID
					local function idOf(props)
						for _, prop in props do
							local ok, v = pcall(function()
								return tostring(d[prop])
							end)
							local id = ok and string.match(v, "(%d+)")
							if id then
								return id
							end
						end
						return nil
					end
					meshId = idOf({ "MeshContent", "MeshId" })
					texId = idOf({ "TextureContent", "TextureID" })
					local sa = d:FindFirstChildOfClass("SurfaceAppearance")
					if sa then
						local okS, cm = pcall(function()
							return tostring(sa.ColorMapContent)
						end)
						texId = (okS and string.match(cm, "(%d+)")) or texId
					end
					shape = "mesh"
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
					mesh = meshId,
					tex = texId,
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
elseif what == "pack" then
	-- the items of a downloaded Roblox pack (build/packs/<id>.rbxm) side by side, to look at them
	local fs = require("@lune/fs")
	-- a pack id, or the path of a curated library (assets/server/Nature.rbxm)
	local arg = process.args[2]
	local file = if string.find(arg, "/", 1, true) then arg else "build/packs/" .. arg .. ".rbxm"
	local insts = roblox.deserializeModel(fs.readFile(file))
	local filter = process.args[3]
	local items = if #insts == 1 then insts[1]:GetChildren() else insts
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	local x, row, rowDepth = 0, 0, 0
	for _, item in items do
		if (item:IsA("Model") or item:IsA("BasePart") or item:IsA("Folder")) and item.Name ~= "RobloxBillboard" and (not filter or string.find(item.Name, filter, 1, true)) then
			local clone = item:Clone()
			for _, d in clone:GetDescendants() do
				if d:IsA("LuaSourceContainer") then
					d:Destroy()
				end
			end
			clone.Parent = folder
			local lo, hi
			for _, d in clone:GetDescendants() do
				if d:IsA("BasePart") then
					local cf, sz = d.CFrame, d.Size
					local r, u, l = cf.RightVector, cf.UpVector, cf.LookVector
					local e = roblox.Vector3.new(
						math.abs(r.X) * sz.X + math.abs(u.X) * sz.Y + math.abs(l.X) * sz.Z,
						math.abs(r.Y) * sz.X + math.abs(u.Y) * sz.Y + math.abs(l.Y) * sz.Z,
						math.abs(r.Z) * sz.X + math.abs(u.Z) * sz.Y + math.abs(l.Z) * sz.Z
					) / 2
					local p = cf.Position
					lo = if lo then lo:Min(p - e) else p - e
					hi = if hi then hi:Max(p + e) else p + e
				end
			end
			if lo then
				local size = hi - lo
				if x > 0 and x + size.X > 400 then
					x, row, rowDepth = 0, row + rowDepth + 6, 0
				end
				local shift = roblox.Vector3.new(x - lo.X, -lo.Y, row - lo.Z)
				for _, d in clone:GetDescendants() do
					if d:IsA("BasePart") then
						d.CFrame = d.CFrame + shift
					end
				end
				print(string.format("%-40s at (%.0f, %.0f)  size %.1f x %.1f x %.1f", clone.Name, x, row, size.X, size.Y, size.Z))
				x += size.X + 6
				rowDepth = math.max(rowDepth, size.Z)
			end
		end
	end
	result.parts = dumpParts(folder)
	outName = "pack_" .. (string.match(arg, "([%w_]+)%.rbxm$") or arg)
elseif what == "shop" then
	local level = tonumber(process.args[2]) or 1
	local ShopBuilder = Engine.mod("ReplicatedStorage.Shared.Models.ShopBuilder")
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	local front = roblox.CFrame.lookAt(roblox.Vector3.new(0, 0.75, 0), roblox.Vector3.new(0, 0.75, -1))
	local items = { plants = true, tea = true, tv = true, neon = true, sofa = true, aquarium = level >= 4, arcade = level >= 5, rgb_lights = level >= 4, posters = true, coffee = true, camera = true, tool_wall = true, parts_shelves = true, showcase = level >= 4 }
	if process.args[3] == "all" then
		-- every item in the catalogue
		for _, it in Engine.mod("ReplicatedStorage.Shared.Data.Upgrades").items do
			items[it.id] = true
		end
	end
	if process.args[3] == "security" then
		for _, id in { "alarm", "motion_lights", "steel_door", "smart_lock", "cctv_hd", "guard_dog", "panic_button", "insurance", "safe" } do
			items[id] = true
		end
	end
	local shopModel = ShopBuilder.build(folder, front, { level = level, name = "Pixel PC Repair", wall = "brick", floor = "parquet", accent = 1, items = items, plotWidth = 188, plotDepth = 84, plotId = 12 })
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
	if process.args[3] == "bench" or process.args[3] == "showcase" then
		-- a PC on every bench (the placement BenchViews uses)
		local DeviceGen = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceGen")
		local PCModel = Engine.mod("ReplicatedStorage.Shared.Models.PCModel")
		local Rules = Engine.mod("ReplicatedStorage.Shared.Repair.RepairRules")
		local Mock = require("../tests/lib/Mock")
		local Technician = require("../tests/lib/Technician")
		local n = 0
		for _, bench in shopModel:GetChildren() do
			local anchor = bench:FindFirstChild("DeviceAnchor")
			if anchor then
				n += 1
				local dev = DeviceGen.desktop(Mock.Random.new(n * 5), "high")
				local tech = Technician.new(Rules, Engine.mod("ReplicatedStorage.Shared.Data.Parts"), Engine.mod("ReplicatedStorage.Shared.Data.Tools"), dev, Mock.Random.new(n))
				tech:ensure("remove", "side_panel")
				PCModel.build(shopModel, Rules.view(dev), anchor.CFrame * roblox.CFrame.Angles(0, math.pi, 0), { animate = false })
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
elseif what == "street" then
	local WorldBuilder = Engine.mod("ServerScriptService.Server.World.WorldBuilder")
	local world = WorldBuilder.build({ bake = true })
	local cx, cz = tonumber(process.args[2]) or 0, tonumber(process.args[3]) or 60
	local radius = tonumber(process.args[4]) or 260
	Engine.localPlayer = Engine.addPlayer("Viewer")
	Engine.context = "client"
	Engine.workspace.CurrentCamera.CFrame = roblox.CFrame.new(cx, 30, cz)
	local Traffic = Engine.require(Engine.find("StarterPlayer.StarterPlayerScripts.Client.Controllers.Traffic"), "client")
	Traffic.init()
	for _ = 1, 600 do
		Engine.step(1, 1 / 15)
	end
	local center = roblox.Vector3.new(cx, 0, cz)
	result.parts = dumpParts(world, center, radius)
	for _, p in dumpParts(Engine.workspace.ClientTraffic, center, radius) do
		table.insert(result.parts, p)
	end
	local cars, peds = Traffic.counts()
	print(string.format("traffic: %d cars, %d pedestrians", cars, peds))
	outName = "street"
elseif what == "poi" then
	-- the city around one landmark (no traffic): lune run tools/dump.luau poi <id> [radius]
	local WorldBuilder = Engine.mod("ServerScriptService.Server.World.WorldBuilder")
	local L = Engine.mod("ReplicatedStorage.Shared.World.CityLayout").get()
	local poi = L.poiById[process.args[2] or "plaza"]
	assert(poi, "unknown poi " .. tostring(process.args[2]))
	local world = WorldBuilder.build({ bake = true })
	result.parts = dumpParts(world, poi.pos, tonumber(process.args[3]) or 120)
	print(string.format("poi %s at (%.0f, %.0f, %.0f), door (%.0f, %.0f, %.0f)", poi.id, poi.pos.X, poi.pos.Y, poi.pos.Z, poi.door.X, poi.door.Y, poi.door.Z))
	outName = "poi_" .. poi.id
elseif what == "parts" then
	-- components side by side, each shown three ways (rows: front, top edge, back):
	--   lune run tools/dump.luau parts gpu [id|design|all ...]
	local Parts = Engine.mod("ReplicatedStorage.Shared.Data.Parts")
	local PCParts = Engine.mod("ReplicatedStorage.Shared.Models.PCParts")
	local cat = process.args[2] or "gpu"
	local picks = {}
	local function best(match)
		local top
		for _, p in Parts.byCat[cat] do
			if match(p) and (not top or (p.perf or p.price) > (top.perf or top.price)) then
				top = p
			end
		end
		return top
	end
	for i = 3, #process.args do
		local a = process.args[i]
		if a == "all" then
			local seen = {}
			for _, p in Parts.byCat[cat] do
				local key = p.design or p.id
				if not seen[key] then
					seen[key] = true
					table.insert(picks, best(function(q)
						return (q.design or q.id) == key
					end))
				end
			end
		elseif Parts.get(a) then
			table.insert(picks, Parts.get(a))
		else
			local p = best(function(q)
				return q.design == a
			end)
			assert(p, "no " .. cat .. " for " .. a)
			table.insert(picks, p)
		end
	end
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	local poses = {
		roblox.CFrame.Angles(-math.pi / 2, 0, 0), -- front (fans) up
		roblox.CFrame.new(), -- top edge up
		roblox.CFrame.Angles(math.pi / 2, 0, 0), -- back up
	}
	-- one row per item (z = (i - 1) * 2.4), its three views side by side at x = 0, 3.2, 6.4 (RAM:
	-- rows 0.9 apart, views 1.5 apart)
	local dx, dz = 3.2, 2.4
	if cat == "ram" then
		dx, dz = 1.5, 0.9
	end
	for i, p in picks do
		local z = (i - 1) * dz
		for col, pose in poses do
			local x = (col - 1) * dx
			local cf
			if cat == "gpu" then
				-- centre each view of the card on its spot
				local L, H, T = PCParts.gpuDims(p)
				local shift = ({ roblox.Vector3.new(L / 2, 0, H / 2), roblox.Vector3.new(L / 2, 0, -T / 2), roblox.Vector3.new(L / 2, 0, -H / 2) })[col]
				cf = roblox.CFrame.new(roblox.Vector3.new(x, 0, z) + shift) * pose
				local m = PCParts.gpu(cf, p, Parts.gpuConnectors(p))
				m.Parent = folder
			elseif cat == "mobo" then
				-- boards lie flat (parts up): one view, board centred on its spot
				if col == 2 then
					local W, D = 24.4, 30.5 -- along -X and +Z (PCParts.boardLayout)
					if p.form == "mATX" then
						W, D = 24.4, 24.4
					elseif p.form == "ITX" then
						W, D = 17, 17
					end
					cf = roblox.CFrame.new(x + W * 0.075 / 2, 0, z - D * 0.075 / 2)
					local m = PCParts.mobo(cf, p)
					m.Parent = folder
				end
			elseif cat == "cooler" then
				-- seen from the fan side, from above, from the back (it stands on the CPU, +Y up)
				local turn = ({ roblox.CFrame.Angles(math.rad(-60), 0, 0), roblox.CFrame.new(), roblox.CFrame.Angles(math.rad(60), 0, 0) })[col]
				cf = roblox.CFrame.new(x, 0, z) * turn
				local m = PCParts.cooler(cf, p, nil)
				m.Parent = folder
			elseif cat == "ram" then
				-- one face, the top edge, the other face (the stick runs along Z)
				local rp = ({ roblox.CFrame.Angles(0, 0, math.pi / 2), roblox.CFrame.new(), roblox.CFrame.Angles(0, 0, -math.pi / 2) })[col]
				cf = roblox.CFrame.new(x, 0, z) * roblox.CFrame.Angles(0, math.pi / 2, 0) * rp
				local m = PCParts.ram(cf, p)
				m.Parent = folder
			else
				cf = roblox.CFrame.new(x, 0, z) * pose
				local m = (PCParts :: any)[cat](cf, p)
				m.Parent = folder
			end
		end
		print(string.format("%2d  z=%.1f  %s (%s)", i, z, p.name, tostring(p.design)))
	end
	result.parts = dumpParts(folder)
	outName = "parts_" .. cat
elseif what == "tools" then
	-- every hand tool in a row (1.6 apart), tip down: lune run tools/dump.luau tools
	local Tools = Engine.mod("ReplicatedStorage.Shared.Data.Tools")
	local ToolModels = Engine.mod("ReplicatedStorage.Shared.Models.ToolModels")
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	local n = 0
	for _, t in Tools.list do
		if t.model then
			n += 1
			local m = ToolModels.build(t.model, folder)
			m:PivotTo(roblox.CFrame.new((n - 1) * 1.6, 0, 0))
		end
	end
	result.parts = dumpParts(folder)
	outName = "tools"
elseif what == "people" then
	-- a row of rolled people, every look once: lune run tools/dump.luau people [count] [seed]
	local Npc = Engine.mod("ServerScriptService.Server.Services.NpcService")
	Npc.init()
	local Mock = require("../tests/lib/Mock")
	local rng = Mock.Random.new(tonumber(process.args[3]) or 4)
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	local names = {}
	for name in Npc.Looks do
		table.insert(names, name)
	end
	table.sort(names)
	local n = tonumber(process.args[2]) or 16
	for i = 1, n do
		local person = Npc.plain(names[(i - 1) % #names + 1], if i % 2 == 0 then "m" else "f", rng)
		person.Parent = folder
		person:PivotTo(roblox.CFrame.new(((i - 1) % 8) * 4 - 14, 3, math.floor((i - 1) / 8) * 5) * roblox.CFrame.Angles(0, math.pi, 0))
	end
	result.parts = dumpParts(folder)
	outName = "people"
elseif what == "police" then
	-- the twenty police cars and the street-only vehicles: lune run tools/dump.luau police
	local Vehicles = Engine.mod("ReplicatedStorage.Shared.Data.Vehicles")
	local VehicleModels = Engine.mod("ReplicatedStorage.Shared.Models.VehicleModels")
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	for i, v in Vehicles.police do
		VehicleModels.build(folder, v, roblox.CFrame.new((i - 1) % 10 * 26, 0, math.floor((i - 1) / 10) * 44), { color = 1, plate = "POL " .. i, static = true, procedural = i % 2 == 0, police = v })
	end
	for i, v in Vehicles.street do
		VehicleModels.build(folder, v, roblox.CFrame.new((i - 1) * 30, 0, 110), { color = i, plate = "ST " .. i, static = true, procedural = true })
	end
	for i = 1, 8 do
		local v = Vehicles.list[i + 8]
		if v and v.kind == "car" then
			VehicleModels.build(folder, v, roblox.CFrame.new((i - 1) * 28, 0, 160), { color = i, plate = "CAR " .. i, static = true, procedural = i % 2 == 1, decorate = true })
		end
	end
	result.parts = dumpParts(folder)
	outName = "police"
elseif what == "guide" then
	-- the tutorial's guide arrow
	Engine.localPlayer = Engine.addPlayer("Viewer")
	Engine.context = "client"
	local Guide = Engine.require(Engine.find("StarterPlayer.StarterPlayerScripts.Client.Controllers.Guide"), "client")
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	local a = Guide._buildArrow()
	a.Parent = folder
	a:PivotTo(roblox.CFrame.new(0, 4, 0))
	local floor = roblox.Instance.new("Part")
	floor.Size = roblox.Vector3.new(20, 1, 20)
	floor.CFrame = roblox.CFrame.new(0, -0.5, 0)
	floor.Parent = folder
	result.parts = dumpParts(folder)
	outName = "guide"
elseif what == "sky" then
	Engine.localPlayer = Engine.addPlayer("Viewer")
	Engine.context = "client"
	local Sky = Engine.require(Engine.find("StarterPlayer.StarterPlayerScripts.Client.Controllers.Sky"), "client")
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	Sky._folder(folder)
	local plane = Sky._buildPlane()
	plane:PivotTo(roblox.CFrame.lookAt(roblox.Vector3.new(0, 10, 0), roblox.Vector3.new(1, 10, -1)))
	local balloon = Sky._buildBalloon({ roblox.Color3.fromRGB(230, 60, 60), roblox.Color3.fromRGB(250, 210, 60) })
	balloon:PivotTo(roblox.CFrame.new(60, 30, 0))
	result.parts = dumpParts(folder)
	outName = "sky"
elseif what == "vehicles" then
	local Vehicles = Engine.mod("ReplicatedStorage.Shared.Data.Vehicles")
	local VehicleModels = Engine.mod("ReplicatedStorage.Shared.Models.VehicleModels")
	local folder = roblox.Instance.new("Folder")
	folder.Parent = Engine.workspace
	-- every car in three different dresses (colour, rims, tint, rack, taxi), the two-wheelers once
	local n = 0
	for i, v in Vehicles.list do
		if v.kind == "car" then
			n += 1
			for j = 1, 3 do
				local pal = VehicleModels.PALETTE[(n * 3 + j * 5) % #VehicleModels.PALETTE + 1]
				VehicleModels.build(folder, v, roblox.CFrame.new(n * 22 - 160, 0, j * 14), { color = pal, plate = "KX-" .. (n * 37 + j * 11), static = true, taxi = n == 4 and j == 2 })
			end
		else
			VehicleModels.build(folder, v, roblox.CFrame.new((i - 1) * 16 - 160, 0, -16), { color = v.colors[1], plate = "KX-" .. i, static = true })
		end
	end
	result.parts = dumpParts(folder)
end

fs.writeDir("tools/render/out")
local path = "tools/render/out/" .. outName .. ".json"
fs.writeFile(path, serde.encode("json", result))
print(string.format("wrote %s (%d parts)", path, #result.parts))
