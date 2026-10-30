-- OuterProps: the cheap, many-times-repeated things of the outer districts — parked cars and
-- trucks, airliners, caravans, golf carts, whitewashed cottages, villas and summer houses. Each is
-- a handful of parts so whole car parks and streets of them stay affordable on a 60-player server.
--
-- Local frame for everything: cf stands on the ground, the front faces cf.LookVector.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Props = require(Shared.Models.Props)

local OuterProps = {}
local M = Enum.Material

local function nc(extra)
	local t = { CanCollide = false, CanTouch = false }
	if extra then
		for k, v in extra do
			t[k] = v
		end
	end
	return t
end
OuterProps.nc = nc

-- A flat slab whose top is at `top` (x0..x1, z0..z1 in world axes).
function OuterProps.slab(parent: Instance, x0: number, z0: number, x1: number, z1: number, top: number, color: any, material: Enum.Material?, props: { [string]: any }?): BasePart
	return B.box(parent, CFrame.new((x0 + x1) / 2, top - 0.15, (z0 + z1) / 2), Vector3.new(x1 - x0, 0.3, z1 - z0), color, material, props)
end

-- A painted line lying on a surface (cf at the line's centre, on the surface).
function OuterProps.paint(parent: Instance, cf: CFrame, w: number, d: number, color: any?): BasePart
	return B.box(parent, cf * CFrame.new(0, 0.02, 0), Vector3.new(w, 0.04, d), color or Color3.fromRGB(240, 240, 236), M.SmoothPlastic, nc({ CastShadow = false }))
end

local CAR_COLORS = {
	{ 240, 240, 238 }, { 30, 30, 34 }, { 180, 182, 188 }, { 120, 20, 30 }, { 30, 60, 120 },
	{ 200, 40, 40 }, { 90, 96, 104 }, { 240, 200, 50 }, { 50, 110, 80 }, { 150, 120, 90 },
}
local GLASS = Color3.fromRGB(40, 56, 70)
local TYRE = Color3.fromRGB(24, 24, 26)

local function wheels(m: Instance, cf: CFrame, track: number, base: number, d: number, width: number)
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			B.cyl(m, cf * CFrame.new(sx * track / 2, d / 2, sz * base / 2), width, d, TYRE, M.Rubber)
		end
	end
end

-- A parked car (7 parts).
function OuterProps.car(parent: Instance, cf: CFrame, rng: Random, color: any?): Model
	local m = B.model("ParkedCar", parent)
	local col = B.color(color or Rand.pick(rng, CAR_COLORS))
	local long = Rand.range(rng, 9.4, 10.6)
	B.box(m, cf * CFrame.new(0, 1.65, 0), Vector3.new(4.6, 1.5, long), col, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 3.05, 0.5), Vector3.new(4.2, 1.3, long * 0.5), col, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 3.0, 0.5), Vector3.new(4.3, 0.9, long * 0.5 + 0.1), GLASS, M.Glass, nc({ Transparency = 0.15 }))
	wheels(m, cf, 4.1, long * 0.62, 1.8, 0.8)
	return m
end

-- A truck: cab and box trailer (9 parts).
local TRUCK_NAMES = { "NORTHERN LOGISTICS", "COASTAL FREIGHT", "PACIFIC CARGO", "STARLINE TRANSPORT", "ARCTIC COLD CHAIN", "ESTATE EXPRESS" }
function OuterProps.truck(parent: Instance, cf: CFrame, rng: Random): Model
	local m = B.model("Truck", parent)
	local cab = B.color(Rand.pick(rng, { { 240, 240, 238 }, { 200, 40, 40 }, { 30, 70, 150 }, { 240, 170, 30 }, { 40, 120, 70 } }))
	-- cab at the front (-Z), trailer behind it
	B.box(m, cf * CFrame.new(0, 4.6, -16), Vector3.new(8, 7, 7), cab, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 6.4, -19.55), Vector3.new(7, 2.6, 0.2), GLASS, M.Glass, nc({ Transparency = 0.15 }))
	B.box(m, cf * CFrame.new(0, 1.6, -2), Vector3.new(6, 1.2, 36), Color3.fromRGB(50, 50, 54), M.Metal)
	local box = B.box(m, cf * CFrame.new(0, 7.2, 4), Vector3.new(8.4, 10, 30), Color3.fromRGB(236, 236, 232), M.SmoothPlastic)
	B.sign(box, Enum.NormalId.Right, Rand.pick(rng, TRUCK_NAMES), { color = Color3.fromRGB(30, 50, 110), pixelsPerStud = 8 })
	for _, z in { -16, 0, 14 } do
		for _, sx in { -1, 1 } do
			B.cyl(m, cf * CFrame.new(sx * 3.4, 1.4, z), 1.2, 2.8, TYRE, M.Rubber)
		end
	end
	return m
end

-- A passenger jet (about 24 parts). s = scale (1.4 is believable next to a player).
local LIVERIES = {
	{ name = "NORTHWIND AIR", color = { 200, 30, 40 } },
	{ name = "PACIFIC JET", color = { 30, 80, 170 } },
	{ name = "AEGEAN SKY", color = { 20, 150, 150 } },
	{ name = "CANYON AIR", color = { 230, 130, 30 } },
}
function OuterProps.airliner(parent: Instance, cf: CFrame, s: number, livery: number?): Model
	local m = B.model("Airliner", parent)
	local L = LIVERIES[((livery or 1) - 1) % #LIVERIES + 1]
	local white = Color3.fromRGB(244, 244, 246)
	local accent = B.color(L.color)
	local y = 8 * s
	-- fuselage, nose, tail cone (nose towards -Z)
	B.cylZ(m, cf * CFrame.new(0, y, 0), 70 * s, 9 * s, white, M.SmoothPlastic)
	B.ellipsoid(m, cf * CFrame.new(0, y, -35 * s), Vector3.new(9 * s, 9 * s, 14 * s), white, M.SmoothPlastic)
	B.wedge(m, cf * CFrame.new(0, y + 0.5 * s, 40 * s) * CFrame.Angles(math.pi, 0, 0), Vector3.new(8 * s, 8 * s, 10 * s), white, M.SmoothPlastic)
	-- windows and the livery stripe
	B.box(m, cf * CFrame.new(0, y + 1.4 * s, -2 * s), Vector3.new(9.1 * s, 0.9 * s, 58 * s), Color3.fromRGB(30, 40, 60), M.SmoothPlastic, nc())
	B.box(m, cf * CFrame.new(0, y - 1.4 * s, 0), Vector3.new(9.15 * s, 1.2 * s, 66 * s), accent, M.SmoothPlastic, nc())
	B.box(m, cf * CFrame.new(0, y + 1.3 * s, -38.6 * s) * CFrame.Angles(math.rad(-25), 0, 0), Vector3.new(5 * s, 1.2 * s, 2.6 * s), Color3.fromRGB(30, 40, 60), M.Glass, nc())
	-- tail: fin, stabilisers
	local fin = B.wedge(m, cf * CFrame.new(0, y + 4.5 * s + 7 * s, 39 * s), Vector3.new(0.9 * s, 14 * s, 12 * s), accent, M.SmoothPlastic)
	fin.Name = "Fin"
	B.box(m, cf * CFrame.new(0, y + 2 * s, 41 * s), Vector3.new(26 * s, 0.7 * s, 6 * s), white, M.SmoothPlastic)
	-- swept wings with winglets and engines
	for _, side in { -1, 1 } do
		local wing = cf * CFrame.new(side * 17 * s, y - 3 * s, 3 * s) * CFrame.Angles(0, side * math.rad(-14), 0)
		B.box(m, wing, Vector3.new(34 * s, 0.9 * s, 10 * s), white, M.SmoothPlastic)
		B.box(m, wing * CFrame.new(side * 16.6 * s, 2 * s, 2.5 * s), Vector3.new(0.6 * s, 4 * s, 3 * s), accent, M.SmoothPlastic)
		local eng = cf * CFrame.new(side * 12 * s, y - 6 * s, -2 * s)
		B.cylZ(m, eng, 10 * s, 5 * s, Color3.fromRGB(220, 222, 226), M.Metal)
		B.cylZ(m, eng * CFrame.new(0, 0, -5.05 * s), 0.2 * s, 4.2 * s, Color3.fromRGB(40, 42, 46), M.Metal, nc())
		-- main gear
		B.cylY(m, cf * CFrame.new(side * 4 * s, (y - 4 * s) / 2 + 0.6 * s, 4 * s), y - 4 * s, 0.8 * s, Color3.fromRGB(150, 150, 156), M.Metal)
		B.cyl(m, cf * CFrame.new(side * 4 * s, 1.2 * s, 4 * s), 1.6 * s, 2.4 * s, TYRE, M.Rubber)
	end
	-- nose gear
	B.cylY(m, cf * CFrame.new(0, (y - 4.5 * s) / 2 + 0.5 * s, -27 * s), y - 4.5 * s, 0.6 * s, Color3.fromRGB(150, 150, 156), M.Metal)
	B.cyl(m, cf * CFrame.new(0, 1 * s, -27 * s), 1.2 * s, 2 * s, TYRE, M.Rubber)
	-- the airline's name on both sides
	for _, side in { -1, 1 } do
		local plate = B.box(m, cf * CFrame.new(side * 4.62 * s, y + 3 * s, -10 * s), Vector3.new(0.05, 1.8 * s, 22 * s), white, M.SmoothPlastic, nc({ Transparency = 1 }))
		B.sign(plate, if side > 0 then Enum.NormalId.Right else Enum.NormalId.Left, L.name, { color = accent, pixelsPerStud = 10, font = B.Fonts.Heavy })
	end
	return m
end

-- A small propeller plane (12 parts).
function OuterProps.propPlane(parent: Instance, cf: CFrame, color: any?): Model
	local m = B.model("PropPlane", parent)
	local col = B.color(color or { 240, 240, 236 })
	local stripe = Color3.fromRGB(200, 40, 40)
	B.box(m, cf * CFrame.new(0, 4, 0), Vector3.new(3.6, 3.6, 20), col, M.SmoothPlastic)
	B.wedge(m, cf * CFrame.new(0, 4.4, 12.5) * CFrame.Angles(math.pi, 0, 0), Vector3.new(3, 2.8, 5), col, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 5.4, -3), Vector3.new(3.7, 1.4, 5), GLASS, M.Glass, nc({ Transparency = 0.2 }))
	B.box(m, cf * CFrame.new(0, 6.1, -1), Vector3.new(30, 0.5, 5), col, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 3.2, 0), Vector3.new(3.7, 0.6, 20.1), stripe, M.SmoothPlastic, nc())
	B.wedge(m, cf * CFrame.new(0, 7.8, 13), Vector3.new(0.5, 4.4, 4), stripe, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 5, 13.6), Vector3.new(10, 0.4, 3), col, M.SmoothPlastic)
	B.cylZ(m, cf * CFrame.new(0, 4, -10.4), 0.8, 1.6, Color3.fromRGB(60, 60, 64), M.Metal)
	B.box(m, cf * CFrame.new(0, 4, -10.9), Vector3.new(7, 0.6, 0.2), Color3.fromRGB(40, 40, 44), M.Metal, nc())
	for _, side in { -1, 1 } do
		B.cylY(m, cf * CFrame.new(side * 2.4, 1.4, -2), 2, 0.3, Color3.fromRGB(80, 80, 86), M.Metal)
		B.cyl(m, cf * CFrame.new(side * 2.4, 0.7, -2), 0.6, 1.4, TYRE, M.Rubber)
	end
	return m
end

-- A touring caravan with an awning (9 parts).
function OuterProps.caravan(parent: Instance, cf: CFrame, rng: Random): Model
	local m = B.model("Caravan", parent)
	local trim = B.color(Rand.pick(rng, { { 40, 110, 170 }, { 200, 60, 50 }, { 60, 140, 90 }, { 230, 150, 40 } }))
	local white = Color3.fromRGB(242, 242, 238)
	B.box(m, cf * CFrame.new(0, 4.4, 0), Vector3.new(8, 6.4, 18), white, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 2.6, 0), Vector3.new(8.05, 0.8, 18.05), trim, M.SmoothPlastic, nc())
	B.box(m, cf * CFrame.new(-4.03, 5.2, -3), Vector3.new(0.1, 1.8, 5), GLASS, M.Glass, nc())
	B.box(m, cf * CFrame.new(-4.03, 4.4, 4), Vector3.new(0.1, 5, 2.6), trim, M.SmoothPlastic, nc())
	B.box(m, cf * CFrame.new(0, 1, -11), Vector3.new(0.6, 0.6, 4.2), Color3.fromRGB(60, 60, 64), M.Metal)
	B.cyl(m, cf * CFrame.new(0, 1.2, 1), 8.6, 2.4, TYRE, M.Rubber)
	-- the awning on the door side with its two poles
	B.box(m, cf * CFrame.new(-7.5, 7.2, 2), Vector3.new(7, 0.2, 12), trim:Lerp(Color3.new(1, 1, 1), 0.35), M.Fabric)
	for _, z in { -3.6, 7.6 } do
		B.cylY(m, cf * CFrame.new(-10.6, 3.55, z), 7.1, 0.25, Color3.fromRGB(200, 200, 204), M.Metal)
	end
	return m
end

-- A golf cart (7 parts).
function OuterProps.golfCart(parent: Instance, cf: CFrame): Model
	local m = B.model("GolfCart", parent)
	local white = Color3.fromRGB(240, 240, 236)
	B.box(m, cf * CFrame.new(0, 1.4, 0), Vector3.new(3.6, 1, 7), white, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 2.5, 1), Vector3.new(3.4, 1.2, 2), Color3.fromRGB(30, 80, 50), M.Fabric)
	B.box(m, cf * CFrame.new(0, 5.3, 0.2), Vector3.new(3.8, 0.25, 5.6), white, M.SmoothPlastic)
	for _, z in { -2.3, 2.3 } do
		B.box(m, cf * CFrame.new(0, 3.5, z), Vector3.new(3.2, 3.4, 0.2), Color3.fromRGB(80, 80, 86), M.Metal, nc({ Transparency = if z < 0 then 0.6 else 0 }))
	end
	wheels(m, cf, 3.2, 4.6, 1.2, 0.6)
	return m
end

----------------------------------------------------------------------------------------------------
-- Houses
----------------------------------------------------------------------------------------------------
local AEGEAN_BLUE = { { 30, 90, 170 }, { 20, 120, 160 }, { 40, 70, 140 }, { 60, 140, 120 } }

-- A whitewashed fisherman's cottage on a lot: flat roof with a low parapet, a blue door and
-- shutters, a bench by the door and bougainvillea on the wall (about 12 parts).
function OuterProps.cottage(parent: Instance, cf: CFrame, lotW: number, rng: Random): Model
	local m = B.model("Cottage", parent)
	local w = math.min(lotW - 3, Rand.range(rng, 13, 17))
	local d = Rand.range(rng, 12, 15)
	local h = if rng:NextNumber() < 0.35 then 17 else 9.5
	local inset = Rand.range(rng, 2, 6)
	local hc = cf * CFrame.new(Rand.range(rng, -1, 1), 0, inset)
	local white = Color3.fromRGB(246, 246, 242)
	local blue = B.color(Rand.pick(rng, AEGEAN_BLUE))
	B.box(m, hc * CFrame.new(0, h / 2, d / 2), Vector3.new(w, h, d), white, M.Plaster)
	B.box(m, hc * CFrame.new(0, h + 0.5, d / 2), Vector3.new(w + 0.4, 1, d + 0.4), white, M.Plaster)
	B.box(m, hc * CFrame.new(-w / 4, 3.6, -0.15), Vector3.new(3.4, 7.2, 0.3), blue, M.Wood)
	for f = 0, if h > 12 then 1 else 0 do
		local wy = 5.2 + f * 7.6
		B.box(m, hc * CFrame.new(w / 4, wy, -0.1), Vector3.new(3, 3.2, 0.2), GLASS, M.Glass, nc())
		B.box(m, hc * CFrame.new(w / 4, wy, -0.2), Vector3.new(5.2, 3.4, 0.2), blue, M.Wood, nc({ Transparency = 0 }))
	end
	-- (the shutters are the frame around the dark window; the bench sits by the door)
	B.box(m, hc * CFrame.new(-w / 4 + 3.6, 1, -1.2), Vector3.new(3.6, 0.4, 1.2), blue, M.Wood)
	B.box(m, hc * CFrame.new(-w / 4 + 3.6, 0.4, -1.2), Vector3.new(3.4, 0.8, 1), white, M.Plaster)
	if rng:NextNumber() < 0.6 then
		local pink = Rand.pick(rng, { Color3.fromRGB(220, 60, 140), Color3.fromRGB(200, 40, 110), Color3.fromRGB(240, 120, 160) })
		-- bougainvillea climbing the wall from a pot by the door
		B.box(m, hc * CFrame.new(w / 2 - 2, (h - 2) / 2, -0.25), Vector3.new(0.8, h - 2, 0.3), Color3.fromRGB(70, 100, 50), M.LeafyGrass, nc())
		B.ellipsoid(m, hc * CFrame.new(w / 2 - 2.6, h - 1.6, -0.5), Vector3.new(6, 3, 1), pink, M.LeafyGrass, nc())
		B.cylY(m, hc * CFrame.new(w / 2 - 2, 0.7, -0.6), 1.4, 1.4, Color3.fromRGB(170, 90, 60), M.Slate)
	end
	if h > 12 then
		-- a little balcony on the upper floor
		B.box(m, hc * CFrame.new(w / 4, 10.4, -1.4), Vector3.new(6, 0.4, 2.8), white, M.Plaster)
		B.box(m, hc * CFrame.new(w / 4, 11.6, -2.7), Vector3.new(6, 2, 0.2), blue, M.Metal, nc())
	end
	return m
end

-- A modern villa on its lot: a high garden wall with a gate on the street, two offset white
-- volumes with big glazing, a pool with loungers, trees and a car in the drive (about 34 parts).
function OuterProps.villa(parent: Instance, cf: CFrame, lotW: number, lotD: number, rng: Random): Model
	local m = B.model("Villa", parent)
	local grass = Color3.fromRGB(96, 146, 70)
	local wallCol = B.color(Rand.pick(rng, { { 236, 230, 218 }, { 214, 200, 180 }, { 190, 186, 180 }, { 120, 110, 100 } }))
	local white = B.color(Rand.pick(rng, { { 246, 246, 242 }, { 240, 236, 226 }, { 230, 230, 232 } }))
	local wood = Color3.fromRGB(150, 104, 70)
	-- the garden
	B.box(m, cf * CFrame.new(0, 0.1, lotD / 2), Vector3.new(lotW - 2, 0.2, lotD - 2), grass, M.Grass)
	-- street wall with a gate and a drive
	local gateX = lotW / 2 - 9
	local wl = (lotW - 2) / 2 + gateX - 5
	B.box(m, cf * CFrame.new(-(lotW - 2) / 2 + wl / 2, 2.4, 1.5), Vector3.new(wl, 4.8, 0.8), wallCol, M.Concrete)
	B.box(m, cf * CFrame.new(gateX, 2.2, 1.6), Vector3.new(10, 4.4, 0.3), Color3.fromRGB(50, 50, 54), M.Metal)
	B.box(m, cf * CFrame.new(gateX + 5.6 + 0.6, 2.4, 1.5), Vector3.new(1.2, 4.8, 0.8), wallCol, M.Concrete)
	B.box(m, cf * CFrame.new(gateX, 0.25, 12), Vector3.new(9, 0.1, 21), Color3.fromRGB(170, 166, 158), M.Concrete)
	-- the house: a long ground floor and an upper volume cantilevered across it
	local hw = math.min(lotW - 26, Rand.range(rng, 34, 42))
	local hd = Rand.range(rng, 16, 20)
	local hz = math.min(lotD - hd - 6, Rand.range(rng, 26, 32))
	local hx = -lotW / 2 + 4 + hw / 2
	local hc = cf * CFrame.new(hx, 0.2, hz)
	B.box(m, hc * CFrame.new(0, 5, hd / 2), Vector3.new(hw, 10, hd), white, M.Plaster)
	B.box(m, hc * CFrame.new(-hw * 0.12, 0.2 + 10 + 4.5, hd / 2 - 1), Vector3.new(hw * 0.7, 9, hd + 2), white, M.Plaster)
	B.box(m, hc * CFrame.new(0, 10.2, hd / 2), Vector3.new(hw + 2, 0.5, hd + 2), Color3.fromRGB(80, 80, 84), M.Concrete)
	B.box(m, hc * CFrame.new(-hw * 0.12, 19.45, hd / 2 - 1), Vector3.new(hw * 0.7 + 2, 0.6, hd + 4), Color3.fromRGB(80, 80, 84), M.Concrete)
	B.box(m, hc * CFrame.new(hw * 0.1, 4.6, -0.1), Vector3.new(hw * 0.6, 8, 0.3), Color3.fromRGB(60, 90, 110), M.Glass, { Transparency = 0.35 })
	B.box(m, hc * CFrame.new(-hw * 0.12, 14.6, -2.1), Vector3.new(hw * 0.5, 6.6, 0.3), Color3.fromRGB(60, 90, 110), M.Glass, { Transparency = 0.35 })
	B.box(m, hc * CFrame.new(-hw / 2 + 3, 5, -0.2), Vector3.new(5, 9.6, 0.4), wood, M.WoodPlanks)
	local lit = B.box(m, hc * CFrame.new(hw * 0.1, 4.6, 0.3), Vector3.new(hw * 0.5, 6, 0.2), Color3.fromRGB(255, 214, 150), M.Neon, nc({ Transparency = 1, Name = "NightWindow" }))
	lit:AddTag("NightWindow")
	-- the pool in front of the house, with loungers
	local px = hx + Rand.range(rng, -4, 4)
	local pz = math.max(14, hz - 12)
	local pw = math.min(hw - 6, 24)
	B.box(m, cf * CFrame.new(px, 0.3, pz), Vector3.new(pw + 3, 0.4, 11), Color3.fromRGB(236, 232, 222), M.Concrete)
	local water = B.box(m, cf * CFrame.new(px, 0.42, pz), Vector3.new(pw, 0.4, 8), Color3.fromRGB(60, 180, 210), M.Glass, nc({ Transparency = 0.15, Reflectance = 0.1, Name = "PoolWater" }))
	water.CanCollide = true
	for i = 0, 1 do
		local lc = cf * CFrame.new(px - pw / 2 + 4 + i * 5, 0.5, pz - 8)
		B.box(m, lc * CFrame.new(0, 0.6, 0), Vector3.new(2.4, 0.4, 6), Color3.fromRGB(250, 250, 250), M.SmoothPlastic)
		B.box(m, lc * CFrame.new(0, 1.4, 2.4) * CFrame.Angles(math.rad(-50), 0, 0), Vector3.new(2.4, 0.4, 2.4), Color3.fromRGB(250, 250, 250), M.SmoothPlastic, nc())
	end
	-- a hedge down one side of the lot, trees at the back
	B.box(m, cf * CFrame.new(-lotW / 2 + 1.5, 1.7, lotD / 2 + 1), Vector3.new(1.6, 3.4, lotD - 4), Color3.fromRGB(70, 116, 58), M.LeafyGrass)
	for _, bx in { -lotW / 2 + 8, lotW / 2 - 8 } do
		Props.tree(m, cf * CFrame.new(bx, 0.2, lotD - 7), Rand.pick(rng, { "oak", "pine", "cypress" }), rng)
	end
	-- trees along the wall and the car in the drive
	Props.tree(m, cf * CFrame.new(-lotW / 2 + 5, 0.2, 6), Rand.pick(rng, { "cypress", "palm", "oak" }), rng)
	Props.tree(m, cf * CFrame.new(gateX - 9, 0.2, 7), Rand.pick(rng, { "cypress", "palm" }), rng)
	OuterProps.car(m, cf * CFrame.new(gateX, 0.3, 16) * CFrame.Angles(0, math.pi, 0), rng, Rand.pick(rng, { { 20, 20, 22 }, { 240, 240, 240 }, { 120, 20, 30 }, { 30, 50, 90 } }))
	return m
end

-- A summer house: a small pastel box with a red tile roof and a terrace (about 12 parts).
function OuterProps.summerHouse(parent: Instance, cf: CFrame, lotW: number, rng: Random): Model
	local m = B.model("SummerHouse", parent)
	local w = math.min(lotW - 3, Rand.range(rng, 15, 18))
	local d = Rand.range(rng, 13, 16)
	local wall = B.color(Rand.pick(rng, { { 246, 244, 236 }, { 250, 230, 200 }, { 220, 236, 240 }, { 246, 220, 220 }, { 230, 240, 214 } }))
	local hc = cf * CFrame.new(0, 0, 7)
	local h = 9
	B.box(m, hc * CFrame.new(0, h / 2, d / 2), Vector3.new(w, h, d), wall, M.Plaster)
	local roof = Color3.fromRGB(176, 76, 52)
	local rh = 4.4
	B.wedge(m, hc * CFrame.new(0, h + rh / 2, d * 0.25), Vector3.new(w + 1.6, rh, d / 2 + 1), roof, M.ClayRoofTiles)
	B.wedge(m, hc * CFrame.new(0, h + rh / 2, d * 0.75) * CFrame.Angles(0, math.pi, 0), Vector3.new(w + 1.6, rh, d / 2 + 1), roof, M.ClayRoofTiles)
	-- terrace with a pergola in front, a sliding door and a window
	B.box(m, cf * CFrame.new(0, 0.3, 3.6), Vector3.new(w, 0.4, 6.4), Color3.fromRGB(196, 150, 110), M.WoodPlanks)
	B.box(m, hc * CFrame.new(-w / 4, 3.8, -0.1), Vector3.new(5, 7, 0.3), Color3.fromRGB(60, 90, 110), M.Glass, { Transparency = 0.3 })
	B.box(m, hc * CFrame.new(w / 4, 5, -0.1), Vector3.new(3.4, 3, 0.3), Color3.fromRGB(60, 90, 110), M.Glass, nc({ Transparency = 0.3 }))
	B.box(m, hc * CFrame.new(0, 7.8, -3.6), Vector3.new(w, 0.3, 7), Color3.fromRGB(150, 104, 70), M.Wood)
	for _, sx in { -1, 1 } do
		B.box(m, hc * CFrame.new(sx * (w / 2 - 0.4), 4, -6.9), Vector3.new(0.4, 7.6, 0.4), Color3.fromRGB(150, 104, 70), M.Wood)
	end
	-- two deck chairs under the pergola
	local canvas = B.color(Rand.pick(rng, { { 30, 110, 190 }, { 230, 120, 40 }, { 40, 160, 120 }, { 220, 60, 80 } }))
	for i = 0, 1 do
		local c = cf * CFrame.new(w / 4 + i * 3.2, 0.5, 3.6)
		B.box(m, c * CFrame.new(0, 0.9, 0), Vector3.new(2.2, 0.3, 3), canvas, M.Fabric)
		B.box(m, c * CFrame.new(0, 1.8, 1.6) * CFrame.Angles(math.rad(-30), 0, 0), Vector3.new(2.2, 2, 0.3), canvas, M.Fabric)
		B.box(m, c * CFrame.new(0, 0.45, 0), Vector3.new(2, 0.9, 2.6), Color3.fromRGB(150, 104, 70), M.Wood)
	end
	return m
end

return OuterProps
