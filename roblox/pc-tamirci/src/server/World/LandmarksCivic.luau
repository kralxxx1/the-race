-- Civic landmarks: Republic Square (clock tower, fountain, city hall, bank, café), the university,
-- hospital, school, fire station and stadium.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Props = require(Shared.Models.Props)
local Buildings = require(Shared.Models.Buildings)
local CityLayout = require(Shared.World.CityLayout)
local Commerce = require(script.Parent.LandmarksCommerce)

local Civic = {}
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

local function colonnade(parent, cf: CFrame, width: number, height: number, count: number, color)
	for i = 0, count - 1 do
		local x = -width / 2 + width * (i + 0.5) / count
		B.cylY(parent, cf * CFrame.new(x, height / 2 + 1, 0), height, 2.2, color, M.Marble)
		B.box(parent, cf * CFrame.new(x, 0.5, 0), Vector3.new(3, 1, 3), color, M.Marble)
		B.box(parent, cf * CFrame.new(x, height + 1.5, 0), Vector3.new(3, 1, 3), color, M.Marble)
	end
end

----------------------------------------------------------------------------------------------------
-- Republic Square
----------------------------------------------------------------------------------------------------
local function plaza(parent, poi, rng)
	local m = B.model("RepublicSquare", parent)
	local c = poi.pos
	local center = CFrame.new(c.X, WALK_Y, c.Z)
	local marble = Color3.fromRGB(236, 232, 222)
	-- patterned paving rings
	B.cylY(m, center * CFrame.new(0, 0.05, 0), 0.1, 92, Color3.fromRGB(196, 176, 150), M.SmoothPlastic, nc({ CanCollide = true }))
	B.cylY(m, center * CFrame.new(0, 0.08, 0), 0.1, 74, Color3.fromRGB(226, 220, 206), M.Marble, nc({ CanCollide = true }))
	-- fountain ring around the clock tower
	B.cylY(m, center * CFrame.new(0, 1, 0), 2, 46, marble, M.Marble)
	local water = B.cylY(m, center * CFrame.new(0, 1.9, 0), 0.4, 43, Color3.fromRGB(60, 150, 190), M.Glass, nc({ Transparency = 0.25, Reflectance = 0.2 }))
	water.Name = "FountainWater"
	for i = 0, 7 do
		local a = i * math.pi / 4
		local jet = B.box(m, center * CFrame.new(math.cos(a) * 16, 2.2, math.sin(a) * 16), Vector3.new(0.6, 0.6, 0.6), marble, M.Marble, nc())
		local pe = Instance.new("ParticleEmitter")
		pe.Name = "Jet"
		pe.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		pe.Color = ColorSequence.new(Color3.fromRGB(200, 230, 255))
		pe.LightEmission = 0.3
		pe.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 0.15) })
		pe.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.2), NumberSequenceKeypoint.new(1, 1) })
		pe.Lifetime = NumberRange.new(1.1, 1.4)
		pe.Rate = 40
		pe.Speed = NumberRange.new(14, 16)
		pe.SpreadAngle = Vector2.new(6, 6)
		pe.Acceleration = Vector3.new(0, -22, 0)
		pe.EmissionDirection = Enum.NormalId.Top
		pe.Parent = jet
	end
	-- clock tower (Izmir-style): base, shaft, clock stage, lantern
	local stone = Color3.fromRGB(230, 214, 186)
	local tower = center * CFrame.new(0, 2, 0)
	B.box(m, tower * CFrame.new(0, 3, 0), Vector3.new(12, 6, 12), stone, M.Sandstone)
	B.box(m, tower * CFrame.new(0, 17, 0), Vector3.new(8, 22, 8), stone, M.Sandstone)
	for sx = -1, 1, 2 do
		for sz = -1, 1, 2 do
			B.cylY(m, tower * CFrame.new(sx * 4, 17, sz * 4), 22, 1.4, Color3.fromRGB(214, 196, 166), M.Marble)
		end
	end
	B.box(m, tower * CFrame.new(0, 31, 0), Vector3.new(10, 6, 10), stone, M.Sandstone)
	local faces = { { Enum.NormalId.Front, 0 }, { Enum.NormalId.Back, math.pi }, { Enum.NormalId.Left, math.pi / 2 }, { Enum.NormalId.Right, -math.pi / 2 } }
	for _, f in faces do
		local faceCf = tower * CFrame.new(0, 31, 0) * CFrame.Angles(0, f[2], 0) * CFrame.new(0, 0, -5.1)
		local dial = B.cyl(m, faceCf * CFrame.Angles(0, math.pi / 2, 0), 0.2, 5, Color3.fromRGB(250, 248, 240), M.SmoothPlastic, nc({ Name = "ClockDial" }))
		dial.Name = "ClockDial"
		local hour = B.box(m, faceCf * CFrame.new(0, 0.9, -0.2), Vector3.new(0.35, 1.8, 0.1), Color3.fromRGB(20, 20, 20), M.Metal, nc({ Name = "HourHand" }))
		local minute = B.box(m, faceCf * CFrame.new(0, 1.2, -0.3), Vector3.new(0.22, 2.4, 0.1), Color3.fromRGB(20, 20, 20), M.Metal, nc({ Name = "MinuteHand" }))
		for _, hand in { hour, minute } do
			hand:SetAttribute("Pivot", faceCf * CFrame.new(0, 0, -0.25))
			hand:AddTag("ClockHand")
		end
	end
	B.box(m, tower * CFrame.new(0, 35, 0), Vector3.new(11, 1, 11), Color3.fromRGB(200, 180, 150), M.Sandstone)
	for sx = -1, 1, 2 do
		for sz = -1, 1, 2 do
			B.cylY(m, tower * CFrame.new(sx * 3, 38.5, sz * 3), 6, 1, stone, M.Marble)
		end
	end
	B.cylY(m, tower * CFrame.new(0, 42, 0), 1, 8, stone, M.Sandstone)
	B.ball(m, tower * CFrame.new(0, 44.5, 0), 6, Color3.fromRGB(110, 120, 130), M.Slate)
	B.cylY(m, tower * CFrame.new(0, 48.5, 0), 3, 0.5, Color3.fromRGB(220, 180, 80), M.Metal, nc())
	-- benches, trees and lamps around the square
	for i = 0, 11 do
		local a = i * math.pi / 6 + math.pi / 12
		local p = center * CFrame.new(math.cos(a) * 42, 0, math.sin(a) * 42)
		if i % 3 == 0 then
			Props.tree(m, p, "oak", rng)
		elseif i % 3 == 1 then
			Props.bench(m, CFrame.lookAt(p.Position, center.Position) * CFrame.Angles(0, math.pi, 0))
		else
			Props.streetLamp(m, CFrame.lookAt(p.Position, center.Position), "classic")
		end
	end
	Props.flag(m, center * CFrame.new(-30, 0, -58), 30)
	Props.flag(m, center * CFrame.new(30, 0, -58), 30)
	Props.simitCart(m, CFrame.lookAt((center * CFrame.new(26, 0, 30)).Position, center.Position))
	Props.newsKiosk(m, CFrame.lookAt((center * CFrame.new(-60, 0, 60)).Position, center.Position))
	-- city hall on the north edge, facing the square (front = local -Z = south)
	local hallCf = CFrame.lookAt(Vector3.new(c.X, WALK_Y, c.Z - 64), Vector3.new(c.X, WALK_Y, c.Z))
	local facadeCf = hallCf * CFrame.new(0, 0, -26)
	Buildings.hall(m, facadeCf, 72, 22, 16, { name = "CITY HALL", accent = { 160, 30, 40 }, wall = { 236, 228, 210 }, wallMat = M.Limestone, floor = { 200, 190, 170 }, floorMat = M.Marble, glassFront = false, modelName = "CityHall", sign = false })
	colonnade(m, facadeCf * CFrame.new(0, 0, -4), 50, 18, 8, Color3.fromRGB(240, 236, 226))
	B.box(m, facadeCf * CFrame.new(0, 20.6, -4.5), Vector3.new(54, 1.2, 4), Color3.fromRGB(236, 228, 210), M.Limestone)
	-- triangular pediment: two wedges whose tall edges meet in the middle
	for side = -1, 1, 2 do
		B.wedge(m, facadeCf * CFrame.new(side * 13.5, 24.2, -4.5) * CFrame.Angles(0, -side * math.pi / 2, 0), Vector3.new(2, 6, 27), Color3.fromRGB(236, 228, 210), M.Limestone)
	end
	local hallSign = B.box(m, facadeCf * CFrame.new(0, 22.4, -5.8), Vector3.new(20, 2, 0.4), Color3.fromRGB(150, 30, 40), M.SmoothPlastic, nc())
	B.sign(hallSign, Enum.NormalId.Front, "MAYOR'S OFFICE", { color = Color3.fromRGB(250, 230, 180), font = B.Fonts.Serif })
	B.ball(m, facadeCf * CFrame.new(0, 22, 11), 18, Color3.fromRGB(90, 120, 140), M.Slate)
	for s = 0, 5 do
		B.box(m, facadeCf * CFrame.new(0, 0.2 + (5 - s) * 0.3, -(6 + s * 1.2)), Vector3.new(30 + s * 2, 0.4, 1.4), Color3.fromRGB(226, 220, 206), M.Marble)
	end
	-- leaderboard board in front of city hall
	local board = B.box(m, facadeCf * CFrame.new(-22, 6, -16), Vector3.new(10, 9, 0.6), Color3.fromRGB(30, 34, 44), M.Metal)
	board.Name = "LeaderboardBoard"
	B.tag(board, "Leaderboard")
	local anchor = B.marker(m, "ServiceAnchor", facadeCf * CFrame.new(0, 3, -14), Vector3.new(10, 6, 4))
	anchor:SetAttribute("Service", "board")
	anchor:SetAttribute("Poi", "cityhall")
	B.prompt(anchor, "Task Board", "City Hall", { distance = 16, name = "ServicePrompt" })
	B.tag(anchor, "ServicePoint")
	-- bank on the east edge, café on the west edge
	local bankCf = CFrame.lookAt(Vector3.new(c.X + 66, WALK_Y, c.Z - 10), Vector3.new(c.X, WALK_Y, c.Z - 10))
	Buildings.building(m, bankCf, { w = 36, d = 24, floors = 3, floorH = 13, style = "historic", ground = "lobby", name = "CITY BANK", rng = rng, blankSides = true })
	Props.atm(m, bankCf * CFrame.new(-12, 0, -1))
	Props.atm(m, bankCf * CFrame.new(-8, 0, -1))
	local cafeCf = CFrame.lookAt(Vector3.new(c.X - 66, WALK_Y, c.Z + 20), Vector3.new(c.X, WALK_Y, c.Z + 20))
	Buildings.building(m, cafeCf, { w = 34, d = 22, floors = 2, floorH = 12, style = "apartment", ground = "shop", shops = 1, name = "PLAZA CAFE ☕", accent = { 120, 70, 40 }, rng = rng, blankSides = true })
	for i = 0, 3 do
		Props.parasolTable(m, cafeCf * CFrame.new(-12 + i * 8, 0, -8), { 120, 70, 40 }, rng)
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- University campus
----------------------------------------------------------------------------------------------------
local function university(parent, poi, rng)
	local b = poi.site
	local m = B.model("University", parent)
	local cx, cz = (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2
	-- main building along the south (facing the quad and Park Caddesi)
	local mainCf = CFrame.lookAt(Vector3.new(cx, WALK_Y, b.z1 - 70), Vector3.new(cx, WALK_Y, b.z1 + 10))
	Buildings.building(m, mainCf, { w = 140, d = 40, floors = 4, floorH = 14, style = "historic", ground = "lobby", name = "TECHNICAL UNIVERSITY", rng = rng, roof = "gable" })
	colonnade(m, mainCf * CFrame.new(0, 0, -3), 40, 18, 6, Color3.fromRGB(240, 236, 226))
	-- library (modern glass box) on the east side
	local libCf = CFrame.lookAt(Vector3.new(b.x1 - 70, WALK_Y, cz - 20), Vector3.new(b.x1 - 140, WALK_Y, cz - 20))
	Buildings.building(m, libCf, { w = 70, d = 46, floors = 3, floorH = 14, style = "modern", ground = "lobby", name = "LIBRARY", rng = rng, glassColor = { 80, 120, 140 } })
	-- dorms on the west side
	for k = 0, 1 do
		local dormCf = CFrame.lookAt(Vector3.new(b.x0 + 40, WALK_Y, b.z0 + 70 + k * 110), Vector3.new(b.x0 + 140, WALK_Y, b.z0 + 70 + k * 110))
		Buildings.building(m, dormCf, { w = 70, d = 30, floors = 6, style = "apartment", ground = "lobby", name = "STUDENT DORM " .. (k + 1), rng = rng })
	end
	-- the quad: lawn paths, trees, statue, fountain
	local quad = CFrame.new(cx, WALK_Y, cz - 30)
	B.box(m, quad * CFrame.new(0, 0.05, 0), Vector3.new(14, 0.1, 220), Color3.fromRGB(200, 190, 170), M.SmoothPlastic, nc({ CanCollide = true }))
	B.box(m, quad * CFrame.new(0, 0.05, 0), Vector3.new(220, 0.1, 14), Color3.fromRGB(200, 190, 170), M.SmoothPlastic, nc({ CanCollide = true }))
	B.cylY(m, quad * CFrame.new(0, 1.5, 0), 3, 8, Color3.fromRGB(200, 196, 190), M.Granite)
	B.box(m, quad * CFrame.new(0, 6, 0), Vector3.new(2, 6, 2), Color3.fromRGB(110, 90, 60), M.Metal)
	B.ball(m, quad * CFrame.new(0, 10, 0), 3, Color3.fromRGB(110, 90, 60), M.Metal)
	for _ = 1, 26 do
		local p = quad * CFrame.new(Rand.range(rng, -150, 150), 0, Rand.range(rng, -130, 110))
		if math.abs(p.X - cx) > 12 and math.abs(p.Z - (cz - 30)) > 12 then
			Props.tree(m, p, Rand.pick(rng, { "oak", "oak", "birch", "pine" }), rng)
		end
	end
	for i = 0, 5 do
		Props.bench(m, quad * CFrame.new(-60 + i * 24, 0, 12))
	end
	-- basketball court
	local court = CFrame.new(b.x1 - 60, WALK_Y, b.z0 + 50)
	B.box(m, court * CFrame.new(0, 0.06, 0), Vector3.new(50, 0.12, 28), Color3.fromRGB(190, 90, 60), M.SmoothPlastic, nc({ CanCollide = true }))
	for k = -1, 1, 2 do
		B.cylY(m, court * CFrame.new(k * 24, 5, 0), 10, 0.5, Color3.fromRGB(60, 60, 64), M.Metal)
		B.box(m, court * CFrame.new(k * 23.4, 10, 0), Vector3.new(0.3, 3.4, 5), Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
		B.cylY(m, court * CFrame.new(k * 22.4, 9, 0), 0.2, 1.8, Color3.fromRGB(230, 90, 30), M.Metal, nc())
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Hospital, school, fire station, stadium
----------------------------------------------------------------------------------------------------
local function hospital(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 10)
	local m = Buildings.building(parent, cf, { w = w - 30, d = d - 30, floors = 8, floorH = 13, style = "office", ground = "lobby", name = "CITY HOSPITAL", rng = rng, wallColor = { 240, 242, 246 }, glassColor = { 70, 120, 150 } })
	local H = 8 * 13
	local roof = cf * CFrame.new(0, H + 1.4, (d - 30) / 2)
	B.cylY(m, roof, 0.4, 30, Color3.fromRGB(80, 84, 90), M.SmoothPlastic)
	B.box(m, roof * CFrame.new(0, 0.25, 0), Vector3.new(4, 0.1, 18), Color3.fromRGB(240, 240, 240), M.SmoothPlastic, nc())
	B.box(m, roof * CFrame.new(0, 0.25, 0), Vector3.new(14, 0.1, 4), Color3.fromRGB(240, 240, 240), M.SmoothPlastic, nc())
	local cross = B.box(m, cf * CFrame.new(-(w - 30) / 2 + 10, H - 10, -0.5), Vector3.new(10, 10, 1), Color3.fromRGB(255, 255, 255), M.SmoothPlastic)
	B.sign(cross, Enum.NormalId.Front, "☾", { color = Color3.fromRGB(220, 20, 30), glow = true })
	local er = B.box(m, cf * CFrame.new((w - 30) / 2 - 12, 11, -0.5), Vector3.new(14, 3, 1), Color3.fromRGB(200, 20, 30), M.Neon, nc())
	B.sign(er, Enum.NormalId.Front, "EMERGENCY", { color = Color3.new(1, 1, 1) })
	-- ambulance bay
	B.box(parent, cf * CFrame.new((w - 30) / 2 - 12, 0.05, -10), Vector3.new(16, 0.1, 14), Color3.fromRGB(240, 200, 40), M.SmoothPlastic, nc({ CanCollide = true }))
	return m
end

local function school(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 8)
	local m = Buildings.building(parent, cf * CFrame.new(0, 0, d / 2 - 10), { w = w - 30, d = 34, floors = 3, floorH = 12, style = "apartment", wallColor = { 238, 210, 160 }, ground = "lobby", name = "LINCOLN PRIMARY SCHOOL", rng = rng, roof = "gable" })
	-- schoolyard with court markings and hoops
	local yard = cf * CFrame.new(0, 0.06, d / 4 - 6)
	B.box(parent, yard, Vector3.new(w - 30, 0.12, d / 2 - 22), Color3.fromRGB(70, 110, 160), M.SmoothPlastic, nc({ CanCollide = true }))
	B.box(parent, yard * CFrame.new(0, 0.07, 0), Vector3.new(0.5, 0.02, d / 2 - 26), Color3.new(1, 1, 1), M.SmoothPlastic, nc())
	B.cylY(parent, yard * CFrame.new(0, 0.07, 0), 0.02, 12, Color3.new(1, 1, 1), M.SmoothPlastic, nc())
	for k = -1, 1, 2 do
		B.cylY(parent, yard * CFrame.new(k * (w / 2 - 22), 5, 0), 10, 0.5, Color3.fromRGB(60, 60, 64), M.Metal)
		B.box(parent, yard * CFrame.new(k * (w / 2 - 22.4), 10, 0), Vector3.new(0.3, 3, 4.6), Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
	end
	Props.flag(parent, cf * CFrame.new(-w / 2 + 14, 0, 6), 24)
	Props.fence(parent, (cf * CFrame.new(-w / 2 + 4, 0, 2)).Position, (cf * CFrame.new(-6, 0, 2)).Position, "metal", 6)
	Props.fence(parent, (cf * CFrame.new(6, 0, 2)).Position, (cf * CFrame.new(w / 2 - 4, 0, 2)).Position, "metal", 6)
	return m
end

local function fireStation(parent, poi, _rng)
	local cf, w, _d = Commerce.siteFrame(poi, 8)
	local m = B.model("FireStation", parent)
	local brick = Color3.fromRGB(160, 60, 46)
	local bw, bd, bh = w - 40, 50, 22
	B.box(m, cf * CFrame.new(0, bh / 2, bd / 2 + 4), Vector3.new(bw, bh, bd), brick, M.Brick)
	for i = -1, 1 do
		local door = B.box(m, cf * CFrame.new(i * 22, 7.5, 3.8), Vector3.new(16, 15, 0.4), Color3.fromRGB(200, 40, 30), M.DiamondPlate)
		door.Name = "GarageDoor"
		for k = 0, 2 do
			B.box(m, cf * CFrame.new(i * 22, 9 + k * 2, 3.5), Vector3.new(14, 0.8, 0.2), Color3.fromRGB(180, 210, 230), M.Glass, nc({ Transparency = 0.3 }))
		end
	end
	local sign = B.box(m, cf * CFrame.new(0, bh - 3, 3.8), Vector3.new(30, 3, 0.4), Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
	B.sign(sign, Enum.NormalId.Front, "FIRE DEPT 911", { color = Color3.fromRGB(200, 30, 30) })
	-- drill tower
	B.box(m, cf * CFrame.new(bw / 2 + 10, 25, 20), Vector3.new(12, 50, 12), brick, M.Brick)
	-- fire truck parked out front
	local truck = cf * CFrame.new(-22, 0, -14)
	B.box(m, truck * CFrame.new(0, 4, 0), Vector3.new(9, 6, 26), Color3.fromRGB(200, 30, 30), M.Metal)
	B.box(m, truck * CFrame.new(0, 6.6, -10.5), Vector3.new(8.6, 3.4, 4.6), Color3.fromRGB(150, 190, 220), M.Glass, { Transparency = 0.4 })
	B.box(m, truck * CFrame.new(0, 7.5, 3), Vector3.new(2, 1, 20), Color3.fromRGB(200, 200, 205), M.Metal)
	for _, z in { -8, 0, 8 } do
		for x = -1, 1, 2 do
			B.cyl(m, truck * CFrame.new(x * 4.4, 1.8, z), 1.4, 3.6, Color3.fromRGB(26, 26, 26), M.Rubber)
		end
	end
	local bar = B.box(m, truck * CFrame.new(0, 7.4, -9), Vector3.new(6, 0.6, 1), Color3.fromRGB(40, 80, 255), M.Neon, nc())
	bar:AddTag("Siren")
	return m
end

local function stadium(parent, poi, _rng)
	local _cf, w, d = Commerce.siteFrame(poi, 6)
	local m = B.model("Stadium", parent)
	local c = poi.pos
	local center = CFrame.new(c.X, WALK_Y, c.Z)
	local pw, pd = math.min(w - 50, 120), math.min(d - 50, 90)
	B.box(m, center * CFrame.new(0, 0.1, 0), Vector3.new(pw + 12, 0.2, pd + 12), Color3.fromRGB(80, 150, 70), M.Grass)
	for k = -3, 3 do
		B.box(m, center * CFrame.new(k * pw / 7, 0.21, 0), Vector3.new(pw / 7, 0.02, pd), if k % 2 == 0 then Color3.fromRGB(86, 160, 74) else Color3.fromRGB(74, 146, 66), M.Grass, nc())
	end
	local white = Color3.fromRGB(245, 245, 245)
	B.box(m, center * CFrame.new(0, 0.24, 0), Vector3.new(0.5, 0.02, pd), white, M.SmoothPlastic, nc())
	B.box(m, center * CFrame.new(0, 0.24, -pd / 2), Vector3.new(pw, 0.02, 0.5), white, M.SmoothPlastic, nc())
	B.box(m, center * CFrame.new(0, 0.24, pd / 2), Vector3.new(pw, 0.02, 0.5), white, M.SmoothPlastic, nc())
	B.box(m, center * CFrame.new(-pw / 2, 0.24, 0), Vector3.new(0.5, 0.02, pd), white, M.SmoothPlastic, nc())
	B.box(m, center * CFrame.new(pw / 2, 0.24, 0), Vector3.new(0.5, 0.02, pd), white, M.SmoothPlastic, nc())
	for k = -1, 1, 2 do
		local goal = center * CFrame.new(k * (pw / 2 + 0.5), 0, 0)
		B.box(m, goal * CFrame.new(0, 4, -6), Vector3.new(0.4, 8, 0.4), white, M.Metal)
		B.box(m, goal * CFrame.new(0, 4, 6), Vector3.new(0.4, 8, 0.4), white, M.Metal)
		B.box(m, goal * CFrame.new(0, 8, 0), Vector3.new(0.4, 0.4, 12.4), white, M.Metal)
		B.box(m, goal * CFrame.new(k * 3, 4, 0), Vector3.new(0.1, 8, 12), white, M.ForceField, nc({ Transparency = 0.6 }))
	end
	-- stands (stepped) on all sides
	-- a stand faces the pitch and rises away from it (local +Z)
	local function stand(pos: Vector3, length: number)
		local cf2 = CFrame.lookAt(pos, Vector3.new(center.X, pos.Y, center.Z))
		for s = 0, 6 do
			B.box(m, cf2 * CFrame.new(0, 1 + s * 1.6, s * 2.4), Vector3.new(length, 2, 2.6), if s % 2 == 0 then Color3.fromRGB(200, 30, 40) else Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
		end
		B.box(m, cf2 * CFrame.new(0, 7, 17), Vector3.new(length, 14, 1), Color3.fromRGB(170, 170, 176), M.SmoothPlastic)
	end
	stand((center * CFrame.new(0, 0, pd / 2 + 10)).Position, pw + 10)
	stand((center * CFrame.new(0, 0, -(pd / 2 + 10))).Position, pw + 10)
	stand((center * CFrame.new(pw / 2 + 10, 0, 0)).Position, pd)
	stand((center * CFrame.new(-(pw / 2 + 10), 0, 0)).Position, pd)
	-- floodlights
	for sx = -1, 1, 2 do
		for sz = -1, 1, 2 do
			local p = center * CFrame.new(sx * (pw / 2 + 24), 0, sz * (pd / 2 + 24))
			B.box(m, p * CFrame.new(0, 22, 0), Vector3.new(1.4, 44, 1.4), Color3.fromRGB(150, 150, 156), M.Metal)
			local head = B.box(m, CFrame.lookAt((p * CFrame.new(0, 44, 0)).Position, center.Position), Vector3.new(8, 4, 1), Color3.fromRGB(240, 240, 250), M.Neon, nc({ Name = "Floodlight" }))
			local l = B.spotLight(head, Enum.NormalId.Front, 60, 70, 2.5, Color3.fromRGB(255, 255, 250), false)
			l.Enabled = false
			head:AddTag("NightLight")
		end
	end
	local board = B.box(m, center * CFrame.new(0, 20, -(pd / 2 + 30)), Vector3.new(30, 10, 1), Color3.fromRGB(10, 10, 12), M.SmoothPlastic)
	for side = -1, 1, 2 do
		B.box(m, center * CFrame.new(side * 11, 7.5, -(pd / 2 + 30)), Vector3.new(1.2, 15, 1.2), Color3.fromRGB(70, 70, 76), M.Metal)
	end
	B.sign(board, Enum.NormalId.Back, "REPAIRERS 2 - 1 CHIPSTERS", { glow = true, color = Color3.fromRGB(255, 200, 40), font = B.Fonts.Mono })
	return m
end

function Civic.build(parent: Instance, L, yieldFn: (() -> ())?)
	local rng = Random.new(1923)
	local folder = B.folder("Civic", parent)
	local builders = { plaza = plaza, university = university, hospital = hospital, school = school, fire_station = fireStation, stadium = stadium }
	for id, fn in builders do
		local poi = L.poiById[id]
		if poi then
			local ok, err = pcall(fn, folder, poi, rng)
			if not ok then
				warn("[World] failed to build " .. id .. ": " .. tostring(err))
				Civic.lastError = err
			end
			if yieldFn then
				yieldFn()
			end
		end
	end
	return folder
end

return Civic
