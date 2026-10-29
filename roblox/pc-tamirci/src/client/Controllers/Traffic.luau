-- Traffic: life on the streets around you, simulated on each client (nothing to replicate).
--   * cars and bikes drive in the right-hand lane, follow each other, stop at red lights
--     (Ambience.signal) and for you, and turn through junctions on smooth curves
--   * pedestrians stroll the sidewalks, cross at junctions and stop now and then
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
local VehicleModels = require(Shared.Models.VehicleModels)

local Ambience = require(script.Parent.Ambience)

local Traffic = {}

local player = Players.LocalPlayer
local L
local folder: Folder
local rng = Random.new()

local MAX_CARS = 20
local MAX_PEDS = 26
if UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled then
	-- phones: lighter streets
	MAX_CARS, MAX_PEDS = 10, 14
end
local SPAWN_MIN, SPAWN_MAX, DESPAWN = 80, 320, 430
local CAR_GAP = 10

local cars = {}
local peds = {}

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
local function person(): (Model?, BasePart?, Animator?, number)
	local avatars = ReplicatedStorage:FindFirstChild("Avatars")
	local list = if avatars then avatars:GetChildren() else {}
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
	if bc then
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

-- At the end of a road: pick where to go next and plan the curve through the junction.
local function planTurn(c)
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
		if other.leg.road == road and other.leg.from == g.from and other.lane == lane and math.abs(other.t - t) < CAR_GAP * 2 then
			return false
		end
	end
	local def = carDefs[rng:NextInteger(1, #carDefs)]
	local c = { def = def, leg = g, lane = lane, offset = laneOffset(road, lane), t = t, speed = 0, cruise = math.min(def.speed * 0.42, if road.kind == "street" then 28 else 38) * rng:NextNumber(0.85, 1.1) }
	local ok, m = pcall(VehicleModels.build, folder, def, CFrame.new(), { color = rng:NextInteger(1, #def.colors), plate = randomPlate(), static = true })
	if not ok then
		return false
	end
	-- someone at the wheel
	local seat = m:FindFirstChild("Driver") :: BasePart?
	local driver, droot, danim = person()
	if seat and driver and droot and danim then
		droot.CFrame = seat.CFrame * CFrame.new(0, seat.Size.Y / 2 + droot.Size.Y / 2 + 0.2, 0)
		driver.Name = "DriverAvatar"
		driver.Parent = m
		local sit = danim:LoadAnimation(SIT)
		sit.Looped = true
		sit:Play(0)
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
	c.pivot = m:GetPivot() -- relative to the build origin
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
		-- red or amber light ahead: stop before the zebra crossing (1..6 studs before the
		-- junction); keep going if it's too late to stop
		if hasSignal(g.to) and Ambience.signal(axisOf(g.dir)) ~= "green" and left > 6.5 then
			local stop = left - 8
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
				local gap = o.t - c.t - CAR_GAP
				target = math.min(target, math.sqrt(2 * decel * math.max(0, gap)) + o.speed * 0.5)
			end
		end
		-- the player on the road in front
		if me then
			local pos = g.start + g.dir * c.t + g.right * c.offset
			local rel = me - pos
			local ahead = rel:Dot(g.dir)
			if ahead > 0 and ahead < 16 and math.abs(rel:Dot(g.right)) < 3.5 and math.abs(rel.Y) < 8 then
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
		end
	else
		c.t += move
		if c.t >= c.leg.len then
			planTurn(c)
			c.turn.s = c.t - c.leg.len
		end
	end
end

local function placeCar(c)
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
	local spawnClock = 0
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
		for i = #cars, 1, -1 do
			local c = cars[i]
			stepCar(c, math.min(dt, 0.1), me)
			local pos = c.leg.start + c.leg.dir * c.t
			if flatDist(pos, cam) > DESPAWN then
				c.model:Destroy()
				table.remove(cars, i)
			else
				placeCar(c)
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

function Traffic.counts(): (number, number)
	return #cars, #peds
end

return Traffic
