-- ShopExtras: what the shop items from the catalogue (Data/Upgrades, the ones with a `place`) look
-- like, and where they go. ShopBuilder hands over its floor plan and helpers (ctx below); each
-- owned item finds a free spot of its kind and builds its model there:
--   wall     furniture standing against a wall (claims floor in the plan)
--   high     hung on a wall in a height band (low ~2.4, eye ~7, top ~12; clear of furniture below)
--   floor    free-standing, kept off the walkways between the door, the counter and the benches
--   ceiling  hanging from the ceiling grid, clear of the light panels
--   counter  on the counter top;  bench  on a shelf above every workbench
--   outside  in the forecourt (two rows, the doorway kept clear);  roof  on the roof
--   window   stickers and lightboxes on the shop window;  door / facade / special ones by id
-- An item that finds no room still works, it just isn't shown.
--
-- ctx: shop, plan, walls, wallItem, at, facing, local2, front, cf (plot), W, D, H, inner, fz,
--      counterCf, counterW, benches ({ cf, index }), accent, rng, items, level, plotW, setback,
--      points, highClaims ({ x0, z0, x1, z1, band }), name

local B = require(script.Parent.Parent.Util.Builder)
local Props = require(script.Parent.Props)
local Upgrades = require(script.Parent.Parent.Data.Upgrades)

local ShopExtras = {}
local M = Enum.Material

local function C(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

local WHITE, BLACK, DARK = C(242, 242, 240), C(24, 24, 26), C(44, 46, 52)
local WOOD, STEEL, RED = C(150, 106, 66), C(170, 172, 178), C(206, 40, 36)

local function nc(extra)
	local t = { CanCollide = false, CanTouch = false, CanQuery = false }
	for k, v in extra or {} do
		t[k] = v
	end
	return t
end

-- furniture people bump into, and the small things they don't
local function solid(m, cf: CFrame, size: Vector3, color, mat): BasePart
	return B.box(m, cf, size, color, mat or M.SmoothPlastic)
end
local function deco(m, cf: CFrame, size: Vector3, color, mat, extra): BasePart
	return B.box(m, cf, size, color, mat or M.SmoothPlastic, nc(extra))
end
local function cylY(m, cf: CFrame, h: number, d: number, color, mat): BasePart
	return B.cylY(m, cf, h, d, color, mat or M.SmoothPlastic, nc())
end
local function cylZ(m, cf: CFrame, l: number, d: number, color, mat): BasePart
	return B.cylZ(m, cf, l, d, color, mat or M.SmoothPlastic, nc())
end
local function cylX(m, cf: CFrame, l: number, d: number, color, mat): BasePart
	return B.cyl(m, cf, l, d, color, mat or M.SmoothPlastic, nc())
end
local function ball(m, cf: CFrame, d: number, color, mat): BasePart
	return B.ball(m, cf, d, color, mat or M.SmoothPlastic, nc())
end
local function glass(m, cf: CFrame, size: Vector3, color, transparency: number?): BasePart
	return B.box(m, cf, size, color or C(190, 220, 235), M.Glass, nc({ Transparency = transparency or 0.5 }))
end
-- a flat face with words on its front (-Z) face
local function label(m, cf: CFrame, size: Vector3, text: string, color, background, opts): BasePart
	local o = opts or {}
	local p = deco(m, cf, size, background or WHITE, o.material or M.SmoothPlastic, { Transparency = if background == false then 1 else 0 })
	B.sign(p, Enum.NormalId.Front, text, { color = color or BLACK, background = if background == false then nil else background, glow = o.glow, brightness = o.brightness, font = o.font or B.Fonts.Bold, pixelsPerStud = o.ppu or 60, rich = o.rich })
	return p
end
-- a picture frame with something written or drawn inside
local function frame(m, cf: CFrame, w: number, h: number, frameColor, inside: (CFrame, number, number) -> ())
	deco(m, cf, Vector3.new(w, h, 0.12), frameColor or WOOD, M.Wood)
	inside(cf * CFrame.new(0, 0, -0.08), w - 0.24, h - 0.24)
end
local function screen(m, cf: CFrame, w: number, h: number, text: string, color, background)
	deco(m, cf, Vector3.new(w + 0.16, h + 0.16, 0.14), BLACK)
	label(m, cf * CFrame.new(0, 0, -0.08), Vector3.new(w, h, 0.02), text, color or WHITE, background or C(16, 22, 34), { glow = true, brightness = 1.3, font = B.Fonts.Bold })
end
local function light(part: BasePart, range: number, brightness: number, color)
	B.pointLight(part, range, brightness, color or C(255, 230, 190), false)
end

local function cabinet(m, c, w: number, h: number, d: number, color, top)
	solid(m, c * CFrame.new(0, h / 2, 0), Vector3.new(w, h, d), color or WOOD, M.Wood)
	deco(m, c * CFrame.new(0, h + 0.06, 0), Vector3.new(w + 0.1, 0.12, d + 0.1), top or C(60, 60, 66), M.Marble)
	deco(m, c * CFrame.new(0, h / 2, -d / 2 - 0.02), Vector3.new(0.05, h - 0.4, 0.02), BLACK)
end

local function sticker(m, c, w: number, h: number, text: string, color, bg, glow)
	return label(m, c, Vector3.new(w, h, 0.03), text, color, bg, { glow = glow, font = B.Fonts.Bold })
end

----------------------------------------------------------------------------------------------------
-- The looks. Every builder gets (model, cf, ctx, i): cf sits on the floor / the mounting surface /
-- the counter top, and the item's front faces -Z.
----------------------------------------------------------------------------------------------------
local LOOKS = {}

-- Decor -------------------------------------------------------------------------------------------
LOOKS.wall_clock = function(m, c)
	cylZ(m, c * CFrame.new(0, 0, 0.02), 0.16, 1.6, DARK)
	cylZ(m, c * CFrame.new(0, 0, -0.04), 0.1, 1.4, WHITE)
	for k = 0, 3 do
		local a = k * math.pi / 2
		deco(m, c * CFrame.new(math.cos(a) * 0.56, math.sin(a) * 0.56, -0.1), Vector3.new(0.1, 0.1, 0.02), BLACK)
	end
	deco(m, c * CFrame.Angles(0, 0, math.rad(-60)) * CFrame.new(0, 0.18, -0.11), Vector3.new(0.07, 0.38, 0.02), BLACK)
	deco(m, c * CFrame.Angles(0, 0, math.rad(40)) * CFrame.new(0, 0.26, -0.12), Vector3.new(0.05, 0.55, 0.02), BLACK)
	ball(m, c * CFrame.new(0, 0, -0.12), 0.1, RED)
end

LOOKS.framed_art = function(m, c)
	local scenes = { { "🌉", C(250, 170, 110) }, { "🕌", C(120, 170, 220) }, { "⛵", C(90, 150, 200) } }
	for k, s in scenes do
		frame(m, c * CFrame.new((k - 2) * 1.9, 0, 0), 1.6, 1.25, C(60, 44, 30), function(f, w, h)
			label(m, f, Vector3.new(w, h, 0.02), s[1], WHITE, s[2], { font = B.Fonts.Regular })
		end)
	end
end

LOOKS.evil_eye = function(m, c)
	cylZ(m, c * CFrame.new(0, -0.1, 0), 0.08, 1.4, C(20, 70, 170), M.Glass)
	cylZ(m, c * CFrame.new(0, -0.1, -0.05), 0.06, 1.0, WHITE, M.Glass)
	cylZ(m, c * CFrame.new(0, -0.1, -0.09), 0.05, 0.62, C(110, 180, 240), M.Glass)
	cylZ(m, c * CFrame.new(0, -0.1, -0.12), 0.04, 0.3, BLACK, M.Glass)
	deco(m, c * CFrame.new(0, 0.75, 0), Vector3.new(0.05, 0.5, 0.05), C(200, 60, 60))
end

local function flag(m, c: CFrame, w: number, h: number)
	deco(m, c, Vector3.new(w, h, 0.05), C(227, 10, 23), M.Fabric)
	cylZ(m, c * CFrame.new(-w * 0.15, 0, -0.04), 0.02, h * 0.5, WHITE)
	cylZ(m, c * CFrame.new(-w * 0.11, 0, -0.06), 0.02, h * 0.4, C(227, 10, 23))
	label(m, c * CFrame.new(w * 0.05, 0, -0.07), Vector3.new(h * 0.32, h * 0.32, 0.01), "★", WHITE, false, { font = B.Fonts.Heavy })
end

LOOKS.turkish_flag = function(m, c)
	flag(m, c, 3.9, 2.6)
end

LOOKS.world_map = function(m, c)
	frame(m, c, 5, 2.9, C(40, 40, 44), function(f, w, h)
		deco(m, f, Vector3.new(w, h, 0.02), C(120, 180, 220))
		for _, land in { { -1.5, 0.45, 1.3, 1.1 }, { -1.0, -0.55, 0.6, 1.0 }, { 0.3, 0.35, 1.0, 0.9 }, { 0.4, -0.4, 0.7, 0.9 }, { 1.4, 0.3, 1.2, 0.8 }, { 1.7, -0.7, 0.6, 0.4 } } do
			deco(m, f * CFrame.new(land[1], land[2], -0.02), Vector3.new(land[3], land[4], 0.02), C(220, 200, 150))
		end
	end)
end

LOOKS.calligraphy = function(m, c)
	frame(m, c, 3.4, 1.8, C(196, 160, 70), function(f, w, h)
		label(m, f, Vector3.new(w, h, 0.02), "Patience is bitter,\nbut its fruit is sweet", C(230, 196, 100), C(20, 70, 50), { font = B.Fonts.Serif })
	end)
end

LOOKS.lava_lamp = function(m, c)
	cylY(m, c * CFrame.new(0, 0.12, 0), 0.24, 0.36, STEEL, M.Metal)
	B.cylY(m, c * CFrame.new(0, 0.62, 0), 0.8, 0.28, C(255, 90, 160), M.Neon, nc({ Transparency = 0.25 }))
	cylY(m, c * CFrame.new(0, 1.08, 0), 0.14, 0.22, STEEL, M.Metal)
end

LOOKS.diffuser = function(m, c)
	B.cylY(m, c * CFrame.new(0, 0.22, 0), 0.44, 0.32, C(200, 140, 60), M.Glass, nc({ Transparency = 0.3 }))
	for k = -1, 1 do
		deco(m, c * CFrame.new(k * 0.06, 0.75, 0) * CFrame.Angles(0, 0, math.rad(k * 12)), Vector3.new(0.03, 0.8, 0.03), C(60, 40, 30))
	end
end

LOOKS.bonsai = function(m, c)
	deco(m, c * CFrame.new(0, 0.12, 0), Vector3.new(0.9, 0.24, 0.6), C(110, 60, 40))
	deco(m, c * CFrame.new(0.05, 0.45, 0) * CFrame.Angles(0, 0, math.rad(-20)), Vector3.new(0.1, 0.55, 0.1), C(90, 60, 40), M.Wood)
	B.ellipsoid(m, c * CFrame.new(0.2, 0.8, 0), Vector3.new(0.8, 0.35, 0.55), C(60, 120, 50), M.LeafyGrass, nc())
	B.ellipsoid(m, c * CFrame.new(-0.18, 0.65, 0), Vector3.new(0.5, 0.25, 0.4), C(70, 130, 55), M.LeafyGrass, nc())
end

LOOKS.monstera = function(m, c)
	solid(m, c * CFrame.new(0, 0.8, 0), Vector3.new(1.6, 1.6, 1.6), C(236, 232, 224), M.Slate)
	for i = 1, 7 do
		local a = i * 0.9
		local r = 0.3 + (i % 3) * 0.25
		deco(m, c * CFrame.new(math.cos(a) * r * 0.5, 2.2 + (i % 3) * 0.5, math.sin(a) * r * 0.5) * CFrame.Angles(0, a, math.rad(25 + (i % 2) * 15)), Vector3.new(0.06, 1.8, 0.06), C(60, 110, 50))
		B.ellipsoid(m, c * CFrame.new(math.cos(a) * (0.5 + r), 2.9 + (i % 3) * 0.55, math.sin(a) * (0.5 + r)) * CFrame.Angles(math.rad(-30), a, 0), Vector3.new(1.3, 0.12, 1.1), if i % 2 == 0 then C(40, 110, 50) else C(50, 125, 60), M.LeafyGrass, nc())
	end
end

LOOKS.kilim = function(m, c)
	deco(m, c * CFrame.new(0, 0.1, 0), Vector3.new(6, 0.06, 4), C(170, 50, 40), M.Fabric)
	deco(m, c * CFrame.new(0, 0.11, 0), Vector3.new(5.4, 0.06, 3.4), C(220, 190, 140), M.Fabric)
	deco(m, c * CFrame.new(0, 0.12, 0), Vector3.new(5.0, 0.06, 3.0), C(170, 50, 40), M.Fabric)
	for x = -1, 1 do
		deco(m, c * CFrame.new(x * 1.6, 0.13, 0) * CFrame.Angles(0, math.rad(45), 0), Vector3.new(1.1, 0.06, 1.1), if x == 0 then C(30, 50, 100) else C(230, 170, 60), M.Fabric)
	end
end

LOOKS.bookshelf = function(m, c, k)
	solid(m, c * CFrame.new(0, 3.4, 0.6), Vector3.new(4, 6.8, 0.15), WOOD, M.Wood)
	for x = -1, 1, 2 do
		solid(m, c * CFrame.new(x * 1.95, 3.4, 0), Vector3.new(0.12, 6.8, 1.3), WOOD, M.Wood)
	end
	local books = { C(170, 40, 40), C(40, 80, 150), C(220, 180, 60), C(50, 120, 80), C(230, 230, 220), C(90, 50, 120) }
	for s = 0, 3 do
		local y = 0.3 + s * 1.65
		deco(m, c * CFrame.new(0, y, 0), Vector3.new(3.8, 0.12, 1.25), WOOD, M.Wood)
		local x = -1.75
		while x < 1.6 do
			local w = k.rng:NextNumber() * 0.7 + 0.5
			local h = k.rng:NextNumber() * 0.35 + 0.95
			deco(m, c * CFrame.new(x + w / 2, y + 0.06 + h / 2, 0.1), Vector3.new(w - 0.05, h, 0.9), books[k.rng:NextInteger(1, #books)])
			x += w + 0.1
		end
	end
end

LOOKS.hanging_plants = function(m, c)
	cylY(m, c * CFrame.new(0, -1.1, 0), 2.2, 0.05, C(60, 60, 60))
	cylY(m, c * CFrame.new(0, -2.5, 0), 0.7, 1.1, C(200, 120, 80), M.Slate)
	B.ellipsoid(m, c * CFrame.new(0, -2.0, 0), Vector3.new(1.5, 0.7, 1.5), C(60, 130, 60), M.LeafyGrass, nc())
	for k = 0, 2 do
		local a = k * 2.1
		deco(m, c * CFrame.new(math.cos(a) * 0.55, -3.4, math.sin(a) * 0.55), Vector3.new(0.15, 1.8, 0.15), C(70, 140, 60), M.LeafyGrass)
	end
end

LOOKS.neon_quote = function(m, c, k)
	deco(m, c * CFrame.new(0, 0, 0.02), Vector3.new(7, 1.4, 0.06), C(20, 20, 26))
	label(m, c * CFrame.new(0, 0, -0.04), Vector3.new(6.8, 1.2, 0.02), "Format atmadan olmaz", k.accent:Lerp(WHITE, 0.3), false, { glow = true, brightness = 2.2, font = B.Fonts.Hand })
end

LOOKS.figures = function(m, c)
	solid(m, c * CFrame.new(0, 3.2, 0.1), Vector3.new(3.2, 6.4, 1.3), DARK)
	glass(m, c * CFrame.new(0, 3.4, -0.6), Vector3.new(3.0, 5.8, 0.06), nil, 0.6)
	local cols = { RED, C(40, 120, 220), C(250, 200, 40), C(60, 180, 90), C(200, 80, 200) }
	for s = 0, 2 do
		deco(m, c * CFrame.new(0, 1.2 + s * 1.8, 0), Vector3.new(3.0, 0.08, 1.1), WHITE, M.Glass)
		for i = -1, 1 do
			local col = cols[(s * 3 + i + 2) % #cols + 1]
			deco(m, c * CFrame.new(i * 0.9, 1.55 + s * 1.8, 0), Vector3.new(0.35, 0.6, 0.3), col)
			ball(m, c * CFrame.new(i * 0.9, 2.0 + s * 1.8, 0), 0.32, C(240, 200, 170))
		end
	end
end

LOOKS.mural = function(m, c)
	deco(m, c, Vector3.new(10, 3.6, 0.06), C(30, 20, 60))
	for i = 0, 5 do
		deco(m, c * CFrame.new(-4.2 + i * 1.7, -0.5 + (i % 2) * 0.4, -0.04), Vector3.new(1.2, 2.2 - (i % 3) * 0.5, 0.02), if i % 2 == 0 then C(240, 60, 160) else C(40, 220, 240), M.Neon, { Transparency = 0.45 })
	end
	label(m, c * CFrame.new(0, 1.1, -0.06), Vector3.new(8, 1.1, 0.02), "NEO TOKYO 2077", C(80, 240, 255), false, { glow = true, brightness = 2, font = B.Fonts.Display })
end

LOOKS.retro_museum = function(m, c)
	solid(m, c * CFrame.new(0, 1.5, 0), Vector3.new(6, 3, 2.2), C(60, 46, 34), M.Wood)
	glass(m, c * CFrame.new(0, 3.05, 0), Vector3.new(5.8, 0.1, 2.0), nil, 0.4)
	local beige = C(214, 204, 178)
	-- a home computer and its keyboard
	solid(m, c * CFrame.new(-2.0, 3.35, 0.1), Vector3.new(1.8, 0.4, 0.9), beige)
	deco(m, c * CFrame.new(-2.0, 3.58, -0.1), Vector3.new(1.6, 0.06, 0.5), C(70, 60, 50))
	label(m, c * CFrame.new(-2.0, 3.38, -0.36), Vector3.new(0.8, 0.2, 0.02), "C64", C(110, 70, 40), false)
	-- a 386 tower and a CRT monitor
	solid(m, c * CFrame.new(0.3, 4.2, 0.3), Vector3.new(0.9, 2.2, 1.6), beige)
	label(m, c * CFrame.new(0.3, 4.9, -0.51), Vector3.new(0.6, 0.25, 0.02), "386DX", C(200, 40, 30), beige)
	solid(m, c * CFrame.new(1.9, 4.0, 0.3), Vector3.new(1.6, 1.6, 1.5), beige)
	label(m, c * CFrame.new(1.9, 4.05, -0.46), Vector3.new(1.2, 0.95, 0.02), "C:\\>_", C(80, 255, 120), C(16, 30, 20), { glow = true, font = B.Fonts.Mono })
	-- floppies in the case
	for i = 0, 3 do
		deco(m, c * CFrame.new(-2.2 + i * 0.6, 2.95, -0.3), Vector3.new(0.5, 0.04, 0.5), if i % 2 == 0 then BLACK else C(30, 60, 150))
	end
	label(m, c * CFrame.new(0, 2.2, -1.12), Vector3.new(2.6, 0.5, 0.02), "RETRO MUSEUM", C(240, 220, 160), C(40, 30, 22))
end

LOOKS.kutahya_plates = function(m, c)
	for i = -1, 1 do
		local p = c * CFrame.new(i * 1.2, (i % 2) * 0.2, 0)
		cylZ(m, p, 0.08, 1.0, WHITE)
		cylZ(m, p * CFrame.new(0, 0, -0.03), 0.04, 0.82, C(30, 80, 170))
		cylZ(m, p * CFrame.new(0, 0, -0.05), 0.04, 0.66, WHITE)
		cylZ(m, p * CFrame.new(0, 0, -0.07), 0.04, 0.3, if i == 0 then RED else C(40, 150, 140))
	end
end

LOOKS.canary = function(m, c)
	cylY(m, c * CFrame.new(0, 0.06, 0), 0.12, 1.0, DARK, M.Metal)
	B.cylY(m, c * CFrame.new(0, 2.2, 0), 4.2, 0.12, DARK, M.Metal, nc({ CanCollide = true }))
	local cage = c * CFrame.new(0, 4.3, 0)
	cylY(m, cage, 0.06, 1.0, C(220, 190, 90), M.Metal)
	for i = 0, 5 do
		local a = i * math.pi / 3
		deco(m, cage * CFrame.new(math.cos(a) * 0.45, 0.55, math.sin(a) * 0.45), Vector3.new(0.04, 1.1, 0.04), C(220, 190, 90), M.Metal)
	end
	cylY(m, cage * CFrame.new(0, 1.1, 0), 0.06, 1.0, C(220, 190, 90), M.Metal)
	ball(m, cage * CFrame.new(0, 1.3, 0), 0.35, C(220, 190, 90), M.Metal)
	deco(m, cage * CFrame.new(0, 0.45, 0), Vector3.new(0.8, 0.04, 0.04), C(140, 100, 60), M.Wood)
	ball(m, cage * CFrame.new(0, 0.6, 0), 0.24, C(250, 220, 40))
end

LOOKS.old_radio = function(m, c)
	deco(m, c * CFrame.new(0, 0.32, 0), Vector3.new(1.0, 0.64, 0.45), C(110, 70, 40), M.Wood)
	deco(m, c * CFrame.new(-0.18, 0.36, -0.23), Vector3.new(0.5, 0.42, 0.02), C(200, 180, 140), M.Fabric)
	label(m, c * CFrame.new(0.28, 0.45, -0.23), Vector3.new(0.3, 0.16, 0.01), "FM ▮", C(255, 200, 120), C(60, 40, 20), { glow = true, font = B.Fonts.Mono })
	for i = 0, 1 do
		cylZ(m, c * CFrame.new(0.2 + i * 0.16, 0.18, -0.24), 0.05, 0.1, C(230, 220, 200))
	end
end

LOOKS.window_led = function(m, c, k)
	for _, s in { { 0, 0.85, 2.8, 0.08 }, { 0, -0.85, 2.8, 0.08 }, { 1.36, 0, 0.08, 1.78 }, { -1.36, 0, 0.08, 1.78 } } do
		deco(m, c * CFrame.new(s[1], s[2], 0), Vector3.new(s[3], s[4], 0.03), k.accent, M.Neon)
	end
	label(m, c, Vector3.new(2.6, 1.6, 0.02), "REPAIR • SERVICE\nUPGRADES", WHITE, false, { glow = true })
end

LOOKS.review_qr = function(m, c)
	deco(m, c * CFrame.new(0, 0.3, 0) * CFrame.Angles(math.rad(-12), 0, 0), Vector3.new(0.6, 0.6, 0.04), WHITE)
	label(m, c * CFrame.new(0, 0.3, -0.03) * CFrame.Angles(math.rad(-12), 0, 0), Vector3.new(0.55, 0.55, 0.01), "▣▢▣\n▢▣▢\n★★★★★", BLACK, false, { font = B.Fonts.Mono })
	deco(m, c * CFrame.new(0, 0.03, 0.08), Vector3.new(0.5, 0.06, 0.3), DARK)
end

LOOKS.signature_tablet = function(m, c)
	deco(m, c * CFrame.new(0, 0.04, 0) * CFrame.Angles(math.rad(-8), 0, 0), Vector3.new(0.8, 0.06, 0.55), BLACK)
	label(m, c * CFrame.new(0, 0.08, 0) * CFrame.Angles(math.rad(-98), 0, 0), Vector3.new(0.7, 0.45, 0.01), "Signed: ~~~", C(30, 30, 30), WHITE, { font = B.Fonts.Hand })
	deco(m, c * CFrame.new(0.45, 0.04, 0) * CFrame.Angles(0, math.rad(20), 0), Vector3.new(0.04, 0.04, 0.5), STEEL, M.Metal)
end

LOOKS.cctv_sticker = function(m, c)
	sticker(m, c, 1.6, 1.0, "📹\nTHIS AREA IS\nUNDER CCTV", BLACK, C(250, 210, 40))
end

LOOKS.staff_tea = function(m, c)
	cabinet(m, c, 2.4, 3.2, 2)
	Props.samovar(m, c * CFrame.new(-0.3, 3.26, 0.1))
	for i = 0, 1 do
		B.cylY(m, c * CFrame.new(0.7 + i * 0.3, 3.46, -0.4), 0.4, 0.2, C(170, 50, 20), M.Glass, nc({ Transparency = 0.2 }))
	end
end

LOOKS.gpu_wall = function(m, c, k)
	deco(m, c, Vector3.new(8, 3.2, 0.1), C(26, 26, 30))
	for row = 0, 1 do
		for col = 0, 2 do
			local cc = c * CFrame.new(-2.6 + col * 2.6, 0.75 - row * 1.5, -0.25)
			deco(m, cc, Vector3.new(2.3, 0.9, 0.35), if (row + col) % 2 == 0 then C(40, 40, 46) else C(190, 190, 196), M.Metal)
			for f = -1, 1, 2 do
				cylZ(m, cc * CFrame.new(f * 0.55, 0, -0.19), 0.04, 0.72, BLACK)
			end
			deco(m, cc * CFrame.new(0, 0.47, 0), Vector3.new(2.2, 0.05, 0.3), k.accent, M.Neon)
		end
	end
end

-- Lounge --------------------------------------------------------------------------------------------
LOOKS.water_cooler = function(m, c)
	solid(m, c * CFrame.new(0, 1.7, 0), Vector3.new(1.2, 3.4, 1.2), WHITE)
	B.cylY(m, c * CFrame.new(0, 4.1, 0), 1.4, 0.95, C(120, 180, 240), M.Glass, nc({ Transparency = 0.35 }))
	deco(m, c * CFrame.new(-0.22, 2.6, -0.62), Vector3.new(0.18, 0.2, 0.1), C(40, 90, 220))
	deco(m, c * CFrame.new(0.22, 2.6, -0.62), Vector3.new(0.18, 0.2, 0.1), RED)
	cylY(m, c * CFrame.new(0.75, 2.4, 0), 0.9, 0.3, WHITE)
end

LOOKS.magazine_rack = function(m, c)
	for x = -1, 1, 2 do
		solid(m, c * CFrame.new(x * 0.9, 1.9, 0), Vector3.new(0.1, 3.8, 1), DARK, M.Metal)
	end
	local covers = { "TEKNO", "OYUN", "DONANIM" }
	for i = 0, 2 do
		deco(m, c * CFrame.new(0, 0.9 + i * 1.1, 0.1) * CFrame.Angles(math.rad(-15), 0, 0), Vector3.new(1.7, 0.08, 0.9), DARK, M.Metal)
		label(m, c * CFrame.new(0, 1.35 + i * 1.1, -0.1) * CFrame.Angles(math.rad(-15), 0, 0), Vector3.new(1.0, 0.95, 0.04), covers[i + 1], WHITE, ({ C(200, 40, 40), C(40, 100, 200), C(30, 30, 30) })[i + 1])
	end
end

LOOKS.newspapers = function(m, c)
	for i = 0, 2 do
		deco(m, c * CFrame.new(0, 0.03 + i * 0.05, 0) * CFrame.Angles(0, math.rad(i * 7), 0), Vector3.new(0.9, 0.05, 1.2), C(232, 230, 222))
	end
	label(m, c * CFrame.new(0, 0.2, 0) * CFrame.Angles(math.rad(-90), 0, 0), Vector3.new(0.85, 0.5, 0.02), "NEWS", BLACK, C(232, 230, 222), { font = B.Fonts.Serif })
end

LOOKS.coat_rack = function(m, c)
	cylY(m, c * CFrame.new(0, 0.08, 0), 0.16, 1.3, DARK)
	B.cylY(m, c * CFrame.new(0, 3, 0), 6, 0.22, WOOD, M.Wood, nc({ CanCollide = true }))
	for k = 0, 3 do
		local a = k * math.pi / 2
		deco(m, c * CFrame.new(math.cos(a) * 0.3, 5.6, math.sin(a) * 0.3) * CFrame.Angles(0, -a, math.rad(40)), Vector3.new(0.6, 0.08, 0.08), WOOD, M.Wood)
	end
	deco(m, c * CFrame.new(0.45, 4.3, 0) * CFrame.Angles(0, 0, math.rad(5)), Vector3.new(0.4, 2.4, 1.1), C(40, 70, 60), M.Fabric)
	deco(m, c * CFrame.new(-0.4, 4.9, 0), Vector3.new(0.12, 1.4, 0.5), C(200, 40, 50), M.Fabric)
end

LOOKS.umbrella_stand = function(m, c)
	solid(m, c * CFrame.new(0, 1, 0), Vector3.new(1, 2, 1), DARK, M.Metal)
	for k = -1, 1, 2 do
		deco(m, c * CFrame.new(k * 0.2, 2.6, 0) * CFrame.Angles(0, 0, math.rad(k * 8)), Vector3.new(0.12, 1.6, 0.12), if k < 0 then C(30, 60, 140) else RED)
		ball(m, c * CFrame.new(k * 0.32, 3.45, 0), 0.22, C(80, 50, 30))
	end
end

LOOKS.guest_wifi = function(m, c, k)
	deco(m, c * CFrame.new(0, 0.42, 0) * CFrame.Angles(math.rad(-12), 0, 0), Vector3.new(0.9, 0.8, 0.05), WHITE, M.Glass)
	label(m, c * CFrame.new(0, 0.42, -0.04) * CFrame.Angles(math.rad(-12), 0, 0), Vector3.new(0.85, 0.75, 0.01), "📶 Wi-Fi\n" .. k.wifi .. "\nPassword: tea1234", BLACK, false, { font = B.Fonts.Medium })
end

LOOKS.charging_station = function(m, c, k)
	solid(m, c * CFrame.new(0, 1.8, 0), Vector3.new(1.2, 3.6, 1), DARK)
	label(m, c * CFrame.new(0, 2.6, -0.51), Vector3.new(1, 0.9, 0.02), "⚡\nCHARGE", WHITE, k.accent, { glow = true })
	for i = -1, 1 do
		deco(m, c * CFrame.new(i * 0.33, 3.66, -0.1), Vector3.new(0.22, 0.04, 0.42), BLACK)
		deco(m, c * CFrame.new(i * 0.33, 3.35, -0.5), Vector3.new(0.04, 0.6, 0.04), WHITE)
	end
end

LOOKS.queue_ticket = function(m, c)
	B.cylY(m, c * CFrame.new(0, 1.7, 0), 3.4, 0.3, STEEL, M.Metal, nc({ CanCollide = true }))
	cylY(m, c * CFrame.new(0, 0.05, 0), 0.1, 1.2, STEEL, M.Metal)
	deco(m, c * CFrame.new(0, 3.7, 0), Vector3.new(0.9, 0.8, 0.6), RED)
	label(m, c * CFrame.new(0, 3.85, -0.31), Vector3.new(0.8, 0.35, 0.02), "SIRA ALIN", WHITE, RED)
	deco(m, c * CFrame.new(0, 3.45, -0.35), Vector3.new(0.3, 0.2, 0.02), WHITE)
end

LOOKS.bean_bags = function(m, c, k)
	for x = -1, 1, 2 do
		B.ellipsoid(m, c * CFrame.new(x * 1.3, 0.75, 0), Vector3.new(2.2, 1.5, 2.2), if x < 0 then k.accent else C(240, 140, 40), M.Fabric)
		B.ellipsoid(m, c * CFrame.new(x * 1.3, 1.5, 0.6), Vector3.new(1.8, 1.4, 1), if x < 0 then k.accent else C(240, 140, 40), M.Fabric, nc())
	end
end

LOOKS.kids_corner = function(m, c)
	local tiles = { C(240, 80, 80), C(80, 160, 240), C(250, 210, 60), C(100, 200, 110) }
	for i = 0, 3 do
		deco(m, c * CFrame.new(-1.25 + (i % 2) * 2.5, 0.12, -1 + (i // 2) * 2), Vector3.new(2.5, 0.12, 2), tiles[i + 1], M.Fabric, { CanCollide = true })
	end
	solid(m, c * CFrame.new(0.8, 1.1, 0.4), Vector3.new(1.6, 0.12, 1.1), C(250, 210, 60))
	for x = -1, 1, 2 do
		for z = -1, 1, 2 do
			deco(m, c * CFrame.new(0.8 + x * 0.65, 0.6, 0.4 + z * 0.4), Vector3.new(0.12, 1, 0.12), WHITE)
		end
	end
	for x = -1, 1, 2 do
		deco(m, c * CFrame.new(0.8 + x * 1.2, 0.37, 0.4), Vector3.new(0.6, 0.5, 0.6), if x < 0 then C(80, 160, 240) else C(240, 80, 80))
	end
	for i = 0, 2 do
		deco(m, c * CFrame.new(-1.6 + i * 0.45, 0.4 + (i % 2) * 0.1, -1.0), Vector3.new(0.4, 0.4, 0.4), tiles[(i % 4) + 1])
	end
	-- a teddy bear
	ball(m, c * CFrame.new(-1.6, 0.6, 0.9), 0.8, C(160, 110, 70))
	ball(m, c * CFrame.new(-1.6, 1.2, 0.9), 0.55, C(160, 110, 70))
	for x = -1, 1, 2 do
		ball(m, c * CFrame.new(-1.6 + x * 0.2, 1.45, 0.9), 0.2, C(140, 95, 60))
	end
end

LOOKS.queue_screen = function(m, c)
	screen(m, c, 3.8, 2, "NOW SERVING: 024\n▸ BENCH 2", C(255, 200, 60), C(20, 24, 30))
end

LOOKS.game_console = function(m, c, k)
	solid(m, c * CFrame.new(0, 0.7, 0.9), Vector3.new(4.2, 1.4, 1.4), C(40, 40, 46), M.Wood)
	deco(m, c * CFrame.new(0, 1.55, 0.95), Vector3.new(1.4, 0.25, 0.9), WHITE)
	deco(m, c * CFrame.new(0, 3.2, 1.2), Vector3.new(0.3, 2.2, 0.3), BLACK)
	screen(m, c * CFrame.new(0, 3.6, 1.05), 3.6, 2.0, "⚽  GOOOL!", WHITE, C(30, 120, 60))
	for x = -1, 1, 2 do
		B.ellipsoid(m, c * CFrame.new(x * 1.1, 0.7, -1.2), Vector3.new(1.6, 1.4, 1.6), if x < 0 then k.accent else C(60, 60, 70), M.Fabric)
	end
end

LOOKS.foosball = function(m, c)
	solid(m, c * CFrame.new(0, 2.4, 0), Vector3.new(4.4, 0.9, 2.6), C(120, 80, 50), M.Wood)
	deco(m, c * CFrame.new(0, 2.86, 0), Vector3.new(4.0, 0.04, 2.2), C(40, 140, 60))
	for x = -1, 1, 2 do
		for z = -1, 1, 2 do
			solid(m, c * CFrame.new(x * 1.9, 1, z * 1.0), Vector3.new(0.25, 2, 0.25), C(90, 60, 40), M.Wood)
		end
	end
	for i = 0, 5 do
		local x = -1.75 + i * 0.7
		cylZ(m, c * CFrame.new(x, 3.0, 0), 3.6, 0.07, STEEL, M.Metal)
		deco(m, c * CFrame.new(x, 2.95, 0), Vector3.new(0.14, 0.4, 1.4), if i % 2 == 0 then RED else C(40, 80, 200))
		ball(m, c * CFrame.new(x, 3.0, -1.85), 0.2, BLACK)
	end
end

LOOKS.massage_chair = function(m, c)
	solid(m, c * CFrame.new(0, 1, 0), Vector3.new(2.2, 2, 2.4), BLACK, M.Leather)
	solid(m, c * CFrame.new(0, 3.2, 0.95) * CFrame.Angles(math.rad(-15), 0, 0), Vector3.new(2, 3.2, 0.6), BLACK, M.Leather)
	for x = -1, 1, 2 do
		deco(m, c * CFrame.new(x * 1.15, 2.4, 0), Vector3.new(0.4, 0.8, 2.2), C(60, 60, 64), M.Leather)
	end
	deco(m, c * CFrame.new(0, 0.6, -1.6) * CFrame.Angles(math.rad(35), 0, 0), Vector3.new(1.6, 1.2, 0.4), BLACK, M.Leather)
	deco(m, c * CFrame.new(0, 4.6, 1.35), Vector3.new(1.4, 0.6, 0.5), C(60, 60, 64), M.Leather)
end

LOOKS.big_screen = function(m, c)
	screen(m, c, 6.6, 3.7, "🌅 ⛵ 🌉\nSunset over the bay", WHITE, C(240, 120, 60))
end

LOOKS.vr_demo = function(m, c, k)
	deco(m, c * CFrame.new(0, 0.12, 0), Vector3.new(5, 0.06, 5), C(30, 30, 36), M.Rubber, { CanCollide = true })
	for i = 0, 3 do
		local a = i * math.pi / 2
		deco(m, c * CFrame.Angles(0, a, 0) * CFrame.new(0, 0.16, 2.45), Vector3.new(5, 0.04, 0.1), k.accent, M.Neon)
	end
	for x = -1, 1, 2 do
		B.cylY(m, c * CFrame.new(x * 2.3, 2.6, 2.3), 5.2, 0.15, BLACK, M.Metal, nc())
		deco(m, c * CFrame.new(x * 2.3, 5.2, 2.3), Vector3.new(0.4, 0.4, 0.4), BLACK)
	end
	solid(m, c * CFrame.new(1.8, 1.6, -1.8), Vector3.new(0.5, 3.2, 0.5), WHITE)
	deco(m, c * CFrame.new(1.8, 3.35, -1.8), Vector3.new(0.7, 0.35, 0.45), BLACK)
	label(m, c * CFrame.new(-1.8, 1.6, -2.2), Vector3.new(1.2, 1.2, 0.05), "VR\n🥽", WHITE, k.accent, { glow = true })
	deco(m, c * CFrame.new(-1.8, 0.5, -2.15), Vector3.new(0.1, 1, 0.1), BLACK)
end

-- Refreshments ----------------------------------------------------------------------------------------
LOOKS.lokum = function(m, c)
	B.cylY(m, c * CFrame.new(0, 0.12, 0), 0.24, 0.8, WHITE, M.Glass, nc({ Transparency = 0.3 }))
	for i = 0, 4 do
		local a = i * 1.25
		deco(m, c * CFrame.new(math.cos(a) * 0.2, 0.28 + (i % 2) * 0.06, math.sin(a) * 0.2) * CFrame.Angles(0, a, 0), Vector3.new(0.16, 0.14, 0.16), if i % 2 == 0 then C(240, 150, 180) else C(250, 245, 235))
	end
end

LOOKS.cologne = function(m, c)
	B.box(m, c * CFrame.new(0, 0.32, 0), Vector3.new(0.3, 0.64, 0.18), C(240, 230, 140), M.Glass, nc({ Transparency = 0.25 }))
	cylY(m, c * CFrame.new(0, 0.72, 0), 0.16, 0.14, C(210, 170, 60), M.Metal)
	label(m, c * CFrame.new(0, 0.3, -0.1), Vector3.new(0.26, 0.2, 0.01), "KOLONYA", C(40, 90, 40), WHITE)
end

LOOKS.tea_glasses = function(m, c)
	cylY(m, c * CFrame.new(0, 0.03, 0), 0.05, 1.1, STEEL, M.Metal)
	for i = 0, 2 do
		local a = i * 2.1
		local p = c * CFrame.new(math.cos(a) * 0.3, 0, math.sin(a) * 0.3)
		cylY(m, p * CFrame.new(0, 0.07, 0), 0.03, 0.34, WHITE)
		B.cylY(m, p * CFrame.new(0, 0.27, 0), 0.38, 0.2, C(170, 50, 20), M.Glass, nc({ Transparency = 0.2 }))
	end
end

LOOKS.simit_tray = function(m, c)
	deco(m, c * CFrame.new(0, 0.04, 0), Vector3.new(1.3, 0.06, 0.8), WOOD, M.Wood)
	for i = -1, 1 do
		cylY(m, c * CFrame.new(i * 0.4, 0.13, -0.1), 0.12, 0.42, C(170, 100, 50), M.Sand)
		cylY(m, c * CFrame.new(i * 0.4, 0.15, -0.1), 0.1, 0.16, C(240, 230, 210))
	end
	for i = -1, 1, 2 do
		B.ellipsoid(m, c * CFrame.new(i * 0.25, 0.14, 0.22), Vector3.new(0.4, 0.18, 0.3), C(220, 170, 90), M.SmoothPlastic, nc())
	end
end


LOOKS.turkish_coffee = function(m, c)
	cabinet(m, c, 2.4, 3.2, 2)
	deco(m, c * CFrame.new(-0.3, 3.8, 0.2), Vector3.new(1, 1.1, 0.8), BLACK)
	deco(m, c * CFrame.new(-0.3, 3.9, -0.21), Vector3.new(0.7, 0.4, 0.02), STEEL, M.Metal)
	for i = 0, 1 do
		cylY(m, c * CFrame.new(0.6 + i * 0.4, 3.32, -0.3), 0.04, 0.32, WHITE)
		cylY(m, c * CFrame.new(0.6 + i * 0.4, 3.45, -0.3), 0.22, 0.18, WHITE)
	end
	label(m, c * CFrame.new(0, 5.0, 1.23), Vector3.new(2.2, 0.6, 0.04), "☕ Fresh Coffee", C(240, 220, 180), C(70, 40, 25), { font = B.Fonts.Serif })
end

LOOKS.microwave = function(m, c)
	cabinet(m, c, 2.4, 3.2, 2)
	deco(m, c * CFrame.new(0, 3.75, 0.2), Vector3.new(1.6, 0.9, 1.1), WHITE)
	deco(m, c * CFrame.new(-0.2, 3.75, -0.36), Vector3.new(1.0, 0.6, 0.02), C(30, 30, 34), M.Glass)
	deco(m, c * CFrame.new(0.55, 3.75, -0.36), Vector3.new(0.25, 0.6, 0.02), C(80, 80, 86))
end

LOOKS.drinks_fridge = function(m, c, k)
	solid(m, c * CFrame.new(0, 3.2, 0), Vector3.new(2.4, 6.4, 2.2), WHITE)
	label(m, c * CFrame.new(0, 6.1, -1.11), Vector3.new(2.2, 0.5, 0.02), "COLD DRINKS", WHITE, k.accent, { glow = true })
	deco(m, c * CFrame.new(0, 3.0, -1.05), Vector3.new(2.1, 5.2, 0.05), C(240, 250, 255), M.Neon, { Transparency = 0.6 })
	local cans = { RED, C(250, 140, 30), C(60, 170, 70), C(240, 240, 240), C(40, 90, 200) }
	for s = 0, 3 do
		deco(m, c * CFrame.new(0, 0.9 + s * 1.25, -0.6), Vector3.new(2.0, 0.06, 0.8), STEEL, M.Metal)
		for i = 0, 4 do
			cylY(m, c * CFrame.new(-0.8 + i * 0.4, 1.2 + s * 1.25, -0.6), 0.5, 0.26, cans[(s + i) % #cans + 1], M.Metal)
		end
	end
	glass(m, c * CFrame.new(0, 3.0, -1.12), Vector3.new(2.2, 5.4, 0.05), nil, 0.7)
end

LOOKS.dishwasher = function(m, c)
	cabinet(m, c, 2.4, 3.2, 2)
	deco(m, c * CFrame.new(0, 1.6, -1.02), Vector3.new(2.1, 2.8, 0.04), STEEL, M.Metal)
	deco(m, c * CFrame.new(0, 2.8, -1.08), Vector3.new(1.4, 0.1, 0.06), DARK, M.Metal)
	deco(m, c * CFrame.new(0, 3.28, 0), Vector3.new(1.4, 0.06, 1.1), STEEL, M.Metal)
	cylY(m, c * CFrame.new(0, 3.7, 0.65), 0.9, 0.12, STEEL, M.Metal)
	deco(m, c * CFrame.new(0, 4.1, 0.4), Vector3.new(0.1, 0.1, 0.6), STEEL, M.Metal)
end

LOOKS.ice_cream = function(m, c)
	solid(m, c * CFrame.new(0, 1.4, 0), Vector3.new(3.2, 2.8, 2), WHITE)
	glass(m, c * CFrame.new(0, 2.95, 0) * CFrame.Angles(math.rad(-8), 0, 0), Vector3.new(3.0, 0.08, 1.8), nil, 0.4)
	local tubs = { C(250, 200, 220), C(120, 70, 40), C(250, 240, 200), C(140, 220, 140) }
	for i = 0, 3 do
		deco(m, c * CFrame.new(-1.1 + i * 0.73, 2.7, 0), Vector3.new(0.65, 0.2, 1.2), tubs[i + 1])
	end
	label(m, c * CFrame.new(0, 1.4, -1.01), Vector3.new(2.6, 0.8, 0.02), "🍦 DONDURMA", C(200, 40, 120), WHITE)
end

LOOKS.espresso_bar = function(m, c, k)
	solid(m, c * CFrame.new(0, 1.8, 0), Vector3.new(5, 3.6, 2), C(60, 40, 30), M.Wood)
	deco(m, c * CFrame.new(0, 3.68, 0), Vector3.new(5.2, 0.15, 2.2), C(230, 230, 226), M.Marble)
	deco(m, c * CFrame.new(-1.1, 4.4, 0.3), Vector3.new(1.8, 1.3, 1.1), STEEL, M.Metal)
	deco(m, c * CFrame.new(-1.1, 5.1, 0.3), Vector3.new(1.8, 0.12, 1.1), k.accent)
	for i = -1, 1, 2 do
		cylY(m, c * CFrame.new(-1.1 + i * 0.45, 3.9, -0.3), 0.3, 0.3, WHITE)
	end
	cylY(m, c * CFrame.new(0.6, 4.3, 0.4), 1.1, 0.6, BLACK, M.Metal)
	for i = 0, 3 do
		cylY(m, c * CFrame.new(1.4 + (i % 2) * 0.35, 3.85 + (i // 2) * 0.3, 0.3), 0.28, 0.3, WHITE)
	end
	label(m, c * CFrame.new(0, 6.6, 1.42), Vector3.new(4, 1.6, 0.06), "ESPRESSO • LATTE\nCAPPUCCINO • TEA", WHITE, C(30, 34, 30), { font = B.Fonts.Hand })
end

-- Lighting --------------------------------------------------------------------------------------------
LOOKS.floor_lamp = function(m, c)
	cylY(m, c * CFrame.new(0, 0.08, 0), 0.15, 1.1, DARK, M.Metal)
	B.cylY(m, c * CFrame.new(0, 2.7, 0), 5.2, 0.14, DARK, M.Metal, nc({ CanCollide = true }))
	B.cylY(m, c * CFrame.new(0, 5.5, 0), 1.1, 1.4, C(240, 228, 200), M.Fabric, nc({ Transparency = 0.1 }))
	local bulb = ball(m, c * CFrame.new(0, 5.3, 0), 0.35, C(255, 236, 200), M.Neon)
	light(bulb, 14, 0.7)
end

local function pendant(m, c: CFrame, drop: number, shade, bulbColor, lit: boolean)
	cylY(m, c * CFrame.new(0, -drop / 2, 0), drop, 0.05, BLACK)
	cylY(m, c * CFrame.new(0, -drop - 0.3, 0), 0.6, 1.1, shade, M.Metal)
	local bulb = ball(m, c * CFrame.new(0, -drop - 0.65, 0), 0.4, bulbColor, M.Neon)
	if lit then
		light(bulb, 16, 0.8)
	end
end

LOOKS.pendant_lamps = function(m, c, k, i)
	pendant(m, c, 3.2, k.accent:Lerp(BLACK, 0.3), C(255, 230, 190), i == 1)
end

LOOKS.edison_bulbs = function(m, c, _k, i)
	for j = -1, 1 do
		local drop = 2.2 + ((i + j) % 3) * 0.6
		cylY(m, c * CFrame.new(j * 0.8, -drop / 2, 0), drop, 0.04, BLACK)
		local b = B.ball(m, c * CFrame.new(j * 0.8, -drop - 0.25, 0), 0.5, C(255, 180, 90), M.Neon, nc({ Transparency = 0.15 }))
		if j == 0 and i == 1 then
			light(b, 14, 0.6, C(255, 190, 120))
		end
	end
end

LOOKS.counter_led = function(m, c, k)
	local strip = deco(m, c * CFrame.new(0, 3.72, -1.58), Vector3.new(k.counterW, 0.08, 0.08), C(255, 240, 220), M.Neon)
	B.surfaceLight(strip, Enum.NormalId.Bottom, 8, 90, 0.8, C(255, 230, 200))
end

LOOKS.track_lights = function(m, c, _k, i)
	deco(m, c * CFrame.new(0, -0.1, 0), Vector3.new(0.25, 0.15, 8), BLACK, M.Metal)
	for j = 0, 3 do
		local head = c * CFrame.new(0, -0.5, -3 + j * 2) * CFrame.Angles(math.rad(if j % 2 == 0 then 25 else -25), 0, 0)
		cylY(m, head, 0.7, 0.4, BLACK, M.Metal)
		local lens = deco(m, head * CFrame.new(0, -0.37, 0), Vector3.new(0.3, 0.04, 0.3), C(255, 245, 220), M.Neon)
		if j == 1 and i <= 2 then
			B.spotLight(lens, Enum.NormalId.Bottom, 18, 50, 1.2, C(255, 240, 220), false)
		end
	end
end

LOOKS.window_lightbox = function(m, c, k)
	deco(m, c, Vector3.new(2.9, 1.7, 0.16), DARK, M.Metal)
	label(m, c * CFrame.new(0, 0, -0.09), Vector3.new(2.7, 1.5, 0.02), "COMPUTER\nREPAIR • SERVICE\nCUSTOM BUILDS", WHITE, k.accent, { glow = true, brightness = 1.6 })
end

LOOKS.smart_lighting = function(m, c)
	cylY(m, c * CFrame.new(0, -0.08, 0), 0.14, 0.55, WHITE)
	deco(m, c * CFrame.new(0, -0.16, 0), Vector3.new(0.12, 0.03, 0.12), C(40, 220, 120), M.Neon)
end

LOOKS.skylight = function(m, c)
	deco(m, c * CFrame.new(0, 0.05, 0), Vector3.new(5.4, 0.2, 5.4), DARK, M.Metal)
	B.box(m, c * CFrame.new(0, 0.08, 0), Vector3.new(5, 0.22, 5), C(200, 230, 255), M.Neon, nc({ Transparency = 0.35 }))
	-- the glass dome on the roof above
	B.box(m, c * CFrame.new(0, 1.52, 0), Vector3.new(5.2, 0.6, 5.2), C(170, 210, 235), M.Glass, nc({ Transparency = 0.4 }))
end

LOOKS.chandelier = function(m, c)
	cylY(m, c * CFrame.new(0, -1, 0), 2, 0.08, C(200, 170, 80), M.Metal)
	local core = B.ball(m, c * CFrame.new(0, -2.3, 0), 0.8, C(255, 240, 200), M.Neon, nc({ Transparency = 0.2 }))
	light(core, 18, 0.9)
	cylY(m, c * CFrame.new(0, -2.3, 0), 0.08, 2.6, C(200, 170, 80), M.Metal)
	for i = 0, 7 do
		local a = i * math.pi / 4
		B.ball(m, c * CFrame.new(math.cos(a) * 1.25, -2.7, math.sin(a) * 1.25), 0.35, C(230, 240, 255), M.Glass, nc({ Transparency = 0.3 }))
		deco(m, c * CFrame.new(math.cos(a) * 1.25, -3.1, math.sin(a) * 1.25), Vector3.new(0.08, 0.6, 0.08), C(230, 240, 255), M.Glass, { Transparency = 0.3 })
	end
end

-- Business --------------------------------------------------------------------------------------------
LOOKS.price_tags = function(m, c)
	deco(m, c, Vector3.new(3.6, 2.4, 0.08), C(250, 250, 246))
	label(m, c * CFrame.new(0, 0.85, -0.05), Vector3.new(3.4, 0.5, 0.02), "PRICE LIST", WHITE, C(30, 60, 120))
	label(m, c * CFrame.new(0, -0.3, -0.05), Vector3.new(3.4, 1.7, 0.02), "Diagnosis ............. Free\nReinstall Windows ..... $40\nThermal paste ......... $25\nSSD install ........... $20\nLaptop screen ......... $90", BLACK, false, { font = B.Fonts.Mono })
end

LOOKS.pos_terminal = function(m, c)
	deco(m, c * CFrame.new(0, 0.06, 0), Vector3.new(0.5, 0.12, 0.7), C(60, 60, 66))
	deco(m, c * CFrame.new(0, 0.22, 0) * CFrame.Angles(math.rad(-20), 0, 0), Vector3.new(0.38, 0.12, 0.62), BLACK)
	deco(m, c * CFrame.new(0, 0.3, -0.12) * CFrame.Angles(math.rad(-20), 0, 0), Vector3.new(0.3, 0.02, 0.22), C(60, 140, 240), M.Neon)
end

LOOKS.business_cards = function(m, c, k)
	B.box(m, c * CFrame.new(0, 0.12, 0), Vector3.new(0.55, 0.24, 0.3), WHITE, M.Glass, nc({ Transparency = 0.4 }))
	label(m, c * CFrame.new(0, 0.22, 0) * CFrame.Angles(math.rad(-15), 0, 0), Vector3.new(0.5, 0.28, 0.02), k.name, BLACK, WHITE)
end


LOOKS.opening_hours = function(m, c)
	sticker(m, c, 1.8, 1.4, "OPEN\nMon–Sat 09:00–20:00\nSun 11:00–18:00", WHITE, C(30, 30, 34))
end

LOOKS.sidewalk_sign = function(m, c)
	for s = -1, 1, 2 do
		local board = c * CFrame.new(0, 2, s * 0.5) * CFrame.Angles(math.rad(s * 14), 0, 0)
		solid(m, board, Vector3.new(1.9, 3.8, 0.1), C(60, 40, 30), M.Wood)
		if s < 0 then
			label(m, board * CFrame.new(0, 0, -0.06), Vector3.new(1.6, 3.4, 0.02), "TODAY\nThermal paste\nservice\n20% off!", WHITE, C(30, 34, 30), { font = B.Fonts.Hand })
		end
	end
end

LOOKS.cash_register = function(m, c)
	deco(m, c * CFrame.new(0, 0.25, 0), Vector3.new(1, 0.5, 0.8), C(230, 226, 214))
	deco(m, c * CFrame.new(0, 0.55, 0.15) * CFrame.Angles(math.rad(-15), 0, 0), Vector3.new(0.8, 0.12, 0.4), C(80, 80, 86))
	label(m, c * CFrame.new(0, 0.85, 0.25), Vector3.new(0.6, 0.25, 0.04), "TOPLAM 0,00", C(80, 255, 120), C(10, 20, 10), { glow = true, font = B.Fonts.Mono })
	cylX(m, c * CFrame.new(0, 0.6, 0.35), 0.4, 0.2, WHITE)
end

LOOKS.open_sign = function(m, c)
	deco(m, c * CFrame.new(0, 0, 0.04), Vector3.new(2.2, 1, 0.05), BLACK)
	label(m, c * CFrame.new(0, 0, -0.01), Vector3.new(2.1, 0.9, 0.02), "OPEN", C(255, 60, 60), false, { glow = true, brightness = 2.4, font = B.Fonts.Display })
end

LOOKS.map_listing = function(m, c)
	sticker(m, c, 1.6, 1.2, "📍 Bizi haritada\nbulun!\n★★★★★", C(30, 30, 30), WHITE)
end

LOOKS.social_media = function(m, c, k)
	sticker(m, c, 1.8, 1.0, "📱 Bizi takip edin!\n@" .. k.handle, WHITE, C(200, 50, 140))
end

LOOKS.flag_banner = function(m, c, k)
	for i = 0, 1 do
		deco(m, c * CFrame.new(0, 0.1, 0) * CFrame.Angles(0, i * math.pi / 2, 0), Vector3.new(1.4, 0.15, 0.15), DARK, M.Metal)
	end
	B.cylY(m, c * CFrame.new(0, 4.5, 0), 9, 0.12, STEEL, M.Metal, nc({ CanCollide = true }))
	local f = label(m, c * CFrame.new(0.75, 5.3, 0), Vector3.new(1.4, 6.6, 0.05), "R\nE\nP\nA\nI\nR", WHITE, k.accent)
	f.Material = M.Fabric
end

LOOKS.gift_wrap = function(m, c)
	for i = 0, 1 do
		local b = c * CFrame.new(-0.25 + i * 0.5, 0.18 + i * 0.05, 0)
		local size = 0.36 + i * 0.1
		deco(m, b, Vector3.new(size, size, size), if i == 0 then C(220, 40, 60) else C(40, 120, 200))
		deco(m, b, Vector3.new(size + 0.02, size + 0.02, 0.06), C(250, 210, 60))
		deco(m, b, Vector3.new(0.06, size + 0.02, size + 0.02), C(250, 210, 60))
		ball(m, b * CFrame.new(0, size / 2 + 0.05, 0), 0.14, C(250, 210, 60))
	end
end

LOOKS.loyalty_cards = function(m, c, k)
	deco(m, c * CFrame.new(0, 0.3, 0.05) * CFrame.Angles(math.rad(-10), 0, 0), Vector3.new(0.7, 0.55, 0.04), k.accent)
	label(m, c * CFrame.new(0, 0.3, 0.02) * CFrame.Angles(math.rad(-10), 0, 0), Vector3.new(0.65, 0.5, 0.01), "10th REPAIR\nIS ON US!\n● ● ● ○ ○", WHITE, false)
end

local function certificate(m, c, w: number, h: number, text: string, seal)
	frame(m, c, w, h, C(196, 160, 70), function(f, iw, ih)
		label(m, f, Vector3.new(iw, ih, 0.02), text, C(30, 40, 80), C(250, 248, 240), { font = B.Fonts.Serif })
	end)
	cylZ(m, c * CFrame.new(w / 2 - 0.45, -h / 2 + 0.4, -0.1), 0.04, 0.42, seal or C(200, 40, 40))
end

LOOKS.warranty_system = function(m, c)
	certificate(m, c, 2.4, 1.8, "WARRANTY\nCERTIFICATE\n6 months on all repairs", C(200, 160, 40))
end

LOOKS.reviews_screen = function(m, c)
	screen(m, c, 3.8, 2.0, "★★★★★  4.9\n“Fixed it so fast!”\n“These guys know their stuff.”", C(255, 220, 90), C(20, 26, 40))
end

LOOKS.delivery_scooter = function(m, c, k)
	local body = c * CFrame.Angles(0, math.pi / 2, 0)
	for z = -1, 1, 2 do
		B.cyl(m, body * CFrame.new(0, 0.55, z * 1.2), 0.35, 1.1, BLACK, M.Rubber, nc())
	end
	solid(m, body * CFrame.new(0, 1.15, 0.15), Vector3.new(0.9, 0.9, 2.2), k.accent)
	deco(m, body * CFrame.new(0, 1.75, 0.4), Vector3.new(0.7, 0.2, 1.1), BLACK, M.Leather)
	deco(m, body * CFrame.new(0, 1.9, -1.05) * CFrame.Angles(math.rad(20), 0, 0), Vector3.new(0.3, 1.4, 0.3), k.accent)
	deco(m, body * CFrame.new(0, 2.55, -1.25), Vector3.new(1.3, 0.1, 0.1), BLACK, M.Metal)
	solid(m, body * CFrame.new(0, 2.4, 1.05), Vector3.new(1.2, 1.1, 1.1), WHITE)
	label(m, body * CFrame.new(0.61, 2.4, 1.05) * CFrame.Angles(0, -math.pi / 2, 0), Vector3.new(1.0, 0.8, 0.02), "🔧\n" .. k.name, k.accent, WHITE)
end

LOOKS.iso_cert = function(m, c)
	certificate(m, c, 2.4, 1.8, "ISO 9001:2015\nQUALITY MANAGEMENT\nSYSTEM", C(40, 90, 180))
end

LOOKS.roof_billboard = function(m, c, k)
	for x = -1, 1, 2 do
		solid(m, c * CFrame.new(x * 6, 6, 0.4), Vector3.new(0.6, 12, 0.6), DARK, M.Metal)
	end
	solid(m, c * CFrame.new(0, 12.5, 0), Vector3.new(16, 5, 0.5), k.accent)
	label(m, c * CFrame.new(0, 12.5, -0.26), Vector3.new(15.6, 4.6, 0.02), k.name .. "\nCOMPUTER REPAIR • BUILDS", WHITE, false, { glow = true, brightness = 1.8, font = B.Fonts.Display })
end

LOOKS.roof_letters = function(m, c, k)
	local text = string.upper(k.name)
	local n = math.min(utf8.len(text) or #text, 16)
	local w = math.min(1.15, 17 / math.max(1, n))
	deco(m, c * CFrame.new(0, 6.6, 0.3), Vector3.new(w * n + 0.6, 0.25, 0.25), DARK, M.Metal)
	for x = -1, 1, 2 do
		solid(m, c * CFrame.new(x * (w * n / 2), 3.3, 0.3), Vector3.new(0.3, 6.6, 0.3), DARK, M.Metal)
	end
	local i = 0
	for _, code in utf8.codes(text) do
		i += 1
		if i > n then
			break
		end
		local ch = utf8.char(code)
		if ch ~= " " then
			label(m, c * CFrame.new(-w * n / 2 + w * (i - 0.5), 7.6, 0.3), Vector3.new(w * 0.9, 1.8, 0.3), ch, k.accent:Lerp(WHITE, 0.4), C(30, 30, 34), { glow = true, brightness = 2, font = B.Fonts.Display })
		end
	end
end

LOOKS.authorised = function(m, c)
	deco(m, c, Vector3.new(2.6, 1.5, 0.1), C(210, 175, 70), M.Metal)
	label(m, c * CFrame.new(0, 0, -0.06), Vector3.new(2.4, 1.3, 0.02), "★ AUTHORISED ★\nSERVICE", C(20, 40, 90), C(240, 236, 220), { font = B.Fonts.Serif })
end

-- Safety --------------------------------------------------------------------------------------------
LOOKS.license = function(m, c, k)
	certificate(m, c, 2, 2.6, "BUSINESS\nOPERATING LICENCE\n\n" .. k.name .. "\nRuhsat No: 2026/" .. (100 + (k.plotId or 1)), C(200, 40, 40))
end

LOOKS.fire_extinguisher = function(m, c)
	deco(m, c * CFrame.new(0, 0, 0.1), Vector3.new(0.6, 0.3, 0.12), DARK, M.Metal)
	B.cylY(m, c * CFrame.new(0, -0.1, -0.25), 1.8, 0.62, RED, M.Metal, nc())
	deco(m, c * CFrame.new(0, 0.95, -0.25), Vector3.new(0.3, 0.3, 0.2), BLACK)
	deco(m, c * CFrame.new(0.3, 0.3, -0.45) * CFrame.Angles(0, 0, math.rad(-20)), Vector3.new(0.08, 1.1, 0.08), BLACK)
	label(m, c * CFrame.new(0, 1.7, 0.05), Vector3.new(1, 0.5, 0.03), "🧯 FIRE EXTINGUISHER", WHITE, RED)
end

LOOKS.first_aid = function(m, c)
	deco(m, c, Vector3.new(1.4, 1.1, 0.4), WHITE)
	deco(m, c * CFrame.new(0, 0.05, -0.21), Vector3.new(0.5, 0.15, 0.02), C(30, 150, 70))
	deco(m, c * CFrame.new(0, 0.05, -0.21), Vector3.new(0.15, 0.5, 0.02), C(30, 150, 70))
	label(m, c * CFrame.new(0, -0.38, -0.21), Vector3.new(1.2, 0.22, 0.01), "FIRST AID", C(30, 150, 70), false)
end

LOOKS.fire_blanket = function(m, c)
	label(m, c, Vector3.new(1, 1.2, 0.25), "FIRE\nBLANKET", WHITE, RED)
	for x = -1, 1, 2 do
		deco(m, c * CFrame.new(x * 0.25, -0.75, -0.05), Vector3.new(0.12, 0.35, 0.05), BLACK)
	end
end

LOOKS.safety_kit = function(m, c)
	deco(m, c, Vector3.new(1.6, 1.2, 0.08), C(220, 200, 150), M.Wood)
	for x = -1, 1, 2 do
		B.cylZ(m, c * CFrame.new(-0.35 + x * 0.22, 0.2, -0.08), 0.06, 0.38, C(200, 230, 240), M.Glass, nc({ Transparency = 0.3 }))
	end
	deco(m, c * CFrame.new(-0.35, 0.2, -0.1), Vector3.new(0.9, 0.05, 0.03), BLACK)
	for x = 0, 1 do
		B.ellipsoid(m, c * CFrame.new(0.35 + x * 0.3, -0.15, -0.1), Vector3.new(0.25, 0.6, 0.1), C(40, 110, 220), M.Rubber, nc())
	end
end

LOOKS.exit_sign = function(m, c)
	label(m, c, Vector3.new(2, 0.7, 0.15), "🏃 EMERGENCY EXIT", WHITE, C(20, 150, 70), { glow = true, brightness = 1.5 })
end

LOOKS.smoke_detector = function(m, c)
	cylY(m, c * CFrame.new(0, -0.08, 0), 0.16, 0.65, WHITE)
	deco(m, c * CFrame.new(0.18, -0.17, 0), Vector3.new(0.06, 0.02, 0.06), C(255, 40, 40), M.Neon)
end

LOOKS.emergency_light = function(m, c)
	deco(m, c, Vector3.new(1.5, 0.45, 0.3), WHITE)
	label(m, c * CFrame.new(0, 0, -0.16), Vector3.new(1.3, 0.35, 0.01), "EMERGENCY", C(20, 150, 70), false, { glow = true })
end

LOOKS.kvkk_notice = function(m, c)
	frame(m, c, 2, 2.4, C(40, 40, 44), function(f, w, h)
		label(m, f, Vector3.new(w, h, 0.02), "DATA PROTECTION\n\nWe only use the data\non your device\nfor the repair.", C(30, 30, 30), WHITE, { font = B.Fonts.Medium })
	end)
end

LOOKS.fume_extractor = function(m, c)
	deco(m, c * CFrame.new(0, 0.45, 0), Vector3.new(0.9, 0.9, 0.5), BLACK)
	cylZ(m, c * CFrame.new(0, 0.45, -0.26), 0.04, 0.7, C(60, 60, 66))
	for i = -1, 1 do
		deco(m, c * CFrame.new(0, 0.45 + i * 0.18, -0.29), Vector3.new(0.6, 0.04, 0.02), C(90, 90, 96))
	end
	deco(m, c * CFrame.new(0.3, 0.12, -0.27), Vector3.new(0.1, 0.06, 0.02), C(60, 220, 120), M.Neon)
end

LOOKS.sprinklers = function(m, c, _k, i)
	cylZ(m, c * CFrame.new(0, -0.15, 0), 4.4, 0.18, RED, M.Metal)
	for j = -1, 1, 2 do
		cylY(m, c * CFrame.new(0, -0.32, j * 1.5), 0.2, 0.1, C(200, 170, 80), M.Metal)
		cylY(m, c * CFrame.new(0, -0.45, j * 1.5), 0.06, 0.32, C(200, 170, 80), M.Metal)
	end
	_ = i
end

LOOKS.cleaning_cart = function(m, c)
	solid(m, c * CFrame.new(0, 1.2, 0), Vector3.new(1.6, 2.4, 1.1), C(250, 200, 40))
	B.cylY(m, c * CFrame.new(-0.3, 0.7, -0.75), 0.9, 0.8, C(40, 110, 220), M.SmoothPlastic, nc())
	deco(m, c * CFrame.new(0.45, 2.6, -0.5) * CFrame.Angles(math.rad(10), 0, 0), Vector3.new(0.08, 4.2, 0.08), C(150, 150, 150), M.Metal)
	for i = 0, 1 do
		cylY(m, c * CFrame.new(-0.3 + i * 0.35, 2.75, 0.2), 0.7, 0.25, if i == 0 then C(60, 180, 230) else C(240, 80, 120))
	end
end

-- Workshop --------------------------------------------------------------------------------------------
LOOKS.label_maker = function(m, c)
	deco(m, c * CFrame.new(0, 0.12, 0), Vector3.new(0.45, 0.24, 0.75), C(40, 90, 180))
	deco(m, c * CFrame.new(0, 0.25, -0.15), Vector3.new(0.3, 0.02, 0.25), C(200, 220, 230))
	deco(m, c * CFrame.new(0, 0.1, -0.42), Vector3.new(0.18, 0.02, 0.15), WHITE)
end

LOOKS.parts_drawers = function(m, c)
	deco(m, c * CFrame.new(0, 0.45, 0), Vector3.new(1.2, 0.9, 0.6), C(40, 80, 160))
	for row = 0, 2 do
		for col = 0, 2 do
			deco(m, c * CFrame.new(-0.38 + col * 0.38, 0.18 + row * 0.28, -0.31), Vector3.new(0.32, 0.22, 0.02), C(200, 220, 240), M.Glass)
		end
	end
end

LOOKS.cable_reels = function(m, c)
	deco(m, c * CFrame.new(0, 0.6, 0.05), Vector3.new(3, 0.12, 0.12), DARK, M.Metal)
	local cols = { RED, C(40, 120, 220), C(250, 200, 40) }
	for i = 0, 2 do
		local r = c * CFrame.new(-1 + i, 0, -0.25)
		cylZ(m, r, 0.4, 1.0, cols[i + 1])
		cylZ(m, r * CFrame.new(0, 0, -0.01), 0.42, 0.35, DARK)
	end
end

LOOKS.lab_psu = function(m, c)
	deco(m, c * CFrame.new(0, 0.35, 0), Vector3.new(1.2, 0.7, 0.9), C(70, 74, 80), M.Metal)
	label(m, c * CFrame.new(-0.3, 0.45, -0.46), Vector3.new(0.45, 0.2, 0.01), "12.00", C(255, 60, 40), BLACK, { glow = true, font = B.Fonts.Mono })
	label(m, c * CFrame.new(0.25, 0.45, -0.46), Vector3.new(0.45, 0.2, 0.01), "1.50A", C(60, 255, 120), BLACK, { glow = true, font = B.Fonts.Mono })
	for i = 0, 1 do
		ball(m, c * CFrame.new(-0.3 + i * 0.55, 0.15, -0.47), 0.12, if i == 0 then RED else BLACK)
	end
end

LOOKS.tool_cart = function(m, c)
	solid(m, c * CFrame.new(0, 1.5, 0), Vector3.new(2, 2.6, 1.2), RED, M.Metal)
	for i = 0, 2 do
		deco(m, c * CFrame.new(0, 0.7 + i * 0.75, -0.61), Vector3.new(1.8, 0.04, 0.02), C(140, 20, 20), M.Metal)
	end
	deco(m, c * CFrame.new(1.06, 2.2, 0), Vector3.new(0.08, 0.08, 1.2), STEEL, M.Metal)
	for x = -1, 1, 2 do
		for z = -1, 1, 2 do
			cylX(m, c * CFrame.new(x * 0.8, 0.15, z * 0.45), 0.12, 0.3, BLACK, M.Rubber)
		end
	end
	deco(m, c * CFrame.new(-0.4, 2.9, 0), Vector3.new(0.6, 0.15, 0.2), C(250, 200, 40))
end

LOOKS.esd_vacuum = function(m, c)
	B.cylY(m, c * CFrame.new(0, 0.8, 0), 1.4, 1.0, C(30, 60, 120), M.SmoothPlastic)
	cylY(m, c * CFrame.new(0, 1.6, 0), 0.25, 0.9, BLACK)
	deco(m, c * CFrame.new(0.4, 1.9, -0.2) * CFrame.Angles(math.rad(30), 0, math.rad(-20)), Vector3.new(0.15, 1.4, 0.15), BLACK)
end

LOOKS.dual_monitors = function(m, c)
	deco(m, c * CFrame.new(0, 0.05, 0), Vector3.new(0.5, 0.06, 0.4), DARK)
	deco(m, c * CFrame.new(0, 0.3, 0.05), Vector3.new(0.08, 0.5, 0.08), DARK)
	screen(m, c * CFrame.new(0, 0.85, 0), 1.2, 0.68, "CPU 41°C\nGPU 38°C", C(100, 220, 255), C(10, 16, 26))
end

LOOKS.compressor = function(m, c)
	cylX(m, c * CFrame.new(0, 0.9, 0), 2.2, 1.2, RED, M.Metal)
	deco(m, c * CFrame.new(-0.2, 1.75, 0), Vector3.new(1.1, 0.6, 0.7), C(40, 40, 44), M.Metal)
	cylZ(m, c * CFrame.new(0.6, 1.7, -0.36), 0.06, 0.4, WHITE)
	for x = -1, 1, 2 do
		cylX(m, c * CFrame.new(x * 0.8, 0.25, 0.5), 0.15, 0.5, BLACK, M.Rubber)
	end
end

LOOKS.hot_air = function(m, c)
	deco(m, c * CFrame.new(0, 0.3, 0), Vector3.new(1.1, 0.6, 0.8), C(220, 216, 200))
	label(m, c * CFrame.new(-0.2, 0.38, -0.41), Vector3.new(0.5, 0.2, 0.01), "350°C", C(255, 80, 40), BLACK, { glow = true, font = B.Fonts.Mono })
	deco(m, c * CFrame.new(0.45, 0.75, 0), Vector3.new(0.12, 0.5, 0.12), STEEL, M.Metal)
	cylY(m, c * CFrame.new(0.45, 1.05, 0), 0.4, 0.18, BLACK)
end

LOOKS.ultrasonic = function(m, c)
	deco(m, c * CFrame.new(0, 0.3, 0), Vector3.new(1.1, 0.6, 0.7), STEEL, M.Metal)
	deco(m, c * CFrame.new(0, 0.61, 0.05), Vector3.new(0.9, 0.02, 0.5), C(160, 210, 230), M.Glass, { Transparency = 0.3 })
	label(m, c * CFrame.new(0, 0.2, -0.36), Vector3.new(0.6, 0.18, 0.01), "40 kHz", C(60, 200, 255), BLACK, { glow = true, font = B.Fonts.Mono })
end

LOOKS.spare_cabinet = function(m, c)
	solid(m, c * CFrame.new(0, 3.25, 0), Vector3.new(3, 6.5, 1.6), C(120, 130, 140), M.Metal)
	deco(m, c * CFrame.new(0, 3.25, -0.81), Vector3.new(0.05, 6.2, 0.02), DARK)
	for x = -1, 1, 2 do
		deco(m, c * CFrame.new(x * 0.25, 3.4, -0.84), Vector3.new(0.08, 0.6, 0.06), DARK, M.Metal)
	end
	label(m, c * CFrame.new(0, 5.8, -0.82), Vector3.new(2, 0.45, 0.02), "SPARE PARTS", WHITE, C(40, 44, 52))
end

LOOKS.screen_separator = function(m, c)
	deco(m, c * CFrame.new(0, 0.18, 0), Vector3.new(1.2, 0.35, 0.9), BLACK)
	deco(m, c * CFrame.new(0, 0.37, 0.05), Vector3.new(0.9, 0.04, 0.6), STEEL, M.Metal)
	label(m, c * CFrame.new(0.4, 0.18, -0.46), Vector3.new(0.3, 0.15, 0.01), "80°", C(255, 140, 40), BLACK, { glow = true, font = B.Fonts.Mono })
end

LOOKS.oscilloscope = function(m, c)
	deco(m, c * CFrame.new(0, 0.38, 0), Vector3.new(1.3, 0.75, 0.7), C(200, 204, 210))
	label(m, c * CFrame.new(-0.25, 0.42, -0.36), Vector3.new(0.65, 0.48, 0.01), "∿∿∿∿", C(80, 255, 140), C(10, 20, 14), { glow = true, font = B.Fonts.Mono })
	for i = 0, 3 do
		cylZ(m, c * CFrame.new(0.32 + (i % 2) * 0.2, 0.55 - (i // 2) * 0.25, -0.37), 0.04, 0.12, BLACK)
	end
end

LOOKS.pallet_jack = function(m, c)
	for x = -1, 1, 2 do
		deco(m, c * CFrame.new(x * 0.55, 0.2, 0.2), Vector3.new(0.4, 0.25, 3.4), C(240, 140, 30), M.Metal, { CanCollide = true })
	end
	solid(m, c * CFrame.new(0, 0.7, -1.6), Vector3.new(1.4, 0.9, 0.6), C(240, 140, 30), M.Metal)
	deco(m, c * CFrame.new(0, 2.0, -1.95) * CFrame.Angles(math.rad(-15), 0, 0), Vector3.new(0.12, 2.4, 0.12), DARK, M.Metal)
	deco(m, c * CFrame.new(0, 3.15, -2.25), Vector3.new(0.9, 0.12, 0.12), BLACK, M.Rubber)
	Props.pallet(m, c * CFrame.new(0, 0.33, 0.4))
	for i = 0, 1 do
		Props.crate(m, c * CFrame.new(-0.4 + i * 0.8, 1.3, 0.4), 1.2)
	end
end

LOOKS.burn_in_rack = function(m, c, k)
	for x = -1, 1, 2 do
		for z = -1, 1, 2 do
			solid(m, c * CFrame.new(x * 1.9, 3, z * 0.85), Vector3.new(0.15, 6, 0.15), DARK, M.Metal)
		end
	end
	for s = 0, 2 do
		local y = 0.6 + s * 2
		deco(m, c * CFrame.new(0, y, 0), Vector3.new(3.9, 0.1, 1.8), STEEL, M.Metal)
		for i = -1, 1, 2 do
			local pc = c * CFrame.new(i * 0.9, y + 0.65, 0)
			deco(m, pc, Vector3.new(1.4, 1.2, 1.4), BLACK)
			local led = deco(m, pc * CFrame.new(0, 0.45, -0.71), Vector3.new(1.0, 0.06, 0.02), k.accent, M.Neon)
			led:AddTag("RackLed")
		end
	end
	label(m, c * CFrame.new(0, 5.8, -0.88), Vector3.new(3.6, 0.5, 0.05), "BURN-IN TEST", WHITE, C(200, 40, 40))
end

LOOKS.printer_3d = function(m, c, k)
	solid(m, c * CFrame.new(0, 1.5, 0), Vector3.new(2.6, 3, 2), WHITE)
	for x = -1, 1, 2 do
		for z = -1, 1, 2 do
			deco(m, c * CFrame.new(x * 0.8, 4, z * 0.7), Vector3.new(0.1, 2, 0.1), BLACK, M.Metal)
		end
	end
	deco(m, c * CFrame.new(0, 5.0, 0), Vector3.new(1.7, 0.1, 1.5), BLACK, M.Metal)
	deco(m, c * CFrame.new(0, 3.1, 0), Vector3.new(1.4, 0.06, 1.2), C(60, 60, 64), M.Metal)
	ball(m, c * CFrame.new(0, 3.35, 0), 0.45, k.accent)
	cylZ(m, c * CFrame.new(0.9, 5.45, 0), 0.3, 0.7, C(250, 140, 40))
end

LOOKS.pallet_rack = function(m, c, k)
	for i = -1, 1 do
		for z = -1, 1, 2 do
			solid(m, c * CFrame.new(i * 3.9, 4.5, z * 1.1), Vector3.new(0.2, 9, 0.2), C(40, 80, 170), M.Metal)
		end
	end
	for s = 0, 2 do
		local y = 0.4 + s * 3
		for z = -1, 1, 2 do
			deco(m, c * CFrame.new(0, y, z * 1.1), Vector3.new(8, 0.25, 0.15), C(240, 120, 30), M.Metal)
		end
		deco(m, c * CFrame.new(0, y + 0.15, 0), Vector3.new(7.8, 0.06, 2.2), C(180, 150, 110), M.Wood)
		for b = 0, 2 do
			local size = 0.9 + k.rng:NextNumber() * 0.9
			deco(m, c * CFrame.new(-2.6 + b * 2.6, y + 0.2 + size / 2, 0), Vector3.new(size * 1.4, size, 1.6), C(196, 160, 110), M.Cardboard)
		end
	end
	label(m, c * CFrame.new(0, 9.2, -1.2), Vector3.new(1.6, 0.5, 0.02), "DEPO", WHITE, C(40, 80, 170))
end

LOOKS.bga_station = function(m, c)
	cabinet(m, c, 3, 3, 2.4, C(200, 204, 210))
	solid(m, c * CFrame.new(0, 3.8, 0.2), Vector3.new(2.6, 1.4, 1.8), WHITE)
	deco(m, c * CFrame.new(0, 5.8, 0.5), Vector3.new(0.6, 2.6, 0.6), WHITE)
	deco(m, c * CFrame.new(0, 6.6, -0.2), Vector3.new(1.2, 0.6, 1.4), C(60, 60, 66))
	deco(m, c * CFrame.new(0, 4.55, -0.2), Vector3.new(1.0, 0.04, 0.8), C(30, 120, 60))
	label(m, c * CFrame.new(1.0, 3.9, -0.71), Vector3.new(0.6, 0.4, 0.01), "245°C", C(255, 120, 40), BLACK, { glow = true, font = B.Fonts.Mono })
end

-- IT --------------------------------------------------------------------------------------------
LOOKS.office_pc = function(m, c)
	local back = c * CFrame.Angles(0, math.pi, 0)
	deco(m, back * CFrame.new(0, 0.05, 0), Vector3.new(0.6, 0.06, 0.45), DARK)
	deco(m, back * CFrame.new(0, 0.35, 0.05), Vector3.new(0.08, 0.6, 0.08), DARK)
	screen(m, back * CFrame.new(0, 0.95, 0), 1.3, 0.75, "CUSTOMER LOG\n#1042", WHITE, C(20, 60, 120))
	deco(m, back * CFrame.new(0, 0.04, -0.7), Vector3.new(1.1, 0.05, 0.35), C(40, 40, 44))
end

LOOKS.laser_printer = function(m, c)
	cabinet(m, c, 2, 2.6, 1.4, C(200, 200, 204))
	deco(m, c * CFrame.new(0, 3.15, 0), Vector3.new(1.4, 0.9, 1.1), C(70, 74, 80))
	deco(m, c * CFrame.new(0, 3.3, -0.58), Vector3.new(1.0, 0.04, 0.4), WHITE)
end

LOOKS.mesh_wifi = function(m, c)
	cylY(m, c * CFrame.new(0, -0.12, 0), 0.22, 0.8, WHITE)
	deco(m, c * CFrame.new(0, -0.24, 0), Vector3.new(0.1, 0.02, 0.1), C(60, 160, 255), M.Neon)
end

LOOKS.fiber = function(m, c)
	label(m, c * CFrame.new(0, 0.3, 0), Vector3.new(1.2, 0.8, 0.35), "FIBRE", C(40, 40, 40), WHITE)
	deco(m, c * CFrame.new(0, -0.45, -0.1), Vector3.new(1.2, 0.25, 0.5), BLACK)
	for x = -1, 1, 2 do
		deco(m, c * CFrame.new(x * 0.45, -0.1, -0.1) * CFrame.Angles(0, 0, math.rad(x * 10)), Vector3.new(0.06, 0.6, 0.06), BLACK)
	end
	deco(m, c * CFrame.new(-0.3, -0.45, -0.36), Vector3.new(0.4, 0.04, 0.02), C(60, 160, 255), M.Neon)
	deco(m, c * CFrame.new(0.5, 1.6, 0.05), Vector3.new(0.06, 2.2, 0.06), C(250, 220, 40))
end

LOOKS.ups = function(m, c)
	solid(m, c * CFrame.new(0, 1.3, 0), Vector3.new(1, 2.6, 1.6), BLACK)
	label(m, c * CFrame.new(0, 2.1, -0.81), Vector3.new(0.6, 0.35, 0.01), "100%", C(80, 255, 120), C(10, 20, 10), { glow = true, font = B.Fonts.Mono })
end

LOOKS.nas_backup = function(m, c)
	deco(m, c * CFrame.new(0, 0.42, 0), Vector3.new(0.8, 0.85, 0.8), BLACK)
	for i = 0, 3 do
		deco(m, c * CFrame.new(-0.27 + i * 0.18, 0.42, -0.41), Vector3.new(0.14, 0.7, 0.02), C(50, 50, 56))
		deco(m, c * CFrame.new(-0.27 + i * 0.18, 0.7, -0.43), Vector3.new(0.05, 0.05, 0.02), C(60, 160, 255), M.Neon)
	end
end

LOOKS.crm = function(m, c)
	deco(m, c * CFrame.new(0, 0.1, 0.1), Vector3.new(0.3, 0.2, 0.3), DARK)
	local tab = c * CFrame.new(0, 0.5, 0) * CFrame.Angles(math.rad(-20), 0, 0)
	deco(m, tab, Vector3.new(0.95, 0.65, 0.05), BLACK)
	label(m, tab * CFrame.new(0, 0, -0.03), Vector3.new(0.85, 0.55, 0.01), "Welcome!\nYour ticket: #1042", WHITE, C(30, 90, 160), { glow = true })
end

LOOKS.network_cabinet = function(m, c)
	deco(m, c, Vector3.new(2, 2, 1), DARK, M.Metal)
	label(m, c * CFrame.new(0, 0.5, -0.51), Vector3.new(1.7, 0.3, 0.02), "▪▪▪▪▪▪▪▪▪▪▪▪", C(240, 240, 240), C(60, 60, 66), { font = B.Fonts.Mono })
	deco(m, c * CFrame.new(0, 0, -0.51), Vector3.new(1.7, 0.3, 0.02), C(30, 30, 34))
	for i = 0, 5 do
		local led = deco(m, c * CFrame.new(-0.7 + i * 0.28, 0, -0.53), Vector3.new(0.06, 0.06, 0.02), C(80, 255, 120), M.Neon)
		led:AddTag("RackLed")
	end
	glass(m, c * CFrame.new(0, 0, -0.56), Vector3.new(1.9, 1.9, 0.04), nil, 0.6)
end

LOOKS.smart_panel = function(m, c)
	screen(m, c, 1.2, 0.8, "🌡 22°C\n💡 OTO  ⚡ 4.2 kW", WHITE, C(20, 30, 50))
end

LOOKS.server_rack = function(m, c)
	solid(m, c * CFrame.new(0, 3.5, 0), Vector3.new(2.2, 7, 2.4), BLACK, M.Metal)
	for i = 0, 7 do
		local u = c * CFrame.new(0, 0.9 + i * 0.75, -1.15)
		deco(m, u, Vector3.new(1.9, 0.55, 0.06), C(40, 40, 46), M.Metal)
		for j = 0, 2 do
			local led = deco(m, u * CFrame.new(0.5 + j * 0.15, 0.1, -0.04), Vector3.new(0.06, 0.06, 0.02), if j == 0 then C(80, 255, 120) else C(60, 160, 255), M.Neon)
			led:AddTag("RackLed")
		end
	end
	glass(m, c * CFrame.new(0, 3.5, -1.24), Vector3.new(2.1, 6.8, 0.04), C(80, 90, 110), 0.55)
end

-- Energy --------------------------------------------------------------------------------------------
LOOKS.timer_switches = function(m, c)
	deco(m, c, Vector3.new(1.1, 0.8, 0.25), C(230, 230, 226))
	for x = -1, 1, 2 do
		cylZ(m, c * CFrame.new(x * 0.27, 0, -0.14), 0.04, 0.4, C(250, 250, 250))
		deco(m, c * CFrame.new(x * 0.27, 0.08, -0.17), Vector3.new(0.04, 0.16, 0.02), RED)
	end
end

LOOKS.water_tank = function(m, c)
	for x = -1, 1, 2 do
		solid(m, c * CFrame.new(x * 1.2, 0.5, 0), Vector3.new(0.3, 1, 2.2), DARK, M.Metal)
	end
	B.cyl(m, c * CFrame.new(0, 2.2, 0), 3.6, 2.6, C(236, 236, 230), M.SmoothPlastic)
end

LOOKS.solar_water = function(m, c)
	for x = -1, 1, 2 do
		local panel = c * CFrame.new(x * 1.15, 1.3, 0.3) * CFrame.Angles(math.rad(-40), 0, 0)
		deco(m, panel, Vector3.new(2.1, 2.8, 0.12), C(20, 40, 80), M.Glass)
		deco(m, panel * CFrame.new(0, 0, 0.08), Vector3.new(2.2, 2.9, 0.06), STEEL, M.Metal)
	end
	B.cyl(m, c * CFrame.new(0, 2.7, 1.4), 4.6, 1.3, C(236, 236, 230), M.Metal)
	for x = -1, 1, 2 do
		deco(m, c * CFrame.new(x * 2.1, 1.1, 1.4), Vector3.new(0.15, 2.2, 0.15), STEEL, M.Metal)
	end
end

LOOKS.rainwater = function(m, c)
	B.cylY(m, c * CFrame.new(0, 1.8, 0), 3.6, 2.4, C(40, 90, 50), M.SmoothPlastic)
	deco(m, c * CFrame.new(0.9, 6.5, 0.6), Vector3.new(0.3, 9.4, 0.3), STEEL, M.Metal)
	deco(m, c * CFrame.new(0, 0.6, -1.25), Vector3.new(0.2, 0.15, 0.3), STEEL, M.Metal)
end

LOOKS.ev_charger = function(m, c, k)
	solid(m, c * CFrame.new(0, 2.25, 0), Vector3.new(0.9, 4.5, 0.6), WHITE)
	deco(m, c * CFrame.new(0, 3.9, -0.31), Vector3.new(0.9, 0.25, 0.02), k.accent, M.Neon)
	label(m, c * CFrame.new(0, 3.1, -0.31), Vector3.new(0.6, 0.5, 0.01), "⚡ EV", WHITE, C(20, 30, 40), { glow = true })
	deco(m, c * CFrame.new(0.5, 1.8, -0.2), Vector3.new(0.1, 1.6, 0.1), BLACK)
	deco(m, c * CFrame.new(0, 0.07, -2.6), Vector3.new(2.4, 0.04, 4), C(60, 170, 90), M.SmoothPlastic, { Transparency = 0.3 })
end

LOOKS.heat_pump = function(m, c)
	solid(m, c * CFrame.new(0, 1.2, 0), Vector3.new(3, 2.4, 1.2), WHITE)
	cylZ(m, c * CFrame.new(-0.4, 1.2, -0.61), 0.06, 1.8, C(60, 60, 64))
	deco(m, c * CFrame.new(1.1, 1.2, -0.61), Vector3.new(0.5, 1.6, 0.02), C(200, 200, 200))
end

LOOKS.wind_turbine = function(m, c)
	B.cylY(m, c * CFrame.new(0, 4, 0), 8, 0.35, WHITE, M.Metal)
	deco(m, c * CFrame.new(0, 8.1, 0.2), Vector3.new(0.6, 0.6, 1.2), WHITE)
	local hub = c * CFrame.new(0, 8.1, -0.45)
	ball(m, hub, 0.45, WHITE)
	for i = 0, 2 do
		deco(m, hub * CFrame.Angles(0, 0, i * math.pi * 2 / 3) * CFrame.new(0, 1.3, 0), Vector3.new(0.3, 2.6, 0.08), WHITE)
	end
end

LOOKS.solar = function(m, c, k)
	local cols = math.max(2, math.floor(math.min(k.W - 8, 20) / 3.4))
	for row = 0, 1 do
		for col = 0, cols - 1 do
			local p = c * CFrame.new(-((cols - 1) * 3.4) / 2 + col * 3.4, 1, -1.8 + row * 3.6) * CFrame.Angles(math.rad(-25), 0, 0)
			deco(m, p, Vector3.new(3.2, 0.1, 2.6), C(20, 36, 80), M.Glass)
			deco(m, p * CFrame.new(0, -0.08, 0), Vector3.new(3.3, 0.06, 2.7), STEEL, M.Metal)
		end
	end
end

LOOKS.battery_wall = function(m, c)
	-- (hung on the wall: the origin stands 0.75 off it)
	for i = -1, 1, 2 do
		solid(m, c * CFrame.new(i * 0.8, 3.2, 0.5), Vector3.new(1.4, 2.6, 0.5), WHITE)
		deco(m, c * CFrame.new(i * 0.8, 2.3, 0.24), Vector3.new(1.0, 0.06, 0.02), C(60, 220, 120), M.Neon)
	end
	deco(m, c * CFrame.new(0, 5.2, 0.55), Vector3.new(1.6, 1, 0.4), C(60, 64, 70))
end

-- Staff room --------------------------------------------------------------------------------------------
LOOKS.lockers = function(m, c)
	for i = 0, 3 do
		local x = -1.2 + i * 0.8
		solid(m, c * CFrame.new(x, 3, 0), Vector3.new(0.76, 6, 1.4), C(80, 110, 150), M.Metal)
		label(m, c * CFrame.new(x, 5.2, -0.71), Vector3.new(0.4, 0.3, 0.01), tostring(i + 1), WHITE, C(40, 50, 70))
		label(m, c * CFrame.new(x, 4.4, -0.71), Vector3.new(0.5, 0.35, 0.01), "≡", C(40, 50, 70), false)
		deco(m, c * CFrame.new(x + 0.25, 3.0, -0.73), Vector3.new(0.06, 0.4, 0.04), STEEL, M.Metal)
	end
end

LOOKS.staff_fridge = function(m, c)
	solid(m, c * CFrame.new(0, 2.9, 0), Vector3.new(1.8, 5.8, 1.8), WHITE)
	deco(m, c * CFrame.new(0, 3.9, -0.91), Vector3.new(1.75, 0.04, 0.02), C(200, 200, 200))
	for y = 0, 1 do
		deco(m, c * CFrame.new(0.7, 2.4 + y * 2.2, -0.93), Vector3.new(0.06, 0.8, 0.06), STEEL, M.Metal)
	end
	for i = 0, 2 do
		deco(m, c * CFrame.new(-0.4 + i * 0.3, 4.8 - i * 0.2, -0.92), Vector3.new(0.18, 0.18, 0.03), ({ RED, C(40, 120, 220), C(250, 200, 40) })[i + 1])
	end
end

LOOKS.break_table = function(m, c, k)
	cylY(m, c * CFrame.new(0, 0.1, 0), 0.15, 1.4, DARK, M.Metal)
	B.cylY(m, c * CFrame.new(0, 1.3, 0), 2.4, 0.25, DARK, M.Metal)
	B.cylY(m, c * CFrame.new(0, 2.6, 0), 0.15, 2.8, WOOD, M.Wood)
	for i = 0, 2 do
		local a = i * math.pi * 2 / 3
		Props.chair(m, c * CFrame.new(math.cos(a) * 2.0, 0, math.sin(a) * 2.0) * CFrame.Angles(0, -a - math.pi / 2, 0), k.accent:Lerp(BLACK, 0.4))
	end
	cylY(m, c * CFrame.new(0.4, 2.85, 0.2), 0.36, 0.2, C(170, 50, 20))
end

LOOKS.training = function(m, c)
	deco(m, c, Vector3.new(5, 2.6, 0.1), STEEL, M.Metal)
	label(m, c * CFrame.new(0, 0, -0.06), Vector3.new(4.8, 2.4, 0.02), "TRAINING\n1) ESD safety\n2) Thermal paste\n3) Micro soldering", C(30, 60, 160), WHITE, { font = B.Fonts.Hand })
	deco(m, c * CFrame.new(0, -1.4, -0.12), Vector3.new(4, 0.1, 0.2), STEEL, M.Metal)
end

LOOKS.gym_corner = function(m, c)
	deco(m, c * CFrame.new(-0.8, 0.12, 0), Vector3.new(2.2, 0.08, 2.8), C(40, 90, 170), M.Rubber, { CanCollide = true })
	solid(m, c * CFrame.new(1.3, 0.8, 0.8), Vector3.new(1.2, 1.6, 0.6), DARK, M.Metal)
	for i = 0, 2 do
		cylX(m, c * CFrame.new(1.3, 0.5 + i * 0.45, 0.45), 1.0, 0.18 + i * 0.04, BLACK, M.Metal)
	end
	-- an exercise bike
	solid(m, c * CFrame.new(1.2, 0.3, -0.8), Vector3.new(0.4, 0.6, 1.6), DARK, M.Metal)
	cylX(m, c * CFrame.new(1.2, 0.8, -1.3), 0.25, 1.0, C(60, 60, 66), M.Metal)
	deco(m, c * CFrame.new(1.2, 1.4, -0.5), Vector3.new(0.15, 1.4, 0.15), DARK, M.Metal)
	deco(m, c * CFrame.new(1.2, 2.15, -0.4), Vector3.new(0.4, 0.15, 0.6), BLACK, M.Leather)
	ball(m, c * CFrame.new(-1.5, 0.45, -1.0), 0.6, BLACK)
end

LOOKS.nap_pod = function(m, c, k)
	B.cyl(m, c * CFrame.new(0, 1.6, 0.2) * CFrame.Angles(0, math.pi / 2, 0), 3.6, 2.8, WHITE, M.SmoothPlastic)
	deco(m, c * CFrame.new(0, 1.6, -1.65), Vector3.new(2.0, 1.6, 0.1), C(30, 30, 36))
	deco(m, c * CFrame.new(0, 0.9, -1.0), Vector3.new(1.8, 0.3, 1.6), C(220, 220, 230), M.Fabric)
	deco(m, c * CFrame.new(0, 2.5, -1.62), Vector3.new(2.0, 0.06, 0.04), k.accent, M.Neon)
end

-- Outside --------------------------------------------------------------------------------------------
LOOKS.bike_rack = function(m, c, k)
	deco(m, c * CFrame.new(0, 0.1, 0), Vector3.new(4, 0.1, 0.3), STEEL, M.Metal)
	for i = 0, 2 do
		local x = -1.3 + i * 1.3
		for z = -1, 1, 2 do
			deco(m, c * CFrame.new(x, 1.2, z * 0.4), Vector3.new(0.12, 2.2, 0.12), STEEL, M.Metal)
		end
		deco(m, c * CFrame.new(x, 2.3, 0), Vector3.new(0.12, 0.12, 0.92), STEEL, M.Metal)
	end
	-- one bicycle parked
	local bike = c * CFrame.new(-1.3, 0, -0.9)
	for z = -1, 1, 2 do
		B.cyl(m, bike * CFrame.new(0, 1, z * 1.1), 0.1, 2, BLACK, M.Rubber, nc())
	end
	deco(m, bike * CFrame.new(0, 1.4, 0), Vector3.new(0.1, 0.1, 2.0), k.accent, M.Metal)
	deco(m, bike * CFrame.new(0, 1.9, 0.6), Vector3.new(0.3, 0.12, 0.6), BLACK, M.Leather)
end

LOOKS.satellite = function(m, c)
	deco(m, c * CFrame.new(0, 0.6, 0.3), Vector3.new(0.15, 1.2, 0.15), STEEL, M.Metal)
	local dish = c * CFrame.new(0, 1.4, 0) * CFrame.Angles(math.rad(-30), 0, 0)
	B.cylZ(m, dish, 0.12, 1.8, WHITE, M.Metal, nc())
	deco(m, dish * CFrame.new(0, -0.3, -0.6) * CFrame.Angles(math.rad(30), 0, 0), Vector3.new(0.08, 0.08, 1.0), STEEL, M.Metal)
end

LOOKS.door_chime = function(m, c)
	deco(m, c, Vector3.new(0.5, 0.35, 0.2), WHITE)
	deco(m, c * CFrame.new(0, 0, -0.11), Vector3.new(0.3, 0.2, 0.02), C(60, 60, 64))
end

LOOKS.outdoor_bench = function(m, c)
	Props.bench(m, c)
end

LOOKS.flag_pole = function(m, c)
	cylY(m, c * CFrame.new(0, 0.2, 0), 0.4, 1.2, C(150, 150, 150), M.Concrete)
	B.cylY(m, c * CFrame.new(0, 7, 0), 14, 0.3, WHITE, M.Metal, nc({ CanCollide = true }))
	ball(m, c * CFrame.new(0, 14.1, 0), 0.45, C(220, 180, 60), M.Metal)
	flag(m, c * CFrame.new(2.1, 12.4, 0), 3.9, 2.6)
end

LOOKS.big_planters = function(m, c, k)
	solid(m, c * CFrame.new(0, 1, 0), Vector3.new(2.2, 2, 2.2), C(170, 164, 156), M.Concrete)
	deco(m, c * CFrame.new(0, 2.02, 0), Vector3.new(1.9, 0.1, 1.9), C(90, 70, 50), M.Ground)
	deco(m, c * CFrame.new(0, 3.2, 0) * CFrame.Angles(0, 0, math.rad(6)), Vector3.new(0.3, 2.4, 0.3), C(110, 90, 70), M.Wood)
	for i = 0, 2 do
		local a = i * 2.1 + k.rng:NextNumber()
		B.ellipsoid(m, c * CFrame.new(math.cos(a) * 0.6, 4.6 + (i % 2) * 0.4, math.sin(a) * 0.6), Vector3.new(1.8, 1.2, 1.8), C(120, 140, 100), M.LeafyGrass, nc())
	end
end

LOOKS.pergola = function(m, c, k)
	for x = -1, 1, 2 do
		for z = -1, 1, 2 do
			solid(m, c * CFrame.new(x * 3.6, 4, z * 1.9), Vector3.new(0.5, 8, 0.5), WOOD, M.Wood)
		end
		deco(m, c * CFrame.new(x * 3.6, 8.1, 0), Vector3.new(0.5, 0.5, 4.6), WOOD, M.Wood)
	end
	for i = 0, 6 do
		deco(m, c * CFrame.new(-3.6 + i * 1.2, 8.45, 0), Vector3.new(0.25, 0.25, 4.8), WOOD, M.Wood)
	end
	for i = 0, 3 do
		B.ellipsoid(m, c * CFrame.new(-2.5 + i * 1.7, 8.6, (i % 2) * 0.8 - 0.4), Vector3.new(1.8, 0.6, 1.6), C(70, 130, 60), M.LeafyGrass, nc())
	end
	solid(m, c * CFrame.new(0, 1.3, 0), Vector3.new(1.4, 0.15, 1.4), WHITE)
	deco(m, c * CFrame.new(0, 0.65, 0), Vector3.new(0.15, 1.3, 0.15), DARK, M.Metal)
	for x = -1, 1, 2 do
		Props.chair(m, c * CFrame.new(x * 1.6, 0, 0) * CFrame.Angles(0, x * math.pi / 2, 0), k.accent)
	end
end

LOOKS.sidewalk_logo = function(m, c, k)
	B.cylY(m, c * CFrame.new(0, 0.1, 0), 0.04, 3.2, k.accent, M.Neon, nc({ Transparency = 0.45 }))
	local top = deco(m, c * CFrame.new(0, 0.13, 0), Vector3.new(2.2, 0.02, 2.2), WHITE, M.SmoothPlastic, { Transparency = 1 })
	B.sign(top, Enum.NormalId.Top, "🔧", { color = WHITE, glow = true })
end

LOOKS.digital_signage = function(m, c, k)
	solid(m, c * CFrame.new(0, 3.5, 0), Vector3.new(1.8, 7, 0.6), C(30, 30, 34))
	label(m, c * CFrame.new(0, 3.9, -0.31), Vector3.new(1.5, 4.6, 0.02), "30%\nOFF\n\nSSD +\nInstall", WHITE, k.accent, { glow = true, brightness = 1.6 })
	label(m, c * CFrame.new(0, 0.8, -0.31), Vector3.new(1.5, 0.6, 0.02), k.name, WHITE, false)
end

ShopExtras.LOOKS = LOOKS

----------------------------------------------------------------------------------------------------
-- Where things go
----------------------------------------------------------------------------------------------------
local function overlap(a, b, margin: number): boolean
	return a[1] < b[3] + margin and b[1] < a[3] + margin and a[2] < b[4] + margin and b[2] < a[4] + margin
end

-- Free of furniture (walkways and standing spots don't matter for things on the wall).
local function noFurniture(plan, r): boolean
	for _, c in plan.rects do
		if c.kind == "hard" and overlap(r, c, 0) then
			return false
		end
	end
	return true
end

-- The walkways people use: the door to the counter and the seats, the counter and the managers'
-- spots to every bench. Floor and wall furniture placed after this keeps out of them.
local function corridors(k)
	local pts = {}
	for _, p in k.points:GetChildren() do
		pts[p.Name] = p
	end
	local function walk(a: string, b: string)
		local pa, pb = pts[a], pts[b]
		if not pa or not pb then
			return
		end
		local x0, z0 = k.local2(pa.CFrame)
		local x1, z1 = k.local2(pb.CFrame)
		local n = math.max(1, math.ceil(math.sqrt((x1 - x0) ^ 2 + (z1 - z0) ^ 2)))
		for i = 0, n do
			local t = i / n
			local x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
			k.plan:claim({ x - 1.3, z - 1.3, x + 1.3, z + 1.3 }, "walk")
		end
	end
	walk("Door", "CounterFront")
	walk("Door", "Seat_1")
	for name in pts do
		local bench = string.match(name, "^Staff_(%d+)$")
		if bench then
			walk("CounterBack", name)
			walk("ManagerSpot", name)
			walk("Door", name)
		end
	end
end

-- The solid walls of a zone (the shop window stays clear of the catalogue's furniture).
local function runsFor(k, zone: string?)
	local w = k.walls
	if zone == "work" then
		return { w.rightWork, w.leftWork, w.back }
	elseif zone == "front" then
		return { w.leftFront, w.rightFront }
	end
	return { w.leftFront, w.rightFront, w.rightWork, w.leftWork, w.back }
end

local BANDS = { low = 2.6, eye = 7, top = 12 }

local function placeHigh(k, it, build, band: string?, zone: string?)
	band = band or it.band or "eye"
	local y = BANDS[band] or 7
	for _, run in runsFor(k, zone or it.zone) do
		local t = 0.6
		while t + it.w <= run.len - 0.6 do
			local r = run:rect(t, it.w, 0.5)
			local ok = true
			for _, h in k.highClaims do
				if h.band == band and overlap(r, h, 0.4) then
					ok = false
					break
				end
			end
			if ok and band ~= "top" and not noFurniture(k.plan, run:rect(t, it.w, 1.4)) then
				ok = false
			end
			if ok then
				table.insert(k.highClaims, { r[1], r[2], r[3], r[4], band = band })
				local mid = t + it.w / 2
				local c = k.facing(run.x + run.ax * mid + run.ix * 0.08, run.z + run.az * mid + run.iz * 0.08, run.ix, run.iz) * CFrame.new(0, y, 0)
				build(c)
				return true
			end
			t += 0.5
		end
	end
	-- no room at eye level: anywhere at eye level, then up above the furniture
	if band == "eye" and (zone or it.zone) ~= "any" then
		return placeHigh(k, it, build, "eye", "any")
	elseif band == "eye" then
		return placeHigh(k, it, build, "top", it.zone)
	elseif band == "top" and zone == nil and it.zone ~= "any" then
		return placeHigh(k, it, build, "top", "any")
	end
	return false
end

local function placeWall(k, it, build)
	local d = it.d or 1.6
	if k.wallItem(runsFor(k, it.zone), it.w or 2, d / 2 + 0.15, d + 0.3, build) then
		return true
	end
	-- no room on its own side of the shop: any wall will do
	return it.zone ~= "any" and k.wallItem(runsFor(k, "any"), it.w or 2, d / 2 + 0.15, d + 0.3, build) ~= nil
end

-- A free-standing spot, near the walls first, off the walkways.
local function placeFloor(k, it, build)
	-- (square: the item may end up turned either way)
	local w = math.max(it.w or 2, it.d or 2)
	local d = w
	local z0, z1 = 2.5, k.fz - 1.5
	if it.zone == "work" then
		z0, z1 = k.fz + 1.5, k.D - 1.8
	end
	local best, bestScore = nil, math.huge
	local x = -k.inner + w / 2 + 0.4
	while x <= k.inner - w / 2 - 0.4 do
		local z = z0 + d / 2
		while z <= z1 - d / 2 do
			local r = { x - w / 2 - 0.3, z - d / 2 - 0.3, x + w / 2 + 0.3, z + d / 2 + 0.3 }
			if k.plan:free(r, "hard") then
				local wallDist = math.min(k.inner - math.abs(x) - w / 2, z - 1 - d / 2, k.D - 1 - z - d / 2)
				local score = wallDist + k.rng:NextNumber() * 0.5
				if score < bestScore then
					best, bestScore = { x = x, z = z, r = r }, score
				end
			end
			z += 1
		end
		x += 1
	end
	if not best then
		return false
	end
	k.plan:claim(best.r, "hard")
	-- face away from the nearest wall
	local dl, dr, db = best.x + k.inner, k.inner - best.x, k.D - 1 - best.z
	local ix, iz = 0, -1
	if dl < dr and dl < db then
		ix, iz = 1, 0
	elseif dr < db then
		ix, iz = -1, 0
	end
	if it.zone == "front" and math.min(dl, dr) > 4 then
		ix, iz = 0, 1 -- (in the middle of the lounge, face the room)
	end
	build(k.facing(best.x, best.z, ix, iz))
	return true
end

local CEILING_N = { hanging_plants = 2, pendant_lamps = 3, edison_bulbs = 2, track_lights = 2, smart_lighting = 3, smoke_detector = 2, sprinklers = 4, mesh_wifi = 2, skylight = 1, chandelier = 1 }
local CEILING_ZONE = { pendant_lamps = "counter", edison_bulbs = "front", hanging_plants = "front", chandelier = "front", track_lights = "front" }

local function ceilingSpots(k)
	local spots = {}
	local rows, cols = math.max(1, math.floor(k.D / 14)), math.max(1, math.floor(k.W / 14))
	local lights = {}
	for r = 1, rows do
		for c = 1, cols do
			table.insert(lights, { -k.W / 2 + k.W * (c - 0.5) / cols, k.D * (r - 0.5) / rows })
		end
	end
	local x = -k.inner + 3
	while x <= k.inner - 3 do
		local z = 3.5
		while z <= k.D - 3.5 do
			local free = true
			for _, l in lights do
				if math.abs(l[1] - x) < 3.4 and math.abs(l[2] - z) < 3.4 then
					free = false
				end
			end
			if free then
				table.insert(spots, { x = x, z = z })
			end
			z += 4.5
		end
		x += 4.5
	end
	return spots
end

local function placeCeiling(k, it, look, model)
	local n = CEILING_N[it.id] or 1
	local zone = CEILING_ZONE[it.id] or "any"
	local placed = 0
	if zone == "counter" then
		for i = 1, n do
			local x = (i - (n + 1) / 2) * (k.counterW / n)
			look(model, k.counterCf * CFrame.new(x, k.H - 0.32, 0.2), k, i)
			placed += 1
		end
		return true
	end
	for i = 1, n do
		local pick = nil
		for j, s in k.ceiling do
			local inZone = zone == "any" or (zone == "front" and s.z < k.fz - 1) or (zone == "work" and s.z > k.fz + 1)
			if inZone then
				pick = j
				break
			end
		end
		if not pick then
			break
		end
		local s = table.remove(k.ceiling, pick)
		look(model, k.at(s.x, s.z, k.H - 0.22), k, i)
		placed += 1
	end
	return placed > 0
end

local function placeCounter(k, look, model)
	local slot = table.remove(k.counterSlots, 1)
	if not slot then
		return false
	end
	look(model, k.counterCf * CFrame.new(slot.x, 4.0, slot.z), k)
	return true
end

-- Outside: two rows in the forecourt (by the shop window and by the kerb), the doorway clear.
local function placeOutside(k, it, look, model)
	local w = it.w or 2
	local rows = if it.row == "street" then { "B", "A" } else { "A", "B" }
	local big = (it.d or 0) >= 4
	for _, row in rows do
		local occupied = if big then { k.outside.A, k.outside.B } else { k.outside[row] }
		for step = 0, 60 do
			local off = 6.6 + w / 2 + step * 0.5
			for _, side in { 1, -1 } do
				local x = side * off
				local lo, hi = x - w / 2 - 0.4, x + w / 2 + 0.4
				if math.abs(x) + w / 2 <= k.plotW / 2 - 1.5 then
					local ok = true
					for _, list in occupied do
						for _, iv in list do
							if lo < iv[2] and iv[1] < hi then
								ok = false
							end
						end
					end
					if ok then
						for _, list in occupied do
							table.insert(list, { lo, hi })
						end
						local z = if big then k.setback / 2 + 0.2 elseif row == "A" then k.setback - 1.6 else 2.2
						look(model, k.cf * CFrame.new(x, 0.12, z), k)
						return true
					end
				end
			end
		end
	end
	return false
end

-- the rooftop letters stand at the front edge, the billboard at the back above everything
local ROOF_FRONT = { roof_letters = true }
local ROOF_BACK = { roof_billboard = true }

local function placeRoof(k, it, look, model)
	local w, d = it.w or 3, it.d or 3
	if it.id == "solar" then
		w, d = math.min(k.W - 8, 20), 8
	end
	local function tryAt(x: number, z: number): boolean
		local r = { x - w / 2, z - d / 2, x + w / 2, z + d / 2 }
		for _, o in k.roof do
			if overlap(r, o, 0.6) then
				return false
			end
		end
		table.insert(k.roof, r)
		look(model, k.front * CFrame.new(x, k.H + 1, z), k)
		return true
	end
	if w > k.W - 3 then
		return false
	end
	if ROOF_FRONT[it.id] then
		return tryAt(0, 3 + d / 2)
	elseif ROOF_BACK[it.id] then
		return tryAt(0, k.D - 3 - d / 2)
	end
	local z = k.D - 2 - d / 2
	while z >= 4 + d / 2 do
		local x = k.W / 2 - 2 - w / 2
		while x >= -k.W / 2 + 2 + w / 2 do
			if tryAt(x, z) then
				return true
			end
			x -= 1
		end
		z -= 1
	end
	return false
end

local function placeWindow(k, look, model)
	local slot = table.remove(k.windowSlots, 1)
	if not slot then
		return false
	end
	look(model, k.front * CFrame.new(slot.x, slot.y, 0.33), k)
	return true
end

-- One-off spots: the door and the facade.
local SPECIAL = {
	exit_sign = function(k, look, model)
		look(model, k.front * CFrame.new(0, 10.85, 0.75) * CFrame.Angles(0, math.pi, 0), k)
	end,
	door_chime = function(k, look, model)
		look(model, k.front * CFrame.new(3.4, 9.84, 0.75) * CFrame.Angles(0, math.pi, 0), k)
	end,
	auto_door = function(k, _look, model)
		deco(model, k.front * CFrame.new(0, 10.75, -0.25), Vector3.new(8.4, 0.6, 0.5), STEEL, M.Metal)
		deco(model, k.front * CFrame.new(0, 11.2, -0.35), Vector3.new(1.2, 0.35, 0.35), BLACK)
		deco(model, k.front * CFrame.new(0.3, 11.2, -0.53), Vector3.new(0.12, 0.12, 0.02), C(255, 40, 40), M.Neon)
	end,
	authorised = function(k, look, model)
		look(model, k.front * CFrame.new(math.min(k.W / 2 - 3, 9.5), 9.3, 0.29), k)
	end,
	string_lights = function(k, _look, model)
		local cols = { C(255, 200, 80), C(255, 120, 120), C(120, 200, 255), C(160, 255, 140) }
		for side = -1, 1, 2 do
			local len = math.max(2, k.W / 2 - 8)
			local base = k.front * CFrame.new(side * (k.W / 4 + 2), 9.45, -4.05)
			deco(model, base, Vector3.new(len, 0.06, 0.06), BLACK)
			local n = math.max(2, math.floor(len / 1.6))
			for i = 0, n - 1 do
				local x = -len / 2 + (i + 0.5) * len / n
				B.ball(model, base * CFrame.new(x, -0.2, 0), 0.35, cols[i % #cols + 1], M.Neon, nc())
			end
		end
	end,
	awning_led = function(k, _look, model)
		for side = -1, 1, 2 do
			local strip = deco(model, k.front * CFrame.new(side * (k.W / 4 + 2), 11.05, -1.4), Vector3.new(math.max(2, k.W / 2 - 8), 0.1, 0.1), C(255, 236, 200), M.Neon)
			B.surfaceLight(strip, Enum.NormalId.Bottom, 10, 80, 0.8, C(255, 230, 190))
		end
	end,
	street_art = function(k, _look, model)
		local len = math.min(k.D * 0.6, 26)
		local wall = k.front * CFrame.new(k.W / 2 + 0.06, 7, len / 2 + 2) * CFrame.Angles(0, -math.pi / 2, 0)
		deco(model, wall, Vector3.new(len, 10, 0.06), C(40, 30, 70))
		local cols = { C(250, 80, 120), C(60, 220, 230), C(250, 210, 60), C(120, 230, 100) }
		for i = 0, 5 do
			deco(model, wall * CFrame.new(-len / 2 + 2 + i * (len - 4) / 5, -1.5 + (i % 2) * 2.5, -0.04) * CFrame.Angles(0, 0, math.rad(i * 25)), Vector3.new(3.6, 2.2, 0.02), cols[i % 4 + 1])
		end
		label(model, wall * CFrame.new(0, 2.6, -0.06), Vector3.new(len * 0.8, 2.6, 0.02), k.name, WHITE, false, { font = B.Fonts.Display })
	end,
	cladding = function(k, _look, model)
		local tone = k.accent:Lerp(BLACK, 0.55)
		local n = 8
		-- (over the fascia above the shop window, the same band the hall leaves solid)
		local fascia = math.clamp(k.H * 0.2, 2, 4)
		for i = 0, n - 1 do
			local w = k.W / n
			deco(model, k.front * CFrame.new(-k.W / 2 + w * (i + 0.5), k.H - fascia / 2, -0.08), Vector3.new(w - 0.1, fascia, 0.12), if i % 2 == 0 then tone else tone:Lerp(WHITE, 0.15), M.Metal)
		end
		for side = -1, 1, 2 do
			deco(model, k.front * CFrame.new(side * (k.W / 2 - 0.4), k.H / 2, -0.1), Vector3.new(0.8, k.H, 0.16), tone, M.Metal)
		end
	end,
	esd_floor = function(k, _look, model)
		local depth = k.D - k.fz - 1.5
		deco(model, k.at(0, k.fz + 0.5 + depth / 2, 0.22), Vector3.new(k.W - 2.2, 0.04, depth), C(70, 110, 96))
		deco(model, k.at(0, k.fz + 0.6, 0.23), Vector3.new(k.W - 2.2, 0.04, 0.3), C(250, 210, 40))
	end,
	counter_led = function(k, look, model)
		look(model, k.counterCf, k)
	end,
	ergo_chairs = function(k, _look, model)
		for _, b in k.benches do
			local stool = b.cf * CFrame.new(0, 0, -3.6)
			deco(model, stool * CFrame.new(0, 3.9, -1.0) * CFrame.Angles(math.rad(8), 0, 0), Vector3.new(1.6, 1.9, 0.25), BLACK, M.Fabric)
			deco(model, stool * CFrame.new(0, 3.0, -0.95), Vector3.new(0.2, 0.9, 0.2), DARK, M.Metal)
			for x = -1, 1, 2 do
				deco(model, stool * CFrame.new(x * 1.0, 2.95, -0.3), Vector3.new(0.12, 0.6, 0.12), DARK, M.Metal)
				deco(model, stool * CFrame.new(x * 1.0, 3.3, -0.3), Vector3.new(0.2, 0.15, 1.1), BLACK, M.Rubber)
			end
		end
	end,
}

-- Equipment shelves over the workbenches: two shelves of four.
local SHELF_X = { -3.0, -1.65, -0.3, 1.05 }

local function benchShelves(k, list)
	if #list == 0 then
		return
	end
	for _, b in k.benches do
		local m = B.model("BenchShelf_" .. b.index, k.shop)
		local shelves = if #list > 4 then 2 else 1
		for s = 1, shelves do
			local y = if s == 1 then 5.5 else 7.3
			deco(m, b.cf * CFrame.new(-1.0, y, 2.1), Vector3.new(5.4, 0.12, 1.6), C(196, 168, 124), M.Wood, { CanCollide = true })
			for _, x in { -3.6, 1.6 } do
				deco(m, b.cf * CFrame.new(x, y - 0.3, 2.65), Vector3.new(0.12, 0.5, 0.5), DARK, M.Metal)
			end
		end
		for i, entry in list do
			if i > 8 then
				break
			end
			local s = if i <= 4 then 1 else 2
			local y = (if s == 1 then 5.5 else 7.3) + 0.06
			entry.look(m, b.cf * CFrame.new(SHELF_X[(i - 1) % 4 + 1], y, 1.95), k)
		end
	end
end

function ShopExtras.place(k)
	-- bookkeeping the placers share
	k.ceiling = ceilingSpots(k)
	k.roof = k.roof or {}
	k.outside = k.outside or { A = {}, B = {} }
	k.counterSlots = {}
	-- two rows on the counter top, the register's corner kept clear
	local reg = k.counterW / 2 - 2
	for _, z in { -0.55, 0.75 } do
		local x = -k.counterW / 2 + 0.8
		while x <= k.counterW / 2 - 0.6 do
			if math.abs(x - reg) > 1.0 then
				table.insert(k.counterSlots, { x = x, z = z })
			end
			x += 1.3
		end
	end
	k.windowSlots = {}
	local xr = 9.3
	while xr + 1.5 <= k.W / 2 - 1.2 do
		table.insert(k.windowSlots, { x = xr, y = 7.4 })
		table.insert(k.windowSlots, { x = xr, y = 4.2 })
		xr += 3.4
	end
	local xl = -9.3
	while xl - 1.5 >= -k.W / 2 + 1.2 do
		table.insert(k.windowSlots, { x = xl, y = 3.0 })
		table.insert(k.windowSlots, { x = xl, y = 9.4 })
		xl -= 3.4
	end
	table.sort(k.windowSlots, function(a, b)
		return math.abs(a.x) < math.abs(b.x)
	end)
	k.name = k.name or "PC Tamir"
	k.handle = string.lower((string.gsub(k.name, "[^%w]", "")))
	if k.handle == "" then
		k.handle = "pctamirci"
	end
	k.wifi = (string.gsub(k.name, " ", "_")) .. "_Misafir"
	corridors(k)

	local order = table.clone(Upgrades.items)
	table.sort(order, function(a, b)
		local ra, rb = a.required ~= nil, b.required ~= nil
		if ra ~= rb then
			return ra
		end
		return (a.cost or 0) > (b.cost or 0)
	end)
	local benchItems = {}
	for _, it in order do
		local look = LOOKS[it.id]
		if k.items[it.id] and it.place and it.place ~= "none" then
			local model = B.model("Extra_" .. it.id, k.shop)
			local function build(c: CFrame)
				look(model, c, k, 1)
			end
			local ok, err = pcall(function()
				if SPECIAL[it.id] then
					SPECIAL[it.id](k, look, model)
				elseif not look then
					return
				elseif it.place == "wall" then
					placeWall(k, it, build)
				elseif it.place == "high" then
					placeHigh(k, it, build)
				elseif it.place == "floor" then
					placeFloor(k, it, build)
				elseif it.place == "ceiling" then
					placeCeiling(k, it, look, model)
				elseif it.place == "counter" then
					placeCounter(k, look, model)
				elseif it.place == "bench" then
					table.insert(benchItems, { id = it.id, look = look })
				elseif it.place == "outside" then
					for _ = 1, it.count or 1 do
						placeOutside(k, it, look, model)
					end
				elseif it.place == "roof" then
					placeRoof(k, it, look, model)
				elseif it.place == "window" then
					placeWindow(k, look, model)
				end
			end)
			if not ok then
				warn("[ShopExtras] " .. it.id .. ": " .. tostring(err))
			end
			if #model:GetChildren() == 0 then
				model:Destroy()
			end
		end
	end
	benchShelves(k, benchItems)
end

return ShopExtras
