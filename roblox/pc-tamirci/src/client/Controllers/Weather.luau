-- Weather: what rain looks and sounds like. Thin streaks of rain fall in a column around the camera
-- (glowing lines, so they show against the sky and the dark walls alike), drops splash on the
-- ground, and in a storm lightning flashes and the thunder follows a moment later. The sky closing
-- over (clouds, haze, light) is Ambience's job: it reads Weather.wet(), which eases in and out.

local Players = game:GetService("Players")
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")

local Config = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared").Config)

local Weather = {}

local STREAKS = { low = 60, medium = 140, high = 240, ultra = 360 }
local RADIUS, CLOSEST, TOP, BOTTOM = 32, 4.5, 28, 18 -- the column of rain around the camera
local LENGTH = 3.6
local TILT = CFrame.Angles(math.rad(-5), 0, math.rad(7))

local count = STREAKS.high
local wet = 0 -- 0 (dry) .. 1 (pouring), eased
local mixVolume = 0.8 -- the ambience volume from Settings
local parts: { BasePart } = {}
local ox: { number } = {}
local oy: { number } = {}
local oz: { number } = {}
local fall: { number } = {}
local parked = true
local folder: Folder? = nil
local splashBox: BasePart? = nil
local splash: ParticleEmitter? = nil
local overlay: Frame? = nil
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
	local r = CLOSEST + math.sqrt(rng:NextNumber()) * (RADIUS - CLOSEST)
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
		local p = Instance.new("Part")
		p.Name = "Streak"
		p.Anchored = true
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.CastShadow = false
		p.Material = Enum.Material.Neon
		p.Color = Color3.fromRGB(196, 210, 230)
		p.Transparency = 0.55
		p.Size = Vector3.new(0.05, LENGTH, 0.05)
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
	-- the white of a lightning flash, over the whole screen
	local player = Players.LocalPlayer
	local gui = player and player:FindFirstChildOfClass("PlayerGui")
	if gui then
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
			local y = oy[i] - fall[i] * dt
			if y < -BOTTOM then
				respawn(i, false)
				y = oy[i]
			else
				ox[i] += 5 * dt
				oz[i] += 2 * dt
				oy[i] = y
			end
			list[i] = parts[i]
			cfs[i] = CFrame.new(cp.X + ox[i], cp.Y + y, cp.Z + oz[i]) * TILT
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
		splash.Rate = if active > 0 then 170 * wet else 0
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
		overlay.BackgroundTransparency = if inside then math.max(0.9, flashAlpha(flashAge)) else flashAlpha(flashAge)
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
	count = STREAKS[q or "high"] or STREAKS.high
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
