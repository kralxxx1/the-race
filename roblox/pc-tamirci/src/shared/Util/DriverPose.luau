-- DriverPose: arm poses for somebody sitting down (R15), set every frame after the animation has
-- been applied (the sit animation lets the arms hang):
--   apply: at the wheel - both arms reach forward with bent elbows, turn with the steering, and the
--          head looks into the bend
--   work:  at a desk - hands forward on the work, head down, a little typing

local DriverPose = {}

export type Joints = { rs: Motor6D?, ls: Motor6D?, re: Motor6D?, le: Motor6D?, neck: Motor6D? }

local ARM_REACH, ELBOW_BEND = math.rad(46), math.rad(58)

function DriverPose.joints(model: Model): Joints
	local function joint(name: string): Motor6D?
		local d = model:FindFirstChild(name, true)
		return if d and d:IsA("Motor6D") then d else nil
	end
	return { rs = joint("RightShoulder"), ls = joint("LeftShoulder"), re = joint("RightElbow"), le = joint("LeftElbow"), neck = joint("Neck") }
end

-- steer: -1 (full right) .. 1 (full left). Does nothing for a rig without shoulders.
function DriverPose.apply(j: Joints?, steer: number)
	if not j or not j.rs or not j.ls then
		return
	end
	local wheel = math.rad(steer * 26)
	j.rs.Transform = CFrame.Angles(ARM_REACH, wheel, 0)
	j.ls.Transform = CFrame.Angles(ARM_REACH, wheel, 0)
	if j.re and j.le then
		j.re.Transform = CFrame.Angles(ELBOW_BEND, 0, 0)
		j.le.Transform = CFrame.Angles(ELBOW_BEND, 0, 0)
	end
	if j.neck then
		j.neck.Transform = CFrame.Angles(0, math.rad(steer * 14), 0)
	end
end

-- Back to whatever the animation does (when the person gets up or out of the car).
function DriverPose.reset(j: Joints?)
	if not j then
		return
	end
	for _, joint in { j.rs, j.ls, j.re, j.le, j.neck } do
		joint.Transform = CFrame.new()
	end
end

-- Somebody working at a bench: t is the time in seconds, phase makes each person move differently.
function DriverPose.work(j: Joints?, t: number, phase: number)
	if not j or not j.rs or not j.ls then
		return
	end
	local tap = math.sin(t * 9 + phase) * 0.05
	local tap2 = math.sin(t * 7.3 + phase * 1.7) * 0.05
	j.rs.Transform = CFrame.Angles(math.rad(36) + tap, math.rad(-8), 0)
	j.ls.Transform = CFrame.Angles(math.rad(36) + tap2, math.rad(8), 0)
	if j.re and j.le then
		j.re.Transform = CFrame.Angles(math.rad(80) + tap2, 0, 0)
		j.le.Transform = CFrame.Angles(math.rad(80) + tap, 0, 0)
	end
	if j.neck then
		-- head down at the work, now and then glancing up
		j.neck.Transform = CFrame.Angles(math.rad(-16) + math.max(0, math.sin(t * 0.7 + phase)) * 0.18, math.sin(t * 0.4 + phase) * 0.12, 0)
	end
end

return DriverPose
