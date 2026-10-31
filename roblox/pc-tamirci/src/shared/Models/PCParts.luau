-- PCParts: builders for every desktop component the repair bench shows. Each builder draws the part
-- in its own local frame (`cf`) at real proportions (S studs per centimetre; screws, clips and pins
-- are exaggerated so they stay readable and clickable) and returns a Model whose PrimaryPart sits
-- at `cf`. Nothing collides; everything can be ray-picked.

local B = require(script.Parent.Parent.Util.Builder)

local PCParts = {}
local M = Enum.Material

local S = 0.11 -- studs per centimetre
PCParts.S = S

local function cm(v: number): number
	return v * S
end
PCParts.cm = cm

local GOLD = Color3.fromRGB(214, 176, 72)
local STEEL = Color3.fromRGB(176, 180, 186)
local DARK = Color3.fromRGB(26, 26, 30)
local SLOT = Color3.fromRGB(34, 34, 38)

-- PCB, heatsink and accent colours per motherboard theme
local THEMES = {
	black = { pcb = { 24, 24, 28 }, sink = { 52, 54, 60 }, accent = { 120, 124, 132 } },
	aorus = { pcb = { 22, 22, 26 }, sink = { 44, 44, 50 }, accent = { 255, 122, 0 } },
	rog = { pcb = { 20, 20, 24 }, sink = { 40, 42, 48 }, accent = { 230, 20, 40 } },
	tuf = { pcb = { 36, 34, 30 }, sink = { 92, 92, 96 }, accent = { 236, 184, 30 } },
	gray = { pcb = { 42, 44, 48 }, sink = { 150, 154, 162 }, accent = { 200, 204, 210 } },
	blue = { pcb = { 22, 52, 112 }, sink = { 70, 96, 140 }, accent = { 150, 190, 240 } },
	green = { pcb = { 26, 88, 46 }, sink = { 170, 174, 180 }, accent = { 210, 214, 220 } },
	red = { pcb = { 24, 24, 28 }, sink = { 170, 30, 34 }, accent = { 230, 60, 60 } },
	white = { pcb = { 232, 232, 236 }, sink = { 244, 244, 246 }, accent = { 200, 204, 210 } },
	taichi = { pcb = { 22, 22, 24 }, sink = { 40, 40, 42 }, accent = { 196, 150, 80 } },
}
PCParts.Themes = THEMES

local function col(c: any): Color3
	return B.color(c)
end

----------------------------------------------------------------------------------------------------
-- Model helpers
----------------------------------------------------------------------------------------------------
local function newModel(name: string, cf: CFrame): Model
	local m = Instance.new("Model")
	m.Name = name
	local r = Instance.new("Part")
	r.Name = "Root"
	r.Anchored = true
	r.CanCollide = false
	r.CanTouch = false
	r.CanQuery = false
	r.Transparency = 1
	r.Size = Vector3.new(0.05, 0.05, 0.05)
	r.CFrame = cf
	r.Parent = m
	m.PrimaryPart = r
	return m
end
PCParts.newModel = newModel

local function props(extra: { [string]: any }?, size: Vector3?)
	local t: { [string]: any } = { CanCollide = false, CanTouch = false }
	if size and math.max(size.X, size.Y, size.Z) < 0.12 then
		t.CastShadow = false
	end
	if extra then
		for k, v in extra do
			t[k] = v
		end
	end
	return t
end

local function box(m: Instance, cf: CFrame, size: Vector3, color: any, mat: Enum.Material?, extra: { [string]: any }?): BasePart
	return B.box(m, cf, size, color, mat or M.SmoothPlastic, props(extra, size))
end
PCParts.box = box

-- cylinder along the local axis of cf ("X", "Y" or "Z")
local function cyl(m: Instance, cf: CFrame, axis: string, length: number, diameter: number, color: any, mat: Enum.Material?, extra: { [string]: any }?): BasePart
	local size = Vector3.new(length, diameter, diameter)
	if axis == "Y" then
		return B.cylY(m, cf, length, diameter, color, mat or M.SmoothPlastic, props(extra, size))
	elseif axis == "Z" then
		return B.cylZ(m, cf, length, diameter, color, mat or M.SmoothPlastic, props(extra, size))
	end
	return B.cyl(m, cf, length, diameter, color, mat or M.SmoothPlastic, props(extra, size))
end
PCParts.cyl = cyl

-- A clear carrier lying flat on a surface (cf: the spot, +Y out of the surface) whose text reads
-- along +X with its top towards -Z: upright for the technician, who looks along -Z.
local FLAT = CFrame.fromMatrix(Vector3.zero, Vector3.new(-1, 0, 0), Vector3.new(0, 0, -1))
PCParts.FLAT = FLAT
local function flatText(parent: Instance, cf: CFrame, w: number, h: number, text: string, color: any, ppS: number?, font: Font?, glow: boolean?): BasePart
	local c = Instance.new("Part")
	c.Name = "Text"
	c.Anchored = true
	c.CanCollide = false
	c.CanTouch = false
	c.CanQuery = false
	c.CastShadow = false
	c.Transparency = 1
	c.Size = Vector3.new(w, h, 0.002)
	c.CFrame = cf * FLAT
	B.sign(c, Enum.NormalId.Front, text, { color = col(color), pixelsPerStud = ppS or 300, font = font or B.Fonts.Bold, glow = glow })
	c.Parent = parent
	return c
end
PCParts.flatText = flatText

-- small text sticker on a face of `part` (on the top face it lies on a flat carrier, so it reads
-- the same way everywhere)
local function label(part: BasePart, face: Enum.NormalId, text: string, color: any, ppS: number?, font: Font?)
	if face == Enum.NormalId.Top then
		local sz = part.Size
		flatText(part, part.CFrame * CFrame.new(0, sz.Y / 2 + 0.0012, 0), sz.X, sz.Z, text, color, ppS, font)
		return
	end
	B.sign(part, face, text, { color = col(color), pixelsPerStud = ppS or 300, font = font or B.Fonts.Bold })
end
PCParts.label = label

-- Fan rotor (blades + hub) spinning around the local Y axis of cf; tagged for the bench animator.
-- glow: translucent blades lit from the hub (ARGB fans), colour-cycling while the PC runs.
local function rotor(m: Instance, cf: CFrame, diameter: number, bladeCol: any, hubCol: any, blades: number?, glow: boolean?): Model
	local r = newModel("Rotor", cf)
	r:SetAttribute("SpinAxis", "Y")
	local n = blades or 7
	for i = 1, n do
		local a = (i / n) * math.pi * 2
		local bcf = cf * CFrame.Angles(0, a, 0) * CFrame.new(diameter * 0.27, 0, 0) * CFrame.Angles(math.rad(28), 0, 0)
		local b = box(r, bcf, Vector3.new(diameter * 0.36, math.max(0.006, diameter * 0.02), diameter * 0.2), if glow then Color3.fromRGB(230, 225, 255) else bladeCol, if glow then M.Neon else M.SmoothPlastic)
		if glow then
			b.Transparency = 0.25
			b.CastShadow = false
			b:SetAttribute("RGB", true)
		end
	end
	cyl(r, cf, "Y", diameter * 0.12, diameter * 0.32, hubCol, M.SmoothPlastic)
	r.Parent = m
	return r
end
PCParts.rotor = rotor

-- Grey-brown fuzz over a surface; PCModel sets its transparency from the dust level.
local function dustLayer(m: Instance, cf: CFrame, size: Vector3): BasePart
	local d = box(m, cf, size, Color3.fromRGB(150, 140, 122), M.Fabric, { Name = "Dust", Transparency = 1, CastShadow = false })
	d:SetAttribute("Dust", true)
	return d
end
PCParts.dustLayer = dustLayer

----------------------------------------------------------------------------------------------------
-- Screws (head up along +Y; the shaft points down)
----------------------------------------------------------------------------------------------------
function PCParts.screw(cf: CFrame, bit: string): Model
	local m = newModel("Screw", cf)
	local head, height, color
	if bit == "thumb" then
		head, height, color = 0.13, 0.06, Color3.fromRGB(30, 30, 32)
	elseif bit == "toolless" then
		head, height, color = 0.09, 0.04, Color3.fromRGB(60, 60, 64)
	elseif bit == "PH2" then
		head, height, color = 0.075, 0.025, Color3.fromRGB(170, 174, 180)
	else
		head, height, color = 0.05, 0.018, Color3.fromRGB(30, 30, 32)
	end
	cyl(m, cf * CFrame.new(0, height / 2, 0), "Y", height, head, color, M.Metal)
	if bit == "thumb" then
		-- knurled thumb screw with a phillips slot on top
		cyl(m, cf * CFrame.new(0, height + 0.004, 0), "Y", 0.008, head * 0.7, Color3.fromRGB(70, 70, 74), M.Metal)
	end
	if bit ~= "toolless" then
		local slot = Color3.fromRGB(16, 16, 18)
		local w = head * 0.12
		local top = height + 0.002 + (if bit == "thumb" then 0.008 else 0)
		if bit == "T5" then
			for k = 0, 2 do
				box(m, cf * CFrame.new(0, top, 0) * CFrame.Angles(0, k * math.pi / 3, 0), Vector3.new(head * 0.55, 0.004, w), slot)
			end
		else
			box(m, cf * CFrame.new(0, top, 0), Vector3.new(head * 0.6, 0.004, w), slot)
			box(m, cf * CFrame.new(0, top, 0), Vector3.new(w, 0.004, head * 0.6), slot)
		end
	end
	-- threaded shaft (hidden inside the hole while fitted)
	cyl(m, cf * CFrame.new(0, -0.03, 0), "Y", 0.06, head * 0.45, Color3.fromRGB(150, 150, 156), M.Metal, { Name = "Shaft" })
	-- generous invisible pick target
	box(m, cf * CFrame.new(0, height / 2, 0), Vector3.new(0.2, 0.12, 0.2), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1, CastShadow = false })
	return m
end

----------------------------------------------------------------------------------------------------
-- Case (lying on its side: open side up +Y, front at -X, rear at +X, top at -Z, bottom at +Z)
----------------------------------------------------------------------------------------------------
local CASE_DIMS = {
	retro = { 42, 19, 42 },
	office = { 38, 17.5, 38 },
	sff = { 42, 11, 34 },
	airflow = { 45, 22, 46 },
	glass = { 44, 21, 45 },
	showcase = { 46, 28, 47 },
	wood = { 45, 23, 47 },
	fulltower = { 54, 24, 57 },
	itx = { 37, 18.5, 29 },
}

function PCParts.caseDims(casePart): Vector3
	local d = CASE_DIMS[casePart and casePart.style or "airflow"] or CASE_DIMS.airflow
	return Vector3.new(cm(d[1]), cm(d[2]), cm(d[3]))
end

local CASE_COLORS = {
	black = { 30, 30, 34 },
	white = { 236, 236, 238 },
	beige = { 214, 204, 176 },
}

function PCParts.caseColor(casePart): Color3
	return col(CASE_COLORS[casePart and casePart.color or "black"] or CASE_COLORS.black)
end

-- The chassis (root of the desktop). Origin: centre of the footprint on the bench.
function PCParts.chassis(cf: CFrame, casePart): (Model, Vector3)
	local m = newModel("Chassis", cf)
	local dims = PCParts.caseDims(casePart)
	local lx, ly, lz = dims.X, dims.Y, dims.Z
	local body = PCParts.caseColor(casePart)
	-- (a light-grey inside, so the dark parts stand out against the floor and walls of the case)
	local dark = body.R + body.G + body.B < 0.6
	local inner = if dark then Color3.fromRGB(122, 126, 136) else body:Lerp(Color3.new(0, 0, 0), 0.12)
	local innerMat = if dark then M.SmoothPlastic else M.Metal
	local t = 0.035
	local style = casePart and casePart.style or "airflow"
	-- motherboard tray (now the floor)
	box(m, cf * CFrame.new(0, t / 2, 0), Vector3.new(lx, t, lz), inner, innerMat, { Name = "Tray" })
	-- cable grommets beside the board
	for k = 0, 2 do
		box(m, cf * CFrame.new(-lx / 2 + cm(12.5), t + 0.002, -lz / 2 + cm(9) + k * cm(9)), Vector3.new(cm(1.4), 0.004, cm(5)), DARK, M.Rubber)
	end
	-- front panel (thick, with mesh or glass) at -X
	local frontMat = if style == "airflow" or style == "itx" then M.Metal else M.SmoothPlastic
	local front = box(m, cf * CFrame.new(-lx / 2 + cm(1.2), ly / 2, 0), Vector3.new(cm(2.4), ly, lz), body, frontMat, { Name = "FrontPanel" })
	if style == "wood" then
		for k = -3, 3 do
			box(m, cf * CFrame.new(-lx / 2 - 0.004, ly / 2, k * lz / 8), Vector3.new(0.01, ly * 0.9, lz / 9.5), Color3.fromRGB(120, 78, 44), M.Wood)
		end
	elseif style == "retro" then
		-- 5.25" bays and a floppy slot
		for k = 0, 2 do
			box(m, cf * CFrame.new(-lx / 2 - 0.004, ly / 2, -lz / 2 + cm(5) + k * cm(4.6)), Vector3.new(0.01, cm(14.8), cm(4.2)), Color3.fromRGB(200, 190, 162), M.SmoothPlastic)
		end
		box(m, cf * CFrame.new(-lx / 2 - 0.006, ly / 2, -lz / 2 + cm(19)), Vector3.new(0.01, cm(10), cm(0.6)), DARK)
	end
	front:SetAttribute("Detail", "front")
	-- power button and LED on the front top edge
	cyl(m, cf * CFrame.new(-lx / 2 + cm(1.2), ly - 0.01, -lz / 2 + cm(3)), "Y", 0.02, cm(1.6), Color3.fromRGB(70, 70, 74), M.Metal, { Name = "PowerButton" })
	box(m, cf * CFrame.new(-lx / 2 + cm(1.2), ly - 0.01, -lz / 2 + cm(5)), Vector3.new(0.03, 0.02, 0.03), Color3.fromRGB(60, 200, 255), M.Neon, { Name = "PowerLed", Transparency = 0.7 })
	-- rear panel with I/O cut-out, expansion slot covers and PSU opening
	box(m, cf * CFrame.new(lx / 2 - t / 2, ly / 2, 0), Vector3.new(t, ly, lz), inner, innerMat, { Name = "RearPanel" })
	for k = 0, 6 do
		box(m, cf * CFrame.new(lx / 2 + 0.003, ly * 0.5, cm(1.5) + k * cm(2.03) - lz / 2 + cm(19.5)), Vector3.new(0.006, ly * 0.55, cm(1.7)), Color3.fromRGB(70, 72, 76), M.Metal)
	end
	-- top (-Z) and bottom (+Z) walls
	local topWall = box(m, cf * CFrame.new(0, ly / 2, -lz / 2 + t / 2), Vector3.new(lx, ly, t), body, M.Metal, { Name = "TopPanel" })
	topWall:SetAttribute("Detail", "top")
	box(m, cf * CFrame.new(0, ly / 2, lz / 2 - t / 2), Vector3.new(lx, ly, t), body, M.Metal, { Name = "BottomPanel" })
	-- a dark case is light grey inside: the black parts stand out against it
	if dark then
		box(m, cf * CFrame.new(0, ly / 2, -lz / 2 + t + 0.004), Vector3.new(lx - t * 2, ly, 0.008), inner, innerMat, { Name = "LinerTop" })
		box(m, cf * CFrame.new(0, ly / 2, lz / 2 - t - 0.004), Vector3.new(lx - t * 2, ly, 0.008), inner, innerMat, { Name = "LinerBottom" })
		box(m, cf * CFrame.new(-lx / 2 + cm(2.4) + 0.004, ly / 2, 0), Vector3.new(0.008, ly, lz - t * 2), inner, innerMat, { Name = "LinerFront" })
	end
	-- PSU intake vent under the power supply
	box(m, cf * CFrame.new(lx / 2 - cm(8), ly * 0.4, lz / 2 + 0.002), Vector3.new(cm(12), cm(11), 0.004), Color3.fromRGB(14, 14, 16), M.Metal)
	-- feet on the old bottom
	for _, x in { -lx / 2 + cm(5), lx / 2 - cm(5) } do
		box(m, cf * CFrame.new(x, ly / 2, lz / 2 + cm(0.8)), Vector3.new(cm(4), ly * 0.7, cm(1.6)), Color3.fromRGB(40, 40, 44), M.Rubber)
	end
	-- PSU shroud (front half) and the drive cage under it
	if style ~= "sff" and style ~= "office" and style ~= "retro" and style ~= "itx" then
		local sz = lz / 2 - cm(10.5)
		-- (only half as high as the case: the drives behind it stay in view from the bench)
		local sh = ly * 0.45
		box(m, cf * CFrame.new(-lx / 4, sh / 2, sz), Vector3.new(lx / 2, sh, t), inner, innerMat, { Name = "Shroud" })
		box(m, cf * CFrame.new(-lx / 4, sh - 0.01, sz + cm(0.5)), Vector3.new(lx / 2 - cm(2), 0.012, cm(1)), body:Lerp(Color3.new(1, 1, 1), 0.2), M.Metal)
	end
	-- RGB strip on showcase/glass cases
	if casePart and casePart.rgb then
		local strip = box(m, cf * CFrame.new(-lx / 2 + cm(2.6), ly * 0.5, 0), Vector3.new(0.02, ly * 0.8, lz * 0.9), Color3.fromRGB(140, 60, 255), M.Neon, { Name = "CaseRGB", Transparency = 0.4 })
		strip:SetAttribute("RGB", true)
	end
	-- brand badge on the front
	local badge = box(m, cf * CFrame.new(-lx / 2 - 0.004, ly * 0.5, lz / 2 - cm(4)), Vector3.new(0.008, cm(1.5), cm(5)), Color3.fromRGB(200, 200, 204), M.Metal)
	badge.Name = "Badge"
	local maker = PCParts.makerOf(casePart)
	if maker then
		label(badge, Enum.NormalId.Left, if maker == "ASUS" then "ROG" else maker, Color3.fromRGB(30, 30, 34), 400, B.Fonts.Heavy)
	end
	return m, dims
end

-- Side panel lying on top of the case: origin at its centre, glass or steel.
function PCParts.sidePanel(cf: CFrame, casePart, dims: Vector3): Model
	local m = newModel("SidePanel", cf)
	local body = PCParts.caseColor(casePart)
	local w, d = dims.X, dims.Z
	if casePart and casePart.glass then
		box(m, cf, Vector3.new(w - 0.02, 0.025, d - 0.02), Color3.fromRGB(70, 82, 96), M.Glass, { Name = "Glass", Transparency = 0.62, CastShadow = false })
		-- tinted border print
		local border = Color3.fromRGB(16, 16, 18)
		box(m, cf * CFrame.new(0, 0.014, -d / 2 + 0.06), Vector3.new(w, 0.004, 0.12), border)
		box(m, cf * CFrame.new(0, 0.014, d / 2 - 0.06), Vector3.new(w, 0.004, 0.12), border)
		box(m, cf * CFrame.new(-w / 2 + 0.06, 0.014, 0), Vector3.new(0.12, 0.004, d), border)
		box(m, cf * CFrame.new(w / 2 - 0.06, 0.014, 0), Vector3.new(0.12, 0.004, d), border)
	else
		box(m, cf, Vector3.new(w, 0.02, d), body, M.Metal, { Name = "Steel" })
		-- vent perforation patch
		box(m, cf * CFrame.new(-w * 0.15, 0.011, -d * 0.12), Vector3.new(w * 0.35, 0.003, d * 0.3), body:Lerp(Color3.new(0, 0, 0), 0.4), M.DiamondPlate)
	end
	-- grab handle at the rear edge
	box(m, cf * CFrame.new(w / 2 - 0.05, 0.02, 0), Vector3.new(0.05, 0.02, d * 0.3), body:Lerp(Color3.new(0, 0, 0), 0.3), M.Metal)
	return m
end

----------------------------------------------------------------------------------------------------
-- Motherboard. Local frame: origin at the top-rear corner on the PCB surface; +u (cm) runs to the
-- front (-X), +w (cm) down the board (+Z). layout() returns where every slot and header sits.
----------------------------------------------------------------------------------------------------
local BOARD_SIZE = { ATX = { 24.4, 30.5 }, mATX = { 24.4, 24.4 }, ITX = { 17, 17 }, EATX = { 27.7, 30.5 } }

local function socketSize(socket: string): (number, number)
	if socket == "LGA1700" or socket == "LGA1851" then
		return 4.5, 3.75
	elseif socket == "LGA2011-3" then
		return 5.25, 4.5
	elseif socket == "sTR5" then
		return 7.5, 7.2
	elseif string.sub(socket, 1, 2) == "AM" then
		return 4, 4
	end
	return 3.75, 3.75
end
PCParts.socketSize = socketSize

function PCParts.boardLayout(moboPart)
	local form = moboPart and moboPart.form or "ATX"
	local size = BOARD_SIZE[form] or BOARD_SIZE.ATX
	local W, H = size[1], size[2]
	local itx = form == "ITX"
	local L = { form = form, W = W, H = H }
	local function at(u: number, w: number, y: number?): CFrame
		return CFrame.new(-cm(u), y or 0, cm(w))
	end
	L.at = at
	local su = if itx then 8 else 10
	L.socket = at(su, 8)
	L.socketSize = { socketSize(moboPart and moboPart.socket or "AM4") }
	L.ram = {}
	local slots = moboPart and moboPart.memSlots or 4
	for i = 1, slots do
		local u = (if itx then 13.6 else 16.4) + (i - 1) * 0.85
		L.ram[i] = at(u, 8.1)
	end
	L.ramLen = 13.3
	L.pcie = at(7.95, 15.3) -- slot centre, slot runs along u from 3.5 to 12.4
	L.pcieLatch = at(13, 15.3)
	L.nvme = { at(8.5, 13), at(8.5, 19.5) }
	if itx then
		L.nvme = { at(8.5, 12.3) }
	end
	-- the CMOS battery: below the slots on the bigger boards, beside the RAM on ITX
	L.cmos = if itx then at(15.95, 4.3) else at(14.5, 17.6)
	L.cmosSize = if itx then 2.1 else 2.3
	L.caps = {
		at(4.2, 3.0), at(4.2, 4.5), at(4.2, 6.0),
		at(su - 2, 11.2), at(su, 11.2), at(su + 2, 11.2),
	}
	L.atx24 = at(W - 1.3, 8.6)
	L.eps = at(12.6, 0.8)
	L.cpuFan = at(14.6, 0.8)
	-- (the second header sits above the graphics card, not under it)
	L.sysFan = { at(W - 1, 2), at(W - 1, 13), at(W - 6, H - 1), at(W - 9, H - 1), at(3, H - 1), at(W - 12, H - 1) }
	L.sata = { at(W - 1.1, math.min(H - 3, 22)), at(W - 1.1, math.min(H - 5, 24.2)) }
	L.chipset = if itx then at(16, 16.3) else at(17.5, math.min(H - 5, 20.3))
	L.chipsetSize = if itx then { 2.0, 1.2 } else { 5.5, 4.8 }
	return L
end

local function themeOf(moboPart)
	return THEMES[moboPart and moboPart.theme or "black"] or THEMES.black
end

-- The board's series, printed on its heatsinks ("ROG STRIX", "TOMAHAWK"...).
local SERIES = {
	{ "ROG MAXIMUS", "ROG MAXIMUS" }, { "ROG CROSSHAIR", "ROG CROSSHAIR" }, { "ROG STRIX", "ROG STRIX" },
	{ "TUF", "TUF GAMING" }, { "PRIME", "PRIME" }, { "PRO WS", "PRO WS" }, { "AORUS", "AORUS" },
	{ "TOMAHAWK", "TOMAHAWK" }, { "EDGE", "MPG EDGE" }, { "CARBON", "MPG CARBON" }, { "GAMING M5", "GAMING" },
	{ "STEEL LEGEND", "STEEL LEGEND" }, { "RIPTIDE", "PG RIPTIDE" }, { "LIGHTNING", "LIGHTNING" }, { "MSI PRO", "PRO" },
	{ "HUANANZHI", "X99" }, { "PROART", "ProArt" }, { "TAICHI", "TAICHI" }, { "MORTAR", "MORTAR" },
	{ "GAMING PLUS", "GAMING PLUS" }, { "GAMING X", "GAMING X" }, { "PRO RS", "PRO RS" }, { "BIOSTAR", "BIOSTAR" },
}
function PCParts.boardSeries(moboPart): string
	local n = string.upper(moboPart and moboPart.name or "")
	for _, e in SERIES do
		if string.find(n, e[1], 1, true) then
			return e[2]
		end
	end
	return string.upper(moboPart and moboPart.brand or "")
end

function PCParts.mobo(cf: CFrame, moboPart): (Model, any)
	local m = newModel("Motherboard", cf)
	local L = PCParts.boardLayout(moboPart)
	local th = themeOf(moboPart)
	local pcb, sink, accent = col(th.pcb), col(th.sink), col(th.accent)
	local W, H = L.W, L.H
	local at = L.at
	local price = moboPart and moboPart.price or 100
	local tier = if price >= 250 then 3 elseif price >= 110 then 2 else 1
	local series = PCParts.boardSeries(moboPart)
	local pcbPart = box(m, cf * CFrame.new(-cm(W) / 2, -0.008, cm(H) / 2), Vector3.new(cm(W), 0.016, cm(H)), pcb, M.SmoothPlastic, { Name = "PCB" })
	pcbPart:SetAttribute("Detail", "pcb")
	-- traces / silkscreen hints
	local silk = pcb:Lerp(Color3.new(1, 1, 1), 0.12)
	for k = 1, 5 do
		box(m, cf * at(W * 0.55, H * (0.15 + k * 0.14), 0.0005), Vector3.new(cm(W * 0.35), 0.001, 0.006), silk)
	end
	-- mounting holes (silver rings)
	for _, h in { { 0.8, 0.8 }, { W - 0.8, 0.8 }, { 0.8, H - 0.8 }, { W - 0.8, H - 0.8 }, { W * 0.5, 0.8 }, { W * 0.5, H - 0.8 } } do
		cyl(m, cf * at(h[1], h[2], 0.002), "Y", 0.004, cm(0.9), STEEL, M.Metal)
	end
	-- rear I/O shroud
	local ioH = math.min(15, H - 2)
	local io = box(m, cf * at(1.6, 0.6 + ioH / 2, cm(1.8)), Vector3.new(cm(3.2), cm(3.6), cm(ioH)), sink, M.Metal, { Name = "IOShroud" })
	io:SetAttribute("Detail", "io")
	local ioAccent = box(m, cf * at(1.6, 0.6 + ioH / 2, cm(3.62)), Vector3.new(cm(2.6), 0.004, cm(ioH - 1)), accent, if moboPart and (moboPart.theme == "rog" or moboPart.theme == "aorus") then M.Neon else M.Metal, { Name = "IOAccent" })
	if ioAccent.Material == M.Neon then
		ioAccent:SetAttribute("RGB", true)
	end
	-- the name along the cover (rotated: it runs along the board's edge)
	flatText(m, cf * at(1.6, 0.6 + ioH * 0.62, cm(3.63)) * CFrame.Angles(0, math.pi / 2, 0), cm(ioH * 0.5), cm(1.6), series, if ioAccent.Material == M.Neon then Color3.fromRGB(20, 20, 22) else Color3.fromRGB(235, 235, 238), 380, B.Fonts.Heavy)
	-- the rear panel: USB, LAN, audio, BIOS flashback, Wi-Fi antennas
	do
		local ports = {
			{ 1.6, Color3.fromRGB(30, 30, 34), 1.4, 1.5 }, -- PS/2 / video
			{ 3.6, Color3.fromRGB(40, 90, 200), 1.4, 1.4 }, -- USB 3
			{ 5.4, Color3.fromRGB(200, 40, 40), 1.4, 1.4 }, -- USB 3.2 Gen 2
			{ 7.3, Color3.fromRGB(30, 30, 34), 1.6, 1.4 }, -- LAN
			{ 9.2, Color3.fromRGB(40, 90, 200), 1.4, 1.4 },
			{ 11.0, Color3.fromRGB(20, 20, 22), 1.0, 0.8 }, -- USB-C
		}
		for _, pt in ports do
			box(m, cf * at(-0.02, pt[1], cm(0.4 + pt[4] / 2)), Vector3.new(cm(0.3), cm(pt[4]), cm(pt[3])), pt[2], M.SmoothPlastic, { Name = "RearPort" })
		end
		local jack = { Color3.fromRGB(120, 200, 80), Color3.fromRGB(240, 120, 160), Color3.fromRGB(80, 160, 230) }
		for k, c in jack do
			cyl(m, cf * at(-0.02, 12.6 + (k - 1) * 0.9, cm(1.0)), "X", cm(0.3), cm(0.75), c, M.SmoothPlastic)
		end
		if moboPart and moboPart.wifi then
			for k = 0, 1 do
				cyl(m, cf * at(-0.05, 2 + k * 1.2, cm(3.2)), "X", cm(0.6), cm(0.6), GOLD, M.Metal)
			end
		end
	end
	-- VRM: the chokes and power stages round the socket, under heatsinks on all but the cheapest
	-- boards (finned on mid-range boards, sculpted with the series name and a heat pipe on the top
	-- ones)
	local su = if L.form == "ITX" then 8 else 10
	local dark = sink:Lerp(Color3.new(0, 0, 0), 0.35)
	local choke = Color3.fromRGB(70, 72, 76)
	for k = 0, 7 do
		box(m, cf * at(su - 3.5 + k * 1.05, 4.4, cm(0.35)), Vector3.new(cm(0.8), cm(0.7), cm(0.8)), choke, M.Metal)
	end
	for k = 0, 5 do
		box(m, cf * at(6.3, 4.6 + k * 1.1, cm(0.35)), Vector3.new(cm(0.8), cm(0.7), cm(0.8)), choke, M.Metal)
	end
	if tier == 1 then
		-- bare power stages next to the chokes, a small passive sink over half of them
		for k = 0, 7 do
			box(m, cf * at(su - 3.5 + k * 1.05, 2.9, cm(0.08)), Vector3.new(cm(0.6), cm(0.16), cm(0.5)), Color3.fromRGB(20, 20, 22))
		end
		box(m, cf * at(4.7, 8, cm(0.9)), Vector3.new(cm(1.6), cm(1.8), cm(6)), sink, M.Metal, { Name = "VRMRear" })
	else
		local topW = if L.form == "ITX" then 7.6 else 10
		local top = box(m, cf * at(su + 1, 2.6, cm(1.6)), Vector3.new(cm(topW), cm(3.2), cm(2.4)), sink, M.Metal, { Name = "VRMTop" })
		local rear = box(m, cf * at(4.7, 8, cm(1.6)), Vector3.new(cm(2.2), cm(3.2), cm(8.5)), sink, M.Metal, { Name = "VRMRear" })
		if tier == 2 then
			-- milled fins across the top
			for k = -3, 3 do
				box(m, cf * at(su + 1 + k * topW / 8, 2.6, cm(3.21)), Vector3.new(cm(0.35), 0.003, cm(2.3)), dark, M.Metal)
			end
			for k = -3, 3 do
				box(m, cf * at(4.7, 8 + k * 1.15, cm(3.21)), Vector3.new(cm(2.1), 0.003, cm(0.35)), dark, M.Metal)
			end
		else
			-- sculpted covers with a chamfer, an accent line and the heat pipe between them
			B.wedge(m, cf * at(su + 1, 4.05, cm(2.6)) * CFrame.Angles(0, math.pi, 0), Vector3.new(cm(topW), cm(1.2), cm(0.5)), sink, M.Metal, { CanCollide = false, CanTouch = false })
			box(m, cf * at(su + 1, 1.55, cm(3.22)), Vector3.new(cm(topW - 0.4), 0.004, cm(0.3)), accent, M.Metal)
			box(m, cf * at(3.65, 8, cm(3.22)), Vector3.new(cm(0.3), 0.004, cm(8.2)), accent, M.Metal)
			cyl(m, cf * at(5.2, 3.1, cm(2.5)), "Y", cm(0.6), cm(1.4), Color3.fromRGB(196, 198, 202), M.Metal)
		end
		flatText(m, top.CFrame * CFrame.new(0, top.Size.Y / 2 + 0.0012, 0), cm(topW - 1.4), cm(1.3), series, th.accent, 400, B.Fonts.Heavy)
		_ = rear
	end
	-- socket frame (the pins and the arm are their own nodes)
	local sw, sh = L.socketSize[1], L.socketSize[2]
	local socketCf = cf * L.socket
	box(m, socketCf * CFrame.new(0, cm(0.25), 0), Vector3.new(cm(sh + 1.4), cm(0.5), cm(sw + 1.4)), Color3.fromRGB(60, 60, 64), M.Metal, { Name = "SocketFrame" })
	box(m, socketCf * CFrame.new(0, cm(0.52), 0), Vector3.new(cm(sh + 0.2), 0.004, cm(sw + 0.2)), Color3.fromRGB(28, 28, 30), M.SmoothPlastic, { Name = "SocketBed" })
	-- cooler backplate standoffs
	for _, o in { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } } do
		cyl(m, socketCf * CFrame.new(o[1] * cm(3.7), cm(0.3), o[2] * cm(3.7)), "Y", cm(0.6), cm(0.7), STEEL, M.Metal)
	end
	-- memory slots
	for i, slotCf in L.ram do
		local s = cf * slotCf
		local slotCol = if i % 2 == 1 then SLOT else Color3.fromRGB(80, 82, 88)
		box(m, s * CFrame.new(0, cm(0.35), 0), Vector3.new(cm(0.75), cm(0.7), cm(L.ramLen + 1.6)), slotCol, M.SmoothPlastic, { Name = "RamSlot" .. i })
		box(m, s * CFrame.new(0, cm(0.71), 0), Vector3.new(cm(0.25), 0.003, cm(L.ramLen)), Color3.fromRGB(10, 10, 12))
	end
	-- PCIe slots (x16 with steel armour, plus extra slots on bigger boards)
	local pcieCf = cf * L.pcie
	box(m, pcieCf * CFrame.new(0, cm(0.4), 0), Vector3.new(cm(8.9), cm(0.8), cm(0.85)), STEEL, M.Metal, { Name = "PCIeSlot" })
	box(m, pcieCf * CFrame.new(0, cm(0.81), 0), Vector3.new(cm(8.6), 0.003, cm(0.25)), Color3.fromRGB(10, 10, 12))
	local extra = if L.form == "ATX" or L.form == "EATX" then { 18, 23.5, 27 } elseif L.form == "mATX" then { 18, 21.5 } else {}
	for _, w in extra do
		local long = w == 23.5
		box(m, cf * at(if long then 7.95 else 5, w, cm(0.35)), Vector3.new(cm(if long then 8.9 else 2.5), cm(0.7), cm(0.8)), SLOT)
	end
	-- M.2 slots: connector + standoff, optional heatsink cover is part of the drive
	for i, nv in L.nvme do
		if i <= (moboPart and moboPart.m2 or 1) then
			local c = cf * nv
			box(m, c * CFrame.new(cm(3.8), cm(0.25), 0), Vector3.new(cm(0.6), cm(0.5), cm(2.4)), SLOT, M.SmoothPlastic, { Name = "M2Slot" .. i })
			cyl(m, c * CFrame.new(-cm(4.1), cm(0.15), 0), "Y", cm(0.3), cm(0.5), GOLD, M.Metal)
		end
	end
	-- chipset heatsink with the brand
	local cw, cd = L.chipsetSize[1], L.chipsetSize[2]
	local chip = box(m, cf * L.chipset * CFrame.new(0, cm(0.6), 0), Vector3.new(cm(cw), cm(1.2), cm(cd)), sink, M.Metal, { Name = "Chipset" })
	label(chip, Enum.NormalId.Top, string.upper(moboPart and moboPart.brand or "ASUS") .. "\n" .. (moboPart and moboPart.chipset or ""), th.accent, 260)
	if L.form ~= "ITX" then
		B.wedge(m, cf * L.chipset * CFrame.new(cm(cw / 2 + 0.35), cm(0.6), 0) * CFrame.Angles(0, -math.pi / 2, 0), Vector3.new(cm(cd), cm(1.2), cm(0.7)), accent, M.Metal, { CanCollide = false, CanTouch = false })
	end
	if tier == 3 and L.form ~= "ITX" then
		local glow = box(m, cf * L.chipset * CFrame.new(0, cm(0.15), cm(cd / 2 + 0.15)), Vector3.new(cm(cw - 0.1), cm(0.25), cm(0.2)), accent, M.Neon, { Name = "BoardRGB", CastShadow = false })
		glow:SetAttribute("RGB", true)
	end
	-- audio corner: the codec under its shield, gold-topped audio capacitors, the isolation line
	if L.form ~= "ITX" then
		local codec = box(m, cf * at(1.9, H - 4.2, cm(0.15)), Vector3.new(cm(1.6), cm(0.3), cm(1.6)), Color3.fromRGB(38, 38, 42), M.Metal)
		label(codec, Enum.NormalId.Top, "AUDIO", Color3.fromRGB(200, 200, 204), 600, B.Fonts.Bold)
		for k = 0, 5 do
			cyl(m, cf * at(1.0 + (k % 3) * 0.9, H - 7.4 + math.floor(k / 3) * 1.1, cm(0.45)), "Y", cm(0.9), cm(0.65), if tier == 3 then GOLD else Color3.fromRGB(150, 30, 40), M.Metal)
		end
		box(m, cf * at(3.55, H - 4.6, 0.0006), Vector3.new(cm(0.06), 0.0012, cm(9)), pcb:Lerp(Color3.new(1, 1, 1), 0.35))
		box(m, cf * at(1.75, H - 9.1, 0.0006), Vector3.new(cm(3.6), 0.0012, cm(0.06)), pcb:Lerp(Color3.new(1, 1, 1), 0.35))
	end
	-- headers along the bottom edge and the right edge
	local pinBlock = Color3.fromRGB(26, 26, 28)
	if L.form ~= "ITX" then
		box(m, cf * at(W - 3, H - 1, cm(0.3)), Vector3.new(cm(1.4), cm(0.6), cm(0.55)), pinBlock, M.SmoothPlastic, { Name = "FPanel" })
		for _, u in { W - 15, W - 17.4 } do
			box(m, cf * at(u, H - 1, cm(0.3)), Vector3.new(cm(1.3), cm(0.6), cm(0.5)), pinBlock)
		end
		box(m, cf * at(5.1, H - 1, cm(0.3)), Vector3.new(cm(0.9), cm(0.6), cm(0.4)), Color3.fromRGB(236, 236, 230))
		box(m, cf * at(W - 1.2, 13.2, cm(0.5)), Vector3.new(cm(1.0), cm(1.0), cm(1.8)), if tier >= 2 then pinBlock else Color3.fromRGB(40, 90, 200), M.SmoothPlastic, { Name = "USB3Header" })
	end
	-- debug LEDs (CPU, DRAM, VGA, BOOT) beside the 24-pin on the better boards
	if tier >= 2 then
		for k, c in { Color3.fromRGB(255, 60, 50), Color3.fromRGB(255, 200, 40), Color3.fromRGB(240, 240, 240), Color3.fromRGB(60, 220, 90) } do
			box(m, cf * at(W - 3.0, 6.0 + k * 0.6, cm(0.06)), Vector3.new(cm(0.3), cm(0.12), cm(0.2)), c, M.SmoothPlastic, { Name = "DebugLed" })
		end
	end
	-- silkscreen
	local silkText = Color3.fromRGB(225, 225, 228)
	if th.pcb[1] > 180 then
		silkText = Color3.fromRGB(60, 60, 64)
	end
	flatText(m, cf * at(4.6, 16.4, 0.0012), cm(3), cm(0.6), "PCI_E1", silkText, 500, B.Fonts.Medium)
	flatText(m, cf * at(16.4 + ((moboPart and moboPart.memSlots or 4) - 1) * 0.425, 16.2, 0.0012), cm(4), cm(0.6), "DIMM", silkText, 500, B.Fonts.Medium)
	flatText(m, cf * at(14.6, 1.9, 0.0012), cm(2.4), cm(0.5), "CPU_FAN", silkText, 500, B.Fonts.Medium)
	-- power connectors
	box(m, cf * L.atx24 * CFrame.new(0, cm(0.55), 0), Vector3.new(cm(1.25), cm(1.1), cm(5.3)), Color3.fromRGB(236, 236, 230), M.SmoothPlastic, { Name = "ATX24" })
	box(m, cf * L.eps * CFrame.new(0, cm(0.5), 0), Vector3.new(cm(2.2), cm(1), cm(1.1)), Color3.fromRGB(236, 236, 230), M.SmoothPlastic, { Name = "EPS" })
	-- headers
	for _, hcf in { L.cpuFan, table.unpack(L.sysFan) } do
		box(m, cf * hcf * CFrame.new(0, cm(0.3), 0), Vector3.new(cm(1), cm(0.6), cm(0.4)), Color3.fromRGB(236, 236, 230))
	end
	for _, s in L.sata do
		box(m, cf * s * CFrame.new(0, cm(0.5), 0), Vector3.new(cm(0.9), cm(1), cm(1.6)), Color3.fromRGB(40, 40, 44))
	end
	-- CMOS battery holder
	cyl(m, cf * L.cmos * CFrame.new(0, cm(0.15), 0), "Y", cm(0.3), cm(L.cmosSize), Color3.fromRGB(40, 40, 44), M.SmoothPlastic)
	-- a row of solid caps around the socket area (decoration; the six service caps are nodes)
	for k = 0, 4 do
		cyl(m, cf * at(4.2 + k * 0.9, 13.2, cm(0.55)), "Y", cm(1.1), cm(0.75), Color3.fromRGB(40, 40, 44), M.Metal)
	end
	-- board name silkscreen
	local nameplate = box(m, cf * at(W * 0.6, H - 2.4, 0.001), Vector3.new(cm(8), 0.002, cm(1.4)), pcb)
	label(nameplate, Enum.NormalId.Top, moboPart and moboPart.name or "", Color3.fromRGB(220, 220, 220), 220, B.Fonts.Medium)
	return m, L
end

-- Socket pin field; bent pins show as dark specks.
function PCParts.pins(cf: CFrame, socket: string, bent: boolean): Model
	local m = newModel("Pins", cf)
	local sw, sh = socketSize(socket)
	box(m, cf * CFrame.new(0, cm(0.55), 0), Vector3.new(cm(sh - 0.2), 0.004, cm(sw - 0.2)), Color3.fromRGB(178, 150, 82), M.Metal, { Name = "PinField" })
	if bent then
		for k = 0, 3 do
			box(m, cf * CFrame.new(cm(-0.8 + k * 0.45), cm(0.57), cm(0.3 - k * 0.2)), Vector3.new(0.025, 0.005, 0.025), Color3.fromRGB(40, 30, 20), M.SmoothPlastic, { Name = "BentPin" })
		end
	end
	box(m, cf * CFrame.new(0, cm(0.55), 0), Vector3.new(cm(sh), 0.03, cm(sw)), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m
end

-- Latches: "ram" (DIMM clip at a slot end), "pcie" (x16 latch), "arm" (CPU retention lever).
-- Origin at the hinge; PCModel rotates them open around local X (ram/pcie) or Z (arm).
function PCParts.latch(cf: CFrame, kind: string): Model
	local m = newModel("Latch", cf)
	if kind == "arm" then
		box(m, cf * CFrame.new(0, cm(0.3), -cm(2.6)), Vector3.new(cm(0.35), cm(0.35), cm(5.2)), STEEL, M.Metal, { Name = "Lever" })
		box(m, cf * CFrame.new(cm(0.5), cm(0.3), -cm(5.1)), Vector3.new(cm(1.2), cm(0.35), cm(0.35)), STEEL, M.Metal)
		box(m, cf * CFrame.new(0, cm(0.3), -cm(2.6)), Vector3.new(0.12, 0.1, cm(5.2)), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	elseif kind == "pcie" then
		box(m, cf * CFrame.new(0, cm(0.9), 0), Vector3.new(cm(1.3), cm(1.8), cm(1.0)), Color3.fromRGB(224, 226, 230), M.SmoothPlastic, { Name = "Clip" })
		box(m, cf * CFrame.new(0, cm(1.9), 0), Vector3.new(cm(1.5), cm(0.4), cm(1.2)), Color3.fromRGB(230, 60, 50), M.SmoothPlastic, { Name = "Tab" })
		box(m, cf * CFrame.new(0, cm(1), 0), Vector3.new(0.16, 0.2, 0.16), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	else
		-- the memory clip: as tall as the module so it still shows behind its end, light with a blue
		-- push tab on top, standing out against the dark board
		box(m, cf * CFrame.new(0, cm(1.8), 0), Vector3.new(cm(0.9), cm(3.6), cm(1.1)), Color3.fromRGB(232, 234, 238), M.SmoothPlastic, { Name = "Clip" })
		box(m, cf * CFrame.new(0, cm(3.7), cm(0.2)), Vector3.new(cm(1.1), cm(0.6), cm(1.6)), Color3.fromRGB(40, 130, 240), M.SmoothPlastic, { Name = "Tab" })
		box(m, cf * CFrame.new(0, cm(1.9), 0), Vector3.new(0.18, 0.4, 0.18), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- CPU (origin: bottom centre, lying flat, pins/pads down)
----------------------------------------------------------------------------------------------------
function PCParts.cpu(cf: CFrame, cpuPart): Model
	local m = newModel("CPU", cf)
	local socket = cpuPart and cpuPart.socket or "AM4"
	local sw, sh = socketSize(socket)
	local amd = cpuPart and cpuPart.brand == "amd"
	local substrate = if amd then Color3.fromRGB(32, 110, 60) else Color3.fromRGB(28, 96, 58)
	box(m, cf * CFrame.new(0, cm(0.06), 0), Vector3.new(cm(sh), cm(0.12), cm(sw)), substrate, M.SmoothPlastic, { Name = "Substrate" })
	if string.sub(socket, 1, 3) == "AM3" or socket == "AM4" then
		-- PGA: golden pin field underneath
		box(m, cf * CFrame.new(0, -0.004, 0), Vector3.new(cm(sh - 0.4), 0.008, cm(sw - 0.4)), GOLD, M.Metal)
	end
	-- heat spreader with the laser-etched name
	local ihsW, ihsH = sh * 0.78, sw * 0.78
	local ihs = box(m, cf * CFrame.new(0, cm(0.12) + cm(0.15), 0), Vector3.new(cm(ihsW), cm(0.3), cm(ihsH)), Color3.fromRGB(190, 192, 198), M.Metal, { Name = "IHS" })
	local brand = if amd then "AMD RYZEN" else "INTEL® CORE™"
	if cpuPart and string.find(cpuPart.name or "", "Core 2") then
		brand = "INTEL® CORE™2"
	elseif cpuPart and string.find(cpuPart.name or "", "Xeon") then
		brand = "INTEL® XEON®"
	elseif cpuPart and string.find(cpuPart.name or "", "Threadripper") then
		brand = "AMD THREADRIPPER"
	end
	local model = cpuPart and string.gsub(cpuPart.name or "", "^%S+%s+", "") or ""
	label(ihs, Enum.NormalId.Top, brand .. "\n" .. model, Color3.fromRGB(70, 70, 76), 900, B.Fonts.Medium)
	-- orientation triangle
	box(m, cf * CFrame.new(-cm(sh / 2 - 0.3), cm(0.125), cm(sw / 2 - 0.3)), Vector3.new(0.02, 0.003, 0.02), GOLD, M.Metal)
	return m
end

-- Thermal paste blob on top of the IHS; PCModel tunes its look from paste.st/q.
function PCParts.paste(cf: CFrame): Model
	local m = newModel("Paste", cf)
	cyl(m, cf * CFrame.new(0, 0.004, 0), "Y", 0.008, cm(2.6), Color3.fromRGB(160, 162, 168), M.SmoothPlastic, { Name = "Blob", CastShadow = false })
	return m
end

----------------------------------------------------------------------------------------------------
-- Coolers (origin: centre of the CPU contact plate, standing up +Y). ctx = { topZ = distance in
-- studs from the CPU to the case's top panel (for AIO radiators), up = case inner height }
----------------------------------------------------------------------------------------------------
local function fanFrame(m: Instance, cf: CFrame, size: number, frameCol: Color3, bladeCol: Color3, rgb: boolean?)
	-- square frame around a circular opening, axis along local Y
	local t = cm(2.5)
	local s = size
	local bar = s * 0.09
	for _, o in { { 0, -1 }, { 0, 1 } } do
		box(m, cf * CFrame.new(0, 0, o[2] * (s / 2 - bar / 2)), Vector3.new(s, t, bar), frameCol, M.SmoothPlastic)
	end
	for _, o in { -1, 1 } do
		box(m, cf * CFrame.new(o * (s / 2 - bar / 2), 0, 0), Vector3.new(bar, t, s - bar * 2), frameCol, M.SmoothPlastic)
	end
	-- corner fillers make the opening read as round
	for _, o in { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } } do
		box(m, cf * CFrame.new(o[1] * s * 0.36, 0, o[2] * s * 0.36) * CFrame.Angles(0, math.rad(45), 0), Vector3.new(s * 0.22, t * 0.96, s * 0.12), frameCol, M.SmoothPlastic)
	end
	-- motor struts on the back side
	for k = 0, 3 do
		box(m, cf * CFrame.new(0, -t * 0.4, 0) * CFrame.Angles(0, k * math.pi / 2 + math.rad(20), 0) * CFrame.new(s * 0.25, 0, 0), Vector3.new(s * 0.5, t * 0.12, s * 0.03), frameCol, M.SmoothPlastic)
	end
	-- ARGB fans light their blades from the hub
	rotor(m, cf * CFrame.new(0, t * 0.05, 0), s * 0.92, bladeCol, frameCol, nil, rgb)
	box(m, cf, Vector3.new(s, t, s), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
end
PCParts.fanFrame = fanFrame

-- Tower coolers by maker: fin and cap colours, the logo on top, whether the heat-pipe tips show,
-- the fans' frame and blade colours and the heat-pipe count per tower.
local NICKEL = Color3.fromRGB(198, 200, 204)
local COPPER = Color3.fromRGB(196, 116, 70)
local TOWERS = {
	cm = { fin = Color3.fromRGB(196, 198, 204), cap = Color3.fromRGB(24, 24, 26), logo = "COOLER MASTER", pipe = COPPER, pipes = 4 },
	deepcool = { fin = Color3.fromRGB(196, 198, 204), cap = Color3.fromRGB(22, 22, 24), logo = "DEEPCOOL", pipe = NICKEL, pipes = 4 },
	thermalright = { fin = Color3.fromRGB(196, 198, 204), logo = "Thermalright", tips = true, pipe = NICKEL, pipes = 3 },
	noctua = { fin = Color3.fromRGB(200, 202, 206), logo = "noctua", tips = true, pipe = NICKEL, pipes = 6, frame = Color3.fromRGB(110, 76, 50), blade = Color3.fromRGB(210, 190, 160) },
	noctuablack = { fin = Color3.fromRGB(30, 30, 32), logo = "noctua", tips = true, pipe = Color3.fromRGB(34, 34, 36), pipes = 6 },
	bequiet = { fin = Color3.fromRGB(28, 28, 30), cap = Color3.fromRGB(44, 44, 48), logo = "be quiet!", pipe = Color3.fromRGB(40, 40, 44), pipes = 7 },
	arctic = { fin = Color3.fromRGB(196, 198, 204), cap = Color3.fromRGB(22, 22, 24), logo = "ARCTIC", pipe = NICKEL, pipes = 4 },
	scythe = { fin = Color3.fromRGB(196, 198, 204), logo = "SCYTHE", tips = true, pipe = NICKEL, pipes = 3, frame = Color3.fromRGB(60, 60, 64), blade = Color3.fromRGB(48, 48, 52) },
	idcool = { fin = Color3.fromRGB(196, 198, 204), cap = Color3.fromRGB(22, 22, 24), logo = "ID-COOLING", pipe = COPPER, pipes = 4 },
}
-- AIO pumps: the cap and its light, the logo
local PUMPS = {
	nzxt = { round = true, logo = "NZXT", ring = true },
	corsair = { round = false, logo = "CORSAIR", ring = true },
	arctic = { round = false, logo = "ARCTIC", vrmFan = true },
	lianli = { round = false, logo = "LIAN LI", mirror = true },
	deepcool = { round = false, logo = "DEEPCOOL", mirror = true },
	msi = { round = true, logo = "msi", ring = true },
	rog = { round = false, logo = "ROG", ring = false },
}

function PCParts.cooler(cf: CFrame, coolerPart, ctx): Model
	local m = newModel("Cooler", cf)
	local p = coolerPart or {}
	local kind = p.kind or "stock"
	local alu = Color3.fromRGB(196, 198, 204)
	local copper = COPPER
	local black = Color3.fromRGB(28, 28, 32)
	local rgb = p.rgb
	local style = p.style or (if kind == "stock" then (if p.sockets == "amd" then "amd" else "intel") elseif kind == "air" then "cm" else "arctic")
	if kind == "stock" then
		if style == "amd" then
			-- AMD Wraith: square black shroud with a round fan; the Spire and Prism stand taller and
			-- carry a ring round the fan (lit on the Prism), the AMD logo on the hub
			local tall = p.id ~= "cool_amd_stealth"
			local hgt = if tall then cm(5.6) else cm(4.4)
			box(m, cf * CFrame.new(0, hgt / 2, 0), Vector3.new(cm(9.5), hgt, cm(9.5)), black, M.SmoothPlastic, { Name = "Shroud" })
			if p.id == "cool_amd_prism" then
				for k = -1, 1, 2 do
					cyl(m, cf * CFrame.new(k * cm(4.9), hgt * 0.4, 0), "Z", cm(8), cm(0.7), copper, M.Metal)
				end
			end
			if tall then
				local ring = cyl(m, cf * CFrame.new(0, hgt + 0.003, 0), "Y", 0.006, cm(9.3), if rgb then Color3.fromRGB(255, 60, 160) else Color3.fromRGB(150, 152, 158), if rgb then M.Neon else M.Metal, { Name = "CoolerRGB" })
				ring:SetAttribute("RGB", rgb == true)
				cyl(m, cf * CFrame.new(0, hgt + 0.0035, 0), "Y", 0.006, cm(8.9), Color3.fromRGB(12, 12, 14), M.SmoothPlastic)
			end
			rotor(m, cf * CFrame.new(0, hgt + (if tall then 0.005 else 0.002), 0), cm(8.6), black:Lerp(Color3.new(1, 1, 1), 0.1), black)
			flatText(m, cf * CFrame.new(0, hgt + cm(0.6), 0), cm(2.2), cm(0.9), "AMD", Color3.fromRGB(235, 235, 238), 400, B.Fonts.Heavy)
			dustLayer(m, cf * CFrame.new(0, hgt + cm(0.2), 0), Vector3.new(cm(9.6), 0.01, cm(9.6)))
		else
			-- Intel: round aluminium sink with radial fins and a copper core under the fan (the
			-- Laminar is black with a blue ring)
			local laminar = style == "laminar"
			local sinkCol = if laminar then Color3.fromRGB(30, 30, 34) else alu
			cyl(m, cf * CFrame.new(0, cm(1.4), 0), "Y", cm(2.8), cm(9.4), sinkCol, M.Metal, { Name = "Sink" })
			cyl(m, cf * CFrame.new(0, cm(1.4), 0), "Y", cm(2.82), cm(3), copper, M.Metal)
			for k = 0, 11 do
				box(m, cf * CFrame.Angles(0, k * math.pi / 6, 0) * CFrame.new(cm(4.72), cm(1.4), 0), Vector3.new(cm(0.06), cm(2.7), cm(0.5)), sinkCol:Lerp(Color3.new(0, 0, 0), 0.4), M.Metal)
			end
			cyl(m, cf * CFrame.new(0, cm(3.4), 0), "Y", cm(1.2), cm(9), black, M.SmoothPlastic)
			if laminar then
				cyl(m, cf * CFrame.new(0, cm(4.0), 0), "Y", 0.004, cm(9.1), Color3.fromRGB(60, 140, 230), M.Neon, { Name = "CoolerRGB", Transparency = 0.3 })
				cyl(m, cf * CFrame.new(0, cm(4.0) + 0.001, 0), "Y", 0.004, cm(8.6), Color3.fromRGB(12, 12, 14))
			end
			rotor(m, cf * CFrame.new(0, cm(4.05), 0), cm(8), black:Lerp(Color3.new(1, 1, 1), 0.12), black)
			flatText(m, cf * CFrame.new(0, cm(4.6), 0), cm(2.0), cm(0.8), "intel", Color3.fromRGB(70, 150, 230), 400, B.Fonts.Heavy)
			dustLayer(m, cf * CFrame.new(0, cm(4.2), 0), Vector3.new(cm(9.2), 0.01, cm(9.2)))
		end
	elseif kind == "air" then
		local T = TOWERS[style] or TOWERS.cm
		local towers = p.towers or 1
		local h = cm(15.6)
		box(m, cf * CFrame.new(0, cm(0.6), 0), Vector3.new(cm(4), cm(1.2), cm(4)), copper, M.Metal, { Name = "Base" })
		box(m, cf * CFrame.new(0, cm(1.35), 0), Vector3.new(cm(5.6), cm(0.3), cm(3.2)), Color3.fromRGB(40, 40, 44), M.Metal)
		local finCol = T.fin
		local tw = cm(5)
		local xs = if towers == 2 then { -cm(4.6), cm(4.6) } else { 0 }
		local gap = finCol:Lerp(Color3.new(0, 0, 0), if (finCol.R + finCol.G + finCol.B) > 1.5 then 0.4 else 0.6)
		for _, x in xs do
			-- heat pipes up from the base
			for k = -1, 1 do
				cyl(m, cf * CFrame.new(x * 0.5 + k * cm(0.9), h * 0.45, 0), "Y", h * 0.9, cm(0.6), T.pipe, M.Metal)
			end
			local stack = box(m, cf * CFrame.new(x, h * 0.62, 0), Vector3.new(tw, h * 0.72, cm(12.4)), finCol, M.Metal, { Name = "FinStack" })
			stack:SetAttribute("Detail", "fins")
			-- the fin edges on the sides
			for k = 0, 13 do
				local y = h * 0.27 + (k + 0.5) * h * 0.7 / 14
				for side = -1, 1, 2 do
					box(m, cf * CFrame.new(x, y, side * cm(6.21)), Vector3.new(tw * 0.98, cm(0.07), 0.003), gap, M.Metal)
				end
			end
			if T.cap then
				-- a cover on top (brushed on the be quiet!)
				box(m, cf * CFrame.new(x, h * 0.99, 0), Vector3.new(tw * 1.04, cm(0.6), cm(12.7)), T.cap, M.Metal, { Name = "TopCover" })
			else
				-- bare top fin with the heat pipe tips poking through
				for k = 1, T.pipes do
					local z = -cm(4.5) + (k - 1) * cm(9) / math.max(1, T.pipes - 1)
					for side = -1, 1, 2 do
						cyl(m, cf * CFrame.new(x + side * tw * 0.22, h * 0.98 + cm(0.25), z), "Y", cm(0.5), cm(0.62), T.pipe, M.Metal)
					end
				end
				for k = -5, 5 do
					box(m, cf * CFrame.new(x, h * 0.98 + 0.002, k * cm(1.1)), Vector3.new(tw, 0.004, 0.006), gap, M.Metal)
				end
			end
			dustLayer(m, cf * CFrame.new(x, h * 0.62, 0), Vector3.new(tw * 1.04, h * 0.74, cm(12.6)))
		end
		-- the maker's logo on top (on the cover, or on a plate over the last fin)
		local logoX = xs[#xs]
		if not T.cap then
			box(m, cf * CFrame.new(logoX, h * 0.98 + cm(0.12), 0), Vector3.new(tw * 0.5, cm(0.1), cm(4)), if style == "noctua" then Color3.fromRGB(200, 202, 206) else Color3.fromRGB(24, 24, 26), M.Metal)
		end
		flatText(m, cf * CFrame.new(logoX, h * 0.99 + cm(0.31), 0) * CFrame.Angles(0, math.pi / 2, 0), cm(9), tw * 0.42, T.logo, if style == "noctua" then Color3.fromRGB(110, 76, 50) else Color3.fromRGB(230, 230, 234), 400, B.Fonts.Heavy)
		-- fan(s): on the intake (front, -X) side, or between the towers
		local fanCol = T.frame or black
		local bladeCol = T.blade or black:Lerp(Color3.new(1, 1, 1), 0.08)
		local fx = if towers == 2 then 0 else -tw / 2 - cm(1.4)
		local fanSize = if towers == 2 then cm(14) else cm(12)
		local fanModel = newModel("CoolerFan", cf * CFrame.new(fx, h * 0.6, 0) * CFrame.Angles(0, 0, math.pi / 2))
		fanFrame(fanModel, cf * CFrame.new(fx, h * 0.6, 0) * CFrame.Angles(0, 0, math.pi / 2), fanSize, fanCol, bladeCol, rgb)
		fanModel.Parent = m
		if p.display then
			local disp = box(m, cf * CFrame.new(0, h * 1.01, cm(4.2)), Vector3.new(cm(8), 0.006, cm(3)), Color3.fromRGB(10, 10, 12), M.SmoothPlastic, { Name = "TempDisplay" })
			flatText(m, disp.CFrame * CFrame.new(0, 0.0042, 0), cm(7), cm(2.6), "45°C  12%", Color3.fromRGB(80, 200, 255), 300, B.Fonts.Mono, true)
		end
	else
		-- AIO: pump block on the CPU, tubes up to the radiator on the top panel
		local P = PUMPS[style] or PUMPS.arctic
		local block
		if P.round then
			block = cyl(m, cf * CFrame.new(0, cm(1.9), 0), "Y", cm(3.8), cm(6.6), black, M.SmoothPlastic, { Name = "Pump" })
		else
			block = box(m, cf * CFrame.new(0, cm(1.9), 0), Vector3.new(cm(6.4), cm(3.8), cm(6.4)), black, M.SmoothPlastic, { Name = "Pump" })
		end
		block:SetAttribute("Detail", "pump")
		local top = cm(3.8)
		if P.vrmFan then
			-- the Liquid Freezer's little fan for the board's power stages
			local vcf = cf * CFrame.new(cm(3.3), cm(1.9), 0) * CFrame.Angles(0, 0, -math.pi / 2)
			cyl(m, vcf, "Y", cm(0.4), cm(3.4), Color3.fromRGB(20, 20, 22))
			rotor(m, vcf * CFrame.new(0, cm(0.25), 0), cm(3), Color3.fromRGB(40, 40, 44), Color3.fromRGB(20, 20, 22))
		end
		local lit = rgb and Color3.fromRGB(120, 60, 255) or Color3.fromRGB(60, 60, 66)
		if p.lcd then
			-- a round or square screen with the temperature
			local scr = if P.round then cyl(m, cf * CFrame.new(0, top + 0.003, 0), "Y", 0.006, cm(5.8), Color3.fromRGB(8, 10, 14), M.Glass, { Name = "PumpCap" }) else box(m, cf * CFrame.new(0, top + 0.003, 0), Vector3.new(cm(6), 0.006, cm(6)), Color3.fromRGB(8, 10, 14), M.Glass, { Name = "PumpCap" })
			_ = scr
			flatText(m, cf * CFrame.new(0, top + 0.0072, 0), cm(4.6), cm(2.4), if style == "rog" then "ROG\n38°C" else "38°C", Color3.fromRGB(255, 255, 255), 400, B.Fonts.Heavy, true)
		elseif P.mirror then
			-- infinity mirror: lit rings sinking into dark glass
			box(m, cf * CFrame.new(0, top + 0.003, 0), Vector3.new(cm(6), 0.006, cm(6)), Color3.fromRGB(10, 10, 14), M.Glass, { Name = "PumpCap" })
			for k = 0, 2 do
				local ring = cyl(m, cf * CFrame.new(0, top + 0.0062 + k * 0.0004, 0), "Y", 0.0006, cm(5.2 - k * 1.3), lit, M.Neon, { Name = "CoolerRGB", Transparency = 0.2 + k * 0.2 })
				ring:SetAttribute("RGB", rgb == true)
				cyl(m, cf * CFrame.new(0, top + 0.0064 + k * 0.0004, 0), "Y", 0.0006, cm(5.2 - k * 1.3 - 0.4), Color3.fromRGB(10, 10, 14), M.Glass)
			end
		else
			local cap = if P.round then cyl(m, cf * CFrame.new(0, top + 0.004, 0), "Y", 0.008, cm(5.6), Color3.fromRGB(26, 26, 30), M.SmoothPlastic, { Name = "PumpCap" }) else box(m, cf * CFrame.new(0, top + 0.004, 0), Vector3.new(cm(5.6), 0.008, cm(5.6)), Color3.fromRGB(26, 26, 30), M.SmoothPlastic, { Name = "PumpCap" })
			_ = cap
			if P.ring then
				local ring = cyl(m, cf * CFrame.new(0, top + 0.0035, 0), "Y", 0.007, cm(6.2), lit, if rgb then M.Neon else M.Metal, { Name = "CoolerRGB" })
				ring:SetAttribute("RGB", rgb == true)
			end
		end
		if not p.lcd then
			flatText(m, cf * CFrame.new(0, top + 0.0095, 0), cm(4.4), cm(1.3), P.logo, Color3.fromRGB(236, 236, 240), 400, B.Fonts.Heavy)
		end
		local rad = p.radiator or 240
		local fans = if rad >= 360 then 3 else 2
		local radLen = cm(fans * 12 + 3.6)
		-- radiator (long axis X, fans on +Z) where the layout mounts it; beside the pump otherwise
		local radCf = cf * ((ctx and ctx.radCf) or CFrame.new(-cm(14), cm(8), 0) * CFrame.Angles(0, math.pi / 2, 0))
		local radThick = if style == "arctic" then cm(3.8) else cm(2.7)
		local radBody = box(m, radCf * CFrame.new(0, 0, (cm(2.7) - radThick) / 2), Vector3.new(radLen, cm(12), radThick), black, M.Metal, { Name = "Radiator" })
		for k = -10, 10 do
			box(m, radCf * CFrame.new(k * radLen / 22, 0, cm(1.36)), Vector3.new(0.006, cm(11), 0.004), Color3.fromRGB(60, 60, 66), M.Metal)
		end
		-- the maker's sticker on the end tank
		box(m, radCf * CFrame.new(-radLen / 2 + cm(1.1), 0, cm(1.37)), Vector3.new(cm(1.6), cm(10.5), 0.004), Color3.fromRGB(20, 20, 22), M.SmoothPlastic)
		label(radBody, Enum.NormalId.Top, P.logo, Color3.fromRGB(220, 220, 224), 300, B.Fonts.Heavy)
		local fanFrameCol = if style == "lianli" then Color3.fromRGB(236, 236, 238) else black
		for i = 1, fans do
			local x = -radLen / 2 + cm(1.8) + cm(6) + (i - 1) * cm(12)
			local fcf = radCf * CFrame.new(x, 0, cm(2.7)) * CFrame.Angles(math.pi / 2, 0, 0)
			local fm = newModel("RadFan", fcf)
			fanFrame(fm, fcf, cm(12), fanFrameCol, fanFrameCol:Lerp(Color3.new(0.5, 0.5, 0.5), 0.15), rgb)
			fm.Parent = m
		end
		dustLayer(m, radCf * CFrame.new(0, 0, cm(1.5)), Vector3.new(radLen, cm(12), 0.01))
		-- two sleeved tubes from the pump to the radiator end, with their fittings. With a lane (the gap
		-- between the board and the top of the case) they go up out of the pump, along the gap -- clear
		-- of the memory clips -- and down to the radiator; stacked, not side by side.
		local laneZ = ctx and ctx.laneZ
		local pEnd = radCf * CFrame.new(radLen / 2 - cm(2), cm(3), cm(1))
		local tubeCol = Color3.fromRGB(22, 22, 24)
		for k = 0, 1 do
			local a, b, via
			if laneZ then
				local x = cm(-1 + k * 1.8)
				local y = cm(3.6 + k * 1.1)
				a = (cf * CFrame.new(x, cm(2.5), -cm(2.8))).Position
				local endLocal = cf:PointToObjectSpace(pEnd.Position)
				b = (cf * CFrame.new(endLocal.X, endLocal.Y + cm(k * 1.1), endLocal.Z + cm(k * 1.4))).Position
				via = { (cf * CFrame.new(x, y, laneZ)).Position, (cf * CFrame.new(endLocal.X, y, laneZ)).Position }
			else
				local off = Vector3.new(0, 0, k * cm(1.4))
				a = (cf * CFrame.new(cm(1.2), cm(2.5), -cm(2.5))).Position + off
				b = pEnd.Position + off
				via = { (a + b) / 2 + Vector3.new(0, cm(3), 0) }
			end
			local pts = { a }
			for _, v in via do
				table.insert(pts, v)
			end
			table.insert(pts, b)
			for i = 1, #pts - 1 do
				local d = (pts[i + 1] - pts[i]).Magnitude
				if d > 1e-3 then
					local sc = CFrame.lookAt((pts[i] + pts[i + 1]) / 2, pts[i + 1]) * CFrame.Angles(0, math.pi / 2, 0)
					cyl(m, sc, "X", d, cm(1.0), tubeCol, M.Fabric, { Name = "Tube" })
				end
			end
			-- rounded elbows
			for i = 2, #pts - 1 do
				B.ball(m, CFrame.new(pts[i]), cm(1.0), tubeCol, M.Fabric, props({ Name = "Elbow" }, Vector3.new(0.1, 0.1, 0.1)))
			end
			cyl(m, CFrame.new(a), "Y", cm(1.0), cm(1.5), Color3.fromRGB(36, 36, 40), M.Metal)
		end
	end
	return m
end

----------------------------------------------------------------------------------------------------
-- Memory (origin: centre of the contact edge; length along Z, height +Y, thickness X)
----------------------------------------------------------------------------------------------------
local RAM_COLORS = {
	green = { 30, 100, 56 },
	black = { 26, 26, 30 },
	silver = { 190, 192, 198 },
	white = { 238, 238, 240 },
	blue = { 30, 70, 160 },
	red = { 170, 30, 34 },
	gold = { 204, 172, 96 },
}

-- Module height (cm from the contact edge) and the light bar on top (cm) per heat spreader.
local RAM_STYLES = {
	bare = { h = 3.1 },
	server = { h = 3.1 },
	lpx = { h = 3.4 },
	flare = { h = 3.3 },
	pro = { h = 3.5 },
	hyperx = { h = 3.3 },
	fury = { h = 3.4 },
	ballistix = { h = 3.9 },
	ripjaws = { h = 4.2 },
	viper = { h = 4.4 },
	vrgb = { h = 4.4, bar = 0.9 },
	dominator = { h = 5.5, bar = 0.7 },
	trident = { h = 4.4, bar = 0.9 },
	trident5 = { h = 4.2, bar = 0.7 },
	royal = { h = 4.4, bar = 1.0 },
	delta = { h = 4.9, bar = 0.9 },
	xpg = { h = 4.0, bar = 0.8 },
	furyrgb = { h = 4.2, bar = 0.8 },
	renegade = { h = 3.9, bar = 0.6 },
}
PCParts.RamStyles = RAM_STYLES

-- The line's name as printed on the spreader.
local function ramBadge(p): string
	local n, st = p.name or "", p.style
	if st == "lpx" then
		return if string.find(n, "LPX", 1, true) then "VENGEANCE LPX" else "VENGEANCE"
	elseif st == "vrgb" then
		return "VENGEANCE"
	elseif st == "dominator" then
		return "DOMINATOR"
	elseif st == "trident" then
		return if string.find(n, "Neo", 1, true) then "TRIDENT Z NEO" else "TRIDENT Z"
	elseif st == "trident5" then
		return "TRIDENT Z5"
	elseif st == "royal" then
		return "TRIDENT Z5 ROYAL"
	elseif st == "fury" or st == "furyrgb" then
		return "FURY"
	elseif st == "renegade" then
		return "FURY RENEGADE"
	elseif st == "delta" then
		return "T-FORCE DELTA"
	elseif st == "xpg" then
		return "XPG"
	elseif st == "ballistix" then
		return "BALLISTIX"
	elseif st == "ripjaws" then
		return "RIPJAWS"
	elseif st == "flare" then
		return if string.find(n, "Ripjaws", 1, true) then "RIPJAWS S5" else "FLARE X5"
	elseif st == "viper" then
		return "VIPER"
	elseif st == "hyperx" then
		return "HyperX"
	elseif st == "pro" then
		return "CRUCIAL PRO"
	end
	return ""
end

function PCParts.ram(cf: CFrame, ramPart): Model
	local m = newModel("RAM", cf)
	local p = ramPart or {}
	local so = p.form == "SODIMM"
	local len = if so then cm(6.95) else cm(13.3)
	local pcbH = if so then cm(3) else cm(3.1)
	local style = p.style or (if (p.color or "green") == "green" then "bare" else "lpx")
	local st = RAM_STYLES[style] or RAM_STYLES.lpx
	local h = if so then pcbH else cm(st.h)
	local pcb = Color3.fromRGB(30, 100, 56)
	box(m, cf * CFrame.new(0, pcbH / 2, 0), Vector3.new(cm(0.12), pcbH, len), pcb, M.SmoothPlastic, { Name = "PCB" })
	box(m, cf * CFrame.new(0, cm(0.25), 0), Vector3.new(cm(0.14), cm(0.5), len * 0.94), GOLD, M.Metal, { Name = "Contacts" })
	-- the key notch sits where the generation puts it (DDR5 nearly central, older ones further out)
	local notchZ = if p.mem == "DDR5" then -len * 0.02 elseif p.mem == "DDR4" then len * 0.04 elseif p.mem == "DDR3" then len * 0.12 else len * 0.15
	box(m, cf * CFrame.new(0, cm(0.2), notchZ), Vector3.new(cm(0.2), cm(0.45), cm(0.3)), Color3.fromRGB(12, 12, 14))
	local stickerX = -cm(0.08)
	if style == "bare" or style == "server" then
		-- memory chips on both sides; a DDR5 module carries its own power chip, an ECC server stick
		-- a ninth chip and the register in the middle
		local n = if so then 4 elseif style == "server" then 9 else 8
		for side = -1, 1, 2 do
			for k = 0, n - 1 do
				local z = -len / 2 + len * (k + 0.75) / (n + 0.6)
				if not (style == "server" and k == 4) then
					box(m, cf * CFrame.new(side * cm(0.12), pcbH * 0.55, z), Vector3.new(cm(0.12), cm(1.1), cm(1.0)), Color3.fromRGB(20, 20, 22))
				end
			end
		end
		if style == "server" then
			box(m, cf * CFrame.new(cm(0.12), pcbH * 0.55, 0), Vector3.new(cm(0.12), cm(0.9), cm(1.6)), Color3.fromRGB(26, 26, 30))
		end
		if p.mem == "DDR5" then
			box(m, cf * CFrame.new(cm(0.12), pcbH * 0.85, len * 0.36), Vector3.new(cm(0.1), cm(0.5), cm(0.5)), Color3.fromRGB(30, 30, 34))
		end
		stickerX = -cm(0.2)
	else
		local spread = col(RAM_COLORS[p.color or "black"] or RAM_COLORS.black)
		local light = (spread.R + spread.G + spread.B) > 1.6
		local dark = spread:Lerp(Color3.new(0, 0, 0), 0.5)
		local textCol = if light then Color3.fromRGB(30, 30, 34) else Color3.fromRGB(236, 236, 240)
		local bar = if st.bar then cm(st.bar) else 0
		local plateTop = h - bar
		local plateH = plateTop - cm(0.6)
		local plateY = (cm(0.6) + plateTop) / 2
		local plates = {}
		for side = -1, 1, 2 do
			plates[side] = box(m, cf * CFrame.new(side * cm(0.24), plateY, 0), Vector3.new(cm(0.16), plateH, len * 0.985), spread, M.Metal, { Name = "Spreader" })
		end
		-- the spreader's own shape and trim
		local function bothSides(fn)
			for side = -1, 1, 2 do
				fn(side, side * cm(0.33))
			end
		end
		if style == "lpx" then
			-- the stepped top edge of the Vengeance LPX
			box(m, cf * CFrame.new(0, plateTop - cm(0.05), 0), Vector3.new(cm(0.64), cm(0.1), len * 0.985), spread, M.Metal)
			for k = 0, 4 do
				box(m, cf * CFrame.new(0, plateTop + cm(0.15), -len * 0.4 + k * len * 0.2), Vector3.new(cm(0.64), cm(0.3), len * 0.1), spread, M.Metal)
			end
		elseif style == "fury" or style == "renegade" then
			bothSides(function(_, x)
				if style == "fury" then
					for k = 0, 1 do
						box(m, cf * CFrame.new(x, plateY, len * 0.33 + k * len * 0.08) * CFrame.Angles(math.rad(-35), 0, 0), Vector3.new(0.003, plateH * 0.9, cm(0.35)), dark, M.Metal)
					end
				else
					box(m, cf * CFrame.new(x, cm(0.6) + plateH * 0.17, 0), Vector3.new(0.003, plateH * 0.34, len * 0.97), Color3.fromRGB(190, 192, 198), M.Metal)
				end
			end)
		elseif style == "hyperx" or style == "viper" or style == "pro" or style == "flare" then
			bothSides(function(_, x)
				box(m, cf * CFrame.new(x, plateTop - plateH * 0.18, 0), Vector3.new(0.003, plateH * 0.3, len * 0.97), if style == "hyperx" then Color3.fromRGB(20, 20, 22) else spread:Lerp(Color3.new(1, 1, 1), 0.3), M.Metal)
			end)
		elseif style == "ballistix" then
			bothSides(function(_, x)
				B.wedge(m, cf * CFrame.new(x, plateY + plateH * 0.12, len * 0.3) * CFrame.Angles(0, math.pi / 2, 0), Vector3.new(len * 0.36, plateH * 0.7, 0.004), Color3.fromRGB(200, 40, 40), M.SmoothPlastic, { CanCollide = false, CanTouch = false })
			end)
		elseif style == "ripjaws" then
			-- the jagged "claw" fins along the top
			for k = 0, 5 do
				B.wedge(m, cf * CFrame.new(0, plateTop + cm(0.35), -len * 0.42 + k * len * 0.168), Vector3.new(cm(0.6), cm(0.7), len * 0.15), spread, M.Metal, { CanCollide = false, CanTouch = false })
			end
		elseif style == "dominator" or style == "royal" then
			-- brushed top rails either side of the light bar
			for side = -1, 1, 2 do
				box(m, cf * CFrame.new(side * cm(0.27), plateTop + bar * 0.45, 0), Vector3.new(cm(0.1), bar * 0.9, len * 0.985), if style == "royal" then Color3.fromRGB(220, 222, 228) else Color3.fromRGB(176, 178, 184), M.Metal)
			end
		elseif style == "trident" or style == "trident5" then
			-- two-tone: a black band across the brushed plate
			bothSides(function(_, x)
				box(m, cf * CFrame.new(x, cm(0.6) + plateH * 0.18, 0), Vector3.new(0.003, plateH * 0.36, len * 0.97), Color3.fromRGB(28, 28, 32), M.Metal)
			end)
		end
		-- the light bar: a frosted diffuser (lit when the PC is on) or a closed top
		if bar > 0 then
			local diff = box(m, cf * CFrame.new(0, plateTop + bar / 2, 0), Vector3.new(cm(if style == "dominator" or style == "royal" then 0.42 else 0.6), bar, len * 0.96), Color3.fromRGB(236, 236, 242), M.Neon, { Name = "RamRGB", Transparency = 0.12, CastShadow = false })
			if p.rgb then
				diff:SetAttribute("RGB", true)
			end
			if style == "trident" then
				-- the Trident Z's raised wave at one end
				local wave = box(m, cf * CFrame.new(0, plateTop + bar + cm(0.25), -len * 0.22), Vector3.new(cm(0.6), cm(0.5), len * 0.5), Color3.fromRGB(236, 236, 242), M.Neon, { Name = "RamRGB", Transparency = 0.12, CastShadow = false })
				wave:SetAttribute("RGB", p.rgb == true)
			elseif style == "delta" then
				-- the wing-shaped diffuser of the T-Force Delta
				for k = -1, 1, 2 do
					local w = B.wedge(m, cf * CFrame.new(0, plateTop + bar + cm(0.3), k * len * 0.25) * CFrame.Angles(0, if k > 0 then 0 else math.pi, 0), Vector3.new(cm(0.6), cm(0.6), len * 0.48), Color3.fromRGB(236, 236, 242), M.Neon, { Name = "RamRGB", Transparency = 0.12, CanCollide = false, CanTouch = false, CastShadow = false })
					w:SetAttribute("RGB", p.rgb == true)
				end
			elseif style == "vrgb" or style == "xpg" then
				-- the light zones
				for k = -2, 2 do
					box(m, cf * CFrame.new(0, plateTop + bar / 2, k * len * 0.19), Vector3.new(cm(0.62), bar * 1.02, cm(0.12)), dark, M.SmoothPlastic)
				end
			elseif style == "royal" then
				box(m, cf * CFrame.new(0, plateTop + bar * 0.6, 0), Vector3.new(cm(0.3), bar * 0.6, len * 0.9), Color3.fromRGB(240, 240, 250), M.Glass, { Transparency = 0.3 })
			end
		else
			box(m, cf * CFrame.new(0, plateTop - cm(0.06), 0), Vector3.new(cm(0.64), cm(0.12), len * 0.985), spread, M.Metal)
		end
		-- the line's name on both faces, clear of the trim (on clear carriers over the plates)
		local badge = ramBadge(p)
		if badge ~= "" then
			local z0, z1, y0f, y1f = -0.45, 0.45, 0.3, 1.0
			if style == "trident" or style == "trident5" or style == "renegade" then
				y0f = 0.4
			elseif style == "fury" then
				z1 = 0.26
			elseif style == "ballistix" then
				z1 = 0.08
			elseif style == "hyperx" or style == "viper" or style == "pro" or style == "flare" then
				y0f, y1f = 0.1, 0.62
			end
			for side = -1, 1, 2 do
				local yb = side == -1 and math.max(y0f, 0.55) or y0f -- the capacity sticker is low on the -X side
				local carrier = box(m, cf * CFrame.new(side * (cm(0.32) + 0.002), cm(0.6) + plateH * (yb + y1f) / 2, len * (z0 + z1) / 2), Vector3.new(0.002, plateH * (y1f - yb), len * (z1 - z0)), textCol, M.SmoothPlastic, { Name = "Text", Transparency = 1, CastShadow = false, CanQuery = false })
				label(carrier, if side == 1 then Enum.NormalId.Right else Enum.NormalId.Left, badge, textCol, 300, B.Fonts.Heavy)
			end
		end
		stickerX = -cm(0.34)
	end
	-- capacity sticker
	local sticker = box(m, cf * CFrame.new(stickerX, math.min(h * 0.32, cm(1.3)), len * 0.3), Vector3.new(0.004, cm(1.0), cm(3)), Color3.fromRGB(240, 240, 236), M.SmoothPlastic)
	label(sticker, Enum.NormalId.Left, (p.size or 8) .. "GB " .. (p.mem or "") .. "-" .. (p.speed or ""), Color3.fromRGB(30, 30, 30), 600, B.Fonts.Bold)
	box(m, cf * CFrame.new(0, h / 2, 0), Vector3.new(0.12, h, len), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m
end

----------------------------------------------------------------------------------------------------
-- Graphics card. Origin: bracket end of the PCIe fingers, card runs to -X, stands up +Y,
-- cooler and fans on the +Z side, backplate on -Z. info.connectors = power socket frames.
----------------------------------------------------------------------------------------------------
function PCParts.gpuDims(gpuPart): (number, number, number)
	local p = gpuPart or {}
	local len = cm(p.len or 24)
	local h = cm(if p.lowProfile then 6.9 elseif (p.slots or 2) >= 3 then 14 elseif (p.slots or 2) >= 2.5 then 13.2 else 12)
	local t = cm((p.slots or 2) * 2 - 0.4)
	return len, h, t
end

-- Power socket frames on the card's top edge (relative to the card origin, at the socket mouth).
function PCParts.gpuSockets(gpuPart, connectors: { string }): { CFrame }
	local L, H, T = PCParts.gpuDims(gpuPart)
	local frames = {}
	local n = #connectors
	-- the Founders Edition's short board ends mid-card, and its socket with it
	local at = if gpuPart and gpuPart.design == "fe" then 0.56 else 0.72
	for i = 1, n do
		local x = -L * at + (i - (n + 1) / 2) * cm(2.2)
		table.insert(frames, CFrame.new(x, H * 0.97 + cm(0.6), cm(0.3) + T * 0.35))
	end
	return frames
end

-- The card itself is drawn by GpuCard (each maker's own cooler design).
function PCParts.gpu(cf: CFrame, gpuPart, connectors: { string }): (Model, { CFrame })
	return require(script.Parent.GpuCard).build(cf, gpuPart, connectors)
end

----------------------------------------------------------------------------------------------------
-- Power supply. Origin: centre. Depth along X, width along Y, height along Z; fan on +Z,
-- label on +Y, modular sockets on -X (towards the case front).
----------------------------------------------------------------------------------------------------
-- The maker's name as printed on its products, from the first word of the part's name.
local MAKERS = {
	Corsair = "CORSAIR", Seasonic = "SEASONIC", be = "be quiet!", Cooler = "COOLER MASTER", MSI = "msi",
	ASUS = "ASUS", Thermaltake = "Thermaltake", EVGA = "EVGA", NZXT = "NZXT", DeepCool = "DEEPCOOL", FSP = "FSP",
	Samsung = "SAMSUNG", WD = "WD", Kingston = "KINGSTON", Crucial = "Crucial", Seagate = "SEAGATE", SK = "SK hynix",
	TeamGroup = "T-FORCE", Lexar = "Lexar", SanDisk = "SanDisk", Toshiba = "TOSHIBA", Lian = "LIAN LI",
	Fractal = "FRACTAL", Phanteks = "PHANTEKS", Montech = "MONTECH", HYTE = "HYTE", Jonsbo = "JONSBO", Arctic = "ARCTIC",
	Noctua = "noctua", Thermalright = "Thermalright", Dell = "DELL", HP = "hp", Turbox = "TURBOX", ["Benchcraft"] = "BENCHCRAFT",
}
function PCParts.makerOf(part): string?
	local first = string.match(part and part.name or "", "^(%S+)")
	return first and MAKERS[first]
end

-- Accent colours by maker (labels, stripes).
local MAKER_ACCENT = {
	["SEASONIC"] = Color3.fromRGB(214, 176, 72), ["be quiet!"] = Color3.fromRGB(230, 120, 40),
	["COOLER MASTER"] = Color3.fromRGB(150, 80, 220), ["msi"] = Color3.fromRGB(220, 30, 40), ["ASUS"] = Color3.fromRGB(230, 20, 40),
	["Thermaltake"] = Color3.fromRGB(220, 30, 40), ["NZXT"] = Color3.fromRGB(140, 80, 230), ["DEEPCOOL"] = Color3.fromRGB(80, 170, 255),
	["FSP"] = Color3.fromRGB(255, 200, 40), ["TURBOX"] = Color3.fromRGB(255, 210, 40), ["EVGA"] = Color3.fromRGB(230, 230, 230),
}

function PCParts.psuDims(psuPart): Vector3
	if psuPart and psuPart.form == "SFX" then
		return Vector3.new(cm(10), cm(12.5), cm(6.35))
	end
	return Vector3.new(cm(14), cm(15), cm(8.6))
end

function PCParts.psu(cf: CFrame, psuPart): Model
	local m = newModel("PSU", cf)
	local d = PCParts.psuDims(psuPart)
	local q = psuPart and psuPart.quality or 0.5
	local maker = PCParts.makerOf(psuPart)
	local oem = maker == "DELL" or maker == "hp"
	local shell = if oem then Color3.fromRGB(160, 162, 166) elseif q >= 0.8 then Color3.fromRGB(26, 26, 30) elseif q >= 0.5 then Color3.fromRGB(40, 40, 44) else Color3.fromRGB(150, 152, 156)
	local accent = maker and MAKER_ACCENT[maker] or Color3.fromRGB(230, 230, 232)
	local body = box(m, cf, d, shell, M.Metal, { Name = "Shell" })
	body:SetAttribute("Detail", "psu")
	-- fan grille on +Z
	local fc = cf * CFrame.new(0, 0, d.Z / 2 + 0.002) * CFrame.Angles(math.pi / 2, 0, 0)
	cyl(m, fc, "Y", 0.004, math.min(d.X, d.Y) * 0.86, Color3.fromRGB(14, 14, 16))
	rotor(m, fc * CFrame.new(0, -0.006, 0), math.min(d.X, d.Y) * 0.8, Color3.fromRGB(30, 30, 34), Color3.fromRGB(40, 40, 44))
	for k = -3, 3 do
		box(m, fc * CFrame.new(0, 0.004, k * math.min(d.X, d.Y) * 0.12), Vector3.new(math.min(d.X, d.Y) * 0.86, 0.004, 0.006), STEEL, M.Metal)
	end
	dustLayer(m, fc * CFrame.new(0, 0.008, 0), Vector3.new(d.X * 0.9, 0.01, d.Y * 0.9))
	-- the side label (+Y): the maker in big letters, the model and wattage, the 80 PLUS badge and
	-- the maker's accent stripe; budget units get a plain paper sticker
	local paper = q < 0.5 or oem
	box(m, cf * CFrame.new(0, d.Y / 2 + 0.002, 0), Vector3.new(d.X * 0.84, 0.004, d.Z * 0.8), if paper then Color3.fromRGB(232, 232, 226) else Color3.fromRGB(18, 18, 20), M.SmoothPlastic, { Name = "Label" })
	local name = psuPart and psuPart.name or "PSU"
	local ink = if paper then Color3.fromRGB(30, 30, 30) else Color3.fromRGB(236, 236, 238)
	flatText(m, cf * CFrame.new(0, d.Y / 2 + 0.0045, -d.Z * 0.18), d.X * 0.76, d.Z * 0.26, maker or string.upper(string.match(name, "^(%S+)") or "PSU"), if paper then ink else accent, 300, B.Fonts.Heavy)
	flatText(m, cf * CFrame.new(0, d.Y / 2 + 0.0045, d.Z * 0.12), d.X * 0.76, d.Z * 0.18, (psuPart and psuPart.watt or 500) .. "W  •  " .. (string.match(name, "^%S+%s+(.+)$") or name), ink, 300, B.Fonts.Bold)
	local eff = psuPart and psuPart.eff or ""
	if eff ~= "Yok" and eff ~= "" then
		local medal = ({ Bronze = Color3.fromRGB(176, 110, 60), Gold = Color3.fromRGB(214, 176, 72), Platinum = Color3.fromRGB(200, 204, 210), Titanium = Color3.fromRGB(120, 124, 130) })[eff] or Color3.fromRGB(220, 220, 220)
		local badge = box(m, cf * CFrame.new(d.X * 0.3, d.Y / 2 + 0.005, d.Z * 0.3), Vector3.new(cm(2.4), 0.002, cm(1.4)), medal, M.SmoothPlastic)
		label(badge, Enum.NormalId.Top, "80 PLUS\n" .. string.upper(eff), Color3.fromRGB(20, 20, 22), 500, B.Fonts.Heavy)
	end
	if not paper then
		box(m, cf * CFrame.new(0, d.Y / 2 + 0.0042, d.Z * 0.37), Vector3.new(d.X * 0.84, 0.002, cm(0.3)), accent, M.SmoothPlastic)
	end
	if psuPart and psuPart.id == "psu_thor1200" then
		-- the ROG Thor's OLED power meter
		local oled = box(m, cf * CFrame.new(-d.X * 0.28, d.Y / 2 + 0.005, d.Z * 0.3), Vector3.new(cm(3.4), 0.002, cm(1.6)), Color3.fromRGB(6, 6, 8), M.Glass)
		_ = oled
		flatText(m, cf * CFrame.new(-d.X * 0.28, d.Y / 2 + 0.0065, d.Z * 0.3), cm(3), cm(1.3), "642 W", Color3.fromRGB(255, 80, 90), 400, B.Fonts.Mono, true)
	end
	-- modular sockets / cable exit on -X
	local modular = psuPart and psuPart.modular or "none"
	if modular ~= "none" then
		for r = 0, 2 do
			for c = 0, 2 do
				box(m, cf * CFrame.new(-d.X / 2 - 0.004, -d.Y * 0.25 + c * d.Y * 0.25, -d.Z * 0.25 + r * d.Z * 0.25), Vector3.new(0.008, cm(1.6), cm(1.2)), Color3.fromRGB(10, 10, 12))
			end
		end
	else
		cyl(m, cf * CFrame.new(-d.X / 2 - cm(0.6), 0, 0), "X", cm(1.2), cm(2.4), Color3.fromRGB(20, 20, 22), M.Rubber)
	end
	-- mains socket and switch on the rear (+X)
	box(m, cf * CFrame.new(d.X / 2 + 0.003, -d.Y * 0.2, 0), Vector3.new(0.006, cm(2.6), cm(2)), Color3.fromRGB(14, 14, 16))
	box(m, cf * CFrame.new(d.X / 2 + 0.004, d.Y * 0.15, 0), Vector3.new(0.008, cm(1.2), cm(1.6)), Color3.fromRGB(20, 20, 22))
	return m
end

----------------------------------------------------------------------------------------------------
-- Case fan (lying flat: axis +Y). size in cm.
----------------------------------------------------------------------------------------------------
function PCParts.fan(cf: CFrame, fanPart): Model
	local m = newModel("Fan", cf)
	local size = cm(fanPart and fanPart.size or 120) / 10
	local colour = fanPart and fanPart.color or "black"
	local frame, blade
	if colour == "white" then
		frame, blade = Color3.fromRGB(236, 236, 238), Color3.fromRGB(244, 244, 246)
	elseif colour == "brown" then
		frame, blade = Color3.fromRGB(110, 76, 50), Color3.fromRGB(214, 194, 164)
	else
		frame, blade = Color3.fromRGB(26, 26, 30), Color3.fromRGB(40, 40, 46)
	end
	fanFrame(m, cf, size, frame, blade, fanPart and fanPart.rgb)
	dustLayer(m, cf * CFrame.new(0, cm(1.3), 0), Vector3.new(size * 0.94, 0.01, size * 0.94))
	return m
end

----------------------------------------------------------------------------------------------------
-- Storage (lying flat, origin at the centre of the bottom face; connector end at +X)
----------------------------------------------------------------------------------------------------
function PCParts.storageDims(part): Vector3
	local kind = part and part.kind or "ssd25"
	if kind == "nvme" then
		return Vector3.new(cm(8), cm(0.35), cm(2.2))
	elseif kind == "hdd35" then
		return Vector3.new(cm(14.7), cm(2.6), cm(10.2))
	elseif kind == "hdd25" then
		return Vector3.new(cm(10), cm(0.95), cm(7))
	end
	return Vector3.new(cm(10), cm(0.7), cm(7))
end

function PCParts.storage(cf: CFrame, part): Model
	local m = newModel("Drive", cf)
	local kind = part and part.kind or "ssd25"
	local d = PCParts.storageDims(part)
	local name = part and part.name or ""
	local maker = PCParts.makerOf(part)
	local model = string.match(name, "^%S+%s+(.+)$") or name
	if maker == "WD" or maker == "SK hynix" then
		model = string.match(name, "^%S+%s+%S+%s+(.+)$") or model
	end
	if kind == "nvme" then
		box(m, cf * CFrame.new(0, cm(0.08), 0), Vector3.new(d.X, cm(0.16), d.Z), Color3.fromRGB(20, 22, 24), M.SmoothPlastic, { Name = "PCB" })
		box(m, cf * CFrame.new(d.X / 2 - cm(0.4), cm(0.08), 0), Vector3.new(cm(0.8), cm(0.18), d.Z * 0.9), GOLD, M.Metal)
		if part and part.heatsink then
			-- an aluminium heatsink over the drive, finned, with the maker's name
			local hsCol = if maker == "SEAGATE" then Color3.fromRGB(40, 40, 44) elseif maker == "Crucial" then Color3.fromRGB(150, 154, 160) else Color3.fromRGB(26, 26, 30)
			local hs = box(m, cf * CFrame.new(-cm(0.4), cm(0.6), 0), Vector3.new(d.X * 0.84, cm(0.9), d.Z * 0.96), hsCol, M.Metal, { Name = "Heatsink" })
			for k = -3, 3 do
				box(m, cf * CFrame.new(-cm(0.4) + k * d.X * 0.11, cm(1.05) + 0.001, 0), Vector3.new(cm(0.12), 0.002, d.Z * 0.9), hsCol:Lerp(Color3.new(0, 0, 0), 0.5), M.Metal)
			end
			if maker == "SEAGATE" then
				box(m, cf * CFrame.new(-cm(0.4), cm(1.05) + 0.0015, d.Z * 0.35), Vector3.new(d.X * 0.8, 0.002, cm(0.2)), Color3.fromRGB(255, 120, 30), M.SmoothPlastic)
			end
			label(hs, Enum.NormalId.Top, (maker or "") .. "  " .. model, Color3.fromRGB(230, 230, 232), 420, B.Fonts.Bold)
		else
			-- the sticker: the maker's colours
			local stickCol = if maker == "KINGSTON" and string.find(name, "NV", 1, true) then Color3.fromRGB(30, 60, 140) elseif string.find(name, "Blue", 1, true) then Color3.fromRGB(30, 80, 170) elseif maker == "T-FORCE" or maker == "Lexar" then Color3.fromRGB(150, 154, 160) else Color3.fromRGB(24, 24, 26)
			local stick = box(m, cf * CFrame.new(-cm(0.4), cm(0.24), 0), Vector3.new(d.X * 0.82, cm(0.16), d.Z * 0.92), stickCol, M.SmoothPlastic, { Name = "Sticker" })
			label(stick, Enum.NormalId.Top, (maker or "") .. "\n" .. model, Color3.fromRGB(236, 236, 238), 420, B.Fonts.Bold)
			-- controller and flash chips under the sticker's edge
			for k = 0, 1 do
				box(m, cf * CFrame.new(-d.X * 0.25 + k * d.X * 0.3, cm(0.2), d.Z * 0.47), Vector3.new(cm(1.2), cm(0.08), cm(0.12)), Color3.fromRGB(14, 14, 16))
			end
		end
		-- screw notch
		box(m, cf * CFrame.new(-d.X / 2 + cm(0.15), cm(0.08), 0), Vector3.new(cm(0.3), cm(0.17), cm(0.5)), Color3.fromRGB(196, 170, 90), M.Metal)
	elseif kind == "hdd35" then
		box(m, cf * CFrame.new(0, d.Y / 2, 0), d, Color3.fromRGB(176, 180, 186), M.Metal, { Name = "Body" })
		local lab = box(m, cf * CFrame.new(0, d.Y + 0.002, 0), Vector3.new(d.X * 0.7, 0.004, d.Z * 0.8), Color3.fromRGB(236, 236, 232), M.SmoothPlastic, { Name = "Label" })
		label(lab, Enum.NormalId.Top, name, Color3.fromRGB(30, 30, 30), 200, B.Fonts.Bold)
		-- the line's colour band (WD Blue/Red/Black, BarraCuda, IronWolf, Toshiba)
		local band = if string.find(name, "Red", 1, true) then Color3.fromRGB(200, 40, 46) elseif string.find(name, "Black", 1, true) then Color3.fromRGB(26, 26, 28) elseif maker == "WD" then Color3.fromRGB(30, 90, 190) elseif string.find(name, "IronWolf", 1, true) then Color3.fromRGB(240, 120, 30) elseif maker == "TOSHIBA" then Color3.fromRGB(200, 40, 46) else Color3.fromRGB(40, 150, 140)
		box(m, cf * CFrame.new(-d.X * 0.3, d.Y + 0.0045, 0), Vector3.new(d.X * 0.1, 0.002, d.Z * 0.8), band, M.SmoothPlastic)
		-- the spindle bump and the four lid screws
		cyl(m, cf * CFrame.new(d.X * 0.22, d.Y + 0.003, d.Z * 0.28), "Y", 0.004, cm(2.2), Color3.fromRGB(196, 200, 206), M.Metal)
		for _, o in { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } } do
			cyl(m, cf * CFrame.new(o[1] * d.X * 0.44, d.Y + 0.002, o[2] * d.Z * 0.42), "Y", 0.004, cm(0.5), Color3.fromRGB(150, 152, 156), M.Metal)
		end
		box(m, cf * CFrame.new(0, -0.002, 0), Vector3.new(d.X * 0.8, 0.004, d.Z * 0.75), Color3.fromRGB(20, 70, 40))
		-- SATA connectors on the +X end
		box(m, cf * CFrame.new(d.X / 2 + 0.004, d.Y * 0.4, -d.Z * 0.15), Vector3.new(0.008, cm(0.8), cm(2.2)), Color3.fromRGB(20, 20, 22))
		box(m, cf * CFrame.new(d.X / 2 + 0.004, d.Y * 0.4, d.Z * 0.25), Vector3.new(0.008, cm(0.8), cm(1.2)), Color3.fromRGB(20, 20, 22))
	else
		-- 2.5" drives: the SSD makers' cases and labels
		local shell = if kind == "hdd25" then Color3.fromRGB(176, 180, 186) elseif maker == "Crucial" then Color3.fromRGB(150, 154, 160) else Color3.fromRGB(34, 34, 38)
		local labCol = if kind == "hdd25" then Color3.fromRGB(236, 236, 232)
			elseif maker == "SAMSUNG" then Color3.fromRGB(20, 20, 22)
			elseif maker == "Crucial" then Color3.fromRGB(30, 60, 120)
			elseif maker == "WD" then Color3.fromRGB(30, 90, 190)
			elseif maker == "SanDisk" then Color3.fromRGB(200, 30, 40)
			elseif maker == "KINGSTON" then Color3.fromRGB(120, 124, 130)
			else Color3.fromRGB(200, 40, 50)
		box(m, cf * CFrame.new(0, d.Y / 2, 0), d, shell, M.Metal, { Name = "Body" })
		local lab = box(m, cf * CFrame.new(0, d.Y + 0.002, 0), Vector3.new(d.X * 0.85, 0.004, d.Z * 0.8), labCol, M.SmoothPlastic, { Name = "Label" })
		label(lab, Enum.NormalId.Top, if kind == "hdd25" then name else (maker or "") .. "\n" .. model, if kind == "hdd25" then Color3.fromRGB(30, 30, 30) else Color3.fromRGB(255, 255, 255), 240, B.Fonts.Bold)
		box(m, cf * CFrame.new(d.X / 2 + 0.004, d.Y * 0.5, 0), Vector3.new(0.008, cm(0.5), cm(3)), Color3.fromRGB(20, 20, 22))
	end
	box(m, cf * CFrame.new(0, d.Y / 2, 0), Vector3.new(d.X, math.max(d.Y, 0.06), d.Z), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m
end

----------------------------------------------------------------------------------------------------
-- Small board parts
----------------------------------------------------------------------------------------------------
function PCParts.cmos(cf: CFrame): Model
	local m = newModel("CMOS", cf)
	cyl(m, cf * CFrame.new(0, cm(0.45), 0), "Y", cm(0.32), cm(2), Color3.fromRGB(200, 202, 208), M.Metal, { Name = "Cell" })
	flatText(m, cf * CFrame.new(0, cm(0.61) + 0.0012, 0), cm(1.4), cm(0.45), "CR2032", Color3.fromRGB(60, 60, 64), 500, B.Fonts.Bold)
	box(m, cf * CFrame.new(0, cm(0.45), 0), Vector3.new(0.14, 0.06, 0.14), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m
end

-- Electrolytic capacitor standing on the board; bulged ones have a domed, crusty top.
function PCParts.capacitor(cf: CFrame, bulged: boolean): Model
	local m = newModel("Capacitor", cf)
	local d, h = 0.085, 0.13
	cyl(m, cf * CFrame.new(0, h / 2, 0), "Y", h, d, Color3.fromRGB(40, 40, 46), M.Metal, { Name = "Can" })
	if bulged then
		B.ellipsoid(m, cf * CFrame.new(0, h + 0.008, 0), Vector3.new(d * 0.95, 0.04, d * 0.95), Color3.fromRGB(150, 150, 156), M.Metal, props({ Name = "Bulge" }))
		B.ellipsoid(m, cf * CFrame.new(0.01, h + 0.02, 0.005), Vector3.new(d * 0.5, 0.012, d * 0.4), Color3.fromRGB(120, 76, 40), M.SmoothPlastic, props({ Name = "Crust", CastShadow = false }))
	else
		cyl(m, cf * CFrame.new(0, h + 0.001, 0), "Y", 0.002, d * 0.92, Color3.fromRGB(176, 180, 186), M.Metal)
		box(m, cf * CFrame.new(0, h + 0.003, 0), Vector3.new(d * 0.7, 0.002, 0.006), Color3.fromRGB(110, 110, 116))
	end
	box(m, cf * CFrame.new(0, h / 2, 0), Vector3.new(0.13, h, 0.13), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m
end

----------------------------------------------------------------------------------------------------
-- Cables: a sleeved run through `points` (world positions) ending in a connector.
-- style: "atx24" | "eps" | "pcie" | "sata_power" | "sata_data" | "fan"
----------------------------------------------------------------------------------------------------
local CABLE_STYLE = {
	-- thin runs (the plugs stay chunky enough to read and to click)
	atx24 = { w = 0.1, t = 0.034, color = { 46, 48, 54 }, head = { 0.15, 0.13, 0.58 } },
	eps = { w = 0.06, t = 0.03, color = { 46, 48, 54 }, head = { 0.23, 0.12, 0.13 } },
	pcie = { w = 0.06, t = 0.03, color = { 46, 48, 54 }, head = { 0.2, 0.1, 0.1 } },
	sata_power = { w = 0.045, t = 0.016, color = { 38, 38, 42 }, head = { 0.23, 0.075, 0.075 } },
	sata_data = { w = 0.03, t = 0.014, color = { 200, 40, 40 }, head = { 0.13, 0.075, 0.075 } },
	fan = { w = 0.024, t = 0.018, color = { 44, 44, 48 }, head = { 0.11, 0.075, 0.05 } },
	ribbon = { w = 0.18, t = 0.01, color = { 196, 150, 70 }, head = { 0.2, 0.045, 0.09 } },
	thin = { w = 0.03, t = 0.018, color = { 30, 30, 32 }, head = { 0.075, 0.045, 0.06 } },
}
PCParts.CableStyle = CABLE_STYLE

function PCParts.cable(points: { Vector3 }, style: string, headCf: CFrame?): Model
	local st = CABLE_STYLE[style] or CABLE_STYLE.fan
	local m = newModel("Cable", CFrame.new(points[#points]))
	local c = col(st.color)
	for i = 1, #points - 1 do
		local a, b = points[i], points[i + 1]
		local len = (b - a).Magnitude
		if len > 1e-3 then
			-- flat run: width across, thickness up; joints get a small overlap
			local mid = (a + b) / 2
			local look = CFrame.lookAt(mid, b)
			box(m, look, Vector3.new(st.w, st.t, len + st.w * 0.6), c, M.Fabric, { CastShadow = false, Name = "Run" })
		end
	end
	if headCf then
		local h = st.head
		box(m, headCf * CFrame.new(0, h[2] / 2, 0), Vector3.new(h[1], h[2], h[3]), Color3.fromRGB(30, 30, 32), M.SmoothPlastic, { Name = "Head" })
		box(m, headCf * CFrame.new(0, h[2] / 2, 0), Vector3.new(math.max(h[1], 0.24), math.max(h[2], 0.15), math.max(h[3], 0.24)), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	end
	return m
end

return PCParts
