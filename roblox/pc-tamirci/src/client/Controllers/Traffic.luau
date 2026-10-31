-- Traffic: life on the streets around you, simulated on each client (nothing to replicate).
--   * cars and bikes drive in the right-hand lane, follow each other, stop at red lights
--     (Ambience.signal) and for you, and turn through junctions on smooth curves; the cars are big
--     (the driver fits inside), their wheels spin and steer, they indicate before a turn, brake
--     lights glow when they slow down, and twenty kinds of police car flash their lights
--   * pedestrians stroll the sidewalks, cross at junctions and stop now and then; traffic officers
--     stand at the signalled junctions and wave the cars on
-- Only the neighbourhood around the camera is populated; far traffic is recycled.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local CityLayout = require(Shared.World.CityLayout)
local Vehicles = require(Shared.Data.Vehicles)
local Avatars = require(Shared.Data.Avatars)
local DriverPose = require(Shared.Util.DriverPose)
local VehicleModels = require(Shared.Models.VehicleModels)

local Ambience = require(script.Parent.Ambience)
local Weather = require(script.Parent.Weather)

local Traffic = {}

local player = Players.LocalPlayer
local L
local folder: Folder
local rng = Random.new()

local BASE_CARS = 20
local BASE_PEDS = 26
if UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled then
	-- phones: lighter streets
	BASE_CARS, BASE_PEDS = 10, 14
end
local DENSITY = { off = 0, low = 0.5, normal = 1, high = 1.5 }
local MAX_CARS, MAX_PEDS = BASE_CARS, BASE_PEDS
local SPAWN_MIN, SPAWN_MAX, DESPAWN = 80, 320, 430
local CAR_GAP = 3 -- studs between one car's tail and the next car's nose when they queue
local SPAWN_GAP = 52 -- cars are not put on the street closer than this (a bus is 48 long)
local CAR_SCALE = 1.6 -- the street's cars are this much bigger than the dealer's models (the driver fits in)
local DRIVER_SCALE = 0.85
local POLICE_SHARE = 0.07 -- of the cars, one in fourteen is a police car
local POLICE_EVERY = 16 -- and never more than sixteen cars go by without one
local PROCEDURAL_SHARE = 0.5 -- of the rest, half are built from parts (more silhouettes)

local cars = {}
local peds = {}
local sinceCop = 0 -- cars put on the street since the last police car

----------------------------------------------------------------------------------------------------
-- Road geometry
----------------------------------------------------------------------------------------------------
local function sidewalkWidth(kind: string): number
	return if kind == "main" then 10 elseif kind == "ring" then 6 else 9
end

local function carriageway(road): number
	return road.width - sidewalkWidth(road.kind) * 2
end

local function nodePos(key: string): Vector3
	local n = L.nodes[key]
	return Vector3.new(n.x, CityLayout.ROAD_Y, n.z)
end

-- Width of the road crossing `road` at node `key` (the junction box to keep clear of).
local function crossWidth(road, key: string): number
	local n = L.nodes[key]
	return if road.vertical then CityLayout.roadWidthH(n.j) else CityLayout.roadWidthV(n.i)
end

-- A road travelled from node `from`: where it starts/ends (junction edges), its direction and
-- right-hand side.
local function leg(road, from: string)
	local to = if road.from == from then road.to else road.from
	local a, b = nodePos(from), nodePos(to)
	local dir = (b - a).Unit
	local right = Vector3.new(-dir.Z, 0, dir.X)
	local s = a + dir * (crossWidth(road, from) / 2)
	local e = b - dir * (crossWidth(road, to) / 2)
	return { road = road, from = from, to = to, dir = dir, right = right, start = s, len = math.max(1, (e - s).Magnitude) }
end

local function hasSignal(key: string): boolean
	local n = L.nodes[key]
	return #n.links == 4 and CityLayout.roadWidthV(n.i) ~= 52 and CityLayout.roadWidthH(n.j) ~= 52
end

local function axisOf(dir: Vector3): string
	return if math.abs(dir.Z) > math.abs(dir.X) then "NS" else "EW"
end

local function camPos(): Vector3
	local cam = Workspace.CurrentCamera
	return if cam then cam.CFrame.Position else Vector3.zero
end

local function flatDist(a: Vector3, b: Vector3): number
	return Vector3.new(a.X - b.X, 0, a.Z - b.Z).Magnitude
end

-- Roads whose middle is within [lo, hi] of p.
local function roadsNear(p: Vector3, lo: number, hi: number)
	local out = {}
	for _, r in L.roads do
		local mid = Vector3.new((r.a.X + r.b.X) / 2, 0, (r.a.Y + r.b.Y) / 2)
		local d = flatDist(mid, p)
		if d >= lo and d <= hi then
			table.insert(out, r)
		end
	end
	return out
end

----------------------------------------------------------------------------------------------------
-- People (pedestrians and drivers): local copies of the server's street avatars
-- (ReplicatedStorage.Avatars), posed by their own Animator; the root is anchored and moved by code
----------------------------------------------------------------------------------------------------
local function c3(t): Color3
	return Color3.fromRGB(t[1], t[2], t[3])
end

local function animation(id: string): Animation
	local a = Instance.new("Animation")
	a.AnimationId = id
	return a
end
local WALK = animation(Avatars.ANIMS.walk)
local IDLE = animation(Avatars.ANIMS.idle)
local SIT = animation("rbxassetid://2506281703")

local function pick(list)
	return list[rng:NextInteger(1, #list)]
end

-- A copy of a random street avatar with its own skin tone: anchored root, no physics, no
-- collisions. Returns nil until the server has published the avatars.
local function person(role: string?): (Model?, BasePart?, Animator?, number)
	local avatars = ReplicatedStorage:FindFirstChild("Avatars")
	local all = if avatars then avatars:GetChildren() else {}
	-- (the pool holds a few traffic officers; they are only handed out as officers)
	local list = {}
	for _, a in all do
		if (a:GetAttribute("Cop") == true) == (role == "cop") then
			table.insert(list, a)
		end
	end
	if #list == 0 then
		return nil, nil, nil, 0
	end
	local m = pick(list):Clone() :: Model
	local hum = m:FindFirstChildOfClass("Humanoid")
	local root = m:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not hum or not root then
		m:Destroy()
		return nil, nil, nil, 0
	end
	hum.EvaluateStateMachine = false
	hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	root.Anchored = true
	local bc = m:FindFirstChildOfClass("BodyColors")
	-- (people made of parts have their own skin and clothes; only the catalog bodies are retinted)
	if bc and not m:GetAttribute("Plain") then
		local skin = c3(pick(Avatars.SKIN))
		bc.HeadColor3 = skin
		bc.TorsoColor3 = skin
		bc.LeftArmColor3 = skin
		bc.RightArmColor3 = skin
		bc.LeftLegColor3 = skin
		bc.RightLegColor3 = skin
	end
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") then
			d.CanCollide = false
			d.CanQuery = false
			d.CanTouch = false
		end
	end
	local animator = hum:FindFirstChildOfClass("Animator")
	if not animator then
		animator = Instance.new("Animator")
		animator.Parent = hum
	end
	local hip = m:GetAttribute("Hip")
	return m, root, animator, if type(hip) == "number" then hip else 3
end

----------------------------------------------------------------------------------------------------
-- Cars
----------------------------------------------------------------------------------------------------
local carDefs = {}

local function randomPlate(): string
	return Vehicles.plate(rng)
end

local function laneOffset(road, lane: number): number
	local cw = carriageway(road)
	if road.kind == "street" then
		return cw / 4
	end
	return if lane == 1 then cw * 0.375 else cw * 0.125
end

local function carCFrame(c): CFrame
	local g = c.leg
	local pos = g.start + g.dir * c.t + g.right * c.offset
	return CFrame.lookAt(pos, pos + g.dir)
end

local function bezier(p0: Vector3, p1: Vector3, p2: Vector3, u: number): (Vector3, Vector3)
	local a = p0:Lerp(p1, u)
	local b = p1:Lerp(p2, u)
	return a:Lerp(b, u), (b - a)
end

-- Where to go at the end of the road (decided early, so the car can indicate).
local function chooseNext(c)
	local g = c.leg
	local node = L.nodes[g.to]
	local options = {}
	for _, link in node.links do
		if link.road ~= g.road.id then
			table.insert(options, L.roads[link.road])
		end
	end
	local nextRoad
	if #options == 0 then
		nextRoad = g.road -- dead end: turn around
	else
		-- going straight on is the most common
		for _, r in options do
			local lg = leg(r, g.to)
			if lg.dir:Dot(g.dir) > 0.9 and rng:NextNumber() < 0.55 then
				nextRoad = r
			end
		end
		nextRoad = nextRoad or options[rng:NextInteger(1, #options)]
	end
	return nextRoad
end

-- At the end of a road: plan the curve through the junction.
local function planTurn(c)
	local g = c.leg
	local nextRoad = c.plan or chooseNext(c)
	c.plan = nil
	local ng = leg(nextRoad, g.to)
	local lane = if nextRoad.kind == "street" then 0 else c.lane
	local offset = laneOffset(nextRoad, lane)
	local p0 = g.start + g.dir * g.len + g.right * c.offset
	local p2 = ng.start + ng.right * offset
	local p1
	if math.abs(ng.dir:Dot(g.dir)) > 0.9 then
		if ng.dir:Dot(g.dir) > 0 then
			p1 = (p0 + p2) / 2
		else
			p1 = nodePos(g.to) + g.dir * 10 -- U-turn loop
		end
	elseif math.abs(g.dir.X) > 0.5 then
		p1 = Vector3.new(p2.X, p0.Y, p0.Z)
	else
		p1 = Vector3.new(p0.X, p0.Y, p2.Z)
	end
	c.turn = { p0 = p0, p1 = p1, p2 = p2, s = 0, len = (p1 - p0).Magnitude + (p2 - p1).Magnitude, next = ng, lane = lane, offset = offset }
end

local policeDefs = {}

-- The parts of a car the street life animates: wheels (with their rims and spokes), the indicators,
-- the tail lights and the police lights.
local function collectParts(c, m: Model)
	local pv = m:GetPivot()
	c.wheels = {}
	c.blinkers = {}
	c.tails = {}
	c.polices = {}
	local byTire = {}
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") then
			if d:GetAttribute("Wheel") then
				local r = d:GetAttribute("Radius")
				local w = { front = d:GetAttribute("Front") == true, radius = (if type(r) == "number" then r else 1.2) * CAR_SCALE, base = pv:ToObjectSpace(d.CFrame), pieces = {} }
				table.insert(c.wheels, w)
				byTire[d.Name] = w
				table.insert(w.pieces, { part = d, rel = CFrame.new() })
			elseif d.Name == "Blinker" then
				table.insert(c.blinkers, { part = d, side = d:GetAttribute("Side"), on = false })
			elseif d.Name == "Taillight" then
				d.Material = Enum.Material.SmoothPlastic
				d.Color = Color3.fromRGB(110, 14, 20)
				table.insert(c.tails, d)
			elseif d.Name == "PoliceLight" then
				table.insert(c.polices, { part = d, hue = d:GetAttribute("Hue"), on = false })
			end
		end
	end
	-- the rims and spokes turn with their tire
	for _, d in m:GetDescendants() do
		local of = d:IsA("BasePart") and d:GetAttribute("RimOf")
		local w = of and byTire[of]
		if w then
			-- (relative to the tire, in the wheel's own frame)
			local tire = w.pieces[1].part
			table.insert(w.pieces, { part = d, rel = tire.CFrame:ToObjectSpace(d.CFrame) })
		end
	end
	for _, w in c.wheels do
		w.spin = 0
	end
end

-- The roof of the passenger cabin (roof racks, light bars and signs on top do not count) and the
-- top of a model's visible parts, to seat low cars' drivers lower.
local function cabinTop(m: Model, driver: Model): number
	local top = -1e9
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") and d.Transparency < 1 and not d:IsDescendantOf(driver) and not d:HasTag("CarAddon") then
			if not d:GetAttribute("Wheel") and not d:GetAttribute("RimOf") and d.Name ~= "Chassis" and not string.match(d.Name, "^Skid") then
				top = math.max(top, d.Position.Y + d.Size.Y / 2)
			end
		end
	end
	return top
end

local function headTop(driver: Model): number
	local top = -1e9
	for _, d in driver:GetDescendants() do
		if d:IsA("BasePart") and d.Transparency < 1 then
			top = math.max(top, d.Position.Y + d.Size.Y / 2)
		end
	end
	return top
end

local function spawnCar(): boolean
	local near = roadsNear(camPos(), SPAWN_MIN, SPAWN_MAX)
	if #near == 0 then
		return false
	end
	local road = near[rng:NextInteger(1, #near)]
	local g = leg(road, if rng:NextNumber() < 0.5 then road.from else road.to)
	local lane = if road.kind == "street" then 0 else rng:NextInteger(0, 1)
	local t = rng:NextNumber() * g.len * 0.85
	for _, other in cars do
		if other.leg.road == road and other.leg.from == g.from and other.lane == lane and math.abs(other.t - t) < SPAWN_GAP then
			return false
		end
	end
	sinceCop += 1
	local police = #policeDefs > 0 and (sinceCop >= POLICE_EVERY or rng:NextNumber() < POLICE_SHARE)
	if police then
		sinceCop = 0
	end
	local def = if police then policeDefs[rng:NextInteger(1, #policeDefs)] else carDefs[rng:NextInteger(1, #carDefs)]
	local c = { def = def, leg = g, lane = lane, offset = laneOffset(road, lane), t = t, speed = 0, lastSpeed = 0, phase = rng:NextNumber(), cruise = math.min(def.speed * 0.42, if road.kind == "street" then 28 else 38) * rng:NextNumber(0.85, 1.1) }
	if def.body == "bus" or def.body == "truck" then
		c.cruise = math.min(c.cruise, 24)
	end
	local ok, m = pcall(VehicleModels.build, folder, def, CFrame.new(), {
		color = VehicleModels.PALETTE[rng:NextInteger(1, #VehicleModels.PALETTE)],
		plate = randomPlate(),
		static = true,
		taxi = not police and rng:NextNumber() < 0.07,
		procedural = police or def.body == "bus" or def.body == "truck" or rng:NextNumber() < PROCEDURAL_SHARE,
		police = if police then def else nil,
	})
	if not ok then
		return false
	end
	-- the street's cars are big, so the person at the wheel fits inside
	pcall(function()
		m:ScaleTo(CAR_SCALE)
	end)
	local bcf, bsize = m:GetBoundingBox()
	local bottom = bcf.Position.Y - bsize.Y / 2
	c.len = bsize.Z -- (the car's length: queues keep their distance by it, a bus is not a hatchback)
	collectParts(c, m)
	-- someone at the wheel
	local seat = m:FindFirstChild("Driver") :: BasePart?
	local driver, droot, danim = person()
	if seat and driver and droot and danim then
		pcall(function()
			driver:ScaleTo(DRIVER_SCALE)
		end)
		-- (the whole rig is moved, not just its root, whatever its joints are made of)
		driver.PrimaryPart = droot
		driver:PivotTo(seat.CFrame * CFrame.new(0, seat.Size.Y / 2 + droot.Size.Y / 2 + 0.2, 0))
		driver.Name = "DriverAvatar"
		driver.Parent = m
		-- a low roof (a hatchback, a coupe): slide down in the seat until the head is under it
		local drop = headTop(driver) - (cabinTop(m, driver) - 0.12 * CAR_SCALE)
		if drop > 0 then
			driver:PivotTo(driver:GetPivot() - Vector3.new(0, math.min(drop, 1.2 * CAR_SCALE), 0))
		end
		local sit = danim:LoadAnimation(SIT)
		sit.Looped = true
		sit:Play(0)
		local joints = DriverPose.joints(driver)
		c.joints = if joints.rs and joints.ls then joints else nil -- (a rig without arms has nothing to pose)
	elseif driver then
		driver:Destroy()
	end
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") then
			d.CanQuery = false
			d.CanTouch = false
			d.CastShadow = d.Size.Magnitude > 3
		end
	end
	c.model = m
	-- (relative to the build origin, with the wheels' bottoms on the road)
	c.pivot = m:GetPivot() + Vector3.new(0, -bottom, 0)
	table.insert(cars, c)
	return true
end

local function stepCar(c, dt: number, me: Vector3?)
	local accel, decel = 14, 26
	local target = c.cruise
	if c.turn then
		target = math.min(target, 16)
	else
		local g = c.leg
		local left = g.len - c.t
		-- the way on is chosen early and indicated (left or right) before the junction
		if not c.plan and left < 60 then
			c.plan = chooseNext(c)
			local ng = leg(c.plan, g.to)
			local cross = g.dir:Cross(ng.dir).Y
			c.signal = if cross > 0.45 then "L" elseif cross < -0.45 then "R" else nil
		end
		-- red or amber light ahead: stop before the zebra crossing (1..6 studs before the
		-- junction); keep going if it's too late to stop
		local half = (c.len or 22) / 2
		if hasSignal(g.to) and Ambience.signal(axisOf(g.dir)) ~= "green" and left > half then
			-- (the nose, not the middle of the car, stops short of the crossing)
			local stop = left - half - 3
			if not (stop < 4 and c.speed > 12) then
				target = math.min(target, math.sqrt(2 * decel * math.max(0, stop)))
			end
		end
		-- slow down for corners
		if left < 25 then
			target = math.min(target, 16 + left * 0.8)
		end
		-- the car ahead in our lane
		for _, o in cars do
			if o ~= c and not o.turn and o.leg.road == g.road and o.leg.from == g.from and o.lane == c.lane and o.t > c.t then
				local gap = o.t - c.t - ((o.len or 22) + (c.len or 22)) / 2 - CAR_GAP
				target = math.min(target, math.sqrt(2 * decel * math.max(0, gap)) + o.speed * 0.5)
			end
		end
		-- the player on the road in front
		if me then
			local pos = g.start + g.dir * c.t + g.right * c.offset
			local rel = me - pos
			local ahead = rel:Dot(g.dir)
			if ahead > 0 and ahead < half + 10 and math.abs(rel:Dot(g.right)) < 3.5 and math.abs(rel.Y) < 8 then
				target = 0
			end
		end
	end
	if c.speed < target then
		c.speed = math.min(target, c.speed + accel * dt)
	else
		c.speed = math.max(target, c.speed - decel * dt)
	end
	local move = c.speed * dt
	if c.turn then
		local tr = c.turn
		tr.s += move
		if tr.s >= tr.len then
			c.leg = tr.next
			c.lane = tr.lane
			c.offset = tr.offset
			c.t = tr.s - tr.len
			c.turn = nil
			c.signal = nil
		end
	else
		c.t += move
		if c.t >= c.leg.len then
			planTurn(c)
			c.turn.s = c.t - c.leg.len
		end
	end
end

-- Indicators, brake lights and police lights.
local function setLamp(l, on: boolean, onColor: Color3, offColor: Color3, offMaterial: Enum.Material)
	if l.on == on then
		return
	end
	l.on = on
	l.part.Material = if on then Enum.Material.Neon else offMaterial
	l.part.Color = if on then onColor else offColor
end

local function updateLights(c, now: number)
	if #c.blinkers > 0 then
		local blink = (now * 2.4 + c.phase) % 1 < 0.5
		for _, b in c.blinkers do
			local want = blink and c.signal ~= nil and ((c.signal == "L" and b.side == -1) or (c.signal == "R" and b.side == 1))
			setLamp(b, want, VehicleModels.AMBER_ON, VehicleModels.AMBER_OFF, Enum.Material.SmoothPlastic)
		end
	end
	if #c.tails > 0 then
		local braking = c.speed < c.lastSpeed - 0.02 or c.speed < 0.8
		if braking ~= c.braking then
			c.braking = braking
			for _, t in c.tails do
				t.Material = if braking then Enum.Material.Neon else Enum.Material.SmoothPlastic
				t.Color = if braking then Color3.fromRGB(255, 50, 50) else Color3.fromRGB(110, 14, 20)
			end
		end
	end
	if #c.polices > 0 then
		local phase = math.floor(now * 5 + c.phase * 5) % 2
		for _, l in c.polices do
			local red = l.hue == "red"
			local on = (phase == 0) == red
			setLamp(l, on, if red then Color3.fromRGB(255, 60, 60) else Color3.fromRGB(70, 130, 255), if red then Color3.fromRGB(110, 20, 20) else Color3.fromRGB(20, 40, 110), Enum.Material.SmoothPlastic)
		end
	end
end

local wheelParts, wheelCfs = {}, {}

local function placeCar(c, dt: number)
	local cf
	if c.turn then
		local tr = c.turn
		local pos, tangent = bezier(tr.p0, tr.p1, tr.p2, math.clamp(tr.s / tr.len, 0, 1))
		if tangent.Magnitude < 1e-3 then
			tangent = c.leg.dir
		end
		cf = CFrame.lookAt(pos, pos + Vector3.new(tangent.X, 0, tangent.Z))
	else
		cf = carCFrame(c)
	end
	c.model:PivotTo(cf * c.pivot)
	-- how hard the wheel is turned: the rate the heading changes at (0.6 rad/s is full lock)
	local look = cf.LookVector
	if c.prevLook and dt > 0 then
		local rate = c.prevLook:Cross(look).Y / dt
		c.steer = (c.steer or 0) * 0.85 + math.clamp(rate / 0.6, -1, 1) * 0.15
	end
	c.prevLook = look
	-- the wheels roll with the road and the front ones turn with the steering (near the camera only)
	local cam = camPos()
	if #c.wheels > 0 and (c.speed > 0.05 or math.abs(c.steer or 0) > 0.02) and flatDist(cf.Position, cam) < 150 then
		local world = cf * c.pivot
		local yaw = CFrame.Angles(0, (c.steer or 0) * 0.5, 0)
		for _, w in c.wheels do
			w.spin += c.speed * dt / w.radius
			local rot = CFrame.fromAxisAngle(Vector3.new(1, 0, 0), -w.spin) * (w.base - w.base.Position)
			if w.front then
				rot = yaw * rot
			end
			local frame = world * (CFrame.new(w.base.Position) * rot)
			for _, pc in w.pieces do
				table.insert(wheelParts, pc.part)
				table.insert(wheelCfs, frame * pc.rel)
			end
		end
	end
end

-- (the wheels of every car in one move)
local function flushWheels()
	if #wheelParts > 0 then
		Workspace:BulkMoveTo(wheelParts, wheelCfs, Enum.BulkMoveMode.FireCFrameChanged)
		table.clear(wheelParts)
		table.clear(wheelCfs)
	end
end

----------------------------------------------------------------------------------------------------
-- Pedestrians: walking the sidewalks, limbs swung by code
----------------------------------------------------------------------------------------------------
local function sidewalkLeg(road, from: string, side: number)
	local g = leg(road, from)
	local cw = carriageway(road)
	local sw = sidewalkWidth(road.kind)
	g.side = side
	g.lateral = (cw / 2 + sw * rng:NextNumber(0.35, 0.65)) * side
	-- walk the whole block: from junction edge to junction edge
	return g
end

local function spawnPed(): boolean
	local near = roadsNear(camPos(), 30, SPAWN_MAX * 0.7)
	if #near == 0 then
		return false
	end
	local m, root, animator, hip = person()
	if not m or not root or not animator then
		return false
	end
	local road = near[rng:NextInteger(1, #near)]
	local g = sidewalkLeg(road, if rng:NextNumber() < 0.5 then road.from else road.to, if rng:NextNumber() < 0.5 then 1 else -1)
	local speed = rng:NextNumber(4.5, 6.5)
	m.Parent = folder
	local walk = animator:LoadAnimation(WALK)
	walk.Looped = true
	local idle = animator:LoadAnimation(IDLE)
	idle.Looped = true
	walk:Play(0)
	walk:AdjustSpeed(speed / Avatars.WALK_STRIDE)
	table.insert(peds, {
		leg = g,
		t = rng:NextNumber() * g.len,
		speed = speed,
		pause = 0,
		model = m,
		root = root,
		hip = hip,
		walkTrack = walk,
		idleTrack = idle,
		walking = true,
	})
	return true
end

-- walk or stand still (a look at the phone, a shop window...)
local function setWalking(p, on: boolean)
	if p.walking == on then
		return
	end
	p.walking = on
	if on then
		p.idleTrack:Stop(0.3)
		p.walkTrack:Play(0.3)
		p.walkTrack:AdjustSpeed(p.speed / Avatars.WALK_STRIDE)
	else
		p.walkTrack:Stop(0.3)
		p.idleTrack:Play(0.3)
	end
end

local function stepPed(p, dt: number)
	if p.pause > 0 then
		p.pause -= dt
		setWalking(p, p.pause <= 0)
		return
	end
	p.t += p.speed * dt
	if p.t >= p.leg.len then
		-- carry on across the junction if the street continues, otherwise turn back
		local g = p.leg
		local node = L.nodes[g.to]
		local straight = nil
		for _, link in node.links do
			local r = L.roads[link.road]
			if r ~= g.road then
				local lg = leg(r, g.to)
				if lg.dir:Dot(g.dir) > 0.9 then
					straight = r
				end
			end
		end
		if straight and rng:NextNumber() < 0.75 then
			p.leg = sidewalkLeg(straight, g.to, g.side)
			p.t = -crossWidth(g.road, g.to) -- walk over the crossing first
		else
			p.leg = sidewalkLeg(g.road, g.to, -g.side)
			p.t = 0
		end
	elseif rng:NextNumber() < dt * 0.04 then
		p.pause = rng:NextNumber(2, 6)
		setWalking(p, false)
	end
end

local function pedCFrame(p): CFrame
	local g = p.leg
	local pos = g.start + g.dir * p.t + g.right * g.lateral
	pos = Vector3.new(pos.X, CityLayout.WALK_Y + p.hip, pos.Z)
	return CFrame.lookAt(pos, pos + g.dir)
end

local function removePed(i: number)
	peds[i].model:Destroy()
	table.remove(peds, i)
end

-- In the rain people on the street hold an umbrella over their head (a stick and two discs).
local UMBRELLAS = {
	Color3.fromRGB(200, 40, 50), Color3.fromRGB(30, 90, 190), Color3.fromRGB(30, 30, 34), Color3.fromRGB(240, 190, 30),
	Color3.fromRGB(40, 150, 90), Color3.fromRGB(150, 60, 170), Color3.fromRGB(235, 120, 40), Color3.fromRGB(236, 236, 240),
}

local function disc(parent: Instance, name: string, size: Vector3, offset: Vector3, color: Color3, head: BasePart): BasePart
	local p = Instance.new("Part")
	p.Name = name
	p.Shape = Enum.PartType.Cylinder
	p.Size = size
	p.Color = color
	p.Material = Enum.Material.Fabric
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Massless = true
	-- (a cylinder lies along X: turn it so its axis is up)
	p.CFrame = head.CFrame * CFrame.new(offset) * CFrame.Angles(0, 0, math.rad(90))
	p.Parent = parent
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = head
	weld.Part1 = p
	weld.Parent = p
	return p
end

local function setUmbrella(p, on: boolean)
	if on == (p.umbrella ~= nil) then
		return
	end
	if not on then
		p.umbrella:Destroy()
		p.umbrella = nil
		return
	end
	local head = p.model:FindFirstChild("Head") :: BasePart?
	if not head then
		return
	end
	local m = Instance.new("Model")
	m.Name = "Umbrella"
	local color = pick(UMBRELLAS)
	disc(m, "Stick", Vector3.new(3.2, 0.14, 0.14), Vector3.new(0, 1.7, 0), Color3.fromRGB(50, 50, 54), head)
	disc(m, "Canopy", Vector3.new(0.22, 4.6, 4.6), Vector3.new(0, 3.1, 0), color, head)
	disc(m, "Crown", Vector3.new(0.3, 2.6, 2.6), Vector3.new(0, 3.3, 0), color:Lerp(Color3.new(1, 1, 1), 0.15), head)
	m.Parent = p.model
	p.umbrella = m
end

----------------------------------------------------------------------------------------------------
-- Traffic officers: one at every fourth signalled junction, on the corner, turned to the crossing,
-- now and then pointing the cars on. They stand where the sidewalk corner is (not in the road).
----------------------------------------------------------------------------------------------------
local POINT = animation("rbxassetid://507770453")
local cops: { { key: string, model: Model, animator: Animator, point: AnimationTrack, next: number } } = {}
local copPosts: { string }? = nil

local function buildCopPosts()
	local keys = {}
	for key in L.nodes do
		if hasSignal(key) then
			table.insert(keys, key)
		end
	end
	table.sort(keys)
	copPosts = {}
	for i, key in keys do
		if i % 4 == 1 then
			table.insert(copPosts :: { string }, key)
		end
	end
end

-- Where the officer of a junction stands: on one of the corners (picked from the junction's cell).
local function copSpot(key: string): CFrame?
	local n = L.nodes[key]
	local Wv, Wh = CityLayout.roadWidthV(n.i), CityLayout.roadWidthH(n.j)
	local kindV = if Wv == 52 then "ring" elseif Wv == 60 then "main" else "street"
	local kindH = if Wh == 52 then "ring" elseif Wh == 60 then "main" else "street"
	local cwV, cwH = Wv - 2 * sidewalkWidth(kindV), Wh - 2 * sidewalkWidth(kindH)
	local sx = if (n.i + n.j) % 2 == 0 then 1 else -1
	local sz = if (n.i * 3 + n.j) % 2 == 0 then 1 else -1
	local pos = Vector3.new(n.x + sx * (cwV / 2 + 5), CityLayout.WALK_Y, n.z + sz * (cwH / 2 + 5))
	return CFrame.lookAt(pos, Vector3.new(n.x, pos.Y, n.z))
end

local function spawnCop(key: string)
	local cf = copSpot(key)
	local m, root, animator, hip = person("cop")
	if not cf or not m or not root or not animator then
		return
	end
	m.Name = "TrafficOfficer"
	m.Parent = folder
	m:PivotTo(cf + Vector3.new(0, hip, 0))
	local idle = animator:LoadAnimation(IDLE)
	idle.Looped = true
	idle:Play(0)
	local point = animator:LoadAnimation(POINT)
	point.Looped = false
	table.insert(cops, { key = key, model = m, animator = animator, point = point, next = os.clock() + rng:NextNumber(3, 9) })
end

local function updateCops(now: number)
	if not copPosts then
		buildCopPosts()
	end
	local cam = camPos()
	for i = #cops, 1, -1 do
		local c = cops[i]
		local cf = copSpot(c.key)
		if not c.model.Parent or (cf and flatDist(cf.Position, cam) > 330) then
			c.model:Destroy()
			table.remove(cops, i)
		elseif now >= c.next then
			c.next = now + rng:NextNumber(6, 14)
			c.point:Play(0.2)
		end
	end
	for _, key in copPosts :: { string } do
		local cf = copSpot(key)
		if cf and flatDist(cf.Position, cam) < 220 then
			local have = false
			for _, c in cops do
				if c.key == key then
					have = true
					break
				end
			end
			if not have then
				spawnCop(key)
			end
		end
	end
end

----------------------------------------------------------------------------------------------------
function Traffic.init()
	L = CityLayout.get()
	folder = Instance.new("Folder")
	folder.Name = "ClientTraffic"
	folder.Parent = Workspace
	for _, v in Vehicles.list do
		if v.kind == "car" then
			table.insert(carDefs, v)
			if v.price < 60000 then
				table.insert(carDefs, v) -- everyday cars twice as common
			end
		end
	end
	-- the street's own: buses, trucks, vans and taxis (the buses and trucks are rarer)
	for _, v in Vehicles.street do
		table.insert(carDefs, v)
		if v.body ~= "bus" and v.body ~= "truck" then
			table.insert(carDefs, v)
		end
	end
	policeDefs = Vehicles.police
	local spawnClock, umbrellaClock, copClock = 0, 0, 0
	RunService.RenderStepped:Connect(function()
		local cam = camPos()
		for _, c in cars do
			if c.joints and c.model.Parent and flatDist(c.model:GetPivot().Position, cam) < 130 then
				DriverPose.apply(c.joints, c.steer or 0)
			end
		end
	end)
	RunService.Heartbeat:Connect(function(dt)
		local cam = camPos()
		local char = player.Character
		local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
		local me = root and root.Position or nil
		-- keep the neighbourhood populated
		spawnClock += dt
		if spawnClock > 0.35 then
			spawnClock = 0
			if #cars < MAX_CARS then
				spawnCar()
			end
			if #peds < MAX_PEDS then
				spawnPed()
			end
		end
		local now = os.clock()
		for i = #cars, 1, -1 do
			local c = cars[i]
			c.lastSpeed = c.speed
			stepCar(c, math.min(dt, 0.1), me)
			local pos = c.leg.start + c.leg.dir * c.t
			if flatDist(pos, cam) > DESPAWN then
				c.model:Destroy()
				table.remove(cars, i)
			else
				placeCar(c, math.min(dt, 0.1))
				if flatDist(pos, cam) < 170 then
					updateLights(c, now)
				end
			end
		end
		flushWheels()
		-- the officers at the junctions (looked after every second or so)
		copClock += dt
		if copClock > 1.1 then
			copClock = 0
			updateCops(now)
		end
		-- umbrellas up while it rains (a few times a second is plenty)
		umbrellaClock += dt
		if umbrellaClock > 0.6 then
			umbrellaClock = 0
			local rainy = Weather.wet() > 0.35
			for _, p in peds do
				if flatDist(p.leg.start + p.leg.dir * p.t, cam) < 170 or not rainy then
					setUmbrella(p, rainy)
				end
			end
		end
		local moved, cfs = {}, {}
		for i = #peds, 1, -1 do
			local p = peds[i]
			stepPed(p, math.min(dt, 0.1))
			local pos = p.leg.start + p.leg.dir * p.t
			local d = flatDist(pos, cam)
			if d > DESPAWN * 0.75 then
				removePed(i)
			elseif d < 260 then
				table.insert(moved, p.root)
				table.insert(cfs, pedCFrame(p))
			end
		end
		if #moved > 0 then
			Workspace:BulkMoveTo(moved, cfs, Enum.BulkMoveMode.FireCFrameChanged)
		end
	end)
end

-- How busy the streets are (the Settings window): "off", "low", "normal" or "high" -- cars and
-- people separately.
local carFactor, pedFactor = 1, 1
local function applyDensity()
	MAX_CARS, MAX_PEDS = math.floor(BASE_CARS * carFactor + 0.5), math.floor(BASE_PEDS * pedFactor + 0.5)
	while #cars > MAX_CARS do
		cars[#cars].model:Destroy()
		table.remove(cars)
	end
	while #peds > MAX_PEDS do
		removePed(#peds)
	end
end

function Traffic.setDensity(level: string)
	carFactor = DENSITY[level] or 1
	applyDensity()
end

function Traffic.setCrowd(level: string)
	pedFactor = DENSITY[level] or 1
	applyDensity()
end

-- (for the tests: the cars on the road right now)
-- (the tests look at a street car's driver: how far the arms are turned from the way the rig was made)
function Traffic._driverJoints(carModel: Model)
	for _, c in cars do
		if c.model == carModel then
			return c.joints
		end
	end
	return nil
end

function Traffic._cars()
	return cars
end

function Traffic._cops()
	return cops
end

function Traffic.counts(): (number, number)
	return #cars, #peds
end

return Traffic
