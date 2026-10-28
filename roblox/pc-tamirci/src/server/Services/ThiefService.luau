-- ThiefService: shoplifters. Now and then (more often at night) a thief slips into a shop, grabs
-- cash from the register or a part from the shelves and runs for it. Anyone can catch a runner
-- with the "Catch!" prompt; guards chase them; cameras warn the owner and alarms slow them down.
-- Scammers who bolt with a repaired device use the same chase.

local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
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
local PlotService = require(script.Parent.PlotService)
local NpcService = require(script.Parent.NpcService)
local CustomerService = require(script.Parent.CustomerService)
local EmployeeService = require(script.Parent.EmployeeService)

local ThiefService = {}

local rng = Random.new()
local nextVisit: { [Player]: number } = {}
local thieves: { [Model]: { [string]: any } } = {}

local LINES = {
	tr = { caught = { "Tamam tamam, bırak!", "Açım abi, kusura bakma...", "Bir daha yapmam, söz!" }, enter = { "Şöyle bir bakınayım...", "Hmm, ne var ne yok?" } },
	en = { caught = { "OK, OK, let go!", "I was hungry, sorry...", "I won't do it again, promise!" }, enter = { "Just browsing...", "Hmm, what's around here?" } },
}

local function point(player: Player, name: string): BasePart?
	local shop = PlotService.shopOf(player)
	return shop and shop.points and shop.points:FindFirstChild(name) or nil
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

-- The thief is caught: loot goes back to the owner, the catcher gets the bounty.
local function caught(t, catcher: Player?, byGuard: string?)
	if t.done then
		return
	end
	t.done = true
	local owner = t.owner
	local lang = DataService.lang(owner)
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
	Net.push(owner, "toast", { key = "thief_caught", vars = { by = byGuard or (catcher and catcher.DisplayName) or "", bounty = bounty } })
	if catcher and catcher ~= owner then
		Net.push(catcher, "toast", { key = "bounty", vars = { amount = bounty } })
	end
	task.delay(3, function()
		local exit = point(owner, "ThiefExit")
		if exit and t.model.Parent then
			if hum then
				hum.WalkSpeed = 8
			end
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
		Net.push(owner, "toast", { key = "thief_escaped", vars = { cash = t.cash or 0, part = t.item and (Parts.get(t.item.part) or {}).name or "" } })
		DataService.rep(owner, -1)
	end
	finish(t.model)
end

-- Guards run after the thief; their catch chance grows with skill and the "strong" trait.
local function sendGuards(t)
	for _, g in EmployeeService.guards(t.owner) do
		task.spawn(function()
			local rec = g.rec
			local trait = Employees.traitById[rec.trait]
			local chance = 0.45 + rec.skill * 0.08 + (trait and trait.catch or 0)
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
	local lang = DataService.lang(player)
	local name = Customers.randomName(rng, false)
	local model = NpcService.spawn({ look = if rng:NextNumber() < 0.5 then "thief" else "shady", name = name, cf = street.CFrame * CFrame.new(Rand.range(rng, -40, 40), 3, 0), speed = 9 })
	model:SetAttribute("Thief", true)
	model:AddTag("Runner")
	local t = { model = model, owner = player, phase = "sneak" }
	thieves[model] = t
	NpcService.tag(model, name)
	task.spawn(function()
		NpcService.walkPath(model, { point(player, "Outside"), door })
		if t.done then
			return
		end
		if prof.shop.items.camera then
			Net.push(player, "toast", { key = "camera_alert" })
		end
		NpcService.say(model, Rand.pick(rng, LINES[lang].enter), 3)
		-- cash from the register, or a part from the shelf if the register is guarded by a safe
		local shelf = point(player, "Shelf_1")
		local goShelf = (protect >= 0.5 and rng:NextNumber() < 0.6 and #prof.inv > 0) or prof.money < 50
		local target = if goShelf and shelf then shelf else register
		NpcService.walkTo(model, target.Position)
		if t.done then
			return
		end
		t.phase = "steal"
		addCatchPrompt(model, if lang == "en" then "Catch!" else "Yakala!")
		local stealTime = Config.ThiefStealSeconds * (if prof.shop.items.alarm then 1.6 else 1)
		if prof.shop.items.alarm then
			local shopModel = shop.model
			for _, d in shopModel:GetDescendants() do
				if d:HasTag("AlarmLight") then
					d:SetAttribute("Alarm", os.clock())
				end
			end
			Net.push(player, "toast", { key = "alarm" })
		end
		sendGuards(t)
		task.wait(stealTime)
		if t.done then
			return
		end
		if target == register then
			local amount = math.min(prof.money * Config.ThiefMaxStealFraction, Config.ThiefMaxStealCap) * (1 - protect)
			amount = math.floor(amount * Rand.range(rng, 0.5, 1))
			if amount > 0 and DataService.money(player, -amount, "theft") then
				t.cash = amount
			end
		elseif #prof.inv > 0 then
			local i = rng:NextInteger(1, #prof.inv)
			t.item = table.remove(prof.inv, i)
			DataService.touch(player)
		end
		t.phase = "run"
		NpcService.say(model, "🏃", 2)
		local hum = model:FindFirstChildOfClass("Humanoid")
		if hum then
			hum.WalkSpeed = if prof.shop.items.alarm then 13 else 16
		end
		NpcService.walkPath(model, { door, point(player, "Outside"), exit }, true)
		if not t.done then
			escaped(t)
		end
	end)
end

ThiefService.visit = visit

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
			addCatchPrompt(cust.model, if DataService.lang(player) == "en" then "Catch!" else "Yakala!")
			Net.push(player, "toast", { key = "scammer_running", vars = { name = cust.name } })
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
						if rng:NextNumber() < (if shutterNight then 0.35 else 0.8) then
							task.spawn(visit, player)
						end
					end
				end
			end
		end
	end)
end

return ThiefService
