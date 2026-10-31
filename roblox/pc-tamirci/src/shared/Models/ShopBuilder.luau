-- ShopBuilder: a player's repair shop on a plot, rebuilt whenever it levels up or gets new items,
-- plus the empty "for rent" lot. Everything gameplay needs is exposed as named markers under
-- a "Points" folder (door, counter, queue, seats, benches, staff spots, thief targets...).
--
-- Local frame: origin = centre of the plot's street edge, -Z = street, the plot extends to +Z.

local B = require(script.Parent.Parent.Util.Builder)
local Rand = require(script.Parent.Parent.Util.Rand)
local Props = require(script.Parent.Props)
local Real = require(script.Parent.RealFurniture)
local Buildings = require(script.Parent.Buildings)
local Upgrades = require(script.Parent.Parent.Data.Upgrades)
local ShopExtras = require(script.Parent.ShopExtras)

local ShopBuilder = {}
local M = Enum.Material

local SETBACK = 7
local WALL_H = 16
local AWNING_Y = 10.9 -- (where the awnings above the windows start)

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

-- Workbench: the desk is 16.5 along the wall and 7.8 deep (the PC on it is one and a half times the
-- old size, with a free area beside it for the parts that come out); the stool is a seat-length in
-- front of it.
local DESK_W, DESK_D = 16.5, 7.8
local ANCHOR_X = 1.2 -- the device's origin, in the desk's x
local STOOL_X, STOOL_Z = 1.6, -(DESK_D / 2 + 1.5)
-- footprint along the wall: the desk, its back 0.5 off the wall, the stool reaching into the room
local BENCH_LEN, BENCH_BACK, BENCH_DEPTH = DESK_W, DESK_D / 2 + 0.5, DESK_D + 0.5 + 3.3

local POSTERS = {
	"RTX 5090\nIN STOCK!",
	"FREE\nDIAGNOSIS",
	"6 MONTH\nREPAIR WARRANTY",
	"THERMAL PASTE\nSERVICE 15 MIN",
	"10x FASTER\nWITH AN SSD",
	"GAMING PC\nBUILDS",
	"LAPTOP SCREEN\nREPLACEMENT",
	"DATA\nRECOVERY",
}

-- Workbench facing into the room (cf.LookVector points at the technician).
function ShopBuilder.workbench(parent: Instance, cf: CFrame, index: number, items: { [string]: boolean }, rng: Random, style: { [string]: any }?)
	local m = B.model("Workbench_" .. index, parent)
	local st = style or Upgrades.benchStyles[1]
	local top = B.color(st.color)
	local legs = B.color(st.legs)
	local drawerCol = B.color(st.drawers)
	local W, Dp = DESK_W, DESK_D
	-- desk (top surface at y = 3.4)
	B.box(m, cf * CFrame.new(0, 3.25, 0), Vector3.new(W, 0.3, Dp), top, material(st.material or "Metal"))
	for x = -1, 1, 2 do
		B.box(m, cf * CFrame.new(x * (W / 2 - 0.5), 1.55, 0), Vector3.new(0.5, 3.1, Dp - 0.4), legs, M.Metal)
	end
	B.box(m, cf * CFrame.new(0, 2.2, Dp / 2 - 0.4), Vector3.new(W - 1.4, 2, 0.3), legs, M.Metal)
	-- drawers under the end beyond the parts area
	local dx = W / 2 - 2.5
	B.box(m, cf * CFrame.new(dx, 2, -0.2), Vector3.new(3.6, 2.4, Dp - 0.8), drawerCol, M.Metal)
	for k = 0, 2 do
		B.box(m, cf * CFrame.new(dx, 1.2 + k * 0.8, -Dp / 2 + 0.35), Vector3.new(3.4, 0.6, 0.1), drawerCol:Lerp(Color3.new(0, 0, 0), 0.15), M.Metal, nc())
	end
	-- ESD mat under the device and the parts area
	local matCol = if items.bench_mat then Color3.fromRGB(40, 110, 200) else Color3.fromRGB(110, 114, 120)
	B.box(m, cf * CFrame.new(-0.7, 3.42, 0), Vector3.new(11.6, 0.05, Dp - 1.2), matCol, M.Rubber, nc({ Name = "Mat" }))
	-- test monitor on the back, beyond the device
	Props.monitor(m, cf * CFrame.new(6.2, 3.4, Dp / 2 - 1.4) * CFrame.Angles(0, math.rad(-12), 0), "", Color3.fromRGB(10, 30, 50))
	local mon = m:FindFirstChild("Monitor")
	if mon then
		mon.Name = "BenchMonitor"
		local screen = mon:FindFirstChild("Screen")
		if screen then
			screen:SetAttribute("BenchScreen", true)
		end
	end
	-- magnifier lamp clamped to the back right corner, its arm leaning over the parts area
	local lampBase = Vector3.new(-7.4, 3.7, Dp / 2 - 0.4)
	local lampHead = Vector3.new(-4.1, 7.2, Dp / 2 - 2)
	B.box(m, cf * CFrame.new(lampBase), Vector3.new(0.7, 0.6, 0.6), legs, M.Metal)
	local armLen = (lampHead - lampBase).Magnitude
	B.box(m, cf * CFrame.lookAt((lampBase + lampHead) / 2, lampHead), Vector3.new(0.25, 0.25, armLen), legs, M.Metal, nc())
	local head = B.cyl(m, cf * CFrame.new(lampHead) * CFrame.Angles(0, 0, math.pi / 2), 0.4, 2.2, legs, M.Metal, nc())
	head.Name = "LampHead"
	if items.bench_led then
		local led = B.cylY(m, cf * CFrame.new(lampHead.X, lampHead.Y - 0.22, lampHead.Z), 0.08, 2, Color3.fromRGB(255, 250, 240), M.Neon, nc())
		B.spotLight(led, Enum.NormalId.Bottom, 13, 70, 1.1, Color3.fromRGB(255, 250, 240), false)
	end
	-- the light every bench has: a soft fill over the device (it lights the inside of an open case,
	-- which would be black otherwise) and a beam from the lamp onto the mat
	local fill = B.box(m, cf * CFrame.new(ANCHOR_X - 0.4, 9.2, -0.3), Vector3.new(0.3, 0.2, 0.3), Color3.new(1, 1, 1), M.SmoothPlastic, nc({ Transparency = 1, Name = "WorkLight", CastShadow = false }))
	B.pointLight(fill, 15, 0.55, Color3.fromRGB(255, 244, 228), false)
	if not items.bench_led then
		local beam = B.box(m, cf * CFrame.new(lampHead.X, lampHead.Y - 0.3, lampHead.Z), Vector3.new(0.3, 0.1, 0.3), Color3.new(1, 1, 1), M.SmoothPlastic, nc({ Transparency = 1, Name = "LampBeam", CastShadow = false }))
		B.spotLight(beam, Enum.NormalId.Bottom, 13, 75, 0.7, Color3.fromRGB(255, 250, 240), false)
	end
	-- magnetic screw bowl, where PCModel drops the screws (device frame TRAY)
	B.cylY(m, cf * CFrame.new(ANCHOR_X + 4.25, 3.5, -1.76), 0.25, 1.7, Color3.fromRGB(150, 150, 156), M.Metal, nc({ Name = "ScrewTray" }))
	-- stool
	local stool = cf * CFrame.new(STOOL_X, 0, STOOL_Z)
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
	-- a lived-in desk: a phone, a notepad, a stack of paper and a cup (official furniture pack)
	Real.fit(m, "Telephone", cf * CFrame.new(7.2, 3.4, -0.3) * CFrame.Angles(0, math.rad(15), 0), 1.4, 1.6, 1.0)
	Real.fit(m, "PaperStack", cf * CFrame.new(6.0, 3.4, -2.8) * CFrame.Angles(0, math.rad(-12), 0), 1.5, 2.0, 0.6)
	Real.fit(m, "Notepad", cf * CFrame.new(3.9, 3.4, 2.5) * CFrame.Angles(0, math.rad(8), 0), 1.2, 1.5, 0.3)
	Real.fit(m, "CupWhite", cf * CFrame.new(7.4, 3.4, 1.9), 0.6, 0.6, 0.7)
	-- the device sits here; LookVector faces the technician
	local anchor = B.marker(m, "DeviceAnchor", cf * CFrame.new(ANCHOR_X, 3.45, 0))
	anchor:SetAttribute("Bench", index)
	local camAnchor = B.marker(m, "CameraAnchor", cf * CFrame.new(ANCHOR_X, 13, STOOL_Z - 4))
	camAnchor:SetAttribute("Bench", index)
	local prompt = B.prompt(B.marker(m, "PromptAnchor", stool * CFrame.new(0, 3, 0)), "Sit at Bench", "Bench " .. index, { distance = 10, name = "BenchPrompt" })
	prompt:SetAttribute("Bench", index)
	m:SetAttribute("Bench", index)
	B.tag(m, "Workbench")
	-- pegboard with tools on the wall behind the bench
	if items.tool_wall then
		local board = B.box(m, cf * CFrame.new(0, 8.4, Dp / 2 + 0.3), Vector3.new(W - 3, 5, 0.3), Color3.fromRGB(196, 168, 124), M.Wood)
		board.Name = "ToolWall"
		local toolCols = { Color3.fromRGB(220, 40, 30), Color3.fromRGB(30, 100, 200), Color3.fromRGB(240, 170, 20), Color3.fromRGB(40, 40, 44) }
		for k = 0, 13 do
			B.box(m, cf * CFrame.new(-(W - 6) / 2 + k * (W - 6) / 13, 8.4 + ((k % 2) * 0.6 - 0.3), Dp / 2 + 0.1), Vector3.new(0.25, Rand.range(rng, 1.4, 2.6), 0.2), toolCols[(k % 4) + 1], M.SmoothPlastic, nc())
		end
	end
	if items.microscope and index == 1 then
		B.cylY(m, cf * CFrame.new(-6.9, 3.9, -2.6), 1, 1.2, Color3.fromRGB(230, 230, 230), M.SmoothPlastic, nc())
		B.cylY(m, cf * CFrame.new(-6.9, 5.1, -2.7), 1.6, 0.45, Color3.fromRGB(40, 40, 44), M.Metal, nc())
	end
	return m
end

-- Empty plot available for rent.
function ShopBuilder.emptyLot(parent: Instance, cf: CFrame, plotW: number, plotD: number, plotId: number): Model
	local m = B.model("Plot_" .. plotId .. "_Empty", parent)
	-- a vacant lot is a lawn with a paved strip along the street, a few trees and flower beds
	B.box(m, cf * CFrame.new(0, 0.06, SETBACK / 2), Vector3.new(plotW - 2, 0.12, SETBACK), Color3.fromRGB(170, 168, 164), M.SmoothPlastic, { Name = "LotPavement" })
	B.box(m, cf * CFrame.new(0, 0.06, SETBACK + (plotD - SETBACK) / 2), Vector3.new(plotW - 2, 0.12, plotD - SETBACK - 1), Color3.fromRGB(110, 150, 80), M.Grass, { Name = "LotGround" })
	local lotRng = Random.new(plotId * 977)
	for i = 1, math.clamp(math.floor(plotW / 28), 3, 7) do
		local x = -plotW / 2 + plotW * (i - 0.5) / math.clamp(math.floor(plotW / 28), 3, 7) + (lotRng:NextNumber() - 0.5) * 8
		Props.tree(m, cf * CFrame.new(x, 0.12, plotD - 5 - lotRng:NextNumber() * 10), nil, lotRng)
		if i % 2 == 0 then
			Props.flowerBed(m, cf * CFrame.new(x + 7, 0.12, 26 + lotRng:NextNumber() * 20), 8, 3, lotRng)
		end
	end
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
	B.sign(board, Enum.NormalId.Front, "SHOP FOR RENT\n#" .. plotId, { color = Color3.fromRGB(30, 30, 30), font = B.Fonts.Heavy })
	local prompt = B.prompt(board, "Rent This Shop", "Shop for Rent #" .. plotId, { distance = 14, hold = 0.5, name = "ClaimPrompt" })
	prompt:AddTag("ClaimPrompt") -- (the clients switch it off once they run a shop: there is only ever one)
	prompt:SetAttribute("Plot", plotId)
	-- a few construction props
	Props.pallet(m, cf * CFrame.new(-plotW / 3, 0.1, plotD * 0.6))
	Props.crate(m, cf * CFrame.new(plotW / 3, 0.1, plotD * 0.5), 3)
	B.box(m, cf * CFrame.new(plotW / 4, 1.2, plotD * 0.7), Vector3.new(6, 2.4, 3), Color3.fromRGB(196, 186, 170), M.SmoothPlastic)
	m:SetAttribute("Plot", plotId)
	B.tag(m, "EmptyPlot")
	return m
end

-- The finishing touches that make the hall read as one designed room: wainscot panelling, a skirting
-- board and a rail along the side and back walls, a cornice and ceiling beams, a runner from the
-- door into the shop, a doormat, and a hazard line between the shop floor and the workshop.
local function finishings(shop: Model, front: CFrame, W: number, D: number, H: number, accent: Color3, floorCol: Color3, fz: number)
	local m = B.model("Finishings", shop)
	local inner = W / 2 - 1.05
	local panel = accent:Lerp(Color3.new(0, 0, 0), 0.5)
	local skirt = Color3.fromRGB(34, 34, 38)
	local rail = accent:Lerp(Color3.new(1, 1, 1), 0.7)
	-- walls: { centre x, centre z, length along x, length along z }
	local walls = {
		{ -inner, (D - 1) / 2, 0.2, D - 2.1 },
		{ inner, (D - 1) / 2, 0.2, D - 2.1 },
		{ 0, D - 1.05, W - 2.1, 0.2 },
	}
	for _, w in walls do
		B.box(m, front * CFrame.new(w[1], 0.2 + 1.8, w[2]), Vector3.new(w[3], 3.6, w[4]), panel, M.Wood, nc({ Name = "Wainscot" }))
		B.box(m, front * CFrame.new(w[1], 0.2 + 0.35, w[2]), Vector3.new(w[3] + (if w[3] > 1 then 0 else 0.1), 0.7, w[4] + (if w[4] > 1 then 0 else 0.1)), skirt, M.SmoothPlastic, nc({ Name = "Skirting" }))
		B.box(m, front * CFrame.new(w[1], 0.2 + 3.7, w[2]), Vector3.new(w[3] + (if w[3] > 1 then 0 else 0.15), 0.25, w[4] + (if w[4] > 1 then 0 else 0.15)), rail, M.SmoothPlastic, nc({ Name = "Rail" }))
		-- cornice under the ceiling
		B.box(m, front * CFrame.new(w[1], H - 0.45, w[2]), Vector3.new(w[3] + (if w[3] > 1 then 0 else 0.3), 0.5, w[4] + (if w[4] > 1 then 0 else 0.3)), Color3.fromRGB(240, 240, 236), M.SmoothPlastic, nc({ Name = "Cornice" }))
	end
	-- ceiling beams across the hall
	for z = 12, D - 8, 14 do
		B.box(m, front * CFrame.new(0, H - 0.65, z), Vector3.new(W - 2.1, 0.9, 0.7), Color3.fromRGB(58, 60, 66), M.Metal, nc({ Name = "Beam" }))
	end
	-- runner from the door into the shop, with a doormat at the entrance
	local runnerEnd = math.min(fz - 2, 20)
	B.box(m, front * CFrame.new(0, 0.215, 2 + (runnerEnd - 2) / 2), Vector3.new(5.2, 0.03, runnerEnd - 2), panel, M.Fabric, nc({ Name = "Runner" }))
	for side = -1, 1, 2 do
		B.box(m, front * CFrame.new(side * 2.45, 0.235, 2 + (runnerEnd - 2) / 2), Vector3.new(0.3, 0.03, runnerEnd - 2), rail, M.Fabric, nc({ Name = "RunnerEdge" }))
	end
	B.box(m, front * CFrame.new(0, 0.24, 1.9), Vector3.new(7, 0.05, 3), Color3.fromRGB(46, 48, 54), M.Fabric, nc({ Name = "Doormat" }))
	-- the workshop floor is a shade darker, parted from the shop by a hazard line
	local work = floorCol:Lerp(Color3.new(0, 0, 0), 0.14)
	B.box(m, front * CFrame.new(0, 0.208, fz + (D - 1 - fz) / 2), Vector3.new(W - 2.1, 0.016, D - 1 - fz), work, M.SmoothPlastic, nc({ Name = "WorkFloor" }))
	local n = math.floor((W - 4) / 6)
	for k = 0, n - 1 do
		local x = -(W - 4) / 2 + (k + 0.5) * (W - 4) / n
		local col = if k % 2 == 0 then Color3.fromRGB(240, 190, 20) else Color3.fromRGB(30, 30, 34)
		B.box(m, front * CFrame.new(x, 0.222, fz - 0.15), Vector3.new((W - 4) / n, 0.02, 0.35), col, M.SmoothPlastic, nc({ Name = "HazardLine" }))
	end
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
	-- the shop stands in the middle of a much wider lot: the things that belong beside it (sign
	-- pylon, bench, parking) keep close to the building, not out at the edge of the lot
	local halfLot = math.min(plotW / 2, W / 2 + 24)
	local H = if (L.floors or 1) > 1 then 30 else WALL_H

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
	B.box(shop, cf * CFrame.new(0, 0.06, SETBACK / 2), Vector3.new(plotW - 2, 0.12, SETBACK), Color3.fromRGB(170, 168, 164), M.SmoothPlastic)
	B.box(shop, cf * CFrame.new(0, 0.06, SETBACK + D + (plotD - SETBACK - D) / 2), Vector3.new(plotW - 2, 0.12, math.max(1, plotD - SETBACK - D - 1)), Color3.fromRGB(110, 150, 80), M.Grass)
	local front = cf * CFrame.new(0, 0.12, SETBACK)

	-- the building shell
	local hall = Buildings.hall(shop, front, W, D, H, {
		name = opts.name or "PC Repair",
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
		B.box(shop, front * CFrame.new(0, 14.2, -0.6), Vector3.new(W, 0.8, 1.4), accent, M.SmoothPlastic)
		local roofSign = B.box(shop, front * CFrame.new(0, H + 6, D / 2), Vector3.new(math.min(W - 6, 44), 7, 1), Color3.fromRGB(20, 20, 24), M.SmoothPlastic)
		B.sign(roofSign, Enum.NormalId.Front, opts.name or "MEGA TECH", { color = accent, glow = true, brightness = 2.2 })
		B.box(shop, front * CFrame.new(0, H + 1.5, D / 2), Vector3.new(4, 3, 1), Color3.fromRGB(60, 60, 64), M.Metal)
	end
	-- awning in the accent colour
	local awning = styleById(Upgrades.awningStyles, opts.awning or "stripes")
	local awningA = if awning.a then B.color(awning.a) else accent
	local awningB = if awning.b == "accent" then accent elseif awning.b then B.color(awning.b) else nil
	Buildings.awning(shop, front * CFrame.new(-W / 4 - 2, AWNING_Y, 0), W / 2 - 8, awningA, rng, awningB)
	Buildings.awning(shop, front * CFrame.new(W / 4 + 2, AWNING_Y, 0), W / 2 - 8, awningA, rng, awningB)

	-- doorway points
	point("Street", cf * CFrame.new(0, 0.5, -6))
	point("Outside", front * CFrame.new(0, 0.5, -4))
	point("Door", front * CFrame.new(0, 0.5, 3))

	-- zones: front (waiting + counter) up to fz, workshop behind it
	local fz = math.clamp(D * 0.5, 14, 22)
	finishings(shop, front, W, D, H, accent, B.color(floorStyle.color), fz)
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
	local counterStyle = styleById(Upgrades.counterStyles, opts.counter or "classic")
	local counterModel = Props.counter(shop, counterCf, counterW, B.color(counterStyle.color), B.color(counterStyle.top))
	for _, part in counterModel:GetChildren() do
		if part:IsA("BasePart") and part.Material == M.SmoothPlastic and counterStyle.material then
			part.Material = material(counterStyle.material)
		elseif part:IsA("BasePart") and part.Material == M.Marble then
			part.Material = material(counterStyle.topMaterial or "Marble")
		end
	end
	-- the reception desk's own things: service bell, phone, paperwork
	Real.fit(counterModel, "DeskBell", counterCf * CFrame.new(-counterW / 2 + 1.2, 4, -0.5), 0.5, 0.5, 0.5)
	Real.fit(counterModel, "Telephone", counterCf * CFrame.new(-counterW / 2 + 2.6, 4, 0.6) * CFrame.Angles(0, math.rad(200), 0), 1.2, 1.1, 0.9)
	Real.fit(counterModel, "PaperStack", counterCf * CFrame.new(-counterW / 2 + 4.2, 4, 0.5) * CFrame.Angles(0, math.rad(15), 0), 1, 1.4, 0.4)
	Real.fit(counterModel, "Notepad", counterCf * CFrame.new(-counterW / 2 + 5.4, 4, 0.2) * CFrame.Angles(0, math.rad(-20), 0), 0.8, 1, 0.2)
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
	point("CashierSpot", at(xc + counterW / 2 - 2, zc + 2.6, 0.5), { Role = "cashier" })
	if items.trophy then
		-- glass trophy cabinet on the wall nearest the counter
		wallItem({ walls.rightFront, walls.leftFront, walls.back, walls.rightWork, walls.leftWork }, 6, 1.15, 2.3, function(c)
			local m = B.model("TrophyCabinet", shop)
			local real, _, top = Real.fit(m, "DisplayWide", c, 5.8, 2.1, 7.4)
			if real then
				-- gold cups on top of the glass cabinet
				for k = -1, 1 do
					B.cylY(m, c * CFrame.new(k * 1.5, top + 0.6, 0), 1.2, 0.8, Color3.fromRGB(230, 190, 60), M.Metal, nc())
				end
			else
				B.box(m, c * CFrame.new(0, 3.5, 0), Vector3.new(6, 7, 2.2), Color3.fromRGB(90, 60, 40), M.Wood)
				for k = 0, 2 do
					B.cylY(m, c * CFrame.new(-1.6 + k * 1.6, 3 + k * 1.4, -0.9), 1.2, 0.8, Color3.fromRGB(230, 190, 60), M.Metal, nc())
				end
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
	local benchList = {}
	for _, c in candidates do
		local r = c.run:rect(c.t, BENCH_LEN, BENCH_DEPTH)
		if placed < L.benches and plan:free(r, "hard") then
			plan:claim(r, "hard")
			placed += 1
			local bcf = facing(c.x, c.z, c.run.ix, c.run.iz)
			ShopBuilder.workbench(shop, bcf, placed, items, rng, styleById(Upgrades.benchStyles, opts.bench or "steel"))
			table.insert(benchList, { cf = bcf, index = placed })
			point("Staff_" .. placed, bcf * CFrame.new(STOOL_X, 0.4, STOOL_Z), { Bench = placed })
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
					if not Real.sofa(m, "SofaSingle", c, 3.4, 3.3) then
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
					end
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
			Props.tv(shop, at(cx, tz, 9.5), "<b>" .. (opts.name or "PC Repair") .. "</b>\nWelcome!")
		end
	end

	-- comforts and decorations wherever a wall has room
	local comfortRuns = { walls.leftFront, walls.frontLeft, walls.rightFront, walls.leftWork, walls.back, walls.rightWork }
	if items.tea then
		wallItem(comfortRuns, 3, 1.55, 3.1, function(c)
			local m = B.model("TeaStation", shop)
			B.box(m, c * CFrame.new(0, 1.6, 0), Vector3.new(3, 3.2, 3), Color3.fromRGB(150, 110, 70), M.Wood)
			if Real.fit(m, "Kettle", c * CFrame.new(-0.6, 3.2, 0), 1.3, 1.3, 1.5) then
				Real.fit(m, "Tray", c * CFrame.new(0.7, 3.2, 0), 1, 2, 0.5)
				Real.fit(m, "CupWhite", c * CFrame.new(0.7, 3.4, -0.3), 0.5, 0.5, 0.5)
			else
				Props.samovar(m, c * CFrame.new(0, 3.2, 0))
			end
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
	local showSpot = nil
	if items.showcase and level >= 4 then
		for i = 1, 3 do
			-- (the PCs on show are twice the old size, so are the stands)
			local d = wallItem({ walls.frontLeft, walls.frontRight }, 10, 3.8, 7.6, function(c)
				local m = B.model("Showcase", shop)
				B.box(m, c * CFrame.new(0, 1.6, 0), Vector3.new(10, 3.2, 7), Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
				B.box(m, c * CFrame.new(0, 3.25, 0), Vector3.new(9.8, 0.1, 6.8), accent, M.Neon, nc())
			end)
			if not d then
				break
			end
			point("Showcase_" .. i, d * CFrame.new(0, 3.3, 0), { Showcase = i })
			showSpot = showSpot or d * CFrame.new(5, 0, -6.4)
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
	-- things already hanging high on the walls (ShopExtras keeps clear of them)
	local highClaims = {}
	local function highClaim(x0: number, z0: number, x1: number, z1: number, band: string)
		table.insert(highClaims, { x0, z0, x1, z1, band = band })
	end
	if items.music then
		for x = -1, 1, 2 do
			highClaim(x * inner - 0.6, 3, x * inner + 0.6, 5, "top")
		end
	end
	if items.ac then
		highClaim(-3.6, D - 2.2, 3.6, D - 1, "top")
	end
	if items.posters then
		for i = 1, math.min(#POSTERS, 2 + level) do
			local side = if i % 2 == 0 then 1 else -1
			local z = 6 + (i // 2) * 9
			if z < D - 6 then
				highClaim(side * inner - 0.6, z - 1.7, side * inner + 0.6, z + 1.7, "top")
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
	if items.motion_lights then
		-- floodlights high on the facade either side of the door (the client lights them up)
		for side = -1, 1, 2 do
			local fcf = front * CFrame.new(side * 7, H - 3.2, -0.7)
			B.box(shop, fcf * CFrame.new(0, 0.5, 0.25), Vector3.new(0.4, 1, 0.5), Color3.fromRGB(40, 40, 44), M.Metal)
			local lamp = B.box(shop, fcf * CFrame.Angles(math.rad(-35), 0, 0), Vector3.new(1.6, 1, 0.8), Color3.fromRGB(30, 30, 34), M.Metal)
			local glass = B.box(shop, fcf * CFrame.Angles(math.rad(-35), 0, 0) * CFrame.new(0, 0, -0.42), Vector3.new(1.4, 0.8, 0.05), Color3.fromRGB(240, 240, 220), M.Glass, nc({ Name = "FloodGlass" }))
			glass:AddTag("Floodlight")
			local spot = Instance.new("SpotLight")
			spot.Face = Enum.NormalId.Front
			spot.Angle = 70
			spot.Range = 40
			spot.Brightness = 6
			spot.Color = Color3.fromRGB(255, 250, 230)
			spot.Enabled = false
			spot.Parent = glass
			_ = lamp
		end
		-- the PIR sensor over the door
		B.box(shop, front * CFrame.new(0, 10.6, -0.4), Vector3.new(0.8, 0.6, 0.4), Color3.fromRGB(236, 236, 236), M.SmoothPlastic)
	end
	if items.steel_door then
		-- a steel frame and a security grille rolled up over the doorway
		for side = -1, 1, 2 do
			B.box(shop, front * CFrame.new(side * 4.3, 5, -0.35), Vector3.new(0.5, 10, 0.5), Color3.fromRGB(70, 72, 78), M.DiamondPlate)
		end
		B.box(shop, front * CFrame.new(0, 10.1, -0.35), Vector3.new(9.1, 0.6, 0.6), Color3.fromRGB(70, 72, 78), M.DiamondPlate)
	end
	if items.smart_lock then
		local pad = B.box(shop, front * CFrame.new(5.1, 4.2, -0.3), Vector3.new(0.7, 1.1, 0.2), Color3.fromRGB(26, 26, 30), M.SmoothPlastic)
		pad.Name = "SmartLock"
		B.box(shop, front * CFrame.new(5.1, 4.55, -0.42), Vector3.new(0.4, 0.15, 0.04), Color3.fromRGB(60, 230, 120), M.Neon, nc())
	end
	if items.cctv_hd then
		-- dome cameras in the corners and the recorder's monitor on the counter
		for side = -1, 1, 2 do
			B.ball(shop, at(side * (inner - 1), D - 2, H - 0.75), 1.2, Color3.fromRGB(236, 236, 236), M.SmoothPlastic)
		end
		local mon = B.box(shop, counterCf * CFrame.new(-counterW / 2 + 1.4, 4.85, 0.6) * CFrame.Angles(0, math.pi, 0), Vector3.new(2.2, 1.4, 0.15), Color3.fromRGB(20, 20, 22), M.SmoothPlastic)
		mon.Name = "CCTVMonitor"
		B.sign(mon, Enum.NormalId.Front, "CAM 1   CAM 2\nCAM 3   CAM 4\n● REC", { color = Color3.fromRGB(120, 255, 140), background = Color3.fromRGB(14, 22, 18), glow = true, brightness = 1.4, font = B.Fonts.Mono })
		B.box(shop, counterCf * CFrame.new(-counterW / 2 + 1.4, 4.2, 0.6), Vector3.new(0.6, 0.3, 0.6), Color3.fromRGB(30, 30, 32), M.SmoothPlastic)
	end
	if items.panic_button then
		local btn = B.cylY(shop, counterCf * CFrame.new(counterW / 2 - 0.8, 4.12, 0.9), 0.25, 0.7, Color3.fromRGB(220, 30, 30), M.SmoothPlastic)
		btn.Name = "PanicButton"
		B.box(shop, counterCf * CFrame.new(counterW / 2 - 0.8, 4.02, 0.9), Vector3.new(1, 0.1, 1), Color3.fromRGB(250, 210, 40), M.SmoothPlastic)
	end
	if items.insurance then
		wallItem({ walls.rightFront, walls.leftFront, walls.back }, 2.4, 0.15, 0.3, function(c)
			local frame = B.box(shop, c * CFrame.new(0, 6.5, 0), Vector3.new(2.4, 3, 0.2), Color3.fromRGB(150, 110, 60), M.Wood)
			local paper = B.box(shop, c * CFrame.new(0, 6.5, -0.12), Vector3.new(2.0, 2.6, 0.05), Color3.fromRGB(246, 244, 236), M.SmoothPlastic)
			B.sign(paper, Enum.NormalId.Front, "BUSINESS\nINSURANCE\nPOLICY", { color = Color3.fromRGB(30, 50, 120), font = B.Fonts.Serif })
			_ = frame
		end)
	end
	if items.guard_dog then
		-- Buddy, a shepherd dog, lies on his cushion just inside the door
		for ring = 0, 10 do
			local done = false
			for _, x in { 6.5 + ring, -6.5 - ring } do
				local r = { x - 1.8, 1.2, x + 1.8, 4.2 }
				if plan:free(r, "hard") and plan:free(r, "walk") then
					plan:claim(r, "hard")
					Props.guardDog(shop, at(x, 2.7, 0.12) * CFrame.Angles(0, if x > 0 then -math.pi / 2 else math.pi / 2, 0))
					done = true
					break
				end
			end
			if done then
				break
			end
		end
	end
	-- staff spots
	standSpot("GuardSpot", 6.2, 3.2, { Role = "security" })
	standSpot("ManagerSpot", 0, fz + 3, { Role = "manager" })
	standSpot("CleanerSpot", 0, (fz + D) / 2 - 2, { Role = "cleaner" })
	standSpot("QASpot", 0, fz + 4, { Role = "engineer" })
	standSpot("TeaSpot", -5.8, fz - 1.6, { Role = "tea_maker" })
	if showSpot then
		local sx, sz = local2(showSpot)
		standSpot("SalesSpot", sx, sz, { Role = "salesperson" })
	else
		standSpot("SalesSpot", inner - 6, 6, { Role = "salesperson" })
	end
	-- the night watchman's post outside, beside the door
	point("NightGuardSpot", front * CFrame.new(-6.5, 0.5, -2.6), { Role = "night_guard" })
	-- everything else from the catalogue: wall, floor, ceiling, counter, bench shelf, forecourt, roof,
	-- window (Models/ShopExtras)
	local outsideA, outsideB = {}, {}
	table.insert(outsideB, { halfLot - 7.4, halfLot - 0.6 }) -- the pylon sign
	table.insert(outsideB, { -halfLot + 3, -halfLot + 9 }) -- the bench
	if items.plants then
		for side = -1, 1, 2 do
			local iv = { side * (W / 2 - 2) - 1.8, side * (W / 2 - 2) + 1.8 }
			table.insert(outsideA, iv)
			table.insert(outsideB, iv)
		end
	end
	local roofClaims = {}
	if (L.floors or 1) > 1 then
		local half = math.min(W - 6, 44) / 2
		table.insert(roofClaims, { -half, D / 2 - 1.5, half, D / 2 + 1.5 })
	end
	ShopExtras.place({
		shop = shop, plan = plan, walls = walls, wallItem = wallItem, at = at, facing = facing, local2 = local2,
		front = front, cf = cf, W = W, D = D, H = H, inner = inner, fz = fz, awningY = AWNING_Y,
		counterCf = counterCf, counterW = counterW, benches = benchList, accent = accent, rng = rng, items = items,
		level = level, plotW = halfLot * 2, setback = SETBACK, points = points, highClaims = highClaims,
		outside = { A = outsideA, B = outsideB }, roof = roofClaims, name = opts.name, plotId = opts.plotId,
	})
	-- The lot around the shop: trees, hedges and flower beds on the lawn behind it, lamps, planters and
	-- bins along the pavement on either side (the lot is much wider than the building)
	do
		local lot = shop -- (each piece is its own model: nothing here spans the whole lot)
		local function mark(m: Instance?)
			if m then
				m:SetAttribute("LotDecor", true)
			end
		end
		local lawnZ0 = SETBACK + D + 3
		local lawnD = plotD - SETBACK - D - 3
		if lawnD >= 8 then
			local n = math.clamp(math.floor(plotW / 26), 3, 7)
			for i = 1, n do
				local x = -plotW / 2 + plotW * (i - 0.5) / n + (rng:NextNumber() - 0.5) * 6
				mark(Props.tree(lot, cf * CFrame.new(x, 0.12, lawnZ0 + lawnD - 3), nil, rng))
				if i % 2 == 1 then
					mark(Props.flowerBed(lot, cf * CFrame.new(x + 8, 0.12, lawnZ0 + 3), 9, 3.2, rng))
				end
			end
		end
		for side = -1, 1, 2 do
			local x = side * (W / 2 + 12)
			while math.abs(x) < plotW / 2 - 6 do
				mark(Props.streetLamp(lot, cf * CFrame.new(x, 0.12, SETBACK - 1)))
				mark(Props.planter(lot, cf * CFrame.new(x + side * 7, 0.12, SETBACK / 2), rng))
				if rng:NextNumber() < 0.5 then
					mark(Props.bin(lot, cf * CFrame.new(x + side * 13, 0.12, SETBACK / 2)))
				end
				x += side * 26
			end
		end
	end

	-- The shop's own fixtures, from the official furniture pack (placed after the catalogue items,
	-- in whatever room is left): shelving and glass cases along the walls, display islands on the
	-- floor, a cabinet and a clock. A bigger shop gets more of them.
	do
		local runs = { walls.leftFront, walls.rightFront, walls.leftWork, walls.rightWork, walls.back, walls.frontLeft }
		local count = math.clamp(math.floor(W / 20), 2, 6)
		local names = { "MetalShelf", "Bookcase", "DisplayTall", "Bookcase", "MetalShelf", "DisplayWide" }
		for i = 1, count do
			local name = names[(i - 1) % #names + 1]
			wallItem(runs, 5.6, 1.5, 3.2, function(c)
				Real.fit(shop, name, c, 5.2, 2.2, 8.4)
			end)
		end
		wallItem(runs, 3, 1.2, 2.4, function(c)
			Real.fit(shop, "GrandfatherClock", c, 2.8, 1.8, 8.5)
		end)
		wallItem({ walls.back, walls.leftWork, walls.rightWork }, 8, 1.4, 3.2, function(c)
			Real.fit(shop, "Credenza", c, 7.6, 2.8, 3.6)
			Real.fit(shop, "TableLamp", c * CFrame.new(-2.4, 3.6, 0), 1.2, 1.2, 2.2)
		end)
		wallItem(runs, 2.6, 1.3, 2.8, function(c)
			Real.fit(shop, "FilingCabinet", c, 2.4, 2.3, 3)
		end)
		-- display islands in the customer area
		local islands = math.clamp(math.floor(W / 24), 1, 4)
		local made = 0
		for _ = 1, 60 do
			if made >= islands then
				break
			end
			local x = (rng:NextNumber() * 2 - 1) * (inner - 9)
			local z = 9 + rng:NextNumber() * math.max(1, fz - 14)
			local w, d = 6.4, 3.2
			local r = { x - w / 2 - 1.2, z - d / 2 - 1.2, x + w / 2 + 1.2, z + d / 2 + 1.2 }
			if plan:free(r, "hard") then
				plan:claim(r, "hard")
				made += 1
				local c = at(x, z)
				if made % 2 == 0 then
					Real.fit(shop, "DisplayWide", c, w, d, 8.4)
				else
					Real.fit(shop, "CoffeeTable", c, 5.4, 2.8, 2)
					Real.fit(shop, "TableLamp", c * CFrame.new(1.6, 1.9, 0), 1.2, 1.2, 2.2)
				end
			end
		end
	end
	point("ThiefExit", cf * CFrame.new(if rng:NextNumber() < 0.5 then -halfLot - 20 else halfLot + 20, 0.5, -10))
	-- outside: pylon sign, bench, parking marker
	local pylon = cf * CFrame.new(halfLot - 4, 0.12, 2)
	B.box(shop, pylon * CFrame.new(0, 5, 0), Vector3.new(0.6, 10, 0.6), Color3.fromRGB(60, 60, 64), M.Metal)
	local pylonSign = B.box(shop, pylon * CFrame.new(0, 10.5, 0), Vector3.new(6, 4, 0.8), accent, if items.neon then M.Neon else M.SmoothPlastic)
	B.sign(pylonSign, Enum.NormalId.Front, "🔧 " .. (opts.name or "Repair"), { color = Color3.new(1, 1, 1), glow = true })
	B.sign(pylonSign, Enum.NormalId.Back, "🔧 " .. (opts.name or "Repair"), { color = Color3.new(1, 1, 1), glow = true, name = "SignBack" })
	if items.sign_pro then
		-- (a lightbox on the roof edge, standing on two posts)
		local lbW = math.min(W - 4, 30)
		local lb = B.box(shop, front * CFrame.new(0, H + 2.9, -0.2), Vector3.new(lbW, 3, 1), Color3.fromRGB(250, 250, 250), M.SmoothPlastic)
		B.sign(lb, Enum.NormalId.Front, "COMPUTERS • LAPTOPS • REPAIR", { color = accent, glow = true, brightness = 1.6 })
		for side = -1, 1, 2 do
			B.box(shop, front * CFrame.new(side * (lbW / 2 - 2), H + 1.5, -0.2), Vector3.new(0.5, 1.2, 0.5), Color3.fromRGB(60, 60, 64), M.Metal)
		end
	end
	Props.bench(shop, cf * CFrame.new(-halfLot + 6, 0.12, 2) * CFrame.Angles(0, 0, 0))
	point("Parking", cf * CFrame.new(-halfLot / 2, 0.5, -16) * CFrame.Angles(0, math.pi / 2, 0), { Parking = true })
	if items.parking then
		for k = 0, 1 do
			B.box(shop, cf * CFrame.new(-halfLot / 2 - 10 + k * 20, 0.12, -16), Vector3.new(0.4, 0.04, 9), Color3.new(1, 1, 1), M.SmoothPlastic, nc())
		end
	end
	if opts.owner then
		-- the owner's nameplate stuck on the shop window
		local ownerTag = B.box(shop, front * CFrame.new(-W / 2 + 4, 6, 0.25), Vector3.new(5, 1.2, 0.2), Color3.fromRGB(240, 240, 236), M.SmoothPlastic, nc())
		B.sign(ownerTag, Enum.NormalId.Front, "Owner: " .. opts.owner, { color = Color3.fromRGB(30, 30, 30), font = B.Fonts.Medium })
	end
	B.tag(shop, "PlayerShop")
	return shop, { front = front, counter = counterCf, width = W, depth = D, height = H }
end

return ShopBuilder
