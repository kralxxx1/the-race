-- Nature and leisure: Lake Park, the funfair, the container port, the marina, the old pier,
-- the lighthouse, the beach, the northern hills (viewpoint, wind farm, campsite, radio tower)
-- and the forests and countryside around the city (the farmland is in LandmarksOuter). Moving
-- parts are tagged for client-side animation.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Props = require(Shared.Models.Props)
local Buildings = require(Shared.Models.Buildings)
local CityLayout = require(Shared.World.CityLayout)
local Terrain = require(script.Parent.TerrainBuilder)

local Nature = {}
local M = Enum.Material
local WALK_Y = CityLayout.WALK_Y

local function nc(extra)
	local t = { CanCollide = false, CanTouch = false }
	if extra then
		for k, v in extra do
			t[k] = v
		end
	end
	return t
end

local function ground(x: number, z: number): number
	return Terrain.groundHeight(x, z)
end

----------------------------------------------------------------------------------------------------
-- Lake Park
----------------------------------------------------------------------------------------------------
local function park(parent, poi, rng)
	local s = poi.site
	local m = B.model("LakePark", parent)
	local PARK_Y = 0 -- the park has no paving slab: it sits on terrain grass around the lake
	local lake = Terrain.Lake
	-- the block ground is grass; cut the lake out visually by leaving it to the terrain water
	local path = Color3.fromRGB(206, 190, 160)
	-- winding loop path around the lake (segments)
	local n = 28
	for i = 0, n - 1 do
		local a0, a1 = i / n * math.pi * 2, (i + 1) / n * math.pi * 2
		local r = lake.radius + 26
		local p0 = Vector3.new(lake.x + math.cos(a0) * r, PARK_Y + 0.06, lake.z + math.sin(a0) * r * 0.9)
		local p1 = Vector3.new(lake.x + math.cos(a1) * r, PARK_Y + 0.06, lake.z + math.sin(a1) * r * 0.9)
		local len = (p1 - p0).Magnitude
		B.box(m, CFrame.lookAt((p0 + p1) / 2, p1), Vector3.new(8, 0.12, len + 1), path, M.Pavement, nc({ CanCollide = true }))
		if i % 3 == 0 then
			local out = ((p0 - Vector3.new(lake.x, p0.Y, lake.z)).Unit)
			Props.bench(m, CFrame.lookAt(p0 + out * 6, Vector3.new(lake.x, p0.Y, lake.z)))
		elseif i % 3 == 1 then
			local out = ((p0 - Vector3.new(lake.x, p0.Y, lake.z)).Unit)
			Props.streetLamp(m, CFrame.lookAt(p0 + out * 6, Vector3.new(lake.x, p0.Y, lake.z)), "classic")
		end
	end
	-- straight paths from the park gates to the loop
	for _, g in { Vector3.new(lake.x, 0, s.z0 + 4), Vector3.new(lake.x, 0, s.z1 - 4), Vector3.new(s.x0 + 4, 0, lake.z), Vector3.new(s.x1 - 4, 0, lake.z) } do
		local target = Vector3.new(lake.x, 0, lake.z)
		local dir = (target - g).Unit
		local len = (target - g).Magnitude - lake.radius - 26
		if len > 4 then
			local mid = g + dir * len / 2
			B.box(m, CFrame.lookAt(Vector3.new(mid.X, PARK_Y + 0.06, mid.Z), Vector3.new(target.X, PARK_Y + 0.06, target.Z)), Vector3.new(8, 0.12, len), path, M.Pavement, nc({ CanCollide = true }))
		end
	end
	-- arched wooden bridge across the narrow part of the lake
	local bridge = CFrame.lookAt(Vector3.new(lake.x + 30, 0, lake.z + 40), Vector3.new(lake.x + 70, 0, lake.z + 20))
	local wood = Color3.fromRGB(150, 100, 60)
	for k = -4, 4 do
		local y = 3.2 - (k * k) * 0.16
		B.box(m, bridge * CFrame.new(0, y, k * 4), Vector3.new(8, 0.6, 4.2), wood, M.WoodPlanks)
		for side = -1, 1, 2 do
			B.box(m, bridge * CFrame.new(side * 3.8, y + 1.6, k * 4), Vector3.new(0.3, 3, 0.3), wood, M.Wood)
		end
	end
	for side = -1, 1, 2 do
		B.box(m, bridge * CFrame.new(side * 3.8, 5.6, 0), Vector3.new(0.3, 0.3, 34), Color3.fromRGB(200, 60, 40), M.Wood)
	end
	-- gazebo on a little island point
	local gz = CFrame.new(lake.x - lake.radius - 10, PARK_Y, lake.z - 20)
	B.cylY(m, gz * CFrame.new(0, 0.5, 0), 1, 18, Color3.fromRGB(220, 214, 200), M.Marble)
	for i = 0, 5 do
		local a = i * math.pi / 3
		B.cylY(m, gz * CFrame.new(math.cos(a) * 7.5, 5.5, math.sin(a) * 7.5), 10, 0.8, Color3.fromRGB(245, 245, 240), M.Wood)
	end
	B.spire(m, gz * CFrame.new(0, 13, 0), 20, 5, Color3.fromRGB(120, 60, 50), M.ClayRoofTiles)
	-- playground
	local pg = CFrame.new(s.x1 - 60, PARK_Y, s.z0 + 60)
	B.box(m, pg * CFrame.new(0, 0.05, 0), Vector3.new(40, 0.1, 30), Color3.fromRGB(226, 200, 150), M.Sand, nc({ CanCollide = true }))
	B.box(m, pg * CFrame.new(-10, 5, 0), Vector3.new(6, 0.5, 6), Color3.fromRGB(240, 70, 60), M.SmoothPlastic)
	for x = -1, 1, 2 do
		for z = -1, 1, 2 do
			B.box(m, pg * CFrame.new(-10 + x * 2.8, 2.5, z * 2.8), Vector3.new(0.5, 5, 0.5), Color3.fromRGB(40, 120, 220), M.Metal)
		end
	end
	B.wedge(m, pg * CFrame.new(-10, 2.6, -7.6), Vector3.new(3, 5, 9), Color3.fromRGB(250, 200, 40), M.SmoothPlastic)
	-- swings
	B.box(m, pg * CFrame.new(10, 8, 0), Vector3.new(14, 0.5, 0.5), Color3.fromRGB(40, 120, 220), M.Metal)
	for x = -1, 1, 2 do
		B.box(m, pg * CFrame.new(10 + x * 6.8, 4, 0) * CFrame.Angles(0, 0, x * 0.18), Vector3.new(0.5, 8.4, 0.5), Color3.fromRGB(40, 120, 220), M.Metal)
	end
	for k = -1, 1, 2 do
		-- a seat on two chains, hinged at the bar (clients swing the whole thing about the hinge)
		local swing = B.model("Swing", m)
		local hinge = B.marker(swing, "Hinge", pg * CFrame.new(10 + k * 2.5, 7.75, 0), Vector3.new(0.2, 0.2, 0.2))
		swing.PrimaryPart = hinge
		B.box(swing, pg * CFrame.new(10 + k * 2.5, 2.4, 0), Vector3.new(2, 0.3, 1), Color3.fromRGB(240, 70, 60), M.SmoothPlastic, nc({ Name = "Seat" }))
		for side = -1, 1, 2 do
			B.box(swing, pg * CFrame.new(10 + k * 2.5 + side * 0.85, 5.15, 0), Vector3.new(0.08, 5.2, 0.08), Color3.fromRGB(150, 150, 156), M.Metal, nc())
		end
		swing:AddTag("Swing")
	end
	-- lots of trees, flower beds, picnic tables
	for _ = 1, 90 do
		local x, z = Rand.range(rng, s.x0 + 8, s.x1 - 8), Rand.range(rng, s.z0 + 8, s.z1 - 8)
		local dl = math.sqrt((x - lake.x) ^ 2 + ((z - lake.z) / 0.9) ^ 2)
		local inPlay = math.abs(x - (s.x1 - 60)) < 26 and math.abs(z - (s.z0 + 60)) < 22
		if dl > lake.radius + 36 and not inPlay then
			Props.tree(m, CFrame.new(x, PARK_Y, z), Rand.pick(rng, { "oak", "oak", "oak", "birch", "pine", "cypress", "bush" }), rng)
		end
	end
	for _ = 1, 8 do
		local a = rng:NextNumber() * math.pi * 2
		local r = lake.radius + Rand.range(rng, 40, 70)
		Props.flowerBed(m, CFrame.new(lake.x + math.cos(a) * r, PARK_Y, lake.z + math.sin(a) * r), 10, 4, rng)
	end
	for _ = 1, 6 do
		local p = CFrame.new(Rand.range(rng, s.x0 + 30, s.x0 + 120), PARK_Y, Rand.range(rng, s.z1 - 100, s.z1 - 20))
		-- a picnic table: top and two benches on legs
		B.box(m, p * CFrame.new(0, 2.4, 0), Vector3.new(8, 0.4, 3), Color3.fromRGB(150, 110, 70), M.WoodPlanks)
		for side = -1, 1, 2 do
			B.box(m, p * CFrame.new(0, 1.4, side * 2.6), Vector3.new(8, 0.3, 1.2), Color3.fromRGB(150, 110, 70), M.WoodPlanks)
			for x = -1, 1, 2 do
				B.box(m, p * CFrame.new(x * 3.4, 1.1, side * 1.1), Vector3.new(0.3, 2.2, 0.3), Color3.fromRGB(110, 80, 50), M.Wood)
				B.box(m, p * CFrame.new(x * 3.4, 0.625, side * 2.6), Vector3.new(0.3, 1.25, 0.3), Color3.fromRGB(110, 80, 50), M.Wood)
			end
		end
	end
	-- duck marker points on the lake for the client
	for i = 1, 6 do
		local a = i * math.pi / 3
		local duck = B.marker(m, "DuckSpot", CFrame.new(lake.x + math.cos(a) * lake.radius * 0.5, 0.2, lake.z + math.sin(a) * lake.radius * 0.5))
		duck:AddTag("DuckSpot")
	end
	-- park entrance arches
	local gate = CFrame.lookAt(Vector3.new(lake.x, PARK_Y, s.z1 - 2), Vector3.new(lake.x, PARK_Y, s.z1 + 10))
	for side = -1, 1, 2 do
		B.box(m, gate * CFrame.new(side * 7, 6, 0), Vector3.new(2, 12, 2), Color3.fromRGB(110, 80, 60), M.Brick)
	end
	local arch = B.box(m, gate * CFrame.new(0, 12.6, 0), Vector3.new(16, 2, 2), Color3.fromRGB(110, 80, 60), M.Brick)
	B.sign(arch, Enum.NormalId.Front, "GÖL PARK", { color = Color3.fromRGB(250, 230, 180), font = B.Fonts.Serif })
	return m
end

----------------------------------------------------------------------------------------------------
-- Funfair
----------------------------------------------------------------------------------------------------
local function lunapark(parent, poi, rng)
	local s = poi.site
	local m = B.model("Lunapark", parent)
	local cx, cz = (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2
	-- ferris wheel (the "Wheel" model is rotated by clients)
	local hub = CFrame.new(cx - 80, WALK_Y + 46, cz - 60)
	-- A-frame legs on both sides of the wheel plane (the axle runs along X)
	for side = -1, 1, 2 do
		for fb = -1, 1, 2 do
			B.box(m, CFrame.new(cx - 80 + side * 7, WALK_Y + 23, cz - 60 + fb * 9) * CFrame.Angles(-fb * 0.373, 0, 0), Vector3.new(2, 49.5, 2), Color3.fromRGB(240, 240, 240), M.Metal)
		end
	end
	local wheel = B.model("Wheel", m)
	local axle = B.cyl(wheel, hub, 14, 3, Color3.fromRGB(80, 80, 86), M.Metal)
	axle.Name = "Axle"
	wheel.PrimaryPart = axle
	local spokes = 16
	local R = 38
	for i = 0, spokes - 1 do
		local a = i / spokes * math.pi * 2
		local p = Vector3.new(0, math.sin(a) * R, math.cos(a) * R)
		for side = -1, 1, 2 do
			B.box(wheel, hub * CFrame.new(side * 5, 0, 0) * CFrame.Angles(-a, 0, 0) * CFrame.new(0, 0, R / 2), Vector3.new(0.5, 0.5, R), Color3.fromRGB(240, 240, 240), M.Metal, nc())
		end
		local nxt = Vector3.new(0, math.sin(a + math.pi * 2 / spokes) * R, math.cos(a + math.pi * 2 / spokes) * R)
		for side = -1, 1, 2 do
			local p0 = (hub * CFrame.new(side * 5, p.Y, p.Z)).Position
			local p1 = (hub * CFrame.new(side * 5, nxt.Y, nxt.Z)).Position
			local rim = B.box(wheel, CFrame.lookAt((p0 + p1) / 2, p1), Vector3.new(0.7, 0.7, (p1 - p0).Magnitude + 0.4), Color3.fromHSV(i / spokes, 0.6, 1), M.Neon, nc())
			rim.Name = "Rim"
		end
		-- the cabin hangs from an axle across the two rims
		B.box(wheel, hub * CFrame.new(0, p.Y, p.Z), Vector3.new(10.4, 0.4, 0.4), Color3.fromRGB(200, 200, 206), M.Metal, nc())
		B.box(wheel, hub * CFrame.new(0, p.Y - 0.6, p.Z), Vector3.new(0.3, 1.2, 0.3), Color3.fromRGB(200, 200, 206), M.Metal, nc())
		local cabin = B.box(wheel, hub * CFrame.new(0, p.Y - 3.2, p.Z), Vector3.new(6, 4, 4), Color3.fromHSV(i / spokes, 0.7, 0.9), M.SmoothPlastic, nc())
		cabin.Name = "Cabin"
	end
	wheel:AddTag("FerrisWheel")
	-- carousel (rotated by clients)
	local car = CFrame.new(cx + 40, WALK_Y, cz - 70)
	B.cylY(m, car * CFrame.new(0, 0.6, 0), 1.2, 30, Color3.fromRGB(240, 230, 210), M.Wood)
	local top = B.model("Carousel", m)
	local roof = B.cylY(top, car * CFrame.new(0, 12, 0), 2, 32, Color3.fromRGB(220, 60, 80), M.Fabric)
	top.PrimaryPart = roof
	B.spire(top, car * CFrame.new(0, 15.5, 0), 30, 5, Color3.fromRGB(250, 240, 230), M.Fabric)
	for i = 0, 7 do
		local a = i * math.pi / 4
		B.cylY(top, car * CFrame.new(math.cos(a) * 11, 6.5, math.sin(a) * 11), 11, 0.4, Color3.fromRGB(230, 190, 80), M.Metal, nc())
		local horse = B.box(top, car * CFrame.new(math.cos(a) * 11, 4.5, math.sin(a) * 11) * CFrame.Angles(0, -a, 0), Vector3.new(1.2, 2.4, 4), Color3.fromRGB(250, 250, 250), M.SmoothPlastic, nc())
		horse.Name = "Horse"
	end
	top:AddTag("Carousel")
	-- roller coaster frame (static) with a looping track along the back
	local track = Color3.fromRGB(240, 70, 50)
	local pts = {}
	for i = 0, 40 do
		local t = i / 40
		local x = s.x0 + 30 + t * (s.x1 - s.x0 - 60)
		local y = WALK_Y + 10 + math.abs(math.sin(t * math.pi * 3)) * 26
		table.insert(pts, Vector3.new(x, y, s.z1 - 40 + math.sin(t * math.pi * 2) * 14))
	end
	for i = 1, #pts - 1 do
		local a, b2 = pts[i], pts[i + 1]
		B.box(m, CFrame.lookAt((a + b2) / 2, b2), Vector3.new(4, 0.6, (b2 - a).Magnitude + 0.3), track, M.Metal, nc())
		if i % 2 == 0 then
			B.box(m, CFrame.new(a.X, (a.Y + WALK_Y) / 2, a.Z), Vector3.new(0.8, a.Y - WALK_Y, 0.8), Color3.fromRGB(240, 240, 240), M.Metal)
		end
	end
	-- food and game stalls
	for i = 0, 7 do
		local c = CFrame.lookAt(Vector3.new(s.x0 + 30 + i * 22, WALK_Y, cz + 30), Vector3.new(s.x0 + 30 + i * 22, WALK_Y, cz))
		local col = Color3.fromHSV(i / 8, 0.6, 0.95)
		B.box(m, c * CFrame.new(0, 2, 2), Vector3.new(10, 4, 6), Color3.fromRGB(250, 248, 240), M.Wood)
		B.wedge(m, c * CFrame.new(0, 7.4, 1.4), Vector3.new(11, 2, 7), col, M.Fabric)
		for x = -1, 1, 2 do
			B.box(m, c * CFrame.new(x * 5, 4, -0.8), Vector3.new(0.4, 6, 0.4), col, M.Wood)
		end
		local sign = B.box(m, c * CFrame.new(0, 9, -0.4), Vector3.new(8, 1.6, 0.3), col, M.SmoothPlastic, nc())
		B.sign(sign, Enum.NormalId.Front, ({ "PAMUK ŞEKER", "MISIR", "BALON PATLAT", "ÇİĞ KÖFTE", "KUMPİR", "HALKA AT", "DONDURMA", "LUNAPARK BİLET" })[i + 1], { color = Color3.new(1, 1, 1) })
		local bulb = B.box(m, c * CFrame.new(0, 8, -0.8), Vector3.new(9, 0.3, 0.3), Color3.fromRGB(255, 230, 160), M.Neon, nc())
		bulb.Name = "StallLights"
	end
	local gate = CFrame.lookAt(Vector3.new(cx, WALK_Y, s.z0 + 2), Vector3.new(cx, WALK_Y, s.z0 - 10))
	local arch = B.box(m, gate * CFrame.new(0, 16, 0), Vector3.new(30, 4, 2), Color3.fromRGB(240, 60, 120), M.SmoothPlastic)
	B.sign(arch, Enum.NormalId.Front, "🎡 LUNAPARK 🎡", { color = Color3.new(1, 1, 1), glow = true, brightness = 1.5 })
	for side = -1, 1, 2 do
		B.box(m, gate * CFrame.new(side * 14, 8, 0), Vector3.new(2, 16, 2), Color3.fromRGB(250, 220, 60), M.SmoothPlastic)
	end
	for _ = 1, 20 do
		Props.tree(m, CFrame.new(Rand.range(rng, s.x0 + 10, s.x1 - 10), WALK_Y, Rand.range(rng, cz - 10, cz + 10)), "palm", rng)
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Container port
----------------------------------------------------------------------------------------------------
local function harbor(parent, poi, rng)
	local s = poi.site
	local m = B.model("ContainerPort", parent)
	-- quay wall and bollards
	local quayZ = s.z1
	B.box(m, CFrame.new((s.x0 + s.x1) / 2, -4, quayZ - 1.5), Vector3.new(s.x1 - s.x0, 10, 3), Color3.fromRGB(150, 150, 150), M.Concrete)
	for x = s.x0 + 10, s.x1 - 10, 22 do
		B.cylY(m, CFrame.new(x, WALK_Y + 1, quayZ - 3), 2, 1.6, Color3.fromRGB(40, 40, 44), M.Metal)
	end
	-- container stacks
	for row = 0, 3 do
		for col = 0, 5 do
			local x = s.x0 + 40 + col * 60
			local z = s.z0 + 60 + row * 70
			if x < s.x1 - 30 and z < quayZ - 70 then
				local h = rng:NextInteger(1, 4)
				for k = 0, h - 1 do
					Props.container(m, CFrame.new(x + (k % 2) * 0.2, WALK_Y + k * 8.6, z), rng)
					Props.container(m, CFrame.new(x + 9, WALK_Y + k * 8.6, z), rng)
				end
			end
		end
	end
	-- gantry cranes on the quay
	for k = 0, 2 do
		local x = s.x0 + 70 + k * 130
		local c = CFrame.new(x, WALK_Y, quayZ - 20)
		local yellow = Color3.fromRGB(240, 180, 30)
		for sx = -1, 1, 2 do
			for sz = -1, 1, 2 do
				B.box(m, c * CFrame.new(sx * 12, 26, sz * 12), Vector3.new(2.4, 52, 2.4), yellow, M.Metal)
			end
		end
		B.box(m, c * CFrame.new(0, 53, 20), Vector3.new(4, 4, 100), yellow, M.Metal)
		B.box(m, c * CFrame.new(0, 48, 0), Vector3.new(28, 3, 28), yellow, M.Metal)
		B.box(m, c * CFrame.new(0, 56, -10), Vector3.new(10, 8, 12), Color3.fromRGB(240, 240, 240), M.Metal)
		local cab = B.box(m, c * CFrame.new(0, 49, 30), Vector3.new(6, 4, 6), Color3.fromRGB(60, 60, 64), M.Metal)
		cab.Name = "Trolley"
	end
	-- container ship moored in the basin
	local ship = CFrame.new((s.x0 + s.x1) / 2, Terrain.SEA_LEVEL, quayZ + 40)
	B.box(m, ship * CFrame.new(0, 2, 0), Vector3.new(300, 16, 46), Color3.fromRGB(30, 60, 110), M.Metal)
	B.box(m, ship * CFrame.new(0, -4.5, 0), Vector3.new(298, 3, 45), Color3.fromRGB(150, 40, 40), M.Metal)
	B.box(m, ship * CFrame.new(130, 20, 0), Vector3.new(24, 22, 40), Color3.fromRGB(240, 240, 240), M.Metal)
	B.box(m, ship * CFrame.new(130, 32, 0), Vector3.new(18, 2, 44), Color3.fromRGB(240, 240, 240), M.Metal)
	B.box(m, ship * CFrame.new(140, 36, 0), Vector3.new(6, 10, 6), Color3.fromRGB(30, 30, 30), M.Metal)
	-- containers on deck, end to end (each is 34 long)
	for k = 0, 6 do
		for j = 0, 1 do
			Props.container(m, CFrame.new(ship.X - 120 + k * 35, ship.Y + 10 + j * 8.6, ship.Z) * CFrame.Angles(0, math.pi / 2, 0), rng)
		end
	end
	local name = B.box(m, ship * CFrame.new(0, 6, 23.1), Vector3.new(60, 6, 0.2), Color3.fromRGB(30, 60, 110), M.SmoothPlastic, nc())
	B.sign(name, Enum.NormalId.Back, "MV ANADOLU", { color = Color3.new(1, 1, 1) })
	return m
end

----------------------------------------------------------------------------------------------------
-- Coast: marina docks, the pier, lighthouse, beach
----------------------------------------------------------------------------------------------------
local function marina(parent, poi, rng)
	local s = poi.site
	local m = B.model("Marina", parent)
	local cx = (s.x0 + s.x1) / 2
	local clubCf = CFrame.lookAt(Vector3.new(cx, WALK_Y, s.z1 - 6), Vector3.new(cx, WALK_Y, s.z1 + 10))
	Buildings.building(m, clubCf * CFrame.new(0, 0, 30), { w = 80, d = 40, floors = 2, floorH = 14, style = "modern", ground = "lobby", name = "YAT KULÜBÜ ⛵", rng = rng, glassColor = { 80, 140, 170 }, wallColor = { 240, 240, 240 } })
	-- boats on trailers in the yard
	for i = 0, 4 do
		Props.boat(m, CFrame.new(s.x0 + 30 + i * 40, WALK_Y + 2, s.z0 + 40) * CFrame.Angles(0, math.pi / 2, 0), nil, rng)
	end
	-- floating docks with yachts out on the sea in front of the marina block
	local seaZ = CityLayout.SEA_Z
	for k = 0, 3 do
		local x = s.x0 + 40 + k * ((s.x1 - s.x0 - 80) / 3)
		local dock = CFrame.new(x, Terrain.SEA_LEVEL + 1, seaZ + 50)
		B.box(m, dock, Vector3.new(6, 1, 110), Color3.fromRGB(170, 140, 100), M.WoodPlanks)
		for j = 0, 3 do
			for side = -1, 1, 2 do
				local y = CFrame.new(x + side * 12, Terrain.SEA_LEVEL - 0.5, seaZ + 10 + j * 26)
				local yacht = Props.boat(m, y, nil, rng)
				yacht:AddTag("Boat")
				for _, d in yacht:GetDescendants() do
					if d:IsA("BasePart") then
						d.CanCollide = false
					end
				end
			end
		end
	end
	return m
end

local function pier(parent, poi, _rng)
	local p = poi.pos
	local m = B.model("OldPier", parent)
	local wood = Color3.fromRGB(150, 116, 80)
	local start = CityLayout.BEACH_Z + 4
	local length = 150
	B.box(m, CFrame.new(p.X, WALK_Y + 0.2, start + length / 2), Vector3.new(16, 1, length), wood, M.WoodPlanks)
	for z = start, start + length, 12 do
		for side = -1, 1, 2 do
			B.cylY(m, CFrame.new(p.X + side * 7.5, -6, z), 14, 1.2, Color3.fromRGB(90, 70, 50), M.Wood)
			B.box(m, CFrame.new(p.X + side * 7.8, WALK_Y + 2.2, z), Vector3.new(0.3, 3, 0.3), wood, M.Wood)
		end
	end
	for side = -1, 1, 2 do
		B.box(m, CFrame.new(p.X + side * 7.8, WALK_Y + 3.6, start + length / 2), Vector3.new(0.3, 0.3, length), wood, M.Wood)
	end
	-- ferry terminal at the end
	local term = CFrame.lookAt(Vector3.new(p.X, WALK_Y, start + length - 6), Vector3.new(p.X, WALK_Y, start))
	B.box(m, CFrame.new(p.X, WALK_Y + 0.2, start + length + 12), Vector3.new(40, 1, 30), wood, M.WoodPlanks)
	B.box(m, term * CFrame.new(0, 7, -10), Vector3.new(26, 14, 16), Color3.fromRGB(240, 236, 226), M.Wood)
	B.box(m, term * CFrame.new(0, 14.8, -10), Vector3.new(30, 1.6, 20), Color3.fromRGB(150, 40, 40), M.ClayRoofTiles)
	local sign = B.box(m, term * CFrame.new(0, 11, -1.8), Vector3.new(16, 2, 0.3), Color3.fromRGB(20, 50, 100), M.SmoothPlastic, nc())
	B.sign(sign, Enum.NormalId.Front, "VAPUR İSKELESİ", { color = Color3.new(1, 1, 1) })
	-- anglers' buckets and lamps
	for k = 0, 5 do
		Props.streetLamp(m, CFrame.lookAt(Vector3.new(p.X + 7, WALK_Y + 0.7, start + 10 + k * 24), Vector3.new(p.X, WALK_Y + 0.7, start + 10 + k * 24)), "classic")
	end
	return m
end

local function lighthouse(parent, poi, rng)
	local p = poi.pos
	local m = B.model("Lighthouse", parent)
	-- rocky jetty
	for i = 0, 10 do
		B.ball(m, CFrame.new(p.X - 60 + i * 6, Terrain.SEA_LEVEL - 1, p.Z - 40 + i * 4), Rand.range(rng, 6, 9), Color3.fromRGB(120, 116, 110), M.Rock)
	end
	B.cylY(m, CFrame.new(p.X, Terrain.SEA_LEVEL + 1, p.Z), 6, 22, Color3.fromRGB(130, 126, 120), M.Rock)
	local base = CFrame.new(p.X, Terrain.SEA_LEVEL + 4, p.Z)
	local white, red = Color3.fromRGB(245, 245, 240), Color3.fromRGB(200, 40, 40)
	for i = 0, 7 do
		B.cylY(m, base * CFrame.new(0, 2.5 + i * 5, 0), 5, 10 - i * 0.5, if i % 2 == 0 then white else red, M.SmoothPlastic)
	end
	B.cylY(m, base * CFrame.new(0, 42.5, 0), 1, 9, Color3.fromRGB(40, 40, 44), M.Metal)
	B.cylY(m, base * CFrame.new(0, 46, 0), 6, 6, Color3.fromRGB(200, 220, 230), M.Glass, nc({ Transparency = 0.4 }))
	B.ball(m, base * CFrame.new(0, 50, 0), 6, red, M.Metal)
	local lamp = B.box(m, base * CFrame.new(0, 46, 0), Vector3.new(2, 2, 2), Color3.fromRGB(255, 250, 220), M.Neon, nc({ Name = "Lamp" }))
	local beam = B.model("Beam", m)
	local pivot = B.box(beam, base * CFrame.new(0, 46, 0), Vector3.new(1, 1, 1), Color3.new(1, 1, 1), M.SmoothPlastic, nc({ Transparency = 1, Name = "Pivot" }))
	beam.PrimaryPart = pivot
	local light = B.spotLight(pivot, Enum.NormalId.Front, 60, 25, 4, Color3.fromRGB(255, 250, 220), false)
	light.Enabled = false
	local cone = B.box(beam, base * CFrame.new(0, 46, -40), Vector3.new(3, 3, 80), Color3.fromRGB(255, 250, 220), M.Neon, nc({ Transparency = 0.85, CastShadow = false, Name = "Cone" }))
	cone:AddTag("NightOnly")
	beam:AddTag("LighthouseBeam")
	lamp:AddTag("NightLight")
	return m
end

local function beach(parent, _poi, rng)
	local m = B.model("Beach", parent)
	local z0 = CityLayout.BEACH_Z + 10
	local x0, x1 = CityLayout.COAST_X0, CityLayout.COAST_X1
	local cols = { Color3.fromRGB(230, 60, 60), Color3.fromRGB(40, 120, 200), Color3.fromRGB(250, 200, 40), Color3.fromRGB(240, 240, 236), Color3.fromRGB(40, 170, 120) }
	local x = x0 + 20
	while x < x1 - 20 do
		if math.abs(x - (-120)) > 20 then
			for row = 0, 1 do
				local p = Vector3.new(x + Rand.range(rng, -4, 4), 0.2, z0 + 12 + row * 18 + Rand.range(rng, -3, 3))
				local col = Rand.pick(rng, cols)
				B.cylY(m, CFrame.new(p) * CFrame.new(0, 4, 0), 8, 0.3, Color3.fromRGB(240, 240, 240), M.Metal, nc())
				B.spire(m, CFrame.new(p) * CFrame.new(0, 8.6, 0) * CFrame.Angles(0, rng:NextNumber() * 3, 0), 9, 1.8, col, M.Fabric, nc())
				for side = -1, 1, 2 do
					local l = CFrame.new(p) * CFrame.new(side * 3, 0.6, 2) * CFrame.Angles(0, 0, 0)
					B.box(m, l, Vector3.new(2.2, 0.3, 6), Color3.fromRGB(250, 250, 250), M.SmoothPlastic)
					B.box(m, l * CFrame.new(0, 0.9, 2.4) * CFrame.Angles(math.rad(50), 0, 0), Vector3.new(2.2, 0.3, 2.4), Color3.fromRGB(250, 250, 250), M.SmoothPlastic, nc())
					local towel = B.box(m, l * CFrame.new(0, 0.2, 0), Vector3.new(2, 0.05, 5), col:Lerp(Color3.new(1, 1, 1), 0.3), M.Fabric, nc())
					towel.Name = "Towel"
				end
			end
		end
		x += 26
	end
	-- volleyball net
	local net = CFrame.new(300, 0.2, z0 + 34)
	for side = -1, 1, 2 do
		B.cylY(m, net * CFrame.new(side * 14, 4, 0), 8, 0.4, Color3.fromRGB(240, 240, 240), M.Metal)
	end
	B.box(m, net * CFrame.new(0, 6.2, 0), Vector3.new(28, 3, 0.1), Color3.fromRGB(240, 240, 240), M.ForceField, nc({ Transparency = 0.3 }))
	-- lifeguard towers
	for _, lx in { -400, 150, 700 } do
		local t = CFrame.new(lx, 0.2, z0 + 26)
		for sx = -1, 1, 2 do
			for sz = -1, 1, 2 do
				B.box(m, t * CFrame.new(sx * 2.4, 5, sz * 2.4), Vector3.new(0.5, 10, 0.5), Color3.fromRGB(240, 240, 240), M.Wood)
			end
		end
		B.box(m, t * CFrame.new(0, 10.2, 0), Vector3.new(6, 0.4, 6), Color3.fromRGB(200, 40, 40), M.Wood)
		B.box(m, t * CFrame.new(0, 12, 2.8), Vector3.new(6, 3.4, 0.3), Color3.fromRGB(200, 40, 40), M.Wood)
		B.spire(m, t * CFrame.new(0, 15, 0), 8, 2, Color3.fromRGB(240, 240, 240), M.Fabric, nc())
		B.cylY(m, t * CFrame.new(3.3, 14.3, 0), 7.8, 0.15, Color3.fromRGB(200, 200, 206), M.Metal, nc())
		local flag = B.box(m, t * CFrame.new(3.4, 17, 0), Vector3.new(0.1, 1.6, 2.4), Color3.fromRGB(240, 200, 30), M.Fabric, nc())
		flag.Name = "SafetyFlag"
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Northern hills and the countryside
----------------------------------------------------------------------------------------------------
local function viewpoint(parent, poi, _rng)
	local p = poi.pos
	local y = ground(p.X, p.Z)
	local m = B.model("Viewpoint", parent)
	local base = CFrame.new(p.X, y + 0.4, p.Z + 20)
	B.box(m, base * CFrame.new(0, -0.2, 0), Vector3.new(50, 1, 30), Color3.fromRGB(196, 186, 170), M.Pavement)
	-- railing facing the city (south)
	for x = -24, 24, 4 do
		B.box(m, base * CFrame.new(x, 1.8, 15), Vector3.new(0.4, 3.6, 0.4), Color3.fromRGB(60, 60, 64), M.Metal)
	end
	B.box(m, base * CFrame.new(0, 3.6, 15), Vector3.new(50, 0.4, 0.4), Color3.fromRGB(60, 60, 64), M.Metal)
	for k = -1, 1, 2 do
		local tel = base * CFrame.new(k * 10, 0, 12)
		B.cylY(m, tel * CFrame.new(0, 1.8, 0), 3.6, 0.5, Color3.fromRGB(80, 80, 86), M.Metal)
		B.cyl(m, tel * CFrame.new(0, 3.8, 0.4) * CFrame.Angles(0, math.pi / 2, math.rad(-10)), 2.4, 1, Color3.fromRGB(40, 80, 140), M.Metal)
		Props.bench(m, CFrame.lookAt((base * CFrame.new(k * 18, 0, 6)).Position, (base * CFrame.new(k * 18, 0, 30)).Position))
	end
	local kiosk = CFrame.lookAt((base * CFrame.new(0, 0, -10)).Position, (base * CFrame.new(0, 0, 10)).Position)
	B.box(m, kiosk * CFrame.new(0, 4, 2), Vector3.new(12, 8, 6), Color3.fromRGB(150, 110, 70), M.WoodPlanks)
	local sign = B.box(m, kiosk * CFrame.new(0, 9, -1), Vector3.new(12, 2, 0.4), Color3.fromRGB(40, 90, 60), M.Wood)
	B.sign(sign, Enum.NormalId.Front, "SEYİR TEPESİ ÇAY BAHÇESİ", { color = Color3.fromRGB(250, 240, 200) })
	Props.flag(m, base * CFrame.new(20, 0, -10), 26)
	return m
end

local function windfarm(parent, poi, rng)
	local p = poi.pos
	local m = B.model("WindFarm", parent)
	for k = 0, 5 do
		local x = p.X - 280 + k * 110 + Rand.range(rng, -20, 20)
		local z = p.Z + Rand.range(rng, -60, 60)
		local y = ground(x, z)
		local base = CFrame.new(x, y, z)
		B.cylY(m, base * CFrame.new(0, 40, 0), 80, 4, Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
		B.box(m, base * CFrame.new(0, 81, -2), Vector3.new(5, 5, 12), Color3.fromRGB(235, 235, 235), M.SmoothPlastic)
		local rotor = B.model("Rotor", m)
		local hub = B.ball(rotor, base * CFrame.new(0, 81, -8.5), 3.4, Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
		hub.Name = "Hub"
		rotor.PrimaryPart = hub
		for b2 = 0, 2 do
			local a = b2 * math.pi * 2 / 3
			B.box(rotor, base * CFrame.new(0, 81, -8.8) * CFrame.Angles(0, 0, a) * CFrame.new(0, 17, 0), Vector3.new(2.2, 34, 0.5), Color3.fromRGB(245, 245, 245), M.SmoothPlastic, nc())
		end
		rotor:SetAttribute("Speed", Rand.range(rng, 0.5, 0.9))
		rotor:AddTag("WindTurbine")
	end
	return m
end

local function camp(parent, poi, rng)
	local p = poi.pos
	local m = B.model("Campsite", parent)
	local y = ground(p.X, p.Z)
	local fire = CFrame.new(p.X, y + 0.3, p.Z)
	for i = 0, 7 do
		local a = i * math.pi / 4
		B.ball(m, fire * CFrame.new(math.cos(a) * 2.6, 0.2, math.sin(a) * 2.6), 1.4, Color3.fromRGB(120, 116, 110), M.Rock)
	end
	for i = 0, 2 do
		B.cyl(m, fire * CFrame.new(0, 0.6, 0) * CFrame.Angles(0, i * math.pi / 3, 0), 4, 0.5, Color3.fromRGB(90, 60, 40), M.Wood, nc())
	end
	local flame = B.box(m, fire * CFrame.new(0, 1.2, 0), Vector3.new(1, 1, 1), Color3.fromRGB(255, 140, 40), M.Neon, nc({ Transparency = 1, Name = "Campfire" }))
	local f = Instance.new("Fire")
	f.Size = 5
	f.Heat = 9
	f.Parent = flame
	B.pointLight(flame, 28, 2, Color3.fromRGB(255, 150, 60), true)
	for i = 0, 3 do
		local a = i * math.pi / 2 + 0.4
		local tp = Vector3.new(p.X + math.cos(a) * 18, 0, p.Z + math.sin(a) * 18)
		local tc = CFrame.lookAt(Vector3.new(tp.X, ground(tp.X, tp.Z) + 0.2, tp.Z), Vector3.new(p.X, ground(tp.X, tp.Z) + 0.2, p.Z))
		local col = Rand.pick(rng, { Color3.fromRGB(240, 120, 30), Color3.fromRGB(40, 130, 80), Color3.fromRGB(40, 90, 170) })
		for side = -1, 1, 2 do
			B.wedge(m, tc * CFrame.new(side * 2.2, 2.4, 0) * CFrame.Angles(0, side * math.pi / 2, 0), Vector3.new(8, 4.8, 4.4), col, M.Fabric)
		end
		Props.chair(m, tc * CFrame.new(3, 0, -5), { 30, 90, 60 })
	end
	for _ = 1, 30 do
		local x, z = p.X + Rand.range(rng, -90, 90), p.Z + Rand.range(rng, -70, 70)
		if (Vector2.new(x, z) - Vector2.new(p.X, p.Z)).Magnitude > 30 then
			Props.tree(m, CFrame.new(x, ground(x, z), z), "pine", rng)
		end
	end
	return m
end

local function radioTower(parent, poi, _rng)
	local p = poi.pos
	local m = B.model("RadioTower", parent)
	local y = ground(p.X, p.Z)
	local base = CFrame.new(p.X, y, p.Z)
	local h = 120
	for i = 0, 11 do
		local w = 12 - i * 0.8
		local yy = i * h / 12
		for sx = -1, 1, 2 do
			for sz = -1, 1, 2 do
				B.box(m, base * CFrame.new(sx * w / 2, yy + h / 24, sz * w / 2), Vector3.new(0.6, h / 12 + 0.2, 0.6), if i % 2 == 0 then Color3.fromRGB(220, 40, 40) else Color3.fromRGB(240, 240, 240), M.Metal)
			end
		end
		B.box(m, base * CFrame.new(0, yy, w / 2), Vector3.new(w, 0.4, 0.4), Color3.fromRGB(240, 240, 240), M.Metal, nc())
		B.box(m, base * CFrame.new(0, yy, -w / 2), Vector3.new(w, 0.4, 0.4), Color3.fromRGB(240, 240, 240), M.Metal, nc())
		if i % 4 == 3 then
			local red = B.ball(m, base * CFrame.new(w / 2, yy + 1, w / 2), 1, Color3.fromRGB(255, 30, 30), M.Neon, nc())
			red:AddTag("Beacon")
		end
	end
	B.box(m, base * CFrame.new(0, h + 0.3, 0), Vector3.new(3.8, 0.4, 3.8), Color3.fromRGB(240, 240, 240), M.Metal)
	local top = B.ball(m, base * CFrame.new(0, h + 1.3, 0), 1.6, Color3.fromRGB(255, 30, 30), M.Neon, nc())
	top:AddTag("Beacon")
	B.box(m, base * CFrame.new(16, 4, 0), Vector3.new(12, 8, 10), Color3.fromRGB(200, 200, 196), M.Concrete)
	return m
end

-- Forest on the hills and tree belts in the countryside around the city.
local function forests(parent, rng)
	local m = B.model("Forests", parent)
	local placed = 0
	local b = CityLayout.get().bounds
	local edgeW = CityLayout.XS[1] - 40
	local edgeE = CityLayout.XS[#CityLayout.XS] + 40
	for _ = 1, 760 do
		local x = Rand.range(rng, b.minX + 30, b.maxX - 30)
		local z = Rand.range(rng, b.minZ + 10, -1120)
		local nearViewpoint = (Vector2.new(x, z) - Vector2.new(0, -1340)).Magnitude < 70
		local nearCamp = (Vector2.new(x, z) - Vector2.new(760, -1280)).Magnitude < 40
		local nearPath = false
		for _, pp in Terrain.hillPath or {} do
			if (Vector2.new(x, z) - Vector2.new(pp.X, pp.Z)).Magnitude < 22 then
				nearPath = true
			end
		end
		if not nearViewpoint and not nearCamp and not nearPath then
			Props.tree(m, CFrame.new(x, ground(x, z) - 0.3, z), Rand.pick(rng, { "pine", "pine", "pine", "oak", "birch" }), rng)
			placed += 1
		end
	end
	-- the countryside beyond the highways: olive groves in the west, vineyards in the east
	for i = 1, 180 do
		local side = if i % 2 == 0 then 1 else -1
		local x = if side > 0 then Rand.range(rng, edgeE, b.maxX - 20) else Rand.range(rng, b.minX + 20, edgeW)
		local z = Rand.range(rng, CityLayout.ZS[1] - 20, CityLayout.BEACH_Z - 30)
		Props.tree(m, CFrame.new(x, 0, z), Rand.pick(rng, if side < 0 then { "oak", "oak", "cypress", "bush" } else { "cypress", "pine", "bush" }), rng)
		placed += 1
	end
	for k = 0, 5 do
		local x0 = edgeE + 30 + (k % 2) * 140
		local z0 = -900 + math.floor(k / 2) * 520
		for r = 0, 13 do
			B.box(m, CFrame.new(x0 + 55, 1.2, z0 + r * 9), Vector3.new(110, 2.4, 2), Color3.fromRGB(70, 120, 50), M.LeafyGrass, { Name = "Vines" })
		end
	end
	m:SetAttribute("Trees", placed)
	return m
end

function Nature.build(parent: Instance, L, yieldFn: (() -> ())?)
	local rng = Random.new(1453)
	local folder = B.folder("Nature", parent)
	local builders = {
		park = park,
		lunapark = lunapark,
		harbor = harbor,
		marina = marina,
		pier = pier,
		lighthouse = lighthouse,
		beach = beach,
		viewpoint = viewpoint,
		windfarm = windfarm,
		camp = camp,
		radio_tower = radioTower,
	}
	for id, fn in builders do
		local poi = L.poiById[id]
		if poi then
			local ok, err = pcall(fn, folder, poi, rng)
			if not ok then
				warn("[World] failed to build " .. id .. ": " .. tostring(err))
				Nature.lastError = err
			end
			if yieldFn then
				yieldFn()
			end
		end
	end
	forests(folder, rng)
	return folder
end

return Nature
