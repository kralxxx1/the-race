-- DriverPose: poses for somebody sitting or standing at work (R15), written every frame:
--   apply: at the wheel - both arms reach forward with bent elbows, turn with the steering, and the
--          head looks into the bend
--   work:  at a desk or a counter - hands forward on the work, head down, and the hands do what the
--          job asks (DriverPose.KIND maps a repair action to the motion): turning a screwdriver,
--          blowing dust, brushing, squeezing paste, soldering, prying, pulling a part, typing...
-- A pose is a table of angles (radians) so the poses can be blended from one to the next.
-- The poses are written to the joints' C0, on top of the C0 they were built with: the animation owns
-- Motor6D.Transform and paints over anything written there, but nobody touches C0.

local DriverPose = {}

export type Joints = { rs: Motor6D?, ls: Motor6D?, re: Motor6D?, le: Motor6D?, rw: Motor6D?, lw: Motor6D?, neck: Motor6D?, waist: Motor6D?, rh: Motor6D?, lh: Motor6D?, rk: Motor6D?, lk: Motor6D?, base: { [string]: CFrame } }
export type Pose = { rs: { number }, ls: { number }, re: number, le: number, rw: { number }, lw: { number }, neck: { number }, waist: number, hip: number, knee: number }

local ARM_REACH, ELBOW_BEND = math.rad(46), math.rad(58)
local rad, sin, cos, max = math.rad, math.sin, math.cos, math.max

function DriverPose.joints(model: Model): Joints
	local function joint(name: string): Motor6D?
		local d = model:FindFirstChild(name, true)
		return if d and d:IsA("Motor6D") then d else nil
	end
	local j = {
		rs = joint("RightShoulder"),
		ls = joint("LeftShoulder"),
		re = joint("RightElbow"),
		le = joint("LeftElbow"),
		rw = joint("RightWrist"),
		lw = joint("LeftWrist"),
		neck = joint("Neck"),
		waist = joint("Waist"),
		rh = joint("RightHip"),
		lh = joint("LeftHip"),
		rk = joint("RightKnee"),
		lk = joint("LeftKnee"),
	}
	-- what each joint was built with: a pose is an offset on it
	local base = {}
	for name, motor in j do
		local ok, c0 = pcall(function()
			return motor.C0
		end)
		base[name] = if ok and c0 then c0 else CFrame.new()
	end
	j.base = base
	return j :: any
end

-- Turns a joint by `by` from its own C0 (nil: back to it).
local function put(j: Joints, name: string, by: CFrame?)
	local motor = (j :: any)[name] :: Motor6D?
	if motor then
		motor.C0 = if by then j.base[name] * by else j.base[name]
	end
end

-- steer: -1 (full right) .. 1 (full left). Does nothing for a rig without shoulders.
function DriverPose.apply(j: Joints?, steer: number)
	if not j or not j.rs or not j.ls then
		return
	end
	local wheel = math.rad(steer * 26)
	put(j, "rs", CFrame.Angles(ARM_REACH, wheel, 0))
	put(j, "ls", CFrame.Angles(ARM_REACH, wheel, 0))
	if j.re and j.le then
		put(j, "re", CFrame.Angles(ELBOW_BEND, 0, 0))
		put(j, "le", CFrame.Angles(ELBOW_BEND, 0, 0))
	end
	if j.neck then
		put(j, "neck", CFrame.Angles(0, math.rad(steer * 14), 0))
	end
end

-- Back to the way the rig was built (when the person gets up, walks off or is out of the car).
function DriverPose.reset(j: Joints?)
	if not j then
		return
	end
	for _, name in { "rs", "ls", "re", "le", "rw", "lw", "neck", "waist", "rh", "lh", "rk", "lk" } do
		put(j, name, nil)
	end
end

-- How far a joint is turned from the way it was built (identity: not posed).
function DriverPose.offset(j: Joints, name: string): CFrame
	local motor = (j :: any)[name] :: Motor6D?
	return if motor then j.base[name]:Inverse() * motor.C0 else CFrame.new()
end

----------------------------------------------------------------------------------------------------
-- Work motions
----------------------------------------------------------------------------------------------------
-- Everything in degrees here: shoulders and wrists { x, y [, z] } (x raises the arm forward, y swings
-- it sideways / rolls the wrist), elbows a bend, the neck { nod, turn }, the waist a lean (negative:
-- forward), legs { hip, knee } (hips forward and knees back: a crouch).
local function P(rs, ls, re, le, rw, lw, neck, waist, legs): Pose
	return {
		rs = { rad(rs[1]), rad(rs[2]), rad(rs[3] or 0) },
		ls = { rad(ls[1]), rad(ls[2]), rad(ls[3] or 0) },
		re = rad(re),
		le = rad(le),
		rw = { rad(rw[1]), rad(rw[2]), rad(rw[3] or 0) },
		lw = { rad(lw[1]), rad(lw[2]), rad(lw[3] or 0) },
		neck = { rad(neck[1]), rad(neck[2]) },
		waist = rad(waist or 0),
		hip = rad(if legs then legs[1] else 0),
		knee = rad(if legs then legs[2] else 0),
	}
end

local STILL = { 0, 0 }
local MOTIONS: { [string]: (number, number) -> Pose } = {}

-- typing and general tinkering: hands forward, fingers tapping, now and then a glance up
MOTIONS.type = function(t, ph)
	local tap, tap2 = sin(t * 9 + ph) * 2.9, sin(t * 7.3 + ph * 1.7) * 2.9
	local glance = max(0, sin(t * 0.7 + ph)) * 10.3
	return P({ 36 + tap, -8 }, { 36 + tap2, 8 }, 80 + tap2, 80 + tap, { sin(t * 18 + ph) * 6, 0 }, { sin(t * 15 + ph) * 6, 0 }, { -16 + glance, sin(t * 0.4 + ph) * 6.9 })
end
-- a screwdriver: the right hand rolls back and forth, the left steadies the case
MOTIONS.twist = function(t, ph)
	return P({ 44 + sin(t * 2.6) * 2, -14 }, { 34, 12 }, 74 + sin(t * 5.2) * 2, 86, { 0, sin(t * 11 + ph) * 55, 0 }, STILL, { -22, sin(t * 0.5 + ph) * 4 })
end
-- a can of air: held out at the machine and swept slowly over it, shaking a little
MOTIONS.spray = function(t, ph)
	return P({ 54 + sin(t * 40) * 0.6, -8 + sin(t * 1.6 + ph) * 10 }, { 34, 10 }, 58, 86, STILL, STILL, { -14, sin(t * 0.9 + ph) * 8 })
end
-- a brush: sweeping from side to side
MOTIONS.brush = function(t, ph)
	local sweep = sin(t * 8 + ph)
	return P({ 46, -4 + sweep * 16 }, { 34, 10 }, 72 + sweep * 6, 86, STILL, STILL, { -20, sweep * 4 })
end
-- a syringe or a bottle: both hands together in front, pressing slowly
MOTIONS.squeeze = function(t, ph)
	local press = 0.5 + 0.5 * sin(t * 1.8 + ph)
	return P({ 40, -6 }, { 40, 6 }, 96 + press * 5, 96 - press * 3, STILL, STILL, { -20, 0 })
end
-- a soldering iron or a probe: very steady, close over the board
MOTIONS.solder = function(t, ph)
	return P({ 50 + sin(t * 5 + ph) * 0.8, -10 + cos(t * 4.3 + ph) * 0.8 }, { 46, 10 }, 78, 84, { sin(t * 3) * 3, 0 }, STILL, { -26, 0 })
end
-- a spudger: levering something open, the left hand holding it down
MOTIONS.pry = function(t, ph)
	local lever = sin(t * 3.5 + ph)
	return P({ 44 + lever * 3, -12 }, { 34, 12 }, 75 + lever * 5, 86, { lever * 10, 0 }, STILL, { -20, 0 })
end
-- both hands reaching in and pulling back out: a part, a cable, a latch, the lid
MOTIONS.grab = function(t, ph)
	local m = 0.5 + 0.5 * sin(t * 2.2 + ph)
	return P({ 30 + m * 28, -8 }, { 30 + m * 28, 8 }, 88 - m * 22, 88 - m * 22, STILL, STILL, { -14, 0 })
end
-- a slow version of the same, for shelves
MOTIONS.stock = function(t, ph)
	local m = 0.5 + 0.5 * sin(t * 1.2 + ph)
	return P({ 20 + m * 40, -6 }, { 20 + m * 40, 6 }, 70 - m * 18, 70 - m * 18, STILL, STILL, { -8, sin(t * 0.5 + ph) * 12 })
end
-- a magnifier held up to the eye, the other hand on the case
MOTIONS.look = function(t, ph)
	return P({ 58, -6 }, { 28, 8 }, 104 + sin(t * 0.8) * 2, 70, STILL, STILL, { -6 + sin(t * 0.6 + ph) * 3, sin(t * 0.5 + ph) * 10 })
end
-- standing at a counter: the hands low on the till and the keyboard, now and then a look up
MOTIONS.register = function(t, ph)
	local tap, tap2 = sin(t * 9 + ph) * 2.5, sin(t * 7.3 + ph * 1.7) * 2.5
	return P({ 24 + tap, -6 }, { 24 + tap2, 6 }, 66 + tap2, 66 + tap, { sin(t * 18 + ph) * 5, 0 }, { sin(t * 15 + ph) * 5, 0 }, { -10 + max(0, sin(t * 0.5 + ph)) * 12, sin(t * 0.5 + ph) * 12 })
end
-- creeping about: crouched low (the hips forward, the knees bent, the body leaning over them), the
-- hands held ready, the head turning to see who is watching. (The server lowers the person by the
-- same much: Crouch.)
MOTIONS.sneak = function(t, ph)
	return P({ 20, -4 }, { 20, 4 }, 52, 52, STILL, STILL, { 22 + sin(t * 0.8 + ph) * 4, sin(t * 1.1 + ph) * 38 }, -30, { 38, -72 })
end
-- reaching into a till or a drawer: quick hands in and out, bent over it, glancing sideways
MOTIONS.rummage = function(t, ph)
	local m = 0.5 + 0.5 * sin(t * 3.4 + ph)
	return P({ 34 + m * 26, -6 }, { 26 + m * 16, 6 }, 82 - m * 24, 70, STILL, STILL, { -4 + max(0, sin(t * 1.3)) * 8, sin(t * 1.7 + ph) * 30 }, -26, { 38, -72 })
end
-- wiping a surface in wide strokes
MOTIONS.wipe = function(t, ph)
	local s = sin(t * 4 + ph)
	return P({ 38, -4 + s * 18 }, { 20, 6 }, 52 + s * 6, 30, STILL, STILL, { -18, s * 6 })
end

-- what the hands do for each repair action (RepairRules); anything else is tinkering
DriverPose.KIND = {
	unscrew = "twist",
	screw = "twist",
	blow_dust = "spray",
	brush = "brush",
	apply_paste = "squeeze",
	clean_paste = "squeeze",
	clean_liquid = "squeeze",
	solder = "solder",
	desolder = "solder",
	straighten_pins = "solder",
	measure = "solder",
	pry = "pry",
	peel = "pry",
	remove = "grab",
	install = "grab",
	plug = "grab",
	unplug = "grab",
	open_latch = "grab",
	close_latch = "grab",
	lid = "grab",
	flip = "grab",
	discard = "grab",
	tie_cables = "grab",
	press_power = "grab",
	wear_strap = "grab",
	inspect = "look",
	thermal_view = "look",
	software = "type",
	post_code = "type",
	psu_test = "type",
	stress = "type",
}

-- The kind of motion for a doing (an action, or a motion's own name such as "register").
function DriverPose.kindOf(doing: string?): string?
	if not doing or doing == "" then
		return nil
	end
	return DriverPose.KIND[doing] or (if MOTIONS[doing] then doing else "type")
end

function DriverPose.kinds(): { string }
	local out = {}
	for k in MOTIONS do
		table.insert(out, k)
	end
	table.sort(out)
	return out
end

-- The pose at time t (seconds); phase makes each person move differently.
function DriverPose.workPose(kind: string?, t: number, phase: number): Pose
	local f = MOTIONS[kind or "type"] or MOTIONS.type
	return f(t, phase)
end

-- Between two poses (a is nil at the start: the pose is taken as it is).
function DriverPose.blend(a: Pose?, b: Pose, k: number): Pose
	if not a then
		return b
	end
	local function mix(x: number, y: number): number
		return x + (y - x) * k
	end
	local function mixList(x: { number }, y: { number }): { number }
		local out = {}
		for i = 1, #y do
			out[i] = mix(x[i] or 0, y[i])
		end
		return out
	end
	return {
		rs = mixList(a.rs, b.rs),
		ls = mixList(a.ls, b.ls),
		re = mix(a.re, b.re),
		le = mix(a.le, b.le),
		rw = mixList(a.rw, b.rw),
		lw = mixList(a.lw, b.lw),
		neck = mixList(a.neck, b.neck),
		waist = mix(a.waist or 0, b.waist or 0),
		hip = mix(a.hip or 0, b.hip or 0),
		knee = mix(a.knee or 0, b.knee or 0),
	}
end

function DriverPose.set(j: Joints?, p: Pose)
	if not j or not j.rs or not j.ls then
		return
	end
	put(j, "rs", CFrame.Angles(p.rs[1], p.rs[2], p.rs[3] or 0))
	put(j, "ls", CFrame.Angles(p.ls[1], p.ls[2], p.ls[3] or 0))
	if j.re and j.le then
		put(j, "re", CFrame.Angles(p.re, 0, 0))
		put(j, "le", CFrame.Angles(p.le, 0, 0))
	end
	if j.rw then
		put(j, "rw", CFrame.Angles(p.rw[1], p.rw[2], p.rw[3] or 0))
	end
	if j.lw then
		put(j, "lw", CFrame.Angles(p.lw[1], p.lw[2], p.lw[3] or 0))
	end
	if j.neck then
		put(j, "neck", CFrame.Angles(p.neck[1], p.neck[2], 0))
	end
	if j.waist then
		put(j, "waist", CFrame.Angles(p.waist or 0, 0, 0))
	end
	-- the legs: only a pose that asks for it (a crouch) touches them
	if j.rh and j.lh then
		put(j, "rh", if (p.hip or 0) ~= 0 then CFrame.Angles(p.hip, 0, 0) else nil)
		put(j, "lh", if (p.hip or 0) ~= 0 then CFrame.Angles(p.hip, 0, 0) else nil)
	end
	if j.rk and j.lk then
		put(j, "rk", if (p.knee or 0) ~= 0 then CFrame.Angles(p.knee, 0, 0) else nil)
		put(j, "lk", if (p.knee or 0) ~= 0 then CFrame.Angles(p.knee, 0, 0) else nil)
	end
end

-- Somebody working at a bench: t is the time in seconds, phase makes each person move differently,
-- kind is one of DriverPose.kinds() (default: typing).
function DriverPose.work(j: Joints?, t: number, phase: number, kind: string?)
	if not j or not j.rs or not j.ls then
		return
	end
	DriverPose.set(j, DriverPose.workPose(kind, t, phase))
end

return DriverPose
