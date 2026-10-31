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

-- screwdriver (tip at the origin, handle up): a Phillips cross tip on a chrome shaft, a metal
-- ferrule, and a chunky two-tone handle with a neck, a belly with grip flutes and a rounded butt.
local DARK_STEEL = Color3.fromRGB(96, 99, 106)
local function driver(m: Model, cf: CFrame, handleCol: Color3, shaftLen: number, handleLen: number, d: number)
	-- the tip: a narrow dark piece with two crossing blades (the Phillips cross)
	cylY(m, cf * CFrame.new(0, 0.05, 0), 0.1, d * 0.22, DARK_STEEL, M.Metal, { Name = "Tip" })
	for k = 0, 1 do
		part(m, cf * CFrame.new(0, 0.04, 0) * CFrame.Angles(0, k * math.pi / 2, 0), Vector3.new(d * 0.36, 0.08, d * 0.05), DARK_STEEL, M.Metal)
	end
	-- the shaft
	cylY(m, cf * CFrame.new(0, 0.1 + (shaftLen - 0.1) / 2, 0), shaftLen - 0.1, d * 0.24, STEEL, M.Metal, { Name = "Shaft" })
	-- the ferrule where the shaft goes into the handle
	local y = shaftLen
	cylY(m, cf * CFrame.new(0, y + 0.05, 0), 0.1, d * 0.5, STEEL, M.Metal, { Name = "Ferrule" })
	y += 0.1
	-- the neck, the belly and the rounded butt of the handle
	local neck, belly = handleLen * 0.22, handleLen * 0.62
	cylY(m, cf * CFrame.new(0, y + neck / 2, 0), neck, d * 0.72, handleCol, M.SmoothPlastic, { Name = "Neck" })
	y += neck
	local bellyMid = y + belly / 2
	cylY(m, cf * CFrame.new(0, bellyMid, 0), belly, d, handleCol, M.SmoothPlastic, { Name = "Handle" })
	-- a dark rubber grip band around the middle, with fluted ribs standing out of it
	local band = Color3.fromRGB(36, 37, 42)
	cylY(m, cf * CFrame.new(0, bellyMid, 0), belly * 0.52, d * 1.05, band, M.Rubber)
	for k = 0, 7 do
		local a = k * math.pi / 4
		cylY(m, cf * CFrame.new(math.cos(a) * d * 0.5, bellyMid, math.sin(a) * d * 0.5), belly * 0.5, d * 0.13, band:Lerp(Color3.new(1, 1, 1), 0.08), M.Rubber)
	end
	y += belly
	B.ball(m, cf * CFrame.new(0, y, 0), d * 1.0, handleCol, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CanQuery = false, CastShadow = false, Name = "Butt" })
	-- a colour stripe near the butt
	cylY(m, cf * CFrame.new(0, y - 0.04, 0), 0.05, d * 1.02, Color3.fromRGB(250, 250, 250), M.SmoothPlastic)
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
	cylY(m, cf * CFrame.new(0, 0.18, 0), 0.36, 0.05, STEEL, M.Metal, { Name = "Shaft" })
	cylY(m, cf * CFrame.new(0, 0.62, 0), 0.6, 0.2, Color3.fromRGB(40, 40, 44), M.SmoothPlastic, { Name = "Handle" })
	part(m, cf * CFrame.new(0.1, 0.62, 0), Vector3.new(0.04, 0.14, 0.08), Color3.fromRGB(80, 200, 255), M.Neon, { Name = "Led" })
end
builders.strap = function(m, cf)
	cylY(m, cf * CFrame.new(0, 0.05, 0), 0.1, 0.36, Color3.fromRGB(30, 90, 200), M.Fabric)
	cylY(m, cf * CFrame.new(0, 0.3, 0), 0.5, 0.03, Color3.fromRGB(240, 220, 40), M.SmoothPlastic)
end
builders.air_can = function(m, cf)
	cylY(m, cf * CFrame.new(0, 0.08, 0), 0.16, 0.02, Color3.fromRGB(220, 40, 40), M.SmoothPlastic, { Name = "Straw" })
	part(m, cf * CFrame.new(0, 0.2, 0), Vector3.new(0.12, 0.1, 0.16), Color3.fromRGB(30, 30, 34))
	cylY(m, cf * CFrame.new(0, 0.62, 0), 0.75, 0.32, Color3.fromRGB(40, 110, 200), M.Metal, { Name = "Can" })
	cylY(m, cf * CFrame.new(0, 1.02, 0), 0.06, 0.28, STEEL, M.Metal)
end
builders.blower = function(m, cf)
	cylY(m, cf * CFrame.new(0, 0.2, 0), 0.4, 0.1, Color3.fromRGB(30, 30, 34))
	part(m, cf * CFrame.new(0, 0.55, 0), Vector3.new(0.3, 0.4, 0.5), Color3.fromRGB(240, 120, 30))
	part(m, cf * CFrame.new(0, 0.62, 0.32), Vector3.new(0.14, 0.5, 0.16), Color3.fromRGB(30, 30, 34))
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
