-- City layout invariants and a full world build in the headless engine.

local Engine = require("../lib/Engine")
local Geometry = require("../lib/Geometry")
local Vector3 = require("@lune/roblox").Vector3

return function(T)
	Engine.context = "server"
	Engine.load("build/PCTamirci.rbxlx")
	local CityLayout = Engine.mod("ReplicatedStorage.Shared.World.CityLayout")
	local Locations = Engine.mod("ReplicatedStorage.Shared.Data.Locations")

	T.test("layout: 66 plots that don't overlap and face a road", function()
		local L = CityLayout.get()
		T.eq(#L.plots, 66, "plot count")
		for i, a in L.plots do
			T.ok(a.width >= 55 and a.depth >= 70, "plot " .. i .. " too small: " .. a.width .. "x" .. a.depth)
			for j = i + 1, #L.plots do
				local b = L.plots[j]
				local d = (a.cf.Position - b.cf.Position).Magnitude
				T.ok(d > 30, string.format("plots %d and %d overlap (%.1f)", i, j, d))
			end
			local road, _, dist = CityLayout.nearestRoad(a.cf.Position)
			T.ok(road ~= nil and dist < 40, "plot " .. i .. " is far from any road")
		end
	end)

	T.test("layout: road graph is connected and routable", function()
		local L = CityLayout.get()
		local keys = {}
		for k in L.nodes do
			table.insert(keys, k)
		end
		local seen = { [keys[1]] = true }
		local queue = { keys[1] }
		while #queue > 0 do
			local k = table.remove(queue)
			for _, link in L.nodes[k].links do
				if not seen[link.node] then
					seen[link.node] = true
					table.insert(queue, link.node)
				end
			end
		end
		for _, k in keys do
			T.ok(seen[k], "node " .. k .. " unreachable")
		end
		local route = CityLayout.route(CityLayout.nearestNode(Vector3.new(-1150, 0, -1050)), CityLayout.nearestNode(Vector3.new(1150, 0, 800)))
		T.ok(#route > 10, "route too short: " .. #route)
		T.ok(#L.roads > 150, "road count " .. #L.roads)
	end)

	T.test("layout: every location exists exactly once", function()
		local L = CityLayout.get()
		for _, loc in Locations.list do
			T.ok(L.poiById[loc.id] ~= nil, "location " .. loc.id .. " is not placed")
		end
		for _, poi in L.pois do
			local p = poi.pos
			T.ok(p.X > L.bounds.minX and p.X < L.bounds.maxX and p.Z > L.bounds.minZ and p.Z < L.bounds.maxZ, poi.id .. " out of bounds")
		end
	end)

	T.test("layout: the outer belt has its districts and highways", function()
		local L = CityLayout.get()
		local seen = {}
		for _, b in L.blocks do
			seen[b.district] = (seen[b.district] or 0) + 1
			T.ok(b.x0 > L.bounds.minX and b.x1 < L.bounds.maxX and b.z0 > L.bounds.minZ and b.z1 < L.bounds.maxZ, "block " .. b.id .. " out of bounds")
		end
		for _, d in { "HVL", "OSB", "TRS", "BLK", "VIL", "TKP", "CFT", "GLF", "KRV", "YZL" } do
			T.ok((seen[d] or 0) > 0, "district " .. d .. " missing")
			T.ok(CityLayout.Districts[d] ~= nil, "district " .. d .. " has no name")
		end
		local west, east = 0, 0
		for _, r in L.roads do
			if r.vertical and r.a.X == CityLayout.XS[1] then
				west += 1
			elseif r.vertical and r.a.X == CityLayout.XS[#CityLayout.XS] then
				east += 1
			end
		end
		T.eq(west, #CityLayout.ZS - 1, "the western highway")
		T.eq(east, #CityLayout.ZS - 1, "the eastern highway")
		-- the shipyard and the port reach the water: no coastal road in front of them
		for _, r in L.roads do
			if not r.vertical and r.a.Y == CityLayout.ZS[#CityLayout.ZS] then
				local x = (r.a.X + r.b.X) / 2
				for _, id in { "shipyard", "harbor" } do
					local st = L.poiById[id].site
					T.ok(x < st.x0 or x > st.x1, "a coastal road in front of the " .. id)
				end
			end
		end
	end)

	T.test("world: builds without errors", function()
		local WorldBuilder = Engine.mod("ServerScriptService.Server.World.WorldBuilder")
		local Landmarks = Engine.mod("ServerScriptService.Server.World.Landmarks")
		local t0 = os.clock()
		local world = WorldBuilder.build({ bake = true })
		local secs = os.clock() - t0
		for _, e in Landmarks.errors or {} do
			T.ok(e == nil, "landmark error: " .. tostring(e))
		end
		local counts = { parts = 0, lights = 0, guis = 0, prompts = 0, models = 0 }
		for _, d in world:GetDescendants() do
			if d:IsA("BasePart") then
				counts.parts += 1
			elseif d:IsA("Light") then
				counts.lights += 1
			elseif d:IsA("SurfaceGui") then
				counts.guis += 1
			elseif d:IsA("ProximityPrompt") then
				counts.prompts += 1
			elseif d:IsA("Model") then
				counts.models += 1
			end
		end
		print(string.format("    city: %d parts, %d models, %d lights, %d surface guis, %d prompts, %d terrain ops, %.1fs", counts.parts, counts.models, counts.lights, counts.guis, counts.prompts, Engine.terrainCalls, secs))
		T.ok(counts.parts > 20000, "suspiciously few parts")
		T.ok(counts.parts < 120000, "too many parts for a 60-player server: " .. counts.parts)
		T.ok(counts.prompts >= 15, "service prompts missing: " .. counts.prompts)
		for _, w in Engine.warnings do
			T.ok(not string.find(w, "failed to build"), w)
		end
		Engine.world = world
	end)

	T.test("world: no empty lots and every service has its counter", function()
		local world = Engine.world
		local L = CityLayout.get()
		local blocksFolder = world:FindFirstChild("Blocks")
		local function parts(root): number
			local n = 0
			for _, d in if root then root:GetDescendants() else {} do
				if d:IsA("BasePart") then
					n += 1
				end
			end
			return n
		end
		-- ordinary blocks are built on
		for _, b in L.blocks do
			if b.kind ~= "plots" and not b.pois and not b.group then
				local n = parts(blocksFolder:FindFirstChild("Block_" .. b.id .. "_" .. b.district))
				T.ok(n >= 20, string.format("block %d (%s) is nearly empty: %d parts", b.id, b.district, n))
			end
		end
		-- and so is every landmark site
		local inSite = {}
		for _, folderName in { "Commerce", "Civic", "Nature", "Outer" } do
			for _, d in world:FindFirstChild(folderName):GetDescendants() do
				if d:IsA("BasePart") then
					local p = d.Position
					for _, poi in L.pois do
						local st = poi.site
						if st and p.X >= st.x0 and p.X <= st.x1 and p.Z >= st.z0 and p.Z <= st.z1 then
							inSite[poi.id] = (inSite[poi.id] or 0) + 1
						end
					end
				end
			end
		end
		for _, poi in L.pois do
			if poi.site then
				T.ok((inSite[poi.id] or 0) >= 8, poi.id .. "'s site is empty: " .. tostring(inSite[poi.id]))
			end
		end
		-- a counter (service anchor) for every place with gameplay
		local counters = {}
		for _, d in world:GetDescendants() do
			local poi, service = d:GetAttribute("Poi"), d:GetAttribute("Service")
			if typeof(poi) == "string" and typeof(service) == "string" then
				counters[poi] = service
			end
		end
		for _, loc in Locations.list do
			if loc.service then
				T.eq(counters[loc.id], loc.service, loc.id .. "'s counter")
			end
		end
	end)

	T.test("world: real buildings stand on their lots, clear of streets, landmarks and each other", function()
		local world = Engine.world
		local L = CityLayout.get()
		local abs = math.abs
		local function box(model)
			local lo, hi
			for _, d in model:GetDescendants() do
				if d:IsA("BasePart") and d.Name ~= "Root" then
					local cf, sz = d.CFrame, d.Size
					local r, u, l = cf.RightVector, cf.UpVector, cf.LookVector
					local e = Vector3.new(abs(r.X) * sz.X + abs(u.X) * sz.Y + abs(l.X) * sz.Z, abs(r.Y) * sz.X + abs(u.Y) * sz.Y + abs(l.Y) * sz.Z, abs(r.Z) * sz.X + abs(u.Z) * sz.Y + abs(l.Z) * sz.Z) / 2
					local p = cf.Position
					lo = if lo then lo:Min(p - e) else p - e
					hi = if hi then hi:Max(p + e) else p + e
				end
			end
			return lo, hi
		end
		local real = {}
		for _, m in world:GetDescendants() do
			if m:IsA("Model") and m:GetAttribute("Real") then
				local lo, hi = box(m)
				table.insert(real, { m = m, lo = lo, hi = hi })
			end
		end
		T.ok(#real >= 80, "real buildings: " .. #real)
		local function overlaps(a, b, margin)
			return a.lo.X + margin < b.hi.X and b.lo.X + margin < a.hi.X and a.lo.Z + margin < b.hi.Z and b.lo.Z + margin < a.hi.Z
		end
		-- inside a block (awnings may reach a little over the pavement)
		for _, r in real do
			local inside = false
			for _, b in L.blocks do
				if r.lo.X >= b.x0 - 2.5 and r.hi.X <= b.x1 + 2.5 and r.lo.Z >= b.z0 - 2.5 and r.hi.Z <= b.z1 + 2.5 then
					inside = true
					break
				end
			end
			T.ok(inside, string.format("%s at (%.0f, %.0f)..(%.0f, %.0f) leaves its block", r.m:GetFullName(), r.lo.X, r.lo.Z, r.hi.X, r.hi.Z))
			T.ok(abs(r.lo.Y - CityLayout.WALK_Y) < 0.6, r.m:GetFullName() .. " doesn't stand on the ground: " .. r.lo.Y)
		end
		-- not into each other
		for i = 1, #real do
			for j = i + 1, #real do
				T.ok(not overlaps(real[i], real[j], 1), real[i].m.Name .. " overlaps " .. real[j].m.Name .. " at " .. tostring(real[i].lo))
			end
		end
		-- not into a landmark or a shop plot
		local others = {}
		for _, folderName in { "Commerce", "Civic", "Nature", "Outer" } do
			for _, m in world:FindFirstChild(folderName):GetChildren() do
				if m:IsA("Model") then
					local lo, hi = box(m)
					-- (forests and the like spread over the countryside: only buildings count here)
					if lo and (hi.X - lo.X) * (hi.Z - lo.Z) < 300 * 300 then
						table.insert(others, { m = m, lo = lo, hi = hi })
					end
				end
			end
		end
		for _, plot in L.plots do
			local p, look = plot.cf.Position, plot.cf.LookVector
			local back = p - look * plot.depth
			local hw = plot.width / 2
			table.insert(others, { m = { Name = "plot " .. plot.id }, lo = Vector3.new(math.min(p.X, back.X) - hw, 0, math.min(p.Z, back.Z)), hi = Vector3.new(math.max(p.X, back.X) + hw, 0, math.max(p.Z, back.Z)) })
		end
		for _, r in real do
			for _, o in others do
				T.ok(not overlaps(r, o, 1), r.m:GetFullName() .. " runs into " .. tostring(o.m.Name))
			end
		end
	end)

	T.test("world: nothing hangs in the air (every part rests on the ground or touches another)", function()
		local TerrainB = Engine.mod("ServerScriptService.Server.World.TerrainBuilder")
		local floating, checked = Geometry.floating(Engine.world, function(x, z)
			return math.max(TerrainB.groundHeight(x, z), CityLayout.WALK_Y)
		end)
		for k = 1, math.min(#floating, 10) do
			print("      floating:", floating[k]:GetFullName(), floating[k].Position, floating[k].Size)
		end
		T.ok(checked > 20000, "parts checked: " .. checked)
		T.ok(#floating == 0, #floating .. " parts hang in the air")
	end)

	T.test("world: nothing thin lies on grass terrain (blades would poke through)", function()
		local world = Engine.world
		local TerrainB = Engine.mod("ServerScriptService.Server.World.TerrainBuilder")
		local bad, checked = {}, 0
		local abs = math.abs
		for _, part in world:GetDescendants() do
			if part:IsA("BasePart") and part.Transparency < 1 then
				local cf, s = part.CFrame, part.Size
				local r, u, l = cf.RightVector, cf.UpVector, cf.LookVector
				local hy = (abs(r.Y) * s.X + abs(u.Y) * s.Y + abs(l.Y) * s.Z) / 2
				local p = cf.Position
				local gy = TerrainB.groundHeight(p.X, p.Z)
				if p.Y - hy - gy < 1.5 and hy < 2 then
					checked += 1
					-- the middle and the corners of the footprint (a little inside the edges)
					for _, o in { { 0, 0 }, { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } } do
						local q = cf * Vector3.new(o[1] * s.X * 0.4, 0, o[2] * s.Z * 0.4)
						if abs(u.Y) < 0.95 then
							q = p + Vector3.new(o[1] * (abs(r.X) * s.X + abs(l.X) * s.Z) * 0.2, 0, o[2] * (abs(r.Z) * s.X + abs(l.Z) * s.Z) * 0.2)
						end
						local x, z = q.X, q.Z
						local m = Engine.terrainMaterialAt(Vector3.new(x, TerrainB.groundHeight(x, z) - 0.5, z))
						if m == "Grass" then
							table.insert(bad, part:GetFullName())
							break
						end
					end
				end
			end
		end
		print(string.format("    ground check: %d thin parts, %d terrain patches", checked, world:GetAttribute("GroundPatches") or 0))
		T.ok(checked > 1000, "checked " .. checked)
		if #bad > 0 then
			local seen = {}
			for _, b in bad do
				local k = string.match(b, "^(.-%.[^%.]+%.[^%.]+%.[^%.]+)") or b
				seen[k] = (seen[k] or 0) + 1
			end
			for k, v in seen do
				print("      on grass:", k, v)
			end
		end
		T.ok(#bad == 0, #bad .. " parts lie on grass terrain, e.g. " .. tostring(bad[1]))
		-- and the countryside and the park are still green
		T.eq(Engine.terrainMaterialAt(Vector3.new(-860, TerrainB.groundHeight(-860, -1380) - 1, -1380)), "Grass", "a hill")
		T.eq(Engine.terrainMaterialAt(Vector3.new(0, -1, 0)), "Ground", "under the city")
		local lawn = TerrainB.lawns()[1]
		T.ok(lawn ~= nil, "a park lawn")
	end)
end
