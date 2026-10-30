-- Ambience: everything that makes the city feel alive, done locally on each client.
--   * light mood through the day (warm mornings, golden evenings, blue nights), bloom, sun rays
--   * clouds, and rain showers with darker skies
--   * windows, street lamps and signs switching on at dusk
--   * traffic lights cycling (traffic uses Ambience.signal)
--   * the ferris wheel (cabins hang level), carousel, wind turbines, lighthouse beam, the clock
--     tower's hands, swings, bobbing boats, aquarium fish, ducks on the lake, blinking beacons,
--     police lights, server-rack LEDs, chimney smoke
--   * ambient sound loops and a shuffled music playlist (ids in Config.Sounds)

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)

local Weather = require(script.Parent.Weather)

local Ambience = {}

local NIGHT_ON, NIGHT_OFF = 18.4, 6.3

local night = nil :: boolean?
local fx = {} :: { [string]: any }
local tagged: { [string]: { [Instance]: any } } = {}

local function camPos(): Vector3
	local cam = Workspace.CurrentCamera
	return if cam then cam.CFrame.Position else Vector3.zero
end

local function isNight(t: number): boolean
	return t >= NIGHT_ON or t < NIGHT_OFF
end

local function lerp(a: number, b: number, t: number): number
	return a + (b - a) * t
end

----------------------------------------------------------------------------------------------------
-- Tag tracking (instances stream in and out)
----------------------------------------------------------------------------------------------------
local function track(tag: string, onAdd: ((Instance) -> any)?)
	local set = {}
	tagged[tag] = set
	local function add(inst: Instance)
		set[inst] = if onAdd then (onAdd(inst) or true) else true
	end
	for _, inst in CollectionService:GetTagged(tag) do
		task.spawn(add, inst)
	end
	CollectionService:GetInstanceAddedSignal(tag):Connect(add)
	CollectionService:GetInstanceRemovedSignal(tag):Connect(function(inst)
		set[inst] = nil
	end)
	return set
end

----------------------------------------------------------------------------------------------------
-- Night lights
----------------------------------------------------------------------------------------------------
local function lightsOf(inst: Instance): { Light }
	local out = {}
	for _, d in inst:GetChildren() do
		if d:IsA("Light") then
			table.insert(out, d)
		elseif d:IsA("Attachment") then
			for _, l in d:GetChildren() do
				if l:IsA("Light") then
					table.insert(out, l)
				end
			end
		end
	end
	return out
end

local function applyNight(inst: Instance, on: boolean, tag: string)
	if tag == "NightWindow" and inst:IsA("BasePart") then
		-- not every window: some flats stay dark
		local lit = on and ((inst.Position.X * 7.3 + inst.Position.Y * 3.1 + inst.Position.Z * 1.7) % 10) < 6.5
		inst.Transparency = if lit then 0.05 else 1
	elseif tag == "LampBulb" and inst:IsA("BasePart") then
		inst.Material = if on then Enum.Material.Neon else Enum.Material.Glass
		for _, l in lightsOf(inst) do
			l.Enabled = on
		end
	elseif tag == "NightLight" then
		if inst:IsA("BasePart") then
			inst.Material = if on then Enum.Material.Neon else Enum.Material.SmoothPlastic
		end
		for _, l in lightsOf(inst) do
			l.Enabled = on
		end
	elseif tag == "NightOnly" and inst:IsA("BasePart") then
		inst.Transparency = if on then 0.85 else 1
	end
end

local NIGHT_TAGS = { "NightWindow", "LampBulb", "NightLight", "NightOnly" }

-- Switch everything over a couple of seconds so the city lights up street by street.
local function switchNight(on: boolean)
	task.spawn(function()
		local n = 0
		for _, tag in NIGHT_TAGS do
			for inst in tagged[tag] or {} do
				applyNight(inst, on, tag)
				n += 1
				if n % 150 == 0 then
					task.wait()
				end
			end
		end
	end)
end

----------------------------------------------------------------------------------------------------
-- Sky, light mood, weather
----------------------------------------------------------------------------------------------------
-- Graphics switches from the Settings window. Effects that are off are disabled, not deleted.
local fxOn = { bloom = true, rays = true, dof = true, clouds = true }
local trim = 0 -- brightness slider, -1..1

local function applyFx()
	for name, on in fxOn do
		local e = fx[name]
		if e then
			e.Enabled = on
		end
	end
end

local function setupEffects()
	local function get(className: string, name: string, parent: Instance): any
		local e = parent:FindFirstChild(name)
		if not e then
			e = Instance.new(className)
			e.Name = name
			e.Parent = parent
		end
		return e
	end
	fx.bloom = get("BloomEffect", "AmbBloom", Lighting)
	fx.bloom.Intensity = 0.55
	fx.bloom.Size = 26
	fx.bloom.Threshold = 1.6
	fx.rays = get("SunRaysEffect", "AmbRays", Lighting)
	fx.rays.Intensity = 0.05
	fx.rays.Spread = 0.6
	fx.cc = get("ColorCorrectionEffect", "AmbColor", Lighting)
	fx.cc.Saturation = 0.08
	fx.cc.Contrast = 0.06
	fx.dof = get("DepthOfFieldEffect", "AmbDof", Lighting)
	fx.dof.FarIntensity = 0.12
	fx.dof.FocusDistance = 120
	fx.dof.InFocusRadius = 160
	fx.dof.NearIntensity = 0
	local terrain = Workspace:FindFirstChildOfClass("Terrain")
	if terrain then
		fx.clouds = get("Clouds", "AmbClouds", terrain)
		fx.clouds.Cover = 0.55
		fx.clouds.Density = 0.6
	end
	fx.atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
end

-- Colour keys through the day: { hour, ambient, outdoor, tint, brightness, exposure }
local MOOD = {
	{ 0, Color3.fromRGB(28, 34, 58), Color3.fromRGB(46, 56, 92), Color3.fromRGB(196, 210, 255), 0.6, 0.15 },
	{ 5.2, Color3.fromRGB(40, 40, 64), Color3.fromRGB(70, 70, 110), Color3.fromRGB(220, 210, 240), 0.9, 0.1 },
	{ 6.5, Color3.fromRGB(90, 70, 60), Color3.fromRGB(150, 120, 110), Color3.fromRGB(255, 226, 200), 1.8, 0.05 },
	{ 9, Color3.fromRGB(60, 60, 64), Color3.fromRGB(120, 124, 136), Color3.fromRGB(255, 250, 244), 2.6, 0.1 },
	{ 16, Color3.fromRGB(62, 60, 60), Color3.fromRGB(124, 122, 128), Color3.fromRGB(255, 246, 236), 2.6, 0.1 },
	{ 18.3, Color3.fromRGB(96, 66, 50), Color3.fromRGB(170, 120, 96), Color3.fromRGB(255, 214, 176), 1.9, 0.12 },
	{ 19.6, Color3.fromRGB(46, 40, 66), Color3.fromRGB(76, 66, 110), Color3.fromRGB(214, 200, 255), 1.0, 0.15 },
	{ 24, Color3.fromRGB(28, 34, 58), Color3.fromRGB(46, 56, 92), Color3.fromRGB(196, 210, 255), 0.6, 0.15 },
}

local function mood(t: number)
	local a, b = MOOD[1], MOOD[#MOOD]
	for i = 1, #MOOD - 1 do
		if t >= MOOD[i][1] and t < MOOD[i + 1][1] then
			a, b = MOOD[i], MOOD[i + 1]
			break
		end
	end
	local f = (t - a[1]) / math.max(0.001, b[1] - a[1])
	local wet = Weather.wet()
	Lighting.Ambient = a[2]:Lerp(b[2], f)
	Lighting.OutdoorAmbient = a[3]:Lerp(b[3], f):Lerp(Color3.fromRGB(96, 102, 114), wet * 0.55)
	Lighting.Brightness = lerp(a[5], b[5], f) * (1 - wet * 0.5)
	Lighting.ExposureCompensation = lerp(a[6], b[6], f) - wet * 0.15 + trim * 0.9
	Lighting.EnvironmentDiffuseScale = 1 - wet * 0.35
	if fx.cc then
		fx.cc.TintColor = a[4]:Lerp(b[4], f):Lerp(Color3.fromRGB(206, 218, 236), wet * 0.6)
		fx.cc.Saturation = 0.08 - wet * 0.26
		fx.cc.Contrast = 0.06 + wet * 0.08
	end
	if fx.bloom then
		fx.bloom.Intensity = if isNight(t) then 0.9 else 0.5
	end
	if fx.rays then
		fx.rays.Intensity = if wet > 0.1 or isNight(t) then 0 else 0.05
	end
	-- the sky closes over: thick dark cloud, haze, no glare (wet eases in and out over seconds)
	if fx.clouds then
		fx.clouds.Cover = lerp(0.55, 1, wet)
		fx.clouds.Density = lerp(0.6, 1, wet)
		fx.clouds.Color = Color3.new(1, 1, 1):Lerp(Color3.fromRGB(88, 94, 106), wet)
	end
	if fx.atmosphere then
		fx.atmosphere.Density = lerp(0.3, 0.5, wet)
		fx.atmosphere.Haze = lerp(1.4, 4.2, wet)
		fx.atmosphere.Glare = lerp(0.35, 0, wet)
		fx.atmosphere.Color = Color3.fromRGB(199, 189, 168):Lerp(Color3.fromRGB(150, 158, 170), wet)
		fx.atmosphere.Decay = Color3.fromRGB(107, 112, 125):Lerp(Color3.fromRGB(70, 76, 88), wet)
	end
end

----------------------------------------------------------------------------------------------------
-- Traffic lights: one city-wide cycle from the server clock
----------------------------------------------------------------------------------------------------
local CYCLE = 30

-- "green" | "amber" | "red" for traffic moving along `axis` ("NS" or "EW").
function Ambience.signal(axis: string): string
	local t = Workspace:GetServerTimeNow() % CYCLE
	local ns = if t < 12 then "green" elseif t < 15 then "amber" else "red"
	local ew = if t < 15 then "red" elseif t < 27 then "green" else "amber"
	return if axis == "NS" then ns else ew
end

local function paintSignal(m: Instance)
	local state = Ambience.signal(m:GetAttribute("Axis") or "NS")
	for _, name in { "Red", "Amber", "Green" } do
		local lamp = m:FindFirstChild(name) :: BasePart?
		if lamp then
			local on = (name == "Red" and state == "red") or (name == "Amber" and state == "amber") or (name == "Green" and state == "green")
			local col = lamp:GetAttribute("OnColor")
			if typeof(col) == "Color3" then
				lamp.Color = if on then col else col:Lerp(Color3.new(0, 0, 0), 0.75)
			end
			lamp.Material = if on then Enum.Material.Neon else Enum.Material.SmoothPlastic
		end
	end
end

----------------------------------------------------------------------------------------------------
-- Moving landmarks
----------------------------------------------------------------------------------------------------
local function near(inst: Instance, range: number): boolean
	local pos
	if inst:IsA("BasePart") then
		pos = inst.Position
	elseif inst:IsA("Model") then
		pos = inst:GetPivot().Position
	end
	return pos ~= nil and (pos - camPos()).Magnitude < range
end

-- Ferris wheel: the frame turns, cabins hang level.
local function ferrisInfo(wheel: Instance)
	if not wheel:IsA("Model") or not wheel.PrimaryPart then
		return nil
	end
	local axle = wheel.PrimaryPart
	local info = { axle0 = axle.CFrame, frame = {}, cabins = {}, angle = 0 }
	for _, d in wheel:GetDescendants() do
		if d:IsA("BasePart") and d ~= axle then
			if d.Name == "Cabin" then
				-- the cabin hangs 3 studs under its rim point
				local rimLocal = axle.CFrame:PointToObjectSpace(d.Position + Vector3.new(0, 3, 0))
				table.insert(info.cabins, { part = d, rim = rimLocal, rot = d.CFrame.Rotation })
			else
				table.insert(info.frame, { part = d, rel = axle.CFrame:ToObjectSpace(d.CFrame) })
			end
		end
	end
	return info
end

local function stepFerris(info, dt: number)
	info.angle += dt * 0.06
	local rot = info.axle0 * CFrame.Angles(info.angle, 0, 0)
	local parts, cfs = {}, {}
	for _, f in info.frame do
		table.insert(parts, f.part)
		table.insert(cfs, rot * f.rel)
	end
	for _, c in info.cabins do
		local rim = rot:PointToWorldSpace(c.rim)
		table.insert(parts, c.part)
		table.insert(cfs, CFrame.new(rim - Vector3.new(0, 3, 0)) * c.rot)
	end
	Workspace:BulkMoveTo(parts, cfs, Enum.BulkMoveMode.FireCFrameChanged)
end

local function clockInfo(hand: Instance)
	local pivot = hand:GetAttribute("Pivot")
	if not hand:IsA("BasePart") or typeof(pivot) ~= "CFrame" then
		return nil
	end
	return { pivot = pivot, rel = pivot:ToObjectSpace(hand.CFrame), minute = hand.Name == "MinuteHand" }
end

local function stepClock(hand: BasePart, info)
	local t = Lighting.ClockTime
	local frac = if info.minute then (t % 1) else ((t % 12) / 12)
	hand.CFrame = info.pivot * CFrame.Angles(0, 0, frac * math.pi * 2) * info.rel
end

local function makeDuck(spot: BasePart): Model
	local m = Instance.new("Model")
	m.Name = "Duck"
	local function part(size: Vector3, color: Color3, shape: Enum.PartType?): Part
		local p = Instance.new("Part")
		p.Anchored = true
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.Size = size
		p.Color = color
		p.Material = Enum.Material.SmoothPlastic
		if shape then
			p.Shape = shape
		end
		p.Parent = m
		return p
	end
	local body = part(Vector3.new(1.1, 0.7, 1.6), Color3.fromRGB(240, 236, 220), Enum.PartType.Ball)
	body.Name = "Body"
	local head = part(Vector3.new(0.6, 0.6, 0.6), Color3.fromRGB(40, 110, 60), Enum.PartType.Ball)
	head.Name = "Head"
	local beak = part(Vector3.new(0.25, 0.12, 0.4), Color3.fromRGB(250, 170, 40))
	beak.Name = "Beak"
	m.PrimaryPart = body
	m.Parent = spot
	return m
end

local function stepDuck(spot: BasePart, info, now: number)
	local a = now * 0.25 + info.phase
	local center = spot.Position
	local pos = center + Vector3.new(math.cos(a) * 5, 0.25 + math.sin(now * 2 + info.phase) * 0.05, math.sin(a) * 5)
	local dir = Vector3.new(-math.sin(a), 0, math.cos(a))
	local cf = CFrame.lookAt(pos, pos + dir)
	local m = info.model
	local body = m:FindFirstChild("Body") :: BasePart
	local head = m:FindFirstChild("Head") :: BasePart
	local beak = m:FindFirstChild("Beak") :: BasePart
	Workspace:BulkMoveTo({ body, head, beak }, { cf, cf * CFrame.new(0, 0.45, -0.7), cf * CFrame.new(0, 0.42, -1.05) }, Enum.BulkMoveMode.FireCFrameChanged)
end

----------------------------------------------------------------------------------------------------
-- Sound
----------------------------------------------------------------------------------------------------
local loops: { [string]: Sound } = {}
local gains: { [string]: number } = {}
local muffles: { [string]: EqualizerSoundEffect } = {}
local indoor = 0 -- 0 outside .. 1 under a roof, eased

-- A Config.Sounds entry is an id, or { id = ..., volume = ... } (volume evens out quiet recordings).
local function spec(v: any): (string?, number)
	if type(v) == "table" then
		return v.id, v.volume or 1
	end
	return v, 1
end

local function loop(name: string, entry: any): Sound?
	local id, gain = spec(entry)
	if type(id) ~= "string" or id == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.Name = "Amb_" .. name
	s.SoundId = id
	s.Looped = true
	s.Volume = 0
	s.Parent = SoundService
	s:Play()
	loops[name] = s
	gains[name] = gain
	return s
end

-- Background music: two decks cross-fading through a shuffled playlist, so it never stops. A
-- track that ends, fails to load or stalls simply hands over to the next one.
local music = { list = {} :: { string }, gains = {} :: { number }, i = 0, decks = {} :: { Sound }, cur = 1, started = 0 }
local FADE = 3

local function nextTrack()
	if #music.list == 0 then
		return
	end
	music.i = music.i % #music.list + 1
	music.cur = 3 - music.cur
	local s = music.decks[music.cur]
	s.SoundId = music.list[music.i]
	s.TimePosition = 0
	s.Volume = 0
	s:Play()
	music.started = os.clock()
end

local function playlist(entries: any)
	if type(entries) == "string" or (type(entries) == "table" and entries.id) then
		entries = { entries }
	end
	if type(entries) ~= "table" then
		return
	end
	for _, e in entries do
		local id, gain = spec(e)
		if type(id) == "string" and id ~= "" then
			table.insert(music.list, id)
			table.insert(music.gains, gain)
		end
	end
	local n = #music.list
	if n == 0 then
		return
	end
	for i = n, 2, -1 do
		local j = math.random(i)
		music.list[i], music.list[j] = music.list[j], music.list[i]
		music.gains[i], music.gains[j] = music.gains[j], music.gains[i]
	end
	for k = 1, 2 do
		local d = Instance.new("Sound")
		d.Name = "Amb_music" .. k
		d.Looped = n == 1
		d.Volume = 0
		d.Parent = SoundService
		music.decks[k] = d
	end
	music.cur = 2
	nextTrack()
end

local volumes = { music = 0.5, ambience = 0.8 }

-- Player settings (0..1, already multiplied by master and zero when switched off).
function Ambience.setMix(musicVol: number?, ambienceVol: number?)
	volumes.music = musicVol or volumes.music
	volumes.ambience = ambienceVol or volumes.ambience
	Weather.setMix(volumes.ambience)
end

function Ambience.setEffects(flags: { bloom: boolean?, rays: boolean?, dof: boolean?, clouds: boolean? })
	for name in fxOn do
		if flags[name] ~= nil then
			fxOn[name] = flags[name] == true
		end
	end
	applyFx()
end

function Ambience.setTrim(v: number)
	trim = math.clamp(v, -1, 1)
end

-- Is the camera under a roof? (rain stays outside; you hear it drumming on the roof instead)
local indoors, lastRoofCheck = false, 0
local roofParams = RaycastParams.new()
roofParams.FilterType = Enum.RaycastFilterType.Exclude
roofParams.IgnoreWater = true
local function underRoof(): boolean
	local now = os.clock()
	if now - lastRoofCheck < 0.3 then
		return indoors
	end
	lastRoofCheck = now
	local cam = Workspace.CurrentCamera
	if not cam then
		return false
	end
	local ignore = {}
	local char = Players.LocalPlayer and Players.LocalPlayer.Character
	if char then
		table.insert(ignore, char)
	end
	roofParams.FilterDescendantsInstances = ignore
	local hit = Workspace:Raycast(cam.CFrame.Position, Vector3.new(0, 80, 0), roofParams)
	indoors = hit ~= nil
	return indoors
end

local function mix(t: number)
	local function set(name: string, v: number)
		local s = loops[name]
		if s then
			s.Volume = lerp(s.Volume, v * volumes.ambience * (gains[name] or 1), 0.05)
		end
	end
	local inside = underRoof()
	indoor = lerp(indoor, if inside then 1 else 0, 0.2)
	-- the surf grows louder towards the beach (sand starts at z 846)
	local seaside = math.clamp((camPos().Z - 640) / 220, 0, 1)
	local quiet = if inside then 0.35 else 1
	local w = Weather.wet()
	set("day", if isNight(t) then 0 else 0.6 * quiet * (1 - w))
	set("night", if isNight(t) then 0.6 * quiet * (1 - w) else 0)
	-- rain: two recordings on top of each other; indoors the same rain is muffled (the high end
	-- is cut) and a low drumming on the roof is added
	set("rain", w * lerp(0.8, 0.3, indoor))
	set("rain2", w * lerp(0.75, 0.25, indoor))
	set("rainIn", w * indoor * 0.9)
	for _, name in { "rain", "rain2" } do
		local eq = muffles[name]
		if eq then
			eq.HighGain = lerp(0, -42, indoor)
			eq.MidGain = lerp(0, -10, indoor)
			eq.LowGain = lerp(0, 2, indoor)
		end
	end
	set("sea", seaside * 0.7 * quiet)
	-- music decks: the current one fades in, the other fades out
	local cur = music.decks[music.cur]
	if cur then
		local target = 0.3 * volumes.music * (music.gains[music.i] or 1)
		cur.Volume = lerp(cur.Volume, target, 0.06)
		local other = music.decks[3 - music.cur]
		if other.Volume > 0.005 then
			other.Volume = lerp(other.Volume, 0, 0.06)
		elseif other.IsPlaying then
			other:Stop()
		end
		local age = os.clock() - music.started
		local len = cur.TimeLength
		local finishing = len > FADE * 2 and cur.TimePosition > len - FADE
		local stalled = age > 4 and not cur.IsPlaying
		local missing = age > 20 and not cur.IsLoaded
		if #music.list > 1 and (finishing or stalled or missing) then
			nextTrack()
		end
	end
end

Ambience._music = music
Ambience._nextTrack = nextTrack

----------------------------------------------------------------------------------------------------
function Ambience.init()
	setupEffects()
	applyFx()
	Weather.init()
	for _, tag in NIGHT_TAGS do
		track(tag, function(inst)
			if night ~= nil then
				applyNight(inst, night, tag)
			end
			return true
		end)
	end
	track("TrafficLight")
	local ferris = track("FerrisWheel", ferrisInfo)
	local carousels = track("Carousel")
	local turbines = track("WindTurbine")
	local beams = track("LighthouseBeam")
	local hands = track("ClockHand", clockInfo)
	local swings = track("Swing", function(inst)
		-- a model hinged at its pivot (the bar)
		return if inst:IsA("Model") then { cf = inst:GetPivot(), phase = math.random() * 6 } else nil
	end)
	local boats = track("Boat", function(inst)
		return if inst:IsA("Model") then { cf = inst:GetPivot(), phase = math.random() * 6 } else nil
	end)
	local fish = track("Fish", function(inst)
		return if inst:IsA("BasePart") then { cf = inst.CFrame, phase = math.random() * 6, speed = 0.4 + math.random() * 0.5 } else nil
	end)
	local ducks = track("DuckSpot", function(inst)
		if inst:IsA("BasePart") then
			return { model = makeDuck(inst), phase = math.random() * 6 }
		end
		return nil
	end)
	local beacons = track("Beacon")
	local sirens = track("Siren")
	-- shop security: the alarm box flashes for a while after it goes off, floodlights blaze when
	-- something moves outside at night
	local alarms = track("AlarmLight", function(inst)
		-- (remember the alarm value we found, so an old alarm doesn't flash on joining)
		return if inst:IsA("BasePart") then { color = inst.Color, material = inst.Material, seen = inst:GetAttribute("Alarm") } else nil
	end)
	local floods = track("Floodlight")
	local leds = track("RackLed")
	track("Chimney", function(inst)
		if inst:IsA("BasePart") and not inst:FindFirstChild("Smoke") then
			local e = Instance.new("ParticleEmitter")
			e.Name = "Smoke"
			e.Texture = "rbxasset://textures/particles/smoke_main.dds"
			e.Color = ColorSequence.new(Color3.fromRGB(190, 190, 196))
			e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.6), NumberSequenceKeypoint.new(1, 1) })
			e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 2), NumberSequenceKeypoint.new(1, 9) })
			e.Lifetime = NumberRange.new(5, 8)
			e.Rate = 3
			e.Speed = NumberRange.new(3, 5)
			e.EmissionDirection = Enum.NormalId.Top
			e.Acceleration = Vector3.new(2, 0.5, 0)
			e.Parent = inst
		end
		return true
	end)

	local sounds = Config.Sounds or {}
	loop("day", sounds.AmbienceDay)
	loop("night", sounds.AmbienceNight)
	loop("rain", sounds.Rain)
	local second = loop("rain2", sounds.Rain2)
	if second then
		second.PlaybackSpeed = 0.97 -- (so the two never line up)
	end
	loop("rainIn", sounds.RainIndoor)
	-- the muffler for rain heard from indoors
	for _, name in { "rain", "rain2" } do
		local s = loops[name]
		local ok, eq = pcall(Instance.new, "EqualizerSoundEffect")
		if s and ok and eq then
			eq.Name = "Muffle"
			eq.Parent = s
			muffles[name] = eq
		end
	end
	loop("sea", sounds.Sea)
	playlist(sounds.Music)

	local slow = 0
	RunService.RenderStepped:Connect(function(dt)
		local t = Lighting.ClockTime
		local now = os.clock()
		-- night switch
		local n = isNight(t)
		if n ~= night then
			night = n
			switchNight(n)
		end
		-- rain, thunder and the flash of lightning
		Weather.step(dt, Workspace.CurrentCamera, underRoof())
		-- continuous movers
		for wheel, info in ferris do
			if type(info) == "table" and wheel.Parent and near(wheel, 900) then
				stepFerris(info, dt)
			end
		end
		for top in carousels do
			if top:IsA("Model") and top.PrimaryPart and near(top, 500) then
				top:PivotTo(top:GetPivot() * CFrame.Angles(0, dt * 0.35, 0))
			end
		end
		for rotor in turbines do
			if rotor:IsA("Model") and rotor.PrimaryPart and near(rotor, 1400) then
				rotor:PivotTo(rotor:GetPivot() * CFrame.Angles(0, 0, dt * (rotor:GetAttribute("Speed") or 0.7)))
			end
		end
		for beam in beams do
			if beam:IsA("Model") and beam.PrimaryPart then
				beam:PivotTo(beam:GetPivot() * CFrame.Angles(0, dt * 0.7, 0))
			end
		end
		for duck, info in ducks do
			if type(info) == "table" and duck.Parent and near(duck, 500) then
				stepDuck(duck :: BasePart, info, now)
			end
		end
		for f, info in fish do
			if type(info) == "table" and f.Parent and near(f, 120) then
				local x = math.sin(now * info.speed + info.phase) * 1.6
				local facing = if math.cos(now * info.speed + info.phase) >= 0 then 0 else math.pi
				local part = f :: BasePart
				part.CFrame = info.cf * CFrame.new(x, math.sin(now * 1.3 + info.phase) * 0.15, 0) * CFrame.Angles(0, facing, 0)
			end
		end
		-- slower things, 10 times a second
		slow += dt
		if slow < 0.1 then
			return
		end
		slow = 0
		mood(t)
		mix(t)
		for m in tagged.TrafficLight do
			if near(m, 400) then
				paintSignal(m)
			end
		end
		for hand, info in hands do
			if type(info) == "table" and hand.Parent then
				stepClock(hand :: BasePart, info)
			end
		end
		for swing, info in swings do
			if type(info) == "table" and swing.Parent and near(swing, 300) then
				(swing :: Model):PivotTo(info.cf * CFrame.Angles(math.sin(now * 1.6 + info.phase) * 0.45, 0, 0))
			end
		end
		for boat, info in boats do
			if type(info) == "table" and boat.Parent and near(boat, 600) then
				local ph = info.phase
				local model = boat :: Model
				model:PivotTo(info.cf * CFrame.new(0, math.sin(now * 0.8 + ph) * 0.35, 0) * CFrame.Angles(math.sin(now * 0.6 + ph) * 0.025, 0, math.sin(now * 0.7 + ph) * 0.035))
			end
		end
		local blink = (now % 1.6) < 0.35
		for b in beacons do
			if b:IsA("BasePart") then
				b.Transparency = if blink then 0 else 0.85
			end
		end
		local flip = (now % 0.6) < 0.3
		for s in sirens do
			if s:IsA("BasePart") then
				s.Color = if flip then Color3.fromRGB(255, 40, 40) else Color3.fromRGB(40, 80, 255)
			end
		end
		for led in leds do
			if led:IsA("BasePart") and math.random() < 0.15 then
				led.Transparency = if led.Transparency > 0.5 then 0 else 0.8
			end
		end
		for a, info in alarms do
			if type(info) == "table" and a.Parent then
				local part = a :: BasePart
				local raised = part:GetAttribute("Alarm")
				if raised ~= info.seen then
					-- (the server's clock isn't ours: the flashing starts when the value changes)
					info.seen = raised
					info.at = now
				end
				if info.at and now - info.at < 14 then
					part.Material = Enum.Material.Neon
					part.Color = if flip then Color3.fromRGB(255, 30, 30) else Color3.fromRGB(90, 10, 10)
				else
					part.Material = info.material
					part.Color = info.color
				end
			end
		end
		for g in floods do
			if g:IsA("BasePart") then
				local raised = g:GetAttribute("Flash")
				local light = g:FindFirstChildOfClass("SpotLight")
				if raised ~= g:GetAttribute("FlashSeen") then
					g:SetAttribute("FlashSeen", raised)
					g:SetAttribute("FlashAt", now)
				end
				local on = now - (tonumber(g:GetAttribute("FlashAt")) or -100) < 10 and raised ~= nil
				if light then
					light.Enabled = on
				end
				g.Material = if on then Enum.Material.Neon else Enum.Material.Glass
			end
		end
	end)
end

function Ambience.isNight(): boolean
	return isNight(Lighting.ClockTime)
end

return Ambience
