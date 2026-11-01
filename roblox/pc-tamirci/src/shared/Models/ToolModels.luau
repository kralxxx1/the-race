-- ToolModels: the hand tools you hold over the bench. Each model's tip sits at the origin and the
-- tool extends up along +Y (the bench controller points the tip at what you're working on).

local B = require(script.Parent.Parent.Util.Builder)
local Assets = require(script.Parent.Parent.Util.Assets)

local ToolModels = {}
local M = Enum.Material

local function part(m: Model, cf: CFrame, size: Vector3, color, mat: Enum.Material?, extra: { [string]: any }?): BasePart
	local props = { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false }
	if extra then
		for k, v in extra do
			props[k] = v
		end
	end
	return B.box(m, cf, size, color, mat or M.SmoothPlastic, props)
end

local function cylY(m: Model, cf: CFrame, h: number, d: number, color, mat: Enum.Material?, extra: { [string]: any }?): BasePart
	local props = { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false }
	if extra then
		for k, v in extra do
			props[k] = v
		end
	end
	return B.cylY(m, cf, h, d, color, mat or M.SmoothPlastic, props)
end

local function cylZ(m: Model, cf: CFrame, len: number, d: number, color, mat: Enum.Material?, extra: { [string]: any }?): BasePart
	local props = { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false }
	if extra then
		for k, v in extra do
			props[k] = v
		end
	end
	return B.cylZ(m, cf, len, d, color, mat or M.SmoothPlastic, props)
end

local STEEL = Color3.fromRGB(190, 194, 200)

local builders = {}

-- screwdriver (tip at the origin, handle up): a tapered Phillips tip with its four flutes, a bright
-- chrome shaft, a chrome bolster, and a smooth lathe-shaped handle -- a neck that flares into a fat
-- belly with a coloured grip ring, a chrome end cap -- in a clear colour that says the size (red =
-- PH2, blue = PH0). Everything is smooth plastic or polished metal (rubber and fabric come out dark
-- and speckled in this lighting, and made the tool look like a black block).
local DARK_STEEL = Color3.fromRGB(96, 99, 106)
local CHROME = Color3.fromRGB(226, 229, 235)
local function polished(name: string, extra: { [string]: any }?): { [string]: any }
	local e = { Name = name, Reflectance = 0.28 }
	if extra then
		for k, v in extra do
			e[k] = v
		end
	end
	return e
end
local function driver(m: Model, cf: CFrame, handleCol: Color3, shaftLen: number, handleLen: number, d: number)
	local trim = handleCol:Lerp(Color3.new(1, 1, 1), 0.7)
	local deep = handleCol:Lerp(Color3.new(0, 0, 0), 0.35)
	-- the tip: a short cone (stacked discs) with the cross blades standing proud of it
	local cone = { { 0.0, 0.34 }, { 0.05, 0.5 }, { 0.1, 0.66 }, { 0.15, 0.84 }, { 0.2, 1.0 } }
	for i, c in cone do
		cylY(m, cf * CFrame.new(0, c[1] + 0.025, 0), 0.05, d * 0.2 * c[2], DARK_STEEL, M.Metal, polished("Tip" .. i, { Reflectance = 0.1 }))
	end
	for k = 0, 1 do
		part(m, cf * CFrame.new(0, 0.14, 0) * CFrame.Angles(0, k * math.pi / 2, 0), Vector3.new(d * 0.24, 0.26, d * 0.045), DARK_STEEL, M.Metal, { Name = "Flute", Reflectance = 0.1 })
	end
	-- the shaft: bright steel
	cylY(m, cf * CFrame.new(0, 0.26 + (shaftLen - 0.26) / 2, 0), shaftLen - 0.26, d * 0.2, CHROME, M.Metal, polished("Shaft"))
	-- the bolster where the shaft enters the handle: a chrome collar with a hex nut above it
	cylY(m, cf * CFrame.new(0, shaftLen + 0.02, 0), 0.1, d * 0.34, CHROME, M.Metal, polished("Bolster"))
	cylY(m, cf * CFrame.new(0, shaftLen + 0.1, 0), 0.07, d * 0.5, DARK_STEEL, M.Metal, polished("Nut", { Reflectance = 0.15 }))
	-- the handle: a lathe profile (height share, diameter share) from the neck to the cap
	local profile = {
		{ 0.00, 0.50 }, { 0.06, 0.62 }, { 0.14, 0.82 }, { 0.24, 0.96 }, { 0.36, 1.00 }, { 0.50, 1.00 },
		{ 0.64, 0.99 }, { 0.76, 0.95 }, { 0.86, 0.88 }, { 0.94, 0.78 }, { 1.00, 0.66 },
	}
	local y0 = shaftLen + 0.135
	local len = handleLen - 0.2
	-- (a smooth curve through the profile, cut into thin discs)
	local function shape(t: number): number
		for i = 1, #profile - 1 do
			local a, b = profile[i], profile[i + 1]
			if t <= b[1] then
				local u = (t - a[1]) / math.max(b[1] - a[1], 1e-4)
				u = u * u * (3 - 2 * u)
				return a[2] + (b[2] - a[2]) * u
			end
		end
		return profile[#profile][2]
	end
	local RINGS = 22
	for i = 0, RINGS - 1 do
		local t0, t1 = i / RINGS, (i + 1) / RINGS
		cylY(m, cf * CFrame.new(0, y0 + (t0 + t1) / 2 * len, 0), len / RINGS + 0.004, d * shape((t0 + t1) / 2), handleCol, M.SmoothPlastic, { Name = "Handle", Reflectance = 0.05 })
	end
	-- the coloured grip ring and fine rings above and below it, a pale size band at the neck
	cylY(m, cf * CFrame.new(0, y0 + 0.44 * len, 0), 0.07, d * 1.03, trim, M.SmoothPlastic, { Name = "SizeBand" })
	for _, f in { 0.3, 0.58, 0.66 } do
		cylY(m, cf * CFrame.new(0, y0 + f * len, 0), 0.03, d * 1.015, deep, M.SmoothPlastic, { Name = "GripGroove" })
	end
	-- the round end cap with a chrome button on it
	B.ball(m, cf * CFrame.new(0, y0 + len - 0.01, 0), d * 0.66, handleCol, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "Cap", Reflectance = 0.05 })
	cylY(m, cf * CFrame.new(0, y0 + len + d * 0.3, 0), 0.025, d * 0.3, CHROME, M.Metal, polished("CapButton"))
end

builders.hand = function(m, cf)
	-- a hand in a light-blue nitrile glove, the index finger pointing straight down at the work (its
	-- tip is the origin), the other fingers curled under the palm, the thumb out, a white cuff
	-- (built symmetric about the Y axis: the bench tilts the tool towards the camera)
	local glove = Color3.fromRGB(86, 168, 240)
	local joint = Color3.fromRGB(104, 184, 250)
	local function g(c: CFrame, size: Vector3, col: Color3?, name: string?)
		return B.ellipsoid(m, cf * c, size, col or glove, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = name or "Glove", Reflectance = 0.08 })
	end
	-- the pointing finger: a rounded tip, a straight finger, a knuckle
	g(CFrame.new(0, 0.1, 0), Vector3.new(0.2, 0.2, 0.2), glove, "Fingertip")
	B.cylY(m, cf * CFrame.new(0, 0.42, 0), 0.64, 0.2, glove, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "Finger", Reflectance = 0.08 })
	for _, y in { 0.28, 0.58 } do
		g(CFrame.new(0, y, 0), Vector3.new(0.215, 0.07, 0.215), joint, "FingerJoint")
	end
	g(CFrame.new(0, 0.75, 0), Vector3.new(0.22, 0.22, 0.22), glove, "Knuckle")
	-- the three curled fingers: knuckle bumps along the front of the palm, to the side of the pointer
	for i = 1, 3 do
		g(CFrame.new(0.19 * i, 0.74, 0), Vector3.new(0.2, 0.24, 0.22), glove, "CurledFinger")
		g(CFrame.new(0.19 * i, 0.62, 0), Vector3.new(0.19, 0.2, 0.2), joint, "CurledTip")
	end
	-- the thumb, out to the other side and angled away
	g(CFrame.new(-0.27, 0.8, 0) * CFrame.Angles(0, 0, math.rad(34)), Vector3.new(0.2, 0.46, 0.2), glove, "Thumb")
	-- the palm and back of the hand: one wide rounded block above the knuckles
	g(CFrame.new(0.18, 1.12, 0), Vector3.new(0.9, 0.62, 0.46), glove, "Palm")
	-- the wrist and the white cuff of the glove
	B.cylY(m, cf * CFrame.new(0.18, 1.58, 0), 0.34, 0.5, glove, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "Wrist", Reflectance = 0.08 })
	B.cylY(m, cf * CFrame.new(0.18, 1.84, 0), 0.24, 0.56, Color3.fromRGB(244, 246, 250), M.SmoothPlastic, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "Cuff" })
end
builders.screwdriver = function(m, cf)
	driver(m, cf, Color3.fromRGB(224, 48, 38), 0.95, 0.75, 0.2)
end
builders.precision = function(m, cf)
	-- a precision (jeweller's) driver: a long thin shaft, a knurled blue-anodised barrel and a
	-- spinning chrome cap you press with the forefinger
	local blue = Color3.fromRGB(40, 118, 232)
	for i, c in { { 0.0, 0.36 }, { 0.04, 0.55 }, { 0.08, 0.8 }, { 0.12, 1.0 } } do
		cylY(m, cf * CFrame.new(0, c[1] + 0.02, 0), 0.04, 0.05 * c[2], DARK_STEEL, M.Metal, polished("Tip" .. i, { Reflectance = 0.1 }))
	end
	cylY(m, cf * CFrame.new(0, 0.45, 0), 0.7, 0.045, CHROME, M.Metal, polished("Shaft"))
	cylY(m, cf * CFrame.new(0, 0.84, 0), 0.1, 0.1, CHROME, M.Metal, polished("Collar"))
	cylY(m, cf * CFrame.new(0, 0.92, 0), 0.06, 0.14, DARK_STEEL, M.Metal, polished("Nut", { Reflectance = 0.15 }))
	-- the barrel: slim at the neck, knurled rings all along it
	for i = 0, 8 do
		local f = i / 8
		local dia = 0.13 + 0.07 * math.sin(math.min(f * 1.4, 1) * math.pi / 2)
		cylY(m, cf * CFrame.new(0, 1.0 + i * 0.07, 0), 0.075, dia, if i % 2 == 0 then blue else blue:Lerp(Color3.new(1, 1, 1), 0.18), M.Metal, polished("Barrel", { Reflectance = 0.18 }))
	end
	cylY(m, cf * CFrame.new(0, 1.6, 0), 0.05, 0.19, CHROME, M.Metal, polished("CapRing"))
	cylY(m, cf * CFrame.new(0, 1.66, 0), 0.08, 0.14, CHROME, M.Metal, polished("SwivelCap"))
	B.ball(m, cf * CFrame.new(0, 1.7, 0), 0.13, CHROME, M.Metal, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "CapDome", Reflectance = 0.3 })
end
builders.electric_screwdriver = function(m, cf)
	-- a cordless pen-style driver: a hex bit in a magnetic chuck, an orange collar, a slim graphite
	-- body with soft grip rings, a status light ring, a USB-C port and a rounded cap
	local graphite, orange = Color3.fromRGB(46, 48, 54), Color3.fromRGB(240, 120, 30)
	cylY(m, cf * CFrame.new(0, 0.2, 0), 0.4, 0.05, Color3.fromRGB(205, 208, 214), M.Metal, { Name = "Bit" })
	part(m, cf * CFrame.new(0, 0.05, 0), Vector3.new(0.09, 0.1, 0.02), DARK_STEEL, M.Metal, { Name = "Tip" })
	part(m, cf * CFrame.new(0, 0.05, 0), Vector3.new(0.02, 0.1, 0.09), DARK_STEEL, M.Metal)
	cylY(m, cf * CFrame.new(0, 0.46, 0), 0.14, 0.13, DARK_STEEL, M.Metal, { Name = "Chuck" })
	cylY(m, cf * CFrame.new(0, 0.58, 0), 0.1, 0.19, orange, M.SmoothPlastic, { Name = "Collar" })
	cylY(m, cf * CFrame.new(0, 1.0, 0), 0.74, 0.2, graphite, M.SmoothPlastic, { Name = "Handle" })
	for _, yy in { 0.78, 0.9, 1.02, 1.14 } do
		cylY(m, cf * CFrame.new(0, yy, 0), 0.05, 0.215, Color3.fromRGB(28, 29, 33), M.Rubber, { Name = "GripRing" })
	end
	cylY(m, cf * CFrame.new(0, 1.28, 0), 0.04, 0.215, Color3.fromRGB(80, 200, 255), M.Neon, { Name = "Led" })
	part(m, cf * CFrame.new(0, 1.36, 0.1), Vector3.new(0.09, 0.05, 0.03), Color3.fromRGB(14, 14, 16), M.SmoothPlastic, { Name = "UsbC" })
	B.ball(m, cf * CFrame.new(0, 1.4, 0), 0.2, orange, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "Cap" })
end
builders.strap = function(m, cf)
	cylY(m, cf * CFrame.new(0, 0.05, 0), 0.1, 0.36, Color3.fromRGB(30, 90, 200), M.Fabric)
	cylY(m, cf * CFrame.new(0, 0.3, 0), 0.5, 0.03, Color3.fromRGB(240, 220, 40), M.SmoothPlastic)
end
builders.air_can = function(m, cf)
	-- a can of compressed air: the red straw, the black trigger head, a tall blue can with a white
	-- label band and hazard stripes
	local blue = Color3.fromRGB(34, 98, 190)
	cylY(m, cf * CFrame.new(0, 0.2, 0.0), 0.4, 0.028, Color3.fromRGB(226, 40, 40), M.SmoothPlastic, { Name = "Straw" })
	part(m, cf * CFrame.new(0, 0.5, 0), Vector3.new(0.14, 0.16, 0.34), Color3.fromRGB(26, 26, 30), M.SmoothPlastic, { Name = "Nozzle" })
	part(m, cf * CFrame.new(0, 0.66, 0.2) * CFrame.Angles(math.rad(-14), 0, 0), Vector3.new(0.07, 0.04, 0.3), Color3.fromRGB(200, 200, 206), M.Metal, { Name = "Trigger" })
	cylY(m, cf * CFrame.new(0, 0.62, 0), 0.12, 0.28, Color3.fromRGB(26, 26, 30), M.SmoothPlastic, { Name = "Head" })
	cylY(m, cf * CFrame.new(0, 0.72, 0), 0.08, 0.34, Color3.fromRGB(205, 208, 214), M.Metal, { Name = "Shoulder" })
	cylY(m, cf * CFrame.new(0, 1.24, 0), 1.0, 0.36, blue, M.Metal, { Name = "Can", Reflectance = 0.12 })
	cylY(m, cf * CFrame.new(0, 1.26, 0), 0.5, 0.365, Color3.fromRGB(245, 245, 248), M.SmoothPlastic, { Name = "Label" })
	cylY(m, cf * CFrame.new(0, 1.04, 0), 0.07, 0.368, Color3.fromRGB(240, 190, 20), M.SmoothPlastic, { Name = "Hazard" })
	cylY(m, cf * CFrame.new(0, 1.48, 0), 0.07, 0.368, Color3.fromRGB(240, 190, 20), M.SmoothPlastic)
	cylY(m, cf * CFrame.new(0, 1.74, 0), 0.04, 0.38, Color3.fromRGB(205, 208, 214), M.Metal, { Name = "Base" })
end
builders.blower = function(m, cf)
	-- a rocket air blower: a long chrome nozzle with a black tip and a big squeezable rubber bulb on
	-- a flared collar and a flat foot, so it stands on its own
	local red = Color3.fromRGB(214, 52, 38)
	cylY(m, cf * CFrame.new(0, 0.05, 0), 0.1, 0.05, Color3.fromRGB(26, 26, 30), M.Rubber, { Name = "Tip" })
	cylY(m, cf * CFrame.new(0, 0.45, 0), 0.7, 0.07, Color3.fromRGB(205, 208, 214), M.Metal, { Name = "Nozzle" })
	cylY(m, cf * CFrame.new(0, 0.86, 0), 0.14, 0.14, Color3.fromRGB(26, 26, 30), M.Rubber, { Name = "Collar" })
	B.ellipsoid(m, cf * CFrame.new(0, 1.35, 0), Vector3.new(0.62, 0.95, 0.62), red, M.Rubber, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "Bulb" })
	cylY(m, cf * CFrame.new(0, 1.84, 0), 0.12, 0.36, Color3.fromRGB(26, 26, 30), M.Rubber, { Name = "Foot" })
	cylY(m, cf * CFrame.new(0, 1.9, 0), 0.04, 0.4, Color3.fromRGB(205, 208, 214), M.Metal)
end
builders.brush = function(m, cf)
	part(m, cf * CFrame.new(0, 0.1, 0), Vector3.new(0.22, 0.2, 0.06), Color3.fromRGB(40, 40, 44), M.Fabric, { Name = "Bristles" })
	part(m, cf * CFrame.new(0, 0.26, 0), Vector3.new(0.22, 0.12, 0.08), STEEL, M.Metal)
	cylY(m, cf * CFrame.new(0, 0.6, 0), 0.6, 0.09, Color3.fromRGB(200, 150, 90), M.Wood)
end
builders.bottle = function(m, cf)
	part(m, cf * CFrame.new(0, 0.08, 0), Vector3.new(0.3, 0.16, 0.26), Color3.fromRGB(240, 240, 236), M.Fabric, { Name = "Cloth" })
	cylY(m, cf * CFrame.new(0, 0.5, 0.25), 0.6, 0.24, Color3.fromRGB(200, 230, 255), M.Glass, { Transparency = 0.3 })
	cylY(m, cf * CFrame.new(0, 0.86, 0.25), 0.12, 0.12, Color3.fromRGB(30, 120, 200))
end
builders.syringe = function(m, cf)
	cylY(m, cf * CFrame.new(0, 0.06, 0), 0.12, 0.03, Color3.fromRGB(150, 150, 156), M.Metal, { Name = "Nozzle" })
	cylY(m, cf * CFrame.new(0, 0.38, 0), 0.52, 0.12, Color3.fromRGB(230, 230, 236), M.Glass, { Transparency = 0.2 })
	cylY(m, cf * CFrame.new(0, 0.36, 0), 0.48, 0.09, Color3.fromRGB(150, 152, 160), M.SmoothPlastic, { Name = "Paste" })
	cylY(m, cf * CFrame.new(0, 0.72, 0), 0.2, 0.05, Color3.fromRGB(200, 200, 204), M.SmoothPlastic, { Name = "Plunger" })
	cylY(m, cf * CFrame.new(0, 0.84, 0), 0.03, 0.16, Color3.fromRGB(200, 200, 204))
end
builders.magnifier = function(m, cf)
	B.cyl(m, cf * CFrame.new(0, 0.32, 0) * CFrame.Angles(0, 0, math.rad(90)) * CFrame.Angles(0, math.rad(90), 0), 0.04, 0.5, Color3.fromRGB(180, 220, 255), M.Glass, { Transparency = 0.5, CanCollide = false, CanQuery = false, CanTouch = false })
	B.cyl(m, cf * CFrame.new(0, 0.32, 0) * CFrame.Angles(0, 0, math.rad(90)) * CFrame.Angles(0, math.rad(90), 0), 0.05, 0.56, Color3.fromRGB(30, 30, 34), M.SmoothPlastic, { Transparency = 0.6, CanCollide = false, CanQuery = false, CanTouch = false })
	cylY(m, cf * CFrame.new(0, 0.8, 0), 0.5, 0.1, Color3.fromRGB(30, 30, 34))
	part(m, cf * CFrame.new(0, 0.58, 0), Vector3.new(0.06, 0.06, 0.06), Color3.fromRGB(255, 255, 240), M.Neon)
end
builders.usb = function(m, cf)
	-- a USB boot stick: a steel plug with its two contact bars, a rounded red body with a pale
	-- label and a hole for a lanyard (the plug end is the tip)
	local red = Color3.fromRGB(228, 44, 44)
	part(m, cf * CFrame.new(0, 0.1, 0), Vector3.new(0.17, 0.2, 0.065), CHROME, M.Metal, { Name = "Plug", Reflectance = 0.25 })
	part(m, cf * CFrame.new(0, 0.1, 0.034), Vector3.new(0.1, 0.12, 0.012), Color3.fromRGB(30, 30, 34), M.SmoothPlastic, { Name = "Contacts" })
	part(m, cf * CFrame.new(0, 0.1, -0.034), Vector3.new(0.1, 0.12, 0.012), Color3.fromRGB(30, 30, 34), M.SmoothPlastic)
	part(m, cf * CFrame.new(0, 0.2, 0), Vector3.new(0.2, 0.05, 0.1), Color3.fromRGB(190, 194, 202), M.Metal, { Name = "Collar", Reflectance = 0.2 })
	part(m, cf * CFrame.new(0, 0.46, 0), Vector3.new(0.2, 0.5, 0.1), red, M.SmoothPlastic, { Name = "Body", Reflectance = 0.06 })
	B.ellipsoid(m, cf * CFrame.new(0, 0.7, 0), Vector3.new(0.2, 0.2, 0.1), red, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "Round" })
	part(m, cf * CFrame.new(0, 0.46, 0.052), Vector3.new(0.14, 0.26, 0.006), Color3.fromRGB(244, 244, 248), M.SmoothPlastic, { Name = "Label" })
	cylY(m, cf * CFrame.new(0, 0.72, 0), 0.1, 0.05, Color3.fromRGB(40, 40, 46), M.SmoothPlastic, { Name = "Hole" })
end
builders.multimeter = function(m, cf)
	-- a digital multimeter: two probes (red and black, steel tips, thin leads) and, above them, the
	-- yellow meter with its dark rubber holster, screen, selector dial, buttons and sockets
	local yellow, holster = Color3.fromRGB(250, 205, 40), Color3.fromRGB(46, 48, 54)
	for i, def in { { -0.12, 0, Color3.fromRGB(226, 40, 40) }, { 0.12, 0.04, Color3.fromRGB(30, 30, 34) } } do
		cylY(m, cf * CFrame.new(def[1], 0.08, def[2]), 0.16, 0.025, CHROME, M.Metal, polished("ProbeTip" .. i))
		cylY(m, cf * CFrame.new(def[1], 0.3, def[2]), 0.3, 0.06, def[3], M.SmoothPlastic, { Name = "ProbeGrip" .. i })
		cylY(m, cf * CFrame.new(def[1], 0.5, def[2]), 0.1, 0.08, def[3], M.SmoothPlastic, { Name = "ProbeGuard" })
		cylY(m, cf * CFrame.new(def[1] * 1.2, 0.8, def[2] + 0.04), 0.5, 0.018, def[3], M.SmoothPlastic, { Name = "Lead" })
	end
	local c = cf * CFrame.new(0.02, 1.35, 0.1) * CFrame.Angles(math.rad(-12), 0, 0)
	part(m, c, Vector3.new(0.62, 0.92, 0.2), holster, M.SmoothPlastic, { Name = "Holster" })
	part(m, c * CFrame.new(0, 0, 0.035), Vector3.new(0.52, 0.82, 0.17), yellow, M.SmoothPlastic, { Name = "Body", Reflectance = 0.04 })
	part(m, c * CFrame.new(0, 0.26, 0.125), Vector3.new(0.4, 0.2, 0.02), Color3.fromRGB(150, 188, 152), M.SmoothPlastic, { Name = "Display" })
	for k = 0, 2 do
		part(m, c * CFrame.new(-0.12 + k * 0.12, 0.26, 0.138), Vector3.new(0.07, 0.11, 0.008), Color3.fromRGB(30, 46, 34), M.SmoothPlastic, { Name = "Digit" })
	end
	cylZ(m, c * CFrame.new(0, -0.06, 0.13), 0.04, 0.32, Color3.fromRGB(30, 30, 34), M.SmoothPlastic, { Name = "Dial" })
	part(m, c * CFrame.new(0.07, -0.02, 0.155), Vector3.new(0.02, 0.1, 0.01), Color3.fromRGB(244, 244, 248), M.SmoothPlastic, { Name = "DialMark" })
	for k = 0, 2 do
		part(m, c * CFrame.new(-0.15 + k * 0.15, 0.1, 0.125), Vector3.new(0.09, 0.05, 0.02), Color3.fromRGB(60, 62, 70), M.SmoothPlastic, { Name = "Button" })
	end
	for k, col in { Color3.fromRGB(226, 40, 40), Color3.fromRGB(30, 30, 34), Color3.fromRGB(30, 30, 34) } do
		cylZ(m, c * CFrame.new(-0.14 + (k - 1) * 0.14, -0.34, 0.125), 0.03, 0.09, col, M.SmoothPlastic, { Name = "Socket" })
	end
end
builders.spudger = function(m, cf)
	part(m, cf * CFrame.new(0, 0.15, 0), Vector3.new(0.12, 0.3, 0.02), Color3.fromRGB(240, 120, 30), M.SmoothPlastic, { Name = "Blade" })
	cylY(m, cf * CFrame.new(0, 0.55, 0), 0.55, 0.09, Color3.fromRGB(30, 30, 34))
end
builders.post_card = function(m, cf)
	-- a POST diagnostic card: a green PCB with its gold edge connector (the tip), two seven-segment
	-- digits and a row of LEDs, a metal bracket and a few chips
	part(m, cf * CFrame.new(0, 0.34, 0), Vector3.new(0.62, 0.56, 0.035), Color3.fromRGB(24, 128, 62), M.SmoothPlastic, { Name = "Board" })
	part(m, cf * CFrame.new(0, 0.04, 0), Vector3.new(0.5, 0.08, 0.04), Color3.fromRGB(226, 184, 84), M.Metal, { Name = "Fingers", Reflectance = 0.2 })
	for k = 0, 1 do
		part(m, cf * CFrame.new(-0.1 + k * 0.2, 0.38, 0.026), Vector3.new(0.16, 0.26, 0.012), Color3.fromRGB(22, 10, 10), M.SmoothPlastic, { Name = "DigitBox" })
		part(m, cf * CFrame.new(-0.1 + k * 0.2, 0.38, 0.034), Vector3.new(0.1, 0.02, 0.006), Color3.fromRGB(255, 50, 40), M.Neon, { Name = "Digits" })
		part(m, cf * CFrame.new(-0.1 + k * 0.2, 0.3, 0.034), Vector3.new(0.02, 0.1, 0.006), Color3.fromRGB(255, 50, 40), M.Neon)
		part(m, cf * CFrame.new(-0.1 + k * 0.2, 0.46, 0.034), Vector3.new(0.02, 0.1, 0.006), Color3.fromRGB(255, 50, 40), M.Neon)
	end
	for k = 0, 5 do
		part(m, cf * CFrame.new(-0.22 + k * 0.088, 0.17, 0.024), Vector3.new(0.04, 0.04, 0.02), if k % 2 == 0 then Color3.fromRGB(80, 255, 110) else Color3.fromRGB(255, 190, 40), M.Neon, { Name = "Led" })
	end
	part(m, cf * CFrame.new(-0.18, 0.56, 0.03), Vector3.new(0.18, 0.1, 0.03), Color3.fromRGB(26, 26, 30), M.SmoothPlastic, { Name = "Chip" })
	part(m, cf * CFrame.new(0.2, 0.56, 0.03), Vector3.new(0.12, 0.1, 0.03), Color3.fromRGB(26, 26, 30), M.SmoothPlastic)
	part(m, cf * CFrame.new(0.36, 0.5, 0), Vector3.new(0.04, 0.6, 0.12), Color3.fromRGB(200, 204, 212), M.Metal, { Name = "Bracket", Reflectance = 0.2 })
end
builders.psu_tester = function(m, cf)
	-- a PSU tester: a black case with the white 24-pin socket on top (the tip end), a bright LCD,
	-- a column of rail LEDs and its two buttons
	part(m, cf * CFrame.new(0, 0.36, 0), Vector3.new(0.56, 0.62, 0.2), Color3.fromRGB(46, 50, 58), M.SmoothPlastic, { Name = "Case", Reflectance = 0.05 })
	part(m, cf * CFrame.new(0, 0.05, 0), Vector3.new(0.4, 0.1, 0.16), Color3.fromRGB(240, 240, 232), M.SmoothPlastic, { Name = "Socket" })
	for k = 0, 11 do
		part(m, cf * CFrame.new(-0.165 + k * 0.03, 0.04, 0.05), Vector3.new(0.018, 0.05, 0.03), Color3.fromRGB(30, 30, 30), M.SmoothPlastic, { Name = "Pin" })
		part(m, cf * CFrame.new(-0.165 + k * 0.03, 0.04, -0.05), Vector3.new(0.018, 0.05, 0.03), Color3.fromRGB(30, 30, 30), M.SmoothPlastic)
	end
	part(m, cf * CFrame.new(0, 0.5, 0.104), Vector3.new(0.42, 0.22, 0.012), Color3.fromRGB(70, 200, 255), M.Neon, { Name = "Display" })
	for k = 0, 3 do
		part(m, cf * CFrame.new(-0.18 + k * 0.12, 0.3, 0.104), Vector3.new(0.05, 0.05, 0.012), if k % 2 == 0 then Color3.fromRGB(80, 255, 110) else Color3.fromRGB(255, 200, 40), M.Neon, { Name = "Led" })
	end
	for k = 0, 1 do
		cylZ(m, cf * CFrame.new(-0.1 + k * 0.2, 0.17, 0.108), 0.025, 0.1, Color3.fromRGB(190, 40, 40), M.SmoothPlastic, { Name = "Button" })
	end
end
builders.tweezers = function(m, cf)
	for _, s in { -1, 1 } do
		part(m, cf * CFrame.new(s * 0.03, 0.35, 0) * CFrame.Angles(0, 0, math.rad(s * 3)), Vector3.new(0.025, 0.7, 0.05), STEEL, M.Metal)
	end
end
builders.soldering_iron = function(m, cf)
	cylY(m, cf * CFrame.new(0, 0.12, 0), 0.24, 0.025, Color3.fromRGB(200, 120, 60), M.Metal, { Name = "Tip" })
	cylY(m, cf * CFrame.new(0, 0.38, 0), 0.3, 0.07, STEEL, M.Metal)
	cylY(m, cf * CFrame.new(0, 0.82, 0), 0.6, 0.14, Color3.fromRGB(40, 110, 200), M.Rubber, { Name = "Grip" })
	part(m, cf * CFrame.new(0, 0.02, 0), Vector3.new(0.03, 0.03, 0.03), Color3.fromRGB(255, 120, 30), M.Neon, { Name = "Glow", Transparency = 0.4 })
end
builders.ultrasonic = function(m, cf)
	-- an ultrasonic cleaner: a steel tank with a glass lid showing the cleaning bath, a control panel
	-- with a timer display, two knobs and a power button
	local steel = Color3.fromRGB(196, 200, 208)
	part(m, cf * CFrame.new(0, 0.26, 0), Vector3.new(0.7, 0.5, 0.5), steel, M.Metal, { Name = "Tank", Reflectance = 0.2 })
	part(m, cf * CFrame.new(0, 0.5, 0), Vector3.new(0.6, 0.06, 0.4), Color3.fromRGB(26, 28, 34), M.SmoothPlastic, { Name = "Rim" })
	part(m, cf * CFrame.new(0, 0.505, 0), Vector3.new(0.54, 0.05, 0.34), Color3.fromRGB(150, 205, 235), M.SmoothPlastic, { Name = "Bath", Transparency = 0.35, Reflectance = 0.2 })
	part(m, cf * CFrame.new(0, 0.24, 0.255), Vector3.new(0.6, 0.34, 0.02), Color3.fromRGB(34, 36, 42), M.SmoothPlastic, { Name = "Panel" })
	part(m, cf * CFrame.new(-0.12, 0.3, 0.27), Vector3.new(0.22, 0.1, 0.01), Color3.fromRGB(255, 120, 60), M.Neon, { Name = "Timer" })
	for k = 0, 1 do
		cylZ(m, cf * CFrame.new(0.12 + k * 0.14, 0.3, 0.275), 0.04, 0.09, Color3.fromRGB(220, 224, 232), M.Metal, { Name = "Knob", Reflectance = 0.2 })
	end
	cylZ(m, cf * CFrame.new(0, 0.16, 0.275), 0.03, 0.08, Color3.fromRGB(70, 220, 110), M.Neon, { Name = "PowerButton" })
	for _, x in { -0.28, 0.28 } do
		cylY(m, cf * CFrame.new(x, 0.02, 0.18), 0.04, 0.08, Color3.fromRGB(30, 30, 34), M.SmoothPlastic, { Name = "Foot" })
		cylY(m, cf * CFrame.new(x, 0.02, -0.18), 0.04, 0.08, Color3.fromRGB(30, 30, 34), M.SmoothPlastic)
	end
end
builders.hot_air = function(m, cf)
	-- a hot-air rework gun: a steel nozzle with a heat shield, a slim black barrel with vents, a
	-- rubber-grip handle and its cable, a glowing element at the tip
	part(m, cf * CFrame.new(0, 0.02, 0), Vector3.new(0.06, 0.04, 0.06), Color3.fromRGB(255, 140, 50), M.Neon, { Name = "Glow", Transparency = 0.45 })
	cylY(m, cf * CFrame.new(0, 0.18, 0), 0.28, 0.12, CHROME, M.Metal, polished("Nozzle"))
	cylY(m, cf * CFrame.new(0, 0.4, 0), 0.2, 0.2, Color3.fromRGB(150, 154, 162), M.Metal, polished("Shield", { Reflectance = 0.15 }))
	cylY(m, cf * CFrame.new(0, 0.74, 0), 0.5, 0.22, Color3.fromRGB(44, 48, 56), M.SmoothPlastic, { Name = "Barrel", Reflectance = 0.05 })
	for k = 0, 4 do
		cylY(m, cf * CFrame.new(0, 0.58 + k * 0.1, 0), 0.03, 0.235, Color3.fromRGB(190, 40, 40), M.SmoothPlastic, { Name = "Vent" })
	end
	part(m, cf * CFrame.new(0, 1.12, 0.12) * CFrame.Angles(math.rad(-22), 0, 0), Vector3.new(0.17, 0.56, 0.2), Color3.fromRGB(34, 36, 42), M.SmoothPlastic, { Name = "Handle" })
	cylY(m, cf * CFrame.new(0, 1.42, 0.2) * CFrame.Angles(math.rad(-22), 0, 0), 0.1, 0.12, Color3.fromRGB(190, 40, 40), M.SmoothPlastic, { Name = "CableGland" })
end
builders.thermal_camera = function(m, cf)
	-- a handheld thermal imager: an orange-and-black body, a big colour screen showing a heat map,
	-- a lens ring at the front (the tip end), a pistol grip with a trigger
	local orange = Color3.fromRGB(246, 150, 30)
	part(m, cf * CFrame.new(0, 0.48, 0), Vector3.new(0.38, 0.6, 0.2), orange, M.SmoothPlastic, { Name = "Body", Reflectance = 0.05 })
	part(m, cf * CFrame.new(0, 0.2, 0), Vector3.new(0.32, 0.12, 0.16), Color3.fromRGB(40, 42, 48), M.SmoothPlastic, { Name = "LensHousing" })
	cylY(m, cf * CFrame.new(0, 0.06, 0), 0.12, 0.2, Color3.fromRGB(26, 28, 34), M.SmoothPlastic, { Name = "Lens" })
	cylY(m, cf * CFrame.new(0, 0.005, 0), 0.02, 0.15, Color3.fromRGB(70, 90, 130), M.Glass, { Name = "LensGlass", Reflectance = 0.4 })
	part(m, cf * CFrame.new(0, 0.58, 0.104), Vector3.new(0.3, 0.34, 0.012), Color3.fromRGB(24, 24, 30), M.SmoothPlastic, { Name = "ScreenFrame" })
	local ramp = { Color3.fromRGB(40, 30, 140), Color3.fromRGB(150, 40, 170), Color3.fromRGB(230, 60, 80), Color3.fromRGB(255, 160, 40), Color3.fromRGB(255, 240, 120) }
	for k, c in ramp do
		part(m, cf * CFrame.new(0, 0.44 + k * 0.058, 0.112), Vector3.new(0.26, 0.06, 0.008), c, M.Neon, { Name = "Heat" })
	end
	part(m, cf * CFrame.new(0, 0.84, 0.05) * CFrame.Angles(math.rad(-10), 0, 0), Vector3.new(0.3, 0.1, 0.18), Color3.fromRGB(40, 42, 48), M.SmoothPlastic, { Name = "Grip" })
	for k = 0, 2 do
		cylZ(m, cf * CFrame.new(-0.1 + k * 0.1, 0.3, 0.108), 0.025, 0.06, Color3.fromRGB(30, 30, 34), M.SmoothPlastic, { Name = "Button" })
	end
end

-- Builds the hand-held model for a tool (model name from Data/Tools).
-- Tools for which a published model may be in the place (Data/ToolboxAssets, put there by
-- ToolboxService or the Studio importer): its parts are copied in, tip at the origin, handle up.
-- Without one, our own lathe-turned model below is built.
local PUBLISHED = { screwdriver = "screwdriver" }
local function published(m: Model, slot: string): boolean
	local src = Assets.get("Toolbox", slot)
	if not src then
		return false
	end
	local n = 0
	for _, d in src:GetChildren() do
		if d:IsA("BasePart") and d ~= src.PrimaryPart then
			d:Clone().Parent = m
			n += 1
		end
	end
	if n > 0 then
		m:SetAttribute("Published", src:GetAttribute("ToolboxId") or true)
	end
	return n > 0
end

function ToolModels.build(modelName: string, parent: Instance?): Model
	local m = Instance.new("Model")
	m.Name = "Tool_" .. modelName
	local root = Instance.new("Part")
	root.Name = "Tip"
	root.Size = Vector3.new(0.05, 0.05, 0.05)
	root.Transparency = 1
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = false
	root.CanTouch = false
	root.Parent = m
	m.PrimaryPart = root
	if not (PUBLISHED[modelName] and published(m, PUBLISHED[modelName])) then
		local fn = builders[modelName] or builders.hand
		fn(m, CFrame.new())
	end
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") then
			d.Anchored = true
		end
	end
	m.Parent = parent
	return m
end

return ToolModels
