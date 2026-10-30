-- Commerce landmarks: every shop, market and dealer the player visits, plus food places and other
-- businesses that fill the commercial streets. Service counters are tagged "ServicePoint" with
-- attributes Service / Poi / ClerkCF so the gameplay services can hook them up.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Props = require(Shared.Models.Props)
local Buildings = require(Shared.Models.Buildings)
local CityLayout = require(Shared.World.CityLayout)

local Commerce = {}
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

-- Front-centre frame of a POI site, facing its street.
function Commerce.siteFrame(poi, inset: number?)
	local s = poi.site
	local look = if s.face == "s" then Vector3.new(0, 0, 1) else Vector3.new(0, 0, -1)
	local z = if s.face == "s" then s.z1 else s.z0
	local p = Vector3.new((s.x0 + s.x1) / 2, WALK_Y, z - look.Z * (inset or 0))
	return CFrame.lookAt(p, p + look), s.x1 - s.x0, s.z1 - s.z0
end

-- Counter with a prompt that opens a gameplay service.
function Commerce.servicePoint(parent: Instance, cf: CFrame, service: string, poiId: string, action: string, object: string?, width: number?)
	local counter = Props.counter(parent, cf, width or 9)
	local anchor = B.marker(counter, "ServiceAnchor", cf * CFrame.new(0, 3.2, -2.2), Vector3.new(6, 6, 2))
	anchor:SetAttribute("Service", service)
	anchor:SetAttribute("Poi", poiId)
	anchor:SetAttribute("ClerkCF", cf * CFrame.new(0, 0, 3))
	B.prompt(anchor, action, object, { distance = 14, name = "ServicePrompt" })
	B.tag(anchor, "ServicePoint")
	-- a cash register and a monitor on the counter
	Props.monitor(counter, cf * CFrame.new(-(width or 9) / 2 + 2, 4, 0.2), "", Color3.fromRGB(12, 40, 70))
	B.box(counter, cf * CFrame.new((width or 9) / 2 - 2, 4.5, 0.3), Vector3.new(1.8, 1, 1.4), Color3.fromRGB(30, 30, 34), M.SmoothPlastic, nc())
	return anchor
end

-- A clerk-less "talk" spot (staff agency desk, police front desk...).
local function deskRow(parent: Instance, cf: CFrame, n: number, rng: Random)
	for i = 1, n do
		local c = cf * CFrame.new((i - (n + 1) / 2) * 8, 0, 0)
		B.box(parent, c * CFrame.new(0, 1.8, 0), Vector3.new(6, 0.3, 3.2), Color3.fromRGB(150, 110, 80), M.Wood)
		for x = -1, 1, 2 do
			B.box(parent, c * CFrame.new(x * 2.7, 0.9, 0), Vector3.new(0.3, 1.8, 3), Color3.fromRGB(60, 60, 64), M.Metal)
		end
		Props.monitor(parent, c * CFrame.new(0, 1.95, 0.6), "", Color3.fromRGB(20, 50, 90))
		Props.chair(parent, c * CFrame.new(0, 0, 2.4) * CFrame.Angles(0, math.pi, 0), Rand.pick(rng, { { 40, 40, 44 }, { 30, 60, 120 } }))
	end
end

----------------------------------------------------------------------------------------------------
-- Parts megastore
----------------------------------------------------------------------------------------------------
local function megastore(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 6)
	local hw, hd, hh = w - 12, d - 14, 22
	local m, _pts = Buildings.hall(parent, cf, hw, hd, hh, { name = "MEGA PARTS DEPOT", accent = { 0, 140, 210 }, wall = { 230, 232, 236 }, floor = { 70, 74, 82 }, floorMat = M.SmoothPlastic, door = 12, modelName = "Megastore" })
	-- product aisles
	local aisles = math.floor((hw - 20) / 12)
	for i = 0, aisles - 1 do
		local x = -hw / 2 + 12 + i * 12
		for z = 14, hd - 22, 16 do
			Props.shelf(m, cf * CFrame.new(x, 0.2, z) * CFrame.Angles(0, math.pi / 2, 0), 14, 12, 3, rng, 0.9)
		end
		-- aisle sign hung on rods from the ceiling
		local sign = B.box(m, cf * CFrame.new(x, hh - 4, hd / 2), Vector3.new(0.4, 2.4, 8), Color3.fromRGB(0, 120, 190), M.SmoothPlastic, nc())
		for k = -1, 1, 2 do
			B.box(m, cf * CFrame.new(x, (hh - 2.8 + hh - 0.15) / 2, hd / 2 + k * 3), Vector3.new(0.1, 2.75, 0.1), Color3.fromRGB(150, 150, 156), M.Metal, nc())
		end
		B.sign(sign, Enum.NormalId.Right, ({ "GRAPHICS CARDS", "PROCESSORS", "MOTHERBOARDS", "RAM", "SSD / HDD", "POWER SUPPLIES", "COOLING", "CASES", "FANS", "ACCESSORIES" })[(i % 10) + 1], { color = Color3.new(1, 1, 1) })
	end
	-- GPU showcase island near the door
	local island = cf * CFrame.new(-hw / 4, 0.2, 12)
	B.box(m, island * CFrame.new(0, 1.6, 0), Vector3.new(14, 3.2, 6), Color3.fromRGB(30, 30, 34), M.SmoothPlastic)
	B.box(m, island * CFrame.new(0, 3.3, 0), Vector3.new(13.6, 0.2, 5.6), Color3.fromRGB(0, 200, 255), M.Neon, nc())
	for k = -2, 2 do
		local box = B.box(m, island * CFrame.new(k * 2.6, 4.6, 0), Vector3.new(2.2, 2.4, 0.8), Color3.fromRGB(20, 20, 22), M.Cardboard, nc())
		B.sign(box, Enum.NormalId.Front, ({ "RTX\n5090", "RX\n9070 XT", "RTX\n4070", "ARC\nB580", "RTX\n5060" })[k + 3], { color = Color3.fromRGB(118, 185, 0), background = Color3.fromRGB(20, 20, 22) })
	end
	Commerce.servicePoint(m, cf * CFrame.new(hw / 4, 0.2, hd - 10), "parts", poi.id, "Shop", "Mega Parts Depot", 12)
	-- trolley bay outside
	for k = 0, 3 do
		B.box(parent, cf * CFrame.new(hw / 2 - 6, 1.2, -4 - k * 1.2), Vector3.new(2.4, 2.4, 1), Color3.fromRGB(200, 40, 40), M.Metal, nc())
	end
	Props.billboard(parent, cf * CFrame.new(hw / 2 + 2, 0, 4) * CFrame.Angles(0, math.rad(-25), 0), "DEAL OF THE DAY", "20% off graphics cards!", { 0, 90, 160 })
	return m
end

local function mall(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local m = Buildings.building(parent, cf, { w = w - 10, d = d - 12, floors = 4, floorH = 14, style = "modern", ground = "lobby", name = "ELECTRONICS MALL", rng = rng, glassColor = { 40, 80, 110 } })
	for k = -1, 1 do
		Props.billboard(parent, cf * CFrame.new(k * 26, 0, -6), ({ "GAME WORLD", "PHONES & TABLETS", "MONITOR EXPO" })[k + 2], "At the mall", ({ { 120, 40, 160 }, { 20, 120, 80 }, { 160, 60, 20 } })[k + 2])
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Old bazaar: covered bazaar, bazaar parts stall, second-hand market, flea market, tool shop
----------------------------------------------------------------------------------------------------
local function coveredBazaar(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 2)
	local m = B.model("CoveredBazaar", parent)
	local stone = Color3.fromRGB(214, 198, 168)
	local hw, hd, hh = w - 8, d - 10, 16
	B.box(m, cf * CFrame.new(0, hh / 2, hd), Vector3.new(hw, hh, 2), stone, M.Limestone)
	for side = -1, 1, 2 do
		B.box(m, cf * CFrame.new(side * hw / 2, hh / 2, hd / 2), Vector3.new(2, hh, hd), stone, M.Limestone)
	end
	-- arcade of arches on the front
	local arches = math.floor(hw / 12)
	for i = 0, arches do
		local x = -hw / 2 + i * hw / arches
		B.box(m, cf * CFrame.new(x, hh / 2, 0), Vector3.new(2.4, hh, 2.4), stone, M.Limestone)
	end
	B.box(m, cf * CFrame.new(0, hh - 1.5, 0), Vector3.new(hw, 3, 2.4), stone, M.Limestone)
	-- domes
	for i = 0, 3 do
		local x = -hw / 2 + hw * (i + 0.5) / 4
		B.cylY(m, cf * CFrame.new(x, hh + 1.5, hd / 2), 3, 18, stone, M.Limestone)
		B.ball(m, cf * CFrame.new(x, hh + 3, hd / 2), 16, Color3.fromRGB(110, 120, 130), M.Slate)
		B.cylY(m, cf * CFrame.new(x, hh + 11.5, hd / 2), 2.5, 0.6, Color3.fromRGB(200, 170, 80), M.Metal, nc())
	end
	B.box(m, cf * CFrame.new(0, hh + 0.5, hd / 2), Vector3.new(hw, 1, hd), Color3.fromRGB(196, 182, 156), M.Limestone)
	-- lanterns and carpets inside
	for _ = 1, 6 do
		-- a glass lantern on a chain from the vault
		local lx, lz = Rand.range(rng, -hw / 2 + 6, hw / 2 - 6), Rand.range(rng, 6, hd - 6)
		B.cylY(m, cf * CFrame.new(lx, hh - 1.75, lz), 3.1, 0.12, Color3.fromRGB(60, 50, 40), M.Metal, nc())
		local lamp = B.ball(m, cf * CFrame.new(lx, hh - 4, lz), 1.4, Rand.pick(rng, { Color3.fromRGB(240, 120, 40), Color3.fromRGB(220, 50, 60), Color3.fromRGB(40, 140, 220) }), M.Neon, nc())
		B.pointLight(lamp, 16, 0.8, lamp.Color, false)
	end
	for i = 1, 8 do
		local x = -hw / 2 + 6 + (i - 1) * (hw - 12) / 7
		-- carpets hung on the back wall from a rod
		B.box(m, cf * CFrame.new(x, 4, hd - 1.12), Vector3.new(4, 7, 0.2), Rand.pick(rng, { Color3.fromRGB(170, 40, 40), Color3.fromRGB(40, 60, 140), Color3.fromRGB(180, 120, 40) }), M.Fabric, nc())
		B.cyl(m, cf * CFrame.new(x, 7.6, hd - 1.2), 4.6, 0.2, Color3.fromRGB(120, 90, 50), M.Wood, nc())
	end
	-- the name board stands on the arcade's top beam
	local sign = B.box(m, cf * CFrame.new(0, hh + 1.5, -0.9), Vector3.new(26, 3, 0.6), Color3.fromRGB(120, 40, 30), M.Wood)
	B.sign(sign, Enum.NormalId.Front, "COVERED MARKET", { color = Color3.fromRGB(250, 220, 140), font = B.Fonts.Serif })
	return m
end

local function bazaarParts(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local m = Buildings.hall(parent, cf, math.min(w - 20, 70), d - 12, 14, { name = "OLD TOWN PARTS", accent = { 150, 60, 30 }, wall = { 210, 190, 160 }, wallMat = M.Brick, floor = { 140, 120, 100 }, floorMat = M.WoodPlanks, modelName = "BazaarParts", font = B.Fonts.Serif })
	local hw = math.min(w - 20, 70)
	for i = -1, 1 do
		Props.shelf(m, cf * CFrame.new(i * 18, 0.2, d - 18), 14, 10, 3, rng, 0.95)
	end
	for _ = 1, 6 do
		Props.crate(m, cf * CFrame.new(Rand.range(rng, -hw / 2 + 4, hw / 2 - 4), 0.2, Rand.range(rng, 6, 12)), Rand.range(rng, 2, 3))
	end
	Commerce.servicePoint(m, cf * CFrame.new(0, 0.2, d - 30), "parts_bazaar", poi.id, "Haggle", "Old Town Parts")
	return m
end

local function usedMarket(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local m = Buildings.hall(parent, cf, w - 16, d - 12, 15, { name = "SECOND-HAND MARKET ♻", accent = { 30, 140, 70 }, wall = { 220, 214, 196 }, floor = { 120, 110, 96 }, floorMat = M.SmoothPlastic, modelName = "UsedMarket" })
	-- bins full of used parts
	for i = 0, 5 do
		local x = -(w - 16) / 2 + 8 + i * ((w - 32) / 5)
		local bin = B.box(m, cf * CFrame.new(x, 1.6, 12), Vector3.new(7, 3.2, 5), Color3.fromRGB(120, 90, 60), M.WoodPlanks)
		for _ = 1, 6 do
			B.box(m, cf * CFrame.new(x + Rand.range(rng, -2.6, 2.6), 3.4, 12 + Rand.range(rng, -1.8, 1.8)) * CFrame.Angles(Rand.range(rng, -0.6, 0.6), Rand.range(rng, 0, 3), Rand.range(rng, -0.6, 0.6)), Vector3.new(Rand.range(rng, 1, 2.6), 0.3, Rand.range(rng, 0.6, 1.6)), Rand.pick(rng, { Color3.fromRGB(30, 110, 50), Color3.fromRGB(30, 30, 34), Color3.fromRGB(160, 160, 170) }), M.SmoothPlastic, nc())
		end
		-- a price tag on a stick
		B.box(m, cf * CFrame.new(x, 3.8, 14.3), Vector3.new(0.12, 1.2, 0.12), Color3.fromRGB(120, 90, 60), M.Wood, nc())
		local tag = B.box(m, cf * CFrame.new(x, 5, 14.41), Vector3.new(3, 1.2, 0.1), Color3.fromRGB(250, 240, 200), M.SmoothPlastic, nc())
		B.sign(tag, Enum.NormalId.Front, Rand.pick(rng, { "50% OFF", "WORKS", "TESTED", "CLEARANCE", "CHEAP!" }), { color = Color3.fromRGB(200, 30, 30), font = B.Fonts.Hand })
		bin.Name = "PartsBin"
	end
	Commerce.servicePoint(m, cf * CFrame.new(0, 0.2, d - 24), "used", poi.id, "Buy / Sell", "Second-hand Market")
	return m
end

local function fleaMarket(parent, poi, rng)
	local cf, w = Commerce.siteFrame(poi, 6)
	local m = B.model("FleaMarket", parent)
	local stalls = math.floor((w - 10) / 14)
	for i = 0, stalls - 1 do
		local c = cf * CFrame.new(-w / 2 + 12 + i * 14, 0, 14)
		local cloth = Rand.pick(rng, { Color3.fromRGB(200, 60, 50), Color3.fromRGB(40, 110, 170), Color3.fromRGB(230, 160, 40), Color3.fromRGB(60, 140, 80) })
		B.box(m, c * CFrame.new(0, 2.2, 0), Vector3.new(10, 0.3, 5), Color3.fromRGB(150, 110, 70), M.WoodPlanks)
		for x = -1, 1, 2 do
			for z = -1, 1, 2 do
				B.box(m, c * CFrame.new(x * 4.6, 3.6, z * 2.2), Vector3.new(0.3, 7.2, 0.3), Color3.fromRGB(110, 80, 50), M.Wood)
			end
		end
		B.wedge(m, c * CFrame.new(0, 7.8, 0), Vector3.new(11, 1.4, 6), cloth, M.Fabric, nc())
		for _ = 1, 5 do
			-- odds and ends lying on the table (top at 2.35)
			local ih = Rand.range(rng, 0.3, 1.2)
			B.box(m, c * CFrame.new(Rand.range(rng, -4, 4), 2.35 + ih / 2, Rand.range(rng, -1.6, 1.6)) * CFrame.Angles(0, Rand.range(rng, 0, 3), 0), Vector3.new(Rand.range(rng, 0.8, 2.4), ih, Rand.range(rng, 0.6, 1.6)), Rand.pick(rng, { Color3.fromRGB(30, 30, 34), Color3.fromRGB(20, 100, 40), Color3.fromRGB(200, 200, 205), Color3.fromRGB(180, 150, 90) }), M.SmoothPlastic, nc())
		end
	end
	Commerce.servicePoint(m, cf * CFrame.new(0, 0, 30), "used", poi.id, "Browse Stalls", "Flea Market", 10)
	local banner = B.box(m, cf * CFrame.new(0, 12, 4), Vector3.new(30, 3, 0.3), Color3.fromRGB(250, 220, 90), M.Fabric, nc())
	for side = -1, 1, 2 do
		B.cylY(m, cf * CFrame.new(side * 15.2, 6.75, 4), 13.5, 0.4, Color3.fromRGB(110, 80, 50), M.Wood)
	end
	B.sign(banner, Enum.NormalId.Front, "FLEA MARKET • OPEN DAILY", { color = Color3.fromRGB(120, 30, 20), font = B.Fonts.Hand })
	return m
end

local function toolShop(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local hw = math.min(w - 16, 64)
	local m = Buildings.hall(parent, cf, hw, d - 14, 14, { name = "MASTER TOOLS & HARDWARE 🧰", accent = { 220, 140, 20 }, wall = { 70, 70, 76 }, wallMat = M.SmoothPlastic, floor = { 150, 150, 150 }, floorMat = M.SmoothPlastic, modelName = "ToolShop" })
	-- pegboard walls with tools
	for side = -1, 1, 2 do
		local board = B.box(m, cf * CFrame.new(side * (hw / 2 - 1.2), 7, (d - 14) / 2), Vector3.new(0.4, 9, d - 24), Color3.fromRGB(190, 160, 120), M.Wood)
		board.Name = "Pegboard"
		for k = 1, 14 do
			local z = 6 + k * (d - 30) / 14
			B.box(m, cf * CFrame.new(side * (hw / 2 - 1.6), Rand.range(rng, 4, 10), z), Vector3.new(0.4, Rand.range(rng, 1.2, 2.6), 0.3), Rand.pick(rng, { Color3.fromRGB(220, 40, 30), Color3.fromRGB(240, 170, 20), Color3.fromRGB(30, 100, 200), Color3.fromRGB(40, 40, 44) }), M.SmoothPlastic, nc())
		end
	end
	for i = -1, 1, 2 do
		Props.shelf(m, cf * CFrame.new(i * hw / 5, 0.2, (d - 14) / 2) * CFrame.Angles(0, math.pi / 2, 0), 12, 8, 3, rng)
	end
	Commerce.servicePoint(m, cf * CFrame.new(0, 0.2, d - 24), "tools", poi.id, "Alet Al", "Usta Alet-Edevat")
	return m
end

local function oldHan(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local m = B.model("OldHan", parent)
	local stone = Color3.fromRGB(200, 180, 150)
	local hw, hd, hh = w - 16, d - 16, 18
	-- four wings around a courtyard
	for side = -1, 1, 2 do
		B.box(m, cf * CFrame.new(side * (hw / 2 - 5), hh / 2, hd / 2), Vector3.new(10, hh, hd), stone, M.Sandstone)
	end
	B.box(m, cf * CFrame.new(0, hh / 2, hd - 5), Vector3.new(hw, hh, 10), stone, M.Sandstone)
	B.box(m, cf * CFrame.new(-hw / 4 - 4, hh / 2, 5), Vector3.new(hw / 2 - 8, hh, 10), stone, M.Sandstone)
	B.box(m, cf * CFrame.new(hw / 4 + 4, hh / 2, 5), Vector3.new(hw / 2 - 8, hh, 10), stone, M.Sandstone)
	B.box(m, cf * CFrame.new(0, hh - 3, 5), Vector3.new(16, 6, 10), stone, M.Sandstone)
	B.cyl(m, cf * CFrame.new(0, hh - 6, 5) * CFrame.Angles(0, math.pi / 2, 0), 10.2, 16, stone, M.Sandstone)
	-- courtyard: fountain and trees
	B.cylY(m, cf * CFrame.new(0, 1, hd / 2), 2, 10, Color3.fromRGB(220, 210, 190), M.Marble)
	B.cylY(m, cf * CFrame.new(0, 1.8, hd / 2), 0.4, 9, Color3.fromRGB(80, 150, 180), M.Glass, nc({ Transparency = 0.3 }))
	B.cylY(m, cf * CFrame.new(0, 3.5, hd / 2), 3.5, 1.2, Color3.fromRGB(220, 210, 190), M.Marble)
	for k = -1, 1, 2 do
		Props.tree(m, cf * CFrame.new(k * 14, 0, hd / 2), "cypress", rng)
	end
	for _ = 1, 4 do
		Props.parasolTable(m, cf * CFrame.new(Rand.range(rng, -hw / 4, hw / 4), 0, Rand.range(rng, hd / 2 - 12, hd / 2 + 12)), { 160, 40, 40 }, rng)
	end
	local plaque = B.box(m, cf * CFrame.new(0, hh + 1.8, -0.2), Vector3.new(18, 3, 0.4), Color3.fromRGB(120, 40, 30), M.Wood)
	B.sign(plaque, Enum.NormalId.Front, "HISTORIC INN • 1842", { color = Color3.fromRGB(250, 220, 150), font = B.Fonts.Serif })
	return m
end

local function teahouse(parent, poi, rng)
	local cf, w = Commerce.siteFrame(poi, 2)
	local m = Buildings.building(parent, cf * CFrame.new(-w / 4, 0, 4), { w = w / 2 - 8, d = 30, floors = 2, floorH = 12, style = "historic", ground = "shop", name = "KAHVEHANE", rng = rng, accent = { 120, 40, 30 }, roof = "gable", blankSides = true })
	for i = 0, 5 do
		local c = cf * CFrame.new(w / 8 + (i % 3) * 10, 0, 6 + math.floor(i / 3) * 9)
		B.box(m, c * CFrame.new(0, 2.4, 0), Vector3.new(4, 0.25, 4), Color3.fromRGB(110, 70, 40), M.Wood)
		B.box(m, c * CFrame.new(0, 1.2, 0), Vector3.new(0.4, 2.4, 0.4), Color3.fromRGB(60, 40, 30), M.Wood)
		local board = B.box(m, c * CFrame.new(0, 2.6, 0), Vector3.new(2.6, 0.15, 1.6), Color3.fromRGB(150, 100, 60), M.Wood, nc())
		board.Name = "Backgammon"
		for k = 0, 1 do
			Props.chair(m, c * CFrame.Angles(0, k * math.pi, 0) * CFrame.new(0, 0, 3), { 120, 80, 50 })
		end
	end
	Props.samovar(m, cf * CFrame.new(w / 3, 0.2, 2))
	Props.tree(m, cf * CFrame.new(w / 4, 0, 26), "oak", rng)
	return m
end

local function marketHall(parent, poi, rng)
	local cf, w = Commerce.siteFrame(poi, 4)
	local m = B.model("MarketHall", parent)
	local stalls = math.floor((w - 12) / 12)
	local produce = { Color3.fromRGB(220, 40, 30), Color3.fromRGB(250, 160, 30), Color3.fromRGB(90, 160, 50), Color3.fromRGB(250, 220, 60), Color3.fromRGB(120, 50, 120) }
	for i = 0, stalls - 1 do
		local c = cf * CFrame.new(-w / 2 + 10 + i * 12, 0, 10)
		B.box(m, c * CFrame.new(0, 1.8, 0), Vector3.new(9, 0.4, 5), Color3.fromRGB(140, 100, 60), M.WoodPlanks)
		B.box(m, c * CFrame.new(0, 0.9, 0), Vector3.new(8.6, 1.8, 4.6), Color3.fromRGB(110, 80, 50), M.WoodPlanks)
		for _ = 1, 10 do
			B.ball(m, c * CFrame.new(Rand.range(rng, -3.8, 3.8), 2.4, Rand.range(rng, -2, 2)), 0.9, Rand.pick(rng, produce), M.SmoothPlastic, nc())
		end
		B.wedge(m, c * CFrame.new(0, 6.8, 0), Vector3.new(10, 1.2, 6), Rand.pick(rng, { Color3.fromRGB(240, 240, 236), Color3.fromRGB(200, 50, 40), Color3.fromRGB(40, 120, 70) }), M.Fabric, nc())
		for x = -1, 1, 2 do
			B.box(m, c * CFrame.new(x * 4.4, 3.4, -2.6), Vector3.new(0.3, 6.8, 0.3), Color3.fromRGB(90, 90, 96), M.Metal)
		end
	end
	local sign = B.box(m, cf * CFrame.new(0, 10, 3), Vector3.new(24, 3, 0.3), Color3.fromRGB(40, 120, 70), M.SmoothPlastic, nc())
	for side = -1, 1, 2 do
		B.cylY(m, cf * CFrame.new(side * 12.2, 5.75, 3), 11.5, 0.4, Color3.fromRGB(90, 90, 96), M.Metal)
	end
	B.sign(sign, Enum.NormalId.Front, "NEIGHBOURHOOD MARKET • FRESH PRODUCE", { color = Color3.new(1, 1, 1) })
	return m
end

----------------------------------------------------------------------------------------------------
-- Scrapyard
----------------------------------------------------------------------------------------------------
local function scrapyard(parent, poi, rng)
	local s = poi.site
	local m = B.model("Scrapyard", parent)
	local cx, cz = (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2
	local _w, _d = s.x1 - s.x0, s.z1 - s.z0
	-- chain-link fence with a gate on the north side
	Props.fence(m, Vector3.new(s.x0 + 2, WALK_Y, s.z0 + 2), Vector3.new(cx - 10, WALK_Y, s.z0 + 2), "chain", 8)
	Props.fence(m, Vector3.new(cx + 10, WALK_Y, s.z0 + 2), Vector3.new(s.x1 - 2, WALK_Y, s.z0 + 2), "chain", 8)
	Props.fence(m, Vector3.new(s.x0 + 2, WALK_Y, s.z1 - 2), Vector3.new(s.x1 - 2, WALK_Y, s.z1 - 2), "chain", 8)
	Props.fence(m, Vector3.new(s.x0 + 2, WALK_Y, s.z0 + 2), Vector3.new(s.x0 + 2, WALK_Y, s.z1 - 2), "chain", 8)
	Props.fence(m, Vector3.new(s.x1 - 2, WALK_Y, s.z0 + 2), Vector3.new(s.x1 - 2, WALK_Y, s.z1 - 2), "chain", 8)
	-- piles of junk PCs and monitors
	local junkCols = { Color3.fromRGB(226, 216, 190), Color3.fromRGB(40, 40, 44), Color3.fromRGB(150, 150, 156), Color3.fromRGB(120, 100, 80) }
	for _ = 1, 7 do
		local px, pz = Rand.range(rng, s.x0 + 18, s.x1 - 18), Rand.range(rng, cz - 10, s.z1 - 18)
		for k = 1, 16 do
			local size = Vector3.new(Rand.range(rng, 1.6, 3), Rand.range(rng, 2.4, 4.4), Rand.range(rng, 2.4, 4.4))
			local y = WALK_Y + size.Y / 2 + math.max(0, 6 - (k % 6)) * 0.8
			B.box(m, CFrame.new(px + Rand.range(rng, -6, 6), y, pz + Rand.range(rng, -6, 6)) * CFrame.Angles(Rand.range(rng, -0.6, 0.6), Rand.range(rng, 0, 6), Rand.range(rng, -0.6, 0.6)), size, Rand.pick(rng, junkCols), M.CorrodedMetal)
		end
	end
	-- crane magnet and a crushed car stack
	B.box(m, CFrame.new(s.x0 + 20, WALK_Y + 14, s.z1 - 20), Vector3.new(2, 28, 2), Color3.fromRGB(230, 170, 30), M.Metal)
	B.box(m, CFrame.new(s.x0 + 32, WALK_Y + 27, s.z1 - 20), Vector3.new(26, 2, 2), Color3.fromRGB(230, 170, 30), M.Metal)
	B.cylY(m, CFrame.new(s.x0 + 42, WALK_Y + 18, s.z1 - 20), 1.4, 7, Color3.fromRGB(60, 60, 64), M.Metal)
	B.cylY(m, CFrame.new(s.x0 + 42, WALK_Y + 22.35, s.z1 - 20), 7.3, 0.18, Color3.fromRGB(40, 40, 44), M.Metal, nc())
	for k = 0, 4 do
		B.box(m, CFrame.new(s.x1 - 22, WALK_Y + 1.5 + k * 3, s.z1 - 24), Vector3.new(14, 3, 7), Rand.pick(rng, { Color3.fromRGB(150, 40, 30), Color3.fromRGB(40, 70, 120), Color3.fromRGB(200, 200, 196) }), M.CorrodedMetal)
	end
	-- office cabin with the counter
	local cabin = CFrame.lookAt(Vector3.new(cx, WALK_Y, s.z0 + 26), Vector3.new(cx, WALK_Y, s.z0))
	local hall = Buildings.hall(m, cabin, 26, 18, 11, { name = "JUNKYARD JOE", accent = { 120, 80, 40 }, wall = { 150, 140, 120 }, wallMat = M.CorrodedMetal, floor = { 110, 100, 90 }, floorMat = M.SmoothPlastic, modelName = "ScrapOffice" })
	Commerce.servicePoint(hall, cabin * CFrame.new(0, 0.2, 12), "scrap", poi.id, "Buy a Junk PC", "Scrapyard", 8)
	return m
end

----------------------------------------------------------------------------------------------------
-- Vehicle dealers and fuel stations
----------------------------------------------------------------------------------------------------
local function dealer(parent, poi, _rng, service: string, title: string, accent)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local hw, hd = w - 16, math.min(d - 30, 70)
	local m, _pts = Buildings.hall(parent, cf * CFrame.new(0, 0, 10), hw, hd, 18, { name = title, accent = accent, wall = { 240, 240, 242 }, floor = { 230, 230, 232 }, floorMat = M.Marble, door = 14, modelName = "Dealer_" .. service })
	-- display turntables (the vehicles themselves are placed by VehicleService)
	local n = math.max(2, math.floor((hw - 20) / 22))
	for i = 0, n - 1 do
		local x = -hw / 2 + 16 + i * (hw - 32) / math.max(1, n - 1)
		local spot = cf * CFrame.new(x, 0.3, 10 + hd / 2) * CFrame.Angles(0, math.rad(25 + i * 20), 0)
		B.cylY(m, spot * CFrame.new(0, 0.2, 0), 0.4, 18, Color3.fromRGB(40, 40, 46), M.Metal)
		B.cylY(m, spot * CFrame.new(0, 0.25, 0), 0.42, 18.4, Color3.fromRGB(255, 255, 255), M.Neon, nc())
		local marker = B.marker(m, "DisplaySpot", spot * CFrame.new(0, 0.5, 0))
		marker:SetAttribute("Dealer", service)
		B.tag(marker, "DealerDisplay")
	end
	Commerce.servicePoint(m, cf * CFrame.new(hw / 3, 0.2, 10 + hd - 10), service, poi.id, "Browse Vehicles", title)
	-- pennant banners along the forecourt
	for k = -2, 2 do
		local base = cf * CFrame.new(k * 10, 0, -2)
		B.cylY(parent, base * CFrame.new(0, 7, 0), 14, 0.35, Color3.fromRGB(220, 220, 225), M.Metal)
		local cloth = B.box(parent, base * CFrame.new(0, 10.5, -1.6), Vector3.new(0.1, 6, 3), B.color(accent), M.Fabric, nc())
		B.sign(cloth, Enum.NormalId.Left, if k % 2 == 0 then "SALE" else "0% APR", { color = Color3.new(1, 1, 1) })
	end
	return m
end

local function fuelStation(parent, poi, rng)
	local cf, w, d = Commerce.siteFrame(poi, 2)
	local m = B.model("FuelStation", parent)
	local canopy = cf * CFrame.new(0, 0, 22)
	B.box(m, canopy * CFrame.new(0, 14, 0), Vector3.new(40, 1.6, 22), Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
	local band = B.box(m, canopy * CFrame.new(0, 14, -11), Vector3.new(40, 1.8, 0.4), Color3.fromRGB(20, 120, 60), M.SmoothPlastic)
	B.sign(band, Enum.NormalId.Front, "GREEN FUEL", { color = Color3.new(1, 1, 1) })
	for k = -1, 1, 2 do
		B.box(m, canopy * CFrame.new(k * 14, 7, 0), Vector3.new(1.2, 14, 1.2), Color3.fromRGB(200, 200, 200), M.Metal)
		for p = -1, 1, 2 do
			local pump = canopy * CFrame.new(k * 14 + p * 4, 0, 0)
			B.box(m, pump * CFrame.new(0, 0.3, 0), Vector3.new(4, 0.6, 7), Color3.fromRGB(180, 180, 180), M.SmoothPlastic)
			B.box(m, pump * CFrame.new(0, 3, 0), Vector3.new(2, 5, 1.4), Color3.fromRGB(20, 120, 60), M.SmoothPlastic)
			local screen = B.box(m, pump * CFrame.new(0, 4.2, -0.72), Vector3.new(1.4, 0.8, 0.05), Color3.fromRGB(10, 10, 10), M.Glass, nc())
			B.sign(screen, Enum.NormalId.Front, "42.90", { glow = true, color = Color3.fromRGB(255, 80, 60), font = B.Fonts.Mono })
		end
	end
	for _, l in { Vector3.new(-12, 13, 0), Vector3.new(12, 13, 0) } do
		local p = B.box(m, canopy * CFrame.new(l), Vector3.new(8, 0.2, 4), Color3.fromRGB(255, 255, 255), M.Neon, nc())
		B.spotLight(p, Enum.NormalId.Bottom, 30, 120, 1.5, Color3.fromRGB(255, 255, 250), false)
	end
	Buildings.building(parent, cf * CFrame.new(0, 0, 44), { w = 30, d = math.min(24, d - 50), floors = 1, floorH = 12, style = "modern", ground = "shop", name = "24/7 MARKET", rng = rng, blankSides = true })
	-- price totem
	local totem = B.box(m, cf * CFrame.new(w / 2 - 6, 9, 2), Vector3.new(5, 18, 1.2), Color3.fromRGB(20, 120, 60), M.SmoothPlastic)
	B.sign(totem, Enum.NormalId.Front, "UNLEADED 3.49\nDIESEL 3.89\nLPG 1.79", { color = Color3.new(1, 1, 1), glow = true, font = B.Fonts.Mono })
	return m
end

----------------------------------------------------------------------------------------------------
-- Business / civic interiors with a service desk
----------------------------------------------------------------------------------------------------
local function officeDesk(parent, poi, rng, service, title, action, accent, opts)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local hw = math.min(w - 20, (opts and opts.width) or 60)
	local hd = d - 14
	local m = Buildings.hall(parent, cf, hw, hd, 14, { name = title, accent = accent, wall = (opts and opts.wall) or { 236, 236, 240 }, floor = (opts and opts.floor) or { 180, 170, 160 }, floorMat = (opts and opts.floorMat) or M.WoodPlanks, modelName = "Office_" .. poi.id })
	deskRow(m, cf * CFrame.new(0, 0.2, hd * 0.45), math.max(1, math.floor(hw / 16)), rng)
	for i = 1, 3 do
		Props.plant(m, cf * CFrame.new(-hw / 2 + 3 + i * 0.1, 0.2, 4 + i * 8), rng)
	end
	if service then
		Commerce.servicePoint(m, cf * CFrame.new(0, 0.2, hd - 8), service, poi.id, action, title)
	end
	-- building mass above the hall
	B.box(parent, cf * CFrame.new(0, 14 + 14, hd / 2), Vector3.new(hw, 28, hd), Rand.pick(rng, { Color3.fromRGB(210, 206, 198), Color3.fromRGB(180, 186, 196) }), M.SmoothPlastic)
	return m
end

local function internetCafe(parent, poi, _rng)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local hw, hd = math.min(w - 20, 60), d - 14
	local m = Buildings.hall(parent, cf, hw, hd, 13, { name = "PIXEL INTERNET CAFE 🎮", accent = { 120, 40, 200 }, wall = { 30, 30, 40 }, wallMat = M.SmoothPlastic, floor = { 40, 40, 50 }, floorMat = M.Carpet, modelName = "InternetCafe" })
	for row = 0, 2 do
		for i = 0, 5 do
			local c = cf * CFrame.new(-hw / 2 + 6 + i * 8, 0.2, 10 + row * 9)
			B.box(m, c * CFrame.new(0, 2.4, 0), Vector3.new(7, 0.3, 3), Color3.fromRGB(20, 20, 24), M.SmoothPlastic)
			B.box(m, c * CFrame.new(0, 2.36, -1.2), Vector3.new(7, 0.08, 0.3), Color3.fromHSV((i + row) / 7 % 1, 0.8, 1), M.Neon, nc())
			Props.monitor(m, c * CFrame.new(0, 2.55, 0.6), "", Color3.fromHSV((i * 0.13 + row * 0.3) % 1, 0.7, 0.5))
			Props.chair(m, c * CFrame.new(0, 0, -2.2), { 160, 30, 40 })
		end
	end
	Commerce.servicePoint(m, cf * CFrame.new(0, 0.2, hd - 8), "contracts", poi.id, "Take Bulk Job", "Pixel Internet Cafe")
	B.box(parent, cf * CFrame.new(0, 13 + 13, hd / 2), Vector3.new(hw, 26, hd), Color3.fromRGB(190, 190, 196), M.SmoothPlastic)
	return m
end

local function datacenter(parent, poi, _rng)
	local s = poi.site
	local m = B.model("DataCenter", parent)
	local cx = (s.x0 + s.x1) / 2
	local cf = CFrame.lookAt(Vector3.new(cx, WALK_Y, s.z0 + 20), Vector3.new(cx, WALK_Y, s.z0))
	local hw, hd = s.x1 - s.x0 - 30, s.z1 - s.z0 - 50
	local hall = Buildings.hall(m, cf, hw, hd, 20, { name = "CLOUD DATA CENTRE", accent = { 30, 60, 110 }, wall = { 190, 196, 204 }, wallMat = M.Metal, floor = { 210, 214, 220 }, floorMat = M.DiamondPlate, modelName = "DataHall" })
	for row = 0, 3 do
		for i = 0, 6 do
			local rack = cf * CFrame.new(-hw / 2 + 10 + i * (hw - 20) / 6, 0.2, 18 + row * 14)
			B.box(hall, rack * CFrame.new(0, 4.5, 0), Vector3.new(3, 9, 5), Color3.fromRGB(20, 22, 26), M.Metal)
			for k = 0, 7 do
				local led = B.box(hall, rack * CFrame.new(-1.2, 1.4 + k, -2.52), Vector3.new(0.3, 0.15, 0.05), if (i + k + row) % 3 == 0 then Color3.fromRGB(40, 255, 120) else Color3.fromRGB(60, 160, 255), M.Neon, nc({ CastShadow = false }))
				led:AddTag("RackLed")
			end
		end
	end
	Commerce.servicePoint(hall, cf * CFrame.new(0, 0.2, 8), "contracts", poi.id, "Take Corporate Job", "Cloud Data Centre")
	-- cooling units on the roof and a generator yard
	for i = 0, 3 do
		B.box(m, cf * CFrame.new(-hw / 3 + i * hw / 4.5, 22.5, hd / 2), Vector3.new(8, 3, 8), Color3.fromRGB(200, 200, 204), M.Metal)
		B.cylY(m, cf * CFrame.new(-hw / 3 + i * hw / 4.5, 24.2, hd / 2), 0.3, 6, Color3.fromRGB(40, 40, 44), M.Metal, nc())
	end
	Props.fence(m, Vector3.new(s.x0 + 3, WALK_Y, s.z0 + 3), Vector3.new(cx - 12, WALK_Y, s.z0 + 3), "metal", 6)
	Props.fence(m, Vector3.new(cx + 12, WALK_Y, s.z0 + 3), Vector3.new(s.x1 - 3, WALK_Y, s.z0 + 3), "metal", 6)
	return m
end

local function restaurant(parent, poi, rng, title, accent, tables)
	local cf, w = Commerce.siteFrame(poi, 2)
	local m = Buildings.building(parent, cf * CFrame.new(0, 0, 10), { w = math.min(w - 14, 50), d = 30, floors = rng:NextInteger(2, 3), floorH = 12, style = Rand.pick(rng, { "apartment", "historic" }), ground = "shop", shops = 1, name = title, accent = accent, rng = rng, blankSides = true })
	for i = 1, tables or 4 do
		Props.parasolTable(parent, cf * CFrame.new(-w / 3 + (i - 1) * (w / 1.5) / math.max(1, (tables or 4) - 1), 0, 4), accent, rng)
	end
	return m
end

local function simpleBuilding(parent, poi, rng, title, style, floors, accent, ground)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	return Buildings.building(parent, cf, { w = w - 14, d = math.min(d - 10, 50), floors = floors, floorH = 13, style = style, ground = ground or "lobby", name = title, accent = accent, rng = rng })
end

local function cinema(parent, poi, _rng)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local m = B.model("Cinema", parent)
	B.box(m, cf * CFrame.new(0, 14, d / 2), Vector3.new(w - 16, 28, d - 16), Color3.fromRGB(60, 30, 50), M.SmoothPlastic)
	local marquee = B.box(m, cf * CFrame.new(0, 12, -2), Vector3.new(w - 20, 6, 4), Color3.fromRGB(20, 20, 24), M.SmoothPlastic)
	B.sign(marquee, Enum.NormalId.Front, "STAR CINEMA  •  NOW SHOWING: 'THE LAST REPAIRMAN'", { color = Color3.fromRGB(255, 220, 90), glow = true, brightness = 2 })
	for i = -3, 3 do
		local bulb = B.ball(m, cf * CFrame.new(i * (w - 24) / 6, 15.3, -3.8), 0.6, Color3.fromRGB(255, 230, 150), M.Neon, nc())
		bulb.Name = "MarqueeBulb"
	end
	B.box(m, cf * CFrame.new(0, 4.5, 0.2), Vector3.new(w - 24, 9, 0.4), Color3.fromRGB(160, 180, 196), M.Glass, { Transparency = 0.5 })
	for k = -1, 1, 2 do
		local poster = B.box(m, cf * CFrame.new(k * (w / 2 - 14), 5, -0.4), Vector3.new(6, 9, 0.3), Color3.fromRGB(30, 30, 30), M.SmoothPlastic, nc())
		B.sign(poster, Enum.NormalId.Front, if k < 0 then "RAM\nWARS" else "BLUE\nSCREEN 2", { color = Color3.fromRGB(255, 255, 255), background = if k < 0 then Color3.fromRGB(120, 20, 30) else Color3.fromRGB(20, 40, 120), glow = true })
	end
	return m
end

local function arena(parent, poi, _rng)
	local cf, w, d = Commerce.siteFrame(poi, 4)
	local m = Buildings.hall(parent, cf, math.min(w - 20, 70), d - 14, 18, { name = "E-SPOR ARENASI", accent = { 200, 30, 90 }, wall = { 26, 26, 34 }, wallMat = M.SmoothPlastic, floor = { 30, 30, 40 }, floorMat = M.Carpet, modelName = "Arena" })
	local stage = cf * CFrame.new(0, 0.2, d - 26)
	B.box(m, stage * CFrame.new(0, 1.5, 0), Vector3.new(36, 3, 12), Color3.fromRGB(20, 20, 24), M.SmoothPlastic)
	local screen = B.box(m, stage * CFrame.new(0, 9, 5.8), Vector3.new(30, 12, 0.4), Color3.fromRGB(10, 10, 12), M.SmoothPlastic)
	B.sign(screen, Enum.NormalId.Front, "FINAL • REPAIRERS vs CHIPS", { glow = true, brightness = 1.6, color = Color3.new(1, 1, 1), background = Color3.fromRGB(80, 10, 50) })
	for i = -2, 2 do
		B.box(m, stage * CFrame.new(i * 6, 3.4, -2), Vector3.new(4, 0.3, 2), Color3.fromRGB(20, 20, 24), M.SmoothPlastic)
		Props.monitor(m, stage * CFrame.new(i * 6, 3.55, -1.6), "", Color3.fromRGB(80, 10, 50))
		Props.chair(m, stage * CFrame.new(i * 6, 3, -0.2), { 200, 30, 90 })
	end
	-- the audience: rows of seats facing the stage, LED strips along the walls, team banners
	local hw = math.min(w - 20, 70) / 2
	for row = 0, 4 do
		local z = d - 44 - row * 5
		if z > 8 then
			for k = -5, 5 do
				if k ~= 0 then
					Props.chair(m, cf * CFrame.new(k * 4.2, 0.2 + row * 0.6, z) * CFrame.Angles(0, math.pi, 0), if row % 2 == 0 then { 40, 40, 48 } else { 120, 20, 60 })
				end
			end
			if row > 0 then
				-- risers left and right of the middle aisle
				for side = -1, 1, 2 do
					B.box(m, cf * CFrame.new(side * (hw / 2 + 1), row * 0.3, z), Vector3.new(hw - 4, row * 0.6, 4.6), Color3.fromRGB(34, 34, 42), M.Carpet)
				end
			end
		end
	end
	for side = -1, 1, 2 do
		for _, y in { 4, 12 } do
			B.box(m, cf * CFrame.new(side * (hw - 1.1), y, d / 2), Vector3.new(0.2, 0.3, d - 6), Color3.fromRGB(230, 40, 120), M.Neon, { CanCollide = false, CastShadow = false, Name = "LedStrip" })
		end
		for k = 0, 2 do
			local banner = B.box(m, cf * CFrame.new(side * (hw - 1.1), 8, 14 + k * 16) * CFrame.Angles(0, -side * math.pi / 2, 0), Vector3.new(7, 5, 0.2), Color3.fromRGB(20, 20, 26), M.Fabric, { CanCollide = false })
			B.sign(banner, Enum.NormalId.Front, ({ "REPAIRERS", "CHIPS", "OVERCLOCK", "RGB WOLVES", "COOLERS", "BIOS BOYS" })[k + 1 + (if side < 0 then 0 else 3)], { glow = true, color = Color3.new(1, 1, 1), background = if k % 2 == 0 then Color3.fromRGB(120, 20, 60) else Color3.fromRGB(20, 40, 120) })
		end
	end
	return m
end

-- Builds every commerce POI found in the layout.
function Commerce.build(parent: Instance, L, yieldFn: (() -> ())?)
	local rng = Random.new(4242)
	local folder = B.folder("Commerce", parent)
	local builders = {
		megastore = megastore,
		mall = mall,
		covered_bazaar = coveredBazaar,
		bazaar_parts = bazaarParts,
		used_market = usedMarket,
		flea_market = fleaMarket,
		toolshop = toolShop,
		old_han = oldHan,
		teahouse = teahouse,
		market_hall = marketHall,
		scrapyard = scrapyard,
		car_dealer = function(p, poi, r)
			return dealer(p, poi, r, "cars", "AUTO DEALER 🚗", { 200, 30, 40 })
		end,
		bike_dealer = function(p, poi, r)
			return dealer(p, poi, r, "bikes", "MOTORCYCLE DEALER 🏍", { 240, 120, 20 })
		end,
		bicycle_shop = function(p, poi, r)
			return dealer(p, poi, r, "bicycles", "BIKES & SCOOTERS 🚲", { 40, 160, 90 })
		end,
		gas_north = fuelStation,
		gas_west = fuelStation,
		staff_agency = function(p, poi, r)
			return officeDesk(p, poi, r, "staff", "PERSONEL AJANSI", "Personel Bul", { 120, 70, 200 })
		end,
		realty = function(p, poi, r)
			return officeDesk(p, poi, r, "realty", "REAL ESTATE 🔑", "Find a Shop", { 30, 120, 90 })
		end,
		police = function(p, poi, r)
			return officeDesk(p, poi, r, "police", "POLICE STATION", "Claim Bounty", { 30, 50, 120 }, { wall = { 220, 226, 236 }, floor = { 200, 200, 204 }, floorMat = M.CeramicTiles })
		end,
		post = function(p, poi, r)
			return officeDesk(p, poi, r, nil, "PTT POSTANE", "", { 250, 200, 20 })
		end,
		internet_cafe = internetCafe,
		datacenter = datacenter,
		cargo = function(p, poi, r)
			local cf, w, d = Commerce.siteFrame(poi, 6)
			return Buildings.warehouse(p, cf, w - 16, math.min(d - 16, 60), r, { sign = "HIZLI KARGO DEPOSU", color = { 230, 150, 30 } })
		end,
		industrial = function(p, poi, r)
			local s = poi.site
			local m = B.model("Industrial", p)
			for k = 0, 1 do
				local z = if k == 0 then s.z0 else s.z1
				local look = if k == 0 then Vector3.new(0, 0, -1) else Vector3.new(0, 0, 1)
				local pos = Vector3.new((s.x0 + s.x1) / 2, WALK_Y, z - look.Z * 8)
				local sign = if k == 0 then "WORKSHOP ELECTRONICS FACTORY" else Rand.pick(r, { "ESTATE AUTO REPAIR", "STEEL CONSTRUCTION", "FURNITURE WORKSHOP" })
				Buildings.warehouse(m, CFrame.lookAt(pos, pos + look), s.x1 - s.x0 - 20, (s.z1 - s.z0) / 2 - 20, r, { sign = sign, chimney = k == 0 })
				if k == 0 then
					-- the factory office: buy a production line, run it, ship and sell what it makes
					local counterPos = pos + look * 4
					Commerce.servicePoint(m, CFrame.lookAt(counterPos, counterPos + look), "factory", poi.id, "Factory", "Production Office", 10)
				end
			end
			return m
		end,
		cinema = cinema,
		arena = arena,
		kebab = function(p, poi, r)
			return restaurant(p, poi, r, "DOWNTOWN DINER", { 200, 40, 30 }, 4)
		end,
		bakery = function(p, poi, r)
			return restaurant(p, poi, r, "STONE OVEN BAKERY", { 170, 110, 50 }, 2)
		end,
		pizzeria = function(p, poi, r)
			return restaurant(p, poi, r, "NAPOLI PIZZA", { 30, 130, 60 }, 5)
		end,
		fish = function(p, poi, r)
			return restaurant(p, poi, r, "HARBOUR FISH & CHIPS", { 30, 90, 150 }, 6)
		end,
		icecream = function(p, poi, r)
			return restaurant(p, poi, r, "SCOOP ICE CREAM", { 240, 120, 160 }, 4)
		end,
		gym = function(p, poi, r)
			return simpleBuilding(p, poi, r, "IRON GYM", "modern", 3, { 30, 30, 34 }, "shop")
		end,
		hotel = function(p, poi, r)
			return simpleBuilding(p, poi, r, "GRAND SEASIDE HOTEL", "modern", 12, { 160, 120, 40 })
		end,
	}
	for _, poi in L.pois do
		local fn = builders[poi.id]
		if fn and poi.site then
			local ok, err = pcall(fn, folder, poi, rng)
			if not ok then
				warn("[World] failed to build " .. poi.id .. ": " .. tostring(err))
				Commerce.lastError = err
			end
			if yieldFn then
				yieldFn()
			end
		end
	end
	return folder
end

return Commerce
