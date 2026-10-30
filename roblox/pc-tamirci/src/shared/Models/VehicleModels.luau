-- VehicleModels: every buyable vehicle, built from parts with its own silhouette (cars, vans,
-- the dolmuş, pickups, bikes, scooters...). Drivable vehicles get an arcade chassis:
--   Chassis (PrimaryPart, invisible) + four frictionless skid balls touching the road,
--   LinearVelocity "Drive" (plane velocity) and AlignOrientation "Upright" (yaw target),
--   VehicleSeat "Driver", visual wheels on Motor6Ds (the client spins and steers them).
-- Local frame: origin on the ground under the middle of the vehicle, forward = -Z.

local B = require(script.Parent.Parent.Util.Builder)
local Assets = require(script.Parent.Parent.Util.Assets)

local VehicleModels = {}
local M = Enum.Material

local GLASS = Color3.fromRGB(40, 52, 64)
local BLACK = Color3.fromRGB(24, 24, 26)
local CHROME = Color3.fromRGB(196, 198, 204)
local TIRE = Color3.fromRGB(26, 26, 28)
local RIM = Color3.fromRGB(176, 180, 186)

-- Car silhouettes: length, width, ground clearance, body height, cabin height, wheel radius,
-- wheelbase, hood length, trunk length, roof inset
local CARS = {
	classic = { L = 13.4, W = 5.7, g = 0.8, hb = 2.0, hc = 1.9, wr = 1.05, wb = 7.8, hood = 3.4, trunk = 2.8, inset = 0.25 },
	wagon = { L = 14.2, W = 5.7, g = 0.8, hb = 2.0, hc = 2.0, wr = 1.05, wb = 8.2, hood = 3.4, trunk = 0.6, inset = 0.2 },
	hatch = { L = 11.6, W = 5.5, g = 0.8, hb = 1.9, hc = 2.0, wr = 1.0, wb = 7.2, hood = 2.8, trunk = 0.5, inset = 0.3 },
	sedan = { L = 14.4, W = 6.0, g = 0.8, hb = 2.0, hc = 1.9, wr = 1.15, wb = 8.6, hood = 3.6, trunk = 2.8, inset = 0.4 },
	van = { L = 15.4, W = 6.4, g = 1.0, hb = 2.4, hc = 3.4, wr = 1.2, wb = 9.4, hood = 2.0, trunk = 0, inset = 0.1 },
	minibus = { L = 17.6, W = 6.6, g = 1.0, hb = 2.4, hc = 3.6, wr = 1.25, wb = 10.4, hood = 1.4, trunk = 0, inset = 0.05 },
	pickup = { L = 15.8, W = 6.4, g = 1.4, hb = 2.3, hc = 2.2, wr = 1.4, wb = 9.4, hood = 3.6, trunk = 5.6, inset = 0.25, bed = true },
	suv = { L = 15.0, W = 6.4, g = 1.4, hb = 2.4, hc = 2.4, wr = 1.4, wb = 9.0, hood = 3.4, trunk = 0.8, inset = 0.25, rails = true },
	electric = { L = 14.6, W = 6.1, g = 0.8, hb = 1.9, hc = 1.9, wr = 1.15, wb = 9.0, hood = 3.4, trunk = 2.4, inset = 0.5, smooth = true },
	coupe = { L = 14.0, W = 6.1, g = 0.7, hb = 1.8, hc = 1.6, wr = 1.15, wb = 8.4, hood = 4.4, trunk = 2.4, inset = 0.6 },
	limo = { L = 24.0, W = 6.2, g = 0.8, hb = 2.0, hc = 2.0, wr = 1.15, wb = 17.0, hood = 3.8, trunk = 3.0, inset = 0.3 },
	super = { L = 14.6, W = 6.6, g = 0.55, hb = 1.6, hc = 1.4, wr = 1.2, wb = 8.8, hood = 4.8, trunk = 3.0, inset = 0.9, wedge = true },
}

-- Two-wheelers: wheel radius, wheelbase, seat height
local BIKES = {
	bicycle = { wr = 1.25, wb = 3.6, seat = 3.2 },
	escooter = { wr = 0.45, wb = 3.0, seat = 0.6 },
	moped = { wr = 0.85, wb = 3.6, seat = 2.4 },
	vespa = { wr = 0.75, wb = 3.6, seat = 2.4 },
	enduro = { wr = 1.25, wb = 4.6, seat = 3.3 },
	naked = { wr = 1.05, wb = 4.4, seat = 2.6 },
	chopper = { wr = 1.1, wb = 5.6, seat = 2.1 },
	sport = { wr = 1.05, wb = 4.4, seat = 2.7 },
}

local function c3(t): Color3
	return if typeof(t) == "Color3" then t else Color3.fromRGB(t[1], t[2], t[3])
end

local function vis(m: Model, cf: CFrame, size: Vector3, color, mat: Enum.Material?, extra: { [string]: any }?): BasePart
	local props = { CanCollide = false, CanTouch = false, CanQuery = false }
	if extra then
		for k, v in extra do
			props[k] = v
		end
	end
	return B.box(m, cf, size, color, mat or M.SmoothPlastic, props)
end

local function wedge(m: Model, cf: CFrame, size: Vector3, color, mat: Enum.Material?, extra: { [string]: any }?): BasePart
	local props = { CanCollide = false, CanTouch = false, CanQuery = false }
	if extra then
		for k, v in extra do
			props[k] = v
		end
	end
	return B.wedge(m, cf, size, color, mat or M.SmoothPlastic, props)
end

local function plate(m: Model, cf: CFrame, text: string)
	local p = vis(m, cf, Vector3.new(1.6, 0.4, 0.06), Color3.fromRGB(240, 240, 236), M.SmoothPlastic, { Name = "Plate" })
	vis(m, cf * CFrame.new(-0.72, 0, -0.035), Vector3.new(0.16, 0.38, 0.02), Color3.fromRGB(30, 60, 170), M.SmoothPlastic)
	B.sign(p, Enum.NormalId.Front, text, { color = Color3.fromRGB(20, 20, 20), font = B.Fonts.Mono, pixelsPerStud = 80 })
	return p
end

local function light(m: Model, cf: CFrame, size: Vector3, color: Color3, kind: string): BasePart
	local p = vis(m, cf, size, color, M.Neon, { Name = kind, CastShadow = false })
	p:AddTag(kind)
	return p
end

local function wheel(m: Model, cf: CFrame, r: number, width: number, front: boolean, name: string): BasePart
	local tire = B.cyl(m, cf, width, r * 2, TIRE, M.Rubber, { CanCollide = false, CanTouch = false, CanQuery = false, Name = name })
	tire:SetAttribute("Wheel", true)
	tire:SetAttribute("Front", front)
	tire:SetAttribute("Radius", r)
	-- the rim is welded to the tire so it spins with it
	local rim = B.cyl(m, cf, width + 0.04, r * 1.2, RIM, M.Metal, { CanCollide = false, CanTouch = false, CanQuery = false, Name = name .. "Rim" })
	rim:SetAttribute("RimOf", name)
	for k = 0, 2 do
		B.box(m, cf * CFrame.Angles(k * math.pi / 3, 0, 0), Vector3.new(width + 0.06, r * 1.1, 0.12), Color3.fromRGB(150, 152, 158), M.Metal, { CanCollide = false, CanTouch = false, CanQuery = false, Name = name .. "Spoke" }):SetAttribute("RimOf", name)
	end
	return tire
end

----------------------------------------------------------------------------------------------------
-- Cars
----------------------------------------------------------------------------------------------------
local function buildCar(m: Model, cf: CFrame, def, color: Color3, plateText: string)
	local S = CARS[def.body] or CARS.sedan
	local L, W, g, hb, hc = S.L, S.W, S.g, S.hb, S.hc
	local yb = g + hb / 2
	local trim = color:Lerp(Color3.new(0, 0, 0), 0.55)
	-- lower body
	local body = vis(m, cf * CFrame.new(0, yb, 0), Vector3.new(W, hb, L), color, M.SmoothPlastic, { Name = "Body" })
	body:AddTag("CarPaint")
	-- nose and tail shaping
	if S.wedge then
		wedge(m, cf * CFrame.new(0, g + hb + 0.25, -L / 2 + S.hood / 2) * CFrame.Angles(0, 0, 0), Vector3.new(W * 0.96, 0.5, S.hood), color, M.SmoothPlastic)
	else
		vis(m, cf * CFrame.new(0, g + hb + 0.06, -L / 2 + S.hood / 2), Vector3.new(W * 0.97, 0.12, S.hood), color, M.SmoothPlastic, { Name = "Hood" })
	end
	-- cabin
	local cabinL = L - S.hood - S.trunk
	local cz = -L / 2 + S.hood + cabinL / 2
	local yc = g + hb + hc / 2
	local roofW = W - S.inset * 2
	if S.bed then
		cabinL = L - S.hood - S.trunk
	end
	-- pillars + glass: the cabin is glass with a painted roof
	vis(m, cf * CFrame.new(0, yc, cz), Vector3.new(roofW, hc, cabinL - 1.2), GLASS, M.Glass, { Name = "Windows", Transparency = 0.25 })
	vis(m, cf * CFrame.new(0, g + hb + hc + 0.1, cz), Vector3.new(roofW, 0.2, cabinL - 1.2), color, M.SmoothPlastic, { Name = "Roof" }):AddTag("CarPaint")
	-- slanted windscreen and rear window
	-- wedges are tall at +Z: the windscreen slopes down to the hood, the rear glass to the trunk
	wedge(m, cf * CFrame.new(0, yc, cz - (cabinL - 1.2) / 2 - 0.6), Vector3.new(roofW, hc, 1.2), GLASS, M.Glass, { Transparency = 0.2, Name = "Windscreen" })
	if S.trunk > 0.3 then
		wedge(m, cf * CFrame.new(0, yc, cz + (cabinL - 1.2) / 2 + 0.6) * CFrame.Angles(0, math.pi, 0), Vector3.new(roofW, hc, 1.2), GLASS, M.Glass, { Transparency = 0.2 })
	else
		vis(m, cf * CFrame.new(0, yc, cz + (cabinL - 1.2) / 2 + 0.3), Vector3.new(roofW, hc, 0.6), GLASS, M.Glass, { Transparency = 0.2 })
	end
	-- pillars (B pillar) and door lines
	for _, s in { -1, 1 } do
		vis(m, cf * CFrame.new(s * (roofW / 2 + 0.01), yc, cz), Vector3.new(0.06, hc, 0.4), color, M.SmoothPlastic)
		vis(m, cf * CFrame.new(s * (W / 2 + 0.01), yb + 0.2, cz), Vector3.new(0.04, hb * 0.8, 0.06), trim)
		vis(m, cf * CFrame.new(s * (W / 2 + 0.02), yb + hb * 0.25, cz - 0.6), Vector3.new(0.06, 0.12, 0.5), CHROME, M.Metal)
		-- mirrors
		vis(m, cf * CFrame.new(s * (W / 2 + 0.25), g + hb + 0.35, cz - cabinL / 2 + 0.4), Vector3.new(0.5, 0.35, 0.5), color, M.SmoothPlastic)
	end
	-- pickup bed
	if S.bed then
		local bz = L / 2 - S.trunk / 2
		vis(m, cf * CFrame.new(0, g + hb + 0.02, bz), Vector3.new(W * 0.9, 0.06, S.trunk - 0.4), BLACK)
		for _, s in { -1, 1 } do
			vis(m, cf * CFrame.new(s * (W / 2 - 0.15), g + hb + 0.5, bz), Vector3.new(0.3, 1, S.trunk), color):AddTag("CarPaint")
		end
		vis(m, cf * CFrame.new(0, g + hb + 0.5, L / 2 - 0.15), Vector3.new(W, 1, 0.3), color):AddTag("CarPaint")
	end
	-- roof rails / taxi-style sign / minibus extras
	if S.rails then
		for _, s in { -1, 1 } do
			vis(m, cf * CFrame.new(s * roofW * 0.4, g + hb + hc + 0.32, cz), Vector3.new(0.15, 0.15, cabinL - 1.6), CHROME, M.Metal)
		end
	end
	if def.body == "minibus" then
		local sign = vis(m, cf * CFrame.new(0, g + hb + hc + 0.55, cz - cabinL * 0.3), Vector3.new(2.6, 0.7, 0.8), Color3.fromRGB(240, 240, 240))
		B.sign(sign, Enum.NormalId.Front, "SHUTTLE", { color = Color3.fromRGB(200, 30, 30), font = B.Fonts.Heavy })
	end
	if def.livery then
		local panel = vis(m, cf * CFrame.new(W / 2 + 0.03, yc, cz + 0.6), Vector3.new(0.02, hc * 0.8, cabinL * 0.7), color, M.SmoothPlastic)
		B.sign(panel, Enum.NormalId.Right, "🔧 PC REPAIR SERVICE", { color = Color3.fromRGB(20, 60, 160), font = B.Fonts.Heavy })
		local panel2 = vis(m, cf * CFrame.new(-W / 2 - 0.03, yc, cz + 0.6), Vector3.new(0.02, hc * 0.8, cabinL * 0.7), color, M.SmoothPlastic)
		B.sign(panel2, Enum.NormalId.Left, "🔧 PC REPAIR SERVICE", { color = Color3.fromRGB(20, 60, 160), font = B.Fonts.Heavy })
	end
	if def.spoiler then
		vis(m, cf * CFrame.new(0, g + hb + 0.8, L / 2 - 0.5), Vector3.new(W * 0.9, 0.12, 0.9), trim)
		for _, s in { -1, 1 } do
			vis(m, cf * CFrame.new(s * W * 0.35, g + hb + 0.4, L / 2 - 0.5), Vector3.new(0.15, 0.7, 0.3), trim)
		end
	end
	-- bumpers, grille, lights, plates
	local bump = if S.smooth then color else Color3.fromRGB(40, 40, 44)
	vis(m, cf * CFrame.new(0, g + 0.35, -L / 2 - 0.12), Vector3.new(W, 0.7, 0.3), bump)
	vis(m, cf * CFrame.new(0, g + 0.35, L / 2 + 0.12), Vector3.new(W, 0.7, 0.3), bump)
	if not S.smooth then
		vis(m, cf * CFrame.new(0, g + hb * 0.62, -L / 2 - 0.03), Vector3.new(W * 0.45, hb * 0.38, 0.06), BLACK, M.DiamondPlate, { Name = "Grille" })
	else
		light(m, cf * CFrame.new(0, g + hb * 0.75, -L / 2 - 0.04), Vector3.new(W * 0.8, 0.1, 0.06), Color3.fromRGB(220, 240, 255), "Headlight")
	end
	for _, s in { -1, 1 } do
		light(m, cf * CFrame.new(s * (W / 2 - 0.7), g + hb * 0.72, -L / 2 - 0.04), Vector3.new(1.0, 0.4, 0.08), Color3.fromRGB(255, 252, 230), "Headlight")
		light(m, cf * CFrame.new(s * (W / 2 - 0.6), g + hb * 0.7, L / 2 + 0.04), Vector3.new(0.9, 0.35, 0.08), Color3.fromRGB(220, 20, 30), "Taillight")
	end
	plate(m, cf * CFrame.new(0, g + 0.45, -L / 2 - 0.3) * CFrame.Angles(0, 0, 0), plateText)
	plate(m, cf * CFrame.new(0, g + 0.9, L / 2 + 0.3) * CFrame.Angles(0, math.pi, 0), plateText)
	-- wheel arches
	for _, z in { -S.wb / 2, S.wb / 2 } do
		for _, s in { -1, 1 } do
			vis(m, cf * CFrame.new(s * (W / 2 - 0.02), g + hb * 0.15, z), Vector3.new(0.08, S.wr * 1.4, S.wr * 2.6), BLACK)
		end
	end
	return S
end

----------------------------------------------------------------------------------------------------
-- Two-wheelers
----------------------------------------------------------------------------------------------------
local function tube(m: Model, a: Vector3, b: Vector3, d: number, color, cf: CFrame)
	local wa, wb = (cf * CFrame.new(a)).Position, (cf * CFrame.new(b)).Position
	local len = (wb - wa).Magnitude
	if len < 0.01 then
		return
	end
	local look = CFrame.lookAt((wa + wb) / 2, wb)
	B.cyl(m, look * CFrame.Angles(0, math.pi / 2, 0), len, d, color, M.Metal, { CanCollide = false, CanTouch = false, CanQuery = false })
end

local function buildBike(m: Model, cf: CFrame, def, color: Color3, plateText: string)
	local S = BIKES[def.body] or BIKES.naked
	local wr, wb = S.wr, S.wb
	local fz, rz = -wb / 2, wb / 2
	local dark = Color3.fromRGB(30, 30, 32)
	local body = def.body
	if body == "bicycle" then
		local top = S.seat - 0.2
		tube(m, Vector3.new(0, wr, rz), Vector3.new(0, top, 0.2), 0.14, color, cf)
		tube(m, Vector3.new(0, wr, rz), Vector3.new(0, wr + 0.2, 0.2), 0.14, color, cf)
		tube(m, Vector3.new(0, wr + 0.2, 0.2), Vector3.new(0, top, 0.2), 0.16, color, cf)
		tube(m, Vector3.new(0, top, 0.2), Vector3.new(0, top + 0.1, fz + 0.6), 0.16, color, cf)
		tube(m, Vector3.new(0, wr + 0.2, 0.2), Vector3.new(0, top + 0.1, fz + 0.6), 0.16, color, cf)
		tube(m, Vector3.new(0, wr, fz), Vector3.new(0, top + 0.6, fz + 0.5), 0.12, CHROME, cf)
		vis(m, cf * CFrame.new(0, top + 0.6, fz + 0.5), Vector3.new(1.8, 0.1, 0.1), dark)
		vis(m, cf * CFrame.new(0, S.seat, 0.25), Vector3.new(0.45, 0.15, 0.8), dark, M.Leather)
	elseif body == "escooter" then
		vis(m, cf * CFrame.new(0, wr + 0.15, 0), Vector3.new(0.7, 0.18, wb), dark)
		tube(m, Vector3.new(0, wr + 0.2, fz + 0.2), Vector3.new(0, 3.6, fz + 0.4), 0.14, color, cf)
		vis(m, cf * CFrame.new(0, 3.6, fz + 0.4), Vector3.new(1.4, 0.1, 0.1), dark)
		light(m, cf * CFrame.new(0, 3.2, fz + 0.3), Vector3.new(0.2, 0.2, 0.08), Color3.fromRGB(255, 252, 230), "Headlight")
	else
		-- motorbikes: tank, seat, engine block, forks, lights
		local seatY = S.seat
		vis(m, cf * CFrame.new(0, wr + 0.2, 0.2), Vector3.new(0.9, 1.0, 1.4), Color3.fromRGB(60, 60, 64), M.Metal, { Name = "Engine" })
		if body == "vespa" or body == "moped" then
			vis(m, cf * CFrame.new(0, seatY - 0.55, 0.6), Vector3.new(1.3, 1.0, 2.4), color, M.SmoothPlastic):AddTag("CarPaint")
			vis(m, cf * CFrame.new(0, seatY - 0.2, fz + 0.9), Vector3.new(1.2, 1.9, 0.3), color, M.SmoothPlastic):AddTag("CarPaint")
			vis(m, cf * CFrame.new(0, wr + 0.2, -0.3), Vector3.new(0.9, 0.12, 1.6), dark)
		else
			local tank = vis(m, cf * CFrame.new(0, seatY + 0.1, -0.5), Vector3.new(0.9, 0.7, 1.4), color, M.SmoothPlastic, { Name = "Tank" })
			tank:AddTag("CarPaint")
			if body == "sport" then
				wedge(m, cf * CFrame.new(0, seatY + 0.2, fz + 0.9) * CFrame.Angles(0, math.pi, 0), Vector3.new(1.1, 1.3, 1.4), color, M.SmoothPlastic):AddTag("CarPaint")
				vis(m, cf * CFrame.new(0, seatY - 0.3, -0.4), Vector3.new(1.0, 0.9, 2.4), color, M.SmoothPlastic):AddTag("CarPaint")
			end
		end
		vis(m, cf * CFrame.new(0, seatY, 0.75), Vector3.new(0.8, 0.22, 1.6), dark, M.Leather, { Name = "Saddle" })
		-- forks and bars
		local forkTop = if body == "chopper" then Vector3.new(0, seatY + 1.4, fz + 1.4) else Vector3.new(0, seatY + 0.9, fz + 0.6)
		for _, s in { -0.3, 0.3 } do
			tube(m, Vector3.new(s, wr, fz), forkTop + Vector3.new(s, 0, 0), 0.14, CHROME, cf)
		end
		vis(m, cf * CFrame.new(forkTop) * CFrame.new(0, 0.1, 0), Vector3.new(if body == "chopper" then 2.2 else 1.7, 0.1, 0.1), dark)
		light(m, cf * CFrame.new(forkTop) * CFrame.new(0, -0.25, -0.25), Vector3.new(0.45, 0.45, 0.1), Color3.fromRGB(255, 252, 230), "Headlight")
		light(m, cf * CFrame.new(0, seatY - 0.1, rz - 0.3), Vector3.new(0.35, 0.2, 0.08), Color3.fromRGB(220, 20, 30), "Taillight")
		-- exhaust
		B.cyl(m, cf * CFrame.new(0.55, wr * 0.8, rz - 0.6) * CFrame.Angles(0, math.pi / 2, 0), 1.6, 0.3, CHROME, M.Metal, { CanCollide = false, CanTouch = false, CanQuery = false })
		if def.box then
			local box = vis(m, cf * CFrame.new(0, seatY + 0.8, rz - 0.3), Vector3.new(1.4, 1.2, 1.2), Color3.fromRGB(240, 60, 40), M.SmoothPlastic)
			B.sign(box, Enum.NormalId.Back, "KURYE", { color = Color3.new(1, 1, 1), font = B.Fonts.Heavy })
		end
		plate(m, cf * CFrame.new(0, wr + 0.5, rz + 0.1) * CFrame.Angles(0, math.pi, 0), plateText)
	end
	return S
end

----------------------------------------------------------------------------------------------------
-- Real cars (Roblox's official vehicles, assets/shared/Vehicles.rbxm): body shape -> model, scale
----------------------------------------------------------------------------------------------------
local OFFICIAL = {
	classic = { "Sedan", 0.66 },
	wagon = { "SUV", 0.62 },
	hatch = { "Sedan", 0.6 },
	sedan = { "Sedan", 0.68 },
	electric = { "Sedan", 0.68 },
	van = { "Van", 0.62 },
	minibus = { "Van", 0.7 },
	pickup = { "Pickup", 0.6 },
	suv = { "SUV", 0.68 },
	coupe = { "Sports", 0.68 },
	super = { "Sports", 0.74 },
	police = { "Police", 0.68 },
	offroad = { "Offroad", 0.72 },
}

-- Puts the official car's body and wheels into `m` on `cf`, painted `color`; returns its sizes
-- (nil when the asset library is missing, so the parts-built car is used).
local function buildOfficial(m: Model, cf: CFrame, def, color: Color3, plateText: string)
	local spec = OFFICIAL[def.body]
	if not spec then
		return nil
	end
	local template = Assets.get("Vehicles", spec[1] .. "_white") or Assets.get("Vehicles", spec[1] .. "_std")
	if not template then
		return nil
	end
	local scale = spec[2]
	local kit = template:Clone()
	kit:ScaleTo(scale)
	kit:PivotTo(cf)
	for _, d in kit:GetDescendants() do
		if d:IsA("BasePart") and d:GetAttribute("Paint") then
			d.Color = color
			d:AddTag("CarPaint")
		end
	end
	for _, c in kit:GetChildren() do
		if c.Name ~= "Root" then
			c.Parent = m
		end
	end
	local size = template:GetAttribute("Size") * scale
	local seat = template:GetAttribute("Seat") * scale
	local front, back = template:GetAttribute("Front") * scale, template:GetAttribute("Back") * scale
	-- number plates on the bumpers
	plate(m, cf * CFrame.new(0, 1.1 * scale / 0.68, front - 0.04) * CFrame.Angles(0, 0, 0), plateText)
	plate(m, cf * CFrame.new(0, 1.3 * scale / 0.68, back + 0.04) * CFrame.Angles(0, math.pi, 0), plateText)
	kit:Destroy()
	return {
		wr = template:GetAttribute("Radius") * scale,
		wb = template:GetAttribute("WheelBase") * scale,
		track = template:GetAttribute("Track") * scale,
		W = size.X,
		L = size.Z,
		seat = seat,
	}
end

----------------------------------------------------------------------------------------------------
-- build
----------------------------------------------------------------------------------------------------
-- opts: color (index or {r,g,b}), plate (text), static (display only), owner (UserId)
function VehicleModels.build(parent: Instance?, def, cf: CFrame, opts: { [string]: any }?): Model
	local o = opts or {}
	local m = Instance.new("Model")
	m.Name = def.id
	m:SetAttribute("Vehicle", def.id)
	local color = if typeof(o.color) == "number" then c3(def.colors[o.color] or def.colors[1]) elseif o.color then c3(o.color) else c3(def.colors[1])
	local plateText = o.plate or "34 PC 001"
	local isBike = def.kind ~= "car"
	local real = if isBike then nil else buildOfficial(m, cf, def, color, plateText)
	local S = real or (if isBike then buildBike(m, cf, def, color, plateText) else buildCar(m, cf, def, color, plateText))
	local wr = S.wr
	local wb = S.wb
	local width = if isBike then 0.9 elseif real then real.track + 0.9 else (CARS[def.body] or CARS.sedan).W
	-- wheels (a real car brings its own: Wheel1-4 with their rims)
	if real then
		wr = real.wr
	elseif isBike then
		wheel(m, cf * CFrame.new(0, wr, -wb / 2), wr, if def.body == "bicycle" then 0.18 else 0.5, true, "WheelF")
		wheel(m, cf * CFrame.new(0, wr, wb / 2), wr, if def.body == "bicycle" then 0.18 else 0.55, false, "WheelR")
	else
		for i, p in { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } } do
			wheel(m, cf * CFrame.new(p[1] * (width / 2 - 0.45), wr, p[2] * wb / 2), wr, 0.9, p[2] < 0, "Wheel" .. i)
		end
	end
	-- chassis: the invisible physical body every visual part is welded to
	local chassisSize = Vector3.new(math.max(width - 0.6, 1.4), 1, math.max(wb + wr, 3))
	local chassis = B.box(m, cf * CFrame.new(0, wr * 0.7 + 0.5, 0), chassisSize, Color3.new(1, 0, 1), M.SmoothPlastic, { Name = "Chassis", Transparency = 1, CanTouch = false })
	m.PrimaryPart = chassis
	-- seats
	local seatCf
	if isBike then
		seatCf = cf * CFrame.new(0, S.seat + 0.15, 0.6)
	elseif real then
		seatCf = cf * CFrame.new(real.seat)
	else
		local CS = CARS[def.body] or CARS.sedan
		seatCf = cf * CFrame.new(-CS.W * 0.22, CS.g + CS.hb * 0.55, -CS.L / 2 + CS.hood + 1.4)
	end
	local seat = Instance.new("VehicleSeat")
	seat.Name = "Driver"
	seat.Size = Vector3.new(1.6, 0.3, 1.6)
	seat.CFrame = seatCf
	seat.Transparency = 1
	seat.CanCollide = false
	seat.CanTouch = true
	seat.MaxSpeed = 0
	seat.Torque = 0
	seat.HeadsUpDisplay = false
	seat.Anchored = o.static == true
	seat.Disabled = o.static == true
	seat.Parent = m
	if not isBike and (def.seats or 1) > 1 then
		local CS = CARS[def.body] or CARS.sedan
		local rows = math.min(3, math.ceil((def.seats - 1) / 2) + 1)
		local n = 1
		for r = 0, rows - 1 do
			for _, s in { -1, 1 } do
				if not (r == 0 and s == -1) and n < def.seats then
					n += 1
					local ps = Instance.new("Seat")
					ps.Name = "Passenger"
					ps.Size = Vector3.new(1.6, 0.3, 1.6)
					ps.CFrame = if real
						then cf * CFrame.new(-s * real.seat.X, real.seat.Y, real.seat.Z + r * 2.6 * real.L / 14)
						else cf * CFrame.new(s * CS.W * 0.22, CS.g + CS.hb * 0.55, -CS.L / 2 + CS.hood + 1.4 + r * 2.6)
					ps.Transparency = 1
					ps.CanCollide = false
					ps.Anchored = o.static == true
					ps.Disabled = o.static == true
					ps.Parent = m
				end
			end
		end
	end

	if o.static then
		for _, d in m:GetDescendants() do
			if d:IsA("BasePart") then
				d.Anchored = true
				d.CanCollide = false
			end
		end
		m.Parent = parent
		return m
	end

	-- physics: frictionless skids at the wheel spots carry the vehicle
	local physical = PhysicalProperties.new(0.6, 0, 0, 100, 1)
	chassis.Anchored = false
	chassis.CustomPhysicalProperties = PhysicalProperties.new(1.4, 0, 0, 100, 1)
	local skidX = if isBike then 0.8 else width / 2 - 0.45
	local skids = if isBike then { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } } else { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }
	for i, p in skids do
		local ball = B.ball(m, cf * CFrame.new(p[1] * skidX, wr, p[2] * wb / 2), wr * 2, Color3.new(1, 0, 1), M.SmoothPlastic, { Name = "Skid" .. i, Transparency = 1, CanTouch = false })
		ball.Anchored = false
		ball.CustomPhysicalProperties = physical
	end
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") and d ~= chassis then
			d.Anchored = false
			if not string.match(d.Name, "^Skid") and d.Name ~= "Driver" and d.Name ~= "Passenger" then
				d.Massless = true
				d.CanCollide = false
			end
			if d:GetAttribute("Wheel") then
				-- spin and steer about the chassis' axes at the wheel's centre, whatever way the
				-- tire mesh itself is turned
				local rel = chassis.CFrame:ToObjectSpace(d.CFrame)
				local motor = Instance.new("Motor6D")
				motor.Name = d.Name .. "Motor"
				motor.Part0 = chassis
				motor.Part1 = d
				motor.C0 = CFrame.new(rel.Position)
				motor.C1 = (rel - rel.Position):Inverse()
				motor.Parent = d
			elseif d:GetAttribute("RimOf") then
				local tire = m:FindFirstChild(d:GetAttribute("RimOf"))
				local w = Instance.new("WeldConstraint")
				w.Part0 = tire
				w.Part1 = d
				w.Parent = d
			else
				local w = Instance.new("WeldConstraint")
				w.Part0 = chassis
				w.Part1 = d
				w.Parent = d
			end
		end
	end
	local center = Instance.new("Attachment")
	center.Name = "Center"
	center.Parent = chassis
	local drive = Instance.new("LinearVelocity")
	drive.Name = "Drive"
	drive.Attachment0 = center
	drive.VelocityConstraintMode = Enum.VelocityConstraintMode.Plane
	drive.PrimaryTangentAxis = Vector3.new(1, 0, 0)
	drive.SecondaryTangentAxis = Vector3.new(0, 0, 1)
	drive.RelativeTo = Enum.ActuatorRelativeTo.World
	drive.PlaneVelocity = Vector2.new(0, 0)
	drive.MaxForce = 2e5
	drive.Parent = chassis
	local upright = Instance.new("AlignOrientation")
	upright.Name = "Upright"
	upright.Mode = Enum.OrientationAlignmentMode.OneAttachment
	upright.Attachment0 = center
	upright.CFrame = cf.Rotation
	upright.MaxTorque = 1e7
	upright.Responsiveness = 24
	upright.Parent = chassis
	m:SetAttribute("Speed", def.speed)
	m:SetAttribute("Accel", def.accel)
	m:SetAttribute("Turn", def.turn)
	m:SetAttribute("Bike", isBike)
	m.Parent = parent
	return m
end

return VehicleModels
