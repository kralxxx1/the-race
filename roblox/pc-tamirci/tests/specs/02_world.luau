-- City layout invariants and a full world build in the headless engine.

local Engine = require("../lib/Engine")
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
end
