-- Blocks: the ordinary city fabric between the landmarks — houses, apartment blocks, office
-- towers, historic streets, warehouses and seaside hotels — chosen by district.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Props = require(Shared.Models.Props)
local Buildings = require(Shared.Models.Buildings)
local CityLayout = require(Shared.World.CityLayout)

local Blocks = {}
local M = Enum.Material
local P = B.Palette
local WALK_Y = CityLayout.WALK_Y

local GROUND = {
	SUB = { M.Grass, Color3.fromRGB(104, 146, 76) },
	SCH = { M.Pavement, Color3.fromRGB(190, 186, 176) },
	FIR = { M.Concrete, Color3.fromRGB(170, 168, 162) },
	UNI = { M.Grass, Color3.fromRGB(104, 150, 78) },
	PRK = { M.Grass, Color3.fromRGB(100, 150, 74) },
	HOS = { M.Pavement, Color3.fromRGB(200, 198, 192) },
	IND = { M.Concrete, Color3.fromRGB(150, 150, 146) },
	SCR = { M.Ground, Color3.fromRGB(110, 96, 80) },
	DAT = { M.Concrete, Color3.fromRGB(160, 162, 166) },
	OLD = { M.Cobblestone, Color3.fromRGB(176, 164, 146) },
	DWN = { M.Pavement, Color3.fromRGB(196, 192, 184) },
	PLZ = { M.Marble, Color3.fromRGB(226, 220, 206) },
	TEC = { M.Pavement, Color3.fromRGB(190, 192, 196) },
	TEP = { M.Pavement, Color3.fromRGB(190, 192, 196) },
	DLR = { M.Concrete, Color3.fromRGB(196, 196, 194) },
	SPT = { M.Grass, Color3.fromRGB(100, 150, 74) },
	LUN = { M.Pavement, Color3.fromRGB(214, 200, 190) },
	SEA = { M.Pavement, Color3.fromRGB(220, 212, 196) },
	CST = { M.Pavement, Color3.fromRGB(226, 216, 196) },
	HAR = { M.Concrete, Color3.fromRGB(140, 142, 144) },
	MAR = { M.WoodPlanks, Color3.fromRGB(170, 140, 100) },
}

function Blocks.ground(parent: Instance, block)
	local g = GROUND[block.district] or GROUND.DWN
	local w, d = block.x1 - block.x0, block.z1 - block.z0
	local base = B.box(parent, CFrame.new((block.x0 + block.x1) / 2, WALK_Y / 2, (block.z0 + block.z1) / 2), Vector3.new(w, WALK_Y, d), g[2], g[1])
	base.Name = "Ground"
	return base
end

-- Splits a strip into building lots of roughly `lot` width.
local function lots(x0: number, x1: number, lot: number, rng: Random)
	local out = {}
	local x = x0
	while x1 - x > lot * 0.6 do
		local w = math.min(x1 - x, lot * Rand.range(rng, 0.8, 1.25))
		if x1 - (x + w) < lot * 0.6 then
			w = x1 - x
		end
		table.insert(out, { x = x + w / 2, w = w })
		x += w
	end
	return out
end

-- Fills one half of a block. face = "n" (front on z0, facing north) or "s" (front on z1, facing south).
local function half(parent: Instance, block, face: string, rng: Random)
	local district = block.district
	local zFront = if face == "n" then block.z0 else block.z1
	local look = if face == "n" then Vector3.new(0, 0, -1) else Vector3.new(0, 0, 1)
	local depth = (block.z1 - block.z0) / 2 - 4
	local function frontCf(x: number, inset: number?)
		local p = Vector3.new(x, WALK_Y, zFront - look.Z * (inset or 0))
		return CFrame.lookAt(p, p + look)
	end

	if district == "SUB" then
		if rng:NextNumber() < 0.22 then
			-- a row of small apartment blocks with a corner shop
			for i, l in lots(block.x0 + 4, block.x1 - 4, 46, rng) do
				Buildings.building(parent, frontCf(l.x, 6), {
					w = l.w - 6, d = math.min(depth - 8, 30), floors = rng:NextInteger(3, 5), style = "apartment", rng = rng,
					ground = if i == 1 then "shop" else "plain", roof = if rng:NextNumber() < 0.4 then "gable" else nil,
				})
			end
		else
			for _, l in lots(block.x0 + 2, block.x1 - 2, 40, rng) do
				Buildings.house(parent, frontCf(l.x), l.w, depth, rng)
			end
		end
	elseif district == "DWN" then
		for _, l in lots(block.x0 + 2, block.x1 - 2, 62, rng) do
			local style = Rand.pick(rng, { "modern", "modern", "office", "office", "apartment" })
			local tall = rng:NextNumber() < 0.4
			Buildings.building(parent, frontCf(l.x, 4), {
				w = l.w - 4, d = math.min(depth - 4, 56), floors = if tall then rng:NextInteger(9, 16) else rng:NextInteger(4, 8),
				floorH = 13, style = style, rng = rng, ground = if rng:NextNumber() < 0.6 then "shop" else "lobby",
				name = if rng:NextNumber() < 0.5 then Rand.pick(rng, { "Plaza İş Merkezi", "Kule 34", "Atlas Ofis", "Merkez Han", "Yıldız Tower", "Business Park", "Global Center" }) else nil,
			})
		end
		for _ = 1, 2 do
			local x = Rand.range(rng, block.x0 + 12, block.x1 - 12)
			Props.planter(parent, frontCf(x, 3), rng)
		end
	elseif district == "OLD" then
		for _, l in lots(block.x0 + 1, block.x1 - 1, 22, rng) do
			Buildings.building(parent, frontCf(l.x, 1), {
				w = l.w - 0.5, d = math.min(depth - 2, 34), floors = rng:NextInteger(2, 4), floorH = 12, style = "historic", rng = rng,
				ground = "shop", shops = 1, roof = if rng:NextNumber() < 0.55 then "gable" else nil, blankSides = true,
			})
		end
	elseif district == "SEA" then
		for _, l in lots(block.x0 + 2, block.x1 - 2, 56, rng) do
			Buildings.building(parent, frontCf(l.x, 10), {
				w = l.w - 6, d = math.min(depth - 10, 36), floors = rng:NextInteger(5, 8), style = "apartment", rng = rng,
				ground = "shop", name = Rand.pick(rng, { "Martı Kafe", "Deniz Restoran", "Sahil Pansiyon", "Lagün Otel", "Mavi Bistro", "Yakamoz Cafe" }),
			})
			for t = 1, 3 do
				local x = l.x - l.w / 2 + 6 + t * (l.w - 12) / 4
				Props.parasolTable(parent, frontCf(x, 5), nil, rng)
			end
		end
	elseif district == "CST" then
		for _, l in lots(block.x0 + 2, block.x1 - 2, 36, rng) do
			local m = Buildings.building(parent, frontCf(l.x, 8), {
				w = l.w - 8, d = math.min(depth - 8, 24), floors = rng:NextInteger(1, 2), floorH = 12, style = "apartment",
				wallColor = { 246, 246, 242 }, rng = rng, ground = "shop", blankSides = true,
				name = Rand.pick(rng, { "Plaj Büfe", "Dalga Bar", "Kumsal Cafe", "Güneş Dondurma", "Balıkçı Sefa", "Ada Çay Bahçesi", "Sörf Kulübü" }),
				accent = Rand.pick(rng, { { 30, 110, 190 }, { 20, 150, 170 }, { 230, 120, 40 } }),
			})
			m.Name = "BeachHouse"
			Props.parasolTable(parent, frontCf(l.x - 6, 4), nil, rng)
			Props.parasolTable(parent, frontCf(l.x + 6, 4), nil, rng)
		end
	elseif district == "IND" or district == "HAR" then
		local w = block.x1 - block.x0 - 16
		Buildings.warehouse(parent, frontCf((block.x0 + block.x1) / 2, 10), w, math.min(depth - 14, 70), rng, {
			sign = Rand.pick(rng, { "ÖZTÜRK METAL", "ANADOLU LOJİSTİK", "EGE PLASTİK", "YILMAZ MAKİNA", "KARDEŞLER TEKSTİL", "MARMARA GIDA", "DEMİR DÖKÜM" }),
			chimney = rng:NextNumber() < 0.5,
		})
		for _ = 1, 4 do
			local x = Rand.range(rng, block.x0 + 10, block.x1 - 10)
			Props.pallet(parent, frontCf(x, 5))
		end
		Props.barrel(parent, frontCf(block.x0 + 8, 4), { 200, 60, 40 })
		Props.barrel(parent, frontCf(block.x0 + 11, 4))
	else
		-- anything else: a mid-rise mixed building
		Buildings.building(parent, frontCf((block.x0 + block.x1) / 2, 6), {
			w = block.x1 - block.x0 - 20, d = math.min(depth - 8, 40), floors = rng:NextInteger(3, 6), style = "apartment", rng = rng, ground = "shop",
		})
	end
end
Blocks.half = half

-- The service alley between the two rows of shop plots.
function Blocks.plotAlley(parent: Instance, block, rng: Random)
	local zMid = (block.z0 + block.z1) / 2
	B.box(parent, CFrame.new((block.x0 + block.x1) / 2, WALK_Y + 0.02, zMid), Vector3.new(block.x1 - block.x0 - 2, 0.06, 7), P.asphaltLight, M.Asphalt, { CanCollide = false })
	for _ = 1, 3 do
		local x = Rand.range(rng, block.x0 + 10, block.x1 - 10)
		local d = B.box(parent, CFrame.new(x, WALK_Y + 2.2, zMid), Vector3.new(6, 4.4, 3.4), Rand.pick(rng, { Color3.fromRGB(40, 110, 60), Color3.fromRGB(60, 60, 70), Color3.fromRGB(150, 60, 40) }), M.Metal)
		d.Name = "Dumpster"
	end
end

function Blocks.build(parent: Instance, yieldEvery: (() -> ())?)
	local L = CityLayout.get()
	local folder = B.folder("Blocks", parent)
	local rng = Random.new(7331)
	for _, block in L.blocks do
		local bm = B.model("Block_" .. block.id .. "_" .. block.district, folder)
		if block.district ~= "PRK" then
			Blocks.ground(bm, block)
		end
		if block.kind == "plots" then
			Blocks.plotAlley(bm, block, rng)
		else
			local used = { n = false, s = false }
			if block.pois then
				for _, pid in block.pois do
					local poi = L.poiById[pid]
					if poi and poi.site then
						if poi.site.face == "n" and poi.site.z1 < (block.z0 + block.z1) / 2 then
							used.n = true
						elseif poi.site.face == "s" then
							used.s = true
						else
							used.n, used.s = true, true
						end
					end
				end
			end
			if block.group then
				used.n, used.s = true, true
			end
			if not used.n then
				half(bm, block, "n", rng)
			end
			if not used.s then
				half(bm, block, "s", rng)
			end
		end
		if yieldEvery then
			yieldEvery()
		end
	end
	return folder
end

return Blocks
