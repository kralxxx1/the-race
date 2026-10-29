-- Player shop: every level builds, exposes the markers gameplay needs, and nothing overlaps.

local Engine = require("../lib/Engine")
local Geometry = require("../lib/Geometry")
local roblox = require("@lune/roblox")
local CFrame, Vector3, Instance = roblox.CFrame, roblox.Vector3, roblox.Instance

local ALL_ITEMS = {
	plants = true, tea = true, coffee = true, vending = true, aquarium = true, arcade = true, tv = true, sofa = true,
	carpet = true, music = true, ac = true, posters = true, rgb_lights = true, trophy = true, neon = true,
	camera = true, alarm = true, shutter = true, safe = true, tool_wall = true, parts_shelves = true, showcase = true,
	bench_mat = true, bench_led = true, microscope = true, sign_pro = true, parking = true,
}

-- Furniture footprints in the shop's local frame: { name, min, max } from collidable parts.
local function footprints(shop, front)
	local list = {}
	local function addBox(name, parts)
		local lo, hi = Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge)
		local any = false
		for _, p in parts do
			if p.CanCollide and p.Size.Y > 0.5 then
				any = true
				local h = p.Size / 2
				for _, sx in { -1, 1 } do
					for _, sy in { -1, 1 } do
						for _, sz in { -1, 1 } do
							local w = p.CFrame * Vector3.new(h.X * sx, h.Y * sy, h.Z * sz)
							local l = front:PointToObjectSpace(w)
							lo = Vector3.new(math.min(lo.X, l.X), math.min(lo.Y, l.Y), math.min(lo.Z, l.Z))
							hi = Vector3.new(math.max(hi.X, l.X), math.max(hi.Y, l.Y), math.max(hi.Z, l.Z))
						end
					end
				end
			end
		end
		-- (things in the forecourt or up on the roof aren't furniture in the hall)
		if any and hi.Z > 0.5 and lo.Y < 12 then
			table.insert(list, { name = name, lo = lo, hi = hi })
		end
	end
	for _, child in shop:GetChildren() do
		if child:IsA("Model") and child.Name ~= "Building" and child.Name ~= "Planter" and child.Name ~= "Bench" then
			local parts = {}
			for _, d in child:GetDescendants() do
				if d:IsA("BasePart") then
					table.insert(parts, d)
				end
			end
			addBox(child.Name, parts)
		elseif child:IsA("BasePart") then
			local l = front:PointToObjectSpace(child.Position)
			-- only furniture inside the hall, not the forecourt, lawn or facade decorations
			if l.Z > 0.5 and l.Y < 12 then
				addBox("Part:" .. child.Name, { child })
			end
		end
	end
	return list
end

local function overlaps(a, b, pad)
	return a.lo.X + pad < b.hi.X and b.lo.X + pad < a.hi.X and a.lo.Z + pad < b.hi.Z and b.lo.Z + pad < a.hi.Z and a.lo.Y < b.hi.Y and b.lo.Y < a.hi.Y
end

return function(T)
	Engine.context = "server"
	Engine.load("build/PCTamirci.rbxlx")
	local ShopBuilder = Engine.mod("ReplicatedStorage.Shared.Models.ShopBuilder")
	local Upgrades = Engine.mod("ReplicatedStorage.Shared.Data.Upgrades")

	local function build(level, items, plotCf)
		local folder = Instance.new("Folder")
		folder.Parent = Engine.workspace
		local shop, info = ShopBuilder.build(folder, plotCf, { level = level, name = "Test Bilgisayar", owner = "Tester", items = items, plotWidth = 62, plotDepth = 84, seed = level })
		return folder, shop, info
	end

	T.test("shop: every level builds with all markers", function()
		for level = 1, #Upgrades.levels do
			local L = Upgrades.levels[level]
			for _, items in { {}, ALL_ITEMS } do
				local plot = CFrame.new(300, 0.75, -120) * CFrame.Angles(0, math.rad(90 * level), 0)
				local folder, shop, info = build(level, items, plot)
				T.eq(shop:GetAttribute("Level"), level, "level attribute")
				T.eq(shop:GetAttribute("Benches"), L.benches, "level " .. level .. " benches")
				T.eq(info.width, L.w, "width")
				local points = shop:FindFirstChild("Points")
				for _, name in { "Street", "Outside", "Door", "CounterFront", "CounterBack", "Register", "GuardSpot", "ManagerSpot", "CleanerSpot", "ThiefExit", "Parking", "Seat_1", "Shelf_1" } do
					T.ok(points:FindFirstChild(name) ~= nil, "level " .. level .. " is missing point " .. name)
				end
				for i = 1, L.queue do
					T.ok(points:FindFirstChild("Queue_" .. i) ~= nil, "missing Queue_" .. i)
				end
				for i = 1, L.benches do
					T.ok(points:FindFirstChild("Staff_" .. i) ~= nil, "missing Staff_" .. i)
					local bench = shop:FindFirstChild("Workbench_" .. i)
					T.ok(bench ~= nil, "missing Workbench_" .. i)
					for _, marker in { "DeviceAnchor", "CameraAnchor", "PromptAnchor" } do
						T.ok(bench:FindFirstChild(marker) ~= nil, "bench " .. i .. " missing " .. marker)
					end
					local prompt = bench:FindFirstChild("PromptAnchor"):FindFirstChildOfClass("ProximityPrompt")
					T.ok(prompt ~= nil and prompt.Name == "BenchPrompt" and prompt:GetAttribute("Bench") == i, "bench prompt " .. i)
					-- the technician looks at the device: camera sits on the stool side
					local dev = info.front:PointToObjectSpace(bench:FindFirstChild("DeviceAnchor").Position)
					local cam = info.front:PointToObjectSpace(bench:FindFirstChild("CameraAnchor").Position)
					T.ok(cam.Y > dev.Y + 4, "camera above the bench")
					T.ok(math.abs(dev.X) < L.w / 2 and dev.Z > 0 and dev.Z < L.d, "bench " .. i .. " outside the hall")
				end
				T.ok(#shop:GetTags() > 0 and shop:HasTag("PlayerShop"), "tagged PlayerShop")
				-- nothing in the shop hangs in the air
				local floating = Geometry.floating(shop, function()
					return plot.Position.Y
				end)
				for k = 1, math.min(#floating, 6) do
					local f = floating[k]
					print("      floating:", f:GetFullName(), f.Size, info.front:PointToObjectSpace(f.Position))
				end
				T.ok(#floating == 0, "level " .. level .. ": " .. #floating .. " parts hang in the air")
				folder:Destroy()
			end
		end
	end)

	T.test("shop: furniture never overlaps and NPC spots are free", function()
		local problems = {}
		local function box(b)
			return string.format("[x %.1f..%.1f y %.1f..%.1f z %.1f..%.1f]", b.lo.X, b.hi.X, b.lo.Y, b.hi.Y, b.lo.Z, b.hi.Z)
		end
		for level = 1, #Upgrades.levels do
			local L = Upgrades.levels[level]
			local folder, shop, info = build(level, ALL_ITEMS, CFrame.new(0, 0.75, 0))
			local boxes = footprints(shop, info.front)
			for i = 1, #boxes do
				local a = boxes[i]
				-- inside the walls
				local inner = L.w / 2 - 1
				if not (a.lo.X > -inner - 0.05 and a.hi.X < inner + 0.05 and a.lo.Z > 0.95 and a.hi.Z < L.d - 1 + 0.05) then
					table.insert(problems, string.format("level %d: %s %s pokes through a wall", level, a.name, box(a)))
				end
				for j = i + 1, #boxes do
					local b = boxes[j]
					if overlaps(a, b, 0.15) then
						table.insert(problems, string.format("level %d: %s %s overlaps %s %s", level, a.name, box(a), b.name, box(b)))
					end
				end
			end
			-- places NPCs stand must be walkable
			for _, mk in shop:FindFirstChild("Points"):GetChildren() do
				local n = mk.Name
				if not string.match(n, "^Seat_") and not string.match(n, "^Staff_") and not string.match(n, "^Showcase_") and n ~= "Register" then
					local l = info.front:PointToObjectSpace(mk.Position)
					local spot = { lo = Vector3.new(l.X - 0.7, 0.5, l.Z - 0.7), hi = Vector3.new(l.X + 0.7, 5, l.Z + 0.7) }
					for _, b in boxes do
						if overlaps(spot, b, 0) then
							table.insert(problems, string.format("level %d: point %s (%.1f, %.1f) stands inside %s %s", level, n, l.X, l.Z, b.name, box(b)))
						end
					end
				end
			end
			folder:Destroy()
		end
		T.ok(#problems == 0, #problems .. " layout problems:\n" .. table.concat(problems, "\n"))
	end)

	T.test("shop: every catalogue item finds a place — nothing floats, nothing overlaps", function()
		local ShopExtras = Engine.mod("ReplicatedStorage.Shared.Models.ShopExtras")
		local every = {}
		for _, it in Upgrades.items do
			every[it.id] = true
			if it.place and it.place ~= "none" and not string.find("door facade counter_glow bench_chair work_floor", it.place, 1, true) then
				T.ok(ShopExtras.LOOKS[it.id] ~= nil, "a look for " .. it.id)
			end
		end
		local problems = {}
		for level = 1, #Upgrades.levels do
			local L = Upgrades.levels[level]
			local plot = CFrame.new(0, 0.75, 0)
			local folder, shop, info = build(level, every, plot)
			local extras = 0
			for _, child in shop:GetChildren() do
				if string.match(child.Name, "^Extra_") then
					extras += 1
				end
			end
			print(string.format("      level %d: %d catalogue items shown", level, extras))
			T.ok(extras >= 75 + level * 3, "level " .. level .. " shows " .. extras .. " items")
			-- the licences and safety gear the inspection asks for always find a spot
			for _, id in { "license", "fire_extinguisher", "first_aid", "price_tags", "exit_sign", "cash_register" } do
				T.ok(shop:FindFirstChild("Extra_" .. id) ~= nil, "level " .. level .. " shows " .. id)
			end
			local floating = Geometry.floating(shop, function()
				return plot.Position.Y
			end)
			for k = 1, math.min(#floating, 8) do
				local f = floating[k]
				table.insert(problems, string.format("level %d: %s floats at %s", level, f:GetFullName(), tostring(info.front:PointToObjectSpace(f.Position))))
			end
			local boxes = footprints(shop, info.front)
			local inner = L.w / 2 - 1
			for i = 1, #boxes do
				local a = boxes[i]
				if string.match(a.name, "^Extra_") and not (a.lo.X > -inner - 0.6 and a.hi.X < inner + 0.6 and a.lo.Z > 0.4 and a.hi.Z < L.d - 0.4) then
					table.insert(problems, string.format("level %d: %s pokes through a wall", level, a.name))
				end
				for j = i + 1, #boxes do
					local b = boxes[j]
					if (string.match(a.name, "^Extra_") or string.match(b.name, "^Extra_")) and overlaps(a, b, 0.15) then
						table.insert(problems, string.format("level %d: %s overlaps %s", level, a.name, b.name))
					end
				end
			end
			-- the doorway stays clear
			for _, b in boxes do
				if string.match(b.name, "^Extra_") and b.lo.X < 4 and b.hi.X > -4 and b.lo.Z < 6 and b.lo.Y < 7 then
					table.insert(problems, string.format("level %d: %s blocks the doorway", level, b.name))
				end
			end
			folder:Destroy()
		end
		T.ok(#problems == 0, #problems .. " problems:\n" .. table.concat(problems, "\n"))
	end)

	T.test("shop: empty lot has a claim prompt", function()
		local folder = Instance.new("Folder")
		folder.Parent = Engine.workspace
		local lot = ShopBuilder.emptyLot(folder, CFrame.new(0, 0.75, 0), 62, 84, 17)
		T.eq(lot:GetAttribute("Plot"), 17, "plot attribute")
		local found
		for _, d in lot:GetDescendants() do
			if d:IsA("ProximityPrompt") and d.Name == "ClaimPrompt" then
				found = d
			end
		end
		T.ok(found ~= nil and found:GetAttribute("Plot") == 17, "claim prompt")
		folder:Destroy()
	end)
end
