-- ToolModels: the hand tools you hold over the bench. Each model's tip sits at the origin and the
-- tool extends up along +Y (the bench controller points the tip at what you're working on).

local B = require(script.Parent.Parent.Util.Builder)

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

local STEEL = Color3.fromRGB(190, 194, 200)

local builders = {}

-- screwdriver (tip at the origin, handle up): a Phillips cross tip, a black-oxide shaft with a chrome
-- ring, and a shaped two-component handle -- a flared neck, a fat belly in a soft rubber grip with
-- raised ridges all round, a rounded end cap with a hanging hole -- and a colour ring that says the
-- size (red = PH2, blue = PH0).
local DARK_STEEL = Color3.fromRGB(78, 80, 86)
local function driver(m: Model, cf: CFrame, handleCol: Color3, shaftLen: number, handleLen: number, d: number)
	local band = Color3.fromRGB(32, 33, 38)
	-- the tip: two crossed blades with a dark finish, a bright magnetic point
	for k = 0, 1 do
		part(m, cf * CFrame.new(0, 0.07, 0) * CFrame.Angles(0, k * math.pi / 2, 0), Vector3.new(d * 0.34, 0.14, d * 0.055), DARK_STEEL, M.Metal, { Name = "Tip" })
	end
	cylY(m, cf * CFrame.new(0, 0.19, 0), 0.12, d * 0.2, Color3.fromRGB(205, 208, 214), M.Metal, { Name = "Point" })
	-- the shaft: black oxide, with a chrome ring near the handle
	cylY(m, cf * CFrame.new(0, 0.14 + (shaftLen - 0.14) / 2, 0), shaftLen - 0.14, d * 0.23, DARK_STEEL, M.Metal, { Name = "Shaft" })
	cylY(m, cf * CFrame.new(0, shaftLen - 0.2, 0), 0.08, d * 0.3, Color3.fromRGB(205, 208, 214), M.Metal, { Name = "ChromeRing" })
	-- the ferrule where the shaft goes into the handle, and the size ring
	local y = shaftLen
	cylY(m, cf * CFrame.new(0, y + 0.06, 0), 0.12, d * 0.46, Color3.fromRGB(205, 208, 214), M.Metal, { Name = "Ferrule" })
	cylY(m, cf * CFrame.new(0, y + 0.145, 0), 0.05, d * 0.68, handleCol, M.SmoothPlastic, { Name = "SizeRing" })
	y += 0.17
	-- the handle's shape, a stack of rings from the neck to the cap (diameters as a share of d)
	local profile = { { 0.1, 0.62 }, { 0.12, 0.78 }, { 0.16, 0.92 }, { 0.2, 1.0 }, { 0.2, 1.0 }, { 0.16, 0.94 }, { 0.12, 0.84 } }
	local total = 0
	for _, r in profile do
		total += r[1]
	end
	local k = (handleLen - 0.17) / total
	local belly0, belly1 = y, y
	for i, r in profile do
		local h = r[1] * k
		local isGrip = i >= 3 and i <= 6
		if i == 3 then
			belly0 = y
		end
		cylY(m, cf * CFrame.new(0, y + h / 2, 0), h, d * r[2], if isGrip then band else handleCol, if isGrip then M.Rubber else M.SmoothPlastic, { Name = if isGrip then "Grip" else "Handle" })
		y += h
		if i == 6 then
			belly1 = y
		end
	end
	-- raised ridges all round the grip
	local mid = (belly0 + belly1) / 2
	for n = 0, 11 do
		local a = n * math.pi / 6
		cylY(m, cf * CFrame.new(math.cos(a) * d * 0.5, mid, math.sin(a) * d * 0.5), belly1 - belly0 - 0.02, d * 0.1, band:Lerp(Color3.new(1, 1, 1), 0.12), M.Rubber, { Name = "Ridge" })
	end
	-- the rounded end cap, with its hole to hang it up by
	B.ball(m, cf * CFrame.new(0, y, 0), d * 0.84, handleCol, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "Cap" })
	cylY(m, cf * CFrame.new(0, y + d * 0.4, 0), 0.02, d * 0.22, band, M.SmoothPlastic, { Name = "Hole" })
end

builders.hand = function(m, cf)
	-- a gloved fingertip
	local glove = Color3.fromRGB(60, 120, 200)
	cylY(m, cf * CFrame.new(0, 0.18, 0), 0.36, 0.14, glove, M.Fabric)
	part(m, cf * CFrame.new(0, 0.5, 0.06), Vector3.new(0.36, 0.34, 0.24), glove, M.Fabric)
	part(m, cf * CFrame.new(0.2, 0.42, 0.02) * CFrame.Angles(0, 0, math.rad(-30)), Vector3.new(0.1, 0.3, 0.12), glove, M.Fabric)
end
builders.screwdriver = function(m, cf)
	driver(m, cf, Color3.fromRGB(224, 48, 38), 0.95, 0.75, 0.2)
end
builders.precision = function(m, cf)
	driver(m, cf, Color3.fromRGB(34, 120, 220), 0.7, 0.6, 0.13)
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
	part(m, cf * CFrame.new(0, 0.08, 0), Vector3.new(0.12, 0.16, 0.05), STEEL, M.Metal)
	part(m, cf * CFrame.new(0, 0.3, 0), Vector3.new(0.16, 0.3, 0.07), Color3.fromRGB(220, 40, 40))
end
builders.multimeter = function(m, cf)
	-- red and black probes; the meter body floats above
	cylY(m, cf * CFrame.new(-0.06, 0.25, 0), 0.5, 0.05, Color3.fromRGB(220, 30, 30), M.SmoothPlastic, { Name = "ProbeRed" })
	cylY(m, cf * CFrame.new(0.12, 0.25, 0.05), 0.5, 0.05, Color3.fromRGB(26, 26, 28), M.SmoothPlastic)
	part(m, cf * CFrame.new(0.1, 0.9, 0.2), Vector3.new(0.5, 0.8, 0.14), Color3.fromRGB(250, 200, 30), M.SmoothPlastic, { Name = "Body" })
	part(m, cf * CFrame.new(0.1, 1.05, 0.13), Vector3.new(0.36, 0.2, 0.02), Color3.fromRGB(150, 180, 150), M.SmoothPlastic, { Name = "Display" })
end
builders.spudger = function(m, cf)
	part(m, cf * CFrame.new(0, 0.15, 0), Vector3.new(0.12, 0.3, 0.02), Color3.fromRGB(240, 120, 30), M.SmoothPlastic, { Name = "Blade" })
	cylY(m, cf * CFrame.new(0, 0.55, 0), 0.55, 0.09, Color3.fromRGB(30, 30, 34))
end
builders.post_card = function(m, cf)
	part(m, cf * CFrame.new(0, 0.25, 0), Vector3.new(0.5, 0.5, 0.03), Color3.fromRGB(20, 80, 40), M.SmoothPlastic)
	part(m, cf * CFrame.new(0, 0.32, 0.02), Vector3.new(0.24, 0.12, 0.02), Color3.fromRGB(255, 40, 40), M.Neon, { Name = "Digits" })
	part(m, cf * CFrame.new(0, 0.03, 0), Vector3.new(0.4, 0.06, 0.03), Color3.fromRGB(214, 176, 72), M.Metal)
end
builders.psu_tester = function(m, cf)
	part(m, cf * CFrame.new(0, 0.3, 0), Vector3.new(0.5, 0.6, 0.16), Color3.fromRGB(40, 40, 44))
	part(m, cf * CFrame.new(0, 0.42, 0.09), Vector3.new(0.36, 0.2, 0.02), Color3.fromRGB(80, 200, 255), M.Neon, { Name = "Display" })
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
builders.hot_air = function(m, cf)
	cylY(m, cf * CFrame.new(0, 0.1, 0), 0.2, 0.08, STEEL, M.Metal, { Name = "Nozzle" })
	cylY(m, cf * CFrame.new(0, 0.6, 0), 0.8, 0.2, Color3.fromRGB(40, 40, 44))
end
builders.ultrasonic = function(m, cf)
	part(m, cf * CFrame.new(0, 0.2, 0), Vector3.new(0.6, 0.4, 0.4), STEEL, M.Metal)
	part(m, cf * CFrame.new(0, 0.42, 0), Vector3.new(0.5, 0.04, 0.3), Color3.fromRGB(150, 200, 230), M.Glass, { Transparency = 0.3 })
end
builders.thermal_camera = function(m, cf)
	part(m, cf * CFrame.new(0, 0.35, 0), Vector3.new(0.3, 0.5, 0.2), Color3.fromRGB(240, 170, 30))
	part(m, cf * CFrame.new(0, 0.5, 0.11), Vector3.new(0.24, 0.18, 0.02), Color3.fromRGB(255, 80, 60), M.Neon, { Name = "Display" })
	cylY(m, cf * CFrame.new(0, 0.08, 0), 0.12, 0.12, Color3.fromRGB(30, 30, 34))
end

-- Builds the hand-held model for a tool (model name from Data/Tools).
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
	local fn = builders[modelName] or builders.hand
	fn(m, CFrame.new())
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") then
			d.Anchored = true
		end
	end
	m.Parent = parent
	return m
end

return ToolModels
