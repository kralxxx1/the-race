-- Weather: what rain looks and sounds like. Streaks of rain fall in a column around the camera in
-- three depths (thick near ones, thinner far ones, all slanting with the gusts of the wind), drops
-- splash and ripple on the ground, wet road surfaces turn glossy, a thin mist hangs over the street,
-- drops run down the camera lens, and in a storm lightning flashes and the thunder follows a moment
-- later. The sky closing over (clouds, haze, light) is Ambience's job: it reads Weather.wet(), which
-- eases in and out. The Settings window sets how much of it there is (Weather.setOptions).

local Players = game:GetService("Players")
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")

local Config = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared").Config)

local Weather = {}

local STREAKS = { low = 90, medium = 170, high = 280, ultra = 420 }
local TOP, BOTTOM = 28, 18 -- the column of rain around the camera (heights above and below the camera)
-- three depths: thick and long near the camera, thin and short far away
local LAYERS = {
	{ from = 4, to = 11, w = 0.075, len = 4.4, transparency = 0.42, share = 0.25 },
	{ from = 11, to = 21, w = 0.055, len = 3.5, transparency = 0.55, share = 0.35 },
	{ from = 21, to = 34, w = 0.042, len = 3, transparency = 0.7, share = 0.4 },
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
local layerOf: { number } = {}
local ox: { number } = {}
local oy: { number } = {}
local oz: { number } = {}
local fall: { number } = {}
local parked = true
local folder: Folder? = nil
local splashBox: BasePart? = nil
local splash: ParticleEmitter? = nil
local ripple: ParticleEmitter? = nil
local mist: ParticleEmitter? = nil
local overlay: Frame? = nil
local lensGui: ScreenGui? = nil
local lens: { { frame: Frame, age: number, life: number, x: number, y: number, size: number, speed: number } } = {}
local roads: { [BasePart]: number } = setmetatable({}, { __mode = "k" }) -- wet-look road parts and how wet they are now
local lastRoads = 0
local gust = 0.5 -- 0 (still) .. 1 (strong), wandering
local clockT = 0 -- seconds of weather time (steps add their dt)
local lastGround = 0
local nextBolt = 0
local flashAge = 1e9
local thunder: { { at: number, inside: boolean, far: boolean } } = {}
local rng = Random.new()

local groundParams = RaycastParams.new()
groundParams.FilterType = Enum.RaycastFilterType.Exclude
groundParams.IgnoreWater = true

----------------------------------------------------------------------------------------------------
-- Building
----------------------------------------------------------------------------------------------------
local function respawn(i: number, anywhere: boolean)
	local a = rng:NextNumber() * math.pi * 2
	local L = LAYERS[layerOf[i] or 2]
	local r = L.from + math.sqrt(rng:NextNumber()) * (L.to - L.from)
	ox[i] = math.cos(a) * r
	oz[i] = math.sin(a) * r
	oy[i] = if anywhere then -BOTTOM + rng:NextNumber() * (TOP + BOTTOM) else TOP + rng:NextNumber() * 6
	fall[i] = 62 + rng:NextNumber() * 30
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
		local p = Instance.new("Part")
		p.Name = "Streak"
		p.Anchored = true
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.CastShadow = false
		p.Material = Enum.Material.Neon
		p.Color = Color3.fromRGB(196, 210, 230)
		p.Transparency = L.transparency
		p.Size = Vector3.new(L.w, L.len, L.w)
		p.CFrame = CFrame.new(0, -1000, 0)
		p.Parent = folder
		parts[i] = p
		respawn(i, true)
	end
	-- little splashes where the drops land
	local box = Instance.new("Part")
	box.Name = "RainSplashes"
	box.Anchored = true
	box.CanCollide = false
	box.CanQuery = false
	box.CanTouch = false
	box.Transparency = 1
	box.Size = Vector3.new(60, 0.2, 60)
	box.Parent = Workspace
	local e = Instance.new("ParticleEmitter")
	e.Name = "Splash"
	e.Texture = "rbxasset://textures/particles/smoke_main.dds"
	e.Color = ColorSequence.new(Color3.fromRGB(226, 234, 244))
	e.LightInfluence = 0.5
	e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3), NumberSequenceKeypoint.new(1, 1) })
	e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.15), NumberSequenceKeypoint.new(1, 0.6) })
	e.Speed = NumberRange.new(2, 4)
	e.SpreadAngle = Vector2.new(70, 70)
	e.EmissionDirection = Enum.NormalId.Top
	e.Acceleration = Vector3.new(0, -16, 0)
	e.Lifetime = NumberRange.new(0.15, 0.3)
	e.Rate = 0
	e.Parent = box
	splashBox, splash = box, e
	-- rings spreading on the wet ground (flat, lying on it)
	local r = Instance.new("ParticleEmitter")
	r.Name = "Ripple"
	r.Texture = "rbxasset://textures/particles/smoke_main.dds"
	r.Orientation = Enum.ParticleOrientation.VelocityPerpendicular
	r.Color = ColorSequence.new(Color3.fromRGB(226, 234, 244))
	r.LightInfluence = 0.6
	r.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.75), NumberSequenceKeypoint.new(0.4, 0.85), NumberSequenceKeypoint.new(1, 1) })
	r.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.1), NumberSequenceKeypoint.new(1, 1.1) })
	r.Speed = NumberRange.new(0.02, 0.05)
	r.SpreadAngle = Vector2.new(0, 0)
	r.EmissionDirection = Enum.NormalId.Top
	r.Lifetime = NumberRange.new(0.5, 0.9)
	r.Rate = 0
	r.Parent = box
	ripple = r
	-- a thin mist hanging over the street
	local mb = Instance.new("ParticleEmitter")
	mb.Name = "Mist"
	mb.Texture = "rbxasset://textures/particles/smoke_main.dds"
	mb.Color = ColorSequence.new(Color3.fromRGB(190, 198, 212))
	mb.LightInfluence = 0.8
	mb.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.3, 0.93), NumberSequenceKeypoint.new(1, 1) })
	mb.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 6), NumberSequenceKeypoint.new(1, 11) })
	mb.Speed = NumberRange.new(0.4, 1.2)
	mb.SpreadAngle = Vector2.new(180, 180)
	mb.Rotation = NumberRange.new(0, 360)
	mb.RotSpeed = NumberRange.new(-8, 8)
	mb.Lifetime = NumberRange.new(5, 8)
	mb.Rate = 0
	mb.Parent = box
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
	-- the wind comes in gusts: the streaks lean harder and fall a little faster in them
	gust = 0.5 + 0.5 * math.sin(clockT * 0.35 + math.sin(clockT * 0.11) * 2.2)
	local lean = CFrame.Angles(math.rad(-3 - 5 * gust), 0, math.rad(5 + 9 * gust))
	local drift = 3 + 6 * gust
	local active = if inside or wet < 0.03 or not cam then 0 else math.min(#parts, math.floor(count * math.clamp(wet * 1.25, 0, 1)))
	if active == 0 then
		if not parked then
			parked = true
			for _, p in parts do
				p.CFrame = CFrame.new(0, -1000, 0)
			end
		end
	else
		parked = false
		local cp = (cam :: Camera).CFrame.Position
		local list, cfs = {}, {}
		for i = 1, active do
			local y = oy[i] - fall[i] * dt * (1 + 0.12 * gust)
			if y < -BOTTOM then
				respawn(i, false)
				y = oy[i]
			else
				ox[i] += drift * dt
				oz[i] += drift * 0.4 * dt
				oy[i] = y
			end
			list[i] = parts[i]
			cfs[i] = CFrame.new(cp.X + ox[i], cp.Y + y, cp.Z + oz[i]) * lean
		end
		-- (the ones beyond the count wait out of sight)
		for i = active + 1, #parts do
			if parts[i].Position.Y > -900 then
				list[#list + 1] = parts[i]
				cfs[#cfs + 1] = CFrame.new(0, -1000, 0)
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
	-- splashes on whatever is below the camera
	if splash and splashBox and cam then
		if raining and clockT - lastGround > 0.3 then
			lastGround = clockT
			local char = Players.LocalPlayer and Players.LocalPlayer.Character
			groundParams.FilterDescendantsInstances = if char then { char, folder, splashBox } else { folder, splashBox }
			local cp = cam.CFrame.Position
			local hit = Workspace:Raycast(cp, Vector3.new(0, -120, 0), groundParams)
			splashBox.CFrame = CFrame.new(if hit then hit.Position + Vector3.new(0, 0.1, 0) else Vector3.new(cp.X, 0.8, cp.Z))
		end
		local fxk = effects * (if splashOn then 1 else 0)
		splash.Rate = if active > 0 then 170 * wet * fxk * (count / STREAKS.high) else 0
		if ripple then
			ripple.Rate = if active > 0 then 60 * wet * fxk else 0
		end
		if mist then
			mist.Rate = if raining and not inside then (MIST_RATE[quality] or 0) * wet * effects else 0
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
