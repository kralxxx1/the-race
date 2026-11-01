-- Equipment: the fittings of the city's venues -- gym machines and weights, cinema seats and a
-- popcorn machine, a library table, a hotel luggage cart, a juice bar. Every builder takes `cf` = a
-- spot on the floor whose LookVector is the way the person using it faces, builds into `parent`, and
-- returns the model. Parts are chrome and smooth plastic (no dark fabric or rubber, which look like
-- speckled blocks in this lighting), and everything rests on the floor or on something that does.

local B = require(script.Parent.Parent.Util.Builder)

local Equipment = {}
local M = Enum.Material

local STEEL = Color3.fromRGB(196, 200, 208)
local DARK = Color3.fromRGB(44, 46, 52)
local BLACK = Color3.fromRGB(24, 25, 28)

local function nc(extra)
	local t = { CanCollide = false, CanTouch = false }
	if extra then
		for k, v in extra do
			t[k] = v
		end
	end
	return t
end

local function chrome(extra)
	local t = { Reflectance = 0.25 }
	if extra then
		for k, v in extra do
			t[k] = v
		end
	end
	return t
end

-- A seat a person (or a patron) can sit on, hidden inside the padding.
local function seat(parent: Instance, cf: CFrame, name: string?): Seat
	local s = Instance.new("Seat")
	s.Name = name or "Seat"
	s.Anchored = true
	s.Transparency = 1
	s.CanCollide = false
	s.CanQuery = false
	s.CanTouch = false
	s.Size = Vector3.new(1.6, 0.4, 1.6)
	s.CFrame = cf
	s.Parent = parent
	return s
end
Equipment.seat = seat

-- A treadmill: a deck with a belt and side rails, two uprights with a console and hand rails in front.
-- The runner stands on the belt looking along cf.LookVector.
function Equipment.treadmill(parent: Instance, cf: CFrame): Model
	local m = B.model("Treadmill", parent)
	B.box(m, cf * CFrame.new(0, 0.5, 0), Vector3.new(2.8, 0.8, 6.4), DARK, M.SmoothPlastic)
	B.box(m, cf * CFrame.new(0, 0.93, 0.1), Vector3.new(2.1, 0.12, 5.4), Color3.fromRGB(36, 38, 42), M.SmoothPlastic, nc({ Name = "Belt" }))
	for k = -2, 2 do
		B.box(m, cf * CFrame.new(0, 1.0, k * 1.0), Vector3.new(2.0, 0.03, 0.12), Color3.fromRGB(90, 94, 104), M.SmoothPlastic, nc({ Name = "BeltLine" }))
	end
	for _, sx in { -1, 1 } do
		B.box(m, cf * CFrame.new(sx * 1.25, 1.0, 0.1), Vector3.new(0.4, 0.4, 5.6), Color3.fromRGB(150, 154, 162), M.SmoothPlastic, nc({ Name = "SideRail" }))
		B.box(m, cf * CFrame.new(sx * 1.2, 2.6, -2.6), Vector3.new(0.28, 3.4, 0.28), STEEL, M.Metal, chrome({ CanCollide = true }))
		B.cyl(m, cf * CFrame.new(sx * 1.2, 3.3, -1.4) * CFrame.Angles(0, math.rad(90), 0), 2.6, 0.22, STEEL, M.Metal, nc(chrome()))
	end
	local console = cf * CFrame.new(0, 4.2, -2.7) * CFrame.Angles(math.rad(20), 0, 0)
	B.box(m, console, Vector3.new(2.6, 1.3, 0.5), BLACK, M.SmoothPlastic, { Name = "Console" })
	local screen = B.box(m, console * CFrame.new(0, 0.1, 0.27), Vector3.new(1.8, 0.8, 0.05), Color3.fromRGB(70, 200, 255), M.Neon, nc({ Name = "Display" }))
	B.sign(screen, Enum.NormalId.Back, "5.2 km/h", { color = Color3.fromRGB(10, 30, 50), glow = true, font = B.Fonts.Mono })
	B.box(m, console * CFrame.new(0.9, -0.5, 0.27), Vector3.new(0.3, 0.18, 0.05), Color3.fromRGB(240, 50, 40), M.Neon, nc({ Name = "StopButton" }))
	return m
end

-- A chest press: a padded seat with a back, two handles at chest height on arms, a stack of weight
-- plates behind with a pin. The user sits facing cf.LookVector.
function Equipment.chestPress(parent: Instance, cf: CFrame): Model
	local m = B.model("ChestPress", parent)
	B.box(m, cf * CFrame.new(0, 0.2, 0.6), Vector3.new(3.2, 0.4, 5.4), DARK, M.Metal)
	B.box(m, cf * CFrame.new(0, 1.55, -0.6), Vector3.new(1.7, 0.45, 1.7), Color3.fromRGB(190, 40, 36), M.SmoothPlastic, { Name = "SeatPad" })
	B.box(m, cf * CFrame.new(0, 1.0, -0.6), Vector3.new(0.5, 1.2, 0.5), STEEL, M.Metal, chrome())
	B.box(m, cf * CFrame.new(0, 3.2, 0.3) * CFrame.Angles(math.rad(-10), 0, 0), Vector3.new(1.7, 3.0, 0.5), Color3.fromRGB(190, 40, 36), M.SmoothPlastic, { Name = "BackPad" })
	B.box(m, cf * CFrame.new(0, 2.4, 0.5), Vector3.new(0.5, 4.4, 0.6), STEEL, M.Metal, chrome())
	for _, sx in { -1, 1 } do
		B.box(m, cf * CFrame.new(sx * 1.55, 3.4, 0.4), Vector3.new(0.3, 0.3, 2.2), DARK, M.Metal, nc())
		B.cyl(m, cf * CFrame.new(sx * 1.55, 3.4, -0.7), 1.0, 0.24, Color3.fromRGB(30, 30, 34), M.SmoothPlastic, nc({ Name = "Handle" }) )
	end
	-- the weight stack
	B.box(m, cf * CFrame.new(0, 3.2, 2.4), Vector3.new(2.2, 6, 0.4), DARK, M.Metal, nc())
	for k = 0, 8 do
		B.box(m, cf * CFrame.new(0, 0.9 + k * 0.5, 2.4), Vector3.new(1.8, 0.4, 1.4), Color3.fromRGB(170, 174, 182), M.Metal, chrome({ Name = "Plate", CanCollide = k == 0 }))
	end
	B.box(m, cf * CFrame.new(0, 5.6, 2.4), Vector3.new(2.4, 0.4, 1.6), BLACK, M.SmoothPlastic, { Name = "Cap" })
	seat(m, cf * CFrame.new(0, 2.3, -0.6), "MachineSeat")
	return m
end

-- A dumbbell rack with a row of dumbbells (small to big) on each of two tiers, facing cf.LookVector.
function Equipment.dumbbellRack(parent: Instance, cf: CFrame): Model
	local m = B.model("DumbbellRack", parent)
	B.box(m, cf * CFrame.new(0, 1.3, 0), Vector3.new(8, 0.3, 1.8), DARK, M.Metal)
	for _, sx in { -3.8, 0, 3.8 } do
		B.box(m, cf * CFrame.new(sx, 0.65, 0), Vector3.new(0.3, 1.3, 1.6), DARK, M.Metal)
	end
	B.box(m, cf * CFrame.new(0, 2.7, 0.3), Vector3.new(8, 0.3, 1.5), DARK, M.Metal)
	B.box(m, cf * CFrame.new(-3.8, 2.0, 0.3), Vector3.new(0.3, 1.4, 1.5), DARK, M.Metal)
	B.box(m, cf * CFrame.new(3.8, 2.0, 0.3), Vector3.new(0.3, 1.4, 1.5), DARK, M.Metal)
	for tier = 0, 1 do
		local y = if tier == 0 then 1.45 else 2.85
		for k = 0, 5 do
			local size = 0.5 + k * 0.1
			local c = cf * CFrame.new(-3.2 + k * 1.3, y + size * 0.5, if tier == 0 then 0 else 0.3)
			B.cyl(m, c, 1.0, 0.14, STEEL, M.Metal, nc(chrome()))
			for _, hx in { -0.5, 0.5 } do
				B.cyl(m, c * CFrame.new(hx, 0, 0), 0.34, size, if k < 3 then Color3.fromRGB(46, 48, 54) else Color3.fromRGB(30, 32, 36), M.Metal, nc({ Name = "Head" }))
			end
		end
	end
	return m
end

-- A squat rack: two uprights with hooks, a barbell with plates on it, safety arms and a pull-up bar.
function Equipment.squatRack(parent: Instance, cf: CFrame): Model
	local m = B.model("SquatRack", parent)
	for _, sx in { -2.4, 2.4 } do
		B.box(m, cf * CFrame.new(sx, 3.8, 0), Vector3.new(0.4, 7.6, 0.4), Color3.fromRGB(210, 52, 40), M.Metal)
		B.box(m, cf * CFrame.new(sx, 0.2, 0), Vector3.new(0.5, 0.4, 4.8), DARK, M.Metal)
		B.box(m, cf * CFrame.new(sx, 2.2, -0.7), Vector3.new(0.3, 0.3, 1.4), STEEL, M.Metal, chrome({ Name = "SafetyArm" }))
	end
	B.box(m, cf * CFrame.new(0, 7.5, 0), Vector3.new(5.2, 0.3, 0.3), STEEL, M.Metal, chrome({ Name = "PullUpBar" }))
	local bar = cf * CFrame.new(0, 5.0, 0)
	B.cyl(m, bar, 8.4, 0.24, STEEL, M.Metal, nc(chrome({ Name = "Barbell" })))
	for _, sx in { -3.7, 3.7 } do
		B.cyl(m, bar * CFrame.new(sx, 0, 0), 0.5, 2.6, BLACK, M.Metal, nc({ Name = "Plate" }))
		B.cyl(m, bar * CFrame.new(sx + (if sx < 0 then -0.5 else 0.5), 0, 0), 0.4, 2.0, Color3.fromRGB(190, 40, 36), M.Metal, nc({ Name = "Plate" }))
	end
	-- (the hooks the bar rests on)
	for _, sx in { -2.4, 2.4 } do
		B.box(m, cf * CFrame.new(sx, 4.8, 0), Vector3.new(0.5, 0.2, 0.6), STEEL, M.Metal, nc())
	end
	return m
end

-- A spin bike: a frame with a flywheel, a seat and handlebars. The rider sits facing cf.LookVector.
function Equipment.spinBike(parent: Instance, cf: CFrame): Model
	local m = B.model("SpinBike", parent)
	B.box(m, cf * CFrame.new(0, 0.2, 0), Vector3.new(2.2, 0.4, 4.4), DARK, M.Metal)
	local frame = Color3.fromRGB(220, 60, 40)
	B.box(m, cf * CFrame.new(0, 2.0, -1.0) * CFrame.Angles(math.rad(-25), 0, 0), Vector3.new(0.4, 3.4, 0.4), frame, M.Metal)
	B.box(m, cf * CFrame.new(0, 2.0, 0.4) * CFrame.Angles(math.rad(35), 0, 0), Vector3.new(0.4, 3.2, 0.4), frame, M.Metal)
	B.cyl(m, cf * CFrame.new(0, 1.6, -1.4) * CFrame.Angles(0, math.rad(90), 0), 0.6, 2.4, Color3.fromRGB(70, 74, 82), M.Metal, nc(chrome({ Name = "Flywheel" })))
	B.box(m, cf * CFrame.new(0, 3.9, 1.1), Vector3.new(1.0, 0.4, 1.8), BLACK, M.SmoothPlastic, { Name = "Saddle" })
	B.box(m, cf * CFrame.new(0, 3.1, 0.9), Vector3.new(0.3, 1.4, 0.3), STEEL, M.Metal, chrome())
	B.box(m, cf * CFrame.new(0, 4.4, -1.1), Vector3.new(0.3, 2.2, 0.3), STEEL, M.Metal, chrome())
	B.cyl(m, cf * CFrame.new(0, 5.4, -1.5) * CFrame.Angles(0, math.rad(90), 0), 2.0, 0.2, STEEL, M.Metal, nc(chrome({ Name = "Handlebar" })))
	for _, sx in { -1, 1 } do
		-- the crank arm down from the flywheel's axle, with the pedal on its foot
		B.box(m, cf * CFrame.new(sx * 0.55, 1.6, -1.4), Vector3.new(0.14, 1.4, 0.14), STEEL, M.Metal, nc(chrome({ Name = "Crank" })))
		B.box(m, cf * CFrame.new(sx * 0.9, 0.86, -1.4), Vector3.new(0.7, 0.16, 1.1), BLACK, M.SmoothPlastic, nc({ Name = "Pedal" }))
	end
	seat(m, cf * CFrame.new(0, 4.5, 1.1), "BikeSeat")
	return m
end

-- A heavy bag hanging from a chain off a ceiling beam; `ceilingY` is where the chain is fixed.
function Equipment.punchingBag(parent: Instance, cf: CFrame, ceilingY: number): Model
	local m = B.model("PunchingBag", parent)
	local top = 8.2
	local chain = ceilingY - top
	B.cylY(m, cf * CFrame.new(0, top + chain / 2, 0), chain + 0.1, 0.16, STEEL, M.Metal, nc(chrome({ Name = "Chain" })))
	B.cylY(m, cf * CFrame.new(0, top - 2.1, 0), 4.2, 1.7, Color3.fromRGB(190, 38, 34), M.SmoothPlastic, { Name = "Bag", Reflectance = 0.08 })
	B.cylY(m, cf * CFrame.new(0, top - 4.2, 0), 0.2, 1.74, BLACK, M.SmoothPlastic, nc())
	B.cylY(m, cf * CFrame.new(0, top - 0.1, 0), 0.3, 1.74, BLACK, M.SmoothPlastic, nc())
	B.cylY(m, cf * CFrame.new(0, top - 2.1, 0), 0.5, 1.76, Color3.fromRGB(250, 250, 244), M.SmoothPlastic, nc({ Name = "Stripe" }))
	-- a rubber pad underneath, so the thing rests on the floor-side too (a base plate)
	B.cylY(m, cf * CFrame.new(0, 0.1, 0), 0.2, 2.4, DARK, M.SmoothPlastic, nc({ Name = "FloorPad" }))
	return m
end

-- A yoga mat with a block and a towel; a patron sits on its seat.
function Equipment.yogaMat(parent: Instance, cf: CFrame, color: Color3?): Model
	local m = B.model("YogaMat", parent)
	local col = color or Color3.fromRGB(70, 150, 220)
	B.box(m, cf * CFrame.new(0, 0.1, 0), Vector3.new(2.4, 0.16, 6.4), col, M.SmoothPlastic, nc({ Name = "Mat" }))
	B.box(m, cf * CFrame.new(0.5, 0.35, 2.5), Vector3.new(0.9, 0.5, 0.6), Color3.fromRGB(230, 214, 170), M.SmoothPlastic, nc({ Name = "Block" }))
	B.box(m, cf * CFrame.new(-0.6, 0.25, 2.7), Vector3.new(0.9, 0.12, 0.7), Color3.fromRGB(246, 246, 240), M.SmoothPlastic, nc({ Name = "Towel" }))
	seat(m, cf * CFrame.new(0, 0.55, 0), "MatSeat")
	return m
end

-- A row of lockers along a wall (the doors face cf.LookVector).
function Equipment.lockers(parent: Instance, cf: CFrame, n: number): Model
	local m = B.model("Lockers", parent)
	for i = 0, n - 1 do
		local c = cf * CFrame.new((i - (n - 1) / 2) * 1.6, 0, 0)
		local col = if i % 2 == 0 then Color3.fromRGB(60, 110, 190) else Color3.fromRGB(70, 74, 82)
		B.box(m, c * CFrame.new(0, 3.2, 0), Vector3.new(1.5, 6.4, 1.8), col, M.Metal, chrome({ Reflectance = 0.1, Name = "Locker" }))
		for k = 0, 2 do
			B.box(m, c * CFrame.new(0, 5.6 - k * 0.2, -0.92), Vector3.new(0.9, 0.06, 0.04), Color3.fromRGB(20, 22, 26), M.SmoothPlastic, nc({ Name = "Vent" }))
		end
		B.box(m, c * CFrame.new(0.5, 3.4, -0.94), Vector3.new(0.1, 0.5, 0.08), STEEL, M.Metal, nc(chrome({ Name = "Handle" })))
		local number = B.box(m, c * CFrame.new(-0.2, 4.4, -0.93), Vector3.new(0.5, 0.3, 0.03), Color3.fromRGB(240, 240, 236), M.SmoothPlastic, nc({ Name = "Number" }))
		B.sign(number, Enum.NormalId.Front, tostring(i + 1), { color = DARK, font = B.Fonts.Heavy })
	end
	return m
end

-- A water cooler: a cabinet with a blue jug on top, a tap and a cup holder.
function Equipment.cooler(parent: Instance, cf: CFrame): Model
	local m = B.model("WaterCooler", parent)
	B.box(m, cf * CFrame.new(0, 1.8, 0), Vector3.new(1.5, 3.6, 1.5), Color3.fromRGB(236, 238, 242), M.SmoothPlastic, { Reflectance = 0.08, Name = "Cabinet" })
	B.cylY(m, cf * CFrame.new(0, 5.0, 0), 2.8, 1.2, Color3.fromRGB(110, 190, 250), M.SmoothPlastic, nc({ Name = "Jug", Transparency = 0.35 }))
	B.cylY(m, cf * CFrame.new(0, 6.5, 0), 0.4, 0.5, Color3.fromRGB(80, 160, 230), M.SmoothPlastic, nc())
	B.box(m, cf * CFrame.new(-0.3, 2.9, -0.78), Vector3.new(0.2, 0.2, 0.3), Color3.fromRGB(70, 150, 240), M.SmoothPlastic, nc({ Name = "Tap" }))
	B.box(m, cf * CFrame.new(0.3, 2.9, -0.78), Vector3.new(0.2, 0.2, 0.3), Color3.fromRGB(230, 70, 60), M.SmoothPlastic, nc({ Name = "Tap" }))
	B.box(m, cf * CFrame.new(0, 2.2, -0.8), Vector3.new(1.0, 0.1, 0.5), STEEL, M.Metal, nc(chrome({ Name = "Drip" })))
	return m
end

-- A wall mirror (a pale reflective panel with a thin frame), `w` wide and `h` tall, facing cf.LookVector.
function Equipment.mirror(parent: Instance, cf: CFrame, w: number, h: number): Model
	local m = B.model("Mirror", parent)
	B.box(m, cf * CFrame.new(0, h / 2, 0), Vector3.new(w, h, 0.2), Color3.fromRGB(196, 214, 226), M.SmoothPlastic, { Reflectance = 0.45, Name = "Glass" })
	B.box(m, cf * CFrame.new(0, 0.1, -0.02), Vector3.new(w + 0.2, 0.2, 0.3), STEEL, M.Metal, nc(chrome({ Name = "FrameBottom" })))
	B.box(m, cf * CFrame.new(0, h - 0.1, -0.02), Vector3.new(w + 0.2, 0.2, 0.3), STEEL, M.Metal, nc(chrome({ Name = "FrameTop" })))
	return m
end

-- A juice bar: a counter with a blender, glasses, a menu board and three stools in front. The bartender
-- stands behind it (+z), customers on the -z side.
function Equipment.juiceBar(parent: Instance, cf: CFrame, w: number, accent: Color3): Model
	local m = B.model("JuiceBar", parent)
	B.box(m, cf * CFrame.new(0, 1.8, 0), Vector3.new(w, 3.6, 2.4), Color3.fromRGB(240, 240, 236), M.SmoothPlastic, { Name = "Counter" })
	B.box(m, cf * CFrame.new(0, 3.7, -0.1), Vector3.new(w + 0.4, 0.2, 2.8), accent, M.SmoothPlastic, { Name = "Top", Reflectance = 0.1 })
	B.box(m, cf * CFrame.new(0, 0.3, -1.25), Vector3.new(w - 0.4, 0.6, 0.1), accent, M.Neon, nc({ Name = "Glow" }))
	-- blenders
	for k = -1, 1, 2 do
		local c = cf * CFrame.new(k * w * 0.25, 3.8, 0.4)
		B.box(m, c * CFrame.new(0, 0.4, 0), Vector3.new(1, 0.8, 1), DARK, M.SmoothPlastic)
		B.cylY(m, c * CFrame.new(0, 1.7, 0), 1.6, 0.9, Color3.fromRGB(220, 235, 245), M.SmoothPlastic, nc({ Name = "Jug", Transparency = 0.4 }))
		B.cylY(m, c * CFrame.new(0, 2.6, 0), 0.25, 1, DARK, M.SmoothPlastic, nc())
	end
	for k = 0, 4 do
		local col = ({ Color3.fromRGB(250, 160, 40), Color3.fromRGB(230, 60, 80), Color3.fromRGB(110, 200, 80), Color3.fromRGB(250, 220, 70), Color3.fromRGB(180, 90, 220) })[k + 1]
		B.cylY(m, cf * CFrame.new(-w / 2 + 2 + k * 0.9, 3.95, -0.6), 0.9, 0.55, col, M.SmoothPlastic, nc({ Name = "Glass", Transparency = 0.15 }))
	end
	local menu = B.box(m, cf * CFrame.new(0, 7.0, 1.6), Vector3.new(w * 0.8, 2.6, 0.2), BLACK, M.SmoothPlastic, nc({ Name = "Menu" }))
	B.sign(menu, Enum.NormalId.Front, "SHAKES • SMOOTHIES • PROTEIN BARS", { color = accent, glow = true })
	B.box(m, cf * CFrame.new(-w * 0.4, 5.6, 1.6), Vector3.new(0.3, 4.4, 0.3), STEEL, M.Metal, nc())
	B.box(m, cf * CFrame.new(w * 0.4, 5.6, 1.6), Vector3.new(0.3, 4.4, 0.3), STEEL, M.Metal, nc())
	for k = -1, 1 do
		local s = cf * CFrame.new(k * 3.2, 0, -3.4)
		B.cylY(m, s * CFrame.new(0, 1.0, 0), 2, 0.3, STEEL, M.Metal, chrome())
		B.cylY(m, s * CFrame.new(0, 2.1, 0), 0.3, 1.5, Color3.fromRGB(190, 40, 36), M.SmoothPlastic, { Name = "StoolTop" })
		B.cylY(m, s * CFrame.new(0, 0.1, 0), 0.2, 1.4, DARK, M.Metal, nc())
	end
	return m
end

-- A cinema seat in rows: a plush seat with a back and two arms, facing cf.LookVector, with a Seat.
function Equipment.cinemaSeat(parent: Instance, cf: CFrame, color: Color3?): Model
	local m = B.model("CinemaSeat", parent)
	local col = color or Color3.fromRGB(150, 24, 40)
	B.box(m, cf * CFrame.new(0, 0.9, 0), Vector3.new(2.6, 1.8, 2.2), DARK, M.SmoothPlastic, { Name = "Base" })
	B.box(m, cf * CFrame.new(0, 2.0, -0.2), Vector3.new(2.2, 0.6, 1.9), col, M.SmoothPlastic, { Name = "Cushion", Reflectance = 0.05 })
	B.box(m, cf * CFrame.new(0, 3.2, 0.85) * CFrame.Angles(math.rad(-8), 0, 0), Vector3.new(2.2, 2.6, 0.5), col, M.SmoothPlastic, { Name = "Back", Reflectance = 0.05 })
	for _, sx in { -1.25, 1.25 } do
		B.box(m, cf * CFrame.new(sx, 2.4, 0), Vector3.new(0.3, 0.3, 2.0), DARK, M.SmoothPlastic, nc({ Name = "Arm" }))
	end
	seat(m, cf * CFrame.new(0, 2.5, -0.2), "CinemaSeat")
	return m
end

-- A popcorn machine on a cart: a red cabinet, a glass cabinet full of popcorn, a striped top, a scoop.
function Equipment.popcorn(parent: Instance, cf: CFrame): Model
	local m = B.model("PopcornMachine", parent)
	local red = Color3.fromRGB(210, 40, 36)
	B.box(m, cf * CFrame.new(0, 1.6, 0), Vector3.new(3.2, 3.2, 2.4), red, M.SmoothPlastic, { Name = "Cart" })
	B.box(m, cf * CFrame.new(0, 3.3, 0), Vector3.new(3.4, 0.2, 2.6), Color3.fromRGB(250, 250, 244), M.SmoothPlastic, nc())
	B.box(m, cf * CFrame.new(0, 5.0, 0), Vector3.new(3.0, 3.2, 2.2), Color3.fromRGB(230, 242, 250), M.SmoothPlastic, { Name = "GlassCase", Transparency = 0.7, Reflectance = 0.15, CanCollide = false })
	for k = 1, 18 do
		local a = k * 2.4
		B.ball(m, cf * CFrame.new(math.cos(a) * 1.0, 3.7 + (k % 5) * 0.28, math.sin(a) * 0.7), 0.5, Color3.fromRGB(250, 240, 200), M.SmoothPlastic, nc({ Name = "Kernel" }))
	end
	for k = 0, 5 do
		B.box(m, cf * CFrame.new(-1.45 + k * 0.58, 6.9, 0), Vector3.new(0.58, 0.8, 2.4), if k % 2 == 0 then red else Color3.fromRGB(250, 250, 244), M.SmoothPlastic, nc({ Name = "Stripe" }))
	end
	B.cylY(m, cf * CFrame.new(0, 7.5, 0), 0.4, 0.3, STEEL, M.Metal, nc(chrome()))
	B.box(m, cf * CFrame.new(1.1, 3.5, -1.0), Vector3.new(0.8, 0.5, 0.6), Color3.fromRGB(170, 120, 60), M.SmoothPlastic, nc({ Name = "Scoop" }))
	return m
end

-- A cinema screen with curtains: a big white screen (a picture on it) between two red curtains.
function Equipment.cinemaScreen(parent: Instance, cf: CFrame, w: number, h: number, title: string): Model
	local m = B.model("CinemaScreen", parent)
	local screen = B.box(m, cf * CFrame.new(0, 3 + h / 2, 0), Vector3.new(w, h, 0.4), Color3.fromRGB(240, 244, 248), M.SmoothPlastic, { Name = "Screen" })
	B.sign(screen, Enum.NormalId.Front, title, { color = Color3.fromRGB(250, 230, 120), glow = true, brightness = 1.3, background = Color3.fromRGB(14, 20, 50), rich = false, font = B.Fonts.Heavy })
	B.box(m, cf * CFrame.new(0, 1.5, 0.3), Vector3.new(w + 6, 3, 2.4), DARK, M.SmoothPlastic, { Name = "Stage" })
	for _, sx in { -1, 1 } do
		B.box(m, cf * CFrame.new(sx * (w / 2 + 1.4), 3 + h / 2 + 0.5, -0.1), Vector3.new(2.8, h + 1.4, 0.8), Color3.fromRGB(150, 24, 40), M.SmoothPlastic, nc({ Name = "Curtain" }))
	end
	B.box(m, cf * CFrame.new(0, 3 + h + 0.9, -0.1), Vector3.new(w + 6, 1.4, 0.9), Color3.fromRGB(120, 18, 32), M.SmoothPlastic, nc({ Name = "Valance" }))
	return m
end

-- A table for four with four chairs (a restaurant, a cafe), a small lamp and a menu on it.
function Equipment.diningTable(parent: Instance, cf: CFrame, accent: Color3): Model
	local m = B.model("DiningTable", parent)
	B.cylY(m, cf * CFrame.new(0, 1.35, 0), 0.2, 3.6, Color3.fromRGB(246, 240, 228), M.SmoothPlastic, { Name = "Top", Reflectance = 0.06 })
	B.cylY(m, cf * CFrame.new(0, 0.7, 0), 1.4, 0.4, DARK, M.Metal)
	B.cylY(m, cf * CFrame.new(0, 0.1, 0), 0.2, 2.0, DARK, M.Metal, nc())
	B.cylY(m, cf * CFrame.new(0, 1.7, 0), 0.5, 0.3, accent, M.SmoothPlastic, nc({ Name = "Vase" }))
	for k = 0, 3 do
		local a = k * math.pi / 2 + math.pi / 4
		local c = cf * CFrame.new(math.cos(a) * 2.5, 0, math.sin(a) * 2.5) * CFrame.Angles(0, math.pi / 2 - a, 0)
		B.box(m, c * CFrame.new(0, 1.5, 0), Vector3.new(1.5, 0.25, 1.5), accent, M.SmoothPlastic, { Name = "ChairSeat" })
		B.box(m, c * CFrame.new(0, 2.4, 0.7), Vector3.new(1.5, 1.8, 0.2), accent, M.SmoothPlastic, { Name = "ChairBack" })
		for _, lx in { -0.6, 0.6 } do
			for _, lz in { -0.6, 0.6 } do
				B.box(m, c * CFrame.new(lx, 0.75, lz), Vector3.new(0.14, 1.5, 0.14), DARK, M.Metal, nc())
			end
		end
		seat(m, c * CFrame.new(0, 1.9, 0), "DinerSeat")
	end
	return m
end

-- A hotel luggage cart: a brass frame on wheels with two suitcases.
function Equipment.luggageCart(parent: Instance, cf: CFrame): Model
	local m = B.model("LuggageCart", parent)
	local brass = Color3.fromRGB(214, 172, 80)
	B.box(m, cf * CFrame.new(0, 0.9, 0), Vector3.new(4, 0.2, 2.4), brass, M.Metal, chrome({ Name = "Deck" }))
	for _, sx in { -1.9, 1.9 } do
		B.box(m, cf * CFrame.new(sx, 3.4, 0), Vector3.new(0.2, 5, 0.2), brass, M.Metal, chrome())
		B.cylY(m, cf * CFrame.new(sx, 0.3, 0.9), 0.5, 0.6, BLACK, M.SmoothPlastic, nc({ Name = "Wheel" }))
		B.cylY(m, cf * CFrame.new(sx, 0.3, -0.9), 0.5, 0.6, BLACK, M.SmoothPlastic, nc({ Name = "Wheel" }))
	end
	B.box(m, cf * CFrame.new(0, 5.9, 0), Vector3.new(4, 0.2, 0.2), brass, M.Metal, chrome())
	B.box(m, cf * CFrame.new(-0.9, 2.1, 0), Vector3.new(1.8, 2.4, 1.6), Color3.fromRGB(110, 36, 40), M.SmoothPlastic, { Name = "Suitcase" })
	B.box(m, cf * CFrame.new(1.0, 1.7, 0), Vector3.new(1.6, 1.6, 1.5), Color3.fromRGB(40, 70, 120), M.SmoothPlastic, { Name = "Suitcase" })
	return m
end

-- A library reading table with a lamp, open books and four chairs.
function Equipment.readingTable(parent: Instance, cf: CFrame): Model
	local m = B.model("ReadingTable", parent)
	B.box(m, cf * CFrame.new(0, 2.8, 0), Vector3.new(7, 0.3, 3.6), Color3.fromRGB(150, 100, 60), M.Wood, { Name = "Top" })
	for _, sx in { -3.2, 3.2 } do
		for _, sz in { -1.5, 1.5 } do
			B.box(m, cf * CFrame.new(sx, 1.3, sz), Vector3.new(0.3, 2.6, 0.3), Color3.fromRGB(70, 46, 30), M.Wood)
		end
	end
	for k = -1, 1, 2 do
		B.box(m, cf * CFrame.new(k * 1.6, 3.0, 0.4), Vector3.new(1.3, 0.1, 0.9), Color3.fromRGB(240, 236, 224), M.SmoothPlastic, nc({ Name = "Book" }))
		B.box(m, cf * CFrame.new(k * 1.6, 3.12, 0.4), Vector3.new(0.05, 0.14, 0.9), Color3.fromRGB(120, 40, 40), M.SmoothPlastic, nc())
	end
	B.box(m, cf * CFrame.new(0, 3.1, -0.6), Vector3.new(0.9, 0.14, 0.9), Color3.fromRGB(30, 90, 60), M.SmoothPlastic, nc({ Name = "LampBase" }))
	B.cylY(m, cf * CFrame.new(0, 3.9, -0.6), 1.5, 0.12, STEEL, M.Metal, nc(chrome()))
	B.box(m, cf * CFrame.new(0, 4.7, -0.6), Vector3.new(1.4, 0.2, 0.9), Color3.fromRGB(30, 90, 60), M.SmoothPlastic, nc({ Name = "Shade" }))
	for k = 0, 3 do
		local sx = if k < 2 then -1.9 else 1.9
		local sz = if k % 2 == 0 then -2.8 else 2.8
		local c = cf * CFrame.new(sx, 0, sz) * CFrame.Angles(0, if sz < 0 then math.pi else 0, 0)
		B.box(m, c * CFrame.new(0, 1.5, 0), Vector3.new(1.6, 0.25, 1.6), Color3.fromRGB(70, 46, 30), M.Wood, { Name = "ChairSeat" })
		B.box(m, c * CFrame.new(0, 2.5, 0.75), Vector3.new(1.6, 1.8, 0.2), Color3.fromRGB(70, 46, 30), M.Wood, { Name = "ChairBack" })
		for _, lx in { -0.65, 0.65 } do
			for _, lz in { -0.65, 0.65 } do
				B.box(m, c * CFrame.new(lx, 0.75, lz), Vector3.new(0.16, 1.5, 0.16), Color3.fromRGB(70, 46, 30), M.Wood, nc())
			end
		end
		seat(m, c * CFrame.new(0, 1.9, 0), "ReadSeat")
	end
	return m
end

return Equipment
