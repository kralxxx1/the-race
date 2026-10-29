-- Blocks: the ordinary city fabric between the landmarks — houses, apartment blocks, office
-- towers, historic streets, warehouses and seaside hotels — chosen by district.
-- Downtown, the tech quarter, the seaside and apartment rows use real buildings from Roblox's
-- City Building Pack and Modular Building Kit (assets/server/CityBuildings), each scaled to its
-- lot; everything else (and any lot nothing fits on) is built from parts.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Props = require(Shared.Models.Props)
local Buildings = require(Shared.Models.Buildings)
local CityLayout = require(Shared.World.CityLayout)
local Assets = require(Shared.Util.Assets)

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

----------------------------------------------------------------------------------------------------
-- Real buildings
----------------------------------------------------------------------------------------------------
local TOWERS_CLASSIC = { "Tower01", "Tower02", "Tower03", "Tower04", "Tower05" }
local TOWERS_OFFICE = { "Tower06", "Tower07", "Tower08", "Tower09", "Tower12" }
local KITS = { "KitA", "KitB", "KitC", "KitE", "KitF", "KitG", "KitH", "KitI", "KitJ", "KitK" }
local KITS_LOW = { "KitA", "KitB", "KitC", "KitE", "KitF", "KitG" }

export type Choice = { name: string, turn: number, s: number, fw: number, fd: number }

-- The building from `names` that fits a w x d lot best at a believable scale (closest to pref,
-- never below minScale), turned a quarter if that fits better. nil when nothing fits.
local function chooseBuilding(names: { string }, w: number, d: number, rng: Random, pref: number, minScale: number): Choice?
	local options = {}
	for _, name in names do
		local size = Assets.size("CityBuildings", name)
		if size then
			for _, turn in { 0, 90 } do
				local fw = if turn == 0 then size.X else size.Z
				local fd = if turn == 0 then size.Z else size.X
				local s = math.min(pref, w / fw, d / fd)
				if s >= minScale then
					table.insert(options, { name = name, turn = turn, s = s, fw = fw * s, fd = fd * s, score = math.abs(s - pref) / pref + rng:NextNumber() * 0.2 })
				end
			end
		end
	end
	if #options == 0 then
		return nil
	end
	table.sort(options, function(a, b)
		return a.score < b.score
	end)
	local c = options[rng:NextInteger(1, math.min(3, #options))]
	return { name = c.name, turn = c.turn, s = c.s, fw = c.fw, fd = c.fd }
end
Blocks.chooseBuilding = chooseBuilding

-- Greenery for the gap between two buildings: a tree in a planter bed and a bench.
local function pocketGarden(parent: Instance, cf: CFrame, w: number, rng: Random)
	if w < 6 then
		return
	end
	B.box(parent, cf * CFrame.new(0, 0.3, 0), Vector3.new(math.min(w - 2, 10), 0.6, 8), Color3.fromRGB(96, 74, 52), M.Ground, { Name = "GardenBed" })
	-- a tree that fits between the walls (a shrub in a narrow gap)
	Props.tree(parent, cf * CFrame.new(0, 0.6, 0), if w >= 16 then "street" else "bush", rng)
	if w >= 12 then
		Props.bench(parent, cf * CFrame.new(0, 0, -5.5))
	end
end

-- A row of real buildings between x0 and x1 along the street. steps: { names, pref, min } tried in
-- turn for each building; the gaps left over become small gardens. Returns how many were placed.
local function realRow(parent: Instance, frontAt: (number, number?) -> CFrame, x0: number, x1: number, d: number, rng: Random, steps, gap: number?): number
	local x, placed, step = x0, 0, 1
	gap = gap or 3
	while x1 - x > 20 do
		-- this step's kind of building, or the next kind that fits what's left
		local plan, c = nil, nil
		for k = math.min(step, #steps), #steps do
			plan = steps[k]
			c = chooseBuilding(plan.names, math.min(x1 - x, plan.maxW or math.huge), d, rng, plan.pref, plan.min)
			if c then
				step = k
				break
			end
		end
		if not c or not plan then
			break
		end
		local m = Assets.place(parent, "CityBuildings", c.name, frontAt(x + c.fw / 2, c.fd / 2 + (plan.inset or 0)) * CFrame.Angles(0, math.rad(c.turn), 0), c.s)
		if m then
			m:SetAttribute("Real", true)
			placed += 1
		end
		x += c.fw + gap
		step += 1
	end
	if x1 - x > 6 then
		pocketGarden(parent, frontAt((x + x1) / 2, 6), x1 - x, rng)
	end
	return placed
end
Blocks.realRow = realRow

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
		if rng:NextNumber() < 0.22 and Assets.get("CityBuildings", "KitA") then
			-- a row of brick apartment blocks with shops on the ground floor
			realRow(parent, frontCf, block.x0 + 4, block.x1 - 4, depth - 10, rng, { { names = KITS_LOW, pref = 0.88, min = 0.7, inset = 4 } }, 2)
		elseif rng:NextNumber() < 0.22 then
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
	elseif district == "DWN" and Assets.get("CityBuildings", "Tower01") then
		-- a tower (classic or glass) and mid-rise kit buildings beside it
		local towers = if rng:NextNumber() < 0.5 then TOWERS_CLASSIC else TOWERS_OFFICE
		local tower = { names = towers, pref = 0.72, min = 0.5, maxW = 140, inset = 4 }
		local kit = { names = KITS, pref = 0.9, min = 0.7, inset = 4 }
		local steps = if rng:NextNumber() < 0.4 then { kit, tower, kit } else { tower, kit }
		realRow(parent, frontCf, block.x0 + 4, block.x1 - 4, depth - 10, rng, steps)
		for _ = 1, 2 do
			local x = Rand.range(rng, block.x0 + 12, block.x1 - 12)
			Props.planter(parent, frontCf(x, 1.6), rng)
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
	elseif district == "SEA" and Assets.get("CityBuildings", "KitA") then
		-- seafront hotels and apartments with café tables on the pavement in front
		realRow(parent, frontCf, block.x0 + 4, block.x1 - 4, depth - 14, rng, { { names = KITS, pref = 0.9, min = 0.7, inset = 10 } }, 4)
		for t = 1, 6 do
			local x = block.x0 + 10 + (t - 0.5) * (block.x1 - block.x0 - 20) / 6
			Props.parasolTable(parent, frontCf(x, 5), nil, rng)
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
	elseif Assets.get("CityBuildings", "Tower07") then
		-- anything else (the tech quarter...): glass offices and kit buildings
		realRow(parent, frontCf, block.x0 + 6, block.x1 - 6, depth - 8, rng, { { names = TOWERS_OFFICE, pref = 0.7, min = 0.5, maxW = 130, inset = 2 }, { names = KITS, pref = 0.9, min = 0.7, inset = 2 } }, 4)
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
	-- three dumpsters spread along the alley (never in each other)
	for k = 1, 3 do
		local x = block.x0 + (block.x1 - block.x0) * (k - 0.5) / 3 + Rand.range(rng, -12, 12)
		local d = B.box(parent, CFrame.new(x, WALK_Y + 2.2, zMid), Vector3.new(6, 4.4, 3.4), Rand.pick(rng, { Color3.fromRGB(40, 110, 60), Color3.fromRGB(60, 60, 70), Color3.fromRGB(150, 60, 40) }), M.Metal)
		d.Name = "Dumpster"
	end
end

-- Landmarks rarely need their whole half-block: the strips beside them along the street get real
-- buildings too, so no lot is left empty. Runs after the landmarks are built and measures what
-- each one actually covers.
local FILL = {
	DWN = "office", TEC = "office", TEP = "office", DAT = "office", HOS = "office", SCH = "office", FIR = "office",
	DLR = "kit", OLD = "kit", SEA = "kit", SUB = "kit", PLZ = "kit", LUN = "kit",
}
function Blocks.fillPoiSites(world: Instance, rng: Random): number
	if not Assets.get("CityBuildings", "KitA") then
		return 0
	end
	local L = CityLayout.get()
	-- where each landmark's parts are, by site
	local sites = {}
	for _, poi in L.pois do
		local st = poi.site
		local block = L.blocks[poi.block]
		if st and block and FILL[block.district] and (st.z1 - st.z0) < (block.z1 - block.z0) * 0.75 then
			table.insert(sites, { poi = poi, st = st, block = block, lo = math.huge, hi = -math.huge })
		end
	end
	for _, folderName in { "Commerce", "Civic", "Nature" } do
		local f = world:FindFirstChild(folderName)
		for _, d in if f then f:GetDescendants() else {} do
			if d:IsA("BasePart") then -- markers count too: spawn points must stay clear
				local p = d.Position
				for _, s in sites do
					local st = s.st
					if p.X >= st.x0 and p.X <= st.x1 and p.Z >= st.z0 and p.Z <= st.z1 then
						-- half the part's extent along X, rotation included
						local cf, sz = d.CFrame, d.Size
						local half = (math.abs(cf.RightVector.X) * sz.X + math.abs(cf.UpVector.X) * sz.Y + math.abs(cf.LookVector.X) * sz.Z) / 2
						s.lo = math.min(s.lo, p.X - half)
						s.hi = math.max(s.hi, p.X + half)
					end
				end
			end
		end
	end
	local placed = 0
	for _, s in sites do
		local st = s.st
		local look = if st.face == "s" then Vector3.new(0, 0, 1) else Vector3.new(0, 0, -1)
		local zFront = if st.face == "s" then st.z1 else st.z0
		local function frontCf(x: number, inset: number?)
			local p = Vector3.new(x, WALK_Y, zFront - look.Z * (inset or 0))
			return CFrame.lookAt(p, p + look)
		end
		local depth = st.z1 - st.z0 - 8
		local kind = FILL[s.block.district]
		local steps = if kind == "office"
			then { { names = TOWERS_OFFICE, pref = 0.7, min = 0.5, maxW = 120, inset = 4 }, { names = KITS, pref = 0.9, min = 0.7, inset = 4 } }
			else { { names = KITS_LOW, pref = 0.88, min = 0.7, inset = 4 } }
		local m = B.model("Fill_" .. s.poi.id, world:FindFirstChild("Blocks") or world)
		local lo = if s.lo == math.huge then (st.x0 + st.x1) / 2 else s.lo
		local hi = if s.hi == -math.huge then (st.x0 + st.x1) / 2 else s.hi
		if lo - 8 - (st.x0 + 4) >= 30 then
			placed += realRow(m, frontCf, st.x0 + 4, lo - 8, depth, rng, steps)
		end
		if (st.x1 - 4) - (hi + 8) >= 30 then
			placed += realRow(m, frontCf, hi + 8, st.x1 - 4, depth, rng, steps)
		end
		if #m:GetChildren() == 0 then
			m:Destroy()
		end
	end
	return placed
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
