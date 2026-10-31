-- ThiefService: shoplifters and night burglars. Now and then (more often at night) a thief slips
-- into a shop, grabs cash from the register or a part from the shelves and runs for it. At night,
-- while the owner is away, a burglar forces the shutter and door instead (floodlights scare most
-- of them off, a smart lock and a steel door slow them down, the alarm rings). Anyone can catch a
-- runner with the "Catch!" prompt or a swing of the baseball bat; guards and the guard dog chase
-- them; the panic button brings the police. If one gets away, the police may trace them from the
-- camera footage, and the insurance pays back most of the loss. Scammers who bolt with a repaired
-- device use the same chase.

local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
local CollectionService = game:GetService("CollectionService")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Rand = require(Shared.Util.Rand)
local Parts = require(Shared.Data.Parts)
local Upgrades = require(Shared.Data.Upgrades)
local Employees = require(Shared.Data.Employees)
local Customers = require(Shared.Data.Customers)

local DataService = require(script.Parent.DataService)
local QuestService = require(script.Parent.QuestService)
local PlotService = require(script.Parent.PlotService)
local NpcService = require(script.Parent.NpcService)
local CustomerService = require(script.Parent.CustomerService)
local EmployeeService = require(script.Parent.EmployeeService)

local ThiefService = {}

local rng = Random.new()
local nextVisit: { [Player]: number } = {}
local thieves: { [Model]: { [string]: any } } = {}

local LINES = {
	tr = { caught = { "Tamam tamam, bırak!", "Açım abi, kusura bakma...", "Bir daha yapmam, söz!" } },
	en = { caught = { "OK, OK, let go!", "I was hungry, sorry...", "I won't do it again, promise!" } },
}

local function point(player: Player, name: string): BasePart?
	local shop = PlotService.shopOf(player)
	return shop and shop.points and shop.points:FindFirstChild(name) or nil
end

-- The way behind the counter to the till and back out: round the end of the counter (never over
-- the top of it). `at` is a spot beside the cashier's place, facing the register.
local function tillRoute(player: Player)
	local sideF, sideB, cash = point(player, "CounterSideF"), point(player, "CounterSideB"), point(player, "CashierSpot")
	if not sideF or not sideB or not cash then
		return nil
	end
	return { goIn = { sideF, sideB, cash.Position + cash.CFrame.RightVector * 1.0 }, goOut = { sideB, sideF } }
end

-- Creeping about: slowly, bent forward, looking around (the clients pose it, see NpcPoses).
local function sneak(model: Model, on: boolean)
	model:SetAttribute("Sneaking", if on then true else nil)
	local hum = model:FindFirstChildOfClass("Humanoid")
	if hum and on then
		hum.WalkSpeed = 5
	end
end

local function isNight(): boolean
	local t = Lighting.ClockTime
	return t >= Config.NightStart or t < Config.NightEnd
end

local function security(player: Player): (number, number)
	local p = DataService.get(player)
	if not p then
		return 0, 0
	end
	return Upgrades.total(p.shop.items, "security"), Upgrades.total(p.shop.items, "protect")
end

local function addCatchPrompt(model: Model, text: string)
	local root = model.PrimaryPart
	if not root or root:FindFirstChild("CatchPrompt") then
		return
	end
	local pp = Instance.new("ProximityPrompt")
	pp.Name = "CatchPrompt"
	pp.ActionText = text
	pp.ObjectText = "🚨"
	pp.HoldDuration = 0.35
	pp.MaxActivationDistance = 9
	pp.RequiresLineOfSight = false
	pp.KeyboardKeyCode = Enum.KeyCode.F
	pp.Parent = root
end

local function finish(model: Model)
	thieves[model] = nil
	NpcService.despawn(model)
end

-- A one-off 3D sound at a part of the shop.
local function playAt(parent: Instance?, key: string, seconds: number?)
	local def = Config.Sounds.Security and Config.Sounds.Security[key]
	if not parent or not def then
		return
	end
	local s = Instance.new("Sound")
	s.Name = "Security_" .. key
	s.SoundId = def.id
	s.Volume = def.volume
	s.RollOffMaxDistance = 160
	s.Parent = parent
	s:Play()
	task.delay(seconds or 12, function()
		s:Destroy()
	end)
end
ThiefService._playAt = playAt

local function items(player: Player)
	local p = DataService.get(player)
	return p and p.shop.items or {}
end

-- Value of what a thief took (cash plus the part's new price).
local function lossOf(t): number
	local v = t.cash or 0
	if t.item then
		local part = Parts.get(t.item.part)
		v += (part and part.price or 0) * (t.item.cond or 1)
	end
	return v
end

-- The thief is caught: loot goes back to the owner, the catcher gets the bounty.
local function caught(t, catcher: Player?, byGuard: string?)
	t.caughtBy = byGuard or (catcher and catcher.DisplayName)
	if t.done then
		return
	end
	t.done = true
	local owner = t.owner
	local lang = DataService.lang(owner)
	-- (caught red-handed: the hands come out of the till, no more creeping, and the run for the door
	-- stops on the spot)
	NpcService.halt(t.model)
	NpcService.work(t.model, nil)
	t.model:SetAttribute("Sneaking", nil)
	NpcService.say(t.model, Rand.pick(rng, LINES[lang].caught), 4)
	NpcService.play(t.model, "idle")
	local hum = t.model:FindFirstChildOfClass("Humanoid")
	if hum then
		hum.WalkSpeed = 0
	end
	if t.cash and t.cash > 0 then
		DataService.money(owner, t.cash, "recovered")
	end
	if t.item then
		table.insert(DataService.get(owner).inv, t.item)
		DataService.touch(owner)
	end
	local bounty = Config.ThiefBountyBase + (if t.cash then math.floor(t.cash * 0.1) else 0)
	local who = catcher or owner
	DataService.money(who, bounty, "bounty")
	DataService.addXp(who, 40)
	local prof = DataService.get(who)
	if prof then
		prof.stats.caught += 1
	end
	QuestService.bump(who, "catch")
	Net.push(owner, "toast", { key = "thief_caught", vars = { by = byGuard or (catcher and catcher.DisplayName) or "", bounty = bounty } })
	if catcher and catcher ~= owner then
		Net.push(catcher, "toast", { key = "bounty", vars = { amount = bounty } })
	end
	task.delay(3, function()
		local exit = point(owner, "ThiefExit")
		if exit and NpcService.alive(t.model) then
			if hum then
				hum.WalkSpeed = 8
			end
			-- (let go and led away, with the bag taken off him)
			NpcService.release(t.model)
			NpcService.carry(t.model, nil)
			NpcService.walkTo(t.model, exit.Position, 12)
		end
		finish(t.model)
	end)
end

local function escaped(t)
	if t.done then
		return
	end
	t.done = true
	local owner = t.owner
	if owner.Parent then
		local prof = DataService.get(owner)
		if prof then
			prof.stats.robbed += 1
		end
		Net.push(owner, "toast", { key = "thief_escaped", important = true, vars = { cash = t.cash or 0, part = t.item and (Parts.get(t.item.part) or {}).name or "" } })
		DataService.rep(owner, -1)
		local it = items(owner)
		local loss = lossOf(t)
		-- the police trace them from the footage (HD cameras nearly always) and bring it back...
		local trace = if it.cctv_hd then 0.85 elseif it.camera then 0.45 else 0
		if loss > 0 and rng:NextNumber() < trace then
			task.delay(ThiefService.policeDelay, function()
				if not owner.Parent then
					return
				end
				if t.cash and t.cash > 0 then
					DataService.money(owner, t.cash, "recovered")
				end
				if t.item then
					local p2 = DataService.get(owner)
					if p2 then
						table.insert(p2.inv, t.item)
						DataService.touch(owner)
					end
				end
				Net.push(owner, "toast", { key = "police_recovered", vars = { amount = math.floor(loss) } })
			end)
		elseif loss > 0 and it.insurance then
			-- ...or the insurance pays most of it
			local payout = math.floor(loss * 0.7)
			DataService.money(owner, payout, "insurance")
			Net.push(owner, "toast", { key = "insurance_paid", vars = { amount = payout } })
		end
	end
	finish(t.model)
end
ThiefService.policeDelay = 25

-- At the door on the way out: the guard dog and the police (panic button) get a last go.
local function lastChance(t): boolean
	local it = items(t.owner)
	if it.guard_dog then
		playAt(point(t.owner, "Door"), "bark", 3)
		if rng:NextNumber() < 0.5 then
			caught(t, nil, "🐕 Buddy")
			return true
		end
	end
	if it.panic_button and (it.alarm or t.night) then
		playAt(point(t.owner, "Outside"), "police", 11)
		if rng:NextNumber() < 0.6 then
			caught(t, nil, "🚓 " .. (if DataService.lang(t.owner) == "en" then "Police" else "Polis"))
			return true
		end
	end
	return false
end

-- Guards run after the thief; their catch chance grows with skill and the "strong" trait.
local function sendGuards(t)
	for _, g in EmployeeService.guards(t.owner) do
		task.spawn(function()
			local rec = g.rec
			local chance = 0.45 + (rec.skill or 1) * 0.08 + Employees.traitSum(rec, "catch")
			for _ = 1, 12 do
				if t.done or not g.model or not t.model.Parent then
					return
				end
				local target = t.model.PrimaryPart
				if target then
					NpcService.walkTo(g.model, target.Position, 1.2, true)
					if (g.model.PrimaryPart.Position - target.Position).Magnitude < 6 then
						if rng:NextNumber() < chance then
							caught(t, nil, rec.name)
						end
						return
					end
				end
			end
		end)
	end
end

local function visit(player: Player)
	local shop = PlotService.shopOf(player)
	local prof = DataService.get(player)
	if not shop or not prof then
		return
	end
	local street, door, register, exit = point(player, "Street"), point(player, "Door"), point(player, "Register"), point(player, "ThiefExit")
	if not street or not door or not register or not exit then
		return
	end
	local _, protect = security(player)
	local look = if rng:NextNumber() < 0.5 then "thief" else "shady"
	local name, gender = Customers.randomName(rng, false, NpcService.pickGender(look, rng))
	local model = NpcService.spawn({ look = look, gender = gender, name = name, cf = street.CFrame * CFrame.new(Rand.range(rng, -40, 40), 3, 0), speed = 9 })
	model:SetAttribute("Thief", true)
	model:AddTag("Runner")
	local t = { model = model, owner = player, phase = "sneak" }
	thieves[model] = t
	task.spawn(function()
		-- a stroll up to the door like anybody else, then creeping: slowly, bent over, looking about
		NpcService.walkPath(model, { point(player, "Outside"), door })
		if t.done then
			return
		end
		sneak(model, true)
		if prof.shop.items.camera or prof.shop.items.cctv_hd then
			Net.push(player, "toast", { key = "camera_alert", important = true })
		end
		-- cash from the register, or a part from the shelf if the register is guarded by a safe
		local shelf = point(player, "Shelf_1")
		local goShelf = (protect >= 0.5 and rng:NextNumber() < 0.6 and #prof.inv > 0) or prof.money < 50
		local route = tillRoute(player)
		local atShelf = goShelf and shelf ~= nil
		local back = { door }
		if atShelf then
			NpcService.walkTo(model, (shelf :: BasePart).Position)
		elseif route then
			-- (a look round the shop floor first, then round the end of the counter to the till)
			NpcService.walkPath(model, { route.goIn[1] })
			task.wait(Rand.range(rng, 0.8, 1.6))
			NpcService.walkPath(model, route.goIn)
			back = route.goOut
			table.insert(back, door)
		else
			NpcService.walkPath(model, { point(player, "CounterBack") })
			back = { door }
		end
		if t.done then
			return
		end
		t.phase = "steal"
		NpcService.face(model, if atShelf then shelf.Position else register.Position)
		addCatchPrompt(model, "Catch!")
		NpcService.tag(model, "🚨", Color3.fromRGB(255, 90, 90))
		-- quietly into the till (or off the shelf), glancing about
		NpcService.work(model, "rummage")
		local stealTime = Config.ThiefStealSeconds * (if prof.shop.items.alarm then 1.6 else 1)
		if prof.shop.items.alarm then
			local shopModel = shop.model
			for _, d in shopModel:GetDescendants() do
				if d:HasTag("AlarmLight") then
					d:SetAttribute("Alarm", os.clock())
					playAt(d, "alarm", 11)
				end
			end
			Net.push(player, "toast", { key = "alarm", important = true })
		end
		sendGuards(t)
		task.wait(stealTime)
		if t.done then
			return
		end
		if not atShelf then
			-- (a cashier at the till keeps most of it out of reach)
			local guard = math.min(0.9, protect + Employees.effect(prof.staff, "till"))
			local amount = math.min(prof.money * Config.ThiefMaxStealFraction, Config.ThiefMaxStealCap) * (1 - guard)
			amount = math.floor(amount * Rand.range(rng, 0.5, 1))
			if amount > 0 and DataService.money(player, -amount, "theft") then
				t.cash = amount
			end
		elseif #prof.inv > 0 then
			local i = rng:NextInteger(1, #prof.inv)
			t.item = table.remove(prof.inv, i)
			DataService.touch(player)
		end
		-- the loot in a bag, and off at a run, the way he came
		t.phase = "run"
		NpcService.work(model, nil)
		sneak(model, false)
		if t.cash or t.item then
			NpcService.carry(model, "sack")
		end
		local hum = model:FindFirstChildOfClass("Humanoid")
		if hum then
			hum.WalkSpeed = if prof.shop.items.alarm then 13 else 16
		end
		table.insert(back, point(player, "Outside"))
		NpcService.walkPath(model, back, true)
		if not t.done and not lastChance(t) then
			NpcService.walkTo(model, exit.Position, 10)
			escaped(t)
		end
	end)
end

-- Is the owner away from the shop (so the shop is closed for the night)?
local function ownerAway(player: Player): boolean
	local door = point(player, "Door")
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	return not door or not root or (root.Position - door.Position).Magnitude > 70
end
ThiefService.ownerAway = ownerAway

-- A night burglary: force the shutter and the door, take the cash (or the dearest part), run.
local function burgle(player: Player)
	local shop = PlotService.shopOf(player)
	local prof = DataService.get(player)
	if not shop or not prof then
		return
	end
	local street, outside, door, register, exit = point(player, "Street"), point(player, "Outside"), point(player, "Door"), point(player, "Register"), point(player, "ThiefExit")
	if not street or not outside or not door or not register or not exit then
		return
	end
	local it = prof.shop.items
	local _, protect = security(player)
	local name, gender = Customers.randomName(rng, false, NpcService.pickGender("thief", rng))
	local model = NpcService.spawn({ look = "thief", gender = gender, name = name, cf = street.CFrame * CFrame.new(Rand.range(rng, -40, 40), 3, 0), speed = 8 })
	model:SetAttribute("Thief", true)
	model:SetAttribute("Burglar", true)
	model:AddTag("Runner")
	local t = { model = model, owner = player, phase = "sneak", night = true }
	thieves[model] = t
	task.spawn(function()
		NpcService.walkTo(model, outside.Position)
		sneak(model, true)
		if t.done then
			return
		end
		-- floodlights: most of them think again
		if it.motion_lights then
			for _, d in shop.model:GetDescendants() do
				if d:HasTag("Floodlight") then
					d:SetAttribute("Flash", os.clock())
				end
			end
			if rng:NextNumber() < 0.45 then
				Net.push(player, "toast", { key = "burglar_scared" })
				NpcService.walkTo(model, exit.Position, 12)
				finish(model)
				return
			end
		end
		if it.camera or it.cctv_hd then
			Net.push(player, "toast", { key = "burglar_camera", important = true })
		end
		-- forcing the shutter and the door with a crowbar
		t.phase = "break"
		addCatchPrompt(model, "Catch!")
		NpcService.tag(model, "🚨", Color3.fromRGB(255, 90, 90))
		NpcService.face(model, door.Position)
		NpcService.work(model, "pry", "spudger")
		local breakTime = ThiefService.breakSeconds * (if it.shutter then 3 else 1) * (if it.steel_door then 1.8 else 1) + (if it.smart_lock then ThiefService.breakSeconds * 0.75 else 0)
		playAt(door, "forcing", math.min(breakTime, 11))
		sendGuards(t)
		local waited = 0
		while waited < breakTime and not t.done do
			task.wait(0.5)
			waited += 0.5
			if it.alarm and waited >= math.min(2, breakTime) and not t.alarmed then
				t.alarmed = true
				for _, d in shop.model:GetDescendants() do
					if d:HasTag("AlarmLight") then
						d:SetAttribute("Alarm", os.clock())
						playAt(d, "alarm", 11)
					end
				end
				Net.push(player, "toast", { key = "alarm", important = true })
				if rng:NextNumber() < 0.35 then
					Net.push(player, "toast", { key = "burglar_scared" })
					NpcService.walkTo(model, exit.Position, 12)
					finish(model)
					return
				end
			end
		end
		if t.done then
			return
		end
		NpcService.work(model, nil)
		-- inside: round the end of the counter to the till, never over it
		local route = tillRoute(player)
		local back = { door }
		if route then
			NpcService.walkTo(model, door.Position)
			NpcService.walkPath(model, route.goIn)
			back = route.goOut
			table.insert(back, door)
		else
			NpcService.walkPath(model, { door, point(player, "CounterBack") })
		end
		if t.done then
			return
		end
		t.phase = "steal"
		NpcService.face(model, register.Position)
		NpcService.work(model, "rummage")
		task.wait(Config.ThiefStealSeconds)
		if t.done then
			return
		end
		-- the till, or the dearest part when the cash is in the safe
		local amount = math.floor(math.min(prof.money * Config.ThiefMaxStealFraction * 2, Config.ThiefMaxStealCap * 2) * (1 - protect) * Rand.range(rng, 0.6, 1))
		if amount >= 50 and DataService.money(player, -amount, "theft") then
			t.cash = amount
		elseif #prof.inv > 0 then
			local best, bestV = 1, -1
			for i, item in prof.inv do
				local part = Parts.get(item.part)
				local v = (part and part.price or 0) * (item.cond or 1)
				if v > bestV then
					best, bestV = i, v
				end
			end
			t.item = table.remove(prof.inv, best)
			DataService.touch(player)
		end
		t.phase = "run"
		NpcService.work(model, nil)
		sneak(model, false)
		if t.cash or t.item then
			NpcService.carry(model, "sack")
		end
		local hum = model:FindFirstChildOfClass("Humanoid")
		if hum then
			hum.WalkSpeed = 15
		end
		table.insert(back, outside)
		NpcService.walkPath(model, back, true)
		if not t.done and not lastChance(t) then
			NpcService.walkTo(model, exit.Position, 10)
			escaped(t)
		end
	end)
end
ThiefService.burgle = burgle
ThiefService.breakSeconds = 8

ThiefService.visit = visit

-- A swing of the baseball bat: the nearest runner (thief or scammer) within reach is caught.
function ThiefService.batHit(player: Player): boolean
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then
		return false
	end
	local best, bestD = nil, ThiefService.batReach
	for model, t in thieves do
		local r = model.PrimaryPart
		if not t.done and r then
			local d = (r.Position - root.Position).Magnitude
			if d < bestD then
				best, bestD = t, d
			end
		end
	end
	if best then
		Net.push(best.owner, "toast", { key = "bat_hit", vars = { by = player.DisplayName } })
		caught(best, player)
		return true
	end
	for _, model in CollectionService:GetTagged("Runner") do
		local r = model:IsA("Model") and model.PrimaryPart
		if r and (r.Position - root.Position).Magnitude < ThiefService.batReach then
			local cust = CustomerService.byModel(model)
			if cust and CustomerService.caught(cust, player) then
				return true
			end
		end
	end
	return false
end
ThiefService.batReach = 7

-- (the tests load their own dice)
function ThiefService._setRng(r)
	rng = r or Random.new()
end

function ThiefService.init() end

function ThiefService.start()
	ProximityPromptService.PromptTriggered:Connect(function(prompt, player)
		if prompt.Name ~= "CatchPrompt" then
			return
		end
		local model = prompt:FindFirstAncestorOfClass("Model")
		if not model then
			return
		end
		-- the prompt goes away once every PromptTriggered listener has seen it
		local function remove()
			prompt.Enabled = false
			task.defer(function()
				prompt:Destroy()
			end)
		end
		local t = thieves[model]
		if t then
			caught(t, player)
			remove()
			return
		end
		local cust = CustomerService.byModel(model)
		if cust and CustomerService.caught(cust, player) then
			remove()
		end
	end)
	-- scammers who run off get the same prompt
	CustomerService.robbed:Connect(function(player, cust)
		if cust.model then
			addCatchPrompt(cust.model, "Catch!")
			Net.push(player, "toast", { key = "scammer_running", important = true, vars = { name = cust.name } })
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		nextVisit[player] = nil
		for model, t in thieves do
			if t.owner == player then
				finish(model)
			end
		end
	end)
	task.spawn(function()
		while true do
			task.wait(5)
			local now = os.clock()
			for player in PlotService.shops() do
				local p = DataService.get(player)
				if p and p.level >= 2 then
					if not nextVisit[player] then
						nextVisit[player] = now + Rand.range(rng, 120, 300)
					elseif now >= nextVisit[player] then
						local range = if isNight() then Config.ThiefIntervalNight else Config.ThiefIntervalDay
						local sec = security(player)
						local shutterNight = p.shop.items.shutter and isNight()
						nextVisit[player] = now + Rand.range(rng, range[1], range[2]) * (1 + sec * 0.15) * (if shutterNight then 1.8 else 1)
						if isNight() and ownerAway(player) then
							-- the shop is shut for the night: a burglar has a go at it (most
							-- of them pass by a shop with a watchman outside)
							if rng:NextNumber() < (if EmployeeService.watchman(player) then 0.25 else 0.7) then
								task.spawn(burgle, player)
							end
						elseif rng:NextNumber() < (if shutterNight then 0.35 else 0.8) then
							task.spawn(visit, player)
						end
					end
				end
			end
		end
	end)
end

return ThiefService
