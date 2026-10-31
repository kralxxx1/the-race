-- Buildings: procedural facades for the city.
-- Local frame for every building: origin = centre of the front edge at ground level,
-- the front faces the street (-Z), the building extends to +Z (depth d) and +Y.
--
-- Styles: "modern" (glass curtain wall), "office" (ribbon windows), "apartment" (plaster, balconies,
-- AC units, dishes), "historic" (stone/brick, arched windows, cornice), "industrial" (warehouse),
-- plus houses and storefronts. Lit windows are tagged "NightWindow" and switched on by clients at night.

local B = require(script.Parent.Parent.Util.Builder)
local Rand = require(script.Parent.Parent.Util.Rand)
local Props = require(script.Parent.Props)

local Buildings = {}
local M = Enum.Material
local P = B.Palette

local PLASTER = {
	{ 240, 228, 200 }, { 236, 206, 176 }, { 244, 232, 170 }, { 196, 222, 206 }, { 196, 214, 232 },
	{ 214, 150, 120 }, { 246, 244, 238 }, { 226, 196, 214 }, { 230, 214, 180 }, { 200, 186, 160 },
}
local GLASS = { { 60, 96, 120 }, { 70, 110, 110 }, { 54, 70, 96 }, { 90, 120, 140 }, { 40, 60, 70 } }
local STONE = { { 214, 200, 176 }, { 196, 182, 160 }, { 222, 214, 196 }, { 170, 120, 96 } }
local AWNING = { { 200, 40, 40 }, { 30, 110, 60 }, { 30, 70, 150 }, { 230, 140, 30 }, { 120, 40, 90 }, { 40, 40, 44 } }

Buildings.ShopNames = {
	"Starlight Pharmacy", "Barber Joe", "Salon Bella", "The Hungry Fork", "Golden Crust Bakery", "Pennywise Stationery",
	"Rose & Thorn Florist", "Gold Standard Jewellers", "Clearview Optics", "Green Cross Pharmacy", "Tailor & Sons", "Persian Rug House",
	"Blue Boutique", "Crystal Watches", "Paper Moon Books", "Nutty Professor", "Honey Bee Sweets", "Sweet Tooth Patisserie",
	"Home Haven Furniture", "Fresh Corner Market", "Harbour Fish Market", "Butcher Brothers", "Green Grocer", "QuickChange Exchange",
	"Sole Mates Shoes", "Sports Hub", "Toyland", "Snapshot Photo", "Print 34", "Pet Palace",
	"Notary Office", "Bright Smile Dental", "Happy Paws Vet", "Shine Shoe Repair", "Phone Fix Eddie", "Sparky Electric",
	"Hardware Hank", "Bagel Stop", "Pie Corner", "Pizza Slice", "Cupcake Co.", "Tea Garden",
	"Cafe Pause", "Burger Bros", "Sushi Ada", "Dumpling House", "Wrap Shack", "Coffee Stop",
}
local SHOP_COLORS = { { 200, 40, 40 }, { 30, 120, 70 }, { 30, 80, 170 }, { 230, 140, 30 }, { 120, 40, 120 }, { 20, 20, 24 }, { 200, 170, 60 }, { 0, 150, 190 } }

local function nc(extra)
	local t = { CanCollide = false, CanTouch = false }
	if extra then
		for k, v in extra do
			t[k] = v
		end
	end
	return t
end

-- Facade grid on one face. faceCf = centre of the face at ground level with -Z pointing outward.
-- Builds bands, piers and a glass layer; optional lit windows for the night.
local function facade(model: Instance, faceCf: CFrame, width: number, floors: number, floorH: number, opts)
	local cols = opts.cols or math.max(1, math.floor(width / 7))
	local pier = opts.pier or 1.4
	local sill = opts.sill or 3.2
	local lintel = opts.lintel or 2.4
	local wallCol = opts.wall
	local wallMat = opts.wallMat or M.SmoothPlastic
	local glassCol = opts.glass or Color3.fromRGB(60, 96, 120)
	local startFloor = opts.startFloor or 0
	local depth = opts.depth or 1
	local ww = (width - (cols + 1) * pier) / cols
	for f = startFloor, floors - 1 do
		local y0 = f * floorH
		local winH = floorH - sill - lintel
		-- bands
		B.box(model, faceCf * CFrame.new(0, y0 + sill / 2, 0), Vector3.new(width, sill, depth), wallCol, wallMat)
		B.box(model, faceCf * CFrame.new(0, y0 + floorH - lintel / 2, 0), Vector3.new(width, lintel, depth), wallCol, wallMat)
		-- piers
		for c = 0, cols do
			local x = -width / 2 + pier / 2 + c * (ww + pier)
			B.box(model, faceCf * CFrame.new(x, y0 + sill + winH / 2, 0), Vector3.new(pier, winH, depth), wallCol, wallMat)
		end
		-- glass strip recessed behind the piers
		B.box(model, faceCf * CFrame.new(0, y0 + sill + winH / 2, depth * 0.3), Vector3.new(width - pier, winH, 0.3), glassCol, M.Glass, { Transparency = opts.glassT or 0.25, Reflectance = 0.05 })
		if opts.frames then
			for c = 0, cols - 1 do
				local x = -width / 2 + pier + ww / 2 + c * (ww + pier)
				B.box(model, faceCf * CFrame.new(x, y0 + sill - 0.15, -depth / 2 - 0.25), Vector3.new(ww + 0.6, 0.3, 0.6), opts.frameCol or P.white, M.SmoothPlastic, nc())
				if opts.arched then
					B.cyl(model, faceCf * CFrame.new(x, y0 + sill + winH, 0.1) * CFrame.Angles(0, math.pi / 2, 0), depth + 0.1, ww, glassCol, M.Glass, nc({ Transparency = 0.25 }))
				end
			end
		end
		-- lit windows (client toggles at night)
		if opts.rng and opts.nightWindows ~= false then
			for c = 0, cols - 1 do
				if opts.rng:NextNumber() < (opts.litChance or 0.35) then
					local x = -width / 2 + pier + ww / 2 + c * (ww + pier)
					local lit = B.box(model, faceCf * CFrame.new(x, y0 + sill + winH / 2, depth * 0.3 + 0.6), Vector3.new(ww * 0.9, winH * 0.85, 0.2), Rand.pick(opts.rng, { Color3.fromRGB(255, 214, 150), Color3.fromRGB(255, 236, 200), Color3.fromRGB(220, 236, 255) }), M.Neon, nc({ Transparency = 1, CastShadow = false, Name = "NightWindow" }))
					lit:AddTag("NightWindow")
				end
			end
		end
	end
	return cols, ww
end

-- Striped awning above a storefront. cf = centre of the shopfront top edge on the facade.
function Buildings.awning(parent: Instance, cf: CFrame, width: number, color: Color3, _rng: Random?, second: Color3?)
	local stripes = math.max(2, math.floor(width / 2.2))
	local sw = width / stripes
	local white = second or Color3.fromRGB(245, 243, 236)
	for i = 0, stripes - 1 do
		local col = if i % 2 == 0 then color else white
		-- wedge: tall side at the wall, sloping down towards the street
		B.wedge(parent, cf * CFrame.new(-width / 2 + sw * (i + 0.5), -0.9, -2) * CFrame.Angles(0, 0, 0), Vector3.new(sw, 1.8, 4), col, M.Fabric, nc())
	end
	B.box(parent, cf * CFrame.new(0, -1.9, -4.05), Vector3.new(width, 0.4, 0.1), color, M.Fabric, nc())
end

-- Ground-floor shop: glass front, door, sign band, interior glow.
function Buildings.shopfront(parent: Instance, cf: CFrame, width: number, height: number, opts)
	local o = opts or {}
	local rng = o.rng or Random.new()
	local frame = o.frameCol or Color3.fromRGB(40, 42, 46)
	local name = o.name or Rand.pick(rng, Buildings.ShopNames)
	local accent = B.color(o.accent or Rand.pick(rng, SHOP_COLORS))
	-- glass and frame
	B.box(parent, cf * CFrame.new(0, height * 0.42, 0.2), Vector3.new(width - 1, height * 0.8, 0.25), Color3.fromRGB(150, 180, 196), M.Glass, { Transparency = 0.55 })
	for _, x in { -width / 2 + 0.4, width / 2 - 0.4 } do
		B.box(parent, cf * CFrame.new(x, height / 2, 0), Vector3.new(0.8, height, 0.8), frame, M.Metal)
	end
	B.box(parent, cf * CFrame.new(0, 0.4, 0), Vector3.new(width, 0.8, 0.9), frame, M.Metal)
	local doorX = o.doorX or (width / 2 - 4)
	B.box(parent, cf * CFrame.new(doorX, 3.6, 0), Vector3.new(0.25, 7.2, 0.6), frame, M.Metal, nc())
	B.box(parent, cf * CFrame.new(doorX + 3.2, 3.6, 0), Vector3.new(0.25, 7.2, 0.6), frame, M.Metal, nc())
	-- sign band
	local band = B.box(parent, cf * CFrame.new(0, height * 0.9, -0.3), Vector3.new(width, height * 0.2, 1.2), accent, M.SmoothPlastic)
	B.sign(band, Enum.NormalId.Front, name, { color = Color3.fromRGB(255, 255, 255), glow = true, brightness = 1.3, font = o.font or B.Fonts.Heavy })
	-- interior suggestion: back wall, counter, shelves and a neon strip
	if o.interior ~= false then
		B.box(parent, cf * CFrame.new(0, height * 0.42, 7), Vector3.new(width - 1.4, height * 0.84, 0.4), accent:Lerp(Color3.new(1, 1, 1), 0.65), M.SmoothPlastic, nc())
		B.box(parent, cf * CFrame.new(-width * 0.15, 1.8, 4), Vector3.new(width * 0.4, 3.6, 1.6), Color3.fromRGB(230, 226, 220), M.Wood, nc())
		for i = -1, 1, 2 do
			B.box(parent, cf * CFrame.new(i * width * 0.3, height * 0.4, 6.4), Vector3.new(width * 0.22, height * 0.6, 0.8), Color3.fromRGB(120, 90, 60), M.Wood, nc())
		end
		B.box(parent, cf * CFrame.new(0, height * 0.84 - 0.4, 6.6), Vector3.new(width * 0.7, 0.2, 0.4), Color3.fromRGB(255, 244, 220), M.Neon, nc({ CastShadow = false }))
	end
	if o.awning ~= false and rng:NextNumber() < (o.awningChance or 0.6) then
		Buildings.awning(parent, cf * CFrame.new(0, height * 0.79, -0.2), width - 1.4, B.color(o.awningColor or Rand.pick(rng, AWNING)), rng)
	end
	return name
end

local function roofClutter(model: Instance, cf: CFrame, w: number, d: number, y: number, rng: Random, style: string)
	-- parapet
	local pc = Color3.fromRGB(150, 150, 150)
	B.box(model, cf * CFrame.new(0, y + 0.8, 0.5), Vector3.new(w, 1.6, 1), pc, M.SmoothPlastic)
	B.box(model, cf * CFrame.new(0, y + 0.8, d - 0.5), Vector3.new(w, 1.6, 1), pc, M.SmoothPlastic)
	B.box(model, cf * CFrame.new(-w / 2 + 0.5, y + 0.8, d / 2), Vector3.new(1, 1.6, d), pc, M.SmoothPlastic)
	B.box(model, cf * CFrame.new(w / 2 - 0.5, y + 0.8, d / 2), Vector3.new(1, 1.6, d), pc, M.SmoothPlastic)
	local n = rng:NextInteger(1, 3)
	for _ = 1, n do
		local x, z = Rand.range(rng, -w / 2 + 4, w / 2 - 4), Rand.range(rng, 4, d - 4)
		local kind = rng:NextInteger(1, 5)
		if kind == 1 then
			-- AC unit
			B.box(model, cf * CFrame.new(x, y + 1.2, z), Vector3.new(4, 2.4, 3), Color3.fromRGB(200, 200, 204), M.Metal)
			B.cylY(model, cf * CFrame.new(x, y + 2.45, z), 0.15, 2.2, Color3.fromRGB(40, 40, 44), M.Metal, nc())
		elseif kind == 2 then
			-- water tank
			B.cylY(model, cf * CFrame.new(x, y + 2.2, z), 4.4, 4, Color3.fromRGB(230, 230, 230), M.SmoothPlastic)
		elseif kind == 3 then
			-- stair housing
			B.box(model, cf * CFrame.new(x, y + 3, z), Vector3.new(6, 6, 6), Color3.fromRGB(180, 176, 168), M.SmoothPlastic)
		elseif kind == 4 then
			-- solar panels
			-- tilted panels on a rack: the low edge sits on the roof, a post holds up the high one
			local tilt = math.rad(-25)
			local rise = 2.5 * math.sin(-tilt)
			for i = 0, 2 do
				local px = x + i * 3.2 - 3.2
				B.box(model, cf * CFrame.new(px, y + rise + 0.1, z) * CFrame.Angles(tilt, 0, 0), Vector3.new(3, 0.2, 5), Color3.fromRGB(30, 44, 80), M.Glass, nc({ Reflectance = 0.2 }))
				B.box(model, cf * CFrame.new(px, y + rise, z + 2.2 * math.cos(tilt)), Vector3.new(0.2, rise * 2, 0.2), Color3.fromRGB(150, 150, 156), M.Metal, nc())
			end
		else
			-- antenna mast and dish
			B.cylY(model, cf * CFrame.new(x, y + 5, z), 10, 0.25, Color3.fromRGB(160, 160, 160), M.Metal, nc())
			B.cyl(model, cf * CFrame.new(x + 0.8, y + 2, z) * CFrame.Angles(0, math.rad(30), math.rad(20)), 0.3, 2.6, Color3.fromRGB(230, 230, 230), M.SmoothPlastic, nc())
		end
	end
	if style == "modern" and rng:NextNumber() < 0.5 then
		B.cylY(model, cf * CFrame.new(w / 2 - 2, y + 0.85, d - 2), 1.7, 0.2, Color3.fromRGB(150, 150, 156), M.Metal, nc())
		local beacon = B.ball(model, cf * CFrame.new(w / 2 - 2, y + 2.05, d - 2), 0.8, Color3.fromRGB(255, 40, 40), M.Neon, nc({ Name = "Beacon" }))
		beacon:AddTag("Beacon")
	end
end

-- General purpose multi-storey building.
-- opts: w, d, floors, floorH, style, ground ("shop"|"lobby"|"plain"), name, rng, wallColor, glassColor, roof
function Buildings.building(parent: Instance, cf: CFrame, opts): Model
	local rng = opts.rng or Random.new()
	local style = opts.style or "apartment"
	local w, d = opts.w or 30, opts.d or 30
	local floors = opts.floors or 4
	local fh = opts.floorH or 13
	local H = floors * fh
	local m = B.model(opts.modelName or "Building", parent)
	m:SetAttribute("Style", style)

	local wall, wallMat, glass
	if style == "modern" then
		wall = B.color(opts.wallColor or Rand.pick(rng, { { 90, 96, 106 }, { 200, 204, 210 }, { 50, 54, 60 } }))
		wallMat = M.Metal
		glass = B.color(opts.glassColor or Rand.pick(rng, GLASS))
	elseif style == "office" then
		wall = B.color(opts.wallColor or Rand.pick(rng, { { 210, 206, 196 }, { 180, 176, 170 }, { 226, 222, 214 } }))
		wallMat = M.SmoothPlastic
		glass = B.color(opts.glassColor or Rand.pick(rng, GLASS))
	elseif style == "historic" then
		wall = B.color(opts.wallColor or Rand.pick(rng, STONE))
		wallMat = if rng:NextNumber() < 0.35 then M.Brick else M.Limestone
		glass = Color3.fromRGB(60, 80, 90)
	else
		wall = B.color(opts.wallColor or Rand.pick(rng, PLASTER))
		wallMat = M.Plaster
		glass = Color3.fromRGB(70, 96, 110)
	end

	-- floor slabs and back/side shells (solid, cheap)
	local shellCol = wall:Lerp(Color3.new(0, 0, 0), 0.06)
	B.box(m, cf * CFrame.new(0, H / 2, d - 0.5), Vector3.new(w, H, 1), shellCol, wallMat)
	B.box(m, cf * CFrame.new(0, H + 0.4, d / 2), Vector3.new(w, 0.8, d), Color3.fromRGB(120, 120, 124), M.SmoothPlastic)

	-- ground floor on the street side
	local groundH = fh
	local ground = opts.ground or "plain"
	if ground == "shop" then
		local shops = opts.shops or (if w >= 30 then 2 else 1)
		local sw = w / shops
		for i = 0, shops - 1 do
			Buildings.shopfront(m, cf * CFrame.new(-w / 2 + sw * (i + 0.5), 0, 0), sw, groundH, { rng = rng, name = if i == 0 then opts.name else nil, accent = opts.accent })
		end
	elseif ground == "lobby" then
		B.box(m, cf * CFrame.new(0, groundH / 2 - 0.05, 0.4), Vector3.new(w - 2, groundH - 0.1, 0.3), glass, M.Glass, { Transparency = 0.45 })
		for _, x in { -w / 2 + 0.6, w / 2 - 0.6 } do
			B.box(m, cf * CFrame.new(x, groundH / 2, 0), Vector3.new(1.2, groundH, 1.2), wall, wallMat)
		end
		local cw = math.min(16, w - 4)
		local canopy = B.box(m, cf * CFrame.new(0, groundH * 0.72, -3), Vector3.new(cw, 0.6, 6), Color3.fromRGB(40, 44, 50), M.Metal)
		-- two slim posts carry its front edge
		for side = -1, 1, 2 do
			B.cylY(m, cf * CFrame.new(side * (cw / 2 - 0.6), (groundH * 0.72 - 0.3) / 2, -5.4), groundH * 0.72 - 0.3, 0.35, Color3.fromRGB(60, 64, 70), M.Metal)
		end
		if opts.name then
			B.sign(canopy, Enum.NormalId.Front, opts.name, { color = Color3.new(1, 1, 1), glow = true, font = B.Fonts.Bold })
		end
		B.box(m, cf * CFrame.new(0, groundH * 0.95, 0), Vector3.new(w, groundH * 0.1, 1.2), wall, wallMat)
		-- an LED strip under the canopy's front edge
		B.box(m, cf * CFrame.new(0, groundH * 0.72 - 0.38, -5.6), Vector3.new(cw - 1.6, 0.16, 0.3), Color3.fromRGB(255, 240, 210), M.Neon, nc({ CastShadow = false }))
	else
		facade(m, cf * CFrame.new(0, 0, 0.5), w, 1, fh, { wall = wall, wallMat = wallMat, glass = glass, cols = math.max(1, math.floor(w / 8)), rng = rng, litChance = 0.2, frames = style == "apartment" or style == "historic", arched = style == "historic" })
	end

	-- upper floors: front facade
	if floors > 1 then
		local fopts = { wall = wall, wallMat = wallMat, glass = glass, startFloor = 1, rng = rng }
		if style == "modern" then
			fopts.pier, fopts.sill, fopts.lintel, fopts.cols, fopts.glassT = 0.5, 1.2, 0.8, math.max(2, math.floor(w / 5)), 0.15
		elseif style == "office" then
			fopts.pier, fopts.sill, fopts.lintel, fopts.cols = 0.8, 4, 2, math.max(2, math.floor(w / 6))
		elseif style == "historic" then
			fopts.frames, fopts.arched, fopts.cols, fopts.sill, fopts.lintel, fopts.frameCol = true, true, math.max(2, math.floor(w / 7)), 3.6, 3, Color3.fromRGB(236, 230, 214)
		else
			fopts.frames, fopts.cols = true, math.max(2, math.floor(w / 7))
		end
		local cols, ww = facade(m, cf * CFrame.new(0, 0, 0.5), w, floors, fh, fopts)
		-- apartment details: balconies, AC units, satellite dishes
		if style == "apartment" then
			local pier = 1.4
			for f = 1, floors - 1 do
				for c = 0, cols - 1 do
					local x = -w / 2 + pier + ww / 2 + c * (ww + pier)
					local y = f * fh
					if (c + f) % 2 == 0 and rng:NextNumber() < 0.8 then
						B.box(m, cf * CFrame.new(x, y + 0.2, -1.8), Vector3.new(ww + 1.4, 0.4, 3.6), Color3.fromRGB(220, 216, 208), M.SmoothPlastic)
						B.box(m, cf * CFrame.new(x, y + 1.9, -3.5), Vector3.new(ww + 1.4, 3, 0.15), Color3.fromRGB(150, 190, 210), M.Glass, nc({ Transparency = 0.5 }))
						B.box(m, cf * CFrame.new(x, y + 3.45, -3.5), Vector3.new(ww + 1.4, 0.2, 0.25), Color3.fromRGB(80, 84, 90), M.Metal, nc())
						if rng:NextNumber() < 0.3 then
							-- a satellite dish on a bracket on the wall
							B.box(m, cf * CFrame.new(x + ww / 2 - 0.6, y + 4, -0.75), Vector3.new(0.2, 0.2, 0.5), Color3.fromRGB(120, 120, 126), M.Metal, nc())
							B.cyl(m, cf * CFrame.new(x + ww / 2 - 0.6, y + 4, -1.1) * CFrame.Angles(0, math.rad(80), math.rad(15)), 0.25, 1.8, Color3.fromRGB(235, 235, 235), M.SmoothPlastic, nc())
						end
						if rng:NextNumber() < 0.35 then
							Props.plant(m, cf * CFrame.new(x - ww / 2 + 1, y + 0.4, -2.5), rng)
						end
					elseif rng:NextNumber() < 0.35 then
						-- AC unit hanging under the window
						B.box(m, cf * CFrame.new(x + ww * 0.25, y + 1.2, -0.9), Vector3.new(2.6, 1.8, 1), Color3.fromRGB(236, 236, 236), M.SmoothPlastic, nc())
						B.cyl(m, cf * CFrame.new(x + ww * 0.25 - 0.4, y + 1.2, -1.42) * CFrame.Angles(0, math.pi / 2, 0), 0.05, 1.3, Color3.fromRGB(60, 60, 60), M.Metal, nc())
					end
				end
			end
		elseif style == "historic" then
			-- cornice and pilasters
			B.box(m, cf * CFrame.new(0, H - 0.56, -0.6), Vector3.new(w + 1.2, 1.2, 2.2), Color3.fromRGB(236, 230, 214), M.Limestone)
			B.box(m, cf * CFrame.new(0, fh, -0.4), Vector3.new(w + 0.6, 0.8, 1.6), Color3.fromRGB(236, 230, 214), M.Limestone)
			for _, x in { -w / 2 + 0.7, w / 2 - 0.7 } do
				B.box(m, cf * CFrame.new(x, H / 2, -0.4), Vector3.new(1.6, H, 1.4), Color3.fromRGB(226, 220, 204), M.Limestone)
			end
		end
	end

	-- sides
	for side = -1, 1, 2 do
		local faceCf = cf * CFrame.new(side * (w / 2 - 0.5), 0, d / 2) * CFrame.Angles(0, side * math.pi / 2, 0)
		if opts.blankSides then
			B.box(m, faceCf * CFrame.new(0, H / 2, 0), Vector3.new(d - 1, H, 1), shellCol, wallMat)
		else
			facade(m, faceCf, d - 1, floors, fh, { wall = shellCol, wallMat = wallMat, glass = glass, cols = math.max(1, math.floor(d / 12)), pier = 3, rng = rng, litChance = 0.2 })
		end
	end

	-- roof
	if opts.roof == "gable" then
		local roofCol = B.color(opts.roofColor or Rand.pick(rng, { { 160, 70, 50 }, { 120, 60, 50 }, { 90, 90, 96 } }))
		local rh = math.min(w, d) * 0.28
		-- front half rises towards the ridge at d/2 (wedge's tall side is its +Z), back half is mirrored
		B.wedge(m, cf * CFrame.new(0, H + rh / 2, d * 0.25), Vector3.new(w + 1, rh, d / 2 + 0.5), roofCol, M.ClayRoofTiles)
		B.wedge(m, cf * CFrame.new(0, H + rh / 2, d * 0.75) * CFrame.Angles(0, math.pi, 0), Vector3.new(w + 1, rh, d / 2 + 0.5), roofCol, M.ClayRoofTiles)
	else
		roofClutter(m, cf, w, d, H + 0.8, rng, style)
	end
	return m
end

-- What the outside of a hall is made of: picked from the name, so every place keeps its own look
-- (brick, sandstone, grey concrete or pale render).
local FACADES = {
	{ color = { 156, 88, 66 }, mat = M.Brick, base = { 120, 116, 112 }, trim = { 238, 232, 220 } },
	{ color = { 206, 184, 148 }, mat = M.Sandstone, base = { 150, 140, 128 }, trim = { 244, 240, 230 } },
	{ color = { 150, 154, 160 }, mat = M.Concrete, base = { 96, 98, 104 }, trim = { 226, 228, 230 } },
	{ color = { 232, 224, 206 }, mat = M.Plaster, base = { 140, 132, 124 }, trim = { 250, 248, 242 } },
	{ color = { 128, 74, 60 }, mat = M.Brick, base = { 84, 82, 82 }, trim = { 226, 220, 208 } },
	{ color = { 96, 110, 122 }, mat = M.Slate, base = { 70, 74, 80 }, trim = { 220, 224, 228 } },
}
local function facadeLook(name: string)
	local h = 0
	for i = 1, #name do
		h = (h * 31 + string.byte(name, i)) % 9973
	end
	return FACADES[h % #FACADES + 1]
end

-- Walk-in hall: open doorway, glass front, interior floor, lit ceiling, sign. Used by every place
-- the player can enter (stores, dealers, agencies, player shops).
-- opts: name, accent, wall, wallMat, floor, floorMat, facade ({ color, mat, base, trim }; picked from the
-- name otherwise), glassFront (true = the old all-glass front), door (width), doorX, sign (bool),
-- lightStep (studs between ceiling lights, 14 by default; big halls use more)
-- Returns the model plus a table of useful interior points.
function Buildings.hall(parent: Instance, cf: CFrame, w: number, d: number, h: number, opts)
	local o = opts or {}
	local m = B.model(o.modelName or "Hall", parent)
	local wall = B.color(o.wall or { 236, 234, 228 })
	local wallMat = o.wallMat or M.Plaster
	local floorCol = B.color(o.floor or { 214, 210, 202 })
	local floorMat = o.floorMat or M.CeramicTiles
	local accent = B.color(o.accent or { 0, 150, 200 })
	local doorW = o.door or 8
	local doorX = o.doorX or 0
	local t = 1
	-- floor and roof
	B.box(m, cf * CFrame.new(0, 0.1, d / 2), Vector3.new(w, 0.2, d), floorCol, floorMat, { Reflectance = 0.05 }).Name = "Floor"
	B.box(m, cf * CFrame.new(0, h + 0.5, d / 2), Vector3.new(w + 1, 1, d + 1), Color3.fromRGB(120, 120, 124), M.SmoothPlastic).Name = "Roof"
	B.box(m, cf * CFrame.new(0, h - 0.1, d / 2), Vector3.new(w - 2 * t, 0.2, d - 2 * t), Color3.fromRGB(246, 246, 244), M.SmoothPlastic, nc({ Name = "Ceiling" }))
	-- back and side walls
	B.box(m, cf * CFrame.new(0, h / 2, d - t / 2), Vector3.new(w, h, t), wall, wallMat).Name = "BackWall"
	for side = -1, 1, 2 do
		B.box(m, cf * CFrame.new(side * (w / 2 - t / 2), h / 2, d / 2), Vector3.new(t, h, d), wall, wallMat).Name = "SideWall"
	end
	-- The front. By default a solid wall (brick, stone or plaster, with a stone plinth, pilasters and a
	-- cornice) with window openings in it -- big shop windows with piers between them, a glass
	-- transom over the door, a sign fascia. o.glassFront = true keeps the old all-glass look, false a
	-- plain solid front.
	local doorH = math.min(if o.glassFront == nil then 9.4 else 10, h - 3)
	local leftW = (w / 2 + doorX - doorW / 2)
	local rightW = (w / 2 - doorX - doorW / 2)
	local frame = Color3.fromRGB(40, 42, 46)
	local glassCol = Color3.fromRGB(150, 182, 198)
	local signY, signH = h + 2.4, 3.8
	if o.glassFront == false then
		-- (a plain solid front, for the stately buildings)
		B.box(m, cf * CFrame.new(-w / 2 + leftW / 2, h / 2, t / 2), Vector3.new(leftW, h, t), wall, wallMat)
		B.box(m, cf * CFrame.new(w / 2 - rightW / 2, h / 2, t / 2), Vector3.new(rightW, h, t), wall, wallMat)
		B.box(m, cf * CFrame.new(doorX, (doorH + h) / 2, t / 2), Vector3.new(doorW, h - doorH, t), wall, wallMat).Name = "DoorHeader"
	elseif o.glassFront == true then
		local fasciaH = math.clamp(h * 0.2, 2, 4)
		local glassTop = h - fasciaH
		local function frontPanel(x0: number, width: number)
			if width <= 0.5 then
				return
			end
			local cx = x0 + width / 2
			B.box(m, cf * CFrame.new(cx, (1 + glassTop) / 2, t / 2), Vector3.new(width - 0.4, glassTop - 1, 0.3), glassCol, M.Glass, { Transparency = 0.5 })
			B.box(m, cf * CFrame.new(cx, 0.5, t / 2), Vector3.new(width, 1, t), frame, M.Metal)
			B.box(m, cf * CFrame.new(x0 + 0.3, glassTop / 2, t / 2), Vector3.new(0.6, glassTop, t), frame, M.Metal)
			if glassTop - doorH > 3 then
				B.box(m, cf * CFrame.new(cx, doorH + 0.25, t / 2), Vector3.new(width, 0.5, t * 0.6), frame, M.Metal)
			end
		end
		frontPanel(-w / 2, leftW)
		frontPanel(doorX + doorW / 2, rightW)
		B.box(m, cf * CFrame.new(w / 2 - 0.3, glassTop / 2, t / 2), Vector3.new(0.6, glassTop, t), frame, M.Metal)
		B.box(m, cf * CFrame.new(0, glassTop + fasciaH / 2, t / 2), Vector3.new(w, fasciaH, t), wall, wallMat).Name = "Fascia"
		B.box(m, cf * CFrame.new(doorX, doorH + 0.25, t / 2), Vector3.new(doorW, 0.5, t), frame, M.Metal).Name = "DoorHeader"
		if glassTop - doorH > 1.5 then
			B.box(m, cf * CFrame.new(doorX, (doorH + 0.5 + glassTop) / 2, t / 2), Vector3.new(doorW - 0.4, glassTop - doorH - 0.5, 0.3), glassCol, M.Glass, { Transparency = 0.5, Name = "Transom" })
		end
	else
		local ext = o.facade or facadeLook(o.name or "")
		local brick = B.color(ext.color)
		local stone = B.color(ext.base or { 150, 146, 140 })
		local trim = B.color(ext.trim or { 238, 234, 224 })
		local function wallBox(x0: number, x1: number, y0: number, y1: number, col: Color3, mat: Enum.Material, name: string?)
			if x1 - x0 < 0.05 or y1 - y0 < 0.05 then
				return
			end
			local b = B.box(m, cf * CFrame.new((x0 + x1) / 2, (y0 + y1) / 2, t / 2), Vector3.new(x1 - x0, y1 - y0, t), col, mat)
			if name then
				b.Name = name
			end
		end
		local dl, dr = doorX - doorW / 2, doorX + doorW / 2
		-- rows of windows: one on the ground floor, another above in a tall hall
		local rows = { { 3.2, math.min(9.6, h - 4.2) } }
		if h >= 26 then
			table.insert(rows, { 16.6, 23.4 })
		end
		local topRow = rows[#rows][2]
		-- the plinth under the windows (cut at the door) and the wall above the top row
		wallBox(-w / 2, dl, 0, rows[1][1], stone, M.Concrete, "Plinth")
		wallBox(dr, w / 2, 0, rows[1][1], stone, M.Concrete, "Plinth")
		wallBox(-w / 2, w / 2, topRow + 0.6, h, brick, ext.mat, "FrontWall")
		-- between the rows (a spandrel) when there are two
		if rows[2] then
			wallBox(-w / 2, w / 2, rows[1][2] + 0.6, rows[2][1], brick, ext.mat, "Spandrel")
		end
		-- over the door: wall down to the top of the door, the glass transom above it
		wallBox(dl, dr, doorH + 0.45, rows[1][2] + 0.6, frame, M.Metal, "DoorHeader")
		if rows[1][2] + 0.6 - doorH - 0.45 > 0.6 then
			B.box(m, cf * CFrame.new(doorX, (doorH + 0.45 + rows[1][2] + 0.6) / 2, t / 2), Vector3.new(doorW - 0.5, rows[1][2] + 0.6 - doorH - 1.05, 0.3), glassCol, M.Glass, { Transparency = 0.45, Name = "Transom" })
		end
		-- the windows and the brick piers between them, either side of the door
		local function windows(x0: number, x1: number, r: { number })
			local R = x1 - x0
			if R < 6 then
				wallBox(x0, x1, r[1], r[2] + 0.6, brick, ext.mat, "Pier")
				return
			end
			local n = math.max(1, math.floor((R - 3) / 10))
			local winW = math.clamp((R - 3) / n * 0.64, 4, 8.5)
			local gap = (R - n * winW) / (n + 1)
			local x = x0
			for _ = 1, n do
				wallBox(x, x + gap, r[1], r[2] + 0.6, brick, ext.mat, "Pier")
				local wx0 = x + gap
				local cx = wx0 + winW / 2
				local gh = r[2] - r[1]
				B.box(m, cf * CFrame.new(cx, r[1] + gh / 2, t / 2), Vector3.new(winW - 0.3, gh - 0.3, 0.3), glassCol, M.Glass, { Transparency = 0.4, Name = "ShopWindow" })
				-- frame, mullion, sill and lintel
				for _, fx in { -1, 1 } do
					B.box(m, cf * CFrame.new(cx + fx * (winW / 2 - 0.12), r[1] + gh / 2, t / 2 - 0.05), Vector3.new(0.24, gh, 0.5), frame, M.Metal)
				end
				B.box(m, cf * CFrame.new(cx, r[1] + 0.12, t / 2 - 0.05), Vector3.new(winW, 0.24, 0.5), frame, M.Metal)
				B.box(m, cf * CFrame.new(cx, r[2] - 0.12, t / 2 - 0.05), Vector3.new(winW, 0.24, 0.5), frame, M.Metal)
				B.box(m, cf * CFrame.new(cx, r[1] + gh / 2, t / 2 - 0.05), Vector3.new(0.18, gh, 0.4), frame, M.Metal)
				B.box(m, cf * CFrame.new(cx, r[1] - 0.2, -0.25), Vector3.new(winW + 0.8, 0.4, 1.2), trim, M.Concrete, nc({ Name = "Sill" }))
				B.box(m, cf * CFrame.new(cx, r[2] + 0.3, -0.15), Vector3.new(winW + 0.8, 0.6, 1), trim, M.Concrete, nc({ Name = "Lintel" }))
				x = wx0 + winW
			end
			wallBox(x, x1, r[1], r[2] + 0.6, brick, ext.mat, "Pier")
		end
		for _, r in rows do
			-- (the doorway only cuts the ground-floor row)
			if r == rows[1] then
				windows(-w / 2, dl, r)
				windows(dr, w / 2, r)
			else
				windows(-w / 2, w / 2, r)
			end
		end
		-- corner pilasters and a cornice with a cap along the top
		for side = -1, 1, 2 do
			B.box(m, cf * CFrame.new(side * (w / 2 - 0.7), h / 2, -0.35), Vector3.new(1.4, h, 1.3), trim, M.Concrete, nc({ Name = "Pilaster" }))
		end
		B.box(m, cf * CFrame.new(0, h - 0.4, -0.45), Vector3.new(w + 0.6, 0.8, 1.7), trim, M.Concrete, nc({ Name = "Cornice" }))
		B.box(m, cf * CFrame.new(0, h + 0.1, d / 2), Vector3.new(w + 1, 0.4, d + 1), Color3.fromRGB(96, 98, 102), M.Concrete, nc({ Name = "Parapet" }))
		-- the sign sits on the wall between the windows and the cornice
		signY = (topRow + 0.6 + h - 0.8) / 2
		signH = math.clamp(h - 0.8 - topRow - 0.6 - 0.8, 2.2, 3.8)
	end
	-- the outside of the side and back walls is cladded like the front
	if o.glassFront == nil then
		local ext = o.facade or facadeLook(o.name or "")
		local brick = B.color(ext.color)
		for side = -1, 1, 2 do
			B.box(m, cf * CFrame.new(side * (w / 2 + 0.15), h / 2, d / 2), Vector3.new(0.3, h, d), brick, ext.mat, nc({ Name = "SideCladding" }))
		end
		B.box(m, cf * CFrame.new(0, h / 2, d + 0.15), Vector3.new(w, h, 0.3), brick, ext.mat, nc({ Name = "BackCladding" }))
	end
	-- sliding door leaves parked beside the opening
	for side = -1, 1, 2 do
		local leaf = B.box(m, cf * CFrame.new(doorX + side * (doorW / 2 + doorW / 4 - 0.2), doorH / 2, -0.3), Vector3.new(doorW / 2, doorH - 0.4, 0.2), Color3.fromRGB(160, 196, 210), M.Glass, nc({ Transparency = 0.55, Name = "DoorLeaf" }))
		leaf:SetAttribute("Side", side)
	end
	-- sign band
	if o.sign ~= false then
		local band = B.box(m, cf * CFrame.new(0, signY, -0.4), Vector3.new(math.min(w - 4, math.max(16, #(o.name or "") * 2.2)), signH, 0.8), accent, M.SmoothPlastic)
		band.Name = "SignBand"
		B.sign(band, Enum.NormalId.Front, o.name or "", { color = Color3.new(1, 1, 1), glow = true, brightness = 1.4, font = o.font or B.Fonts.Heavy })
	end
	-- ceiling lights
	local step = o.lightStep or 14
	local rows = math.max(1, math.floor(d / step))
	local cols = math.max(1, math.floor(w / step))
	for r = 1, rows do
		for c = 1, cols do
			local x = -w / 2 + w * (c - 0.5) / cols
			local z = d * (r - 0.5) / rows
			-- (soft, not dazzling: a panel you can look at, and a gentle light that only reaches its neighbours)
			local panel = B.box(m, cf * CFrame.new(x, h - 0.3, z), Vector3.new(4, 0.2, 4), Color3.fromRGB(238, 232, 218), M.Neon, nc({ CastShadow = false, Name = "CeilingLight", Transparency = 0.15 }))
			if (r + c) % 2 == 0 or (rows * cols <= 2) then
				B.pointLight(panel, math.clamp(math.max(w, d) * 0.34, 18, 30), 0.42, Color3.fromRGB(255, 240, 220), false)
			end
		end
	end
	local points = {
		door = (cf * CFrame.new(doorX, 0, 2)).Position,
		outside = (cf * CFrame.new(doorX, 0, -6)).Position,
		back = (cf * CFrame.new(0, 0, d - 4)).Position,
	}
	return m, points
end

-- Two-storey suburban house with a gable roof, garden, fence and driveway.
function Buildings.house(parent: Instance, cf: CFrame, lotW: number, lotD: number, rng: Random): Model
	local m = B.model("House", parent)
	local w = math.min(lotW - 10, Rand.range(rng, 20, 28))
	local d = Rand.range(rng, 18, 24)
	local floors = if rng:NextNumber() < 0.7 then 2 else 1
	local fh = 11
	local H = floors * fh
	local setback = Rand.range(rng, 12, 16)
	local hc = cf * CFrame.new(Rand.range(rng, -2, 2), 0, setback)
	local wall = B.color(Rand.pick(rng, PLASTER))
	local trim = Color3.fromRGB(246, 244, 238)
	-- garden ground
	B.box(m, cf * CFrame.new(0, 0.3, lotD / 2), Vector3.new(lotW - 2, 0.2, lotD - 2), P.grass, M.Grass, nc({ CanCollide = true }))
	-- shell
	B.box(m, hc * CFrame.new(0, H / 2 + 0.6, d / 2), Vector3.new(w, H, d), wall, M.Plaster)
	B.box(m, hc * CFrame.new(0, 0.6, d / 2), Vector3.new(w + 1, 1.2, d + 1), Color3.fromRGB(170, 160, 150), M.SmoothPlastic)
	-- windows
	for f = 0, floors - 1 do
		for i = -1, 1 do
			if not (f == 0 and i == 0) then
				local x = i * w / 3
				local y = f * fh + 6
				B.box(m, hc * CFrame.new(x, y, -0.05), Vector3.new(4.4, 4.4, 0.3), trim, M.SmoothPlastic, nc())
				B.box(m, hc * CFrame.new(x, y, -0.15), Vector3.new(3.6, 3.6, 0.2), Color3.fromRGB(80, 110, 130), M.Glass, nc({ Transparency = 0.2 }))
				B.box(m, hc * CFrame.new(x, y - 2.5, -0.5), Vector3.new(4.8, 0.4, 1), trim, M.SmoothPlastic, nc())
				if rng:NextNumber() < 0.5 then
					local shutter = Rand.pick(rng, { Color3.fromRGB(40, 90, 70), Color3.fromRGB(110, 60, 40), Color3.fromRGB(50, 70, 110) })
					for s = -1, 1, 2 do
						B.box(m, hc * CFrame.new(x + s * 2.9, y, -0.2), Vector3.new(1.4, 4.4, 0.2), shutter, M.Wood, nc())
					end
				end
				if rng:NextNumber() < 0.3 then
					local lit = B.box(m, hc * CFrame.new(x, y, 0.3), Vector3.new(3.4, 3.4, 0.2), Color3.fromRGB(255, 214, 150), M.Neon, nc({ Transparency = 1, Name = "NightWindow" }))
					lit:AddTag("NightWindow")
				end
			end
		end
	end
	-- door and porch
	local doorCol = Rand.pick(rng, { Color3.fromRGB(110, 60, 40), Color3.fromRGB(40, 60, 100), Color3.fromRGB(150, 40, 40), Color3.fromRGB(240, 240, 236) })
	B.box(m, hc * CFrame.new(0, 4.6, -0.1), Vector3.new(4, 7.6, 0.4), doorCol, M.Wood)
	B.ball(m, hc * CFrame.new(1.4, 4.4, -0.4), 0.35, Color3.fromRGB(220, 190, 90), M.Metal, nc())
	B.box(m, hc * CFrame.new(0, 9.4, -2), Vector3.new(7, 0.4, 4), trim, M.SmoothPlastic)
	for s = -1, 1, 2 do
		B.box(m, hc * CFrame.new(s * 3.2, 5, -3.7), Vector3.new(0.5, 8.8, 0.5), trim, M.Wood)
	end
	B.box(m, hc * CFrame.new(0, 0.8, -2.5), Vector3.new(6, 0.6, 3), Color3.fromRGB(180, 170, 160), M.SmoothPlastic)
	-- gable roof
	local roofCol = B.color(Rand.pick(rng, { { 170, 70, 50 }, { 130, 60, 46 }, { 80, 84, 92 }, { 110, 90, 70 } }))
	local rh = Rand.range(rng, 6, 9)
	local ry = H + 0.6 + rh / 2
	B.wedge(m, hc * CFrame.new(0, ry, d * 0.25), Vector3.new(w + 2, rh, d / 2 + 1.2), roofCol, M.ClayRoofTiles)
	B.wedge(m, hc * CFrame.new(0, ry, d * 0.75) * CFrame.Angles(0, math.pi, 0), Vector3.new(w + 2, rh, d / 2 + 1.2), roofCol, M.ClayRoofTiles)
	B.box(m, hc * CFrame.new(w * 0.25, H + rh + 1, d * 0.6), Vector3.new(2.2, 5, 2.2), Color3.fromRGB(150, 80, 60), M.Brick)
	-- garden: fence, driveway, tree, mailbox, flowers
	B.box(m, cf * CFrame.new(lotW / 2 - 5, 0.42, setback / 2 + 4), Vector3.new(6, 0.1, setback + 8), Color3.fromRGB(150, 146, 140), M.SmoothPlastic, nc({ CanCollide = true }))
	Props.fence(m, (cf * CFrame.new(-lotW / 2 + 1, 0.4, 1.5)).Position, (cf * CFrame.new(lotW / 2 - 8.5, 0.4, 1.5)).Position, Rand.pick(rng, { "wood", "hedge", "metal", "wall" }), 3)
	Props.tree(m, cf * CFrame.new(-lotW / 2 + 6, 0.4, setback * 0.5), Rand.pick(rng, { "oak", "oak", "birch", "cypress", "pine" }), rng)
	if rng:NextNumber() < 0.6 then
		Props.flowerBed(m, cf * CFrame.new(-3, 0.4, setback - 3), 8, 2.4, rng)
	end
	Props.mailbox(m, cf * CFrame.new(lotW / 2 - 9, 0.4, 2.5))
	m:SetAttribute("HouseDoor", (hc * CFrame.new(0, 3, -4)).Position)
	B.tag(m, "House")
	return m
end

-- Warehouse / factory hall.
function Buildings.warehouse(parent: Instance, cf: CFrame, w: number, d: number, rng: Random, opts): Model
	local o = opts or {}
	local m = B.model("Warehouse", parent)
	local h = o.height or Rand.range(rng, 16, 24)
	local col = B.color(o.color or Rand.pick(rng, { { 200, 200, 196 }, { 120, 140, 160 }, { 170, 120, 90 }, { 90, 110, 100 }, { 210, 200, 170 } }))
	B.box(m, cf * CFrame.new(0, h / 2, d / 2), Vector3.new(w, h, d), col, M.Metal)
	-- vertical ribs on the front
	local ribs = math.floor(w / 4)
	for i = 0, ribs do
		B.box(m, cf * CFrame.new(-w / 2 + i * w / ribs, h / 2, -0.15), Vector3.new(0.4, h, 0.3), col:Lerp(Color3.new(0, 0, 0), 0.12), M.Metal, nc())
	end
	-- roller doors
	local doors = math.max(1, math.floor(w / 26))
	for i = 1, doors do
		local x = -w / 2 + w * i / (doors + 1)
		B.box(m, cf * CFrame.new(x, 6, -0.3), Vector3.new(12, 12, 0.4), Color3.fromRGB(150, 154, 160), M.DiamondPlate)
		B.box(m, cf * CFrame.new(x, 12.4, -0.6), Vector3.new(13, 0.8, 1), Color3.fromRGB(240, 190, 30), M.SmoothPlastic, nc())
	end
	-- sawtooth roof
	local teeth = math.max(2, math.floor(d / 14))
	for i = 0, teeth - 1 do
		local z = d * (i + 0.5) / teeth
		B.wedge(m, cf * CFrame.new(0, h + 2.5, z), Vector3.new(w, 5, d / teeth), col:Lerp(Color3.new(1, 1, 1), 0.2), M.Metal)
		-- glazing on the vertical (+Z) face of each tooth
		B.box(m, cf * CFrame.new(0, h + 2.5, z + d / teeth / 2 + 0.2), Vector3.new(w - 1, 4.6, 0.3), Color3.fromRGB(150, 190, 210), M.Glass, nc({ Transparency = 0.4 }))
	end
	if o.sign then
		local sign = B.box(m, cf * CFrame.new(0, h - 3, -0.6), Vector3.new(math.min(w - 6, 40), 4, 0.6), Color3.fromRGB(30, 50, 90), M.SmoothPlastic)
		B.sign(sign, Enum.NormalId.Front, o.sign, { color = Color3.new(1, 1, 1), font = B.Fonts.Heavy })
	end
	if o.chimney then
		local x = w / 2 - 6
		B.cylY(m, cf * CFrame.new(x, h + 14, d - 8), 28, 4, Color3.fromRGB(150, 70, 60), M.Brick)
		local top = B.cylY(m, cf * CFrame.new(x, h + 28.2, d - 8), 0.4, 4.6, Color3.fromRGB(60, 60, 60), M.Metal)
		top:AddTag("Chimney")
	end
	return m
end

return Buildings
