-- ShopBuilder: a player's repair shop on a plot, rebuilt whenever it levels up or gets new items,
-- plus the empty "for rent" lot. Everything gameplay needs is exposed as named markers under
-- a "Points" folder (door, counter, queue, seats, benches, staff spots, thief targets...).
--
-- Local frame: origin = centre of the plot's street edge, -Z = street, the plot extends to +Z.

local B = require(script.Parent.Parent.Util.Builder)
local Rand = require(script.Parent.Parent.Util.Rand)
local Props = require(script.Parent.Props)
local Buildings = require(script.Parent.Buildings)
local Upgrades = require(script.Parent.Parent.Data.Upgrades)

local ShopBuilder = {}
local M = Enum.Material

local SETBACK = 7
local WALL_H = 16

local function nc(extra)
	local t = { CanCollide = false, CanTouch = false }
	if extra then
		for k, v in extra do
			t[k] = v
		end
	end
	return t
end

local function styleById(list, id, default)
	for _, s in list do
		if s.id == id then
			return s
		end
	end
	return default or list[1]
end

local function material(name: string)
	return (Enum.Material :: any)[name] or M.SmoothPlastic
end

-- Floor plan bookkeeping in the shop's local frame (x across, z from the front glass inwards).
-- Claims are { x0, z0, x1, z1 } rectangles: "hard" furniture, "walk" aisles furniture must keep
-- clear, and "stand" spots reserved for people.
local Plan = {}
Plan.__index = Plan

function Plan.new(w: number, d: number)
	return setmetatable({ w = w, d = d, rects = {} }, Plan)
end

-- mode "hard": room for furniture (avoids everything); "stand": room for a person
function Plan:free(r, mode: string): boolean
	local inner = self.w / 2 - 1
	if r[1] < -inner - 1e-3 or r[3] > inner + 1e-3 or r[2] < 1 - 1e-3 or r[4] > self.d - 1 + 1e-3 then
		return false
	end
	for _, c in self.rects do
		if (mode == "hard" or c.kind ~= "walk") and r[1] < c[3] and c[1] < r[3] and r[2] < c[4] and c[2] < r[4] then
			return false
		end
	end
	return true
end

function Plan:claim(r, kind: string)
	table.insert(self.rects, { r[1], r[2], r[3], r[4], kind = kind })
end

-- first offset along a wall run where an item `len` long and `depth` deep fits
function Plan:wallSlot(run, len: number, depth: number): (number?, { number }?)
	local t = 0
	while t + len <= run.len + 1e-3 do
		local r = run:rect(t, len, depth)
		if self:free(r, "hard") then
			return t, r
		end
		t += 0.5
	end
	return nil, nil
end

-- A stretch of wall starting at (x, z), running along (ax, az), facing the room along (ix, iz).
local WallRun = {}
WallRun.__index = WallRun

local function wallRun(x: number, z: number, ax: number, az: number, ix: number, iz: number, len: number)
	return setmetatable({ x = x, z = z, ax = ax, az = az, ix = ix, iz = iz, len = math.max(0, len) }, WallRun)
end

function WallRun:rect(t: number, len: number, depth: number): { number }
	local x0, z0 = self.x + self.ax * t, self.z + self.az * t
	local x1, z1 = x0 + self.ax * len + self.ix * depth, z0 + self.az * len + self.iz * depth
	return { math.min(x0, x1), math.min(z0, z1), math.max(x0, x1), math.max(z0, z1) }
end

-- workbench footprint: 10 along the wall, origin 2.9 off it, stool reaching 7.8 into the room
local BENCH_LEN, BENCH_BACK, BENCH_DEPTH = 10, 2.9, 7.8

local POSTERS = {
	"RTX 5090\nSTOKTA!",
	"ÜCRETSİZ\nARIZA TESPİTİ",
	"6 AY\nGARANTİLİ TAMİR",
	"TERMAL MACUN\nBAKIMI 15 DK",
	"SSD İLE\n10 KAT HIZ",
	"OYUNCU PC\nTOPLAMA",
	"LAPTOP EKRAN\nDEĞİŞİMİ",
	"VERİ\nKURTARMA",
}

-- Workbench facing into the room (cf.LookVector points at the technician).
function ShopBuilder.workbench(parent: Instance, cf: CFrame, index: number, items: { [string]: boolean }, rng: Random)
	local m = B.model("Workbench_" .. index, parent)
	local top = Color3.fromRGB(70, 74, 82)
	local legs = Color3.fromRGB(40, 42, 46)
	-- desk (top surface at y = 3.4)
	B.box(m, cf * CFrame.new(0, 3.25, 0), Vector3.new(10, 0.3, 4.6), top, M.Metal)
	for x = -1, 1, 2 do
		B.box(m, cf * CFrame.new(x * 4.7, 1.55, 0), Vector3.new(0.4, 3.1, 4.2), legs, M.Metal)
	end
	B.box(m, cf * CFrame.new(0, 2.2, 2), Vector3.new(9, 2, 0.3), legs, M.Metal)
	-- drawers
	B.box(m, cf * CFrame.new(3.4, 2, -0.2), Vector3.new(2.4, 2.4, 3.8), Color3.fromRGB(200, 40, 40), M.Metal)
	for k = 0, 2 do
		B.box(m, cf * CFrame.new(3.4, 1.2 + k * 0.8, -2.15), Vector3.new(2.2, 0.6, 0.1), Color3.fromRGB(170, 30, 30), M.Metal, nc())
	end
	-- ESD mat
	local matCol = if items.bench_mat then Color3.fromRGB(40, 110, 200) else Color3.fromRGB(110, 114, 120)
	B.box(m, cf * CFrame.new(-0.6, 3.42, 0), Vector3.new(7, 0.05, 3.8), matCol, M.Rubber, nc({ Name = "Mat" }))
	-- test monitor on the back right
	Props.monitor(m, cf * CFrame.new(3.1, 3.4, 1.4) * CFrame.Angles(0, math.rad(-12), 0), "", Color3.fromRGB(10, 30, 50))
	local mon = m:FindFirstChild("Monitor")
	if mon then
		mon.Name = "BenchMonitor"
		local screen = mon:FindFirstChild("Screen")
		if screen then
			screen:SetAttribute("BenchScreen", true)
		end
	end
	-- magnifier lamp clamped to the back edge (clear of the parts area), arm leaning over the mat
	B.box(m, cf * CFrame.new(-4.3, 3.6, 2.05), Vector3.new(0.5, 0.5, 0.45), legs, M.Metal)
	local armLen = math.sqrt(1.15 ^ 2 + 2.7 ^ 2)
	B.box(m, cf * CFrame.new(-4.3, 5.2, 1.48) * CFrame.Angles(-math.atan2(1.15, 2.7), 0, 0), Vector3.new(0.2, armLen, 0.2), legs, M.Metal, nc())
	local lampHead = B.cyl(m, cf * CFrame.new(-4.2, 6.6, 0.8) * CFrame.Angles(0, 0, math.pi / 2), 0.3, 1.6, legs, M.Metal, nc())
	lampHead.Name = "LampHead"
	if items.bench_led then
		local led = B.cylY(m, cf * CFrame.new(-4.2, 6.42, 0.8), 0.06, 1.4, Color3.fromRGB(255, 250, 240), M.Neon, nc())
		B.spotLight(led, Enum.NormalId.Bottom, 10, 70, 1.4, Color3.fromRGB(255, 250, 240), false)
	end
	-- magnetic screw bowl, where PCModel drops the screws (device frame TRAY)
	B.cylY(m, cf * CFrame.new(2.6, 3.5, -1.2), 0.2, 1.2, Color3.fromRGB(150, 150, 156), M.Metal, nc({ Name = "ScrewTray" }))
	-- stool
	local stool = cf * CFrame.new(0, 0, -3.6)
	B.cylY(m, stool * CFrame.new(0, 1.2, 0), 2.4, 0.4, legs, M.Metal)
	B.cylY(m, stool * CFrame.new(0, 0.1, 0), 0.2, 2, legs, M.Metal)
	local seat = Instance.new("Seat")
	seat.Name = "Stool"
	seat.Anchored = true
	seat.Size = Vector3.new(1.8, 0.4, 1.8)
	seat.Color = Color3.fromRGB(30, 30, 34)
	seat.Material = M.Leather
	seat.TopSurface = Enum.SurfaceType.Smooth
	seat.CFrame = stool * CFrame.new(0, 2.5, 0) * CFrame.Angles(0, math.pi, 0)
	seat.Parent = m
	-- the device sits here; LookVector faces the technician
	local anchor = B.marker(m, "DeviceAnchor", cf * CFrame.new(-0.6, 3.45, 0))
	anchor:SetAttribute("Bench", index)
	local camAnchor = B.marker(m, "CameraAnchor", cf * CFrame.new(-0.6, 9.5, -6.5))
	camAnchor:SetAttribute("Bench", index)
	local prompt = B.prompt(B.marker(m, "PromptAnchor", stool * CFrame.new(0, 3, 0)), "Tezgâha Geç", "Tezgâh " .. index, { distance = 8, name = "BenchPrompt" })
	prompt:SetAttribute("Bench", index)
	m:SetAttribute("Bench", index)
	B.tag(m, "Workbench")
	-- pegboard with tools on the wall behind the bench
	if items.tool_wall then
		local board = B.box(m, cf * CFrame.new(0, 7.6, 2.6), Vector3.new(9, 5, 0.3), Color3.fromRGB(196, 168, 124), M.Wood)
		board.Name = "ToolWall"
		local toolCols = { Color3.fromRGB(220, 40, 30), Color3.fromRGB(30, 100, 200), Color3.fromRGB(240, 170, 20), Color3.fromRGB(40, 40, 44) }
		for k = 0, 7 do
			B.box(m, cf * CFrame.new(-3.8 + k * 1.1, 7.6 + ((k % 2) * 0.6 - 0.3), 2.4), Vector3.new(0.25, Rand.range(rng, 1.4, 2.6), 0.2), toolCols[(k % 4) + 1], M.SmoothPlastic, nc())
		end
	end
	if items.microscope and index == 1 then
		B.cylY(m, cf * CFrame.new(-2.6, 3.9, 1.2), 1, 1.4, Color3.fromRGB(230, 230, 230), M.SmoothPlastic, nc())
		B.cylY(m, cf * CFrame.new(-2.6, 5.2, 1.0), 1.8, 0.5, Color3.fromRGB(40, 40, 44), M.Metal, nc())
	end
	return m
end

-- Empty plot available for rent.
function ShopBuilder.emptyLot(parent: Instance, cf: CFrame, plotW: number, plotD: number, plotId: number): Model
	local m = B.model("Plot_" .. plotId .. "_Empty", parent)
	B.box(m, cf * CFrame.new(0, 0.06, plotD / 2), Vector3.new(plotW - 2, 0.12, plotD - 2), Color3.fromRGB(150, 140, 126), M.Pebble, { Name = "LotGround" })
	-- construction hoarding along the front with a gap
	local hoard = Color3.fromRGB(230, 230, 226)
	B.box(m, cf * CFrame.new(-plotW / 4 - 4, 3, 2), Vector3.new(plotW / 2 - 10, 6, 0.4), hoard, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(plotW / 4 + 4, 3, 2), Vector3.new(plotW / 2 - 10, 6, 0.4), hoard, M.SmoothPlastic)
	local stripe = B.box(m, cf * CFrame.new(-plotW / 4 - 4, 5.4, 1.75), Vector3.new(plotW / 2 - 10, 0.8, 0.1), Color3.fromRGB(0, 160, 210), M.SmoothPlastic, nc())
	stripe.Name = "Stripe"
	-- sign with the prompt
	local post = cf * CFrame.new(0, 0, 4)
	for x = -1, 1, 2 do
		B.box(m, post * CFrame.new(x * 3.6, 4, 0), Vector3.new(0.4, 8, 0.4), Color3.fromRGB(60, 60, 64), M.Metal)
	end
	local board = B.box(m, post * CFrame.new(0, 7.4, 0), Vector3.new(8, 4, 0.3), Color3.fromRGB(240, 200, 40), M.SmoothPlastic)
	B.sign(board, Enum.NormalId.Front, "KİRALIK DÜKKÂN\n#" .. plotId, { color = Color3.fromRGB(30, 30, 30), font = B.Fonts.Heavy })
	local prompt = B.prompt(board, "Bu Dükkânı Tut", "Kiralık Dükkân #" .. plotId, { distance = 14, hold = 0.5, name = "ClaimPrompt" })
	prompt:SetAttribute("Plot", plotId)
	-- a few construction props
	Props.pallet(m, cf * CFrame.new(-plotW / 3, 0.1, plotD * 0.6))
	Props.crate(m, cf * CFrame.new(plotW / 3, 0.1, plotD * 0.5), 3)
	B.box(m, cf * CFrame.new(plotW / 4, 1.2, plotD * 0.7), Vector3.new(6, 2.4, 3), Color3.fromRGB(196, 186, 170), M.Concrete)
	m:SetAttribute("Plot", plotId)
	B.tag(m, "EmptyPlot")
	return m
end

-- Builds a player's shop. opts: level, name, owner, wall, floor, accent, items, plotWidth, plotDepth, plotId
function ShopBuilder.build(parent: Instance, cf: CFrame, opts): (Model, { [string]: any })
	local level = math.clamp(opts.level or 1, 1, #Upgrades.levels)
	local L = Upgrades.levels[level]
	local items = opts.items or {}
	local rng = Random.new(opts.seed or 7)
	local wallStyle = styleById(Upgrades.wallStyles, opts.wall or "white")
	local floorStyle = styleById(Upgrades.floorStyles, opts.floor or "tiles")
	local accentRGB = Upgrades.accentColors[opts.accent or 1] or Upgrades.accentColors[1]
	local accent = Color3.fromRGB(accentRGB[1], accentRGB[2], accentRGB[3])
	local plotW, plotD = opts.plotWidth or 62, opts.plotDepth or 84
	local W, D = L.w, L.d
	local H = if (L.floors or 1) > 1 then 26 else WALL_H

	local shop = B.model("Shop", parent)
	shop:SetAttribute("Level", level)
	local points = B.folder("Points", shop)
	local function point(name: string, pcf: CFrame, attrs: { [string]: any }?)
		local mk = B.marker(points, name, pcf, Vector3.new(1, 1, 1))
		if attrs then
			for k, v in attrs do
				mk:SetAttribute(k, v)
			end
		end
		return mk
	end

	-- forecourt and lot
	B.box(shop, cf * CFrame.new(0, 0.06, SETBACK / 2), Vector3.new(plotW - 2, 0.12, SETBACK), Color3.fromRGB(200, 196, 188), M.Pavement)
	B.box(shop, cf * CFrame.new(0, 0.06, SETBACK + D + (plotD - SETBACK - D) / 2), Vector3.new(plotW - 2, 0.12, math.max(1, plotD - SETBACK - D - 1)), Color3.fromRGB(110, 150, 80), M.Grass)
	local front = cf * CFrame.new(0, 0.12, SETBACK)

	-- the building shell
	local hall = Buildings.hall(shop, front, W, D, H, {
		name = opts.name or "Bilgisayar Tamir",
		accent = accent,
		wall = wallStyle.color,
		wallMat = material(wallStyle.material),
		floor = floorStyle.color,
		floorMat = material(floorStyle.material),
		door = 8,
		modelName = "Building",
	})
	if floorStyle.checker then
		for i = 0, math.floor(W / 4) - 1 do
			for j = 0, math.floor(D / 4) - 1 do
				if (i + j) % 2 == 0 then
					B.box(hall, front * CFrame.new(-W / 2 + 2 + i * 4, 0.22, 2 + j * 4), Vector3.new(4, 0.04, 4), Color3.fromRGB(240, 240, 240), M.SmoothPlastic, nc({ CanCollide = true }))
				end
			end
		end
	end
	if (L.floors or 1) > 1 then
		-- second storey glass band and a rooftop sign
		B.box(shop, front * CFrame.new(0, 17, -0.6), Vector3.new(W, 1, 1.4), accent, M.SmoothPlastic)
		local roofSign = B.box(shop, front * CFrame.new(0, H + 6, D / 2), Vector3.new(math.min(W - 6, 44), 7, 1), Color3.fromRGB(20, 20, 24), M.SmoothPlastic)
		B.sign(roofSign, Enum.NormalId.Front, opts.name or "MEGA TECH", { color = accent, glow = true, brightness = 2.2 })
		B.box(shop, front * CFrame.new(0, H + 1.5, D / 2), Vector3.new(4, 3, 1), Color3.fromRGB(60, 60, 64), M.Metal)
	end
	-- awning in the accent colour
	Buildings.awning(shop, front * CFrame.new(-W / 4 - 2, 11.6, 0), W / 2 - 8, accent, rng)
	Buildings.awning(shop, front * CFrame.new(W / 4 + 2, 11.6, 0), W / 2 - 8, accent, rng)

	-- doorway points
	point("Street", cf * CFrame.new(0, 0.5, -6))
	point("Outside", front * CFrame.new(0, 0.5, -4))
	point("Door", front * CFrame.new(0, 0.5, 3))

	-- zones: front (waiting + counter) up to fz, workshop behind it
	local fz = math.clamp(D * 0.5, 14, 22)
	local inner = W / 2 - 1
	local plan = Plan.new(W, D)
	local function at(x: number, z: number, y: number?): CFrame
		return front * CFrame.new(x, y or 0.12, z)
	end
	local function facing(x: number, z: number, ix: number, iz: number): CFrame
		local o = Vector3.new(x, 0.12, z)
		return front * CFrame.lookAt(o, o + Vector3.new(ix, 0, iz))
	end
	local function local2(cf0: CFrame): (number, number)
		local p = front:PointToObjectSpace(cf0.Position)
		return p.X, p.Z
	end
	local walls = {
		leftFront = wallRun(-inner, 1.2, 0, 1, 1, 0, fz - 1.7),
		rightFront = wallRun(inner, 1.2, 0, 1, -1, 0, fz - 1.7),
		frontLeft = wallRun(-inner, 1.2, 1, 0, 0, 1, inner - 4.6),
		frontRight = wallRun(4.6, 1.2, 1, 0, 0, 1, inner - 4.6),
		leftWork = wallRun(-inner, fz + 0.5, 0, 1, 1, 0, D - 1.5 - fz),
		rightWork = wallRun(inner, fz + 0.5, 0, 1, -1, 0, D - 1.5 - fz),
		back = wallRun(-inner, D - 1, 1, 0, 0, -1, 2 * inner),
	}
	-- puts an item `len` long against the first wall run with room for it; `back` is the
	-- distance from the wall to the item's origin, `depth` how far it reaches into the room
	local function wallItem(runs, len: number, back: number, depth: number, make: (CFrame) -> ()): CFrame?
		for _, run in runs do
			local t, r = plan:wallSlot(run, len, depth)
			if t then
				plan:claim(r, "hard")
				local mid = t + len / 2
				local c = facing(run.x + run.ax * mid + run.ix * back, run.z + run.az * mid + run.iz * back, run.ix, run.iz)
				make(c)
				return c
			end
		end
		return nil
	end
	-- a free spot for a person to stand, searched outwards from (x, z)
	local function standSpot(name: string, x: number, z: number, attrs: { [string]: any }?)
		for ring = 0, 14 do
			local n = math.max(1, ring * 6)
			for k = 0, n - 1 do
				local a = k / n * math.pi * 2
				local px, pz = x + math.cos(a) * ring * 0.7, z + math.sin(a) * ring * 0.7
				local r = { px - 0.75, pz - 0.75, px + 0.75, pz + 0.75 }
				if plan:free(r, "stand") then
					plan:claim(r, "stand")
					return point(name, at(px, pz, 0.5), attrs)
				end
			end
		end
		return point(name, at(x, z, 0.5), attrs)
	end

	-- keep the doorway clear
	plan:claim({ -4.6, 1, 4.6, 7 }, "walk")

	-- counter facing the door right of centre; the receptionist stands behind it
	local counterW = math.min(10, W / 3)
	local xc = math.min(W / 4, inner - 5 - counterW / 2)
	local zc = fz - 5
	local counterCf = at(xc, zc)
	Props.counter(shop, counterCf, counterW, Color3.fromRGB(236, 236, 236), Color3.fromRGB(40, 40, 46))
	plan:claim({ xc - counterW / 2 - 0.2, zc - 1.6, xc + counterW / 2 + 0.2, zc + 1.4 }, "hard")
	if items.safe then
		local sx = xc - counterW / 2 + 1.7
		local safe = B.box(shop, at(sx, zc + 2.9, 1.72), Vector3.new(3, 3.2, 2.4), Color3.fromRGB(60, 64, 70), M.DiamondPlate)
		safe.Name = "Safe"
		plan:claim({ sx - 1.5, zc + 1.7, sx + 1.5, zc + 4.1 }, "hard")
	end
	plan:claim({ xc - counterW / 2, zc + 1.4, xc + counterW / 2, zc + 3.6 }, "walk")
	plan:claim({ xc - counterW / 2, zc - 4.2, xc + counterW / 2, zc - 1.6 }, "walk")
	point("CounterFront", at(xc, zc - 3, 0.5))
	point("CounterBack", at(xc, zc + 2.6, 0.5), { Role = "receptionist" })
	point("Register", counterCf * CFrame.new(counterW / 2 - 2, 4.5, 0.3))
	if items.trophy then
		-- glass trophy cabinet on the wall nearest the counter
		wallItem({ walls.rightFront, walls.leftFront, walls.back, walls.rightWork, walls.leftWork }, 6, 1.15, 2.3, function(c)
			local m = B.model("TrophyCabinet", shop)
			B.box(m, c * CFrame.new(0, 3.5, 0), Vector3.new(6, 7, 2.2), Color3.fromRGB(90, 60, 40), M.Wood)
			for k = 0, 2 do
				B.cylY(m, c * CFrame.new(-1.6 + k * 1.6, 3 + k * 1.4, -0.9), 1.2, 0.8, Color3.fromRGB(230, 190, 60), M.Metal, nc())
			end
		end)
	end

	-- the queue runs back from the counter towards the window, then along it
	local queued = 0
	local function queueSpot(x: number, z: number)
		local r = { x - 0.75, z - 0.75, x + 0.75, z + 0.75 }
		if queued < L.queue and plan:free(r, "stand") then
			queued += 1
			plan:claim(r, "stand")
			point("Queue_" .. queued, at(x, z, 0.5))
		end
	end
	local qz = zc - 5.4
	while qz >= 4.2 and queued < L.queue do
		queueSpot(xc, qz)
		qz -= 2.4
	end
	qz = math.max(qz + 2.4, 4.2)
	for k = 1, 16 do
		queueSpot(xc + k * 2.4, qz)
		queueSpot(xc - k * 2.4, qz + 2.4)
	end

	-- workbenches along the workshop walls, the ones nearest the counter first
	local candidates = {}
	for _, run in { walls.rightWork, walls.leftWork, walls.back } do
		local t = 0
		while t + BENCH_LEN <= run.len + 1e-3 do
			local mid = t + BENCH_LEN / 2
			local x, z = run.x + run.ax * mid + run.ix * BENCH_BACK, run.z + run.az * mid + run.iz * BENCH_BACK
			table.insert(candidates, { run = run, t = t, x = x, z = z, d = (x - xc) ^ 2 + (z - zc) ^ 2 })
			t += BENCH_LEN + 1
		end
	end
	table.sort(candidates, function(a, b)
		return a.d < b.d
	end)
	local placed = 0
	for _, c in candidates do
		local r = c.run:rect(c.t, BENCH_LEN, BENCH_DEPTH)
		if placed < L.benches and plan:free(r, "hard") then
			plan:claim(r, "hard")
			placed += 1
			local bcf = facing(c.x, c.z, c.run.ix, c.run.iz)
			ShopBuilder.workbench(shop, bcf, placed, items, rng)
			point("Staff_" .. placed, bcf * CFrame.new(0, 0.4, -3.6), { Bench = placed })
		end
	end
	shop:SetAttribute("Benches", placed)

	-- a storage island in the middle of big workshops
	if (items.parts_shelves or items.warehouse) and W >= 48 then
		local iz = (fz + D) / 2
		local r = { -5, iz - 5.2, 5, iz + 5.2 }
		if plan:free(r, "hard") then
			plan:claim(r, "hard")
			Props.shelf(shop, facing(-3.6, iz, 1, 0), 10, 9, 2.4, rng, 0.9)
			Props.shelf(shop, facing(3.6, iz, -1, 0), 10, 9, 2.4, rng, 0.9)
			standSpot("Shelf_island", 0, iz - 6.4)
		end
	end
	-- parts shelving: the right wall of the front zone first, then any free wall
	local shelves = 0
	local wantShelves = 1 + (if items.parts_shelves then 2 else 0) + (if items.warehouse then 2 else 0)
	for _ = 1, wantShelves do
		local scf = wallItem({ walls.rightFront, walls.leftWork, walls.rightWork, walls.back }, 7, 1.25, 2.5, function(c)
			Props.shelf(shop, c, 7, 8, 2.4, rng, 0.85)
		end)
		if not scf then
			break
		end
		shelves += 1
		local sx, sz = local2(scf * CFrame.new(0, 0, -2.5))
		standSpot("Shelf_" .. shelves, sx, sz)
	end

	-- waiting area between the left wall and the doorway, chairs facing the TV
	local seats, sx0, sx1, szMin, szMax = 0, math.huge, -math.huge, math.huge, -math.huge
	local row, rowZ = 0, fz - 4
	while seats < L.seats and rowZ >= 5 do
		local sofa = items.sofa and row == 0
		local half = if sofa then 1.8 else 1.1
		local x = -5.8
		while seats < L.seats and x - half >= -inner + 4.6 do
			local r = { x - half, rowZ - 1.3, x + half, rowZ + 1.3 }
			if plan:free(r, "hard") then
				plan:claim(r, "hard")
				seats += 1
				local c = facing(x, rowZ, 0, 1)
				if sofa then
					local m = B.model("Sofa", shop)
					local leather = Color3.fromRGB(110, 70, 40)
					B.box(m, c * CFrame.new(0, 1.4, -0.1), Vector3.new(3.4, 1.6, 2.2), leather, M.Leather)
					B.box(m, c * CFrame.new(0, 2.8, 0.95), Vector3.new(3.4, 2, 0.5), leather, M.Leather)
					local seat = Instance.new("Seat")
					seat.Name = "Seat"
					seat.Anchored = true
					seat.Transparency = 1
					seat.CanCollide = false
					seat.Size = Vector3.new(2.4, 0.3, 1.6)
					seat.CFrame = c * CFrame.new(0, 2.25, -0.1)
					seat.Parent = m
				else
					Props.chair(shop, c, accent:Lerp(Color3.new(0, 0, 0), 0.4))
				end
				point("Seat_" .. seats, c * CFrame.new(0, 0.4, 0), { Seat = true })
				sx0, sx1 = math.min(sx0, x - half), math.max(sx1, x + half)
				szMin, szMax = math.min(szMin, rowZ), math.max(szMax, rowZ)
			end
			x -= half * 2 + 0.4
		end
		row += 1
		rowZ -= 3.4
	end
	if seats > 0 then
		local cx = (sx0 + sx1) / 2
		if items.carpet then
			B.box(shop, at(cx, (szMin + szMax) / 2, 0.05), Vector3.new(sx1 - sx0 + 2, 0.06, szMax - szMin + 4), Color3.fromRGB(160, 40, 50), M.Carpet, nc({ CanCollide = true, Name = "Carpet" }))
		end
		if items.tv then
			local tz = math.min(szMax + 2.6, fz - 0.6)
			B.box(shop, at(cx, tz, (H + 11.5) / 2), Vector3.new(0.3, H - 11.5, 0.3), Color3.fromRGB(30, 30, 34), M.Metal, nc())
			Props.tv(shop, at(cx, tz, 9.5), "<b>" .. (opts.name or "Bilgisayar Tamir") .. "</b>\nHoş geldiniz!")
		end
	end

	-- comforts and decorations wherever a wall has room
	local comfortRuns = { walls.leftFront, walls.frontLeft, walls.rightFront, walls.leftWork, walls.back, walls.rightWork }
	if items.tea then
		wallItem(comfortRuns, 3, 1.55, 3.1, function(c)
			local m = B.model("TeaStation", shop)
			B.box(m, c * CFrame.new(0, 1.6, 0), Vector3.new(3, 3.2, 3), Color3.fromRGB(150, 110, 70), M.Wood)
			Props.samovar(m, c * CFrame.new(0, 3.2, 0))
		end)
	end
	if items.coffee then
		wallItem(comfortRuns, 3, 1.55, 3.1, function(c)
			local m = B.model("CoffeeStation", shop)
			B.box(m, c * CFrame.new(0, 1.6, 0), Vector3.new(3, 3.2, 3), Color3.fromRGB(70, 70, 76), M.Metal)
			Props.coffeeMachine(m, c * CFrame.new(0, 3.2, 0))
		end)
	end
	if items.vending then
		wallItem(comfortRuns, 3, 1.75, 3.4, function(c)
			local m = B.model("Vending", shop)
			B.box(m, c * CFrame.new(0, 3.2, 0.1), Vector3.new(3, 6.4, 3.2), Color3.fromRGB(200, 40, 40), M.SmoothPlastic)
			B.box(m, c * CFrame.new(0, 3.8, -1.55), Vector3.new(2.4, 4, 0.1), Color3.fromRGB(180, 220, 240), M.Glass, nc({ Transparency = 0.3, Name = "VendingGlass" }))
		end)
	end
	if items.aquarium then
		wallItem(comfortRuns, 6, 1.15, 2.3, function(c)
			Props.aquarium(shop, c, rng)
		end)
	end
	if items.arcade then
		wallItem({ walls.leftFront, walls.frontLeft, walls.frontRight, walls.leftWork, walls.back }, 2.6, 1.25, 4, function(c)
			Props.arcade(shop, c)
		end)
	end
	-- showroom displays with PCs for sale behind the front glass
	if items.showcase and level >= 4 then
		for i = 1, 3 do
			local d = wallItem({ walls.frontLeft, walls.frontRight }, 5, 1.8, 3.6, function(c)
				local m = B.model("Showcase", shop)
				B.box(m, c * CFrame.new(0, 1.6, 0), Vector3.new(5, 3.2, 3.4), Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
				B.box(m, c * CFrame.new(0, 3.25, 0), Vector3.new(4.8, 0.1, 3.2), accent, M.Neon, nc())
			end)
			if not d then
				break
			end
			point("Showcase_" .. i, d * CFrame.new(0, 3.3, 0), { Showcase = i })
		end
	end
	if items.plants then
		for _, p in { { -inner + 1.2, fz - 1 }, { inner - 1.2, fz - 1 }, { -inner + 1.2, D - 2.2 }, { inner - 1.2, D - 2.2 }, { 5.8, 2.3 }, { -5.8, 2.3 } } do
			local r = { p[1] - 1, p[2] - 1, p[1] + 1, p[2] + 1 }
			if plan:free(r, "hard") then
				plan:claim(r, "hard")
				Props.plant(shop, at(p[1], p[2]), rng)
			end
		end
		Props.planter(shop, cf * CFrame.new(-W / 2 + 2, 0.12, SETBACK / 2), rng)
		Props.planter(shop, cf * CFrame.new(W / 2 - 2, 0.12, SETBACK / 2), rng)
	end
	if items.music then
		for x = -1, 1, 2 do
			B.box(shop, at(x * (inner - 0.6), 4, H - 2.4), Vector3.new(1.2, 2, 1.2), Color3.fromRGB(20, 20, 22), M.SmoothPlastic, nc({ Name = "Speaker" }))
		end
	end
	if items.ac then
		local ac = B.box(shop, at(0, D - 1.5, H - 3), Vector3.new(7, 2, 1), Color3.fromRGB(246, 246, 246), M.SmoothPlastic, nc())
		ac.Name = "AC"
	end
	if items.posters then
		for i = 1, math.min(#POSTERS, 2 + level) do
			local side = if i % 2 == 0 then 1 else -1
			local z = 6 + (i // 2) * 9
			if z < D - 6 then
				local poster = B.box(shop, at(side * (inner - 0.05), z, 12.3), Vector3.new(0.1, 3.6, 3.2), Color3.fromRGB(20, 20, 24), M.SmoothPlastic, nc())
				B.sign(poster, if side > 0 then Enum.NormalId.Left else Enum.NormalId.Right, POSTERS[i], { color = Color3.new(1, 1, 1), background = accent:Lerp(Color3.new(0, 0, 0), 0.35), glow = true, brightness = 1 })
			end
		end
	end
	if items.rgb_lights then
		for k = 0, 2 do
			local strip = B.box(shop, at(0, 6 + k * (D - 12) / 2, H - 0.3), Vector3.new(W - 4, 0.2, 0.4), Color3.fromHSV(k / 3, 0.8, 1), M.Neon, nc({ CastShadow = false, Name = "RGBStrip" }))
			strip:AddTag("RGBStrip")
		end
	end
	-- security
	if items.camera then
		B.ball(shop, at(inner - 1, 2, H - 1), 1.4, Color3.fromRGB(30, 30, 34), M.Glass)
		local led = B.ball(shop, at(inner - 1, 1.6, H - 1.6), 0.25, Color3.fromRGB(255, 30, 30), M.Neon, nc())
		led.Name = "CameraLed"
	end
	if items.alarm then
		local box = B.box(shop, front * CFrame.new(W / 2 - 3, H - 3, -0.8), Vector3.new(2, 2, 0.6), Color3.fromRGB(230, 40, 30), M.SmoothPlastic)
		box.Name = "AlarmBox"
		box:AddTag("AlarmLight")
	end
	if items.shutter then
		B.box(shop, front * CFrame.new(0, H - 1.6, -1), Vector3.new(W - 2, 2.4, 1.6), Color3.fromRGB(150, 154, 160), M.DiamondPlate)
	end
	-- staff spots
	standSpot("GuardSpot", 6.2, 3.2, { Role = "security" })
	standSpot("ManagerSpot", 0, fz + 3, { Role = "manager" })
	standSpot("CleanerSpot", 0, (fz + D) / 2 - 2, { Role = "cleaner" })
	point("ThiefExit", cf * CFrame.new(if rng:NextNumber() < 0.5 then -plotW / 2 - 20 else plotW / 2 + 20, 0.5, -10))
	-- outside: pylon sign, bench, parking marker
	local pylon = cf * CFrame.new(plotW / 2 - 4, 0.12, 2)
	B.box(shop, pylon * CFrame.new(0, 5, 0), Vector3.new(0.6, 10, 0.6), Color3.fromRGB(60, 60, 64), M.Metal)
	local pylonSign = B.box(shop, pylon * CFrame.new(0, 10.5, 0), Vector3.new(6, 4, 0.8), accent, if items.neon then M.Neon else M.SmoothPlastic)
	B.sign(pylonSign, Enum.NormalId.Front, "🔧 " .. (opts.name or "Tamir"), { color = Color3.new(1, 1, 1), glow = true })
	B.sign(pylonSign, Enum.NormalId.Back, "🔧 " .. (opts.name or "Tamir"), { color = Color3.new(1, 1, 1), glow = true, name = "SignBack" })
	if items.sign_pro then
		local lb = B.box(shop, front * CFrame.new(0, H + 5.6, -0.2), Vector3.new(math.min(W - 4, 30), 3, 1), Color3.fromRGB(250, 250, 250), M.SmoothPlastic)
		B.sign(lb, Enum.NormalId.Front, "BİLGİSAYAR • LAPTOP • TAMİR", { color = accent, glow = true, brightness = 1.6 })
	end
	Props.bench(shop, cf * CFrame.new(-plotW / 2 + 6, 0.12, 2) * CFrame.Angles(0, 0, 0))
	point("Parking", cf * CFrame.new(-plotW / 4, 0.5, -16) * CFrame.Angles(0, math.pi / 2, 0), { Parking = true })
	if items.parking then
		for k = 0, 1 do
			B.box(shop, cf * CFrame.new(-plotW / 4 - 10 + k * 20, 0.12, -16), Vector3.new(0.4, 0.04, 9), Color3.new(1, 1, 1), M.SmoothPlastic, nc())
		end
	end
	if opts.owner then
		-- the owner's nameplate stuck on the shop window
		local ownerTag = B.box(shop, front * CFrame.new(-W / 2 + 4, 6, 0.25), Vector3.new(5, 1.2, 0.2), Color3.fromRGB(240, 240, 236), M.SmoothPlastic, nc())
		B.sign(ownerTag, Enum.NormalId.Front, "Sahibi: " .. opts.owner, { color = Color3.fromRGB(30, 30, 30), font = B.Fonts.Medium })
	end
	B.tag(shop, "PlayerShop")
	return shop, { front = front, counter = counterCf, width = W, depth = D, height = H }
end

return ShopBuilder
