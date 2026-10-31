-- NpcPoses: people at work move their hands. A technician on a workbench stool works on the
-- device: hands forward, head down, and the hands do what the repair step asks (the server writes
-- the step into the person's "Doing" attribute: turning a screwdriver, blowing dust, brushing,
-- squeezing paste, soldering, prying, pulling a part...). Counter staff type at the till, the
-- cleaner wipes, the storekeeper stocks the shelf while they stand at their spot. The server only
-- plays the sit animation, and a pose set there would not reach the players, so every client poses
-- the ones nearby itself, blending from one motion to the next.

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local DriverPose = require(ReplicatedStorage:WaitForChild("Shared").Util.DriverPose)

local NpcPoses = {}

local RANGE = 70
local REFRESH = 2 -- seconds between looks at who is out there
local BLEND = 12 -- how fast one motion turns into the next (per second)
local STILL_FOR = 0.5 -- seconds without moving before a standing person starts their chore
local people: { Model } = {}
local lastLook = -1e9
local lastNow: number? = nil
type State = { joints: any, phase: number, pose: any, last: Vector3?, still: number, kind: string? }
local state: { [Model]: State } = setmetatable({}, { __mode = "k" })

-- what people who stand at their spot do while nobody has given them anything else
local ROLE_KIND = {
	receptionist = "register",
	cashier = "register",
	salesperson = "register",
	cleaner = "wipe",
	storekeeper = "stock",
}

-- motions that go on while the person walks (the rest wait until they have stopped)
local WALKING = { sneak = true }

-- Is this person on a workbench stool?
local function atBench(model: Model): boolean
	local hum = model:FindFirstChildOfClass("Humanoid")
	local seat = hum and hum.SeatPart
	return seat ~= nil and seat.Name == "Stool"
end
NpcPoses.atBench = atBench

-- The motion somebody should be making right now (nil: none, the animation has the arms).
local function kindOf(model: Model, sitting: boolean): string?
	local doing = model:GetAttribute("Doing")
	if type(doing) == "string" and doing ~= "" then
		return DriverPose.kindOf(doing)
	end
	if model:GetAttribute("Sneaking") == true then
		return "sneak"
	end
	if sitting then
		return "type"
	end
	local role = model:GetAttribute("Staff")
	return if type(role) == "string" then ROLE_KIND[role] else nil
end
NpcPoses.kindOf = kindOf

function NpcPoses.step(now: number)
	local cam = Workspace.CurrentCamera
	if not cam then
		return
	end
	local dt = math.clamp(now - (lastNow or now), 0, 0.25)
	lastNow = now
	-- (the list of people is taken every couple of seconds, not every frame)
	if now - lastLook >= REFRESH then
		lastLook = now
		people = {}
		for _, m in CollectionService:GetTagged("NpcModel") do
			if m:IsA("Model") then
				table.insert(people, m)
			end
		end
	end
	local camPos = cam.CFrame.Position
	local posed: { [Model]: boolean } = {}
	local k = 1 - math.exp(-BLEND * dt)
	for _, m in people do
		if m.Parent then
			local root = m.PrimaryPart
			local sitting = root ~= nil and (root.Position - camPos).Magnitude < RANGE and atBench(m)
			local kind = if root and (root.Position - camPos).Magnitude < RANGE then kindOf(m, sitting) else nil
			if root and kind then
				local st = state[m]
				if not st then
					st = { joints = DriverPose.joints(m), phase = (root.Position.X * 3.1 + root.Position.Z * 1.7) % 6.28, pose = nil, last = root.Position, still = 0, kind = kind }
					state[m] = st
				end
				-- (a standing person walking somewhere is not doing their chore yet)
				local moving = false
				if not sitting and not WALKING[kind] then
					local last = st.last
					if last and (root.Position - last).Magnitude > 0.02 then
						st.still = 0
					else
						st.still += dt
					end
					st.last = root.Position
					moving = st.still < STILL_FOR
				end
				if moving then
					if st.pose then
						DriverPose.reset(st.joints)
						st.pose = nil
					end
				else
					local target = DriverPose.workPose(kind, now, st.phase)
					st.pose = DriverPose.blend(st.pose, target, if st.kind == kind then k else math.min(1, k * 1.5))
					DriverPose.set(st.joints, st.pose)
				end
				st.kind = kind
				posed[m] = true
			end
		end
	end
	-- (somebody who got up, went out of range or walked off lets the animation take the arms back)
	for m, st in state do
		if not posed[m] then
			if m.Parent then
				DriverPose.reset(st.joints)
			end
			state[m] = nil
		end
	end
end

function NpcPoses.init()
	RunService.RenderStepped:Connect(function()
		NpcPoses.step(os.clock())
	end)
end

return NpcPoses
