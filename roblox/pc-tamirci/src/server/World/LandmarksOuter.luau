-- Outer landmarks: the big places of the outer belt. West of the old town: the airport (runway,
-- taxiway, apron with jets at the gates, terminal with the IT office's counter, control tower,
-- hangars), the shipyard (slipways with hulls, a gantry crane, quay cranes, a ship fitting out),
-- the fishing village's square and jetty and the industrial zone's office and truck park. East of
-- it: the technopark (glass towers round a plaza with a giant chip, the R&D centre's counter), the
-- farmland (farmyard, greenhouses, fields, orchard), the golf club, the caravan park, the villa
-- hill club (tennis, pool, counter) and the holiday village by the beach.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Props = require(Shared.Models.Props)
local Buildings = require(Shared.Models.Buildings)
local CityLayout = require(Shared.World.CityLayout)

local Terrain = require(script.Parent.TerrainBuilder)
local Commerce = require(script.Parent.LandmarksCommerce)
local Blocks = require(script.Parent.Blocks)
local OuterProps = require(script.Parent.OuterProps)

local Outer = {}
local M = Enum.Material
local WALK_Y = CityLayout.WALK_Y
local nc = OuterProps.nc
local slab = OuterProps.slab
local paint = OuterProps.paint

local ASPHALT = Color3.fromRGB(58, 60, 64)
local YELLOW = Color3.fromRGB(240, 200, 40)
local WHITE = Color3.fromRGB(240, 240, 236)
local HEDGE = Color3.fromRGB(70, 116, 58)

-- A frame standing at (x, z) on the pavement, facing (dx, dz).
local function facing(x: number, z: number, dx: number, dz: number, y: number?): CFrame
	local p = Vector3.new(x, y or WALK_Y, z)
	return CFrame.lookAt(p, p + Vector3.new(dx, 0, dz))
end

local function hedge(parent: Instance, a: Vector3, b: Vector3, h: number?)
	local mid = (a + b) / 2
	local len = (b - a).Magnitude
	local height = h or 3.4
	return B.box(parent, CFrame.lookAt(mid, b) * CFrame.new(0, height / 2, 0), Vector3.new(2, height, len), HEDGE, M.LeafyGrass)
end

-- A sign on two posts (cf on the ground, facing the reader).
local function postSign(parent: Instance, cf: CFrame, text: string, w: number, color: any, h: number?)
	local height = h or 6
	local board = B.box(parent, cf * CFrame.new(0, height, 0), Vector3.new(w, 3.4, 0.5), B.color(color), M.SmoothPlastic)
	B.sign(board, Enum.NormalId.Front, text, { color = Color3.new(1, 1, 1), font = B.Fonts.Heavy })
	for _, sx in { -1, 1 } do
		B.box(parent, cf * CFrame.new(sx * (w / 2 - 1), (height - 1.7) / 2, 0), Vector3.new(0.5, height - 1.7, 0.5), Color3.fromRGB(70, 70, 76), M.Metal)
	end
	return board
end

-- A row of parked cars along x0..x1 (cars face `dir`), some bays left empty.
local function parkingRow(parent: Instance, x0: number, x1: number, z: number, dir: number, rng: Random, fill: number?)
	local x = x0 + 3.5
	while x < x1 - 3.5 do
		paint(parent, CFrame.new(x - 3.5, WALK_Y, z), 0.3, 11)
		if rng:NextNumber() < (fill or 0.65) then
			OuterProps.car(parent, facing(x, z, 0, dir), rng)
		end
		x += 7
	end
end

----------------------------------------------------------------------------------------------------
-- Airport
----------------------------------------------------------------------------------------------------
local function hangar(parent: Instance, cf: CFrame, w: number, d: number, h: number, name: string, color: any)
	local m = B.model("Hangar", parent)
	local col = B.color(color)
	B.box(m, cf * CFrame.new(0, 0.1, d / 2), Vector3.new(w, 0.2, d), Color3.fromRGB(190, 190, 186), M.Concrete)
	B.box(m, cf * CFrame.new(0, h / 2, d - 0.5), Vector3.new(w, h, 1), col, M.Metal)
	for _, sx in { -1, 1 } do
		B.box(m, cf * CFrame.new(sx * (w / 2 - 0.5), h / 2, d / 2), Vector3.new(1, h, d), col, M.Metal)
	end
	B.box(m, cf * CFrame.new(0, h - 2.5, 0.5), Vector3.new(w, 5, 1), col, M.Metal)
	B.ellipsoid(m, cf * CFrame.new(0, h, d / 2), Vector3.new(w + 1, 14, d + 1), col:Lerp(Color3.new(1, 1, 1), 0.15), M.Metal)
	local band = B.box(m, cf * CFrame.new(0, h - 2.5, -0.1), Vector3.new(math.min(w - 10, 40), 3.6, 0.2), Color3.fromRGB(30, 50, 100), M.SmoothPlastic, nc())
	B.sign(band, Enum.NormalId.Front, name, { color = Color3.new(1, 1, 1) })
	return m
end

local function controlTower(parent: Instance, cf: CFrame)
	local m = B.model("ControlTower", parent)
	local concrete = Color3.fromRGB(226, 226, 222)
	B.box(m, cf * CFrame.new(0, 5, 0), Vector3.new(18, 10, 18), concrete, M.Concrete)
	B.cylY(m, cf * CFrame.new(0, 32, 0), 44, 9, concrete, M.Concrete)
	B.cylY(m, cf * CFrame.new(0, 54.5, 0), 1, 20, Color3.fromRGB(80, 84, 90), M.Metal)
	B.cylY(m, cf * CFrame.new(0, 59, 0), 8, 18, Color3.fromRGB(60, 110, 130), M.Glass, { Transparency = 0.3 })
	B.cylY(m, cf * CFrame.new(0, 63.6, 0), 1.2, 21, Color3.fromRGB(80, 84, 90), M.Metal)
	B.cylY(m, cf * CFrame.new(0, 69, 0), 10, 0.5, Color3.fromRGB(200, 200, 204), M.Metal, nc())
	local beacon = B.ball(m, cf * CFrame.new(0, 74.4, 0), 1.2, Color3.fromRGB(255, 40, 40), M.Neon, nc())
	beacon:AddTag("Beacon")
	local label = B.box(m, cf * CFrame.new(0, 8, -9.1), Vector3.new(12, 3, 0.2), Color3.fromRGB(20, 70, 140), M.SmoothPlastic, nc())
	B.sign(label, Enum.NormalId.Front, "KULE • TOWER", { color = Color3.new(1, 1, 1) })
	return m
end

local function airport(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("Airport", parent)
	local x0, x1, z0, z1 = s.x0, s.x1, s.z0, s.z1
	local cx = (x0 + x1) / 2
	local Y = WALK_Y
	-- the runway along the northern edge: markings, threshold stripes, numbers, edge lights
	local rz = z0 + 100
	local rx0, rx1 = x0 + 40, x1 - 40
	local rcx, rl = (rx0 + rx1) / 2, rx1 - rx0
	local top = Y + 0.15
	slab(m, rx0, rz - 25, rx1, rz + 25, top, ASPHALT, M.Asphalt).Name = "Runway"
	for x = rx0 + 70, rx1 - 70, 36 do
		paint(m, CFrame.new(x, top, rz), 18, 1)
	end
	for _, side in { -1, 1 } do
		paint(m, CFrame.new(rcx, top, rz + side * 23), rl - 8, 0.8)
	end
	for _, ex in { rx0 + 14, rx1 - 14 } do
		for k = -3, 3 do
			paint(m, CFrame.new(ex, top, rz + k * 5.8), 18, 2.8)
		end
	end
	for i, ex in { rx0 + 42, rx1 - 42 } do
		local num = B.box(m, CFrame.new(ex, top + 0.03, rz) * CFrame.Angles(0, if i == 1 then math.pi / 2 else -math.pi / 2, 0), Vector3.new(14, 0.04, 12), ASPHALT, M.SmoothPlastic, nc({ Transparency = 1 }))
		B.sign(num, Enum.NormalId.Top, if i == 1 then "09" else "27", { color = WHITE, pixelsPerStud = 10 })
	end
	for x = rx0 + 10, rx1 - 10, 40 do
		for _, side in { -1, 1 } do
			B.cylY(m, CFrame.new(x, Y + 0.35, rz + side * 27), 0.7, 0.9, Color3.fromRGB(255, 250, 220), M.Neon, nc())
		end
	end
	for k = -2, 2 do
		B.cylY(m, CFrame.new(rx0 - 5, Y + 0.35, rz + k * 9), 0.7, 1, Color3.fromRGB(60, 255, 120), M.Neon, nc())
		B.cylY(m, CFrame.new(rx1 + 5, Y + 0.35, rz + k * 9), 0.7, 1, Color3.fromRGB(255, 60, 50), M.Neon, nc())
	end
	-- the taxiway and its links to the runway
	local tz = rz + 70
	slab(m, rx0 + 40, tz - 10, rx1 - 40, tz + 10, Y + 0.12, ASPHALT, M.Asphalt)
	paint(m, CFrame.new(rcx, Y + 0.12, tz), rl - 80, 0.5, YELLOW)
	for _, x in { rx0 + 50, rx1 - 50 } do
		slab(m, x - 10, rz + 24, x + 10, tz - 9, Y + 0.12, ASPHALT, M.Asphalt)
	end
	-- the terminal (facing the road in the south) and the apron behind it
	local front, td, tw = z1 - 60, 78, 220
	slab(m, x0 + 60, tz + 8, x1 - 60, front - td, Y + 0.1, Color3.fromRGB(178, 178, 174), M.Concrete).Name = "Apron"
	local tcf = facing(cx, front, 0, 1)
	local hall = Buildings.hall(m, tcf, tw, td, 22, {
		name = "ŞEHİR HAVALİMANI  ✈  CITY AIRPORT", accent = { 20, 70, 140 }, wall = { 226, 230, 236 }, wallMat = M.Metal,
		floor = { 222, 222, 226 }, floorMat = M.Marble, modelName = "Terminal", lightStep = 30, door = 14,
	})
	for i = -2, 2 do
		local c = tcf * CFrame.new(i * 30, 0.2, 34)
		Props.counter(hall, c, 12, { 40, 60, 100 }, { 230, 230, 234 })
		Props.monitor(hall, c * CFrame.new(-3.5, 4, 0.2), "CHECK-IN " .. (i + 3), Color3.fromRGB(20, 50, 110))
		B.box(hall, c * CFrame.new(0, 1.1, 4), Vector3.new(10, 2.2, 3), Color3.fromRGB(60, 62, 68), M.Metal)
	end
	local board = B.box(hall, tcf * CFrame.new(0, 12, td - 1.5), Vector3.new(36, 9, 1), Color3.fromRGB(14, 16, 22), M.SmoothPlastic)
	B.sign(board, Enum.NormalId.Front, "KALKIŞ • DEPARTURES\nAA 2024  ANKARA  14:30\nMJ 0711  İZMİR  15:05\nEH 0346  ANTALYA  15:40\nKA 1923  KAYSERİ  16:15", { color = Color3.fromRGB(255, 210, 80), background = Color3.fromRGB(14, 16, 22), glow = true, font = B.Fonts.Mono })
	for row = 0, 2 do
		for _, sx in { -1, 1 } do
			local c = tcf * CFrame.new(sx * 70, 0.2, 52 + row * 7)
			B.box(hall, c * CFrame.new(0, 1.2, 0), Vector3.new(30, 0.4, 2.6), Color3.fromRGB(40, 90, 160), M.SmoothPlastic)
			B.box(hall, c * CFrame.new(0, 2.6, 1.2), Vector3.new(30, 2.4, 0.3), Color3.fromRGB(40, 90, 160), M.SmoothPlastic)
			B.box(hall, c * CFrame.new(0, 0.5, 0), Vector3.new(28, 1, 1), Color3.fromRGB(70, 70, 76), M.Metal)
		end
	end
	Commerce.servicePoint(hall, tcf * CFrame.new(-82, 0.2, 18), "contracts", poi.id, "BT Sözleşmesi Al", "Havalimanı Bilgi İşlem", 10)
	-- the drop-off canopy, the car park and a taxi rank in front
	B.box(m, tcf * CFrame.new(0, 13, -8), Vector3.new(120, 1, 16), Color3.fromRGB(200, 204, 210), M.Metal)
	for _, sx in { -55, -18, 18, 55 } do
		B.cylY(m, tcf * CFrame.new(sx, 6.25, -14), 12.5, 1.2, Color3.fromRGB(150, 154, 160), M.Metal)
	end
	slab(m, cx - 110, front + 16, cx + 110, front + 28, Y + 0.12, ASPHALT, M.Asphalt)
	parkingRow(m, cx - 110, cx - 20, z1 - 14, -1, rng)
	parkingRow(m, cx + 20, cx + 110, z1 - 14, -1, rng)
	for i = 0, 2 do
		OuterProps.car(m, facing(cx - 40 + i * 13, front + 22, 1, 0, Y + 0.12), rng, { 250, 205, 40 })
	end
	-- jets at the gates with their boarding bridges
	for k = -1, 1 do
		local px = cx + k * 100
		local nose = front - td - 30
		OuterProps.airliner(m, facing(px, nose - 1.3 * 42, 0, 1, Y + 0.1), 1.3, k + 2)
		local bx = px + 9
		B.box(m, CFrame.new(bx, Y + 10, front - td - 13), Vector3.new(5, 5, 26), Color3.fromRGB(200, 200, 206), M.Metal)
		B.cylY(m, CFrame.new(bx, Y + 3.75, front - td - 22), 7.5, 1.4, Color3.fromRGB(110, 110, 116), M.Metal)
		paint(m, CFrame.new(px, Y + 0.1, (tz + 10 + nose) / 2), 0.6, nose - tz - 10, YELLOW)
	end
	-- the terminal's roof: a wide overhanging canopy with a skylight down the middle
	B.box(m, tcf * CFrame.new(0, 23.6, td / 2), Vector3.new(tw + 16, 1.2, td + 14), Color3.fromRGB(236, 238, 242), M.Metal)
	B.box(m, tcf * CFrame.new(0, 24.3, td / 2), Vector3.new(tw - 30, 0.4, 12), Color3.fromRGB(120, 170, 200), M.Glass, nc({ Transparency = 0.2 }))
	-- baggage trains beside the jets
	for k = -1, 1 do
		local bx = cx + k * 100 - 30
		for j = 0, 3 do
			local c = CFrame.new(bx, Y + 0.1, front - td - 60 - j * 7)
			B.box(m, c * CFrame.new(0, 1.6, 0), Vector3.new(4, 2.6, 5), if j == 0 then Color3.fromRGB(240, 180, 30) else Color3.fromRGB(160, 164, 170), M.Metal)
			B.box(m, c * CFrame.new(0, 0.15, 0), Vector3.new(3.6, 0.3, 4.6), Color3.fromRGB(30, 30, 32), M.Rubber)
		end
	end
	-- the cargo apron in the east: a freighter and rows of air-freight containers
	OuterProps.airliner(m, facing(cx + 230, front - td - 120, 0, 1, Y + 0.1), 1.3, 4)
	for i = 0, 5 do
		for j = 0, 1 do
			local c = CFrame.new(cx + 175 + i * 9, Y + 0.1, front - td - 40 - j * 10)
			B.wedge(m, c * CFrame.new(0, 2.6, 0) * CFrame.Angles(0, math.pi / 2, 0), Vector3.new(7, 5.2, 7), Color3.fromRGB(200, 204, 210), M.Metal)
		end
	end
	-- the fuel farm and a long-stay car park beside the terminal
	for k = 0, 2 do
		local c = CFrame.new(x1 - 40, Y, z1 - 120 + k * 32)
		B.cylY(m, c * CFrame.new(0, 7, 0), 14, 24, Color3.fromRGB(236, 236, 232), M.Metal)
		B.cylY(m, c * CFrame.new(0, 14.2, 0), 0.4, 22, Color3.fromRGB(200, 200, 204), M.Metal)
	end
	slab(m, cx + 130, z1 - 52, x1 - 70, z1 - 4, Y + 0.12, ASPHALT, M.Asphalt)
	parkingRow(m, cx + 132, x1 - 72, z1 - 40, 1, rng, 0.55)
	parkingRow(m, cx + 132, x1 - 72, z1 - 16, -1, rng, 0.55)
	-- one lined up for take-off
	OuterProps.airliner(m, facing(rx0 + 80, rz, 1, 0, top), 1.3, 4)
	-- control tower, hangars with small planes, windsock, a catering truck
	controlTower(m, facing(x0 + 30, (tz + front - td) / 2, 1, 0))
	local hg = facing(x1 - 115, tz + 30, 0, -1)
	hangar(m, hg, 90, 70, 26, "BAKIM HANGARI", { 210, 214, 220 })
	OuterProps.propPlane(m, hg * CFrame.new(0, 0.2, 30) * CFrame.Angles(0, math.pi, 0))
	local hg2 = facing(x0 + 130, tz + 30, 0, -1)
	hangar(m, hg2, 80, 60, 24, "KARGO • CARGO", { 190, 200, 214 })
	OuterProps.propPlane(m, hg2 * CFrame.new(0, 0.2, 28) * CFrame.Angles(0, math.pi, 0), { 240, 200, 40 })
	OuterProps.truck(m, facing(cx + 30, front - td - 30, 0, 1, Y + 0.1), rng)
	local sock = CFrame.new(rx1 - 20, Y, rz + 50)
	B.cylY(m, sock * CFrame.new(0, 6, 0), 12, 0.4, Color3.fromRGB(220, 220, 224), M.Metal)
	B.cyl(m, sock * CFrame.new(3, 11.4, 0), 6, 1.6, Color3.fromRGB(250, 120, 30), M.Fabric, nc())
	-- hedges along the highway and the ring road
	hedge(m, Vector3.new(x0 + 2, Y, z0 + 2), Vector3.new(x1 - 2, Y, z0 + 2))
	hedge(m, Vector3.new(x0 + 2, Y, z0 + 4), Vector3.new(x0 + 2, Y, z1 - 4))
	postSign(m, facing(cx - 140, z1 - 3, 0, 1), "✈ HAVALİMANI • AIRPORT", 30, { 20, 70, 140 }, 8)
	return m
end

----------------------------------------------------------------------------------------------------
-- Shipyard
----------------------------------------------------------------------------------------------------
-- A hull on keel blocks (cf on the ground, bow towards -Z). finished = superstructure and funnel.
local function hull(parent: Instance, cf: CFrame, L: number, W: number, H: number, color: any, finished: boolean)
	local m = B.model("Hull", parent)
	local col = B.color(color)
	local body = L - 24
	for k = 0, 4 do
		B.box(m, cf * CFrame.new(0, 1.5, -body / 2 + 6 + k * (body - 12) / 4), Vector3.new(W * 0.5, 3, 3), Color3.fromRGB(110, 90, 70), M.Wood)
	end
	B.box(m, cf * CFrame.new(0, 3 + H / 2, 0), Vector3.new(W, H, body), col, M.Metal)
	B.box(m, cf * CFrame.new(0, 3 + H * 0.2, 0), Vector3.new(W + 0.1, H * 0.4, body + 0.1), Color3.fromRGB(150, 40, 40), M.Metal, nc())
	B.wedge(m, cf * CFrame.new(0, 3 + H / 2, -body / 2 - 12) * CFrame.Angles(0, 0, math.pi), Vector3.new(W, H, 24), col, M.Metal)
	if finished then
		local white = Color3.fromRGB(240, 240, 240)
		B.box(m, cf * CFrame.new(0, 3 + H + 9, body / 2 - 14), Vector3.new(W - 4, 18, 22), white, M.Metal)
		B.box(m, cf * CFrame.new(0, 3 + H + 15, body / 2 - 25.1), Vector3.new(W - 6, 3, 0.2), Color3.fromRGB(40, 60, 80), M.Glass, nc())
		B.box(m, cf * CFrame.new(0, 3 + H + 22, body / 2 - 8), Vector3.new(6, 8, 6), Color3.fromRGB(200, 60, 40), M.Metal)
	else
		-- scaffolding along both sides
		for _, sx in { -1, 1 } do
			for k = 0, 3 do
				B.cylY(m, cf * CFrame.new(sx * (W / 2 + 3), (3 + H) / 2, -body / 2 + 10 + k * (body - 20) / 3), 3 + H, 0.5, Color3.fromRGB(200, 170, 60), M.Metal)
			end
			for lvl = 1, 2 do
				B.box(m, cf * CFrame.new(sx * (W / 2 + 2.6), lvl * (3 + H) / 3, 0), Vector3.new(2.4, 0.3, body - 16), Color3.fromRGB(170, 130, 80), M.WoodPlanks)
			end
		end
	end
	return m
end

local function shipyard(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("Shipyard", parent)
	local x0, x1, z0, z1 = s.x0, s.x1, s.z0, s.z1
	local cx = (x0 + x1) / 2
	local Y = WALK_Y
	-- the quay wall and its bollards
	B.box(m, CFrame.new(cx, -4, z1 - 1.5), Vector3.new(x1 - x0, 10, 3), Color3.fromRGB(150, 150, 150), M.Concrete)
	for x = x0 + 12, x1 - 12, 32 do
		B.cylY(m, CFrame.new(x, Y + 1, z1 - 4), 2, 1.6, Color3.fromRGB(40, 40, 44), M.Metal)
	end
	-- two slipways running down to the water, a hull on each
	for i, sx in { x0 + 100, x0 + 220 } do
		slab(m, sx - 26, z1 - 300, sx + 26, z1 - 2, Y + 0.1, Color3.fromRGB(120, 118, 114), M.Concrete)
		for _, rx in { -10, 10 } do
			B.box(m, CFrame.new(sx + rx, Y + 0.3, z1 - 151), Vector3.new(1, 0.4, 296), Color3.fromRGB(70, 70, 74), M.Metal)
		end
		hull(m, facing(sx, z1 - 150, 0, 1, Y + 0.1), 220, 30, 22, if i == 1 then { 40, 70, 120 } else { 60, 100, 70 }, i == 2)
	end
	-- the gantry crane straddling both slipways
	local red, cream = Color3.fromRGB(200, 40, 40), Color3.fromRGB(240, 236, 226)
	local gz = z1 - 170
	for _, lx in { x0 + 46, x0 + 274 } do
		B.box(m, CFrame.new(lx, Y + 41, gz), Vector3.new(6, 82, 12), red, M.Metal)
		B.box(m, CFrame.new(lx, Y + 1.5, gz), Vector3.new(10, 3, 30), Color3.fromRGB(60, 60, 64), M.Metal)
	end
	local girder = B.box(m, CFrame.new(x0 + 160, Y + 86, gz), Vector3.new(240, 10, 14), cream, M.Metal)
	B.sign(girder, Enum.NormalId.Back, "ANADOLU TERSANESİ", { color = red })
	B.sign(girder, Enum.NormalId.Front, "ANADOLU TERSANESİ", { color = red, name = "SignFront" })
	B.box(m, CFrame.new(x0 + 140, Y + 79, gz), Vector3.new(16, 4, 16), Color3.fromRGB(240, 200, 40), M.Metal)
	-- quay cranes and a ship fitting out at the quay
	for k = 0, 1 do
		local c = CFrame.new(x0 + 320 + k * 70, Y, z1 - 16)
		local yellow = Color3.fromRGB(240, 180, 30)
		B.box(m, c * CFrame.new(0, 3, 0), Vector3.new(10, 6, 10), yellow, M.Metal)
		B.box(m, c * CFrame.new(0, 26, 0), Vector3.new(4, 40, 4), yellow, M.Metal)
		B.box(m, c * CFrame.new(0, 48, 0), Vector3.new(8, 6, 8), Color3.fromRGB(240, 240, 240), M.Metal)
		B.box(m, c * CFrame.new(0, 60, 22) * CFrame.Angles(math.rad(-30), 0, 0), Vector3.new(2.4, 2.4, 52), yellow, M.Metal)
	end
	local ship = CFrame.new(x0 + 350, Terrain.SEA_LEVEL, z1 + 30)
	B.box(m, ship * CFrame.new(0, 2, 0), Vector3.new(170, 14, 32), Color3.fromRGB(30, 90, 70), M.Metal)
	B.box(m, ship * CFrame.new(0, -3.8, 0), Vector3.new(169, 2.4, 31), Color3.fromRGB(150, 40, 40), M.Metal)
	B.box(m, ship * CFrame.new(60, 16, 0), Vector3.new(26, 14, 26), Color3.fromRGB(240, 240, 240), M.Metal)
	B.box(m, ship * CFrame.new(64, 26, 0), Vector3.new(6, 6, 6), Color3.fromRGB(200, 60, 40), M.Metal)
	-- fabrication halls along the northern road and stock in the yard
	Buildings.warehouse(m, facing(x0 + 90, z0 + 8, 0, -1), 150, 70, rng, { sign = "BLOK İMALAT", color = { 120, 140, 160 }, height = 24 })
	Buildings.warehouse(m, facing(x0 + 290, z0 + 8, 0, -1), 130, 70, rng, { sign = "BORU ATÖLYESİ", color = { 200, 200, 196 }, height = 20 })
	for k = 0, 3 do
		local c = CFrame.new(x0 + 40 + k * 26, Y, z0 + 110)
		for lv = 0, 2 do
			B.box(m, c * CFrame.new(0, 0.6 + lv * 1.2, 0), Vector3.new(16, 1.2, 10), Color3.fromRGB(110, 100, 94), M.CorrodedMetal)
		end
	end
	for k = 0, 2 do
		local c = CFrame.new(x0 + 160 + k * 20, Y, z0 + 110)
		for lv = 0, 1 do
			for j = 0, 2 - lv do
				B.cylZ(m, c * CFrame.new((j - (2 - lv) / 2) * 3.2, 1.6 + lv * 2.8, 0), 18, 3.2, Color3.fromRGB(150, 150, 156), M.Metal)
			end
		end
	end
	-- prefabricated hull sections waiting for the slipways, and a crawler crane
	for k = 0, 5 do
		local c = CFrame.new(x0 + 300 + (k % 3) * 34, Y, z0 + 260 + math.floor(k / 3) * 40)
		local col = Rand.pick(rng, { Color3.fromRGB(150, 60, 50), Color3.fromRGB(120, 124, 130), Color3.fromRGB(60, 90, 120) })
		B.box(m, c * CFrame.new(0, 7, 0), Vector3.new(24, 14, 22), col, M.Metal)
		B.box(m, c * CFrame.new(0, 14.4, 0), Vector3.new(20, 0.8, 18), col:Lerp(Color3.new(0, 0, 0), 0.2), M.DiamondPlate)
	end
	local crane = CFrame.new(x0 + 280, Y, z0 + 360)
	B.box(m, crane * CFrame.new(0, 2, 0), Vector3.new(14, 4, 18), Color3.fromRGB(40, 40, 44), M.Metal)
	B.box(m, crane * CFrame.new(0, 7, 2), Vector3.new(10, 6, 10), Color3.fromRGB(240, 180, 30), M.Metal)
	B.box(m, crane * CFrame.new(0, 34, -18) * CFrame.Angles(math.rad(50), 0, 0), Vector3.new(2.4, 2.4, 70), Color3.fromRGB(240, 180, 30), M.Metal)
	-- the office by the gate on the eastern street, the gate arch
	Buildings.building(m, facing(x1 - 6, z0 + 160, 1, 0), { w = 46, d = 24, floors = 3, floorH = 13, style = "office", rng = rng, ground = "lobby", name = "ANADOLU TERSANESİ A.Ş." })
	local gate = facing(x1 - 4, z0 + 210, 1, 0)
	for _, sx in { -14, 14 } do
		B.box(m, gate * CFrame.new(sx, 6, 0), Vector3.new(1.6, 12, 1.6), red, M.Metal)
	end
	local arch = B.box(m, gate * CFrame.new(0, 12.6, 0), Vector3.new(30, 2.6, 1), red, M.Metal)
	B.sign(arch, Enum.NormalId.Front, "TERSANE • SHIPYARD", { color = Color3.new(1, 1, 1) })
	return m
end

----------------------------------------------------------------------------------------------------
-- Fishing village: the square, the fish stalls, the tea garden and the jetty on the beach
----------------------------------------------------------------------------------------------------
local function fishingVillage(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("FishingVillage", parent)
	local cx, cz = (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2
	local Y = WALK_Y
	-- cottages on both streets, the square in the middle
	for _, face in { -1, 1 } do
		local zf = if face < 0 then s.z0 else s.z1
		for x = s.x0 + 12, s.x1 - 12, 20 do
			if math.abs(x - cx) > 34 then
				OuterProps.cottage(m, facing(x, zf, 0, face), 19, rng)
			end
		end
	end
	slab(m, cx - 60, cz - 40, cx + 60, cz + 40, Y + 0.12, Color3.fromRGB(214, 206, 188), M.Cobblestone)
	Props.tree(m, CFrame.new(cx, Y + 0.12, cz), "forest", rng)
	B.cylY(m, CFrame.new(cx, Y + 0.6, cz), 1, 12, Color3.fromRGB(200, 196, 186), M.Cobblestone)
	-- the fountain (çeşme) on the north side of the square
	local f = facing(cx, cz - 34, 0, 1, Y + 0.12)
	B.box(m, f * CFrame.new(0, 4, 0), Vector3.new(8, 8, 2), Color3.fromRGB(236, 232, 222), M.Marble)
	B.box(m, f * CFrame.new(0, 0.8, -2), Vector3.new(8, 1.6, 2.4), Color3.fromRGB(220, 216, 206), M.Marble)
	B.cyl(m, f * CFrame.new(0, 4, -1.4) * CFrame.Angles(0, math.pi / 2, 0), 1.2, 0.4, Color3.fromRGB(196, 150, 70), M.Metal, nc())
	-- the tea garden
	for i = 0, 5 do
		Props.parasolTable(m, CFrame.new(cx - 45 + (i % 3) * 14, Y + 0.12, cz - 18 + math.floor(i / 3) * 14), { 200, 40, 40 }, rng)
	end
	-- fish stalls on the south side of the square
	for i = 0, 3 do
		local c = facing(cx + 14 + i * 12, cz + 22, 0, -1, Y + 0.12)
		B.box(m, c * CFrame.new(0, 1.6, 0), Vector3.new(9, 3.2, 3.6), Color3.fromRGB(70, 110, 160), M.Wood)
		B.box(m, c * CFrame.new(0, 3.35, 0), Vector3.new(8.6, 0.3, 3.2), Color3.fromRGB(240, 246, 250), M.Ice)
		for k = 0, 2 do
			B.ellipsoid(m, c * CFrame.new(-2.6 + k * 2.6, 3.7, 0) * CFrame.Angles(0, 0.3 * k, 0), Vector3.new(0.8, 0.5, 2.2), Color3.fromRGB(150, 170, 180), M.SmoothPlastic, nc())
		end
		for _, sx in { -4.2, 4.2 } do
			B.box(m, c * CFrame.new(sx, 4.5, 1.6), Vector3.new(0.3, 9, 0.3), Color3.fromRGB(120, 90, 60), M.Wood)
		end
		B.box(m, c * CFrame.new(0, 9.1, 0.4) * CFrame.Angles(math.rad(-12), 0, 0), Vector3.new(9.4, 0.2, 5), if i % 2 == 0 then Color3.fromRGB(230, 230, 226) else Color3.fromRGB(40, 110, 170), M.Fabric)
	end
	-- the harbour café facing the square
	local tc = facing(cx - 50, cz + 41, 0, -1)
	local blue = Color3.fromRGB(30, 90, 170)
	B.box(m, tc * CFrame.new(0, 5, 8), Vector3.new(18, 10, 16), Color3.fromRGB(246, 246, 242), M.Plaster)
	B.box(m, tc * CFrame.new(0, 10.4, 8), Vector3.new(18.6, 0.8, 16.6), Color3.fromRGB(246, 246, 242), M.Plaster)
	B.box(m, tc * CFrame.new(-4, 3.6, -0.15), Vector3.new(3.4, 7.2, 0.3), blue, M.Wood)
	B.box(m, tc * CFrame.new(4, 4.4, -0.1), Vector3.new(5, 3.4, 0.2), Color3.fromRGB(40, 56, 70), M.Glass, nc())
	local label = B.box(m, tc * CFrame.new(0, 8.4, -0.2), Vector3.new(14, 2, 0.4), blue, M.SmoothPlastic)
	B.sign(label, Enum.NormalId.Front, "LİMAN KAHVESİ", { color = Color3.new(1, 1, 1) })
	-- the jetty on the beach south of the village, with fishing boats moored along it
	local jx = cx
	local zj0, zj1 = CityLayout.BEACH_Z + 8, CityLayout.SEA_Z + 80
	local deckY = Terrain.SEA_LEVEL + 2
	B.box(m, CFrame.new(jx, deckY, (zj0 + zj1) / 2), Vector3.new(7, 0.6, zj1 - zj0), Color3.fromRGB(150, 116, 80), M.WoodPlanks)
	for z = zj0 + 4, zj1 - 2, 14 do
		for _, sx in { -3.2, 3.2 } do
			B.cylY(m, CFrame.new(jx + sx, deckY - 5, z), 10, 0.8, Color3.fromRGB(110, 84, 60), M.Wood)
		end
	end
	for k = 0, 3 do
		for _, side in { -1, 1 } do
			local b = Props.boat(m, CFrame.new(jx + side * 9, Terrain.SEA_LEVEL - 0.6, CityLayout.SEA_Z + 10 + k * 18), Rand.pick(rng, { { 240, 240, 236 }, { 40, 90, 150 }, { 200, 60, 50 } }), rng)
			b:AddTag("Boat")
			for _, d in b:GetDescendants() do
				if d:IsA("BasePart") then
					d.CanCollide = false
				end
			end
		end
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Organised industrial zone: the office and the truck park
----------------------------------------------------------------------------------------------------
local function osb(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("OSB", parent)
	local cx = (s.x0 + s.x1) / 2
	local Y = WALK_Y
	local hcf = facing(cx - 30, s.z0 + 10, 0, -1)
	local hall = Buildings.hall(m, hcf, 64, 34, 14, { name = "OSB MÜDÜRLÜĞÜ", accent = { 30, 60, 110 }, wall = { 210, 214, 220 }, floor = { 200, 204, 210 }, floorMat = M.CeramicTiles, modelName = "OSBOffice", lightStep = 20 })
	Commerce.servicePoint(hall, hcf * CFrame.new(0, 0.2, 12), "contracts", poi.id, "Toplu Bakım İşi Al", "OSB Fabrika Ofisleri", 10)
	for k = 0, 2 do
		Props.flag(m, hcf * CFrame.new(40 + k * 7, 0, 4), 20)
	end
	-- the truck park in the southern half
	local zt0 = (s.z0 + s.z1) / 2 + 4
	slab(m, s.x0 + 6, zt0, s.x1 - 6, s.z1 - 4, Y + 0.12, ASPHALT, M.Asphalt)
	for i = 0, 6 do
		local x = s.x0 + 22 + i * 24
		paint(m, CFrame.new(x - 12, Y + 0.12, (zt0 + s.z1 - 4) / 2), 0.4, s.z1 - 4 - zt0 - 4)
		if x < s.x1 - 14 and rng:NextNumber() < 0.75 then
			OuterProps.truck(m, facing(x, (zt0 + s.z1) / 2 - 2, 0, -1, Y + 0.12), rng)
		end
	end
	-- the weighbridge and its booth, the big sign at the corner
	slab(m, s.x1 - 46, s.z0 + 60, s.x1 - 16, s.z0 + 74, Y + 0.2, Color3.fromRGB(90, 90, 96), M.DiamondPlate)
	B.box(m, CFrame.new(s.x1 - 10, Y + 4, s.z0 + 67), Vector3.new(6, 8, 6), Color3.fromRGB(230, 230, 226), M.Plaster)
	local mono = B.box(m, CFrame.new(s.x1 - 20, Y + 5, s.z0 + 20), Vector3.new(26, 10, 3), Color3.fromRGB(30, 60, 110), M.Concrete)
	B.sign(mono, Enum.NormalId.Front, "ORGANİZE SANAYİ BÖLGESİ", { color = Color3.new(1, 1, 1) })
	B.sign(mono, Enum.NormalId.Back, "ORGANİZE SANAYİ BÖLGESİ", { color = Color3.new(1, 1, 1), name = "SignBack" })
	return m
end

----------------------------------------------------------------------------------------------------
-- Technopark
----------------------------------------------------------------------------------------------------
local OFFICE_TOWERS = { "Tower06", "Tower07", "Tower08", "Tower09", "Tower12" }

local function teknopark(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("Teknopark", parent)
	local cx, cz = (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2
	local Y = WALK_Y
	-- glass towers along the northern and southern streets
	local steps = { { names = OFFICE_TOWERS, pref = 0.55, min = 0.4, maxW = 120, inset = 4 } }
	local function north(x: number, inset: number?)
		return facing(x, s.z0 + (inset or 0), 0, -1)
	end
	local function south(x: number, inset: number?)
		return facing(x, s.z1 - (inset or 0), 0, 1)
	end
	local placed = Blocks.realRow(m, north, s.x0 + 6, s.x1 - 6, 100, rng, steps, 10)
	placed += Blocks.realRow(m, south, s.x0 + 6, s.x1 - 6, 100, rng, steps, 10)
	if placed == 0 then
		-- (no building library: plain glass offices instead)
		for _, f in { north, south } do
			for k = -1, 1, 2 do
				Buildings.building(m, f(cx + k * 100, 6), { w = 90, d = 50, floors = 5, floorH = 13, style = "modern", rng = rng, ground = "lobby" })
			end
		end
	end
	-- the middle band: lawn, paths, the plaza with the giant chip, the R&D centre, the chip lab
	slab(m, s.x0 + 4, cz - 4, s.x1 - 4, cz + 4, Y + 0.12, Color3.fromRGB(206, 200, 190), M.Pavement)
	B.cylY(m, CFrame.new(cx, Y + 0.08, cz), 0.16, 70, Color3.fromRGB(216, 212, 204), M.Pavement)
	B.box(m, CFrame.new(cx, Y + 1.5, cz), Vector3.new(8, 3, 8), Color3.fromRGB(60, 64, 70), M.Concrete)
	B.box(m, CFrame.new(cx, Y + 4, cz) * CFrame.Angles(0, math.rad(45), 0), Vector3.new(20, 2, 20), Color3.fromRGB(40, 110, 70), M.SmoothPlastic)
	local die = B.box(m, CFrame.new(cx, Y + 5.6, cz) * CFrame.Angles(0, math.rad(45), 0), Vector3.new(12, 1.2, 12), Color3.fromRGB(190, 196, 204), M.Metal)
	B.sign(die, Enum.NormalId.Top, "TEKNOPARK\nÇİP", { color = Color3.fromRGB(30, 40, 60) })
	for k = 0, 3 do
		local a = k * math.pi / 2 + math.rad(45)
		B.box(m, CFrame.new(cx, Y + 3.6, cz) * CFrame.Angles(0, a, 0) * CFrame.new(0, 0, -10.6), Vector3.new(18, 0.4, 1.2), Color3.fromRGB(220, 180, 60), M.Metal, nc())
	end
	local hcf = facing(cx - 120, cz - 16, 0, 1)
	local hall = Buildings.hall(m, hcf, 70, 40, 16, { name = "AR-GE MERKEZİ • R&D", accent = { 0, 130, 200 }, wall = { 236, 240, 244 }, floor = { 220, 224, 230 }, floorMat = M.CeramicTiles, modelName = "RnD", lightStep = 20 })
	Commerce.servicePoint(hall, hcf * CFrame.new(0, 0.2, 12), "contracts", poi.id, "Teknopark İşi Al", "Teknopark Şirketleri", 10)
	for i = -1, 1 do
		local desk = hcf * CFrame.new(i * 18, 0.2, 28)
		B.box(hall, desk * CFrame.new(0, 2, 0), Vector3.new(10, 0.3, 4), Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
		B.box(hall, desk * CFrame.new(0, 1, 0), Vector3.new(9, 1.8, 3.4), Color3.fromRGB(60, 64, 70), M.Metal)
		Props.monitor(hall, desk * CFrame.new(-2, 2.15, 0.6), "", Color3.fromRGB(10, 60, 90))
		Props.monitor(hall, desk * CFrame.new(2, 2.15, 0.6), "", Color3.fromRGB(10, 60, 90))
	end
	local lab = facing(cx + 120, cz - 16, 0, 1)
	B.box(m, lab * CFrame.new(0, 9, 22), Vector3.new(70, 18, 44), Color3.fromRGB(246, 248, 250), M.SmoothPlastic)
	B.box(m, lab * CFrame.new(0, 8, -0.1), Vector3.new(60, 4, 0.3), Color3.fromRGB(40, 120, 200), M.Glass, nc({ Transparency = 0.2 }))
	local labSign = B.box(m, lab * CFrame.new(0, 14.5, -0.2), Vector3.new(30, 3, 0.3), Color3.fromRGB(0, 90, 160), M.SmoothPlastic, nc())
	B.sign(labSign, Enum.NormalId.Front, "ÇİP LABORATUVARI • TEMİZ ODA", { color = Color3.new(1, 1, 1) })
	for k = 0, 2 do
		B.cylY(m, lab * CFrame.new(-20 + k * 20, 21, 30), 6, 4, Color3.fromRGB(190, 194, 200), M.Metal)
	end
	-- trees and benches on the southern lawn
	for k = 0, 7 do
		local x = s.x0 + 30 + k * (s.x1 - s.x0 - 60) / 7
		if math.abs(x - cx) > 40 then
			Props.tree(m, CFrame.new(x, Y, cz + 30), "street", rng)
			Props.tree(m, CFrame.new(x + 20, Y, cz + 60), "street", rng)
		end
	end
	for _, sx in { -24, 24 } do
		Props.bench(m, facing(cx + sx, cz + 26, 0, -1, Y))
	end
	postSign(m, facing(s.x0 + 8, cz + 22, -1, 0), "TEKNOPARK", 22, { 0, 110, 180 }, 7)
	return m
end

----------------------------------------------------------------------------------------------------
-- Farmland
----------------------------------------------------------------------------------------------------
local function farm(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("Farm", parent)
	local cx = (s.x0 + s.x1) / 2
	local Y = WALK_Y
	local w = s.x1 - s.x0
	-- the farmyard: barn, silo, farmhouse, tractor and hay bales
	local base = facing(cx + 30, s.z0 + 30, 0, -1)
	local red = Color3.fromRGB(160, 40, 36)
	B.box(m, base * CFrame.new(0, 9, 20), Vector3.new(40, 18, 40), red, M.WoodPlanks)
	B.wedge(m, base * CFrame.new(0, 22, 10), Vector3.new(42, 8, 20.5), Color3.fromRGB(90, 70, 60), M.RoofShingles)
	B.wedge(m, base * CFrame.new(0, 22, 30) * CFrame.Angles(0, math.pi, 0), Vector3.new(42, 8, 20.5), Color3.fromRGB(90, 70, 60), M.RoofShingles)
	B.box(m, base * CFrame.new(0, 7, -0.2), Vector3.new(14, 14, 0.4), Color3.fromRGB(240, 240, 236), M.Wood)
	B.cylY(m, base * CFrame.new(-36, 18, 30), 36, 12, Color3.fromRGB(200, 200, 204), M.Metal)
	B.ball(m, base * CFrame.new(-36, 36, 30), 12, Color3.fromRGB(200, 200, 204), M.Metal)
	Buildings.house(m, facing(s.x0 + 30, s.z0 + 2, 0, -1), 44, 60, rng)
	local t = facing(cx + 70, s.z0 + 70, -1, 0)
	B.box(m, t * CFrame.new(0, 3.5, 0), Vector3.new(5, 3, 8), Color3.fromRGB(40, 140, 60), M.Metal)
	B.box(m, t * CFrame.new(0, 6.5, 1.5), Vector3.new(4.6, 3, 4), Color3.fromRGB(180, 210, 220), M.Glass, { Transparency = 0.4 })
	for x = -1, 1, 2 do
		B.cyl(m, t * CFrame.new(x * 3, 2.8, 2.5), 1.4, 5.6, Color3.fromRGB(26, 26, 26), M.Rubber)
		B.cyl(m, t * CFrame.new(x * 2.8, 1.6, -3), 1.2, 3.2, Color3.fromRGB(26, 26, 26), M.Rubber)
	end
	for k = 0, 5 do
		B.cyl(m, CFrame.new(cx - 20 + (k % 3) * 6, Y + 2.2 + math.floor(k / 3) * 4.4, s.z0 + 110), 5, 4.4, Color3.fromRGB(220, 190, 110), M.Grass)
	end
	-- greenhouses
	local gz0 = s.z0 + 140
	-- polytunnels (half-buried plastic tubes) with rows of plants inside
	for k = 0, 3 do
		local x = s.x0 + 26 + k * (w - 52) / 3
		local g = CFrame.new(x, Y, gz0 + 60)
		B.cylZ(m, g, 110, 30, Color3.fromRGB(226, 238, 240), M.Glass, { Transparency = 0.45 })
		for r = -1, 1 do
			B.box(m, g * CFrame.new(r * 8, 1.2, 0), Vector3.new(3, 2.4, 104), Color3.fromRGB(60, 130, 60), M.LeafyGrass, nc())
		end
	end
	-- crop fields
	local crops = { Color3.fromRGB(230, 200, 60), Color3.fromRGB(200, 180, 90), Color3.fromRGB(90, 150, 60), Color3.fromRGB(120, 100, 60) }
	local fz0, fz1 = gz0 + 130, s.z1 - 130
	local fields = 3
	for f = 0, fields - 1 do
		local za = fz0 + f * (fz1 - fz0) / fields
		local zb = za + (fz1 - fz0) / fields - 6
		local col = crops[f % #crops + 1]
		local n = math.floor((zb - za) / 8)
		for r = 0, n - 1 do
			B.box(m, CFrame.new(cx, Y + 0.6, za + 4 + r * 8), Vector3.new(w - 20, 1.2, 4), col, if col == crops[4] then M.Ground else M.LeafyGrass)
		end
	end
	-- the orchard
	for i = 0, 3 do
		for j = 0, 4 do
			Props.tree(m, CFrame.new(s.x0 + 28 + i * (w - 56) / 3, Y, s.z1 - 110 + j * 22), "oak", rng)
		end
	end
	-- the roadside stall on the western street
	local stall = facing(s.x0 + 6, s.z0 + 126, -1, 0)
	B.box(m, stall * CFrame.new(0, 1.6, 0), Vector3.new(12, 3.2, 4), Color3.fromRGB(150, 110, 70), M.WoodPlanks)
	for k = 0, 3 do
		B.box(m, stall * CFrame.new(-4.5 + k * 3, 3.6, 0), Vector3.new(2.6, 0.8, 2.6), crops[k + 1]:Lerp(Color3.fromRGB(220, 60, 40), if k % 2 == 0 then 0.6 else 0), M.SmoothPlastic)
	end
	postSign(m, stall * CFrame.new(0, 0, 3), "KÖY ÜRÜNLERİ", 12, { 90, 140, 60 }, 7)
	hedge(m, Vector3.new(s.x1 - 2, Y, s.z0 + 4), Vector3.new(s.x1 - 2, Y, s.z1 - 4))
	return m
end

----------------------------------------------------------------------------------------------------
-- Golf club
----------------------------------------------------------------------------------------------------
local function golf(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("GolfClub", parent)
	local cx = (s.x0 + s.x1) / 2
	local Y = WALK_Y
	-- the clubhouse and its car park on the northern road
	Buildings.building(m, facing(cx, s.z0 + 8, 0, -1), { w = 70, d = 32, floors = 2, floorH = 13, style = "modern", rng = rng, ground = "lobby", name = "GOLF KULÜBÜ ⛳", wallColor = { 236, 236, 232 } })
	slab(m, cx + 44, s.z0 + 4, s.x1 - 6, s.z0 + 34, Y + 0.12, ASPHALT, M.Asphalt)
	parkingRow(m, cx + 46, s.x1 - 8, s.z0 + 20, -1, rng, 0.6)
	-- nine holes on a three by three grid: tee, fairway, green with its flag, a bunker
	local gx0, gx1, gz0, gz1 = s.x0 + 10, s.x1 - 10, s.z0 + 60, s.z1 - 10
	local cw, ch = (gx1 - gx0) / 3, (gz1 - gz0) / 3
	local fair = Color3.fromRGB(120, 180, 90)
	local green = Color3.fromRGB(110, 200, 90)
	local sand = Color3.fromRGB(230, 214, 170)
	local hole = 0
	for r = 0, 2 do
		for c = 0, 2 do
			hole += 1
			local ccx, ccz = gx0 + (c + 0.5) * cw, gz0 + (r + 0.5) * ch
			local dir = if (r + c) % 2 == 0 then 1 else -1
			local tee = Vector3.new(ccx - dir * cw * 0.32, Y, ccz - ch * 0.3)
			local pin = Vector3.new(ccx + dir * cw * 0.28, Y, ccz + ch * 0.28)
			for k = 0, 2 do
				local p = tee:Lerp(pin, 0.2 + k * 0.3)
				B.cylY(m, CFrame.new(p.X, Y + 0.05, p.Z), 0.1, 34 - k * 2, fair, M.Grass)
			end
			slab(m, tee.X - 5, tee.Z - 5, tee.X + 5, tee.Z + 5, Y + 0.15, Color3.fromRGB(100, 170, 80), M.Grass)
			B.cylY(m, CFrame.new(pin.X, Y + 0.12, pin.Z), 0.12, 26, green, M.Grass)
			B.cylY(m, CFrame.new(pin.X, Y + 0.17, pin.Z), 0.04, 1.4, Color3.fromRGB(20, 20, 20), M.SmoothPlastic, nc())
			B.cylY(m, CFrame.new(pin.X + 0.6, Y + 4.2, pin.Z), 8, 0.25, Color3.fromRGB(240, 240, 240), M.Metal, nc())
			local flag = B.box(m, CFrame.new(pin.X + 2, Y + 7.3, pin.Z), Vector3.new(2.6, 1.8, 0.1), Color3.fromRGB(220, 30, 40), M.Fabric, nc())
			B.sign(flag, Enum.NormalId.Front, tostring(hole), { color = Color3.new(1, 1, 1) })
			local bunker = pin:Lerp(tee, 0.18) + Vector3.new(dir * 12, 0, 0)
			B.cylY(m, CFrame.new(bunker.X, Y + 0.1, bunker.Z), 0.12, 14, sand, M.Sand)
		end
	end
	-- the pond, trees along the edges, a few carts
	B.cylY(m, CFrame.new(gx0 + cw, Y + 0.14, gz0 + ch * 2), 0.14, 36, Color3.fromRGB(50, 130, 160), M.Glass, { Transparency = 0.1, Reflectance = 0.15, Name = "Pond" })
	for k = 0, 9 do
		Props.tree(m, CFrame.new(s.x0 + 4 + (k % 2) * 3, Y, s.z0 + 60 + k * (s.z1 - s.z0 - 70) / 9), Rand.pick(rng, { "cypress", "pine", "oak" }), rng)
		Props.tree(m, CFrame.new(s.x1 - 5 - (k % 2) * 3, Y, s.z0 + 60 + k * (s.z1 - s.z0 - 70) / 9), Rand.pick(rng, { "cypress", "pine", "oak" }), rng)
	end
	for k = 0, 3 do
		OuterProps.golfCart(m, facing(cx - 40 + k * 6, s.z0 + 46, 0, 1))
	end
	-- copses where the cells meet
	for i = 1, 2 do
		for j = 1, 2 do
			local x, z = gx0 + i * cw, gz0 + j * ch
			for t = 0, 2 do
				local a = t * 2.1 + i
				Props.tree(m, CFrame.new(x + math.cos(a) * 9, Y, z + math.sin(a) * 9), Rand.pick(rng, { "oak", "pine", "birch" }), rng)
			end
		end
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Caravan park
----------------------------------------------------------------------------------------------------
local function caravanPark(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("CaravanPark", parent)
	local cx = (s.x0 + s.x1) / 2
	local Y = WALK_Y
	-- the gravel lane down the middle, the reception at the gate
	slab(m, cx - 6, s.z0 + 2, cx + 6, s.z1 - 8, Y + 0.12, Color3.fromRGB(176, 168, 152), M.Slate)
	local rec = facing(cx + 26, s.z0 + 6, 0, -1)
	B.box(m, rec * CFrame.new(0, 5, 8), Vector3.new(20, 10, 16), Color3.fromRGB(170, 130, 90), M.WoodPlanks)
	B.wedge(m, rec * CFrame.new(0, 12, 4), Vector3.new(22, 4, 8.5), Color3.fromRGB(90, 70, 60), M.RoofShingles)
	B.wedge(m, rec * CFrame.new(0, 12, 12) * CFrame.Angles(0, math.pi, 0), Vector3.new(22, 4, 8.5), Color3.fromRGB(90, 70, 60), M.RoofShingles)
	postSign(m, facing(cx - 16, s.z0 + 3, 0, -1), "🚐 KARAVAN PARKI", 20, { 60, 120, 70 }, 7)
	B.box(m, CFrame.new(cx, Y + 3, s.z0 + 4), Vector3.new(11, 0.4, 0.4), Color3.fromRGB(220, 40, 40), M.SmoothPlastic)
	B.box(m, CFrame.new(cx + 6, Y + 1.5, s.z0 + 4), Vector3.new(1, 3, 1), Color3.fromRGB(240, 240, 240), M.Metal)
	-- pitches on both sides of the lane
	local n = 5
	for k = 0, n - 1 do
		local z = s.z0 + 50 + k * (s.z1 - s.z0 - 90) / (n - 1)
		for _, side in { -1, 1 } do
			local x = cx + side * 34
			-- (the door and the awning face the lane)
			OuterProps.caravan(m, facing(x, z, 0, -side), rng)
			if (k + (side + 1) / 2) % 2 == 0 then
				OuterProps.car(m, facing(cx + side * 62, z, 0, 1), rng)
			else
				-- a picnic table on the pitch instead
				local p = CFrame.new(cx + side * 62, Y, z)
				B.box(m, p * CFrame.new(0, 2.6, 0), Vector3.new(4, 0.3, 8), Color3.fromRGB(150, 110, 70), M.Wood)
				B.box(m, p * CFrame.new(0, 1.225, 0), Vector3.new(0.6, 2.45, 6), Color3.fromRGB(120, 90, 60), M.Wood)
				for _, bx in { -2.8, 2.8 } do
					B.box(m, p * CFrame.new(bx, 1.4, 0), Vector3.new(1.4, 0.3, 8), Color3.fromRGB(150, 110, 70), M.Wood)
					B.box(m, p * CFrame.new(bx, 0.625, 0), Vector3.new(0.4, 1.25, 6), Color3.fromRGB(120, 90, 60), M.Wood)
				end
			end
		end
	end
	-- tents and the campfire at the far end
	for k = 0, 3 do
		local tc = facing(s.x0 + 24 + k * 44, s.z1 - 26, 0, -1)
		local col = Rand.pick(rng, { Color3.fromRGB(240, 120, 30), Color3.fromRGB(40, 130, 80), Color3.fromRGB(40, 90, 170) })
		for _, side in { -1, 1 } do
			B.wedge(m, tc * CFrame.new(side * 2.2, 2.4, 0) * CFrame.Angles(0, side * math.pi / 2, 0), Vector3.new(8, 4.8, 4.4), col, M.Fabric)
		end
	end
	-- the shower block and a playground
	local wc = facing(s.x0 + 22, s.z0 + 200, 1, 0)
	B.box(m, wc * CFrame.new(0, 5, 8), Vector3.new(24, 10, 16), Color3.fromRGB(230, 226, 214), M.Plaster)
	B.box(m, wc * CFrame.new(0, 10.4, 8), Vector3.new(26, 0.8, 17), Color3.fromRGB(120, 70, 50), M.Wood)
	local wcSign = B.box(m, wc * CFrame.new(0, 7.6, -0.2), Vector3.new(10, 2, 0.4), Color3.fromRGB(40, 110, 170), M.SmoothPlastic)
	B.sign(wcSign, Enum.NormalId.Front, "DUŞ • WC", { color = Color3.new(1, 1, 1) })
	local pg = CFrame.new(s.x1 - 24, Y, s.z0 + 200)
	B.box(m, pg * CFrame.new(0, 0.15, 0), Vector3.new(26, 0.3, 30), Color3.fromRGB(230, 200, 150), M.Sand)
	for _, sz in { -6, 6 } do
		for _, sx in { -5, 5 } do
			B.box(m, pg * CFrame.new(sx, 5, sz) * CFrame.Angles(0, 0, math.rad(if sx < 0 then 8 else -8)), Vector3.new(0.6, 10, 0.6), Color3.fromRGB(200, 60, 50), M.Metal)
		end
	end
	B.box(m, pg * CFrame.new(0, 10, 0), Vector3.new(0.6, 0.6, 13), Color3.fromRGB(200, 60, 50), M.Metal)
	for _, sz in { -3, 3 } do
		B.box(m, pg * CFrame.new(0, 2, sz), Vector3.new(2, 0.3, 1), Color3.fromRGB(40, 40, 44), M.Rubber)
		B.box(m, pg * CFrame.new(0, 6, sz), Vector3.new(0.15, 8, 0.15), Color3.fromRGB(150, 150, 156), M.Metal, nc())
	end
	B.wedge(m, pg * CFrame.new(-6, 2.5, -12) * CFrame.Angles(0, math.pi / 2, 0), Vector3.new(2.6, 5, 10), Color3.fromRGB(240, 200, 40), M.SmoothPlastic)
	local fire = CFrame.new(cx - 62, Y, s.z1 - 78)
	for i = 0, 7 do
		local a = i * math.pi / 4
		B.ball(m, fire * CFrame.new(math.cos(a) * 2.6, 0.5, math.sin(a) * 2.6), 1.4, Color3.fromRGB(120, 116, 110), M.Rock)
	end
	local flame = B.box(m, fire * CFrame.new(0, 1.2, 0), Vector3.new(1, 1, 1), Color3.fromRGB(255, 140, 40), M.Neon, nc({ Transparency = 1, Name = "Campfire" }))
	local f = Instance.new("Fire")
	f.Size = 4
	f.Heat = 8
	f.Parent = flame
	for _ = 1, 14 do
		local x = Rand.range(rng, s.x0 + 6, s.x1 - 6)
		local z = Rand.range(rng, s.z0 + 30, s.z1 - 10)
		if math.abs(x - cx) > 76 and math.abs(z - (s.z0 + 200)) > 24 then
			Props.tree(m, CFrame.new(x, Y, z), "pine", rng)
		end
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Villa hill club: tennis, pool and the counter where the villa owners hand out work
----------------------------------------------------------------------------------------------------
local function villaClub(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("VillaClub", parent)
	local cx = (s.x0 + s.x1) / 2
	local Y = WALK_Y
	local hcf = facing(cx + 40, s.z1 - 8, 0, 1)
	local hall = Buildings.hall(m, hcf, 64, 32, 14, { name = "VİLLA TEPE KULÜBÜ", accent = { 40, 110, 70 }, wall = { 246, 244, 238 }, floor = { 200, 170, 130 }, floorMat = M.WoodPlanks, modelName = "ClubHouse", lightStep = 20 })
	Commerce.servicePoint(hall, hcf * CFrame.new(-14, 0.2, 12), "contracts", poi.id, "Villa İşi Al", "Villa Sahipleri", 10)
	-- two tennis courts in the north half
	for k = 0, 1 do
		local c = CFrame.new(s.x0 + 26 + k * 38, Y, s.z0 + 46)
		B.box(m, c * CFrame.new(0, 0.1, 0), Vector3.new(34, 0.2, 72), Color3.fromRGB(70, 120, 90), M.Concrete)
		B.box(m, c * CFrame.new(0, 0.2, 0), Vector3.new(28, 0.1, 64), Color3.fromRGB(40, 100, 160), M.SmoothPlastic)
		for _, sx in { -14, 14 } do
			paint(m, c * CFrame.new(sx, 0.25, 0), 0.4, 64)
		end
		for _, sz in { -32, 32, 0 } do
			paint(m, c * CFrame.new(0, 0.25, sz), 28, 0.4)
		end
		paint(m, c * CFrame.new(0, 0.25, 0), 0.4, 36)
		B.box(m, c * CFrame.new(0, 1.8, 0), Vector3.new(30, 2.4, 0.15), Color3.fromRGB(240, 240, 240), M.Fabric, { Transparency = 0.3 })
		for _, sx in { -15.2, 15.2 } do
			B.cylY(m, c * CFrame.new(sx, 1.6, 0), 3.2, 0.4, Color3.fromRGB(60, 60, 64), M.Metal)
		end
	end
	-- the pool and its terrace
	local px, pz = s.x1 - 46, s.z0 + 50
	slab(m, px - 34, pz - 22, px + 34, pz + 22, Y + 0.3, Color3.fromRGB(236, 232, 222), M.Pavement)
	B.box(m, CFrame.new(px, Y + 0.35, pz), Vector3.new(50, 0.2, 22), Color3.fromRGB(60, 180, 210), M.Glass, { Transparency = 0.15, Reflectance = 0.1, Name = "PoolWater" })
	for k = 0, 5 do
		local lc = CFrame.new(px - 25 + k * 10, Y + 0.3, pz + 16)
		B.box(m, lc * CFrame.new(0, 0.6, 0), Vector3.new(2.4, 0.4, 6), Color3.fromRGB(250, 250, 250), M.SmoothPlastic)
		B.box(m, lc * CFrame.new(0, 1.4, -2.4) * CFrame.Angles(math.rad(50), 0, 0), Vector3.new(2.4, 0.4, 2.4), Color3.fromRGB(250, 250, 250), M.SmoothPlastic, nc())
	end
	for k = 0, 2 do
		Props.parasolTable(m, CFrame.new(px - 20 + k * 20, Y + 0.3, pz - 17), { 40, 110, 70 }, rng)
	end
	parkingRow(m, s.x0 + 6, cx - 4, s.z1 - 14, 1, rng, 0.7)
	for k = 0, 3 do
		Props.tree(m, CFrame.new(s.x0 + 90 + k * 24, Y, s.z0 + 96), "cypress", rng)
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Holiday village: the site pool and the beach club
----------------------------------------------------------------------------------------------------
local function summerSite(parent: Instance, poi, rng: Random)
	local s = poi.site
	local m = B.model("HolidayVillage", parent)
	local cx, cz = (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2
	local Y = WALK_Y
	Buildings.building(m, facing(s.x0 + 30, s.z1 - 4, 0, 1), { w = 44, d = 26, floors = 1, floorH = 12, style = "apartment", rng = rng, ground = "shop", shops = 1, name = "PLAJ KULÜBÜ", wallColor = { 246, 246, 242 }, blankSides = true })
	Buildings.building(m, facing(s.x1 - 20, s.z1 - 4, 0, 1), { w = 26, d = 20, floors = 1, floorH = 11, style = "apartment", rng = rng, ground = "shop", shops = 1, name = "SİTE MARKET", wallColor = { 250, 236, 210 }, blankSides = true })
	slab(m, cx - 44, cz - 30, cx + 40, cz + 8, Y + 0.3, Color3.fromRGB(236, 230, 214), M.Pavement)
	B.box(m, CFrame.new(cx - 2, Y + 0.35, cz - 12), Vector3.new(64, 0.2, 22), Color3.fromRGB(60, 180, 210), M.Glass, { Transparency = 0.15, Reflectance = 0.1, Name = "PoolWater" })
	for k = 0, 6 do
		local lc = CFrame.new(cx - 36 + k * 11, Y + 0.3, cz + 3)
		B.box(m, lc * CFrame.new(0, 0.6, 0), Vector3.new(2.4, 0.4, 6), Color3.fromRGB(250, 250, 250), M.SmoothPlastic)
		B.box(m, lc * CFrame.new(0, 1.4, 2.4) * CFrame.Angles(math.rad(-50), 0, 0), Vector3.new(2.4, 0.4, 2.4), Color3.fromRGB(250, 250, 250), M.SmoothPlastic, nc())
	end
	for k = 0, 5 do
		Props.tree(m, CFrame.new(s.x0 + 8 + k * (s.x1 - s.x0 - 16) / 5, Y, s.z0 + 8), "palm", rng)
	end
	return m
end

----------------------------------------------------------------------------------------------------
function Outer.build(parent: Instance, L, yieldFn: (() -> ())?)
	local rng = Random.new(2071)
	local folder = B.folder("Outer", parent)
	local builders = {
		airport = airport,
		shipyard = shipyard,
		fishing_village = fishingVillage,
		osb = osb,
		teknopark = teknopark,
		farm = farm,
		golf = golf,
		caravan = caravanPark,
		villa_club = villaClub,
		summer_site = summerSite,
	}
	local ids = {}
	for id in builders do
		table.insert(ids, id)
	end
	table.sort(ids)
	for _, id in ids do
		local poi = L.poiById[id]
		if poi then
			local ok, err = pcall(builders[id], folder, poi, rng)
			if not ok then
				warn("[World] failed to build " .. id .. ": " .. tostring(err))
				Outer.lastError = err
			end
			if yieldFn then
				yieldFn()
			end
		end
	end
	return folder
end

return Outer
