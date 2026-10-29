-- Props: street furniture, vegetation and small objects used by the world and the shops.
-- Every function takes `cf` = position on the ground with LookVector = the prop's front.

local B = require(script.Parent.Parent.Util.Builder)
local Rand = require(script.Parent.Parent.Util.Rand)
local Assets = require(script.Parent.Parent.Util.Assets)

local Props = {}
local P = B.Palette
local M = Enum.Material

local GREENS = {
	Color3.fromRGB(82, 128, 58),
	Color3.fromRGB(96, 142, 62),
	Color3.fromRGB(70, 116, 52),
	Color3.fromRGB(110, 150, 70),
	Color3.fromRGB(64, 104, 56),
	Color3.fromRGB(122, 160, 74),
}
local AUTUMN = { Color3.fromRGB(196, 120, 50), Color3.fromRGB(210, 160, 60), Color3.fromRGB(170, 80, 40) }

local function noCollide(extra: { [string]: any }?)
	local t = { CanCollide = false, CanTouch = false, CastShadow = true }
	if extra then
		for k, v in extra do
			t[k] = v
		end
	end
	return t
end

----------------------------------------------------------------------------------------------------
-- Vegetation
----------------------------------------------------------------------------------------------------
-- Real trees from the Forest Pack: names and the height range they're scaled to.
local TREES = {
	oak = { { "TreeBroadleaf", "TreeMaple", "TreeDogwood", "TreeBeech" }, 20, 30 },
	birch = { { "TreeBeechYoung", "TreeDogwood" }, 18, 24 },
	pine = { { "TreeRedwood" }, 26, 38 },
	bush = { { "BushLaurel", "BushRhodo", "BushRhodo2", "Fern" }, 2.6, 4.2 },
	forest = { { "TreeBeechBig", "TreeBeech", "TreeBroadleaf", "TreeMaple", "TreeRedwood" }, 30, 52 },
}

-- A real (asset) tree standing on cf, turned at random; nil when the asset library is missing.
local function assetTree(parent: Instance, cf: CFrame, kind: string, r: Random): Model?
	local spec = TREES[kind]
	if not spec then
		return nil
	end
	local name = Rand.pick(r, spec[1])
	local height = Rand.range(r, spec[2], spec[3])
	local m = Assets.place(parent, "Nature", name, cf * CFrame.Angles(0, r:NextNumber() * math.pi * 2, 0), Assets.scaleFor("Nature", name, height))
	if m then
		m.Name = if kind == "bush" then "Bush" else "Tree"
	end
	return m
end

function Props.tree(parent: Instance, cf: CFrame, kind: string?, rng: Random?): Model
	local r = rng or Random.new()
	local k = kind or "oak"
	local real = assetTree(parent, cf, k, r)
	if real then
		return real
	end
	local m = B.model("Tree", parent)
	if k == "oak" or k == "birch" then
		local h = Rand.range(r, 6, 10)
		local trunkCol = if k == "birch" then Color3.fromRGB(226, 222, 210) else P.trunk
		B.cylY(m, cf * CFrame.new(0, h / 2, 0), h, Rand.range(r, 1.1, 1.8), trunkCol, M.Wood)
		-- a couple of branches
		for _ = 1, 2 do
			local a = r:NextNumber() * math.pi * 2
			B.cylY(m, cf * CFrame.new(0, h * 0.75, 0) * CFrame.Angles(0, a, math.rad(35)) * CFrame.new(0, 1.8, 0), 3.6, 0.6, trunkCol, M.Wood, noCollide())
		end
		local autumn = r:NextNumber() < 0.08
		local n = r:NextInteger(3, 5)
		local base = Rand.range(r, 9, 13)
		for _ = 1, n do
			local col = if autumn then Rand.pick(r, AUTUMN) else Rand.pick(r, GREENS)
			if k == "birch" then
				col = col:Lerp(Color3.fromRGB(170, 200, 90), 0.4)
			end
			local off = Vector3.new(Rand.range(r, -2.6, 2.6), Rand.range(r, -1, 2.2), Rand.range(r, -2.6, 2.6))
			local s = base * Rand.range(r, 0.6, 0.95)
			B.ellipsoid(m, cf * CFrame.new(0, h + base * 0.25, 0) * CFrame.new(off), Vector3.new(s, s * 0.82, s), col, M.LeafyGrass, noCollide())
		end
	elseif k == "pine" then
		local h = Rand.range(r, 5, 7)
		B.cylY(m, cf * CFrame.new(0, h / 2, 0), h, 1.2, P.trunk, M.Wood)
		local col = Color3.fromRGB(40, 86, 54):Lerp(Color3.fromRGB(60, 110, 60), r:NextNumber())
		local tiers = r:NextInteger(3, 4)
		local width = Rand.range(r, 10, 13)
		for i = 0, tiers - 1 do
			local w = width * (1 - i * 0.22)
			local y = h - 1 + i * width * 0.36
			B.spire(m, cf * CFrame.new(0, y + w * 0.4, 0) * CFrame.Angles(0, i * 0.7, 0), w, w * 0.8, col, M.LeafyGrass, noCollide())
		end
	elseif k == "palm" then
		local segs = 6
		local lean = Rand.range(r, -0.12, 0.12)
		local c = cf
		for i = 1, segs do
			c = c * CFrame.Angles(lean, 0, lean * 0.5) * CFrame.new(0, 2.2, 0)
			B.cylY(m, c, 2.4, 1.3 - i * 0.07, Color3.fromRGB(140, 110, 76), M.Wood, noCollide({ CanCollide = i <= 2 }))
		end
		local top = c * CFrame.new(0, 1.2, 0)
		B.ball(m, top, 1.8, Color3.fromRGB(120, 92, 60), M.Wood, noCollide())
		local leaves = r:NextInteger(7, 9)
		for i = 1, leaves do
			local a = (i / leaves) * math.pi * 2
			local leaf = top * CFrame.Angles(0, a, 0) * CFrame.Angles(math.rad(-20), 0, 0) * CFrame.new(0, 0, -4)
			B.box(m, leaf, Vector3.new(1.6, 0.25, 8), Rand.pick(r, GREENS), M.LeafyGrass, noCollide())
			B.box(m, leaf * CFrame.new(0, -0.6, -4.5) * CFrame.Angles(math.rad(-35), 0, 0), Vector3.new(1.2, 0.2, 3.4), Rand.pick(r, GREENS), M.LeafyGrass, noCollide())
		end
	elseif k == "cypress" then
		local h = Rand.range(r, 14, 20)
		B.cylY(m, cf * CFrame.new(0, 1.5, 0), 3, 1, P.trunk, M.Wood)
		B.ellipsoid(m, cf * CFrame.new(0, h / 2 + 1.5, 0), Vector3.new(4.2, h, 4.2), Color3.fromRGB(46, 84, 50), M.LeafyGrass, noCollide({ CanCollide = true }))
	else -- bush
		local n = r:NextInteger(2, 3)
		for _ = 1, n do
			local s = Rand.range(r, 3, 5)
			B.ellipsoid(m, cf * CFrame.new(Rand.range(r, -1.5, 1.5), s * 0.35, Rand.range(r, -1.5, 1.5)), Vector3.new(s, s * 0.75, s), Rand.pick(r, GREENS), M.LeafyGrass, noCollide())
		end
		if r:NextNumber() < 0.4 then
			local flower = Rand.pick(r, { Color3.fromRGB(240, 90, 120), Color3.fromRGB(250, 220, 80), Color3.fromRGB(240, 240, 250), Color3.fromRGB(180, 110, 220) })
			for _ = 1, 5 do
				B.ball(m, cf * CFrame.new(Rand.range(r, -2, 2), Rand.range(r, 1.6, 2.6), Rand.range(r, -2, 2)), 0.6, flower, M.SmoothPlastic, noCollide())
			end
		end
	end
	return m
end

local FLOWERS = { "FlowersA", "FlowersB", "FlowersC", "Marigold", "Shrub1", "Shrub2", "Shrub3", "Shrub4", "Shrub5", "Shrub6" }

function Props.flowerBed(parent: Instance, cf: CFrame, w: number, d: number, rng: Random?)
	local r = rng or Random.new()
	local m = B.model("FlowerBed", parent)
	B.box(m, cf * CFrame.new(0, 0.5, 0), Vector3.new(w, 1, d), Color3.fromRGB(150, 140, 125), M.Concrete)
	B.box(m, cf * CFrame.new(0, 0.95, 0), Vector3.new(w - 0.8, 0.2, d - 0.8), P.soil, M.Ground, noCollide())
	-- real flowers and shrubs when the asset library is there
	if Assets.get("Garden", "FlowersA") then
		local n = math.clamp(math.floor(w * d / 7), 2, 14)
		for _ = 1, n do
			local name = Rand.pick(r, FLOWERS)
			local p = cf * CFrame.new(Rand.range(r, -w / 2 + 1, w / 2 - 1), 1.05, Rand.range(r, -d / 2 + 1, d / 2 - 1)) * CFrame.Angles(0, r:NextNumber() * 6.28, 0)
			Assets.place(m, "Garden", name, p, Assets.scaleFor("Garden", name, Rand.range(r, 1.4, 2.4)))
		end
		return m
	end
	local cols = { Color3.fromRGB(230, 70, 90), Color3.fromRGB(250, 200, 60), Color3.fromRGB(240, 240, 250), Color3.fromRGB(170, 100, 220), Color3.fromRGB(250, 140, 60) }
	local n = math.floor(w * d / 6)
	for _ = 1, math.min(n, 18) do
		local p = cf * CFrame.new(Rand.range(r, -w / 2 + 1, w / 2 - 1), 1.4, Rand.range(r, -d / 2 + 1, d / 2 - 1))
		B.ellipsoid(m, p, Vector3.new(1.4, 0.9, 1.4), Rand.pick(r, GREENS), M.LeafyGrass, noCollide())
		B.ball(m, p * CFrame.new(0, 0.5, 0), 0.7, Rand.pick(r, cols), M.SmoothPlastic, noCollide())
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Street furniture
----------------------------------------------------------------------------------------------------
-- The parts of an asset that light up at night (marked "Bulb" by the asset library).
local function tagBulbs(m: Instance)
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") and d:GetAttribute("Bulb") then
			d.Material = M.Glass
			B.tag(d, "LampBulb")
			for _, l in d:GetDescendants() do
				if l:IsA("Light") then
					l.Enabled = false
				end
			end
		end
	end
end

function Props.streetLamp(parent: Instance, cf: CFrame, style: string?): Model
	local s = style or "modern"
	if s == "modern" then
		local real = Assets.place(parent, "CityProps", "StreetLight", cf, 0.62)
		if real then
			real.Name = "StreetLamp"
			tagBulbs(real)
			B.tag(real, "StreetLamp")
			return real
		end
	end
	local m = B.model("StreetLamp", parent)
	local dark = Color3.fromRGB(46, 50, 56)
	if s == "classic" then
		B.cylY(m, cf * CFrame.new(0, 0.6, 0), 1.2, 1.4, dark, M.Metal)
		B.cylY(m, cf * CFrame.new(0, 7, 0), 12, 0.55, dark, M.Metal)
		for side = -1, 1, 2 do
			local arm = cf * CFrame.new(side * 1.4, 12.6, 0)
			B.box(m, arm, Vector3.new(2.8, 0.25, 0.25), dark, M.Metal, noCollide())
			B.box(m, arm * CFrame.new(side * 1.3, -0.6, 0), Vector3.new(1.2, 0.3, 1.2), dark, M.Metal, noCollide())
			local bulb = B.box(m, arm * CFrame.new(side * 1.3, -1.4, 0), Vector3.new(0.9, 1.3, 0.9), Color3.fromRGB(255, 226, 170), M.Glass, noCollide({ Name = "Bulb", Transparency = 0.25 }))
			B.tag(bulb, "LampBulb")
			local l = B.pointLight(bulb, 34, 1.4, P.warmLight, false)
			l.Enabled = false
		end
		B.ball(m, cf * CFrame.new(0, 13.4, 0), 0.8, dark, M.Metal, noCollide())
	else
		B.cylY(m, cf * CFrame.new(0, 0.4, 0), 0.8, 1.3, Color3.fromRGB(80, 84, 90), M.Concrete)
		B.cylY(m, cf * CFrame.new(0, 8.5, 0), 16, 0.5, Color3.fromRGB(120, 126, 134), M.Metal)
		local arm = cf * CFrame.new(0, 16.3, -2.4)
		B.box(m, arm, Vector3.new(0.35, 0.35, 5), Color3.fromRGB(120, 126, 134), M.Metal, noCollide())
		local head = B.box(m, arm * CFrame.new(0, -0.25, -2.6), Vector3.new(1.6, 0.45, 2.6), Color3.fromRGB(70, 74, 80), M.Metal, noCollide())
		local bulb = B.box(m, head.CFrame * CFrame.new(0, -0.3, 0), Vector3.new(1.2, 0.12, 2.1), Color3.fromRGB(230, 236, 240), M.Glass, noCollide({ Name = "Bulb", Transparency = 0.1 }))
		B.tag(bulb, "LampBulb")
		local l = B.spotLight(bulb, Enum.NormalId.Bottom, 46, 110, 2.2, Color3.fromRGB(255, 236, 205), false)
		l.Enabled = false
	end
	B.tag(m, "StreetLamp")
	return m
end

function Props.bench(parent: Instance, cf: CFrame, color: any?): Model
	local m = B.model("Bench", parent)
	local wood = B.color(color or P.wood)
	local metal = Color3.fromRGB(40, 42, 46)
	for side = -1, 1, 2 do
		B.box(m, cf * CFrame.new(side * 2.4, 1, 0), Vector3.new(0.3, 2, 1.8), metal, M.Metal)
		B.box(m, cf * CFrame.new(side * 2.4, 2.4, 0.8), Vector3.new(0.3, 2.2, 0.3), metal, M.Metal)
	end
	for i = 0, 2 do
		B.box(m, cf * CFrame.new(0, 2.05, -0.6 + i * 0.6), Vector3.new(5.6, 0.18, 0.48), wood, M.Wood)
	end
	for i = 0, 1 do
		B.box(m, cf * CFrame.new(0, 2.9 + i * 0.6, 0.86) * CFrame.Angles(math.rad(-12), 0, 0), Vector3.new(5.6, 0.45, 0.16), wood, M.Wood)
	end
	local seat = Instance.new("Seat")
	seat.Name = "Seat"
	seat.Anchored = true
	seat.Transparency = 1
	seat.CanCollide = false
	seat.Size = Vector3.new(4, 0.4, 1.4)
	seat.CFrame = cf * CFrame.new(0, 2.25, 0)
	seat.Parent = m
	return m
end

function Props.bin(parent: Instance, cf: CFrame): Model
	local m = B.model("Bin", parent)
	B.cylY(m, cf * CFrame.new(0, 1.6, 0), 3.2, 1.8, Color3.fromRGB(60, 100, 70), M.Metal)
	B.cylY(m, cf * CFrame.new(0, 3.3, 0), 0.2, 2, Color3.fromRGB(40, 44, 48), M.Metal, noCollide())
	return m
end

function Props.hydrant(parent: Instance, cf: CFrame): Model
	local real = Assets.place(parent, "CityProps", "HydrantRed", cf, 1)
	if real then
		real.Name = "Hydrant"
		return real
	end
	local m = B.model("Hydrant", parent)
	local red = Color3.fromRGB(196, 40, 36)
	B.cylY(m, cf * CFrame.new(0, 1.1, 0), 2.2, 0.9, red, M.Metal)
	B.ball(m, cf * CFrame.new(0, 2.3, 0), 0.95, red, M.Metal, noCollide())
	B.cyl(m, cf * CFrame.new(0, 1.5, 0), 1.4, 0.4, Color3.fromRGB(220, 220, 220), M.Metal, noCollide())
	return m
end

function Props.planter(parent: Instance, cf: CFrame, rng: Random?): Model
	local r = rng or Random.new()
	local name = Rand.pick(r, { "PlanterSquare", "PlanterRound", "PlanterLong" })
	local real = Assets.place(parent, "CityProps", name, cf, Assets.scaleFor("CityProps", name, 2.6))
	if real then
		real.Name = "Planter"
		return real
	end
	local m = B.model("Planter", parent)
	B.box(m, cf * CFrame.new(0, 1, 0), Vector3.new(3.4, 2, 3.4), Color3.fromRGB(170, 160, 150), M.Concrete)
	B.box(m, cf * CFrame.new(0, 2.05, 0), Vector3.new(2.8, 0.2, 2.8), P.soil, M.Ground, noCollide())
	Props.tree(m, cf * CFrame.new(0, 2, 0), "bush", r)
	return m
end

local LAMP_COLORS = { Red = Color3.fromRGB(255, 50, 40), Amber = Color3.fromRGB(255, 180, 30), Green = Color3.fromRGB(40, 230, 90) }

function Props.trafficLight(parent: Instance, cf: CFrame, axis: string, nodeKey: string): Model
	local real = Assets.place(parent, "CityProps", "TrafficLightPole", cf, 0.62)
	if real then
		real.Name = "TrafficLight"
		-- the lenses sit at the top of the model as Red / Amber / Green for the signal cycle
		for _, d in real:GetDescendants() do
			if d:IsA("BasePart") and (d.Name == "Red" or d.Name == "Yellow" or d.Name == "Green") then
				d.Name = if d.Name == "Yellow" then "Amber" else d.Name
				d.Parent = real
				local on = LAMP_COLORS[d.Name]
				d:SetAttribute("OnColor", on)
				d.Color = on:Lerp(Color3.new(0, 0, 0), 0.75)
				d.Material = M.SmoothPlastic
			end
		end
		real:SetAttribute("Axis", axis)
		real:SetAttribute("Node", nodeKey)
		B.tag(real, "TrafficLight")
		return real
	end
	local m = B.model("TrafficLight", parent)
	local dark = Color3.fromRGB(36, 38, 42)
	B.cylY(m, cf * CFrame.new(0, 6, 0), 12, 0.5, dark, M.Metal)
	local box = B.box(m, cf * CFrame.new(0, 10.4, -0.5), Vector3.new(1.3, 3.6, 1), dark, M.Metal, noCollide())
	B.box(m, box.CFrame * CFrame.new(0, 1.9, -0.3), Vector3.new(1.5, 0.15, 1.2), dark, M.Metal, noCollide())
	local names = { "Red", "Amber", "Green" }
	local cols = { Color3.fromRGB(255, 50, 40), Color3.fromRGB(255, 180, 30), Color3.fromRGB(40, 230, 90) }
	for i = 1, 3 do
		local lamp = B.cyl(m, box.CFrame * CFrame.new(0, 1.1 - (i - 1) * 1.1, -0.52) * CFrame.Angles(0, math.pi / 2, 0), 0.12, 0.8, cols[i]:Lerp(Color3.new(0, 0, 0), 0.75), M.SmoothPlastic, noCollide({ Name = names[i] }))
		lamp:SetAttribute("OnColor", cols[i])
	end
	m:SetAttribute("Axis", axis)
	m:SetAttribute("Node", nodeKey)
	B.tag(m, "TrafficLight")
	return m
end

function Props.busStop(parent: Instance, cf: CFrame, name: string): Model
	local frame = Color3.fromRGB(60, 70, 84)
	local real = Assets.place(parent, "CityProps", "BusStop", cf * CFrame.new(0, 0, 1), 0.62)
	if real then
		real.Name = "BusStop"
		-- the stop's name over the shelter and the bus sign on its pole
		local label = B.box(real, cf * CFrame.new(0, 9.2, -1.2), Vector3.new(8, 1, 0.2), Color3.fromRGB(30, 40, 60), M.SmoothPlastic, noCollide())
		B.sign(label, Enum.NormalId.Front, "DURAK • " .. name, { color = Color3.fromRGB(255, 255, 255) })
		local pole = B.cylY(real, cf * CFrame.new(-8.6, 5, -1.5), 10, 0.35, frame, M.Metal)
		local plate = B.box(real, pole.CFrame * CFrame.new(4.6, 0, 0) * CFrame.Angles(0, 0, -math.pi / 2), Vector3.new(2.6, 0.2, 2.6), Color3.fromRGB(240, 200, 40), M.SmoothPlastic, noCollide())
		B.sign(plate, Enum.NormalId.Top, "🚌", { color = Color3.fromRGB(30, 30, 30) })
		return real
	end
	local m = B.model("BusStop", parent)
	B.box(m, cf * CFrame.new(0, 0.15, 0), Vector3.new(12, 0.3, 5), Color3.fromRGB(150, 150, 150), M.Concrete)
	for _, x in { -5.6, 5.6 } do
		B.box(m, cf * CFrame.new(x, 4.2, 1.8), Vector3.new(0.4, 8.4, 0.4), frame, M.Metal)
	end
	B.box(m, cf * CFrame.new(0, 8.5, 0.6), Vector3.new(12.6, 0.4, 4.6), frame, M.Metal)
	B.box(m, cf * CFrame.new(0, 4.4, 2.1), Vector3.new(11, 7, 0.2), P.glass, M.Glass, { Transparency = 0.6 })
	B.box(m, cf * CFrame.new(-5.8, 4.4, 0.4), Vector3.new(0.2, 7, 3.2), P.glass, M.Glass, { Transparency = 0.6 })
	local ad = B.box(m, cf * CFrame.new(5.8, 4.4, 0.4), Vector3.new(0.3, 6, 3), Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
	B.sign(ad, Enum.NormalId.Left, "RTX 5090\nMega Parça'da!", { background = Color3.fromRGB(20, 24, 30), color = Color3.fromRGB(120, 230, 255), glow = true })
	Props.bench(m, cf * CFrame.new(0, 0.3, 1))
	local pole = B.cylY(m, cf * CFrame.new(-7.5, 5, -1.5), 10, 0.35, frame, M.Metal)
	local plate = B.box(m, pole.CFrame * CFrame.new(4.6, 0, 0) * CFrame.Angles(0, 0, -math.pi / 2), Vector3.new(2.6, 0.2, 2.6), Color3.fromRGB(240, 200, 40), M.SmoothPlastic, noCollide())
	B.sign(plate, Enum.NormalId.Top, "🚌", { color = Color3.fromRGB(30, 30, 30) })
	local label = B.box(m, cf * CFrame.new(0, 9.1, -1.7), Vector3.new(8, 1, 0.2), Color3.fromRGB(30, 40, 60), M.SmoothPlastic, noCollide())
	B.sign(label, Enum.NormalId.Front, "DURAK • " .. name, { color = Color3.fromRGB(255, 255, 255) })
	return m
end

function Props.streetSign(parent: Instance, cf: CFrame, text: string): Model
	local m = B.model("StreetSign", parent)
	B.cylY(m, cf * CFrame.new(0, 5, 0), 10, 0.3, Color3.fromRGB(90, 94, 100), M.Metal)
	local plate = B.box(m, cf * CFrame.new(0, 9.6, 0), Vector3.new(7, 1.1, 0.15), Color3.fromRGB(28, 60, 140), M.SmoothPlastic, noCollide())
	B.sign(plate, Enum.NormalId.Front, text, { color = Color3.new(1, 1, 1), font = B.Fonts.Bold })
	B.sign(plate, Enum.NormalId.Back, text, { color = Color3.new(1, 1, 1), font = B.Fonts.Bold, name = "SignBack" })
	return m
end

function Props.billboard(parent: Instance, cf: CFrame, title: string, sub: string, color: any?): Model
	local m = B.model("Billboard", parent)
	local dark = Color3.fromRGB(50, 54, 60)
	for _, x in { -7, 7 } do
		B.box(m, cf * CFrame.new(x, 9, 0), Vector3.new(0.8, 18, 0.8), dark, M.Metal)
	end
	local board = B.box(m, cf * CFrame.new(0, 22, 0), Vector3.new(26, 11, 0.8), Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
	B.sign(board, Enum.NormalId.Front, "<b>" .. title .. "</b>\n<font size=\"20\">" .. sub .. "</font>", { rich = true, background = B.color(color or Color3.fromRGB(20, 30, 50)), color = Color3.new(1, 1, 1), glow = true, brightness = 1.4 })
	B.box(m, cf * CFrame.new(0, 16.2, -1), Vector3.new(26, 0.3, 2), dark, M.Metal, noCollide())
	return m
end

function Props.flag(parent: Instance, cf: CFrame, height: number?): Model
	local m = B.model("Flag", parent)
	local h = height or 22
	B.cylY(m, cf * CFrame.new(0, h / 2, 0), h, 0.45, Color3.fromRGB(220, 220, 225), M.Metal)
	B.ball(m, cf * CFrame.new(0, h + 0.3, 0), 0.8, Color3.fromRGB(230, 200, 80), M.Metal, noCollide())
	local cloth = B.box(m, cf * CFrame.new(3.4, h - 2.3, 0), Vector3.new(6.6, 4.4, 0.1), Color3.fromRGB(227, 10, 23), M.Fabric, noCollide({ Name = "Cloth" }))
	B.sign(cloth, Enum.NormalId.Front, "☾★", { color = Color3.new(1, 1, 1), padding = 0.12 })
	B.sign(cloth, Enum.NormalId.Back, "★☽", { color = Color3.new(1, 1, 1), padding = 0.12, name = "SignBack" })
	B.tag(cloth, "FlagCloth")
	return m
end

function Props.parasolTable(parent: Instance, cf: CFrame, color: any?, rng: Random?): Model
	local r = rng or Random.new()
	local m = B.model("CafeTable", parent)
	local col = B.color(color or Rand.pick(r, { { 220, 60, 60 }, { 240, 240, 236 }, { 40, 120, 180 }, { 240, 180, 40 }, { 60, 140, 90 } }))
	B.cylY(m, cf * CFrame.new(0, 1.4, 0), 2.8, 0.25, Color3.fromRGB(60, 60, 60), M.Metal)
	B.cylY(m, cf * CFrame.new(0, 2.85, 0), 0.15, 3.2, Color3.fromRGB(240, 240, 236), M.SmoothPlastic)
	B.cylY(m, cf * CFrame.new(0, 5.5, 0), 5.5, 0.2, Color3.fromRGB(220, 220, 220), M.Metal, noCollide())
	B.spire(m, cf * CFrame.new(0, 8.6, 0) * CFrame.Angles(0, math.pi / 4, 0), 8.5, 1.6, col, M.Fabric, noCollide())
	for i = 0, 1 do
		local a = i * math.pi
		local c = cf * CFrame.Angles(0, a, 0) * CFrame.new(0, 0, -2.6)
		B.box(m, c * CFrame.new(0, 1.6, 0), Vector3.new(1.6, 0.2, 1.6), Color3.fromRGB(130, 90, 60), M.Wood)
		B.box(m, c * CFrame.new(0, 0.8, 0), Vector3.new(0.2, 1.6, 0.2), Color3.fromRGB(40, 40, 40), M.Metal, noCollide())
		B.box(m, c * CFrame.new(0, 2.6, -0.75), Vector3.new(1.6, 1.8, 0.15), Color3.fromRGB(130, 90, 60), M.Wood, noCollide())
	end
	return m
end

function Props.simitCart(parent: Instance, cf: CFrame): Model
	local m = B.model("SimitCart", parent)
	local red = Color3.fromRGB(200, 40, 40)
	B.box(m, cf * CFrame.new(0, 2.6, 0), Vector3.new(4, 1.6, 2.6), red, M.Metal)
	B.box(m, cf * CFrame.new(0, 4.3, 0), Vector3.new(3.8, 1.8, 2.4), Color3.fromRGB(220, 230, 235), M.Glass, { Transparency = 0.45 })
	B.box(m, cf * CFrame.new(0, 5.35, 0), Vector3.new(4.2, 0.3, 2.8), red, M.Metal)
	for i = -1, 1 do
		B.cylY(m, cf * CFrame.new(i * 1.1, 3.75, 0) * CFrame.Angles(0, 0, math.rad(90)), 0.4, 1.1, Color3.fromRGB(196, 140, 80), M.Sand, noCollide())
	end
	for side = -1, 1, 2 do
		B.cyl(m, cf * CFrame.new(side * 1.6, 0.8, 1.3), 0.3, 1.6, Color3.fromRGB(30, 30, 30), M.Rubber)
	end
	local sign = B.box(m, cf * CFrame.new(0, 6.2, 0), Vector3.new(3.6, 1.2, 0.2), Color3.fromRGB(250, 220, 120), M.SmoothPlastic, noCollide())
	B.sign(sign, Enum.NormalId.Front, "SİMİT • POĞAÇA", { color = red })
	return m
end

function Props.newsKiosk(parent: Instance, cf: CFrame): Model
	local m = B.model("Kiosk", parent)
	B.box(m, cf * CFrame.new(0, 4, 0), Vector3.new(7, 8, 5), Color3.fromRGB(30, 90, 60), M.Metal)
	B.box(m, cf * CFrame.new(0, 8.3, -0.6), Vector3.new(8, 0.6, 6.6), Color3.fromRGB(240, 200, 60), M.SmoothPlastic)
	local win = B.box(m, cf * CFrame.new(0, 4.6, -2.55), Vector3.new(5.6, 3.6, 0.1), Color3.fromRGB(240, 240, 230), M.SmoothPlastic, noCollide())
	B.sign(win, Enum.NormalId.Front, "GAZETE • DERGİ\nBİLET • SU", { color = Color3.fromRGB(30, 30, 30), background = Color3.fromRGB(250, 248, 240) })
	return m
end

function Props.atm(parent: Instance, cf: CFrame): Model
	local m = B.model("ATM", parent)
	B.box(m, cf * CFrame.new(0, 3, 0), Vector3.new(3, 6, 2), Color3.fromRGB(40, 70, 130), M.Metal)
	local screen = B.box(m, cf * CFrame.new(0, 4.2, -1.02), Vector3.new(2, 1.4, 0.05), Color3.fromRGB(20, 30, 40), M.Glass, noCollide())
	B.sign(screen, Enum.NormalId.Front, "ATM", { glow = true, color = Color3.fromRGB(120, 220, 255), background = Color3.fromRGB(10, 20, 40) })
	return m
end

function Props.mailbox(parent: Instance, cf: CFrame): Model
	local m = B.model("Mailbox", parent)
	local yellow = Color3.fromRGB(250, 205, 30)
	B.box(m, cf * CFrame.new(0, 2, 0), Vector3.new(0.4, 4, 0.4), Color3.fromRGB(40, 40, 40), M.Metal)
	B.box(m, cf * CFrame.new(0, 4.7, 0), Vector3.new(2.2, 2.6, 1.8), yellow, M.Metal)
	local face = B.box(m, cf * CFrame.new(0, 4.9, -0.95), Vector3.new(1.8, 1, 0.05), yellow, M.SmoothPlastic, noCollide())
	B.sign(face, Enum.NormalId.Front, "PTT", { color = Color3.fromRGB(20, 40, 120), font = B.Fonts.Heavy })
	return m
end

function Props.fence(parent: Instance, a: Vector3, b: Vector3, style: string?, height: number?): Model
	local m = B.model("Fence", parent)
	local h = height or 3.2
	local dir = b - a
	local len = dir.Magnitude
	if len < 0.5 then
		return m
	end
	local cf = CFrame.lookAt(a, b) * CFrame.new(0, 0, -len / 2)
	local s = style or "wood"
	if s == "wood" then
		local col = Color3.fromRGB(236, 230, 214)
		B.box(m, cf * CFrame.new(0, h * 0.75, 0), Vector3.new(0.2, 0.35, len), col, M.Wood)
		B.box(m, cf * CFrame.new(0, h * 0.35, 0), Vector3.new(0.2, 0.35, len), col, M.Wood)
		local posts = math.max(2, math.floor(len / 1.4))
		for i = 0, posts do
			local z = -len / 2 + len * i / posts
			B.box(m, cf * CFrame.new(0, h / 2, z), Vector3.new(0.3, h, 0.5), col, M.Wood)
		end
	elseif s == "metal" then
		local col = Color3.fromRGB(50, 54, 60)
		B.box(m, cf * CFrame.new(0, h - 0.2, 0), Vector3.new(0.2, 0.2, len), col, M.Metal)
		B.box(m, cf * CFrame.new(0, 0.4, 0), Vector3.new(0.2, 0.2, len), col, M.Metal)
		local bars = math.max(2, math.floor(len / 0.8))
		for i = 0, bars do
			local z = -len / 2 + len * i / bars
			B.box(m, cf * CFrame.new(0, h / 2, z), Vector3.new(0.12, h, 0.12), col, M.Metal, noCollide())
		end
		B.box(m, cf * CFrame.new(0, h / 2, 0), Vector3.new(0.1, h, len), col, M.Metal, { Transparency = 1 })
	elseif s == "chain" then
		local col = Color3.fromRGB(150, 155, 160)
		B.box(m, cf * CFrame.new(0, h / 2, 0), Vector3.new(0.1, h, len), col, M.DiamondPlate, { Transparency = 0.55 })
		local posts = math.max(2, math.floor(len / 8))
		for i = 0, posts do
			B.cylY(m, cf * CFrame.new(0, h / 2, -len / 2 + len * i / posts), h, 0.3, col, M.Metal)
		end
	elseif s == "hedge" then
		B.box(m, cf * CFrame.new(0, h / 2, 0), Vector3.new(2, h, len), Color3.fromRGB(70, 116, 58), M.LeafyGrass)
	else -- low wall
		B.box(m, cf * CFrame.new(0, h / 2, 0), Vector3.new(0.8, h, len), Color3.fromRGB(200, 190, 175), M.Brick)
		B.box(m, cf * CFrame.new(0, h + 0.15, 0), Vector3.new(1.1, 0.3, len), Color3.fromRGB(220, 214, 200), M.Concrete)
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Industrial / harbour
----------------------------------------------------------------------------------------------------
local CONTAINER_COLORS = { { 190, 50, 40 }, { 30, 90, 160 }, { 40, 130, 80 }, { 230, 150, 30 }, { 120, 120, 125 }, { 150, 70, 120 }, { 230, 230, 225 } }
local CONTAINER_LABELS = { "MARMARA LINE", "EGE KARGO", "BOSPHORUS", "TRANSKON", "YILDIZ SHIP", "ANADOLU LOG", "MAVI DENIZ" }
function Props.container(parent: Instance, cf: CFrame, rng: Random?): BasePart
	local r = rng or Random.new()
	local i = r:NextInteger(1, #CONTAINER_COLORS)
	local col = B.color(CONTAINER_COLORS[i])
	local c = B.box(parent, cf * CFrame.new(0, 4.3, 0), Vector3.new(8.6, 8.6, 34), col, M.DiamondPlate)
	B.box(parent, cf * CFrame.new(0, 4.3, -17.05), Vector3.new(8, 8, 0.15), col:Lerp(Color3.new(0, 0, 0), 0.15), M.CorrodedMetal, noCollide())
	B.sign(c, Enum.NormalId.Right, CONTAINER_LABELS[i], { color = Color3.new(1, 1, 1), pixelsPerStud = 10 })
	return c
end

function Props.crate(parent: Instance, cf: CFrame, size: number?): BasePart
	local s = size or 3
	return B.box(parent, cf * CFrame.new(0, s / 2, 0), Vector3.new(s, s, s), Color3.fromRGB(170, 130, 86), M.WoodPlanks)
end

function Props.pallet(parent: Instance, cf: CFrame): Model
	local m = B.model("Pallet", parent)
	B.box(m, cf * CFrame.new(0, 0.3, 0), Vector3.new(4, 0.6, 4), Color3.fromRGB(180, 140, 96), M.WoodPlanks)
	for i = 1, 3 do
		B.box(m, cf * CFrame.new((i % 2) * 0.4 - 0.2, 0.6 + i * 1.1 - 0.5, ((i + 1) % 2) * 0.4 - 0.2), Vector3.new(2.6, 1, 2.2), Color3.fromRGB(196, 170, 120), M.Cardboard)
	end
	return m
end

function Props.barrel(parent: Instance, cf: CFrame, color: any?): BasePart
	return B.cylY(parent, cf * CFrame.new(0, 2, 0), 4, 2.6, B.color(color or { 40, 90, 160 }), M.Metal)
end

function Props.boat(parent: Instance, cf: CFrame, color: any?, rng: Random?): Model
	local r = rng or Random.new()
	local m = B.model("Boat", parent)
	local hull = B.color(color or Rand.pick(r, { { 240, 240, 236 }, { 40, 90, 150 }, { 200, 60, 50 }, { 60, 140, 110 } }))
	B.box(m, cf * CFrame.new(0, 1.4, 0), Vector3.new(6, 2.4, 14), hull, M.WoodPlanks)
	B.wedge(m, cf * CFrame.new(0, 1.4, -9), Vector3.new(6, 2.4, 4), hull, M.WoodPlanks)
	B.box(m, cf * CFrame.new(0, 2.7, 0), Vector3.new(5.4, 0.2, 13.4), Color3.fromRGB(160, 120, 80), M.WoodPlanks)
	B.box(m, cf * CFrame.new(0, 4, 3), Vector3.new(3.6, 2.4, 3.6), Color3.fromRGB(240, 240, 236), M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 4.4, 1.15), Vector3.new(3, 1, 0.1), Color3.fromRGB(120, 170, 200), M.Glass, noCollide({ Transparency = 0.4 }))
	B.cylY(m, cf * CFrame.new(0, 7, -2), 9, 0.25, Color3.fromRGB(200, 200, 200), M.Metal, noCollide())
	return m
end

----------------------------------------------------------------------------------------------------
-- Interior bits
----------------------------------------------------------------------------------------------------
function Props.chair(parent: Instance, cf: CFrame, color: any?): Model
	local m = B.model("Chair", parent)
	local col = B.color(color or { 40, 44, 50 })
	B.box(m, cf * CFrame.new(0, 1.7, 0), Vector3.new(1.8, 0.3, 1.8), col, M.Fabric)
	B.box(m, cf * CFrame.new(0, 2.9, 0.82), Vector3.new(1.8, 2.2, 0.25), col, M.Fabric)
	for x = -1, 1, 2 do
		for z = -1, 1, 2 do
			B.box(m, cf * CFrame.new(x * 0.75, 0.8, z * 0.75), Vector3.new(0.18, 1.6, 0.18), Color3.fromRGB(150, 150, 155), M.Metal, noCollide())
		end
	end
	local seat = Instance.new("Seat")
	seat.Name = "Seat"
	seat.Anchored = true
	seat.Transparency = 1
	seat.CanCollide = false
	seat.Size = Vector3.new(1.6, 0.3, 1.6)
	seat.CFrame = cf * CFrame.new(0, 1.9, 0)
	seat.Parent = m
	return m
end

local POTS = { "PotDracaena", "PotRubber", "PotSnake", "PotFern", "PotEvergreen", "PotDoor", "PotTall", "PotBanana" }

function Props.plant(parent: Instance, cf: CFrame, rng: Random?): Model
	local r = rng or Random.new()
	local name = Rand.pick(r, POTS)
	-- as tall as a person's shoulder at most, and no wider than the old pot (1.9 studs)
	local size = Assets.size("Garden", name)
	local scale = Assets.scaleFor("Garden", name, Rand.range(r, 3.6, 5.2))
	if size then
		scale = math.min(scale, 1.9 / math.max(size.X, size.Z))
	end
	local real = Assets.place(parent, "Garden", name, cf * CFrame.Angles(0, r:NextInteger(0, 3) * math.pi / 2, 0), scale)
	if real then
		real.Name = "Plant"
		return real
	end
	local m = B.model("Plant", parent)
	B.cylY(m, cf * CFrame.new(0, 0.9, 0), 1.8, 1.6, Rand.pick(r, { Color3.fromRGB(200, 120, 80), Color3.fromRGB(240, 240, 236), Color3.fromRGB(40, 40, 44) }), M.Slate)
	for i = 1, 5 do
		local a = i * 1.3
		B.ellipsoid(m, cf * CFrame.new(math.cos(a) * 0.5, 2.6 + i * 0.25, math.sin(a) * 0.5) * CFrame.Angles(math.cos(a) * 0.5, a, 0), Vector3.new(0.9, 2.6, 0.4), Rand.pick(r, GREENS), M.LeafyGrass, noCollide())
	end
	return m
end

function Props.shelf(parent: Instance, cf: CFrame, w: number, h: number, depth: number, rng: Random?, fill: number?): Model
	local r = rng or Random.new()
	local m = B.model("Shelf", parent)
	local metal = Color3.fromRGB(70, 74, 80)
	for x = -1, 1, 2 do
		B.box(m, cf * CFrame.new(x * (w / 2 - 0.15), h / 2, 0), Vector3.new(0.3, h, depth), metal, M.Metal)
	end
	local levels = math.max(2, math.floor(h / 2.4))
	local boxCols = { Color3.fromRGB(30, 30, 34), Color3.fromRGB(200, 40, 40), Color3.fromRGB(240, 240, 240), Color3.fromRGB(40, 110, 200), Color3.fromRGB(120, 190, 60), Color3.fromRGB(240, 160, 30) }
	for i = 0, levels do
		local y = 0.3 + i * (h - 0.4) / levels
		B.box(m, cf * CFrame.new(0, y, 0), Vector3.new(w, 0.2, depth), metal, M.Metal)
		if i < levels then
			local x = -w / 2 + 0.6
			while x < w / 2 - 1 do
				if r:NextNumber() < (fill or 0.75) then
					local bw = Rand.range(r, 0.9, 1.8)
					local bh = Rand.range(r, 0.8, 1.6)
					local box = B.box(m, cf * CFrame.new(x + bw / 2, y + 0.1 + bh / 2, Rand.range(r, -0.2, 0.2)), Vector3.new(bw, bh, depth * 0.8), Rand.pick(r, boxCols), M.Cardboard, noCollide({ CastShadow = false }))
					box:AddTag("ShelfBox")
					x += bw + 0.15
				else
					x += 1.2
				end
			end
		end
	end
	return m
end

function Props.monitor(parent: Instance, cf: CFrame, text: string?, glow: Color3?): Model
	local m = B.model("Monitor", parent)
	local dark = Color3.fromRGB(20, 20, 24)
	B.box(m, cf * CFrame.new(0, 0.08, 0.2), Vector3.new(1.6, 0.16, 1), dark, M.Metal)
	B.box(m, cf * CFrame.new(0, 0.9, 0.35), Vector3.new(0.25, 1.6, 0.25), dark, M.Metal, noCollide())
	local screen = B.box(m, cf * CFrame.new(0, 1.9, 0.15), Vector3.new(3.4, 2, 0.15), dark, M.SmoothPlastic, noCollide({ Name = "Screen" }))
	B.sign(screen, Enum.NormalId.Front, text or "", { name = "ScreenGui", glow = true, brightness = 1.2, color = Color3.fromRGB(220, 240, 255), background = glow or Color3.fromRGB(16, 40, 80), font = B.Fonts.Mono })
	return m
end

function Props.counter(parent: Instance, cf: CFrame, w: number, color: any?, top: any?): Model
	local m = B.model("Counter", parent)
	B.box(m, cf * CFrame.new(0, 1.9, 0), Vector3.new(w, 3.8, 2.6), B.color(color or { 230, 230, 228 }), M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 3.9, -0.1), Vector3.new(w + 0.4, 0.2, 3), B.color(top or { 60, 60, 66 }), M.Marble)
	B.box(m, cf * CFrame.new(0, 0.3, -1.25), Vector3.new(w - 0.4, 0.6, 0.15), Color3.fromRGB(0, 170, 220), M.Neon, noCollide())
	return m
end

function Props.coffeeMachine(parent: Instance, cf: CFrame): Model
	local m = B.model("CoffeeMachine", parent)
	B.box(m, cf * CFrame.new(0, 1, 0), Vector3.new(1.6, 2, 1.4), Color3.fromRGB(180, 180, 186), M.Metal)
	B.box(m, cf * CFrame.new(0, 0.45, -0.6), Vector3.new(0.9, 0.2, 0.4), Color3.fromRGB(40, 40, 40), M.Metal, noCollide())
	B.cylY(m, cf * CFrame.new(0, 0.75, -0.55), 0.4, 0.5, Color3.fromRGB(250, 250, 250), M.SmoothPlastic, noCollide())
	return m
end

function Props.samovar(parent: Instance, cf: CFrame): Model
	local m = B.model("Samovar", parent)
	local brass = Color3.fromRGB(196, 150, 70)
	B.cylY(m, cf * CFrame.new(0, 0.9, 0), 1.8, 1.4, brass, M.Metal)
	B.cylY(m, cf * CFrame.new(0, 2.1, 0), 0.6, 0.9, Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
	B.cylY(m, cf * CFrame.new(0, 2.5, 0), 0.4, 0.5, Color3.fromRGB(150, 50, 40), M.SmoothPlastic)
	for i = 1, 4 do
		local a = i * math.pi / 2
		B.cylY(m, cf * CFrame.new(math.cos(a) * 1.3, 0.35, math.sin(a) * 1.3), 0.7, 0.4, Color3.fromRGB(240, 240, 240), M.Glass, noCollide({ Transparency = 0.3 }))
	end
	return m
end

function Props.aquarium(parent: Instance, cf: CFrame, rng: Random?): Model
	local r = rng or Random.new()
	local m = B.model("Aquarium", parent)
	B.box(m, cf * CFrame.new(0, 1.5, 0), Vector3.new(6, 3, 2.2), Color3.fromRGB(40, 36, 32), M.Wood)
	B.box(m, cf * CFrame.new(0, 4.3, 0), Vector3.new(6, 2.6, 2), Color3.fromRGB(90, 170, 210), M.Glass, { Transparency = 0.55 })
	B.box(m, cf * CFrame.new(0, 3.2, 0), Vector3.new(5.8, 0.3, 1.8), Color3.fromRGB(220, 200, 150), M.Sand, noCollide())
	for _ = 1, 5 do
		local fish = B.ellipsoid(m, cf * CFrame.new(Rand.range(r, -2.4, 2.4), Rand.range(r, 3.8, 5), Rand.range(r, -0.6, 0.6)), Vector3.new(0.6, 0.35, 0.2), Rand.pick(r, { Color3.fromRGB(255, 140, 30), Color3.fromRGB(250, 220, 60), Color3.fromRGB(80, 160, 250) }), M.SmoothPlastic, noCollide())
		fish:AddTag("Fish")
	end
	B.surfaceLight(B.box(m, cf * CFrame.new(0, 5.7, 0), Vector3.new(6, 0.2, 2.2), Color3.fromRGB(40, 36, 32), M.Wood), Enum.NormalId.Bottom, 6, 90, 1.5, Color3.fromRGB(150, 220, 255))
	return m
end

function Props.arcade(parent: Instance, cf: CFrame): Model
	local m = B.model("Arcade", parent)
	B.box(m, cf * CFrame.new(0, 3, 0), Vector3.new(2.6, 6, 2.4), Color3.fromRGB(30, 30, 80), M.SmoothPlastic)
	local screen = B.box(m, cf * CFrame.new(0, 4, -1.1) * CFrame.Angles(math.rad(-12), 0, 0), Vector3.new(2, 1.6, 0.1), Color3.fromRGB(10, 10, 10), M.Glass, noCollide())
	B.sign(screen, Enum.NormalId.Front, "INSERT COIN", { glow = true, color = Color3.fromRGB(255, 240, 80), background = Color3.fromRGB(10, 10, 30), font = B.Fonts.Mono })
	local marquee = B.box(m, cf * CFrame.new(0, 5.6, -1.05), Vector3.new(2.4, 0.6, 0.1), Color3.fromRGB(240, 60, 120), M.Neon, noCollide())
	B.sign(marquee, Enum.NormalId.Front, "PAC-TAMİRCİ", { color = Color3.new(1, 1, 1) })
	return m
end

function Props.tv(parent: Instance, cf: CFrame, text: string): Model
	local m = B.model("TV", parent)
	local frame = B.box(m, cf, Vector3.new(7, 4, 0.3), Color3.fromRGB(18, 18, 20), M.SmoothPlastic, noCollide())
	B.sign(frame, Enum.NormalId.Front, text, { glow = true, color = Color3.new(1, 1, 1), background = Color3.fromRGB(20, 60, 110), rich = true })
	frame:AddTag("WaitingTV")
	return m
end

return Props
