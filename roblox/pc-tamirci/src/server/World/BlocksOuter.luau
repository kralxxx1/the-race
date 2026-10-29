-- BlocksOuter: the ordinary blocks of the outer districts, one half-block at a time.
--   OSB  organised industrial zone: factory halls, flour silos, a tank farm, a solar field, a
--        cross-dock with trucks at the doors, a timber yard
--   BLK  fishing village: whitewashed cottages, boats on trailers and nets drying out the back
--   VIL  villa hill: two walled villas with pools per half-block
--   YZL  summer houses: a row of small holiday homes with terraces
-- Blocks.half hands over to these with the half's frame: ctx.frontCf(x, inset) stands on the
-- pavement edge facing the street (the lot extends to +Z), ctx.depth is how deep the half is.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Props = require(Shared.Models.Props)
local Buildings = require(Shared.Models.Buildings)

local OuterProps = require(script.Parent.OuterProps)

local BlocksOuter = {}
local M = Enum.Material
local nc = OuterProps.nc

-- Splits x0..x1 into lots of roughly `lot` width.
local function lots(x0: number, x1: number, lot: number, rng: Random)
	local out = {}
	local x = x0
	while x1 - x > lot * 0.6 do
		local w = math.min(x1 - x, lot * Rand.range(rng, 0.85, 1.15))
		if x1 - (x + w) < lot * 0.6 then
			w = x1 - x
		end
		table.insert(out, { x = x + w / 2, w = w })
		x += w
	end
	return out
end

local function sign(parent: Instance, cf: CFrame, text: string, w: number, color: any)
	local board = B.box(parent, cf * CFrame.new(0, 5.4, 0), Vector3.new(w, 3, 0.4), B.color(color), M.SmoothPlastic)
	B.sign(board, Enum.NormalId.Front, text, { color = Color3.new(1, 1, 1), font = B.Fonts.Heavy })
	for _, sx in { -1, 1 } do
		B.box(parent, cf * CFrame.new(sx * (w / 2 - 1), 1.95, 0), Vector3.new(0.4, 3.9, 0.4), Color3.fromRGB(70, 70, 76), M.Metal)
	end
	return board
end

----------------------------------------------------------------------------------------------------
-- OSB: organised industrial zone
----------------------------------------------------------------------------------------------------
local FIRMS = {
	"ÇELİK BORU A.Ş.", "ANADOLU KABLO", "EGE OTOMOTİV", "TEKNİK PLASTİK", "MARMARA AMBALAJ", "KORKMAZ MOBİLYA",
	"SİLİKON ELEKTRONİK", "YILDIZ ENERJİ", "DEMİRTAŞ MAKİNE", "AKDENİZ TEKSTİL", "KUZEY ALÜMİNYUM", "BAŞKENT BOYA",
}

local function factory(parent: Instance, ctx, block, rng: Random)
	local w = block.x1 - block.x0 - 24
	local cx = (block.x0 + block.x1) / 2
	Buildings.warehouse(parent, ctx.frontCf(cx, 16), w, math.min(ctx.depth - 20, 60), rng, { sign = Rand.pick(rng, FIRMS), chimney = rng:NextNumber() < 0.6 })
	-- a truck at the kerb, pallets by the doors
	OuterProps.truck(parent, ctx.frontCf(cx - w / 4, 7.5) * CFrame.Angles(0, math.pi / 2, 0), rng)
	for i = 1, 3 do
		Props.pallet(parent, ctx.frontCf(cx + w / 6 + i * 6, 11))
	end
end

local function silos(parent: Instance, ctx, block, rng: Random)
	local x0, x1 = block.x0 + 20, block.x1 - 20
	local n = 5
	local step = (x1 - x0 - 50) / (n - 1)
	local metal = Color3.fromRGB(206, 208, 212)
	local inset = 30
	for i = 0, n - 1 do
		local c = ctx.frontCf(x0 + 50 + i * step, inset)
		B.cylY(parent, c * CFrame.new(0, 21, 0), 42, 15, metal, M.Metal)
		B.ball(parent, c * CFrame.new(0, 42, 0), 15, metal, M.Metal)
		B.box(parent, c * CFrame.new(0, 21, -7.6), Vector3.new(1.2, 42, 0.4), Color3.fromRGB(150, 150, 156), M.Metal, nc())
	end
	-- the conveyor gallery along the tops and the mill house at one end
	local mid = ctx.frontCf((x0 + 50 + x0 + 50 + (n - 1) * step) / 2, inset)
	B.box(parent, mid * CFrame.new(0, 47, 0), Vector3.new((n - 1) * step + 6, 4, 5), Color3.fromRGB(170, 172, 176), M.Metal)
	local mill = ctx.frontCf(x0 + 16, 24)
	B.box(parent, mill * CFrame.new(0, 26, 10), Vector3.new(26, 52, 20), Color3.fromRGB(226, 220, 204), M.Concrete)
	B.box(parent, mill * CFrame.new(0, 48, 0.2), Vector3.new(20, 4, 0.4), Color3.fromRGB(180, 40, 40), M.SmoothPlastic)
	local label = B.box(parent, mill * CFrame.new(0, 40, -0.2), Vector3.new(22, 5, 0.4), Color3.fromRGB(180, 40, 40), M.SmoothPlastic)
	B.sign(label, Enum.NormalId.Front, Rand.pick(rng, { "BEREKET UN", "ANADOLU YEM", "ALTIN BAŞAK UN", "TOPRAK TARIM" }), { color = Color3.new(1, 1, 1) })
	OuterProps.truck(parent, ctx.frontCf(x1 - 30, 8) * CFrame.Angles(0, -math.pi / 2, 0), rng)
end

local function tanks(parent: Instance, ctx, block, rng: Random)
	local cx = (block.x0 + block.x1) / 2
	local w = block.x1 - block.x0 - 30
	local d = math.min(ctx.depth - 16, 64)
	local base = ctx.frontCf(cx, 12)
	-- the bund wall around the tanks
	local wallCol = Color3.fromRGB(176, 176, 172)
	B.box(parent, base * CFrame.new(0, 1.5, 0), Vector3.new(w, 3, 1), wallCol, M.Concrete)
	B.box(parent, base * CFrame.new(0, 1.5, d), Vector3.new(w, 3, 1), wallCol, M.Concrete)
	for _, sx in { -1, 1 } do
		B.box(parent, base * CFrame.new(sx * w / 2, 1.5, d / 2), Vector3.new(1, 3, d), wallCol, M.Concrete)
	end
	local cols = { Color3.fromRGB(240, 240, 236), Color3.fromRGB(226, 228, 230) }
	local k = 0
	for _, fx in { -0.25, 0.25 } do
		for _, fz in { 0.3, 0.72 } do
			k += 1
			local t = base * CFrame.new(fx * w, 0, fz * d)
			local dia = math.min(w / 2 - 12, d * 0.4)
			B.cylY(parent, t * CFrame.new(0, 9, 0), 18, dia, cols[k % 2 + 1], M.Metal)
			B.cylY(parent, t * CFrame.new(0, 18.3, 0), 0.6, dia - 2, Color3.fromRGB(190, 190, 194), M.Metal)
			B.box(parent, t * CFrame.new(dia / 2 + 0.3, 9, 0), Vector3.new(0.6, 18, 1.2), Color3.fromRGB(220, 180, 40), M.Metal, nc())
		end
	end
	-- the pipe rack between them
	B.cyl(parent, base * CFrame.new(0, 6, d / 2), w - 4, 1.6, Color3.fromRGB(150, 60, 50), M.Metal)
	B.cyl(parent, base * CFrame.new(0, 8, d / 2), w - 4, 1.2, Color3.fromRGB(60, 100, 160), M.Metal)
	for _, x in { -w / 2 + 3, 0, w / 2 - 3 } do
		B.box(parent, base * CFrame.new(x, 4.3, d / 2), Vector3.new(0.8, 8.6, 0.8), Color3.fromRGB(90, 90, 96), M.Metal)
	end
	sign(parent, ctx.frontCf(block.x0 + 26, 4), Rand.pick(rng, { "YILDIZ ENERJİ DEPOLAMA", "EGE KİMYA", "MARMARA YAĞ" }), 26, { 30, 60, 110 })
end

local function solar(parent: Instance, ctx, block, rng: Random)
	local cx = (block.x0 + block.x1) / 2
	local w = block.x1 - block.x0 - 24
	local gravel = Color3.fromRGB(176, 170, 160)
	local d = ctx.depth - 6
	local base = ctx.frontCf(cx, 4)
	B.box(parent, base * CFrame.new(0, 0.1, d / 2), Vector3.new(w, 0.2, d), gravel, M.Slate)
	local rows = math.floor((d - 8) / 12)
	for r = 0, rows - 1 do
		local z = 8 + r * 12
		-- panels tilted towards the sun (south), on a row of legs
		local panel = CFrame.new((base * CFrame.new(0, 3.2, z)).Position) * CFrame.Angles(math.rad(25), 0, 0)
		B.box(parent, panel, Vector3.new(w - 8, 0.3, 7), Color3.fromRGB(30, 44, 80), M.Glass, { Reflectance = 0.2 })
		for _, x in { -w / 2 + 6, 0, w / 2 - 6 } do
			B.box(parent, base * CFrame.new(x, 1.6, z), Vector3.new(0.5, 3.2, 0.5), Color3.fromRGB(150, 150, 156), M.Metal)
		end
	end
	B.box(parent, base * CFrame.new(w / 2 - 8, 3, d - 6), Vector3.new(8, 6, 5), Color3.fromRGB(220, 222, 226), M.Metal)
	sign(parent, ctx.frontCf(block.x0 + 24, 2), Rand.pick(rng, { "GÜNEŞ ENERJİ SANTRALİ", "OSB GES 1", "YEŞİL ENERJİ A.Ş." }), 24, { 40, 120, 60 })
end

local function logistics(parent: Instance, ctx, block, rng: Random)
	local cx = (block.x0 + block.x1) / 2
	local w = block.x1 - block.x0 - 20
	local inset = 44
	local d = math.max(20, ctx.depth - inset - 2)
	local hall = ctx.frontCf(cx, inset)
	local col = B.color(Rand.pick(rng, { { 210, 212, 214 }, { 196, 186, 160 }, { 150, 170, 190 } }))
	B.box(parent, hall * CFrame.new(0, 7, d / 2), Vector3.new(w, 14, d), col, M.Metal)
	B.box(parent, hall * CFrame.new(0, 14.3, d / 2), Vector3.new(w + 1, 0.6, d + 1), Color3.fromRGB(120, 120, 124), M.Concrete)
	local label = B.box(parent, hall * CFrame.new(0, 12, -0.2), Vector3.new(math.min(40, w - 10), 3, 0.4), Color3.fromRGB(240, 120, 30), M.SmoothPlastic)
	B.sign(label, Enum.NormalId.Front, Rand.pick(rng, { "ANADOLU LOJİSTİK MERKEZİ", "MARMARA KARGO AKTARMA", "OSB DEPOLAMA" }), { color = Color3.new(1, 1, 1) })
	local doors = math.floor(w / 18)
	for i = 1, doors do
		local x = -w / 2 + (i - 0.5) * w / doors
		B.box(parent, hall * CFrame.new(x, 4.5, -0.2), Vector3.new(10, 9, 0.4), Color3.fromRGB(110, 116, 124), M.DiamondPlate)
		B.box(parent, hall * CFrame.new(x, 1, -1.5), Vector3.new(11, 2, 3), Color3.fromRGB(60, 60, 64), M.Rubber)
		if i % 2 == 1 then
			-- a truck backed onto this door (nose to the street)
			OuterProps.truck(parent, ctx.frontCf(cx + x, inset - 20.4), rng)
		end
	end
end

local function lumber(parent: Instance, ctx, block, rng: Random)
	local cx = (block.x0 + block.x1) / 2
	local w = block.x1 - block.x0 - 24
	local log = Color3.fromRGB(150, 110, 74)
	-- log piles: three rows stacked in a pyramid
	for p = 0, 2 do
		local base = ctx.frontCf(cx - w / 2 + 20 + p * 30, 16)
		for row = 0, 2 do
			for k = 0, 2 - row do
				B.cylZ(parent, base * CFrame.new((k - (2 - row) / 2) * 3.4, 1.7 + row * 2.9, 10), 20, 3.4, log, M.Wood)
			end
		end
	end
	-- plank stacks and an open shed
	for p = 0, 1 do
		local c = ctx.frontCf(cx + 14 + p * 14, 14)
		for k = 0, 3 do
			B.box(parent, c * CFrame.new(0, 0.5 + k, 8), Vector3.new(8, 1, 16), Color3.fromRGB(214, 180, 130), M.WoodPlanks)
		end
	end
	local shed = ctx.frontCf(cx + w / 2 - 24, 40)
	B.box(parent, shed * CFrame.new(0, 14.4, 12), Vector3.new(40, 0.8, 28), Color3.fromRGB(120, 60, 50), M.CorrodedMetal)
	for _, sx in { -1, 1 } do
		for _, z in { 0, 24 } do
			B.box(parent, shed * CFrame.new(sx * 19, 7, z), Vector3.new(1, 14, 1), Color3.fromRGB(110, 80, 60), M.Wood)
		end
	end
	sign(parent, ctx.frontCf(block.x0 + 22, 3), Rand.pick(rng, { "KORKMAZ KERESTE", "ORMAN ÜRÜNLERİ", "ÇAM KERESTE" }), 22, { 110, 70, 40 })
end

local OSB_KINDS = { factory, factory, factory, silos, tanks, solar, logistics, logistics, lumber }

function BlocksOuter.OSB(parent: Instance, block, _face: string, ctx, rng: Random)
	Rand.pick(rng, OSB_KINDS)(parent, ctx, block, rng)
end

----------------------------------------------------------------------------------------------------
-- BLK: fishing village
----------------------------------------------------------------------------------------------------
function BlocksOuter.BLK(parent: Instance, block, _face: string, ctx, rng: Random)
	for _, l in lots(block.x0 + 2, block.x1 - 2, 20, rng) do
		OuterProps.cottage(parent, ctx.frontCf(l.x, 1), l.w, rng)
	end
	-- the backyards: boats on trailers, nets drying on a frame, a stack of fish crates
	local back = ctx.depth - 18
	for i = 0, 1 do
		local x = block.x0 + 30 + i * (block.x1 - block.x0 - 60)
		Props.boat(parent, ctx.frontCf(x, back) * CFrame.Angles(0, math.pi / 2, 0) * CFrame.new(0, 0.6, 0), nil, rng)
		B.box(parent, ctx.frontCf(x, back) * CFrame.new(0, 0.3, 0), Vector3.new(4, 0.6, 12), Color3.fromRGB(70, 70, 76), M.Metal)
	end
	local net = ctx.frontCf((block.x0 + block.x1) / 2, back)
	for _, sx in { -1, 1 } do
		B.box(parent, net * CFrame.new(sx * 8, 3, 0), Vector3.new(0.5, 6, 0.5), Color3.fromRGB(120, 90, 60), M.Wood)
	end
	B.box(parent, net * CFrame.new(0, 5.8, 0), Vector3.new(16.5, 0.4, 0.4), Color3.fromRGB(120, 90, 60), M.Wood)
	B.box(parent, net * CFrame.new(0, 3.6, 0), Vector3.new(15, 4.2, 0.15), Rand.pick(rng, { Color3.fromRGB(200, 70, 50), Color3.fromRGB(60, 120, 160), Color3.fromRGB(80, 140, 90) }), M.Fabric, nc({ Transparency = 0.35 }))
	for k = 0, 2 do
		B.box(parent, net * CFrame.new(12, 0.9 + k * 1.6, 3), Vector3.new(3, 1.6, 2.2), Color3.fromRGB(80, 140, 200), M.Plastic)
	end
end

----------------------------------------------------------------------------------------------------
-- VIL: villa hill
----------------------------------------------------------------------------------------------------
function BlocksOuter.VIL(parent: Instance, block, _face: string, ctx, rng: Random)
	for _, l in lots(block.x0 + 2, block.x1 - 2, 94, rng) do
		OuterProps.villa(parent, ctx.frontCf(l.x, 0), l.w, ctx.depth, rng)
	end
end

----------------------------------------------------------------------------------------------------
-- YZL: summer houses
----------------------------------------------------------------------------------------------------
function BlocksOuter.YZL(parent: Instance, block, _face: string, ctx, rng: Random)
	for _, l in lots(block.x0 + 2, block.x1 - 2, 22, rng) do
		OuterProps.summerHouse(parent, ctx.frontCf(l.x, 1), l.w, rng)
	end
	-- a hedge down the middle of the block between the two rows of gardens
	local mid = ctx.frontCf((block.x0 + block.x1) / 2, ctx.depth + 2)
	B.box(parent, mid * CFrame.new(0, 1.6, 0), Vector3.new(block.x1 - block.x0 - 6, 3.2, 1.6), Color3.fromRGB(70, 116, 58), M.LeafyGrass)
end

return BlocksOuter
