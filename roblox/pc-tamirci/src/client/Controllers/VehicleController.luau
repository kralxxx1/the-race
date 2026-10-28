-- VehicleController: driving your car or motorbike, and wheels turning on every vehicle in town.
--
-- The driver's client owns the vehicle's physics (the server hands over network ownership), so it
-- steers it here: throttle/steer come from the VehicleSeat (the default controls fill them in from
-- WASD, a gamepad or the touch thumbstick), the "Drive" LinearVelocity sets the speed along the
-- ground and the "Upright" AlignOrientation sets the heading (and a bike's lean).

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Client = script.Parent.Parent
local Kit = require(Client.UI.Kit)
local Theme = require(Client.UI.Theme)
local App = require(Client.UI.App)
local S = require(Client.Strings)

local VehicleController = {}

local player = Players.LocalPlayer

local driving = nil :: any -- { model, seat, chassis, drive, upright, speed, yaw, lean, max, accel, turn, bike }
local gauge: Frame
local speedLabel: TextLabel
local speedBar
local wheelState: { [Model]: { spin: number, wheels: { { motor: Motor6D, front: boolean, radius: number } } } } = {}

local STUDS_TO_KMH = 1 -- 1 stud ≈ 0.28 m, so studs/s × 3.6 × 0.28 ≈ km/h

local function yawOf(cf: CFrame): number
	local look = cf.LookVector
	return math.atan2(-look.X, -look.Z)
end

local function buildGauge()
	gauge = Kit.panel(App.screen, { Name = "Speedometer", Size = UDim2.fromOffset(240, 92), Position = UDim2.new(0.5, 0, 1, -18), AnchorPoint = Vector2.new(0.5, 1), BackgroundTransparency = 0.15, Visible = false })
	Kit.padding(gauge, 10)
	speedLabel = Kit.label(gauge, "0", { Size = UDim2.new(1, 0, 0, 40), TextSize = 38, FontFace = Theme.heavy, TextXAlignment = Enum.TextXAlignment.Center })
	speedBar = Kit.progress(gauge, { Position = UDim2.fromOffset(0, 44), Size = UDim2.new(1, 0, 0, 8) }, Theme.accent)
	Kit.label(gauge, S.t("drive_hint"), { Position = UDim2.fromOffset(0, 56), Size = UDim2.new(1, 0, 0, 16), TextSize = 12, TextColor3 = Theme.dim, TextXAlignment = Enum.TextXAlignment.Center })
end

-- Parked or gone (checked without touching the possibly destroyed model).
local function vehicleGone(model: Model): boolean
	local folder = Workspace:FindFirstChild("Vehicles")
	return folder == nil or table.find(folder:GetChildren(), model) == nil
end

local function stopDriving()
	if driving then
		local d = driving
		driving = nil
		if not vehicleGone(d.model) then
			d.drive.PlaneVelocity = Vector2.zero
		end
	end
	if gauge then
		gauge.Visible = false
	end
end

local function startDriving(seat: VehicleSeat)
	local model = seat:FindFirstAncestorOfClass("Model")
	local chassis = model and model.PrimaryPart
	if not model or not chassis then
		return
	end
	local drive = chassis:FindFirstChild("Drive") :: LinearVelocity?
	local upright = chassis:FindFirstChild("Upright") :: AlignOrientation?
	if not drive or not upright then
		return
	end
	driving = {
		model = model,
		seat = seat,
		chassis = chassis,
		drive = drive,
		upright = upright,
		speed = 0,
		yaw = yawOf(chassis.CFrame),
		lean = 0,
		max = model:GetAttribute("Speed") or 60,
		accel = model:GetAttribute("Accel") or 25,
		turn = model:GetAttribute("Turn") or 2.5,
		bike = model:GetAttribute("Bike") == true,
	}
	gauge.Visible = true
end

-- One physics step for the vehicle you're driving.
local function drive(dt: number)
	local d = driving
	if vehicleGone(d.model) then
		stopDriving()
		return
	end
	local throttle = d.seat.ThrottleFloat
	local steer = d.seat.SteerFloat
	local s = d.speed
	-- throttle, brakes and rolling resistance
	if throttle > 0.05 then
		if s < 0 then
			s = math.min(0, s + d.accel * 2.6 * dt)
		else
			s += d.accel * throttle * dt * (1 - 0.55 * s / d.max)
		end
	elseif throttle < -0.05 then
		if s > 0 then
			s = math.max(0, s - d.accel * 2.6 * dt)
		else
			s -= d.accel * 0.6 * -throttle * dt
		end
	else
		local drag = d.accel * 0.35 * dt
		s = if s > 0 then math.max(0, s - drag) else math.min(0, s + drag)
	end
	s = math.clamp(s, -d.max * 0.35, d.max)
	-- hitting a wall: the real speed wins
	local forward = CFrame.Angles(0, d.yaw, 0).LookVector
	local actual = d.chassis.AssemblyLinearVelocity:Dot(forward)
	if math.abs(actual) + 6 < math.abs(s) then
		s = actual + math.sign(s) * 6
	end
	d.speed = s
	-- steering: no turning on the spot, a little less at top speed
	local grip = math.clamp(math.abs(s) / 10, 0, 1) * (1 - 0.45 * math.abs(s) / d.max)
	d.yaw -= steer * d.turn * 0.55 * grip * dt * math.sign(s)
	forward = CFrame.Angles(0, d.yaw, 0).LookVector
	d.drive.PlaneVelocity = Vector2.new(forward.X * s, forward.Z * s)
	local rot = CFrame.Angles(0, d.yaw, 0)
	if d.bike then
		local target = -steer * math.clamp(math.abs(s) / 30, 0, 1) * 0.38
		d.lean += (target - d.lean) * math.min(1, dt * 5)
		rot *= CFrame.Angles(0, 0, d.lean)
	end
	d.upright.CFrame = rot
	-- gauge
	local kmh = math.floor(math.abs(s) * STUDS_TO_KMH + 0.5)
	speedLabel.Text = kmh .. " " .. S.t("kmh")
	speedBar:set(math.abs(s) / d.max)
end

-- Every vehicle's wheels spin with its speed; the front ones follow the driver's steering.
local function wheelsOf(model: Model)
	local st = wheelState[model]
	if st then
		return st
	end
	st = { spin = 0, wheels = {} }
	for _, d in model:GetDescendants() do
		if d:IsA("Motor6D") and d.Part1 and d.Part1:GetAttribute("Wheel") then
			table.insert(st.wheels, { motor = d, front = d.Part1:GetAttribute("Front") == true, radius = d.Part1:GetAttribute("Radius") or 1 })
		end
	end
	wheelState[model] = st
	return st
end

local function animateWheels(dt: number)
	local folder = Workspace:FindFirstChild("Vehicles")
	if not folder then
		return
	end
	local cam = Workspace.CurrentCamera
	local camPos = if cam then cam.CFrame.Position else Vector3.zero
	local seen = {}
	for _, model in folder:GetChildren() do
		seen[model] = true
		if model:IsA("Model") and not model:GetAttribute("Display") then
			local chassis = model.PrimaryPart
			if chassis and (chassis.Position - camPos).Magnitude < 250 then
				local st = wheelsOf(model)
				local v = chassis.AssemblyLinearVelocity:Dot(chassis.CFrame.LookVector)
				local seat = model:FindFirstChild("Driver") :: VehicleSeat?
				local steer = if seat then seat.SteerFloat else 0
				for _, w in st.wheels do
					w.angle = (w.angle or 0) - v / w.radius * dt
					local turn = if w.front then CFrame.Angles(0, -steer * 0.45, 0) else CFrame.identity
					w.motor.Transform = turn * CFrame.Angles(w.angle, 0, 0)
				end
			end
		end
	end
	for model in wheelState do
		if not seen[model] then
			wheelState[model] = nil
		end
	end
end

local function watchCharacter(char: Model)
	local hum = char:WaitForChild("Humanoid", 10) :: Humanoid?
	if not hum then
		return
	end
	hum:GetPropertyChangedSignal("SeatPart"):Connect(function()
		local seat = hum.SeatPart
		if seat and seat:IsA("VehicleSeat") and seat.Name == "Driver" then
			startDriving(seat)
		else
			stopDriving()
		end
	end)
end

function VehicleController.init()
	buildGauge()
	if player.Character then
		task.spawn(watchCharacter, player.Character)
	end
	player.CharacterAdded:Connect(watchCharacter)
	RunService.Heartbeat:Connect(function(dt)
		if driving then
			drive(dt)
		end
	end)
	RunService.RenderStepped:Connect(animateWheels)
end

function VehicleController.driving(): boolean
	return driving ~= nil
end

VehicleController._start = startDriving

return VehicleController
