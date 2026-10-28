-- Sky: flocks of birds (gulls by the sea, pigeons over town) wheeling around the player, an
-- airliner crossing high above now and then, and hot-air balloons drifting over the city.
-- Everything is local to each client and made of a handful of parts.

local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local CityLayout = require(Shared.World.CityLayout)

local Sky = {}

local rng = Random.new()
local folder: Folder

local FLOCKS = 4
local BIRDS_PER_FLOCK = 7

local function part(size: Vector3, color: Color3, material: Enum.Material?, shape: Enum.PartType?): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Size = size
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	if shape then
		p.Shape = shape
	end
	p.Parent = folder
	return p
end

local function camPos(): Vector3
	local cam = Workspace.CurrentCamera
	return if cam then cam.CFrame.Position else Vector3.zero
end

----------------------------------------------------------------------------------------------------
-- Birds
----------------------------------------------------------------------------------------------------
local flocks = {}

local function placeFlock(f)
	local c = camPos()
	local center = Vector3.new(c.X + rng:NextNumber(-260, 260), 0, c.Z + rng:NextNumber(-260, 260))
	local seaside = center.Z > CityLayout.BEACH_Z - 120
	f.center = center
	f.height = rng:NextNumber(42, 85)
	f.radius = rng:NextNumber(25, 60)
	f.speed = rng:NextNumber(0.25, 0.45) * (if rng:NextNumber() < 0.5 then 1 else -1)
	local color = if seaside then Color3.fromRGB(244, 244, 240) else Color3.fromRGB(120, 124, 132)
	for _, b in f.birds do
		b.body.Color = color
		b.wingL.Color = color
		b.wingR.Color = color
	end
end

local function makeFlock()
	local f = { birds = {}, t = rng:NextNumber() * 10 }
	for i = 1, BIRDS_PER_FLOCK do
		table.insert(f.birds, {
			body = part(Vector3.new(0.45, 0.35, 1.1), Color3.new(1, 1, 1), nil, Enum.PartType.Ball),
			wingL = part(Vector3.new(1.3, 0.06, 0.45), Color3.new(1, 1, 1)),
			wingR = part(Vector3.new(1.3, 0.06, 0.45), Color3.new(1, 1, 1)),
			offset = i / BIRDS_PER_FLOCK * math.pi * 2 * rng:NextNumber(0.85, 1.15),
			lag = rng:NextNumber(-4, 4),
			phase = rng:NextNumber() * 6,
		})
	end
	placeFlock(f)
	return f
end

local function stepFlock(f, dt: number, parts: { BasePart }, cfs: { CFrame })
	f.t += dt
	local c = camPos()
	if (Vector3.new(f.center.X, 0, f.center.Z) - Vector3.new(c.X, 0, c.Z)).Magnitude > 520 then
		placeFlock(f)
	end
	for _, b in f.birds do
		local a = f.t * f.speed + b.offset
		local r = f.radius + b.lag
		local pos = f.center + Vector3.new(math.cos(a) * r, f.height + math.sin(f.t * 0.6 + b.phase) * 3, math.sin(a) * r)
		local dir = Vector3.new(-math.sin(a), 0, math.cos(a)) * math.sign(f.speed)
		local body = CFrame.lookAt(pos, pos + dir)
		local flap = math.sin(f.t * 11 + b.phase) * 0.7
		table.insert(parts, b.body)
		table.insert(cfs, body)
		table.insert(parts, b.wingL)
		table.insert(cfs, body * CFrame.Angles(0, 0, flap) * CFrame.new(-0.7, 0, 0))
		table.insert(parts, b.wingR)
		table.insert(cfs, body * CFrame.Angles(0, 0, -flap) * CFrame.new(0.7, 0, 0))
	end
end

----------------------------------------------------------------------------------------------------
-- Airliner
----------------------------------------------------------------------------------------------------
local plane = nil :: Model?
local flight = nil :: any
local nextFlight = 25

local function buildPlane(): Model
	local m = Instance.new("Model")
	m.Name = "Airliner"
	local white = Color3.fromRGB(240, 242, 246)
	-- built at the origin facing -Z; an invisible root keeps that frame for PivotTo
	local root = part(Vector3.new(1, 1, 1), white)
	root.Name = "Root"
	root.Transparency = 1
	root.CFrame = CFrame.new()
	root.Parent = m
	m.PrimaryPart = root
	local function add(p: BasePart, cf: CFrame)
		p.CFrame = cf
		p.Parent = m
	end
	local f = CFrame.new()
	-- cylinders lie along X: turned along the fuselage
	add(part(Vector3.new(46, 4.4, 4.4), white, nil, Enum.PartType.Cylinder), f * CFrame.Angles(0, math.pi / 2, 0))
	add(part(Vector3.new(4.4, 4.4, 4.4), white, nil, Enum.PartType.Ball), f * CFrame.new(0, 0, -23))
	add(part(Vector3.new(36, 0.6, 7), white), f * CFrame.new(0, -1, -2))
	add(part(Vector3.new(13, 0.5, 4), white), f * CFrame.new(0, 0.8, 21))
	add(part(Vector3.new(0.6, 8, 6), Color3.fromRGB(200, 30, 40)), f * CFrame.new(0, 5, 21))
	add(part(Vector3.new(4.5, 0.4, 44), Color3.fromRGB(30, 80, 170)), f * CFrame.new(0, -0.6, 0))
	for s = -1, 1, 2 do
		add(part(Vector3.new(6, 2.4, 2.4), Color3.fromRGB(190, 192, 198), nil, Enum.PartType.Cylinder), f * CFrame.new(s * 8, -2.4, -4) * CFrame.Angles(0, math.pi / 2, 0))
		local light = part(Vector3.new(0.5, 0.5, 0.5), if s < 0 then Color3.fromRGB(255, 40, 40) else Color3.fromRGB(40, 255, 90), Enum.Material.Neon, Enum.PartType.Ball)
		add(light, f * CFrame.new(s * 18, -1, -2))
	end
	-- contrails
	for s = -1, 1, 2 do
		local a0 = Instance.new("Attachment")
		a0.Position = Vector3.new(s * 8, -2.4, -1)
		a0.Parent = root
		local a1 = Instance.new("Attachment")
		a1.Position = Vector3.new(s * 8, -2.0, -1)
		a1.Parent = root
		local trail = Instance.new("Trail")
		trail.Attachment0 = a0
		trail.Attachment1 = a1
		trail.Lifetime = 7
		trail.Color = ColorSequence.new(Color3.new(1, 1, 1))
		trail.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3), NumberSequenceKeypoint.new(1, 1) })
		trail.WidthScale = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 5) })
		trail.FaceCamera = true
		trail.Parent = root
	end
	m.Parent = folder
	return m
end

local function startFlight()
	local c = camPos()
	local heading = rng:NextNumber() * math.pi * 2
	local dir = Vector3.new(math.cos(heading), 0, math.sin(heading))
	local side = Vector3.new(-dir.Z, 0, dir.X) * rng:NextNumber(-500, 500)
	local start = Vector3.new(c.X, 0, c.Z) - dir * 2600 + side + Vector3.new(0, rng:NextNumber(480, 620), 0)
	flight = { pos = start, dir = dir, left = 5200 }
	if not plane then
		plane = buildPlane()
	end
end

local function stepPlane(dt: number)
	nextFlight -= dt
	if not flight and nextFlight <= 0 then
		startFlight()
	end
	if flight and plane then
		local move = 150 * dt
		flight.pos += flight.dir * move
		flight.left -= move
		plane:PivotTo(CFrame.lookAt(flight.pos, flight.pos + flight.dir))
		if flight.left <= 0 then
			flight = nil
			nextFlight = rng:NextNumber(90, 200)
			plane:PivotTo(CFrame.new(0, -2000, 0))
		end
	end
end

----------------------------------------------------------------------------------------------------
-- Hot-air balloons
----------------------------------------------------------------------------------------------------
local balloons = {}

local function buildBalloon(colors: { Color3 }): Model
	local m = Instance.new("Model")
	m.Name = "Balloon"
	local env = part(Vector3.new(22, 26, 22), colors[1], Enum.Material.Fabric, Enum.PartType.Ball)
	env.Parent = m
	m.PrimaryPart = env
	local band = part(Vector3.new(22.4, 6, 22.4), colors[2], Enum.Material.Fabric, Enum.PartType.Ball)
	band.CFrame = CFrame.new(0, 2, 0)
	band.Parent = m
	local skirt = part(Vector3.new(8, 4, 8), colors[2], Enum.Material.Fabric, Enum.PartType.Ball)
	skirt.CFrame = CFrame.new(0, -12, 0)
	skirt.Parent = m
	local basket = part(Vector3.new(4, 3, 4), Color3.fromRGB(150, 100, 60), Enum.Material.WoodPlanks)
	basket.CFrame = CFrame.new(0, -19, 0)
	basket.Parent = m
	for sx = -1, 1, 2 do
		for sz = -1, 1, 2 do
			local rope = part(Vector3.new(0.15, 6, 0.15), Color3.fromRGB(60, 50, 40))
			rope.CFrame = CFrame.new(sx * 1.8, -15.5, sz * 1.8)
			rope.Parent = m
		end
	end
	local flame = part(Vector3.new(1, 1.6, 1), Color3.fromRGB(255, 170, 60), Enum.Material.Neon, Enum.PartType.Ball)
	flame.Name = "Flame"
	flame.CFrame = CFrame.new(0, -15, 0)
	flame.Parent = m
	m.Parent = folder
	return m
end

local function stepBalloons(t: number)
	local night = Lighting.ClockTime >= 19.5 or Lighting.ClockTime < 6
	for i, b in balloons do
		local x = math.sin(t * 0.008 + i * 2.1) * 900
		local z = math.cos(t * 0.006 + i * 1.3) * 700 - 200
		local y = 230 + i * 30 + math.sin(t * 0.15 + i) * 8
		b.model:PivotTo(CFrame.new(x, y, z) * CFrame.Angles(0, t * 0.02 + i, 0))
		local flame = b.model:FindFirstChild("Flame") :: BasePart?
		if flame then
			-- the burner fires now and then
			flame.Transparency = if (t + i * 3) % 9 < 1.2 then 0 else (if night then 0.5 else 0.9)
		end
	end
end

----------------------------------------------------------------------------------------------------
function Sky.init()
	folder = Instance.new("Folder")
	folder.Name = "Sky"
	folder.Parent = Workspace
	for _ = 1, FLOCKS do
		table.insert(flocks, makeFlock())
	end
	for _, colors in { { Color3.fromRGB(230, 60, 60), Color3.fromRGB(250, 210, 60) }, { Color3.fromRGB(60, 120, 220), Color3.fromRGB(240, 240, 240) } } do
		table.insert(balloons, { model = buildBalloon(colors) })
	end
	local t = 0
	RunService.RenderStepped:Connect(function(dt)
		t += dt
		local parts, cfs = {}, {}
		for _, f in flocks do
			stepFlock(f, dt, parts, cfs)
		end
		Workspace:BulkMoveTo(parts, cfs, Enum.BulkMoveMode.FireCFrameChanged)
		stepPlane(dt)
		stepBalloons(t)
	end)
end

-- tools/dump.luau draws these to check their shapes
Sky._buildPlane = buildPlane
Sky._buildBalloon = buildBalloon
function Sky._folder(f: Folder)
	folder = f
end

return Sky
