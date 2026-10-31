-- NpcPoses: people sitting at a workbench (the technicians you hire) work: hands forward on the
-- device, head down, a little typing. The server only plays the sit animation, and a pose set
-- there would not reach the players, so every client poses the ones nearby itself.

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local DriverPose = require(ReplicatedStorage:WaitForChild("Shared").Util.DriverPose)

local NpcPoses = {}

local RANGE = 70
local REFRESH = 2 -- seconds between looks at who is out there
local people: { Model } = {}
local lastLook = -1e9
local state: { [Model]: { joints: any, phase: number } } = setmetatable({}, { __mode = "k" })

-- Is this person on a workbench stool?
local function atBench(model: Model): boolean
	local hum = model:FindFirstChildOfClass("Humanoid")
	local seat = hum and hum.SeatPart
	return seat ~= nil and seat.Name == "Stool"
end
NpcPoses.atBench = atBench

function NpcPoses.step(now: number)
	local cam = Workspace.CurrentCamera
	if not cam then
		return
	end
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
	for _, m in people do
		if m.Parent then
			local root = m.PrimaryPart
			if root and (root.Position - camPos).Magnitude < RANGE and atBench(m) then
				local st = state[m]
				if not st then
					st = { joints = DriverPose.joints(m), phase = (root.Position.X * 3.1 + root.Position.Z * 1.7) % 6.28 }
					state[m] = st
				end
				DriverPose.work(st.joints, now, st.phase)
				posed[m] = true
			end
		end
	end
	-- (somebody who got up or went out of range lets the animation take the arms back)
	for m, st in state do
		if not posed[m] then
			DriverPose.reset(st.joints)
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
