-- Venues: what is inside the places you can visit -- the gym, the cinema, the diners, the hotel lobby,
-- the library. Each builder fills an enterable hall (Buildings.hall: a real door, a floor, a ceiling)
-- with its equipment (Equipment), puts a ProximityPrompt station on everything you can use (an
-- activity from Data/Activities: ActivityService runs it) and marks the spots where the people of the
-- city (your friends) stand about doing what the place is for: running on a treadmill, lifting, sitting
-- in the cinema, eating, reading. The hall's frame: x across, z from the front wall (0) to the back
-- wall (d), the floor top at y = 0.2; a spot's LookVector is the way the person there faces.

local Shared = script.Parent.Parent
local B = require(Shared.Util.Builder)
local Equipment = require(script.Parent.Equipment)
local Props = require(script.Parent.Props)
local Real = require(script.Parent.RealFurniture)
local Activities = require(Shared.Data.Activities)

local Venues = {}
local M = Enum.Material

local function nc(extra)
	local t = { CanCollide = false, CanTouch = false }
	if extra then
		for k, v in extra do
			t[k] = v
		end
	end
	return t
end

-- A spot on the floor of the hall at (x, z), turned by yaw (0: looking at the front wall, pi: at the back wall).
local function spot(cf: CFrame, x: number, z: number, yaw: number?, y: number?): CFrame
	return cf * CFrame.new(x, y or 0.2, z) * CFrame.Angles(0, yaw or 0, 0)
end

-- A station: an invisible anchor over the equipment that carries the prompt for an activity.
-- Returns the anchor.
function Venues.station(parent: Instance, at: CFrame, activityId: string, size: Vector3?, objectText: string?): BasePart
	local a = Activities.get(activityId)
	assert(a, "no activity " .. activityId)
	local anchor = B.marker(parent, "Station_" .. activityId, at, size or Vector3.new(3, 3, 3))
	anchor:SetAttribute("Activity", activityId)
	anchor:SetAttribute("Venue", a.venue)
	B.prompt(anchor, a.verb.en, objectText or a.name.en, { distance = 9, name = "ActivityPrompt", hold = 0 })
	B.tag(anchor, "ActivityStation")
	return anchor
end

-- A spot where somebody from the city stands (or sits, when `seat` is a Seat part) doing `pose`.
-- pose: a DriverPose motion; anim: "idle", "run", "sit" ...; role: a title for a worker (Trainer, Cashier).
function Venues.patron(parent: Instance, at: CFrame, activityId: string?, pose: string?, anim: string?, role: string?): BasePart
	local p = B.marker(parent, "Patron", at, Vector3.new(1.5, 1, 1.5))
	p:SetAttribute("Pose", pose or "")
	p:SetAttribute("Anim", anim or "idle")
	if activityId then
		p:SetAttribute("Activity", activityId)
	end
	if role then
		p:SetAttribute("Role", role)
	end
	B.tag(p, "PatronSpot")
	return p
end

-- Marks some of a model's seats (those named `seatName`) as places a patron sits, with the chance given.
local function seatPatrons(model: Instance, seatName: string, activityId: string?, pose: string, chance: number, rng: Random)
	for _, d in model:GetDescendants() do
		if d:IsA("Seat") and d.Name == seatName and rng:NextNumber() < chance then
			d:SetAttribute("Patron", true)
			d:SetAttribute("Pose", pose)
			d:SetAttribute("Anim", "sit")
			if activityId then
				d:SetAttribute("Activity", activityId)
			end
			B.tag(d, "PatronSpot")
		end
	end
end

Venues.seatPatrons = seatPatrons

-- A bench you can sit on and relax: a prompt over its seat (ActivityService sits the player down in
-- it), and now and then one of the city's people is sitting there already. Returns the station.
function Venues.benchStation(bench: Instance, rng: Random?): BasePart?
	local seat = bench:FindFirstChild("Seat")
	if not seat or not seat:IsA("Seat") then
		return nil
	end
	local anchor = Venues.station(bench, seat.CFrame * CFrame.new(0, 1.4, 0), "relax", Vector3.new(5.6, 3, 2.6))
	anchor:SetAttribute("SeatName", "Seat")
	if rng then
		seatPatrons(bench, "Seat", "relax", "sit", 0.3, rng)
	end
	return anchor
end

-- A signpost: a wooden post with a board that says what the place is for. `cf` looks the way the
-- people come from; the board is read from there.
function Venues.signpost(parent: Instance, cf: CFrame, text: string, accent: Color3?, w: number?): BasePart
	local width = w or 8
	B.box(parent, cf * CFrame.new(0, 3.2, 0.4), Vector3.new(0.5, 6.4, 0.5), Color3.fromRGB(96, 70, 48), M.Wood, { Name = "Post" })
	local board = B.box(parent, cf * CFrame.new(0, 6.6, 0), Vector3.new(width, 2.2, 0.4), Color3.fromRGB(34, 36, 42), M.SmoothPlastic, nc({ Name = "Poster" }))
	B.box(parent, cf * CFrame.new(0, 7.8, 0.1), Vector3.new(width + 0.4, 0.3, 0.6), Color3.fromRGB(96, 70, 48), M.Wood, nc({ Name = "Cap" }))
	B.sign(board, Enum.NormalId.Front, text, { color = accent or Color3.fromRGB(255, 232, 170), glow = true, brightness = 1.1 })
	return board
end

local function sign(parent: Instance, at: CFrame, w: number, h: number, text: string, color: Color3, bg: Color3?)
	local p = B.box(parent, at, Vector3.new(w, h, 0.3), bg or Color3.fromRGB(24, 25, 30), M.SmoothPlastic, nc({ Name = "Poster" }))
	B.sign(p, Enum.NormalId.Front, text, { color = color, glow = true, brightness = 1.2 })
	return p
end

-- Ceiling lights along the hall: bright strips (and one soft light each), so the inside is never dark.
local function ceilingLights(parent: Instance, cf: CFrame, w: number, d: number, h: number, rows: number, color: Color3?)
	local col = color or Color3.fromRGB(255, 246, 228)
	for r = 1, rows do
		local x = -w / 2 + w * (r - 0.5) / rows
		B.box(parent, cf * CFrame.new(x, h - 0.28, d / 2), Vector3.new(0.7, 0.16, d - 6), col, M.Neon, nc({ Name = "LightStrip", CastShadow = false }))
		for k = 1, math.max(1, math.floor(d / 22)) do
			local l = B.box(parent, cf * CFrame.new(x, h - 0.4, d * k / (math.floor(d / 22) + 1)), Vector3.new(0.4, 0.3, 0.4), col, M.SmoothPlastic, nc({ Transparency = 1, CastShadow = false, Name = "LightAnchor" }))
			B.pointLight(l, 24, 0.5, col, false)
		end
	end
end

----------------------------------------------------------------------------------------------------
-- The gym
----------------------------------------------------------------------------------------------------
function Venues.gym(m: Instance, cf: CFrame, w: number, d: number, h: number, rng: Random)
	-- the floor: a dark rubber mat with the club's colour stripes
	B.box(m, spot(cf, 0, d / 2, 0, 0.21), Vector3.new(w - 2.4, 0.04, d - 2.4), Color3.fromRGB(46, 48, 54), M.SmoothPlastic, nc({ Name = "RubberFloor" }))
	for _, x in { -w / 2 + 3, w / 2 - 3 } do
		B.box(m, spot(cf, x, d / 2, 0, 0.24), Vector3.new(0.5, 0.02, d - 4), Color3.fromRGB(240, 120, 30), M.SmoothPlastic, nc({ Name = "FloorStripe" }))
	end
	ceilingLights(m, cf, w, d, h, 3)
	-- the mirror wall at the back with two TVs above it
	local back = d - 1.2
	for k = -1, 1, 2 do
		Equipment.mirror(m, spot(cf, k * (w / 4), back, 0, 0.2), w / 2 - 3, 8)
	end
	for k = -1, 1, 2 do
		Props.tv(m, cf * CFrame.new(k * (w / 4), 11.3, d - 1.15), if k < 0 then "<b>IRON GYM</b>\n<font size=\"28\">Strong together</font>" else "<b>TODAY</b>\n<font size=\"28\">Leg day • HIIT 6pm</font>")
	end
	-- the front desk (left of the door) with the trainer behind it
	local desk = Props.counter(m, spot(cf, -w / 2 + 11, 7, 0), 11)
	desk.Name = "FrontDesk"
	Props.monitor(m, spot(cf, -w / 2 + 8, 7.2, 0, 4.1), "IRON GYM\nWelcome!", Color3.fromRGB(190, 70, 20), { light = false })
	sign(m, cf * CFrame.new(-w / 2 + 1.15, 8.2, 9) * CFrame.Angles(0, -math.pi / 2, 0), 9, 2, "FRONT DESK • DAY PASS", Color3.fromRGB(250, 160, 50))
	Venues.patron(m, spot(cf, -w / 2 + 11, 9.4, math.pi), nil, "register", "idle", "Trainer")
	-- lockers along the left wall
	Equipment.lockers(m, spot(cf, -w / 2 + 2.1, 24, -math.pi / 2), 10)
	-- the juice bar (right of the door), the water cooler and a little lounge
	local barX = w / 2 - 13
	Equipment.juiceBar(m, spot(cf, barX, 9, 0), 13, Color3.fromRGB(240, 120, 30))
	Venues.station(m, spot(cf, barX, 5.4, 0, 3.4), "shake", Vector3.new(8, 4, 3))
	Venues.patron(m, spot(cf, barX, 11.2, math.pi), nil, "register", "idle", "Barista")
	Equipment.cooler(m, spot(cf, w / 2 - 2.2, 14.5, math.pi / 2))
	Venues.station(m, spot(cf, w / 2 - 3.6, 14.5, 0, 3), "water", Vector3.new(3, 4, 3))
	-- cardio: four treadmills facing the back, three spinning bikes behind them
	for i = 0, 3 do
		local tx = -w / 2 + 11 + i * 5.2
		local t = Equipment.treadmill(m, spot(cf, tx, 17.5, math.pi))
		Venues.station(m, spot(cf, tx, 17.5, math.pi, 2.6), "treadmill", Vector3.new(3, 4, 5))
		if i % 2 == 0 then
			Venues.patron(m, spot(cf, tx, 18.5, math.pi, 1.06), "treadmill", "run", "run")
		end
		t.Name = "Treadmill" .. (i + 1)
	end
	for i = 0, 2 do
		local bx = -w / 2 + 11 + i * 5.2
		local bike = Equipment.spinBike(m, spot(cf, bx, 29, math.pi))
		Venues.station(m, spot(cf, bx, 29, math.pi, 3), "spin_bike", Vector3.new(3, 5, 4))
		bike.Name = "SpinBike" .. (i + 1)
	end
	-- strength: chest presses and a squat rack in the middle, dumbbell racks and a mirror on the right wall
	for i = 0, 1 do
		local px = 6 + i * 7.5
		Equipment.chestPress(m, spot(cf, px, 28, math.pi))
		Venues.station(m, spot(cf, px, 28, math.pi, 3), "bench_press", Vector3.new(4, 5, 5))
	end
	Equipment.squatRack(m, spot(cf, 0, 40, math.pi))
	Venues.station(m, spot(cf, 0, 38, 0, 3), "squat", Vector3.new(6, 5, 4))
	Venues.patron(m, spot(cf, 0, 37.2, math.pi), "squat", "lift", "idle")
	Equipment.mirror(m, spot(cf, w / 2 - 1.15, 26, -math.pi / 2), 26, 8)
	for i = 0, 1 do
		local rz = 21 + i * 12
		Equipment.dumbbellRack(m, spot(cf, w / 2 - 3.4, rz, math.pi / 2))
		Venues.station(m, spot(cf, w / 2 - 6.2, rz, 0, 3), "dumbbells", Vector3.new(4, 4, 6))
		Venues.patron(m, spot(cf, w / 2 - 7.4, rz + 1.5, -math.pi / 2), "dumbbells", "curl", "idle")
	end
	-- boxing in the back left corner: two heavy bags
	for i = 0, 1 do
		local bx = -w / 2 + 9 + i * 8
		B.box(m, cf * CFrame.new(bx, h - 0.45, 40), Vector3.new(0.4, 0.5, 6), Color3.fromRGB(70, 74, 82), M.Metal, nc({ Name = "BagBeam" }))
		Equipment.punchingBag(m, spot(cf, bx, 40, 0), h - 0.65)
		Venues.station(m, spot(cf, bx, 37.4, 0, 3), "punching_bag", Vector3.new(4, 5, 3))
		if i == 0 then
			Venues.patron(m, spot(cf, bx, 37.6, math.pi), "punching_bag", "punch", "idle")
		end
	end
	-- yoga at the back right: mats facing the mirror
	local mats = { Color3.fromRGB(70, 150, 220), Color3.fromRGB(110, 190, 90), Color3.fromRGB(230, 110, 150) }
	for i = 0, 2 do
		local mx = 6 + i * 5
		local mat = Equipment.yogaMat(m, spot(cf, mx, d - 9, math.pi), mats[i + 1])
		Venues.station(m, spot(cf, mx, d - 12.4, 0, 2), "yoga", Vector3.new(3, 3, 3))
		seatPatrons(mat, "MatSeat", "yoga", "stretch", 0.6, rng)
	end
	-- plants and a few posters
	for _, x in { -w / 2 + 3, w / 2 - 3 } do
		Props.plant(m, spot(cf, x, d - 3, 0), rng)
	end
	sign(m, cf * CFrame.new(-w / 2 + 1.15, 9.4, 32) * CFrame.Angles(0, -math.pi / 2, 0), 12, 3, "NO PAIN • NO GAIN", Color3.fromRGB(255, 255, 255), Color3.fromRGB(190, 40, 30))
	sign(m, cf * CFrame.new(-w / 2 + 1.15, 9.4, 18) * CFrame.Angles(0, -math.pi / 2, 0), 9, 3, "LOCKERS", Color3.fromRGB(255, 255, 255), Color3.fromRGB(40, 90, 170))
end

----------------------------------------------------------------------------------------------------
-- The cinema
----------------------------------------------------------------------------------------------------
function Venues.cinema(m: Instance, cf: CFrame, w: number, d: number, h: number, rng: Random)
	ceilingLights(m, cf, w, d, h, 3, Color3.fromRGB(255, 214, 170))
	B.box(m, spot(cf, 0, d / 2, 0, 0.21), Vector3.new(w - 2.4, 0.04, d - 2.4), Color3.fromRGB(70, 22, 34), M.SmoothPlastic, nc({ Name = "Carpet" }))
	-- the foyer: ticket desk on the left, popcorn machine and a snack counter on the right, posters between
	local desk = Props.counter(m, spot(cf, -w / 2 + 10, 8, 0), 10)
	desk.Name = "TicketDesk"
	Props.monitor(m, spot(cf, -w / 2 + 7.5, 8.2, 0, 4.1), "STAR CINEMA\nTickets", Color3.fromRGB(150, 24, 40), { light = false })
	Venues.patron(m, spot(cf, -w / 2 + 10, 10.4, math.pi), nil, "register", "idle", "Cashier")
	Equipment.popcorn(m, spot(cf, w / 2 - 9, 9, 0))
	Venues.station(m, spot(cf, w / 2 - 9, 6, 0, 3), "popcorn", Vector3.new(5, 4, 3))
	Venues.patron(m, spot(cf, w / 2 - 9, 11.3, math.pi), nil, "register", "idle", "Usher")
	for k = -1, 1 do
		sign(m, cf * CFrame.new(k * 11, 9, 1.15), 7, 9, ({ "RAM\nWARS", "BLUE\nSCREEN 2", "THE LAST\nREPAIRMAN" })[k + 2], Color3.new(1, 1, 1), ({ Color3.fromRGB(120, 20, 30), Color3.fromRGB(20, 40, 120), Color3.fromRGB(30, 90, 60) })[k + 2])
	end
	-- the auditorium: a wall divides it from the foyer (with a doorway), the screen at the back, rows of seats on risers
	local wallZ = 16
	for _, side in { -1, 1 } do
		B.box(m, spot(cf, side * (w / 4 + 3), wallZ, 0, h / 2), Vector3.new(w / 2 - 6, h - 0.4, 0.8), Color3.fromRGB(86, 28, 40), M.SmoothPlastic, { Name = "AuditoriumWall" })
	end
	B.box(m, spot(cf, 0, wallZ, 0, h - 2.2), Vector3.new(12, 3.8, 0.8), Color3.fromRGB(86, 28, 40), M.SmoothPlastic, { Name = "AuditoriumLintel" })
	local screenW = math.min(w - 16, 40)
	Equipment.cinemaScreen(m, spot(cf, 0, d - 3.2, 0), screenW, 14, "NOW SHOWING\nThe Last Repairman")
	local rows = 6
	local x0, step = -17.6, 4.2
	for r = 0, rows - 1 do
		local z = 22 + r * 4.6
		if z < d - 14 then
			local rise = r * 0.5
			-- a riser under every row, on the floor
			B.box(m, spot(cf, 0, z, 0, 0.2 + (rise + 0.5) / 2), Vector3.new(w - 6, rise + 0.5, 4.6), Color3.fromRGB(60, 24, 34), M.SmoothPlastic, { Name = "Riser" })
			for k = 0, 8 do
				local x = x0 + k * step
				if math.abs(x) > 1.5 then
					Equipment.cinemaSeat(m, spot(cf, x, z, math.pi, 0.2 + rise + 0.5), if (r + k) % 5 == 0 then Color3.fromRGB(40, 70, 130) else nil)
				end
			end
		end
	end
	-- some seats are taken (a friend of yours watches the film), some let you sit down and watch
	for _, dsc in m:GetDescendants() do
		if dsc:IsA("Model") and dsc.Name == "CinemaSeat" then
			local r = rng:NextNumber()
			if r < 0.42 then
				local st = Venues.station(dsc, dsc:GetPivot() * CFrame.new(0, 3.2, 0), "movie", Vector3.new(2.6, 3, 2.4))
				st:SetAttribute("SeatName", "CinemaSeat")
			elseif r < 0.64 then
				seatPatrons(dsc, "CinemaSeat", "movie", "watch", 1, rng)
			end
		end
	end
	-- wall sconces along the sides of the auditorium
	for _, side in { -1, 1 } do
		for k = 0, 3 do
			B.box(m, spot(cf, side * (w / 2 - 1.2), 24 + k * 8, 0, 7), Vector3.new(0.4, 1.2, 0.8), Color3.fromRGB(255, 190, 120), M.Neon, nc({ Name = "Sconce", CastShadow = false }))
		end
	end
end

----------------------------------------------------------------------------------------------------
-- The places to eat (diner, bakery, pizzeria, fish and chips, ice cream)
----------------------------------------------------------------------------------------------------
local MENUS = {
	meal = { board = "BURGERS • WRAPS • GRILL", counter = "Order a meal" },
	pastry = { board = "FRESH BREAD • PASTRIES", counter = "Order a pastry" },
	pizza = { board = "WOOD-FIRED PIZZA", counter = "Order a slice" },
	fish = { board = "FISH & CHIPS • CALAMARI", counter = "Order fish & chips" },
	icecream = { board = "SCOOPS • SUNDAES • SHAKES", counter = "Order an ice cream" },
}

function Venues.diner(m: Instance, cf: CFrame, w: number, d: number, h: number, rng: Random, dish: string, accent: Color3)
	local menu = MENUS[dish] or MENUS.meal
	ceilingLights(m, cf, w, d, h, 2)
	B.box(m, spot(cf, 0, d / 2, 0, 0.21), Vector3.new(w - 2.4, 0.04, d - 2.4), accent:Lerp(Color3.new(1, 1, 1), 0.78), M.SmoothPlastic, nc({ Name = "Tiles" }))
	-- the counter along the back with the till, the coffee machine and the dish of the house
	local cz = d - 7
	local counter = Props.counter(m, spot(cf, 0, cz, 0), math.min(w - 12, 22), { 240, 238, 232 }, { 54, 56, 62 })
	counter.Name = "Counter"
	Venues.station(m, spot(cf, -4, cz - 3, 0, 3.2), dish, Vector3.new(8, 4, 3))
	Venues.station(m, spot(cf, 6, cz - 3, 0, 3.2), "coffee", Vector3.new(5, 4, 3))
	Real.fit(m, "CoffeeMachine", spot(cf, 6.5, cz, 0, 4.0), 2.2, 2.2, 2.8)
	Props.monitor(m, spot(cf, -8, cz + 0.2, 0, 4.1), "WELCOME\nOpen all day", accent, { light = false })
	Venues.patron(m, spot(cf, 0, cz + 2.8, math.pi), nil, "register", "idle", "Waiter")
	-- the menu board and a shelf of bottles behind the counter
	sign(m, cf * CFrame.new(0, 9.4, d - 1.15), math.min(w - 12, 22), 3.4, menu.board, Color3.fromRGB(255, 244, 220), accent:Lerp(Color3.new(0, 0, 0), 0.5))
	-- tables for four, in two rows
	local tables = math.clamp(math.floor((w - 8) / 10), 2, 4)
	for row = 0, 1 do
		for i = 0, tables - 1 do
			local tx = -w / 2 + (w / tables) * (i + 0.5)
			local tz = 8 + row * 9
			if row == 1 or math.abs(tx) > 7 then
				local t = Equipment.diningTable(m, spot(cf, tx, tz, 0), accent)
				seatPatrons(t, "DinerSeat", dish, "eat", 0.38, rng)
			end
		end
	end
	-- a window bench with a plant, a bin and a poster
	for _, side in { -1, 1 } do
		Props.plant(m, spot(cf, side * (w / 2 - 3), 3, 0), rng)
	end
	sign(m, cf * CFrame.new(-w / 2 + 1.15, 8, d / 2) * CFrame.Angles(0, -math.pi / 2, 0), 8, 4, "TODAY'S SPECIAL", Color3.new(1, 1, 1), accent)
end

----------------------------------------------------------------------------------------------------
-- The hotel lobby
----------------------------------------------------------------------------------------------------
function Venues.hotel(m: Instance, cf: CFrame, w: number, d: number, h: number, rng: Random)
	ceilingLights(m, cf, w, d, h, 3, Color3.fromRGB(255, 232, 196))
	B.box(m, spot(cf, 0, d / 2, 0, 0.21), Vector3.new(w - 2.4, 0.04, d - 2.4), Color3.fromRGB(150, 110, 74), M.SmoothPlastic, nc({ Name = "Marble" }))
	B.box(m, spot(cf, 0, d / 2, 0, 0.23), Vector3.new(w * 0.4, 0.03, d - 6), Color3.fromRGB(120, 24, 40), M.SmoothPlastic, nc({ Name = "Carpet" }))
	-- reception on the right, a luggage cart, sofas on the left, a coffee corner at the back
	local desk = Props.counter(m, spot(cf, w / 2 - 12, d - 8, 0), 12, { 120, 84, 50 }, { 220, 190, 120 })
	desk.Name = "Reception"
	Venues.station(m, spot(cf, w / 2 - 12, d - 11, 0, 3.4), "nap", Vector3.new(8, 4, 3))
	Props.monitor(m, spot(cf, w / 2 - 15, d - 7.8, 0, 4.1), "GRAND HOTEL\nWelcome", Color3.fromRGB(150, 110, 40), { light = false })
	Venues.patron(m, spot(cf, w / 2 - 12, d - 5.2, math.pi), nil, "register", "idle", "Concierge")
	Equipment.luggageCart(m, spot(cf, w / 2 - 6, 8, math.pi / 5))
	for i = 0, 1 do
		local sx = -w / 2 + 9
		local sz = 10 + i * 10
		local sofa = Real.fit(m, "SofaTriple", spot(cf, sx, sz, -math.pi / 2), 3.4, 7, 3.4)
		if not sofa then
			-- (no ready-made sofa to hand: a plain one)
			B.box(m, spot(cf, sx, sz, 0, 1.2), Vector3.new(3.4, 2.2, 7), Color3.fromRGB(150, 60, 50), M.SmoothPlastic, { Name = "Sofa" })
		end
		local seatCf = spot(cf, sx, sz, -math.pi / 2, 1.9)
		local s = Equipment.seat(m, seatCf, "LobbySeat")
		Venues.station(m, seatCf * CFrame.new(0, 1.2, 0), "lobby", Vector3.new(4, 3, 7))
		if i == 0 then
			s:SetAttribute("Patron", true)
			s:SetAttribute("Pose", "read")
			s:SetAttribute("Anim", "sit")
			B.tag(s, "PatronSpot")
		end
		Real.fit(m, "CoffeeTable", spot(cf, sx + 6, sz, 0), 3.2, 3.2, 2.2)
	end
	Real.fit(m, "CoffeeMachine", spot(cf, -8, d - 3, 0, 3.0), 2.2, 2.2, 2.8)
	B.box(m, spot(cf, -8, d - 3, 0, 1.5), Vector3.new(4, 3, 2.4), Color3.fromRGB(240, 238, 232), M.SmoothPlastic, { Name = "CoffeeCounter" })
	Venues.station(m, spot(cf, -8, d - 5.6, 0, 3.2), "coffee", Vector3.new(5, 4, 3))
	-- the lift doors on the back wall, plants and a grand clock
	for k = 0, 1 do
		B.box(m, spot(cf, -2 + k * 4.2, d - 1.2, 0, 4.2), Vector3.new(3.8, 8, 0.4), Color3.fromRGB(190, 194, 202), M.Metal, { Reflectance = 0.25, Name = "LiftDoor" })
	end
	sign(m, cf * CFrame.new(1, 9.6, d - 1.15), 9, 1.8, "LIFTS  1-12", Color3.fromRGB(255, 220, 140))
	for _, x in { -w / 2 + 3, w / 2 - 3 } do
		Props.plant(m, spot(cf, x, 4, 0), rng)
	end
end

----------------------------------------------------------------------------------------------------
-- The library
----------------------------------------------------------------------------------------------------
function Venues.library(m: Instance, cf: CFrame, w: number, d: number, h: number, rng: Random)
	ceilingLights(m, cf, w, d, h, 3)
	B.box(m, spot(cf, 0, d / 2, 0, 0.21), Vector3.new(w - 2.4, 0.04, d - 2.4), Color3.fromRGB(90, 70, 56), M.SmoothPlastic, nc({ Name = "Parquet" }))
	-- the loan desk by the door
	local desk = Props.counter(m, spot(cf, w / 2 - 10, 7, 0), 9, { 120, 84, 50 }, { 90, 60, 36 })
	desk.Name = "LoanDesk"
	Props.monitor(m, spot(cf, w / 2 - 12.5, 7.2, 0, 4.1), "LIBRARY\nBorrow a book", Color3.fromRGB(30, 90, 60), { light = false })
	Venues.patron(m, spot(cf, w / 2 - 10, 9.4, math.pi), nil, "register", "idle", "Librarian")
	-- shelves along the walls and in rows
	local function shelf(x, z, yaw)
		local name = if rng:NextNumber() < 0.5 then "BookcaseTall" else "Bookcase"
		local s = Real.fit(m, name, spot(cf, x, z, yaw), 7, 2.4, 9)
		if not s then
			Props.shelf(m, spot(cf, x, z, yaw), 6, 8, 2, rng)
		end
	end
	for k = 0, 3 do
		shelf(-w / 2 + 2.6, 14 + k * 7.5, -math.pi / 2)
		shelf(w / 2 - 2.6, 18 + k * 7.5, math.pi / 2)
	end
	for r = 0, 1 do
		for k = -1, 1, 2 do
			shelf(k * 8, d - 12 - r * 0, 0)
		end
	end
	-- reading tables with lamps, and study desks with computers
	for i = 0, 1 do
		local t = Equipment.readingTable(m, spot(cf, -8 + i * 16, 22, 0))
		Venues.station(t, spot(cf, -8 + i * 16, 22, 0, 3.4), "read", Vector3.new(6, 3, 4))
		seatPatrons(t, "ReadSeat", "read", "read", 0.45, rng)
	end
	for i = 0, 3 do
		local x = -w / 2 + 12 + i * 8
		local c = spot(cf, x, d - 4, math.pi)
		B.box(m, c * CFrame.new(0, 2.4, 0), Vector3.new(6, 0.3, 3), Color3.fromRGB(150, 110, 80), M.Wood, { Name = "StudyDesk" })
		for _, lx in { -2.8, 2.8 } do
			B.box(m, c * CFrame.new(lx, 1.2, 0), Vector3.new(0.3, 2.4, 2.8), Color3.fromRGB(70, 70, 76), M.Metal)
		end
		Props.monitor(m, c * CFrame.new(0, 2.55, -0.6), "CATALOGUE\nSearch books", Color3.fromRGB(20, 60, 100), { light = false })
		local chair = Props.chair(m, c * CFrame.new(0, 0, -2.4) * CFrame.Angles(0, math.pi, 0), { 40, 70, 110 })
		Venues.station(m, c * CFrame.new(0, 3.4, -1.4), "study", Vector3.new(4, 3, 3))
		seatPatrons(chair, "Seat", "study", "type", 0.4, rng)
	end
	sign(m, cf * CFrame.new(0, 9.4, d - 1.15), 14, 2, "SILENCE PLEASE", Color3.fromRGB(255, 244, 220), Color3.fromRGB(50, 36, 24))
	Props.plant(m, spot(cf, -w / 2 + 3, 5, 0), rng)
end

-- A place's stations on things it already has: the chairs at the computers of an internet cafe or the
-- tournament seats of an arena get a prompt (every `every`-th chair) and some of the others have a
-- patron sitting in them (`patronChance`, doing `pose`).
function Venues.addSeatStations(model: Instance, activityId: string, every: number?, patronChance: number?, pose: string?, rng: Random?)
	local n = 0
	local r = rng or Random.new(7)
	for _, d in model:GetDescendants() do
		if d:IsA("Model") and d.Name == "Chair" then
			n += 1
			if n % (every or 1) == 0 then
				local c = d:GetPivot()
				Venues.station(d, c * CFrame.new(0, 3.2, 0), activityId, Vector3.new(2.4, 3, 2.4))
			elseif patronChance and r:NextNumber() < patronChance then
				seatPatrons(d, "Seat", activityId, pose or "type", 1, r)
			end
		end
	end
	return n
end

return Venues
