-- PCParts: builders for every desktop component the repair bench shows. Each builder draws the part
-- in its own local frame (`cf`) at real proportions (S studs per centimetre; screws, clips and pins
-- are exaggerated so they stay readable and clickable) and returns a Model whose PrimaryPart sits
-- at `cf`. Nothing collides; everything can be ray-picked.

local B = require(script.Parent.Parent.Util.Builder)

local PCParts = {}
local M = Enum.Material

local S = 0.075 -- studs per centimetre
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

-- small text sticker on a face of `part`
local function label(part: BasePart, face: Enum.NormalId, text: string, color: any, ppS: number?, font: Font?)
	B.sign(part, face, text, { color = col(color), pixelsPerStud = ppS or 300, font = font or B.Fonts.Bold })
end
PCParts.label = label

-- Fan rotor (blades + hub) spinning around the local Y axis of cf; tagged for the bench animator.
local function rotor(m: Instance, cf: CFrame, diameter: number, bladeCol: any, hubCol: any, blades: number?): Model
	local r = newModel("Rotor", cf)
	r:SetAttribute("SpinAxis", "Y")
	local n = blades or 7
	for i = 1, n do
		local a = (i / n) * math.pi * 2
		local bcf = cf * CFrame.Angles(0, a, 0) * CFrame.new(diameter * 0.27, 0, 0) * CFrame.Angles(math.rad(28), 0, 0)
		box(r, bcf, Vector3.new(diameter * 0.36, math.max(0.006, diameter * 0.02), diameter * 0.2), bladeCol, M.SmoothPlastic)
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
	local inner = body:Lerp(Color3.new(0, 0, 0), 0.25)
	local t = 0.035
	local style = casePart and casePart.style or "airflow"
	-- motherboard tray (now the floor)
	box(m, cf * CFrame.new(0, t / 2, 0), Vector3.new(lx, t, lz), inner, M.Metal, { Name = "Tray" })
	-- cable grommets beside the board
	for k = 0, 2 do
		box(m, cf * CFrame.new(-lx / 2 + cm(12.5), t + 0.002, -lz / 2 + cm(9) + k * cm(9)), Vector3.new(cm(1.4), 0.004, cm(5)), DARK, M.Rubber)
	end
	-- front panel (thick, with mesh or glass) at -X
	local frontMat = if style == "airflow" or style == "itx" then M.DiamondPlate else M.SmoothPlastic
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
	box(m, cf * CFrame.new(lx / 2 - t / 2, ly / 2, 0), Vector3.new(t, ly, lz), inner, M.Metal, { Name = "RearPanel" })
	for k = 0, 6 do
		box(m, cf * CFrame.new(lx / 2 + 0.003, ly * 0.5, cm(1.5) + k * cm(2.03) - lz / 2 + cm(19.5)), Vector3.new(0.006, ly * 0.55, cm(1.7)), Color3.fromRGB(70, 72, 76), M.Metal)
	end
	-- top (-Z) and bottom (+Z) walls
	local topWall = box(m, cf * CFrame.new(0, ly / 2, -lz / 2 + t / 2), Vector3.new(lx, ly, t), body, if style == "airflow" or style == "showcase" then M.DiamondPlate else M.Metal, { Name = "TopPanel" })
	topWall:SetAttribute("Detail", "top")
	box(m, cf * CFrame.new(0, ly / 2, lz / 2 - t / 2), Vector3.new(lx, ly, t), body, M.Metal, { Name = "BottomPanel" })
	-- PSU intake vent under the power supply
	box(m, cf * CFrame.new(lx / 2 - cm(8), ly * 0.4, lz / 2 + 0.002), Vector3.new(cm(12), cm(11), 0.004), Color3.fromRGB(14, 14, 16), M.DiamondPlate)
	-- feet on the old bottom
	for _, x in { -lx / 2 + cm(5), lx / 2 - cm(5) } do
		box(m, cf * CFrame.new(x, ly / 2, lz / 2 + cm(0.8)), Vector3.new(cm(4), ly * 0.7, cm(1.6)), Color3.fromRGB(40, 40, 44), M.Rubber)
	end
	-- PSU shroud (front half) and the drive cage under it
	if style ~= "sff" and style ~= "office" and style ~= "retro" and style ~= "itx" then
		local sz = lz / 2 - cm(10.5)
		box(m, cf * CFrame.new(-lx / 4, ly / 2, sz), Vector3.new(lx / 2, ly, t), inner, M.Metal, { Name = "Shroud" })
		box(m, cf * CFrame.new(-lx / 4, ly - 0.01, sz + cm(0.5)), Vector3.new(lx / 2 - cm(2), 0.012, cm(1)), body:Lerp(Color3.new(1, 1, 1), 0.2), M.Metal)
	end
	-- RGB strip on showcase/glass cases
	if casePart and casePart.rgb then
		local strip = box(m, cf * CFrame.new(-lx / 2 + cm(2.6), ly * 0.5, 0), Vector3.new(0.02, ly * 0.8, lz * 0.9), Color3.fromRGB(140, 60, 255), M.Neon, { Name = "CaseRGB", Transparency = 0.4 })
		strip:SetAttribute("RGB", true)
	end
	-- brand badge on the front
	local badge = box(m, cf * CFrame.new(-lx / 2 - 0.004, ly * 0.5, lz / 2 - cm(4)), Vector3.new(0.008, cm(1.5), cm(5)), Color3.fromRGB(200, 200, 204), M.Metal)
	badge.Name = "Badge"
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
	L.cmos = at(14.5, 17.6)
	L.caps = {
		at(4.2, 3.0), at(4.2, 4.5), at(4.2, 6.0),
		at(su - 2, 11.2), at(su, 11.2), at(su + 2, 11.2),
	}
	L.atx24 = at(W - 1.3, 8.6)
	L.eps = at(12.6, 0.8)
	L.cpuFan = at(14.6, 0.8)
	L.sysFan = { at(W - 1, 2), at(W - 1, 16), at(W - 6, H - 1), at(W - 9, H - 1), at(3, H - 1), at(W - 12, H - 1) }
	L.sata = { at(W - 1.1, math.min(H - 3, 22)), at(W - 1.1, math.min(H - 5, 24.2)) }
	L.chipset = at(17.5, math.min(H - 5, 20.3))
	return L
end

local function themeOf(moboPart)
	return THEMES[moboPart and moboPart.theme or "black"] or THEMES.black
end

function PCParts.mobo(cf: CFrame, moboPart): (Model, any)
	local m = newModel("Motherboard", cf)
	local L = PCParts.boardLayout(moboPart)
	local th = themeOf(moboPart)
	local pcb, sink, accent = col(th.pcb), col(th.sink), col(th.accent)
	local W, H = L.W, L.H
	local at = L.at
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
	box(m, cf * at(1.6, 0.6 + ioH / 2, cm(3.62)), Vector3.new(cm(2.6), 0.004, cm(ioH - 1)), accent, if moboPart and (moboPart.theme == "rog" or moboPart.theme == "aorus") then M.Neon else M.Metal, { Name = "IOAccent" })
	-- VRM heatsinks: one above the socket, one between the socket and the I/O
	local su = if L.form == "ITX" then 8 else 10
	box(m, cf * at(su + 1, 2.6, cm(1.6)), Vector3.new(cm(10), cm(3.2), cm(2.4)), sink, M.Metal, { Name = "VRMTop" })
	box(m, cf * at(4.7, 8, cm(1.6)), Vector3.new(cm(2.2), cm(3.2), cm(8.5)), sink, M.Metal, { Name = "VRMRear" })
	for k = -2, 2 do
		box(m, cf * at(su + 1 + k * 1.8, 2.6, cm(3.22)), Vector3.new(cm(0.4), 0.004, cm(2.2)), sink:Lerp(Color3.new(0, 0, 0), 0.35), M.Metal)
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
	local chip = box(m, cf * L.chipset * CFrame.new(0, cm(0.6), 0), Vector3.new(cm(5.5), cm(1.2), cm(4.8)), sink, M.Metal, { Name = "Chipset" })
	label(chip, Enum.NormalId.Top, string.upper(moboPart and moboPart.brand or "ASUS") .. "\n" .. (moboPart and moboPart.chipset or ""), th.accent, 260)
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
	cyl(m, cf * L.cmos * CFrame.new(0, cm(0.15), 0), "Y", cm(0.3), cm(2.3), Color3.fromRGB(40, 40, 44), M.SmoothPlastic)
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
		box(m, cf * CFrame.new(0, cm(0.6), 0), Vector3.new(cm(1.2), cm(1.1), cm(0.9)), Color3.fromRGB(70, 72, 78), M.SmoothPlastic)
		box(m, cf * CFrame.new(0, cm(0.6), 0), Vector3.new(0.14, 0.12, 0.14), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	else
		box(m, cf * CFrame.new(0, cm(0.75), 0), Vector3.new(cm(0.75), cm(1.5), cm(0.8)), Color3.fromRGB(64, 66, 72), M.SmoothPlastic)
		box(m, cf * CFrame.new(0, cm(0.75), 0), Vector3.new(0.12, 0.14, 0.12), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
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
	rotor(m, cf * CFrame.new(0, t * 0.05, 0), s * 0.92, bladeCol, frameCol)
	if rgb then
		local ring = cyl(m, cf * CFrame.new(0, t * 0.48, 0), "Y", 0.006, s * 0.95, Color3.fromRGB(150, 70, 255), M.Neon, { Name = "FanRGB", Transparency = 0.55 })
		ring:SetAttribute("RGB", true)
	end
	box(m, cf, Vector3.new(s, t, s), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
end
PCParts.fanFrame = fanFrame

function PCParts.cooler(cf: CFrame, coolerPart, ctx): Model
	local m = newModel("Cooler", cf)
	local kind = coolerPart and coolerPart.kind or "stock"
	local alu = Color3.fromRGB(196, 198, 204)
	local copper = Color3.fromRGB(196, 116, 70)
	local black = Color3.fromRGB(28, 28, 32)
	local rgb = coolerPart and coolerPart.rgb
	if kind == "stock" then
		local amd = coolerPart and coolerPart.sockets == "amd"
		if amd then
			-- AMD Wraith: square black shroud with a round fan
			box(m, cf * CFrame.new(0, cm(2.2), 0), Vector3.new(cm(9.5), cm(4.4), cm(9.5)), black, M.SmoothPlastic, { Name = "Shroud" })
			rotor(m, cf * CFrame.new(0, cm(4.45), 0), cm(8.6), black:Lerp(Color3.new(1, 1, 1), 0.1), black)
			if rgb then
				local ring = cyl(m, cf * CFrame.new(0, cm(4.5), 0), "Y", 0.008, cm(9.2), Color3.fromRGB(255, 60, 160), M.Neon, { Name = "CoolerRGB", Transparency = 0.5 })
				ring:SetAttribute("RGB", true)
			end
			dustLayer(m, cf * CFrame.new(0, cm(4.6), 0), Vector3.new(cm(9.6), 0.01, cm(9.6)))
		else
			-- Intel stock: round aluminium sink, copper core, black fan on top
			cyl(m, cf * CFrame.new(0, cm(1.4), 0), "Y", cm(2.8), cm(9.4), alu, M.Metal, { Name = "Sink" })
			cyl(m, cf * CFrame.new(0, cm(1.4), 0), "Y", cm(2.82), cm(3), copper, M.Metal)
			cyl(m, cf * CFrame.new(0, cm(3.4), 0), "Y", cm(1.2), cm(9), black, M.SmoothPlastic)
			rotor(m, cf * CFrame.new(0, cm(4.05), 0), cm(8), black:Lerp(Color3.new(1, 1, 1), 0.12), black)
			dustLayer(m, cf * CFrame.new(0, cm(4.2), 0), Vector3.new(cm(9.2), 0.01, cm(9.2)))
		end
	elseif kind == "air" then
		local towers = coolerPart and coolerPart.towers or 1
		local h = cm(15.6)
		-- base plate and heat pipes
		box(m, cf * CFrame.new(0, cm(0.6), 0), Vector3.new(cm(4), cm(1.2), cm(4)), copper, M.Metal, { Name = "Base" })
		local finCol = if coolerPart and coolerPart.noctua then alu elseif coolerPart and (coolerPart.id == "cool_drp5" or coolerPart.id == "cool_nhd15" or coolerPart.id == "cool_hyper212") then black else alu
		local tw = cm(5)
		local xs = if towers == 2 then { -cm(4.6), cm(4.6) } else { 0 }
		for _, x in xs do
			for k = -1, 1 do
				cyl(m, cf * CFrame.new(x * 0.5 + k * cm(0.9), h * 0.45, 0), "Y", h * 0.9, cm(0.6), copper, M.Metal)
			end
			local stack = box(m, cf * CFrame.new(x, h * 0.62, 0), Vector3.new(tw, h * 0.72, cm(12.4)), finCol, M.Metal, { Name = "FinStack" })
			stack:SetAttribute("Detail", "fins")
			-- fin lines on the top
			for k = -5, 5 do
				box(m, cf * CFrame.new(x, h * 0.98 + 0.002, k * cm(1.1)), Vector3.new(tw, 0.004, 0.006), finCol:Lerp(Color3.new(0, 0, 0), 0.35), M.Metal)
			end
			-- top cap
			box(m, cf * CFrame.new(x, h * 0.99, 0), Vector3.new(tw * 1.02, cm(0.5), cm(12.6)), if coolerPart and coolerPart.id == "cool_ak620d" then Color3.fromRGB(20, 20, 22) else finCol:Lerp(Color3.new(0, 0, 0), 0.2), M.Metal)
			dustLayer(m, cf * CFrame.new(x, h * 0.62, 0), Vector3.new(tw * 1.04, h * 0.74, cm(12.6)))
		end
		-- fan(s) on the intake (front, -X) side of each tower
		local fanCol = if coolerPart and coolerPart.noctua then Color3.fromRGB(110, 76, 50) else black
		local bladeCol = if coolerPart and coolerPart.noctua then Color3.fromRGB(210, 190, 160) else black:Lerp(Color3.new(1, 1, 1), 0.08)
		local fx = if towers == 2 then 0 else -tw / 2 - cm(1.4)
		local fanSize = if towers == 2 then cm(14) else cm(12)
		local fanModel = newModel("CoolerFan", cf * CFrame.new(fx, h * 0.6, 0) * CFrame.Angles(0, 0, math.pi / 2))
		fanFrame(fanModel, cf * CFrame.new(fx, h * 0.6, 0) * CFrame.Angles(0, 0, math.pi / 2), fanSize, fanCol, bladeCol, rgb)
		fanModel.Parent = m
		if coolerPart and coolerPart.id == "cool_ak620d" then
			local disp = box(m, cf * CFrame.new(0, h * 1.01, 0), Vector3.new(cm(8), 0.006, cm(4)), Color3.fromRGB(10, 10, 12), M.SmoothPlastic, { Name = "TempDisplay" })
			label(disp, Enum.NormalId.Top, "45°C", Color3.fromRGB(80, 200, 255), 300, B.Fonts.Mono)
		end
	else
		-- AIO: pump block on the CPU, tubes up to the radiator on the top panel
		local block = cyl(m, cf * CFrame.new(0, cm(1.9), 0), "Y", cm(3.8), cm(6.6), black, M.SmoothPlastic, { Name = "Pump" })
		local cap = cyl(m, cf * CFrame.new(0, cm(3.85), 0), "Y", 0.008, cm(5.4), if rgb then Color3.fromRGB(120, 60, 255) else Color3.fromRGB(60, 60, 66), if rgb then M.Neon else M.Metal, { Name = "PumpCap" })
		if rgb then
			cap:SetAttribute("RGB", true)
		end
		if coolerPart and coolerPart.lcd then
			label(cap, Enum.NormalId.Top, "38°C", Color3.fromRGB(255, 255, 255), 400, B.Fonts.Heavy)
		end
		block:SetAttribute("Detail", "pump")
		local rad = coolerPart and coolerPart.radiator or 240
		local fans = if rad >= 360 then 3 else 2
		local radLen = cm(fans * 12 + 3.6)
		-- radiator (long axis X, fans on +Z) where the layout mounts it; beside the pump otherwise
		local radCf = cf * ((ctx and ctx.radCf) or CFrame.new(-cm(14), cm(8), 0) * CFrame.Angles(0, math.pi / 2, 0))
		box(m, radCf, Vector3.new(radLen, cm(12), cm(2.7)), black, M.Metal, { Name = "Radiator" })
		for k = -10, 10 do
			box(m, radCf * CFrame.new(k * radLen / 22, 0, cm(1.36)), Vector3.new(0.006, cm(11), 0.004), Color3.fromRGB(60, 60, 66), M.Metal)
		end
		for i = 1, fans do
			local x = -radLen / 2 + cm(1.8) + cm(6) + (i - 1) * cm(12)
			local fcf = radCf * CFrame.new(x, 0, cm(2.7)) * CFrame.Angles(math.pi / 2, 0, 0)
			local fm = newModel("RadFan", fcf)
			fanFrame(fm, fcf, cm(12), black, black:Lerp(Color3.new(1, 1, 1), 0.08), rgb)
			fm.Parent = m
		end
		dustLayer(m, radCf * CFrame.new(0, 0, cm(1.5)), Vector3.new(radLen, cm(12), 0.01))
		-- two tubes from the pump to the radiator end
		local p0 = (cf * CFrame.new(cm(1.2), cm(2.5), -cm(2.5))).Position
		local p1 = (radCf * CFrame.new(radLen / 2 - cm(2), cm(3), cm(1))).Position
		for k = 0, 1 do
			local off = Vector3.new(0, 0, k * cm(1.4))
			local a, b = p0 + off, p1 + off
			local mid = (a + b) / 2 + Vector3.new(0, cm(3), 0)
			for _, seg in { { a, mid }, { mid, b } } do
				local d = (seg[2] - seg[1]).Magnitude
				local sc = CFrame.lookAt((seg[1] + seg[2]) / 2, seg[2]) * CFrame.Angles(0, math.pi / 2, 0)
				cyl(m, sc, "X", d, cm(1.2), Color3.fromRGB(22, 22, 24), M.Rubber)
			end
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
}

function PCParts.ram(cf: CFrame, ramPart): Model
	local m = newModel("RAM", cf)
	local so = ramPart and ramPart.form == "SODIMM"
	local len = if so then cm(6.95) else cm(13.3)
	local h = if so then cm(3) else cm(3.1)
	local colour = ramPart and ramPart.color or "green"
	local bare = colour == "green"
	local pcb = Color3.fromRGB(30, 100, 56)
	box(m, cf * CFrame.new(0, h / 2, 0), Vector3.new(cm(0.12), h, len), pcb, M.SmoothPlastic, { Name = "PCB" })
	box(m, cf * CFrame.new(0, cm(0.25), 0), Vector3.new(cm(0.14), cm(0.5), len * 0.94), GOLD, M.Metal, { Name = "Contacts" })
	-- notch
	box(m, cf * CFrame.new(0, cm(0.2), len * 0.1), Vector3.new(cm(0.2), cm(0.45), cm(0.3)), Color3.fromRGB(12, 12, 14))
	if bare then
		-- memory chips on both sides
		for side = -1, 1, 2 do
			for k = 0, (if so then 3 else 7) do
				local z = -len / 2 + len * (k + 0.75) / (if so then 4.6 else 8.6)
				box(m, cf * CFrame.new(side * cm(0.12), h * 0.55, z), Vector3.new(cm(0.12), cm(1.1), cm(1.1)), Color3.fromRGB(20, 20, 22))
			end
		end
	else
		local spread = col(RAM_COLORS[colour] or RAM_COLORS.black)
		local hs = box(m, cf * CFrame.new(0, h * 0.58, 0), Vector3.new(cm(0.62), h * 0.84, len * 0.99), spread, M.Metal, { Name = "Spreader" })
		label(hs, Enum.NormalId.Right, string.upper(ramPart and ramPart.name or "") , if colour == "white" or colour == "silver" then Color3.fromRGB(30, 30, 30) else Color3.fromRGB(230, 230, 230), 260, B.Fonts.Bold)
		if ramPart and ramPart.rgb then
			local bar = box(m, cf * CFrame.new(0, h + cm(0.35), 0), Vector3.new(cm(0.5), cm(0.7), len * 0.96), Color3.fromRGB(120, 200, 255), M.Neon, { Name = "RamRGB", Transparency = 0.35 })
			bar:SetAttribute("RGB", true)
		end
	end
	-- capacity sticker
	local sticker = box(m, cf * CFrame.new(-cm(0.4), h * 0.5, len * 0.2), Vector3.new(0.004, cm(1.2), cm(3)), Color3.fromRGB(240, 240, 236), M.SmoothPlastic)
	label(sticker, Enum.NormalId.Left, (ramPart and ramPart.size or 8) .. "GB " .. (ramPart and ramPart.mem or ""), Color3.fromRGB(30, 30, 30), 600, B.Fonts.Bold)
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
	for i = 1, n do
		local x = -L * 0.72 + (i - (n + 1) / 2) * cm(2.2)
		table.insert(frames, CFrame.new(x, H * 0.97 + cm(0.6), cm(0.3) + T * 0.35))
	end
	return frames
end

function PCParts.gpu(cf: CFrame, gpuPart, connectors: { string }): (Model, { CFrame })
	local m = newModel("GPU", cf)
	local p = gpuPart or {}
	local L, H, T = PCParts.gpuDims(p)
	local shroud, accent
	if p.workstation then
		shroud, accent = Color3.fromRGB(24, 24, 26), Color3.fromRGB(196, 160, 60)
	elseif p.brand == "amd" then
		shroud, accent = Color3.fromRGB(32, 32, 36), Color3.fromRGB(204, 30, 42)
	elseif p.brand == "intel" then
		shroud, accent = Color3.fromRGB(44, 46, 52), Color3.fromRGB(0, 113, 197)
	elseif (p.year or 2016) >= 2020 and (p.perf or 0) >= 55 then
		shroud, accent = Color3.fromRGB(150, 152, 158), Color3.fromRGB(30, 30, 32) -- founders style
	else
		shroud, accent = Color3.fromRGB(38, 38, 42), Color3.fromRGB(118, 185, 0)
	end
	local pcb = Color3.fromRGB(20, 30, 24)
	-- PCB and edge fingers
	box(m, cf * CFrame.new(-L / 2, H * 0.47, 0), Vector3.new(L - cm(0.4), H * 0.92, cm(0.16)), pcb, M.SmoothPlastic, { Name = "PCB" })
	box(m, cf * CFrame.new(-cm(5.95), -cm(0.35), 0), Vector3.new(cm(8.9), cm(0.8), cm(0.12)), GOLD, M.Metal, { Name = "Fingers" })
	-- I/O bracket with display outputs
	local bracketW = cm((p.slots or 2) * 2)
	box(m, cf * CFrame.new(cm(0.35), H * 0.5, bracketW / 2 - cm(0.6)), Vector3.new(cm(0.1), H + cm(0.6), bracketW), STEEL, M.Metal, { Name = "Bracket" })
	box(m, cf * CFrame.new(cm(0.8), H + cm(0.3), bracketW / 2 - cm(0.6)), Vector3.new(cm(1), cm(0.1), bracketW), STEEL, M.Metal, { Name = "BracketTab" })
	for k = 0, 2 do
		box(m, cf * CFrame.new(cm(0.42), cm(1.8) + k * cm(2.2), cm(0.6)), Vector3.new(0.006, cm(1.1), cm(1.6)), Color3.fromRGB(20, 20, 22))
	end
	-- backplate
	box(m, cf * CFrame.new(-L / 2, H * 0.5, -cm(0.35)), Vector3.new(L - cm(0.8), H * 0.9, cm(0.25)), if p.workstation or (p.perf or 0) < 15 then pcb else Color3.fromRGB(30, 30, 34), M.Metal, { Name = "Backplate" })
	-- cooler shroud
	local body = box(m, cf * CFrame.new(-L / 2 - cm(0.2), H * 0.52, cm(0.3) + T / 2), Vector3.new(L - cm(0.6), H * 0.9, T - cm(0.3)), shroud, if p.passive then M.Metal else M.SmoothPlastic, { Name = "Shroud" })
	body:SetAttribute("Detail", "gpu")
	-- fin edges and heat pipes visible on the top edge
	local finCol = Color3.fromRGB(70, 72, 78)
	for k = 0, math.floor(L / cm(1.2)) - 2 do
		box(m, cf * CFrame.new(-cm(1.6) - k * cm(1.2), H * 0.97 + 0.002, cm(0.3) + T / 2), Vector3.new(0.005, 0.004, T * 0.8), finCol, M.Metal)
	end
	for k = 0, (if (p.tdp or 100) > 200 then 3 else 1) do
		cyl(m, cf * CFrame.new(-L * 0.5, H * 0.96, cm(0.8) + k * cm(0.7)), "X", L * 0.7, cm(0.6), Color3.fromRGB(196, 116, 70), M.Metal)
	end
	-- accent and logo on the top edge
	local strip = box(m, cf * CFrame.new(-L * 0.42, H * 0.97 + 0.003, cm(0.3) + T / 2), Vector3.new(L * 0.4, 0.004, T * 0.6), shroud:Lerp(Color3.new(0, 0, 0), 0.4), M.SmoothPlastic, { Name = "LogoStrip" })
	local brand = if p.workstation then "NVIDIA RTX" elseif p.brand == "amd" then "RADEON" elseif p.brand == "intel" then "INTEL ARC" else (if string.find(p.name or "", "RTX") then "GEFORCE RTX" else "GEFORCE GTX")
	label(strip, Enum.NormalId.Top, brand, accent, 300, B.Fonts.Heavy)
	if (p.perf or 0) >= 40 and not p.workstation then
		local glow = box(m, cf * CFrame.new(-L * 0.42, H * 0.97 + 0.001, cm(0.3) + T * 0.95), Vector3.new(L * 0.45, 0.004, 0.012), accent, M.Neon, { Name = "GpuRGB", Transparency = 0.4 })
		glow:SetAttribute("RGB", true)
	end
	-- fans on the +Z face
	local n = p.fans or 2
	if p.blower then
		local d = H * 0.62
		local c = cf * CFrame.new(-L + d / 2 + cm(1), H * 0.5, cm(0.3) + T + 0.003) * CFrame.Angles(math.pi / 2, 0, 0)
		cyl(m, c, "Y", 0.006, d * 1.04, Color3.fromRGB(10, 10, 12))
		rotor(m, c * CFrame.new(0, 0.004, 0), d, Color3.fromRGB(30, 30, 34), Color3.fromRGB(30, 30, 34), 13)
	elseif n > 0 then
		local span = L - cm(2.4)
		local d = math.min(H * 0.86, span / n * 0.94)
		for i = 1, n do
			local x = -cm(1.6) - span * (i - 0.5) / n
			local c = cf * CFrame.new(x, H * 0.52, cm(0.3) + T + 0.003) * CFrame.Angles(math.pi / 2, 0, 0)
			cyl(m, c, "Y", 0.006, d * 1.03, Color3.fromRGB(10, 10, 12))
			rotor(m, c * CFrame.new(0, 0.004, 0), d, Color3.fromRGB(24, 24, 28), accent, if (p.perf or 0) >= 40 then 11 else 9)
		end
	end
	dustLayer(m, cf * CFrame.new(-L / 2 - cm(0.2), H * 0.52, cm(0.3) + T + 0.01), Vector3.new(L - cm(0.6), H * 0.9, 0.01))
	-- power sockets on the top edge, 70 % along the card
	local frames = PCParts.gpuSockets(p, connectors)
	for i, kind in connectors do
		local wide = if kind == "12v" then cm(1.9) elseif kind == "6" then cm(1.4) else cm(1.8)
		box(m, cf * frames[i] * CFrame.new(0, -cm(0.3), 0), Vector3.new(wide, cm(0.6), cm(0.85)), Color3.fromRGB(16, 16, 18), M.SmoothPlastic, { Name = "PowerSocket" })
	end
	box(m, cf * CFrame.new(-L / 2, H / 2, T / 2), Vector3.new(L, H, T + cm(0.6)), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m, frames
end

----------------------------------------------------------------------------------------------------
-- Power supply. Origin: centre. Depth along X, width along Y, height along Z; fan on +Z,
-- label on +Y, modular sockets on -X (towards the case front).
----------------------------------------------------------------------------------------------------
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
	local shell = if q >= 0.8 then Color3.fromRGB(26, 26, 30) elseif q >= 0.5 then Color3.fromRGB(40, 40, 44) else Color3.fromRGB(150, 152, 156)
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
	-- label on top (+Y)
	local lab = box(m, cf * CFrame.new(0, d.Y / 2 + 0.002, 0), Vector3.new(d.X * 0.8, 0.004, d.Z * 0.75), if q >= 0.5 then Color3.fromRGB(20, 20, 22) else Color3.fromRGB(230, 230, 226), M.SmoothPlastic, { Name = "Label" })
	local name = psuPart and psuPart.name or "PSU"
	label(lab, Enum.NormalId.Top, (psuPart and psuPart.watt or 500) .. "W\n" .. name, if q >= 0.5 then Color3.fromRGB(230, 230, 230) else Color3.fromRGB(30, 30, 30), 240, B.Fonts.Heavy)
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
	if kind == "nvme" then
		box(m, cf * CFrame.new(0, cm(0.08), 0), Vector3.new(d.X, cm(0.16), d.Z), Color3.fromRGB(20, 60, 36), M.SmoothPlastic, { Name = "PCB" })
		box(m, cf * CFrame.new(d.X / 2 - cm(0.4), cm(0.08), 0), Vector3.new(cm(0.8), cm(0.18), d.Z * 0.9), GOLD, M.Metal)
		local stick = box(m, cf * CFrame.new(-cm(0.4), cm(0.24), 0), Vector3.new(d.X * 0.82, cm(0.16), d.Z * 0.92), Color3.fromRGB(24, 24, 26), M.SmoothPlastic, { Name = "Sticker" })
		label(stick, Enum.NormalId.Top, name, Color3.fromRGB(230, 230, 230), 420, B.Fonts.Bold)
		-- screw notch
		box(m, cf * CFrame.new(-d.X / 2 + cm(0.15), cm(0.08), 0), Vector3.new(cm(0.3), cm(0.17), cm(0.5)), Color3.fromRGB(196, 170, 90), M.Metal)
	elseif kind == "hdd35" then
		box(m, cf * CFrame.new(0, d.Y / 2, 0), d, Color3.fromRGB(176, 180, 186), M.Metal, { Name = "Body" })
		local lab = box(m, cf * CFrame.new(0, d.Y + 0.002, 0), Vector3.new(d.X * 0.7, 0.004, d.Z * 0.8), Color3.fromRGB(236, 236, 232), M.SmoothPlastic, { Name = "Label" })
		label(lab, Enum.NormalId.Top, name, Color3.fromRGB(30, 30, 30), 200, B.Fonts.Bold)
		box(m, cf * CFrame.new(0, -0.002, 0), Vector3.new(d.X * 0.8, 0.004, d.Z * 0.75), Color3.fromRGB(20, 70, 40))
		-- SATA connectors on the +X end
		box(m, cf * CFrame.new(d.X / 2 + 0.004, d.Y * 0.4, -d.Z * 0.15), Vector3.new(0.008, cm(0.8), cm(2.2)), Color3.fromRGB(20, 20, 22))
		box(m, cf * CFrame.new(d.X / 2 + 0.004, d.Y * 0.4, d.Z * 0.25), Vector3.new(0.008, cm(0.8), cm(1.2)), Color3.fromRGB(20, 20, 22))
	else
		local shell = if kind == "hdd25" then Color3.fromRGB(176, 180, 186) else Color3.fromRGB(34, 34, 38)
		box(m, cf * CFrame.new(0, d.Y / 2, 0), d, shell, M.Metal, { Name = "Body" })
		local lab = box(m, cf * CFrame.new(0, d.Y + 0.002, 0), Vector3.new(d.X * 0.85, 0.004, d.Z * 0.8), if kind == "hdd25" then Color3.fromRGB(236, 236, 232) else Color3.fromRGB(200, 40, 50), M.SmoothPlastic, { Name = "Label" })
		label(lab, Enum.NormalId.Top, name, if kind == "hdd25" then Color3.fromRGB(30, 30, 30) else Color3.fromRGB(255, 255, 255), 240, B.Fonts.Bold)
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
	local cell = cyl(m, cf * CFrame.new(0, cm(0.45), 0), "Y", cm(0.32), cm(2), Color3.fromRGB(200, 202, 208), M.Metal, { Name = "Cell" })
	label(cell, Enum.NormalId.Top, "CR2032", Color3.fromRGB(60, 60, 64), 500, B.Fonts.Bold)
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
	atx24 = { w = 0.14, t = 0.05, color = { 22, 22, 24 }, head = { 0.1, 0.09, 0.4 } },
	eps = { w = 0.08, t = 0.045, color = { 22, 22, 24 }, head = { 0.16, 0.08, 0.09 } },
	pcie = { w = 0.08, t = 0.045, color = { 22, 22, 24 }, head = { 0.14, 0.07, 0.07 } },
	sata_power = { w = 0.06, t = 0.02, color = { 20, 20, 22 }, head = { 0.16, 0.05, 0.05 } },
	sata_data = { w = 0.04, t = 0.012, color = { 200, 40, 40 }, head = { 0.09, 0.05, 0.05 } },
	fan = { w = 0.025, t = 0.02, color = { 24, 24, 26 }, head = { 0.075, 0.05, 0.035 } },
	ribbon = { w = 0.12, t = 0.006, color = { 196, 150, 70 }, head = { 0.14, 0.03, 0.06 } },
	thin = { w = 0.02, t = 0.012, color = { 30, 30, 32 }, head = { 0.05, 0.03, 0.04 } },
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
			box(m, look, Vector3.new(st.w, st.t, len + st.w * 0.6), c, M.Fabric, { CastShadow = false })
		end
	end
	if headCf then
		local h = st.head
		box(m, headCf * CFrame.new(0, h[2] / 2, 0), Vector3.new(h[1], h[2], h[3]), Color3.fromRGB(30, 30, 32), M.SmoothPlastic, { Name = "Head" })
		box(m, headCf * CFrame.new(0, h[2] / 2, 0), Vector3.new(math.max(h[1], 0.16), math.max(h[2], 0.1), math.max(h[3], 0.16)), DARK, M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	end
	return m
end

return PCParts
