-- The street life: big cars with their driver inside, wheels that roll and steer, indicators before a
-- turn, twenty kinds of police car, traffic officers at the junctions, and road signs by the road.

local Engine = require("../lib/Engine")
local Mock = require("../lib/Mock")
local roblox = require("@lune/roblox")

return function(T)
	Engine.context = "server"
	local game = Engine.load("build/PCTamirci.rbxlx")
	local Vehicles = Engine.mod("ReplicatedStorage.Shared.Data.Vehicles")
	local VehicleModels = Engine.mod("ReplicatedStorage.Shared.Models.VehicleModels")

	local function count(t)
		local n = 0
		for _ in t do
			n += 1
		end
		return n
	end

	local function partsNamed(m, name)
		local out = {}
		for _, d in m:GetDescendants() do
			if d:IsA("BasePart") and d.Name == name then
				table.insert(out, d)
			end
		end
		return out
	end

	T.test("traffic: twenty kinds of police car, each with its lights and indicators", function()
		T.eq(#Vehicles.police, 20, "twenty kinds")
		local ids, bodies, paints, names = {}, {}, {}, {}
		for i, v in Vehicles.police do
			T.ok(not ids[v.id], "duplicate " .. v.id)
			ids[v.id] = true
			bodies[v.body] = true
			paints[v.paint] = true
			names[v.name.en] = true
			T.ok(VehicleModels.LIVERIES[v.paint] ~= nil, "no paint scheme " .. tostring(v.paint))
			local folder = roblox.Instance.new("Folder")
			folder.Parent = Engine.workspace
			local m = VehicleModels.build(folder, v, roblox.CFrame.new(0, 0, 0), { color = 1, plate = "POL " .. i, static = true, procedural = i % 2 == 0, police = v })
			local red, blue = 0, 0
			for _, l in partsNamed(m, "PoliceLight") do
				if l:GetAttribute("Hue") == "red" then
					red += 1
				else
					blue += 1
				end
			end
			T.ok(red >= 1 and blue >= 1, v.id .. " has no red and blue lights")
			T.eq(#partsNamed(m, "Blinker"), 4, v.id .. " indicators")
			T.eq(m:GetAttribute("Police"), v.id, "tagged as police")
			-- (a police car is not wearing the service van's text)
			for _, d in m:GetDescendants() do
				if d:IsA("TextLabel") then
					T.ok(not string.find(d.Text, "PC REPAIR", 1, true), v.id .. " carries the service van text")
				end
			end
			folder:Destroy()
		end
		T.ok(count(bodies) >= 10, "body shapes: " .. count(bodies))
		T.ok(count(paints) >= 10, "paint schemes: " .. count(paints))
		T.ok(count(names) == 20, "every kind has a name of its own")
	end)

	T.test("traffic: the street's own vehicles (buses, trucks, vans, taxis) and car variety", function()
		for _, v in Vehicles.street do
			local folder = roblox.Instance.new("Folder")
			folder.Parent = Engine.workspace
			local m = VehicleModels.build(folder, v, roblox.CFrame.new(), { color = 1, plate = "ST", static = true, procedural = true })
			local _, size = m:GetBoundingBox()
			if v.body == "bus" then
				T.ok(size.Z > 26 and size.Y > 6, "a bus is long and tall: " .. tostring(size))
			elseif v.body == "truck" then
				T.ok(size.Y > 7 and #partsNamed(m, "CargoBox") == 1, "a box truck has its cargo box")
			end
			folder:Destroy()
		end
		-- the same dozen car kinds come out looking different (colours, rims, stripes, roofs, extras)
		local rng = Mock.Random.new(3)
		local seen, n = {}, 0
		local cars = {}
		for _, v in Vehicles.list do
			if v.kind == "car" then
				table.insert(cars, v)
			end
		end
		for _, v in Vehicles.street do
			table.insert(cars, v)
		end
		for i = 1, 400 do
			local def = cars[rng:NextInteger(1, #cars)]
			local folder = roblox.Instance.new("Folder")
			folder.Parent = Engine.workspace
			local procedural = rng:NextNumber() < 0.5
			local m = VehicleModels.build(folder, def, roblox.CFrame.new(), { color = rng:NextInteger(1, #VehicleModels.PALETTE), plate = "V" .. i * 7919, static = true, procedural = procedural })
			-- (what the car is made of: every part's name and colour)
			local look = {}
			for _, d in m:GetDescendants() do
				if d:IsA("BasePart") and d.Transparency < 1 then
					table.insert(look, string.format("%s:%.2f.%.2f.%.2f", d.Name, d.Color.R, d.Color.G, d.Color.B))
				end
			end
			table.sort(look)
			seen[def.id .. "|" .. tostring(procedural) .. "|" .. table.concat(look, ",")] = true
			n += 1
			folder:Destroy()
		end
		-- (before this work a dozen cars in sixteen colours gave a couple of hundred looks)
		T.ok(count(seen) >= 330, "different cars among " .. n .. ": " .. count(seen))
	end)

	T.test("traffic: an umbrella has a dome, trim, ribs, a shaft and a handle, and is carried beside the head with the arm reaching up to it", function()
		local Umbrella = Engine.mod("ReplicatedStorage.Shared.Models.Umbrella")
		local Npc = Engine.mod("ServerScriptService.Server.Services.NpcService")
		Npc.init()
		T.eq(#Umbrella.COLORS, 10, "ten colours")
		local u = Umbrella.build(Umbrella.COLORS[3])
		local counts = {}
		for _, d in u:GetDescendants() do
			if d:IsA("BasePart") then
				counts[d.Name] = (counts[d.Name] or 0) + 1
			end
		end
		T.eq(counts.Rib, 8, "eight ribs")
		T.eq(counts.Trim, 8, "eight pieces of trim")
		T.ok(counts.Shaft == 1 and counts.Handle == 1 and counts.Finial == 1, "shaft, handle and finial")
		T.ok(counts.Canopy ~= nil and counts.Canopy >= 1, "a canopy")
		T.ok(u.PrimaryPart ~= nil and u.PrimaryPart:FindFirstChild("GripPoint") ~= nil, "the grip point the hand is led to")
		for _, d in u:GetDescendants() do
			if d:IsA("BasePart") then
				T.ok(not d.CanCollide and not d.CanQuery, d.Name .. " does not get in the way")
			end
		end
		T.ok(u:GetAttribute("Height") > 2.5, "taller than a person's head")
		u:Destroy()
		-- carried: beside the head, the canopy above it, hanging from the head by welds
		local rng = Mock.Random.new(3)
		local person = Npc.plain("casual", "f", rng)
		person.Parent = Engine.workspace
		person:PivotTo(roblox.CFrame.new(0, 5, 0))
		local m = Umbrella.carry(person, Umbrella.COLORS[1])
		T.ok(m ~= nil and m.Parent == person, "in the person's hands")
		local head = person:FindFirstChild("Head")
		local canopy = m:FindFirstChild("Canopy")
		T.ok(canopy.Position.Y > head.Position.Y + 1.2, "the canopy is over the head")
		T.ok(math.abs(canopy.Position.X - head.Position.X) < 2, "and over it, not off to the side")
		T.ok(m.PrimaryPart.Position.X - head.Position.X > 0.5, "the handle is beside the head, in the right hand")
		local ik = person:FindFirstChildOfClass("Humanoid"):FindFirstChild("UmbrellaArm")
		if ik then
			T.eq(ik.EndEffector.Name, "RightHand", "the right hand")
			T.eq(ik.Target.Name, "GripPoint", "goes to the handle")
		end
		Umbrella.drop(person, m)
		T.ok(m.Parent == nil, "put away")
		T.ok(person:FindFirstChildOfClass("Humanoid"):FindFirstChild("UmbrellaArm") == nil, "the arm is free again")
		person:Destroy()
	end)

	T.test("traffic: road signs stand by the road, not in it", function()
		local world = Engine.mod("ServerScriptService.Server.World.WorldBuilder").build({ bake = true })
		local CityLayout = Engine.mod("ReplicatedStorage.Shared.World.CityLayout")
		local L = CityLayout.get()
		local kinds = {}
		local signs = {}
		for _, d in world:GetDescendants() do
			if d:IsA("Model") and string.sub(d.Name, 1, 9) == "RoadSign_" then
				local kind = string.sub(d.Name, 10)
				kinds[kind] = (kinds[kind] or 0) + 1
				table.insert(signs, d)
			end
		end
		T.ok((kinds.stop or 0) >= 20, "stop signs: " .. tostring(kinds.stop))
		T.ok((kinds.limit or 0) >= 100, "speed limit signs: " .. tostring(kinds.limit))
		T.ok((kinds.crossing or 0) >= 4, "crossing signs: " .. tostring(kinds.crossing))
		T.ok((kinds.parking or 0) >= 10, "parking signs: " .. tostring(kinds.parking))
		-- no pole stands on a carriageway
		local checked = 0
		for _, sign in signs do
			local pole = sign:FindFirstChildWhichIsA("BasePart")
			local p = pole.Position
			for _, r in L.roads do
				local a = roblox.Vector3.new(r.a.X, 0, r.a.Y)
				local b = roblox.Vector3.new(r.b.X, 0, r.b.Y)
				local dir = (b - a).Unit
				local right = roblox.Vector3.new(-dir.Z, 0, dir.X)
				local along = (p - a):Dot(dir)
				local lateral = math.abs((p - a):Dot(right))
				local sidewalk = if r.kind == "main" then 10 elseif r.kind == "ring" then 6 else 9
				local cw = r.width - sidewalk * 2
				if along > 0 and along < (b - a).Magnitude then
					checked += 1
					T.ok(lateral > cw / 2 + 0.4, string.format("a %s sign stands in %s (%.1f of %.1f)", sign.Name, r.name or r.id, lateral, cw / 2))
				end
			end
		end
		T.ok(checked > 200, "poles checked: " .. checked)
	end)
end
