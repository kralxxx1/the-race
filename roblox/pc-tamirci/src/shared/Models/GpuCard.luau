-- GpuCard: graphics cards drawn the way the real ones look. NVIDIA's Founders Edition, AMD's and
-- Intel's reference cards and every board partner's cooler (Parts.GpuPartners → part.design) have
-- their own shroud, trim, fans, lighting, top-edge logo and backplate; underneath they share the
-- real anatomy: board with gold PCIe fingers, aluminium fin stack and heat pipes, the steel I/O
-- bracket with its DisplayPort/HDMI outputs and the power sockets on the top edge.
-- Frame (as PCParts.gpuDims/gpuSockets): origin at the bracket end of the PCIe fingers, the card
-- runs to -X, stands up +Y, fans on +Z, backplate on -Z.

local B = require(script.Parent.Parent.Util.Builder)
local PCParts = require(script.Parent.PCParts)

local GpuCard = {}
local M = Enum.Material
local cm = PCParts.cm
local box, cyl = PCParts.box, PCParts.cyl

local function c(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

local GOLD = c(214, 176, 72)
local STEEL = c(176, 180, 186)
local NICKEL = c(198, 200, 204)
local COPPER = c(196, 118, 74)
local WHITE = c(236, 238, 240)
local RED = c(214, 30, 40)
local GEFORCE_GREEN = c(118, 185, 0)

-- Text on the top edge reads from the far end towards the bracket with its top towards the
-- backplate: upright when the card sits in the case (the side you see through the window).
local TOP_TEXT = CFrame.fromMatrix(Vector3.zero, Vector3.new(-1, 0, 0), Vector3.new(0, 0, -1))

----------------------------------------------------------------------------------------------------
-- Designs. shroud/trim/ring/blade/hub/fin/back: colours; cover: how much of the fin stack the
-- shroud hides on the top edge (0..1); fan: "plain" | "barrier" (blade tips joined by a ring) |
-- "torx" (pairs of blades joined); top/topSub: logo and chip branding on the top edge; deco: the
-- design's own panels and lights.
----------------------------------------------------------------------------------------------------
type Design = { [string]: any }

local function chipBrand(p): string
	if p.brand == "amd" then
		return "RADEON"
	elseif p.brand == "intel" then
		return "INTEL ARC"
	elseif string.find(p.name or "", "RTX", 1, true) then
		return "GEFORCE RTX"
	end
	return "GEFORCE GTX"
end

local DESIGNS: { [string]: Design } = {}

-- NVIDIA Founders Edition, RTX 30/40/50: a metal frame around black fins, flow-through fans
DESIGNS.fe = {
	shroud = c(24, 24, 27),
	shroudMat = M.Metal,
	ring = c(30, 30, 33),
	blade = c(22, 22, 25),
	hub = c(28, 28, 31),
	fin = c(34, 34, 38),
	pipes = c(40, 40, 44),
	back = c(150, 152, 156),
	backMat = M.Metal,
	cover = 1,
	blades = 7,
	topGlow = WHITE,
}
-- RTX 20 Founders Edition: brushed silver vapour-chamber cover, two fans, black centre band
DESIGNS.fe20 = {
	shroud = c(178, 180, 184),
	shroudMat = M.Metal,
	ring = c(150, 152, 156),
	blade = c(24, 24, 27),
	hub = c(30, 30, 33),
	fin = c(120, 124, 130),
	back = c(176, 178, 182),
	backMat = M.Metal,
	cover = 1,
	blades = 13,
	topGlow = GEFORCE_GREEN,
}
-- GTX 10 Founders Edition: faceted aluminium blower
DESIGNS.fe10 = {
	shroud = c(170, 172, 176),
	shroudMat = M.Metal,
	blade = c(30, 30, 33),
	hub = c(30, 30, 33),
	fin = c(120, 124, 130),
	back = c(40, 40, 44),
	backMat = M.Metal,
	cover = 1,
	blower = true,
	topGlow = GEFORCE_GREEN,
}
-- Generic NVIDIA card (the chip's base listing when NVIDIA made no card of its own)
DESIGNS.ref = {
	shroud = c(30, 30, 33),
	trim = c(86, 88, 94),
	ring = c(22, 22, 24),
	blade = c(26, 26, 29),
	hub = c(30, 30, 33),
	back = c(32, 32, 36),
	cover = 0.45,
	topColor = WHITE,
	stripes = 1,
}
-- AMD reference ("Made by AMD")
DESIGNS.amdref = {
	shroud = c(26, 26, 29),
	trim = c(70, 72, 78),
	trimMat = M.Metal,
	ring = c(36, 36, 40),
	blade = c(24, 24, 27),
	hub = c(30, 30, 33),
	hubText = "RADEON",
	hubTextColor = RED,
	back = c(30, 30, 34),
	backMat = M.Metal,
	backText = "RADEON",
	backColor = RED,
	cover = 0.7,
	topColor = WHITE,
	endRoom = cm(2.2),
}
-- Intel Arc Limited Edition: matte black, a light bar at the end
DESIGNS.arcref = {
	shroud = c(20, 20, 22),
	ring = c(26, 26, 28),
	blade = c(24, 24, 26),
	hub = c(22, 22, 24),
	back = c(22, 22, 24),
	backMat = M.Metal,
	backText = "INTEL ARC",
	cover = 0.8,
	topColor = WHITE,
	endRoom = cm(1.4),
}
-- NVIDIA workstation cards (Quadro / RTX A): black blower with a gold line
DESIGNS.pro = {
	shroud = c(22, 22, 24),
	shroudMat = M.Metal,
	trim = c(196, 160, 60),
	trimMat = M.Metal,
	blade = c(30, 30, 33),
	hub = c(30, 30, 33),
	back = c(26, 26, 28),
	backMat = M.Metal,
	cover = 1,
	blower = true,
	topText = "NVIDIA",
	topColor = c(196, 160, 60),
}
-- Passive low-power card: bare black heatsink
DESIGNS.passive = {
	shroud = c(28, 28, 30),
	back = c(28, 70, 40),
	cover = 0,
	passive = true,
	topColor = WHITE,
}

-- Board partners
DESIGNS.strix = {
	shroud = c(22, 22, 26),
	trim = c(92, 94, 100),
	trimMat = M.Metal,
	ring = c(40, 40, 44),
	blade = c(20, 20, 23),
	hub = c(26, 26, 30),
	fan = "barrier",
	blades = 11,
	hubText = "ROG",
	hubTextColor = c(230, 30, 50),
	fin = c(70, 72, 78),
	back = c(26, 26, 30),
	backMat = M.Metal,
	backText = "ROG STRIX",
	backVent = true,
	cover = 0.55,
	top = "ROG STRIX",
	topGlow = WHITE,
	topRgb = true,
	frontText = "ROG STRIX",
	endRoom = cm(2.0),
	fanMax = 0.76,
}
DESIGNS.tuf = {
	shroud = c(64, 66, 70),
	shroudMat = M.Metal,
	trim = c(24, 24, 26),
	ring = c(26, 26, 28),
	blade = c(22, 22, 24),
	hub = c(30, 30, 32),
	fan = "barrier",
	blades = 11,
	hubText = "TUF",
	hubTextColor = c(236, 184, 30),
	back = c(28, 28, 30),
	backMat = M.Metal,
	backText = "TUF GAMING",
	backVent = true,
	cover = 0.6,
	top = "TUF GAMING",
	topColor = WHITE,
	frontText = "TUF GAMING",
	bolts = true,
}
DESIGNS.dual = {
	shroud = c(44, 46, 50),
	trim = c(170, 174, 180),
	ring = c(30, 30, 33),
	blade = c(26, 26, 29),
	hub = c(36, 36, 40),
	fan = "barrier",
	blades = 11,
	hubText = "ASUS",
	back = c(30, 30, 33),
	backText = "ASUS",
	cover = 0.5,
	top = "DUAL",
	topColor = WHITE,
	stripes = 2,
}
DESIGNS.trio = {
	shroud = c(20, 20, 22),
	trim = c(72, 74, 80),
	trimMat = M.Metal,
	ring = c(28, 28, 30),
	blade = c(22, 22, 24),
	hub = c(26, 26, 28),
	fan = "torx",
	blades = 10,
	hubText = "msi",
	hubTextColor = WHITE,
	back = c(34, 34, 38),
	backMat = M.Metal,
	backText = "msi",
	backColor = c(230, 40, 40),
	backVent = true,
	cover = 0.5,
	top = "GAMING X TRIO",
	topGlow = WHITE,
	topRgb = true,
	wings = true,
}
DESIGNS.ventus = {
	shroud = c(50, 52, 56),
	trim = c(28, 28, 30),
	ring = c(28, 28, 30),
	blade = c(26, 26, 28),
	hub = c(30, 30, 32),
	fan = "torx",
	blades = 9,
	hubText = "msi",
	back = c(30, 30, 33),
	backText = "msi",
	cover = 0.45,
	top = "VENTUS",
	topColor = WHITE,
	stripes = 3,
}
DESIGNS.aorus = {
	shroud = c(18, 18, 20),
	trim = c(170, 174, 180),
	trimMat = M.Metal,
	ring = c(255, 255, 255),
	ringGlow = true,
	blade = c(22, 22, 24),
	hub = c(26, 26, 28),
	blades = 11,
	hubText = "AORUS",
	hubTextColor = c(255, 140, 30),
	back = c(54, 56, 60),
	backMat = M.Metal,
	backText = "AORUS",
	backVent = true,
	cover = 0.6,
	top = "AORUS",
	topGlow = WHITE,
	lcd = true,
}
DESIGNS.eagle = {
	shroud = c(40, 42, 46),
	trim = c(96, 116, 138),
	ring = c(30, 30, 32),
	blade = c(26, 26, 28),
	hub = c(30, 30, 32),
	blades = 11,
	hubText = "GIGABYTE",
	back = c(30, 30, 33),
	backText = "GIGABYTE",
	cover = 0.45,
	top = "GIGABYTE",
	topGlow = WHITE,
	stripes = 2,
}
DESIGNS.twinedge = {
	shroud = c(24, 24, 26),
	trim = c(76, 78, 82),
	ring = c(30, 30, 32),
	blade = c(24, 24, 26),
	hub = c(28, 28, 30),
	blades = 11,
	hubText = "ZOTAC",
	hubTextColor = c(255, 200, 0),
	back = c(28, 28, 30),
	backText = "ZOTAC GAMING",
	cover = 0.5,
	top = "ZOTAC GAMING",
	topColor = WHITE,
	edges = true,
}
DESIGNS.amp = {
	shroud = c(46, 48, 52),
	trim = c(166, 170, 176),
	trimMat = M.Metal,
	ring = c(30, 30, 32),
	blade = c(24, 24, 26),
	hub = c(28, 28, 30),
	blades = 11,
	hubText = "ZOTAC",
	hubTextColor = c(255, 200, 0),
	back = c(30, 30, 33),
	backMat = M.Metal,
	backText = "ZOTAC GAMING",
	backVent = true,
	cover = 0.55,
	top = "AMP",
	topGlow = WHITE,
	topRgb = true,
	edges = true,
}
DESIGNS.gamingpro = {
	shroud = c(22, 22, 24),
	trim = c(132, 136, 142),
	trimMat = M.Metal,
	ring = c(28, 28, 30),
	blade = c(24, 24, 26),
	hub = c(28, 28, 30),
	blades = 11,
	hubText = "PALIT",
	back = c(28, 28, 30),
	backText = "GAMINGPRO",
	cover = 0.5,
	top = "PALIT",
	topColor = WHITE,
	topRgb = true,
	frontRgb = true,
}
DESIGNS.nitro = {
	shroud = c(26, 26, 28),
	trim = c(178, 182, 188),
	trimMat = M.Metal,
	ring = c(34, 34, 36),
	blade = c(24, 24, 26),
	hub = c(30, 30, 32),
	blades = 9,
	hubText = "SAPPHIRE",
	hubTextColor = c(70, 140, 230),
	back = c(140, 144, 150),
	backMat = M.Metal,
	backText = "NITRO+",
	backColor = c(30, 30, 34),
	backVent = true,
	cover = 0.6,
	top = "NITRO+",
	topGlow = WHITE,
	topRgb = true,
	frontText = "SAPPHIRE",
	endRoom = cm(1.4),
	fanMax = 0.74,
}
DESIGNS.pulse = {
	shroud = c(24, 24, 26),
	trim = c(196, 30, 40),
	ring = c(28, 28, 30),
	blade = c(24, 24, 26),
	hub = c(28, 28, 30),
	blades = 9,
	hubText = "SAPPHIRE",
	back = c(28, 28, 30),
	backText = "PULSE",
	backColor = c(214, 40, 48),
	cover = 0.5,
	top = "PULSE",
	topColor = c(220, 40, 48),
	stripes = 2,
}
DESIGNS.reddevil = {
	shroud = c(20, 20, 22),
	trim = c(62, 62, 66),
	trimMat = M.Metal,
	ring = c(26, 26, 28),
	blade = c(22, 22, 24),
	hub = c(26, 26, 28),
	blades = 9,
	hubText = "POWERCOLOR",
	hubTextColor = RED,
	back = c(26, 26, 28),
	backMat = M.Metal,
	backText = "RED DEVIL",
	backColor = RED,
	backVent = true,
	cover = 0.6,
	top = "RED DEVIL",
	topGlow = c(255, 40, 40),
	redLines = true,
}
DESIGNS.hellhound = {
	shroud = c(22, 22, 24),
	trim = c(54, 56, 60),
	ring = c(26, 26, 28),
	blade = c(30, 34, 44),
	hub = c(26, 26, 28),
	hubGlow = c(90, 170, 255),
	blades = 9,
	back = c(26, 26, 28),
	backText = "HELLHOUND",
	cover = 0.55,
	top = "HELLHOUND",
	topColor = WHITE,
	stripes = 2,
}
DESIGNS.merc = {
	shroud = c(80, 82, 88),
	shroudMat = M.Metal,
	trim = c(84, 86, 92),
	trimMat = M.Metal,
	ring = c(28, 28, 30),
	blade = c(24, 24, 26),
	hub = c(28, 28, 30),
	blades = 9,
	hubText = "XFX",
	back = c(26, 26, 28),
	backMat = M.Metal,
	backText = "XFX",
	backVent = true,
	cover = 0.6,
	top = "SPEEDSTER MERC",
	topGlow = WHITE,
	plate = true,
}
DESIGNS.challenger = {
	shroud = c(50, 52, 56),
	trim = c(124, 128, 134),
	ring = c(30, 30, 32),
	blade = c(26, 26, 28),
	hub = c(30, 30, 32),
	blades = 11,
	hubText = "ASRock",
	back = c(28, 28, 30),
	backText = "ASRock",
	cover = 0.5,
	top = "CHALLENGER",
	topColor = WHITE,
	stripes = 3,
}
DESIGNS.titan = {
	shroud = c(20, 20, 22),
	trim = c(40, 110, 220),
	ring = c(28, 28, 30),
	blade = c(24, 24, 26),
	hub = c(28, 28, 30),
	blades = 11,
	hubText = "SPARKLE",
	back = c(26, 26, 28),
	backText = "SPARKLE",
	cover = 0.55,
	top = "TITAN",
	topColor = WHITE,
	stripes = 2,
}
GpuCard.Designs = DESIGNS

function GpuCard.designOf(p): string
	if p.design and DESIGNS[p.design] then
		return p.design
	elseif p.workstation then
		return "pro"
	elseif p.passive or (p.fans or 1) == 0 then
		return "passive"
	elseif p.brand == "amd" then
		return "amdref"
	elseif p.brand == "intel" then
		return "arcref"
	end
	return "ref"
end

----------------------------------------------------------------------------------------------------
-- Building blocks
----------------------------------------------------------------------------------------------------
-- A clear carrier part with text on one face (picks pass through it).
local function sticker(m: Instance, cf: CFrame, w: number, h: number, face: Enum.NormalId, text: string, color: Color3, glow: boolean?)
	local p = box(m, cf, Vector3.new(w, h, 0.002), color, M.SmoothPlastic, { Name = "Text", Transparency = 1, CastShadow = false, CanQuery = false })
	B.sign(p, face, text, { color = color, pixelsPerStud = 500, font = B.Fonts.Heavy, glow = glow, brightness = 3, padding = 0.02 })
	return p
end

local function glowing(part: BasePart, rgbCycle: boolean?)
	part.Material = M.Neon
	part.CastShadow = false
	if rgbCycle ~= false then
		part:SetAttribute("RGB", true)
	end
end

-- Fan rotor: swept two-part blades round a hub with the maker's sticker. base: the rotor's centre,
-- local +Y out of the card.
local function rotor(ctx, base: CFrame, dia: number): Model
	local d = ctx.d
	local r = PCParts.newModel("Rotor", base)
	r:SetAttribute("SpinAxis", "Y")
	local n = d.blades or 9
	local blade = d.blade or c(24, 24, 26)
	local thick = math.max(0.004, dia * 0.012)
	local sweep = math.rad(14)
	for i = 1, n do
		local a = (i / n) * math.pi * 2
		box(r, base * CFrame.Angles(0, a, 0) * CFrame.new(dia * 0.245, 0, 0) * CFrame.Angles(math.rad(28), 0, 0), Vector3.new(dia * 0.17, thick, dia * 0.15), blade, M.SmoothPlastic)
		box(r, base * CFrame.Angles(0, a + sweep, 0) * CFrame.new(dia * 0.39, 0, 0) * CFrame.Angles(math.rad(20), 0, 0), Vector3.new(dia * 0.19, thick, dia * 0.23), blade, M.SmoothPlastic)
	end
	local style = d.fan or "plain"
	if style == "barrier" then
		-- the ring joining the blade tips (ASUS Axial-tech)
		local k = 12
		for i = 1, k do
			local a = (i / k) * math.pi * 2
			box(r, base * CFrame.Angles(0, a, 0) * CFrame.new(dia * 0.487, 0, 0), Vector3.new(dia * 0.012, dia * 0.04, dia * 0.262), blade, M.SmoothPlastic)
		end
	elseif style == "torx" then
		-- every second pair of blades joined at the tips (MSI TORX)
		for i = 1, n, 2 do
			local a = ((i + 0.5) / n) * math.pi * 2 + sweep
			box(r, base * CFrame.Angles(0, a, 0) * CFrame.new(dia * 0.478, 0, 0), Vector3.new(dia * 0.014, dia * 0.03, dia * 0.3), blade, M.SmoothPlastic)
		end
	end
	cyl(r, base * CFrame.new(0, dia * 0.01, 0), "Y", dia * 0.05, dia * 0.33, d.hub or blade, M.SmoothPlastic, { Name = "Hub" })
	if d.hubGlow then
		-- a lit ring round the hub (only its rim shows)
		glowing(cyl(r, base * CFrame.new(0, -dia * 0.002, 0), "Y", dia * 0.03, dia * 0.39, d.hubGlow, M.Neon, { Name = "HubLight" }), false)
	end
	if d.hubText then
		local w = dia * 0.22
		local s = sticker(r, base * CFrame.new(0, dia * 0.036, 0) * CFrame.Angles(-math.pi / 2, 0, 0), w, w * 0.4, Enum.NormalId.Back, d.hubText, d.hubTextColor or WHITE)
		s.Name = "HubText"
	end
	r.Parent = ctx.m
	return r
end

-- Fan openings along the front face, evenly over the shroud (leaving the design's end room free).
local function fanRow(ctx, n: number): { { x: number, y: number, d: number } }
	local span = ctx.len - cm(1.2) - (ctx.d.endRoom or 0)
	local dd = math.min(ctx.hh * (ctx.d.fanMax or 0.8), span / n * 0.95)
	local out = {}
	for i = 1, n do
		table.insert(out, { x = ctx.x0 - cm(0.6) - span * (i - 0.5) / n, y = ctx.my, d = dd })
	end
	return out
end

-- A plate in the card's XY plane, x from xa down to xb, y from ya to yb, z from za to zb, with round
-- openings on one line: square holes with their corners filled and a lip ring so they read round.
local WEDGE_IN_PLANE = CFrame.fromMatrix(Vector3.zero, Vector3.new(0, 0, 1), Vector3.new(0, 1, 0))
local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
local function holedPlate(ctx, xa: number, xb: number, ya: number, yb: number, za: number, zb: number, holes, color: Color3, mat: Enum.Material?, lip: Color3?, lipGlow: boolean?, name: string?): { BasePart }
	local m, cf = ctx.m, ctx.cf
	local zc, dz = (za + zb) / 2, zb - za
	local out = {}
	local function piece(hi: number, lo: number, y1: number, y2: number)
		if hi - lo > 0.002 and y2 - y1 > 0.002 then
			table.insert(out, box(m, cf * CFrame.new((hi + lo) / 2, (y1 + y2) / 2, zc), Vector3.new(hi - lo, y2 - y1, dz), color, mat, { Name = name or "Plate" }))
		end
	end
	if #holes == 0 then
		piece(xa, xb, ya, yb)
		return out
	end
	local hy, D = holes[1].y, holes[1].d
	local top, bot = hy + D / 2, hy - D / 2
	piece(xa, xb, top, yb)
	piece(xa, xb, ya, bot)
	local prev = xa
	for _, h in holes do
		piece(prev, h.x + D / 2, bot, top)
		prev = h.x - D / 2
	end
	piece(prev, xb, bot, top)
	local cc = D * 0.293
	local n = 16
	local rl = D * 0.52
	for _, h in holes do
		for k, s in CORNERS do
			B.wedge(m, cf * CFrame.new(h.x + s[1] * (D / 2 - cc / 2), hy + s[2] * (D / 2 - cc / 2), zc) * CFrame.Angles(0, 0, (k - 1) * math.pi / 2) * WEDGE_IN_PLANE, Vector3.new(dz, cc, cc), color, mat or M.SmoothPlastic, { CanCollide = false, CanTouch = false })
		end
		for i = 1, n do
			local a = (i / n) * math.pi * 2
			local seg = box(m, cf * CFrame.new(h.x, hy, zc + cm(0.03)) * CFrame.Angles(0, 0, a) * CFrame.new(rl, 0, 0), Vector3.new(D * 0.05, 2 * math.pi * rl / n * 1.08, dz), lip or color, mat, { Name = "FanRing" })
			if lipGlow then
				glowing(seg)
			end
		end
	end
	return out
end

-- The fins seen through an opening (vertical fin edges on the face of the stack at depth z).
local function finFace(ctx, h, z: number, color: Color3)
	local D = h.d
	local count = math.max(4, math.floor(D * 0.9 / cm(0.9)))
	for i = 0, count - 1 do
		local x = h.x - D * 0.45 + (i + 0.5) * (D * 0.9 / count)
		local half = math.sqrt(math.max(0, (D * 0.49) ^ 2 - (x - h.x) ^ 2))
		box(ctx.m, ctx.cf * CFrame.new(x, h.y, z), Vector3.new(cm(0.1), half * 2, 0.0016), color, M.SmoothPlastic)
	end
end

-- A panel on the front face: centre (x, y), size w x h, standing `depth` proud, turned `rot` in
-- the face plane.
local function panel(ctx, x: number, y: number, w: number, h: number, color: Color3, mat: Enum.Material?, depth: number?, rot: number?): BasePart
	local dz = depth or cm(0.1)
	return box(ctx.m, ctx.cf * CFrame.new(x, y, ctx.zf + dz / 2) * CFrame.Angles(0, 0, rot or 0), Vector3.new(w, h, dz), color, mat or M.SmoothPlastic)
end

-- Text on the front face (reads towards the bracket, top edge up).
local function frontText(ctx, x: number, y: number, w: number, h: number, text: string, color: Color3, glow: boolean?)
	return sticker(ctx.m, ctx.cf * CFrame.new(x, y, ctx.zf + cm(0.14)), w, h, Enum.NormalId.Back, text, color, glow)
end

-- Text on the top edge, centred at x along the card, across the shroud's top.
local function topText(ctx, x: number, w: number, text: string, color: Color3, glow: boolean?)
	local za = ctx.zp - ctx.coverD
	local h = math.min((ctx.zf - za) * 0.55, cm(1.4))
	return sticker(ctx.m, ctx.cf * CFrame.new(x, ctx.H + 0.002, (za + ctx.zf) / 2) * TOP_TEXT, w, h, Enum.NormalId.Front, text, color, glow)
end

----------------------------------------------------------------------------------------------------
-- Per-design dressing of the front face. The fans fill the middle; the trims, stripes, lights and
-- lettering sit on the bands above and below them and in the room at the ends.
----------------------------------------------------------------------------------------------------
local function decorate(ctx)
	local d, p = ctx.d, ctx.p
	local H, y0, hh, my = ctx.H, ctx.y0, ctx.hh, ctx.my
	local x0, x1, len = ctx.x0, ctx.x1, ctx.len
	local name = ctx.name
	local fans = ctx.fans
	local D = fans[1].d
	local topY, topH = (my + D / 2 + H) / 2, H - (my + D / 2)
	local botY, botH = (y0 + my - D / 2) / 2, (my - D / 2) - y0
	local nearEnd = fans[1].x + D / 2 -- the bracket-side edge of the first opening
	local farEnd = fans[#fans].x - D / 2 -- the far edge of the last opening
	local endGap = farEnd - x1 -- room between the last opening and the far end
	local mids = {}
	for i = 1, #fans - 1 do
		table.insert(mids, (fans[i].x + fans[i + 1].x) / 2)
	end
	local function bands(height: number, color: Color3, mat: Enum.Material?, depth: number?)
		panel(ctx, ctx.mx, H - height / 2, len, height, color, mat, depth or cm(0.12))
		panel(ctx, ctx.mx, y0 + height / 2, len, height, color, mat, depth or cm(0.12))
	end
	local function light(part: BasePart, cycle: boolean?)
		part.Name = "GpuRGB"
		glowing(part, cycle)
		return part
	end

	if name == "fe" then
		-- frame rails and end caps; the fins of the open part come right up to the front
		local frame = ctx.frame
		panel(ctx, ctx.mx, H - cm(0.55), len, cm(1.1), frame, M.Metal, cm(0.2))
		panel(ctx, ctx.mx, y0 + cm(0.55), len, cm(1.1), frame, M.Metal, cm(0.2))
		panel(ctx, x1 + cm(0.6), my, cm(1.2), hh, frame, M.Metal, cm(0.2))
		panel(ctx, x0 - cm(0.4), my, cm(0.8), hh, frame, M.Metal, cm(0.2))
	elseif name == "fe20" then
		-- the black band through the middle, showing beside and between the fans
		local spots = { { x0, nearEnd } }
		for i = 1, #fans - 1 do
			table.insert(spots, { fans[i].x - D / 2, fans[i + 1].x + D / 2 })
		end
		table.insert(spots, { farEnd, x1 })
		for _, s in spots do
			if s[1] - s[2] > cm(0.2) then
				panel(ctx, (s[1] + s[2]) / 2, my, s[1] - s[2], hh * 0.24, c(20, 20, 22), M.Glass, cm(0.06))
			end
		end
	elseif name == "fe10" then
		-- faceted black panels and the window over the fins
		panel(ctx, x0 - len * 0.3, my, len * 0.3, hh * 0.46, c(26, 26, 28), M.Metal, cm(0.2), math.rad(-10))
		panel(ctx, x0 - len * 0.3, my, len * 0.18, hh * 0.28, c(60, 64, 70), M.Glass, cm(0.26))
		panel(ctx, x0 - len * 0.56, H - hh * 0.16, len * 0.22, hh * 0.16, c(26, 26, 28), M.Metal, cm(0.2), math.rad(16))
		panel(ctx, x0 - len * 0.56, y0 + hh * 0.16, len * 0.22, hh * 0.16, c(26, 26, 28), M.Metal, cm(0.2), math.rad(-16))
	elseif name == "pro" then
		panel(ctx, ctx.mx, H - cm(0.5), len, cm(0.25), d.trim, d.trimMat, cm(0.06))
		frontText(ctx, x0 - len * 0.3, my, len * 0.34, hh * 0.18, "NVIDIA " .. string.upper((string.gsub(p.name or "", "%s*%d+GB$", ""))), c(200, 200, 204))
	elseif name == "amdref" then
		bands(math.min(topH * 0.6, cm(0.8)), d.trim, d.trimMat)
		-- the three red lines at the far end (RDNA reference)
		for k = 0, 2 do
			panel(ctx, x1 + cm(0.7) + k * cm(0.5), my, cm(0.17), hh * 0.8, RED, M.SmoothPlastic, cm(0.14)).Name = "RedLine"
		end
	elseif name == "arcref" then
		light(panel(ctx, x1 + cm(0.7), my, cm(0.4), hh * 0.86, c(120, 80, 255), M.Neon, cm(0.14)))
	elseif name == "strix" then
		bands(math.min(topH * 0.45, cm(0.6)), d.trim, d.trimMat)
		-- angled metal wings at the band ends and the RGB slash in the end room
		for _, e in { { x0 - cm(1.2), -1 }, { x1 + cm(1.2), 1 } } do
			panel(ctx, e[1], topY, cm(2.2), topH * 0.8, d.trim, d.trimMat, cm(0.2), e[2] * math.rad(28))
			panel(ctx, e[1], botY, cm(2.2), botH * 0.8, d.trim, d.trimMat, cm(0.2), -e[2] * math.rad(28))
		end
		light(panel(ctx, x1 + endGap * 0.5, my, cm(0.32), math.min(hh * 0.62, endGap * 2.2), c(255, 60, 120), M.Neon, cm(0.18), math.rad(24)))
		light(panel(ctx, ctx.mx, topY + topH * 0.25, len * 0.45, cm(0.12), c(255, 60, 120), M.Neon, cm(0.18)))
	elseif name == "tuf" then
		bands(topH * 0.5, d.trim, M.SmoothPlastic)
		for _, pos in { { x0 - cm(1.0), topY }, { x0 - cm(1.0), botY }, { x1 + cm(1.0), topY }, { x1 + cm(1.0), botY }, { ctx.mx, topY }, { ctx.mx, botY } } do
			cyl(ctx.m, ctx.cf * CFrame.new(pos[1], pos[2], ctx.zf + cm(0.2)) * CFrame.Angles(math.pi / 2, 0, 0), "Y", cm(0.14), cm(0.45), c(150, 152, 156), M.Metal)
		end
	elseif name == "trio" then
		-- gunmetal wings in the bands between the fans and the light strip along the top
		for _, xm in mids do
			panel(ctx, xm, topY, cm(2.6), topH * 0.85, d.trim, d.trimMat, cm(0.16), math.rad(30))
			panel(ctx, xm, botY, cm(2.6), botH * 0.85, d.trim, d.trimMat, cm(0.16), math.rad(-30))
		end
		light(panel(ctx, ctx.mx, H - cm(0.3), len * 0.86, cm(0.16), c(255, 80, 60), M.Neon, cm(0.14)))
	elseif name == "aorus" then
		bands(math.min(topH * 0.35, cm(0.45)), d.trim, d.trimMat)
		for _, e in { { x0 - cm(1.0), -1 }, { x1 + cm(1.0), 1 } } do
			panel(ctx, e[1], topY, cm(1.8), topH * 0.8, d.trim, d.trimMat, cm(0.2), e[2] * math.rad(22))
			panel(ctx, e[1], botY, cm(1.8), botH * 0.8, d.trim, d.trimMat, cm(0.2), -e[2] * math.rad(22))
		end
	elseif name == "nitro" then
		-- brushed aluminium bands and the light bar across the far end
		bands(topH * 0.9, d.trim, d.trimMat, cm(0.16))
		light(panel(ctx, x1 + math.max(cm(0.5), endGap * 0.5), my, cm(0.4), hh * 0.62, c(80, 160, 255), M.Neon, cm(0.18)))
	elseif name == "reddevil" then
		bands(topH * 0.7, d.trim, d.trimMat)
		light(panel(ctx, ctx.mx, topY, len * 0.7, cm(0.12), c(255, 30, 30), M.Neon, cm(0.18)), false)
		light(panel(ctx, ctx.mx, botY, len * 0.7, cm(0.12), c(255, 30, 30), M.Neon, cm(0.18)), false)
	elseif name == "merc" then
		bands(topH * 0.8, c(22, 22, 24), M.SmoothPlastic, cm(0.14))
		panel(ctx, ctx.mx, y0 + cm(0.3), len, cm(0.35), c(184, 188, 194), M.Metal, cm(0.18))
	elseif name == "amp" or name == "twinedge" then
		for _, e in { { x0 - cm(1.2), topY }, { x1 + cm(1.2), botY } } do
			panel(ctx, e[1], e[2], cm(2.6), cm(0.5), d.trim, d.trimMat, cm(0.16), math.rad(-25))
		end
		if name == "amp" then
			light(panel(ctx, ctx.mx, topY, len * 0.5, cm(0.16), c(255, 160, 40), M.Neon, cm(0.17)))
		end
	elseif name == "gamingpro" then
		bands(topH * 0.4, d.trim, d.trimMat)
		light(panel(ctx, ctx.mx, topY + topH * 0.2, len * 0.9, cm(0.14), WHITE, M.Neon, cm(0.17)))
	end
	if d.stripes then
		-- short angled stripes in the bands, beside the fans and between them
		local spots = table.clone(mids)
		table.insert(spots, (x0 + nearEnd) / 2 - cm(0.6))
		table.insert(spots, (farEnd + x1) / 2 + cm(0.6))
		for _, x in spots do
			for k = 1, d.stripes do
				local off = (k - (d.stripes + 1) / 2) * cm(0.45)
				panel(ctx, x + off, topY, cm(0.16), topH * 0.8, d.trim, d.trimMat, cm(0.12), math.rad(25))
				panel(ctx, x + off, botY, cm(0.16), botH * 0.8, d.trim, d.trimMat, cm(0.12), math.rad(25))
			end
		end
	end
	if d.frontText then
		frontText(ctx, x0 - len * 0.2, botY, math.min(len * 0.22, cm(6)), botH * 0.62, d.frontText, WHITE)
	end
end

----------------------------------------------------------------------------------------------------
-- The card
----------------------------------------------------------------------------------------------------
function GpuCard.build(cf: CFrame, gpuPart, connectors: { string }): (Model, { CFrame })
	local p = gpuPart or {}
	local m = PCParts.newModel("GPU", cf)
	local L, H, T = PCParts.gpuDims(p)
	local name = GpuCard.designOf(p)
	local d = DESIGNS[name]
	local year = p.year or 2018
	local tdp = p.tdp or 150
	local fe = name == "fe"

	local ctx: { [string]: any } = { m = m, cf = cf, p = p, d = d, name = name, L = L, H = H, T = T }
	local x0, x1 = -cm(0.15), -L + cm(0.05)
	local len, mx = x0 - x1, (x0 + x1) / 2
	local y0 = cm(1.1)
	local hh, my = H - y0, (H + y0) / 2
	local zb, zf = cm(0.45), T + cm(0.15)
	local pd = if d.passive then 0 else math.min(cm(1.3), (zf - zb) * 0.45)
	local zp = zf - pd
	ctx.x0, ctx.x1, ctx.len, ctx.mx, ctx.y0, ctx.hh, ctx.my = x0, x1, len, mx, y0, hh, my
	ctx.zb, ctx.zf, ctx.pd, ctx.zp = zb, zf, pd, zp
	ctx.coverD = if (d.cover or 0.5) >= 1 then zp - zb else math.max(cm(0.6), (zp - zb) * (d.cover or 0.5))
	local coverD = ctx.coverD
	if fe then
		-- RTX 30: dark gunmetal, RTX 40: silver, RTX 50: dark again
		ctx.frame = if year >= 2025 then c(64, 66, 70) elseif year >= 2022 then c(160, 162, 166) else c(66, 68, 72)
	end
	local side = ctx.frame or d.side or d.shroud
	local sideMat = if fe then M.Metal else (d.shroudMat or M.SmoothPlastic)

	-- where the fans go (the plates are cut round them)
	local fans = {}
	local feDia = math.min(hh * 0.8, len * 0.36)
	if d.passive then
		fans = {}
	elseif d.blower or (p.blower and not fe and name ~= "fe20") then
		local dia = math.min(hh * 0.62, cm(6.5))
		fans = { { x = x1 + dia / 2 + cm(1.4), y = my, d = dia } }
	elseif fe then
		if year >= 2025 then
			-- RTX 50: both fans on the front, one at each end (double flow-through)
			fans = { { x = x0 - cm(1.0) - feDia / 2, y = my, d = feDia }, { x = x1 + cm(1.0) + feDia / 2, y = my, d = feDia } }
		else
			-- RTX 30/40: one at the bracket end of the front, the other blows through from the back
			fans = { { x = x0 - cm(1.2) - feDia / 2, y = my, d = feDia } }
			ctx.backFan = { x = x1 + cm(1.2) + feDia / 2, y = my, d = feDia }
		end
	else
		fans = fanRow(ctx, math.max(1, p.fans or 2))
	end
	ctx.fans = fans

	-- board (the Founders Edition's is short: the far end is all cooler) and the PCIe fingers
	local pcbCol = if year < 2012 then c(28, 70, 40) else c(18, 20, 22)
	local pcbLen = if fe then L * 0.6 else L - cm(0.4)
	box(m, cf * CFrame.new(-cm(0.2) - pcbLen / 2, H * 0.47, 0), Vector3.new(pcbLen, H * 0.92, cm(0.16)), pcbCol, M.SmoothPlastic, { Name = "PCB" })
	box(m, cf * CFrame.new(-cm(2.05), -cm(0.35), 0), Vector3.new(cm(1.1), cm(0.8), cm(0.12)), GOLD, M.Metal, { Name = "Fingers" })
	box(m, cf * CFrame.new(-cm(6.6), -cm(0.35), 0), Vector3.new(cm(7.6), cm(0.8), cm(0.12)), GOLD, M.Metal, { Name = "Fingers" })

	-- I/O bracket: outputs in the first slot, vents in the rest
	local bslots = math.clamp(math.floor((p.slots or 2) + 0.4), 1, 3)
	local bw = cm(bslots * 2)
	box(m, cf * CFrame.new(cm(0.35), H * 0.5, bw / 2 - cm(0.6)), Vector3.new(cm(0.1), H + cm(0.6), bw), STEEL, M.Metal, { Name = "Bracket" })
	box(m, cf * CFrame.new(cm(0.8), H + cm(0.3), bw / 2 - cm(0.6)), Vector3.new(cm(1), cm(0.1), bw), STEEL, M.Metal, { Name = "BracketTab" })
	local outputs = if year < 2016 then { "dvi", "hdmi", "dp" } elseif year < 2019 then { "dvi", "hdmi", "dp", "dp" } else { "dp", "dp", "hdmi", "dp" }
	if p.lowProfile then
		outputs = if year < 2016 then { "vga", "dvi", "hdmi" } else { "dvi", "hdmi" }
	end
	local py = cm(1.3)
	for _, kind in outputs do
		local plen = if kind == "dvi" then cm(3.8) elseif kind == "vga" then cm(3.0) elseif kind == "hdmi" then cm(1.45) else cm(1.65)
		if py + plen > H - cm(0.4) then
			break
		end
		local yc = py + plen / 2
		if kind == "dvi" or kind == "vga" then
			box(m, cf * CFrame.new(cm(0.47), yc, cm(0.5)), Vector3.new(cm(0.16), plen, cm(1.0)), if kind == "vga" then c(40, 80, 170) else WHITE, M.SmoothPlastic, { Name = "Port" })
			box(m, cf * CFrame.new(cm(0.56), yc, cm(0.5)), Vector3.new(0.003, plen * 0.85, cm(0.7)), c(30, 30, 34))
		else
			box(m, cf * CFrame.new(cm(0.47), yc, cm(0.5)), Vector3.new(cm(0.16), plen, cm(0.62)), c(204, 206, 210), M.Metal, { Name = "Port" })
			box(m, cf * CFrame.new(cm(0.56), yc, cm(0.5)), Vector3.new(0.003, plen * 0.84, cm(0.42)), c(14, 14, 16))
		end
		py += plen + cm(0.55)
	end
	for k = 1, bslots - 1 do
		local zc = cm(1.4) + (k - 0.5) * cm(2)
		for v = -1, 1 do
			box(m, cf * CFrame.new(cm(0.41), H * 0.5, zc + v * cm(0.5)), Vector3.new(0.003, H * 0.72, cm(0.22)), c(16, 16, 18))
		end
	end

	-- backplate: die screws, edge screws, the maker's logo, the flow-through cut-out or rear fan
	local backCol = ctx.frame or d.back or c(30, 30, 34)
	local backMat = if fe then M.Metal else (d.backMat or M.SmoothPlastic)
	local bz = -cm(0.33)
	local bface = bz - cm(0.11)
	local backTop = if fe then H else H * 0.95
	local backBot = cm(0.9)
	local backY = (backTop + backBot) / 2
	if ctx.backFan then
		local f = ctx.backFan
		holedPlate(ctx, x0 - cm(0.15), x1 + cm(0.1), backBot, backTop, bz - cm(0.11), bz + cm(0.11), { f }, backCol, backMat, backCol, false, "Backplate")
		rotor(ctx, cf * CFrame.new(f.x, my, -cm(0.05)) * CFrame.Angles(-math.pi / 2, 0, 0), f.d)
		finFace(ctx, f, zb - 0.0008, c(14, 14, 16))
	else
		box(m, cf * CFrame.new(mx - cm(0.15), backY, bz), Vector3.new(len - cm(0.3), backTop - backBot, cm(0.22)), backCol, backMat, { Name = "Backplate" })
	end
	local xd, yd = -math.min(L * 0.4, cm(12)), H * 0.52
	for sx = -1, 1, 2 do
		for sy = -1, 1, 2 do
			cyl(m, cf * CFrame.new(xd + sx * cm(1.3), yd + sy * cm(1.3), bface - cm(0.04)), "Z", cm(0.1), cm(0.55), c(46, 46, 50), M.Metal)
		end
	end
	for _, pos in { { x0 - cm(1.2), cm(1.6) }, { x0 - cm(1.2), backTop - cm(0.6) }, { x1 + cm(1.0), cm(1.6) }, { x1 + cm(1.0), backTop - cm(0.6) } } do
		cyl(m, cf * CFrame.new(pos[1], pos[2], bface - cm(0.03)), "Z", cm(0.06), cm(0.32), c(36, 36, 40), M.Metal)
	end
	local vent = d.backVent and L > cm(24)
	local vw = math.min(len * 0.2, cm(6))
	local backText = d.backText or (if fe or name == "fe20" or name == "fe10" or name == "ref" then chipBrand(p) else nil)
	if backText then
		-- between the die and the far end (or the vent, or the rear fan)
		local xa = xd - cm(1.9)
		local xb = x1 + (if ctx.backFan then cm(1.7) + feDia elseif vent then vw + cm(0.9) else cm(0.6))
		local tw = math.min((xa - xb) * 0.86, cm(11))
		local light = (backCol.R + backCol.G + backCol.B) > 1.5
		sticker(m, cf * CFrame.new((xa + xb) / 2, backY, bface - cm(0.02)), tw, math.min(H * 0.16, tw * 0.3), Enum.NormalId.Front, backText, d.backColor or (if light then c(30, 30, 34) else WHITE))
	end
	if vent then
		local vx = x1 + cm(0.6) + vw / 2
		box(m, cf * CFrame.new(vx, backY, bface - 0.001), Vector3.new(vw, (backTop - backBot) * 0.72, 0.002), c(12, 12, 14))
		for k = 0, 4 do
			box(m, cf * CFrame.new(vx - vw / 2 + vw * (k + 0.5) / 5, backY, bface - 0.002), Vector3.new(cm(0.08), (backTop - backBot) * 0.66, 0.002), c(90, 94, 100), M.Metal)
		end
	end

	-- cooler: fin stack, the shroud's top and bottom walls and far-end cap
	local finCol = d.fin or c(132, 136, 142)
	local finGap = finCol:Lerp(Color3.new(0, 0, 0), 0.6)
	local finTop = H - cm(0.35)
	if not d.passive then
		box(m, cf * CFrame.new(mx, (finTop + y0 + cm(0.2)) / 2, (zb + zp) / 2), Vector3.new(len - cm(0.6), finTop - y0 - cm(0.2), zp - zb), finCol, M.Metal, { Name = "Fins" })
		box(m, cf * CFrame.new(mx, H - cm(0.45), zp - coverD / 2), Vector3.new(len, cm(0.9), coverD), side, sideMat, { Name = "ShroudTop" })
		box(m, cf * CFrame.new(mx, y0 + cm(0.4), zp - coverD / 2), Vector3.new(len, cm(0.8), coverD), side, sideMat, { Name = "ShroudBottom" })
		box(m, cf * CFrame.new(x1 + cm(0.15), my, (zb + zp) / 2), Vector3.new(cm(0.3), hh, zp - zb), side, sideMat, { Name = "EndCap" })
	end
	-- the fins and heat pipes that show on the top edge between the shroud and the board
	local open = (zp - coverD) - zb
	if open > cm(0.35) and not d.passive then
		local step = math.max(cm(0.5), len / 44)
		local x = x0 - cm(0.4)
		while x > x1 + cm(0.4) do
			box(m, cf * CFrame.new(x, finTop + 0.0008, zb + open / 2), Vector3.new(cm(0.07), 0.0016, open), finGap, M.SmoothPlastic)
			x -= step
		end
		if open > cm(0.8) then
			local pipes = if tdp > 320 then 7 elseif tdp > 220 then 6 elseif tdp > 150 then 4 elseif tdp > 75 then 3 else 2
			local pipeCol = d.pipes or (if name == "ventus" or name == "pulse" then COPPER else NICKEL)
			for i = 1, pipes do
				local px = xd + cm(2.5) - (i - 1) * math.min(cm(1.6), len * 0.5 / pipes)
				cyl(m, cf * CFrame.new(px, finTop + cm(0.2), zb + open / 2), "Z", open - cm(0.2), cm(0.55), pipeCol, M.Metal, { Name = "HeatPipe" })
			end
		end
	end

	-- the front: shroud plate cut round the fans (the Founders Edition: a frame round its fan and
	-- bare fins elsewhere; passive cards: a heatsink)
	local plates
	if d.passive then
		plates = { box(m, cf * CFrame.new(mx, my, zb + cm(0.15)), Vector3.new(len - cm(0.4), hh, cm(0.3)), d.shroud, M.Metal, { Name = "Shroud" }) }
		local nf = math.max(6, math.floor(len / cm(0.7)))
		for i = 0, nf - 1 do
			local fx = x0 - cm(0.3) - (i + 0.5) * (len - cm(0.6)) / nf
			box(m, cf * CFrame.new(fx, my, zb + cm(0.3) + (zf - zb - cm(0.3)) / 2), Vector3.new(cm(0.12), hh * 0.94, zf - zb - cm(0.3)), d.shroud, M.Metal)
		end
	elseif fe then
		plates = {}
		local covered = {}
		for _, f in fans do
			local xa = math.min(x0, f.x + f.d / 2 + cm(1.0))
			local xb = math.max(x1, f.x - f.d / 2 - cm(1.0))
			table.insert(covered, { xa, xb })
			for _, part in holedPlate(ctx, xa, xb, y0, H, zp, zf, { f }, ctx.frame, M.Metal, c(30, 30, 33), false, "Shroud") do
				table.insert(plates, part)
			end
		end
		-- bare black fins up to the front where there is no fan
		local ra = covered[1][2]
		local rb = if #fans == 2 then covered[2][1] else x1 + cm(0.3)
		if ra - rb > cm(0.5) then
			local fz = zf - cm(0.1)
			box(m, cf * CFrame.new((ra + rb) / 2, my, (zp + fz) / 2), Vector3.new(ra - rb, hh - cm(1.4), fz - zp), d.fin, M.Metal, { Name = "OpenFins" })
			-- the frame closes the top and bottom of the open part
			box(m, cf * CFrame.new((ra + rb) / 2, H - cm(0.35), (zp + zf) / 2), Vector3.new(ra - rb, cm(0.7), zf - zp), ctx.frame, M.Metal)
			box(m, cf * CFrame.new((ra + rb) / 2, y0 + cm(0.35), (zp + zf) / 2), Vector3.new(ra - rb, cm(0.7), zf - zp), ctx.frame, M.Metal)
			local k = 0
			local x = ra - cm(0.25)
			while x > rb and k < 60 do
				box(m, cf * CFrame.new(x, my, fz + 0.0008), Vector3.new(cm(0.09), hh - cm(1.6), 0.0016), c(70, 70, 76), M.Metal)
				x -= cm(0.42)
				k += 1
			end
		end
	else
		plates = holedPlate(ctx, x0, x1, y0, H, zp, zf, fans, d.shroud, d.shroudMat, d.ring, d.ringGlow, "Shroud")
	end
	if plates[1] then
		plates[1]:SetAttribute("Detail", "gpu")
	end

	-- the fans in their openings, with the fins showing behind
	for _, f in fans do
		finFace(ctx, f, zp + 0.0008, finGap)
		rotor(ctx, cf * CFrame.new(f.x, my, zp + pd * 0.5) * CFrame.Angles(math.pi / 2, 0, 0), f.d)
	end
	if #fans > 0 then
		decorate(ctx)
	end

	-- the top edge: logo, chip branding, lighting, the AORUS screen
	local brandW = math.min(len * 0.32, cm(9))
	local logoX = if fe then -L * 0.27 else -L * 0.45
	local logoCol = d.topGlow or d.topColor or WHITE
	if not d.passive then
		local lt = topText(ctx, logoX, brandW, d.top or d.topText or chipBrand(p), logoCol, d.topGlow ~= nil)
		lt.Name = "TopLogo"
	end
	if d.top and name ~= "pro" then
		topText(ctx, -L * 0.16, math.min(len * 0.18, cm(5)), chipBrand(p), c(170, 172, 178), false)
	end
	if d.topRgb then
		local strip = box(m, cf * CFrame.new(logoX, H + 0.0015, zf - cm(0.25)), Vector3.new(brandW * 1.2, 0.003, cm(0.16)), c(255, 80, 160), M.Neon, { Name = "GpuRGB", CastShadow = false })
		glowing(strip)
	end
	if d.lcd then
		-- AORUS "Edge View" screen
		local za = zp - coverD
		local sd = math.min((zf - za) * 0.6, cm(1.6))
		box(m, cf * CFrame.new(-L * 0.2, H + 0.002, (za + zf) / 2), Vector3.new(cm(3.2), 0.004, sd), c(10, 12, 16), M.Glass, { Name = "EdgeView" })
		sticker(m, cf * CFrame.new(-L * 0.2, H + 0.0045, (za + zf) / 2) * TOP_TEXT, cm(3), sd * 0.86, Enum.NormalId.Front, "62°C", c(90, 200, 255), true)
	end

	-- dust settles on the fans and the shroud
	PCParts.dustLayer(m, cf * CFrame.new(mx, my, zf + cm(0.25)), Vector3.new(len, hh, 0.01))

	-- power sockets on the top edge (with the pin grid showing)
	local frames = PCParts.gpuSockets(p, connectors)
	for i, kind in connectors do
		local wide = if kind == "12v" then cm(1.9) elseif kind == "6" then cm(1.4) else cm(1.8)
		local s = cf * frames[i] * CFrame.new(0, -cm(0.3), 0)
		box(m, s, Vector3.new(wide, cm(0.6), cm(0.85)), c(16, 16, 18), M.SmoothPlastic, { Name = "PowerSocket" })
		box(m, s * CFrame.new(0, cm(0.3) + 0.0008, 0), Vector3.new(wide * 0.86, 0.0016, cm(0.6)), c(40, 40, 44), M.SmoothPlastic)
	end
	box(m, cf * CFrame.new(-L / 2, H / 2, T / 2), Vector3.new(L, H, T + cm(0.6)), c(26, 26, 30), M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m, frames
end

return GpuCard
