-- Weather: what rain looks and sounds like. Drops fall in a column around the camera as thin, fast
-- streaks with a fading tail (a Trail behind each drop, three depths, slanting with the gusts of the
-- wind). Every drop falls to the real surface under it -- the pavement, a roof, a car roof, the sea --
-- found by a height map of rays cast around the camera, so rain is seen through windows and doors from
-- inside the shop but never falls under a roof, and each drop that lands splashes (a spray of droplets
-- and, on wet ground, a ring) on that surface. Wet road surfaces turn glossy, a thin mist hangs over
-- the street, drops run down the camera lens, and in a storm lightning flashes and the thunder
-- follows a moment later. The sky closing over (clouds, haze, light) is Ambience's job: it reads
-- Weather.wet(), which eases in and out. The Settings window sets how much of it there is
-- (Weather.setOptions).

local Players = game:GetService("Players")
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")

local Config = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared").Config)

local Weather = {}

local STREAKS = { low = 90, medium = 170, high = 280, ultra = 420 }
local HEIGHT = 44 -- the band of falling rain above every surface (studs)
local CELL = 4 -- the height map's cells
local CAST_TOP, CAST_LEN = 300, 460 -- rays are cast from y 300 down to -160
local RAYS_PER_FRAME, RAYS_WARM = 36, 140
-- three depths: thick and long near the camera, thin and short far away. w: width of the streak at
-- its head, life: how long its tail lingers (the length is speed x life), alpha: how see-through
local LAYERS = {
	{ from = 3, to = 11, w = 0.1, life = 0.085, alpha = 0.5, share = 0.27 },
	{ from = 11, to = 24, w = 0.07, life = 0.075, alpha = 0.62, share = 0.38 },
	{ from = 24, to = 48, w = 0.055, life = 0.065, alpha = 0.74, share = 0.35 },
}
local MIST_RATE = { low = 0, medium = 6, high = 14, ultra = 24 }
local LENS_DROPS = { low = 0, medium = 6, high = 12, ultra = 18 }

local quality = "high"
local count = STREAKS.high
local splashOn, flashOn, lensOn = true, true, true
local effects = 1 -- the Settings "particles" slider, 0..1
local wet = 0 -- 0 (dry) .. 1 (pouring), eased
local mixVolume = 0.8 -- the ambience volume from Settings
local parts: { BasePart } = {}
local trails: { Trail } = {}
local layerOf: { number } = {}
local dx: { number } = {} -- where each drop is (world)
local dy: { number } = {}
local dz: { number } = {}
local fall: { number } = {}
local landed: { number } = {} -- >0: the drop has hit the surface and its tail is still fading
local parked = true
local folder: Folder? = nil
local splashPoint: BasePart? = nil
local mistBox: BasePart? = nil
local splash: ParticleEmitter? = nil
local ripple: ParticleEmitter? = nil
local mist: ParticleEmitter? = nil
-- the height map: the surface under every cell around the camera (y of the highest thing the rain
-- would hit), found by rays cast a few at a time
local heights: { [number]: number } = {}
local queue: { number } = {}
local queued: { [number]: boolean } = {}
local probe: ((number, number) -> number?)? = nil -- (the tests give the ground a shape without casting rays)
local castParams = RaycastParams.new()
castParams.FilterType = Enum.RaycastFilterType.Exclude
castParams.IgnoreWater = false
local overlay: Frame? = nil
local lensGui: ScreenGui? = nil
local lens: { { frame: Frame, age: number, life: number, x: number, y: number, size: number, speed: number } } = {}
local roads: { [BasePart]: number } = setmetatable({}, { __mode = "k" }) -- wet-look road parts and how wet they are now
local lastRoads = 0
local gust = 0.5 -- 0 (still) .. 1 (strong), wandering
local clockT = 0 -- seconds of weather time (steps add their dt)
local lastGround = 0
local lastPrune = 0
local landings: { Vector3 } = {} -- where drops landed this frame (they splash)
local L_FADE = 0.09 -- seconds a landed drop's tail takes to fade
local nextBolt = 0
local flashAge = 1e9
local thunder: { { at: number, inside: boolean, far: boolean } } = {}
local rng = Random.new()

----------------------------------------------------------------------------------------------------
-- The height map: what the rain lands on, cell by cell
----------------------------------------------------------------------------------------------------
local function cellOf(x: number, z: number): (number, number, number)
	local ix, iz = math.floor(x / CELL), math.floor(z / CELL)
	return (ix + 16384) * 32768 + (iz + 16384), ix, iz
end

-- The highest thing a drop falling at x, z would hit: a ray from high above that skips what rain
-- does not stop on (invisible blocks, glass-clear parts, the character, the traffic).
local function castSurface(x: number, z: number, base: { Instance }): number
	if probe then
		return probe(x, z) or -60
	end
	local ignore = base
	local origin = Vector3.new(x, CAST_TOP, z)
	local dir = Vector3.new(0, -CAST_LEN, 0)
	for _ = 1, 4 do
		castParams.FilterDescendantsInstances = ignore
		local hit = Workspace:Raycast(origin, dir, castParams)
		if not hit then
			return CAST_TOP - CAST_LEN
		end
		local inst = hit.Instance
		if not inst:IsA("Terrain") and inst:IsA("BasePart") and inst.Transparency >= 0.9 then
			if ignore == base then
				ignore = table.clone(base)
			end
			table.insert(ignore, inst)
			origin = Vector3.new(x, hit.Position.Y - 0.05, z)
			dir = Vector3.new(0, -(origin.Y + CAST_LEN - CAST_TOP), 0)
		else
			return hit.Position.Y
		end
	end
	return CAST_TOP - CAST_LEN
end

-- The surface height under (x, z), or nil while its cell is still waiting for its ray.
local function surfaceAt(x: number, z: number): number?
	local key, ix, iz = cellOf(x, z)
	local h = heights[key]
	if h == nil and not queued[key] then
		queued[key] = true
		table.insert(queue, key)
		-- (the cell's own coordinates ride along in the queue's parallel tables)
		queue[#queue + 1] = ix
		queue[#queue + 1] = iz
	end
	return h
end

-- Casts the queued rays (a few per frame). The things rain falls through (the character, the traffic,
-- the rain's own parts) are left out of every ray.
local function castQueued(budget: number)
	if #queue < 3 then
		return
	end
	local base = {}
	if not probe then
		local char = Players.LocalPlayer and Players.LocalPlayer.Character
		if char then
			table.insert(base, char)
		end
		for _, name in { "RainStreaks", "RainSplash", "RainMist", "ClientTraffic" } do
			local f = Workspace:FindFirstChild(name)
			if f then
				table.insert(base, f)
			end
		end
	end
	local n = 0
	while #queue >= 3 and n < budget do
		local iz = table.remove(queue) :: number
		local ix = table.remove(queue) :: number
		local key = table.remove(queue) :: number
		queued[key] = nil
		heights[key] = castSurface((ix + 0.5) * CELL, (iz + 0.5) * CELL, base)
		n += 1
	end
end

-- Forgets the cells far from the camera (so the map does not grow all over the city).
local function pruneHeights(cp: Vector3)
	local limit = (LAYERS[#LAYERS].to + 24) / CELL
	local cx, cz = math.floor(cp.X / CELL), math.floor(cp.Z / CELL)
	for key in heights do
		local ix = math.floor(key / 32768) - 16384
		local iz = key % 32768 - 16384
		if math.abs(ix - cx) > limit or math.abs(iz - cz) > limit then
			heights[key] = nil
		end
	end
end

----------------------------------------------------------------------------------------------------
-- Building
----------------------------------------------------------------------------------------------------
-- Puts drop i at the top of the rain band over a spot round the camera (anywhere: at any height).
local function respawn(i: number, cp: Vector3, anywhere: boolean): boolean
	local a = rng:NextNumber() * math.pi * 2
	local L = LAYERS[layerOf[i] or 2]
	local r = L.from + math.sqrt(rng:NextNumber()) * (L.to - L.from)
	local x, z = cp.X + math.cos(a) * r, cp.Z + math.sin(a) * r
	local top = surfaceAt(x, z)
	if top == nil then
		return false
	end
	dx[i], dz[i] = x, z
	-- (a drop that starts over: near the top of the band; the first drops of all: anywhere in it)
	dy[i] = top + (if anywhere then rng:NextNumber() * HEIGHT else HEIGHT * (0.55 + 0.45 * rng:NextNumber()))
	fall[i] = 58 + rng:NextNumber() * 28
	landed[i] = 0
	trails[i].Enabled = true
	-- (the new drop must not drag a streak across the sky from where the last one was)
	pcall(function()
		trails[i]:Clear()
	end)
	return true
end

local function newEmitter(parent: Instance, name: string): ParticleEmitter
	local e = Instance.new("ParticleEmitter")
	e.Name = name
	e.Texture = "rbxasset://textures/particles/smoke_main.dds"
	e.Rate = 0
	e.Parent = parent
	return e
end

local function build()
	folder = Instance.new("Folder")
	folder.Name = "RainStreaks"
	folder.Parent = Workspace
	local n = STREAKS.ultra
	for i = 1, n do
		-- (the layers alternate, so any share of the list has the same mix of near and far ones)
		local f = ((i - 1) % 20) / 20
		layerOf[i] = if f < LAYERS[1].share then 1 elseif f < LAYERS[1].share + LAYERS[2].share then 2 else 3
		local L = LAYERS[layerOf[i]]
		-- a drop is a bare point that carries a trail: the trail is the streak, thick at the head and
		-- fading to nothing behind it
		local p = Instance.new("Part")
		p.Name = "Streak"
		p.Anchored = true
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.CastShadow = false
		p.Transparency = 1
		p.Size = Vector3.new(0.2, 0.2, 0.2)
		p.CFrame = CFrame.new(0, -1000, 0)
		local a0 = Instance.new("Attachment")
		a0.Position = Vector3.new(-L.w / 2, 0, 0)
		a0.Parent = p
		local a1 = Instance.new("Attachment")
		a1.Position = Vector3.new(L.w / 2, 0, 0)
		a1.Parent = p
		local t = Instance.new("Trail")
		t.Attachment0, t.Attachment1 = a0, a1
		t.Lifetime = L.life
		t.MinLength = 0.04
		t.FaceCamera = true
		t.LightEmission = 0.3
		t.LightInfluence = 0.45
		t.Color = ColorSequence.new(Color3.fromRGB(208, 220, 240))
		t.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, L.alpha), NumberSequenceKeypoint.new(0.4, math.min(1, L.alpha + 0.14)), NumberSequenceKeypoint.new(1, 1) })
		t.WidthScale = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 0.2) })
		t.Enabled = false
		t.Parent = p
		p.Parent = folder
		parts[i] = p
		trails[i] = t
		landed[i] = 0
		dx[i], dy[i], dz[i] = 0, -1000, 0
		fall[i] = 70
	end
	-- the spray where a drop lands: a puff of droplets, and a ring spreading on wet ground. One
	-- small emitter, moved to each landing spot and fired
	local point = Instance.new("Part")
	point.Name = "RainSplash"
	point.Anchored = true
	point.CanCollide = false
	point.CanQuery = false
	point.CanTouch = false
	point.Transparency = 1
	point.Size = Vector3.new(0.4, 0.1, 0.4)
	point.Parent = Workspace
	local e = newEmitter(point, "Splash")
	e.Color = ColorSequence.new(Color3.fromRGB(228, 236, 246))
	e.LightInfluence = 0.5
	e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.35), NumberSequenceKeypoint.new(1, 1) })
	e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.12), NumberSequenceKeypoint.new(1, 0.28) })
	e.Speed = NumberRange.new(3, 6.5)
	e.SpreadAngle = Vector2.new(55, 55)
	e.EmissionDirection = Enum.NormalId.Top
	e.Acceleration = Vector3.new(0, -34, 0)
	e.Lifetime = NumberRange.new(0.18, 0.34)
	splashPoint, splash = point, e
	local r = newEmitter(point, "Ripple")
	r.Orientation = Enum.ParticleOrientation.VelocityPerpendicular
	r.Color = ColorSequence.new(Color3.fromRGB(226, 234, 244))
	r.LightInfluence = 0.6
	r.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.7), NumberSequenceKeypoint.new(0.4, 0.82), NumberSequenceKeypoint.new(1, 1) })
	r.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.1), NumberSequenceKeypoint.new(1, 1.4) })
	r.Speed = NumberRange.new(0.02, 0.05)
	r.SpreadAngle = Vector2.new(0, 0)
	r.EmissionDirection = Enum.NormalId.Top
	r.Lifetime = NumberRange.new(0.45, 0.8)
	ripple = r
	-- a thin mist hanging over the street
	local box = Instance.new("Part")
	box.Name = "RainMist"
	box.Anchored = true
	box.CanCollide = false
	box.CanQuery = false
	box.CanTouch = false
	box.Transparency = 1
	box.Size = Vector3.new(60, 0.2, 60)
	box.Parent = Workspace
	mistBox = box
	local mb = newEmitter(box, "Mist")
	mb.Color = ColorSequence.new(Color3.fromRGB(190, 198, 212))
	mb.LightInfluence = 0.8
	mb.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.3, 0.93), NumberSequenceKeypoint.new(1, 1) })
	mb.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 6), NumberSequenceKeypoint.new(1, 11) })
	mb.Speed = NumberRange.new(0.4, 1.2)
	mb.SpreadAngle = Vector2.new(180, 180)
	mb.Rotation = NumberRange.new(0, 360)
	mb.RotSpeed = NumberRange.new(-8, 8)
	mb.Lifetime = NumberRange.new(5, 8)
	mist = mb
	-- the white of a lightning flash, over the whole screen; drops on the lens
	local player = Players.LocalPlayer
	local gui = player and player:FindFirstChildOfClass("PlayerGui")
	if gui then
		local lg = Instance.new("ScreenGui")
		lg.Name = "RainOnLens"
		lg.IgnoreGuiInset = true
		lg.ResetOnSpawn = false
		lg.DisplayOrder = 38
		lg.Parent = gui
		lensGui = lg
		local sg = Instance.new("ScreenGui")
		sg.Name = "LightningFlash"
		sg.IgnoreGuiInset = true
		sg.ResetOnSpawn = false
		sg.DisplayOrder = 40
		sg.Parent = gui
		local f = Instance.new("Frame")
		f.Name = "Flash"
		f.Size = UDim2.fromScale(1, 1)
		f.BackgroundColor3 = Color3.fromRGB(235, 240, 255)
		f.BackgroundTransparency = 1
		f.BorderSizePixel = 0
		f.Active = false
		f.Parent = sg
		overlay = f
	end
end

----------------------------------------------------------------------------------------------------
-- Drops on the lens, wet roads
----------------------------------------------------------------------------------------------------
local function newLensDrop()
	if not lensGui then
		return
	end
	local size = 10 + rng:NextNumber() ^ 2 * 30
	local f = Instance.new("Frame")
	f.Name = "Drop"
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.Size = UDim2.fromOffset(size, size * 1.25)
	f.BackgroundColor3 = Color3.fromRGB(226, 234, 246)
	f.BackgroundTransparency = 1
	f.BorderSizePixel = 0
	f.Active = false
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0.5, 0)
	c.Parent = f
	local st = Instance.new("UIStroke")
	st.Color = Color3.new(1, 1, 1)
	st.Transparency = 0.75
	st.Thickness = 1
	st.Parent = f
	local x, y = rng:NextNumber(), rng:NextNumber() * 0.9
	f.Position = UDim2.fromScale(x, y)
	f.Parent = lensGui
	table.insert(lens, { frame = f, age = 0, life = 2.5 + rng:NextNumber() * 4, x = x, y = y, size = size, speed = 0.004 + rng:NextNumber() * 0.02 })
end

local function stepLens(dt: number, want: number)
	for i = #lens, 1, -1 do
		local d = lens[i]
		d.age += dt
		d.y += d.speed * dt * (1 + d.age * 0.4) -- (a drop runs faster the longer it has been running)
		local t = d.age / d.life
		if t >= 1 then
			d.frame:Destroy()
			table.remove(lens, i)
		else
			d.frame.Position = UDim2.fromScale(d.x, d.y)
			local fade = math.min(t / 0.12, (1 - t) / 0.3, 1)
			d.frame.BackgroundTransparency = 1 - 0.18 * fade
			local st = d.frame:FindFirstChildOfClass("UIStroke")
			if st then
				st.Transparency = 1 - 0.3 * fade
			end
		end
	end
	if #lens < want and rng:NextNumber() < dt * 3 then
		newLensDrop()
	end
end

-- Roads that carry the "RoadSurface" tag turn glossy (and a little darker) in the rain.
local function stepRoads(cam: Camera?)
	if not cam then
		return
	end
	local CollectionService = game:GetService("CollectionService")
	local cp = cam.CFrame.Position
	local n = 0
	for _, inst in CollectionService:GetTagged("RoadSurface") do
		if inst:IsA("BasePart") and (inst.Position - cp).Magnitude < 260 then
			local base = inst:GetAttribute("DryRef")
			if base == nil then
				inst:SetAttribute("DryRef", inst.Reflectance)
				inst:SetAttribute("DryCol", inst.Color)
				base = inst.Reflectance
			end
			local k = math.clamp((wet - 0.15) / 0.6, 0, 1)
			inst.Reflectance = (base :: number) + 0.14 * k
			local dry = inst:GetAttribute("DryCol")
			if typeof(dry) == "Color3" then
				inst.Color = dry:Lerp(Color3.new(dry.R * 0.7, dry.G * 0.72, dry.B * 0.78), k)
			end
			roads[inst] = k
			n += 1
			if n % 120 == 0 then
				task.wait()
			end
		end
	end
end

----------------------------------------------------------------------------------------------------
-- Thunder
----------------------------------------------------------------------------------------------------
local function playThunder(inside: boolean, far: boolean)
	local list = Config.Sounds and Config.Sounds.Thunder
	if type(list) ~= "table" or #list == 0 then
		return
	end
	local entry = list[rng:NextInteger(1, #list)]
	local s = Instance.new("Sound")
	s.Name = "Thunder"
	s.SoundId = entry.id
	s.PlaybackSpeed = (if far then 0.7 else 0.85) + rng:NextNumber() * 0.2
	s.Volume = (entry.volume or 1) * mixVolume * (if inside then 0.5 else 1) * (if far then 0.55 else 1)
	s.Parent = SoundService
	s:Play()
	s.Ended:Connect(function()
		s:Destroy()
	end)
	-- (in case the clip never ends or never loads)
	task.delay(12, function()
		if s.Parent then
			s:Destroy()
		end
	end)
end

-- A flash now, thunder after the time sound takes from the sky (a second or three).
function Weather.strike(inside: boolean?)
	flashAge = 0
	local delay = 0.5 + rng:NextNumber() * 2.6
	table.insert(thunder, { at = clockT + delay, inside = inside == true, far = false })
end

----------------------------------------------------------------------------------------------------
-- Frame
----------------------------------------------------------------------------------------------------
-- Opacity of the flash: a hard flash, a dip and a second, softer one.
local function flashAlpha(age: number): number
	if age < 0.05 then
		return 0.45
	elseif age < 0.11 then
		return 0.8
	elseif age < 0.2 then
		return 0.55
	elseif age < 0.45 then
		return 0.55 + (age - 0.2) / 0.25 * 0.45
	end
	return 1
end

-- cam: the camera; inside: is there a roof overhead?
function Weather.step(dt: number, cam: Camera?, inside: boolean)
	clockT += dt
	local raining = Workspace:GetAttribute("Raining") == true
	local target = if raining then 1 else 0
	wet = math.clamp(wet + math.clamp(target - wet, -dt / 12, dt / 7), 0, 1)
	if #parts == 0 then
		return
	end
	-- the wind comes in gusts: the drops are blown sideways and fall a little faster in them
	gust = 0.5 + 0.5 * math.sin(clockT * 0.35 + math.sin(clockT * 0.11) * 2.2)
	local drift = 2.5 + 5 * gust
	-- rain stays on while the camera is indoors: through a window or a door you see it fall outside
	-- (the height map keeps it off every roof's underside); only the weather being dry switches it off
	local active = if wet < 0.03 or not cam then 0 else math.min(#parts, math.floor(count * math.clamp(wet * 1.25, 0, 1)))
	if active == 0 then
		if not parked then
			parked = true
			for i, p in parts do
				p.CFrame = CFrame.new(0, -1000, 0)
				trails[i].Enabled = false
				dy[i] = -1000
			end
		end
	else
		local cp = (cam :: Camera).CFrame.Position
		local warm = parked
		parked = false
		castQueued(if warm then RAYS_WARM else RAYS_PER_FRAME)
		if clockT - lastPrune > 5 then
			lastPrune = clockT
			pruneHeights(cp)
		end
		local list, cfs = {}, {}
		local rangeMax = LAYERS[#LAYERS].to + 8
		local splashes = 0
		for i = 1, active do
			local y = dy[i]
			if landed[i] > 0 then
				-- (the drop is down: its tail thins out over a moment, then a new drop starts)
				landed[i] -= dt
				if landed[i] <= 0 then
					if not respawn(i, cp, false) then
						landed[i] = 0.05
					end
				end
			elseif y < -900 then
				-- (not placed yet, or waiting for the ray that tells where the ground is here)
				respawn(i, cp, warm)
			else
				y -= fall[i] * dt * (1 + 0.12 * gust)
				local x, z = dx[i] + drift * dt, dz[i] + drift * 0.4 * dt
				local floorY = surfaceAt(x, z)
				local away = (x - cp.X) ^ 2 + (z - cp.Z) ^ 2
				if floorY == nil or away > rangeMax * rangeMax then
					-- (left the circle round the camera, or its ground is not known yet)
					dy[i] = -1000
					parts[i].CFrame = CFrame.new(0, -1000, 0)
					trails[i].Enabled = false
					y = -1000
				elseif y <= floorY then
					y = floorY + 0.02
					dx[i], dz[i] = x, z
					landed[i] = L_FADE
					trails[i].Enabled = false
					-- (a spray where it lands; the near ones, and not every one)
					if splashes < 12 and away < 2500 and rng:NextNumber() < 0.55 then
						splashes += 1
						table.insert(landings, Vector3.new(x, floorY, z))
					end
				else
					dx[i], dz[i] = x, z
				end
				dy[i] = y
			end
			if dy[i] > -900 then
				list[#list + 1] = parts[i]
				cfs[#cfs + 1] = CFrame.new(dx[i], dy[i], dz[i])
			elseif parts[i].Position.Y > -900 then
				list[#list + 1] = parts[i]
				cfs[#cfs + 1] = CFrame.new(0, -1000, 0)
			end
		end
		-- (the ones beyond the count wait out of sight)
		for i = active + 1, #parts do
			if parts[i].Position.Y > -900 then
				list[#list + 1] = parts[i]
				cfs[#cfs + 1] = CFrame.new(0, -1000, 0)
				trails[i].Enabled = false
				dy[i] = -1000
			end
		end
		local ok = pcall(function()
			Workspace:BulkMoveTo(list, cfs, Enum.BulkMoveMode.FireCFrameChanged)
		end)
		if not ok then
			for i, p in list do
				p.CFrame = cfs[i]
			end
		end
	end
	-- the spray at each landing (splashes / ripples switched off in Settings: none)
	if splash and splashPoint and cam then
		local fxk = effects * (if splashOn then 1 else 0)
		if fxk > 0.05 and active > 0 then
			for _, at in landings do
				splashPoint.CFrame = CFrame.new(at.X, at.Y + 0.05, at.Z)
				local n = math.max(1, math.floor(2 * fxk + 0.5))
				pcall(function()
					(splash :: ParticleEmitter):Emit(n)
					if ripple and wet > 0.5 and rng:NextNumber() < 0.4 * fxk then
						ripple:Emit(1)
					end
				end)
			end
		end
		table.clear(landings)
		if mist and mistBox then
			if raining and not inside then
				-- (the mist rides on the ground under the camera)
				if clockT - lastGround > 0.5 then
					lastGround = clockT
					local cp = cam.CFrame.Position
					local ground = surfaceAt(cp.X, cp.Z)
					mistBox.CFrame = CFrame.new(cp.X, (ground or 0.8) + 1.5, cp.Z)
				end
				mist.Rate = (MIST_RATE[quality] or 0) * wet * effects
			else
				mist.Rate = 0
			end
		end
	end
	-- drops on the lens, and glossy roads
	if lensOn and cam and not inside then
		stepLens(dt, math.floor((LENS_DROPS[quality] or 0) * wet * effects))
	else
		stepLens(dt, 0)
	end
	if wet > 0.05 or next(roads) ~= nil then
		if clockT - lastRoads > 1.2 then
			lastRoads = clockT
			task.spawn(stepRoads, cam)
			-- (dry again: forget the parts that are back to normal)
			if wet < 0.02 then
				for inst, k in roads do
					if k <= 0.001 then
						roads[inst] = nil
					end
				end
			end
		end
	end
	-- lightning in a storm, thunder far off in any rain
	local now = clockT
	if raining and wet > 0.5 and now >= nextBolt then
		local storm = Workspace:GetAttribute("Storm") == true
		nextBolt = now + (if storm then 9 + rng:NextNumber() * 22 else 40 + rng:NextNumber() * 60)
		if storm then
			Weather.strike(inside)
		else
			table.insert(thunder, { at = now + 0.4, inside = inside, far = true })
		end
	elseif not raining then
		nextBolt = math.max(nextBolt, now + 8)
	end
	for i = #thunder, 1, -1 do
		local t = thunder[i]
		if now >= t.at then
			table.remove(thunder, i)
			playThunder(t.inside, t.far)
		end
	end
	if overlay then
		flashAge += dt
		local a = if inside then math.max(0.9, flashAlpha(flashAge)) else flashAlpha(flashAge)
		-- (the flash can be switched off for people who do not like it)
		overlay.BackgroundTransparency = if flashOn then a else 1
	end
end

----------------------------------------------------------------------------------------------------
function Weather.wet(): number
	return wet
end

-- (for the tests: lets them give the ground a shape without casting rays; the cells the height map
-- knows)
function Weather._setProbe(fn: ((number, number) -> number?)?)
	probe = fn
	table.clear(heights)
	table.clear(queue)
	table.clear(queued)
end

function Weather._surfaceAt(x: number, z: number): number?
	return surfaceAt(x, z)
end

function Weather._drops(): ({ number }, { number }, { number })
	return dx, dy, dz
end

function Weather.activeStreaks(): number
	local n = 0
	for _, p in parts do
		if p.Position.Y > -900 then
			n += 1
		end
	end
	return n
end

function Weather.setQuality(q: string?)
	quality = if q ~= nil and STREAKS[q] ~= nil then q else "high"
	count = STREAKS[quality]
end

-- The Settings window's rain choices: detail ("low".."ultra"), splashes and ripples, lightning
-- flashes, drops on the lens, and the particles slider (0..1).
function Weather.setOptions(o: { rain: string?, splashes: boolean?, flashes: boolean?, lens: boolean?, effects: number? })
	if o.rain then
		Weather.setQuality(o.rain)
	end
	if o.splashes ~= nil then
		splashOn = o.splashes
	end
	if o.flashes ~= nil then
		flashOn = o.flashes
	end
	if o.lens ~= nil then
		lensOn = o.lens
	end
	if o.effects then
		effects = math.clamp(o.effects, 0, 1)
	end
end

-- The ambience volume from Settings (0..1): the thunder follows it too.
function Weather.setMix(v: number)
	mixVolume = v
end

function Weather.init()
	if folder then
		return
	end
	build()
	nextBolt = 10
end

return Weather
