-- CustomerService: people who walk into your shop with a broken device.
--
-- Life of a customer: walks in from the street, queues, explains the problem at the counter and
-- names a price (you accept, haggle or refuse), sits down to wait (nagging if they're the annoying
-- kind) or pops out, comes back to the counter when the job is ready, pays, tips and reviews.
-- Patience runs out if you take too long. Specials: the scammer may bolt with the device without
-- paying (catch him!), the shady seller offers "brand new" parts of dubious origin.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Rand = require(Shared.Util.Rand)
local Parts = require(Shared.Data.Parts)
local Faults = require(Shared.Data.Faults)
local Customers = require(Shared.Data.Customers)
local Upgrades = require(Shared.Data.Upgrades)
local Employees = require(Shared.Data.Employees)
local DeviceGen = require(Shared.Repair.DeviceGen)

local DataService = require(script.Parent.DataService)
local PlotService = require(script.Parent.PlotService)
local RepairService = require(script.Parent.RepairService)
local QuestService = require(script.Parent.QuestService)
local NpcService = require(script.Parent.NpcService)

local CustomerService = {}
CustomerService.atCounter = Signal.new() -- (player, cust) someone is waiting to be served
CustomerService.robbed = Signal.new() -- (player, cust) a scammer ran off

local V = Net.V
local rng = Random.new()
local shops: { [Player]: { [string]: any } } = {}
local byId: { [string]: any } = {}
local total = 0
local nextId = 0

----------------------------------------------------------------------------------------------------
-- helpers
----------------------------------------------------------------------------------------------------
local function shopState(player: Player)
	local s = shops[player]
	if not s then
		s = { list = {}, queue = {}, counter = nil, next = os.clock() + 8 }
		shops[player] = s
	end
	return s
end

local function point(player: Player, name: string): BasePart?
	local shop = PlotService.shopOf(player)
	return shop and shop.points and shop.points:FindFirstChild(name) or nil
end

local function sumItems(player: Player, field: string): number
	local p = DataService.get(player)
	local n = 0
	if p then
		for _, item in Upgrades.items do
			if item[field] and p.shop.items[item.id] then
				n += item[field]
			end
		end
	end
	return n
end

local function line(cust, kind: string, vars: { [string]: any }?): string
	return Customers.line(cust.arch, kind, cust.lang, rng, vars) or ""
end

local function say(cust, kind: string, vars: { [string]: any }?, seconds: number?)
	local text = line(cust, kind, vars)
	if cust.model and cust.model.Parent and #text > 0 then
		NpcService.say(cust.model, text, seconds or 6)
	end
	return text
end

local function money(n: number): string
	return Config.CurrencySymbol .. tostring(math.floor(n + 0.5))
end

-- What a fair technician would charge for this job.
local function fairPrice(job): number
	if job.request then
		if job.requestId == "build" then
			return (job.request.budget or 1500) * 1.12
		elseif job.requestId == "upgrade_gpu" then
			return (job.request.budget or 400) + Config.LaborBase * 1.5
		end
	end
	local total0 = 0
	local diff = 0
	for _, fid in job.faults or {} do
		local f = Faults.get(fid)
		diff = math.max(diff, f and f.difficulty or 1)
		total0 += DeviceGen.partsEstimate(job.device, fid) * Config.PartMarkupFair
	end
	if job.requestId then
		local f = Faults.get(job.requestId)
		diff = math.max(diff, f and f.difficulty or 1)
		if job.requestId == "upgrade_ram" then
			total0 += 40 * Config.PartMarkupFair
		elseif job.requestId == "upgrade_ssd" then
			total0 += 45 * Config.PartMarkupFair
		elseif job.requestId == "maintenance" then
			total0 += 8
		end
	end
	return total0 + Config.LaborBase * (0.8 + diff * 0.6)
end

local function complaint(cust, job): string
	if job.requestId then
		local f = Faults.get(job.requestId)
		local list = f and f.symptoms and (if cust.lang == "en" then f.symptoms.en else f.symptoms.tr) or {}
		local s = list[rng:NextInteger(1, math.max(1, #list))] or ""
		local r = job.request or {}
		s = string.gsub(s, "{(%w+)}", function(k)
			if k == "budget" then
				return money(r.budget or 0)
			elseif k == "target" then
				return tostring(r.ramMin or 16)
			end
			return ""
		end)
		return s
	end
	local parts = {}
	for _, fid in job.faults or {} do
		local f = Faults.get(fid)
		local list = f and f.symptoms and (if cust.lang == "en" then f.symptoms.en else f.symptoms.tr) or {}
		if #list > 0 then
			table.insert(parts, list[rng:NextInteger(1, #list)])
		end
	end
	return table.concat(parts, " ")
end

----------------------------------------------------------------------------------------------------
-- spawning and movement
----------------------------------------------------------------------------------------------------
local function pickArchetype(level: number)
	local pool = {}
	for _, a in Customers.archetypes do
		if (a.level or 1) <= level then
			table.insert(pool, a)
		end
	end
	return Rand.weighted(rng, pool)
end

-- Comfort of the shop: its furniture and its staff (cleaner, tea maker, friendly faces).
local function comfortOf(player: Player): number
	local p = DataService.get(player)
	return sumItems(player, "comfort") + Employees.effect(p and p.staff, "comfort")
end

-- The difficulty the player chose (Settings), with the numbers that go with it.
local function difficultyOf(player: Player)
	local p = DataService.get(player)
	local name = p and p.settings and p.settings.difficulty
	return Config.Difficulty[name or "normal"] or Config.Difficulty.normal
end
CustomerService.difficultyOf = difficultyOf

local function patienceSeconds(cust, player: Player): number
	local r = Config.CustomerPatienceMinutes
	local base = Rand.range(rng, r[1], r[2]) * 60 * (cust.arch.patience or 1) * difficultyOf(player).patience
	return base * (1 + math.max(-20, comfortOf(player)) / 120) * (1 + sumItems(player, "patience"))
end

local function removeCustomer(cust)
	if cust.gone then
		return
	end
	cust.gone = true
	local s = shops[cust.owner]
	if s then
		local i = table.find(s.list, cust)
		if i then
			table.remove(s.list, i)
		end
		local q = table.find(s.queue, cust)
		if q then
			table.remove(s.queue, q)
		end
		if s.counter == cust then
			s.counter = nil
		end
	end
	byId[cust.id] = nil
	total -= 1
	if cust.model then
		NpcService.despawn(cust.model)
		cust.model = nil
	end
end

local function leave(cust, run: boolean?)
	if cust.gone then
		return
	end
	cust.state = "leave"
	if cust.prompt then
		cust.prompt:Destroy()
		cust.prompt = nil
	end
	local s = shops[cust.owner]
	if s then
		local q = table.find(s.queue, cust)
		if q then
			table.remove(s.queue, q)
		end
		if s.counter == cust then
			s.counter = nil
		end
	end
	task.spawn(function()
		if cust.model and cust.model.Parent then
			local door, outside, street = point(cust.owner, "Door"), point(cust.owner, "Outside"), point(cust.owner, "Street")
			local path = {}
			for _, p in { door, outside, street } do
				if p then
					table.insert(path, p)
				end
			end
			if street then
				table.insert(path, street.Position + street.CFrame.RightVector * Rand.range(rng, -40, 40))
			end
			NpcService.walkPath(cust.model, path, run)
		end
		removeCustomer(cust)
	end)
end
CustomerService.leave = leave

-- Moves everyone in the queue to their slot; the head steps up to a free counter.
local function advance(player: Player)
	local s = shops[player]
	if not s then
		return
	end
	if not s.counter and #s.queue > 0 then
		local head = table.remove(s.queue, 1)
		s.counter = head
		head.state = "counter"
		task.spawn(function()
			local cf = point(player, "CounterFront")
			if cf and head.model then
				NpcService.walkTo(head.model, cf.Position)
				local back = point(player, "CounterBack")
				if back then
					NpcService.face(head.model, back.Position)
				end
			end
			if head.state == "counter" and not head.gone then
				head.counterSince = os.clock()
				CustomerService.enablePrompt(head)
				say(head, "greet", nil, 7)
				NpcService.emote(head.model, "wave")
				CustomerService.atCounter:Fire(player, head)
			end
		end)
	end
	for i, c in s.queue do
		local q = point(player, "Queue_" .. i) or point(player, "Queue_1")
		if q and c.model and c.slot ~= i then
			c.slot = i
			task.spawn(NpcService.walkTo, c.model, q.Position)
		end
	end
end

local function spawnCustomer(player: Player)
	local p = DataService.get(player)
	local shop = PlotService.shopOf(player)
	if not p or not shop then
		return
	end
	local s = shopState(player)
	local arch = pickArchetype(p.level)
	nextId += 1
	local name, gender = Customers.randomName(rng, arch.id == "tourist", arch.gender)
	local cust = {
		id = "C" .. nextId,
		owner = player,
		arch = arch,
		name = name,
		gender = gender,
		lang = DataService.lang(player),
		state = "arrive",
		rounds = 0,
	}
	-- the device and what's wrong with it are decided now
	if arch.special ~= "stolen_offer" then
		local diff = difficultyOf(player)
		local learning = (p.stats.repairs or 0) < Config.LearningRepairs
		local profile = {
			laptopChance = arch.device and arch.device.laptopChance,
			tiers = arch.device and arch.device.tiers,
			classes = arch.device and arch.device.classes,
			extraFaultChance = math.max(0, (arch.extraFaultChance or 0) + diff.extraFaults),
			-- the first customers bring simple desktops with well-known faults
			device = if learning then "desktop" else nil,
			requestChance = if learning then 0 else nil,
			onlyFaults = if learning then Config.EasyFaults else nil,
			builds = arch.id == "gamer_teen" or arch.id == "streamer" or arch.id == "rich" or arch.id == "esports",
		}
		local ok, job = pcall(DeviceGen.forJob, rng, profile, p.level)
		if not ok or not job then
			return
		end
		cust.jobData = job
		cust.fair = fairPrice(job)
		cust.offer = math.max(20, math.floor(cust.fair * (arch.budget or 1) * Rand.range(rng, 0.85, 1.05)))
		cust.max = math.floor(cust.fair * (arch.budget or 1) * (1.08 + (1 - (arch.haggle or 0.5)) * 0.25))
		cust.text = complaint(cust, job)
	end
	local street = point(player, "Street")
	if not street then
		return
	end
	local side = if rng:NextNumber() < 0.5 then -1 else 1
	local start = street.CFrame * CFrame.new(side * Rand.range(rng, 30, 60), 3, 0)
	cust.model = NpcService.spawn({ look = arch.look, gender = gender, name = name, cf = start, tag = "Customer", speed = if arch.id == "hurry" then 14 else Rand.range(rng, 8.5, 11) })
	cust.model:SetAttribute("CustomerId", cust.id)
	cust.model:SetAttribute("Shop", player.UserId)
	NpcService.tag(cust.model, name)
	byId[cust.id] = cust
	table.insert(s.list, cust)
	total += 1
	cust.patienceEnd = os.clock() + patienceSeconds(cust, player) * 0.6
	task.spawn(function()
		local path = {}
		for _, n in { "Street", "Outside", "Door" } do
			local pt = point(player, n)
			if pt then
				table.insert(path, pt)
			end
		end
		NpcService.walkPath(cust.model, path)
		if cust.gone then
			return
		end
		cust.state = "queue"
		table.insert(s.queue, cust)
		advance(player)
	end)
end

----------------------------------------------------------------------------------------------------
-- talking
----------------------------------------------------------------------------------------------------
function CustomerService.enablePrompt(cust)
	if cust.prompt or not cust.model then
		return
	end
	local root = cust.model.PrimaryPart
	if not root then
		return
	end
	local pp = Instance.new("ProximityPrompt")
	pp.Name = "TalkPrompt"
	pp.ActionText = if cust.lang == "en" then "Talk" else "Talk"
	pp.ObjectText = cust.name
	pp.KeyboardKeyCode = Enum.KeyCode.E
	pp.MaxActivationDistance = 11
	pp.RequiresLineOfSight = false
	pp:SetAttribute("Customer", cust.id)
	pp.Parent = root
	cust.prompt = pp
end

local function offerPayload(cust)
	local job = cust.jobData
	return {
		id = cust.id,
		name = cust.name,
		arch = cust.arch.id,
		archName = cust.arch.name,
		kind = if cust.arch.special == "stolen_offer" then "sell" else "repair",
		text = cust.text,
		device = job and DeviceGen.name(job.device) or nil,
		deviceKind = job and job.device.kind or nil,
		requestId = job and job.requestId or nil,
		offer = cust.offer,
		rounds = Config.MaxHaggleRounds - cust.rounds,
		tools = (function()
			local t = {}
			for _, fid in job and job.faults or {} do
				local f = Faults.get(fid)
				for _, tool in f and f.tools or {} do
					if not table.find(t, tool) then
						table.insert(t, tool)
					end
				end
			end
			return t
		end)(),
		sale = cust.sale,
	}
end

-- The shady seller's "deal": a high-end part far below its price.
local function makeSale(cust)
	local cats = { "gpu", "cpu", "ram", "storage" }
	local list = Parts.byCat[Rand.pick(rng, cats)]
	local good = {}
	for _, p in list do
		if p.price >= 150 and not p.workstation and not p.own then
			table.insert(good, p)
		end
	end
	local part = Rand.pick(rng, good)
	cust.sale = { part = part.id, name = part.name, price = math.floor(part.price * Rand.range(rng, 0.22, 0.4)), retail = part.price }
	cust.offer = cust.sale.price
	cust.text = if cust.lang == "en" then string.format("Psst... brand new %s, no box. %s, today only.", part.name, money(cust.sale.price)) else string.format("Abi bak, sıfır %s, kutusu yok. %s, sadece bugün.", part.name, money(cust.sale.price))
end

local function accept(player: Player, cust, price: number)
	local job = cust.jobData
	local created = RepairService.createJob(player, {
		device = job.device,
		faults = job.faults,
		request = job.request,
		requestId = job.requestId,
		kind = job.kind,
		price = price,
		text = cust.text,
		customer = { name = cust.name, arch = cust.arch.id, id = cust.id },
	})
	if not created then
		Net.push(player, "toast", { key = "jobs_full" })
		return false
	end
	cust.job = created.id
	cust.price = price
	cust.state = "waiting"
	cust.waitStart = os.clock()
	cust.patienceEnd = os.clock() + patienceSeconds(cust, player)
	if cust.prompt then
		cust.prompt:Destroy()
		cust.prompt = nil
	end
	local p = DataService.get(player)
	if p then
		p.stats.customers += 1
	end
	say(cust, "accept", nil, 5)
	local s = shops[player]
	if s and s.counter == cust then
		s.counter = nil
	end
	advance(player)
	-- find a seat, or step out and come back later
	task.spawn(function()
		task.wait(1.5)
		local shop = PlotService.shopOf(player)
		local seated = false
		if shop and cust.model then
			for i = 1, 20 do
				local sp = point(player, "Seat_" .. i)
				if not sp then
					break
				end
				local seat = nil
				for _, d in shop.model:GetDescendants() do
					if d:IsA("Seat") and d.Name == "Seat" and not d.Occupant and (d.Position - sp.Position).Magnitude < 3 then
						seat = d
						break
					end
				end
				if seat and not seat:GetAttribute("Reserved") then
					seat:SetAttribute("Reserved", true)
					cust.seat = seat
					NpcService.walkTo(cust.model, sp.Position)
					seated = NpcService.sit(cust.model, seat)
					break
				end
			end
		end
		if not seated and not cust.gone then
			-- no free seat: step out and come back for the pickup
			say(cust, "waiting", nil, 4)
			cust.away = true
			task.wait(1)
			local path = {}
			for _, n in { "Door", "Outside", "Street" } do
				local pt = point(player, n)
				if pt then
					table.insert(path, pt)
				end
			end
			if cust.model then
				NpcService.walkPath(cust.model, path)
			end
			if cust.model and cust.state == "waiting" then
				NpcService.despawn(cust.model)
				cust.model = nil
			end
		end
	end)
	return true
end

-- Handles the dialog buttons. action: accept | haggle | reject | buy (shady)
local function reply(player: Player, payload)
	if not V.tbl(payload) or not V.id(payload.id) or not V.id(payload.action) then
		return { ok = false }
	end
	local cust = byId[payload.id]
	if not cust or cust.owner ~= player or cust.state ~= "counter" then
		return { ok = false, err = "gone" }
	end
	local action = payload.action
	if action == "reject" then
		say(cust, "declined", nil, 4)
		leave(cust)
		advance(player)
		return { ok = true, done = true }
	end
	if cust.arch.special == "stolen_offer" then
		if action == "buy" or action == "accept" then
			if not DataService.money(player, -cust.sale.price, "shady") then
				return { ok = false, err = "money" }
			end
			local item = DataService.addPart(player, cust.sale.part, Rand.range(rng, 0.7, 1), "shady", if rng:NextNumber() < 0.35 then true else nil)
			if not item then
				DataService.money(player, cust.sale.price)
				return { ok = false, err = "storage" }
			end
			-- stolen goods: sometimes the police come knocking
			if rng:NextNumber() < 0.3 then
				task.delay(rng:NextInteger(40, 120), function()
					if player.Parent then
						local p = DataService.get(player)
						local fine = math.floor(cust.sale.retail * 0.5)
						if p then
							DataService.takePart(player, item.uid)
							DataService.money(player, -math.min(fine, p.money))
							DataService.rep(player, -6)
							Net.push(player, "toast", { key = "police_fine", vars = { part = cust.sale.name, fine = fine } })
						end
					end
				end)
			end
			say(cust, "happy", nil, 4)
			leave(cust)
			advance(player)
			return { ok = true, done = true }
		end
		return { ok = false }
	end
	if action == "accept" then
		local ok = accept(player, cust, cust.offer)
		return { ok = ok, done = ok }
	elseif action == "haggle" then
		local ask = payload.price
		if not V.num(ask, 1, cust.fair * 10) then
			return { ok = false }
		end
		ask = math.floor(ask)
		if ask <= cust.offer then
			local ok = accept(player, cust, ask)
			return { ok = ok, done = ok }
		end
		cust.rounds += 1
		local chance = 1 - (cust.arch.haggle or 0.5) * (ask - cust.offer) / math.max(1, cust.max - cust.offer)
		if ask <= cust.max and rng:NextNumber() < chance then
			local ok = accept(player, cust, ask)
			return { ok = ok, done = ok, price = ask }
		end
		if cust.rounds >= Config.MaxHaggleRounds or ask > cust.max * 1.6 then
			say(cust, "reject", nil, 5)
			leave(cust)
			advance(player)
			return { ok = true, done = true, walked = true }
		end
		-- counter offer: meet partway
		cust.offer = math.floor(math.min(cust.max, cust.offer + (ask - cust.offer) * Rand.range(rng, 0.25, 0.5)))
		local text = say(cust, "haggle", { price = money(cust.offer) }, 6)
		return { ok = true, counter = cust.offer, text = text, offer = offerPayload(cust) }
	end
	return { ok = false }
end

----------------------------------------------------------------------------------------------------
-- pickup and payment
----------------------------------------------------------------------------------------------------
local function pay(player: Player, cust, job)
	local verdict = job.verdict or RepairService.assess(job)
	local p = DataService.get(player)
	if not p then
		return
	end
	local waited = os.clock() - (cust.waitStart or os.clock())
	local patience = (cust.patienceEnd or os.clock()) - (cust.waitStart or os.clock())
	local harsh = cust.arch.harsh or 0.4
	if verdict.fixed then
		local stars = verdict.stars
		if patience > 0 and waited / patience > 0.7 then
			stars -= 1
		end
		if rng:NextNumber() < harsh * 0.5 then
			stars -= 1
		end
		stars = math.clamp(stars, 1, 5)
		local tip = 0
		local staffList = (DataService.get(player) or {}).staff
		if stars >= 4 and rng:NextNumber() < (cust.arch.tip or 0.2) * (1 + math.max(-20, comfortOf(player)) / 100) * math.max(0.3, 1 + Employees.effect(staffList, "tips") + sumItems(player, "tips")) then
			tip = math.floor(job.price * Rand.range(rng, 0.08, 0.22))
		end
		-- the scammer bolts instead of paying, half of the time
		if cust.arch.id == "scammer" and rng:NextNumber() < 0.55 then
			cust.state = "fleeing"
			NpcService.say(cust.model, if cust.lang == "en" then "Thanks! Bye!" else "Sağ ol usta, hadi eyvallah!", 3)
			CustomerService.robbed:Fire(player, cust, job)
			RepairService.removeJob(player, job.id)
			return
		end
		-- step-by-step hints cost a share of the price (and the tip); the difficulty scales the pay
		local pay = math.floor(job.price * difficultyOf(player).pay)
		if (job.assist or 0) > 0 then
			pay = math.floor(pay * (1 - 0.08 * job.assist))
			tip = 0
		end
		DataService.money(player, pay + tip, "repair")
		QuestService.bump(player, "deliver")
		local diff = 1
		for _, fid in job.faults or {} do
			local f = Faults.get(fid)
			diff = math.max(diff, f and f.difficulty or 1)
		end
		DataService.addXp(player, math.floor((15 + diff * 12 + stars * 3) * (1 + sumItems(player, "xp"))))
		DataService.rep(player, (stars - 2.5) * 1.2)
		p.stats.repairs += 1
		if stars == 5 then
			p.stats.perfect += 1
			QuestService.bump(player, "perfect")
		end
		local text = say(cust, if stars >= 4 then "happy" else "meh", nil, 6)
		if stars >= 5 then
			NpcService.emote(cust.model, "cheer")
		elseif stars == 4 then
			NpcService.emote(cust.model, "wave")
		end
		if tip > 0 then
			task.delay(2.5, function()
				if cust.model then
					NpcService.say(cust.model, line(cust, "tip"), 4)
				end
			end)
		end
		DataService.review(player, stars, text, cust.name)
		Net.push(player, "paid", { name = cust.name, price = pay, tip = tip, stars = stars, text = text, assisted = job.assist or 0 })
	else
		local text = say(cust, "notFixed", nil, 6)
		DataService.rep(player, -4 * (1 + harsh))
		DataService.review(player, 1, text, cust.name)
		p.stats.failed += 1
		Net.push(player, "paid", { name = cust.name, price = 0, tip = 0, stars = 1, text = text, failed = true, verdict = verdict })
	end
	RepairService.removeJob(player, job.id)
end

local function pickup(player: Player, job)
	local cid = job.customer and job.customer.id
	local cust = cid and byId[cid]
	if not cust or cust.owner ~= player then
		RepairService.removeJob(player, job.id)
		return
	end
	cust.state = "pickup"
	task.spawn(function()
		if not cust.model or not cust.model.Parent then
			-- they stepped out: walk back in from the street
			local street = point(player, "Street")
			if not street then
				return
			end
			cust.model = NpcService.spawn({ look = cust.arch.look, gender = cust.gender, name = cust.name, cf = street.CFrame * CFrame.new(Rand.range(rng, -30, 30), 3, 0), tag = "Customer" })
			cust.model:SetAttribute("CustomerId", cust.id)
			NpcService.tag(cust.model, cust.name)
			NpcService.walkPath(cust.model, { point(player, "Outside"), point(player, "Door") })
		end
		if cust.seat then
			cust.seat:SetAttribute("Reserved", nil)
			cust.seat = nil
		end
		say(cust, "pickup", nil, 3)
		local cf = point(player, "CounterFront")
		if cf and cust.model then
			NpcService.walkTo(cust.model, cf.Position + Vector3.new(rng:NextNumber() * 2 - 1, 0, 0))
		end
		task.wait(1)
		if cust.gone then
			return
		end
		pay(player, cust, job)
		if cust.state == "fleeing" then
			local exit = point(player, "ThiefExit")
			CustomerService.flee(cust, exit)
		else
			task.wait(2)
			leave(cust)
		end
	end)
end

-- A runner heading for the exit; the owner can catch them (handled by ThiefService's prompt).
function CustomerService.flee(cust, exit: BasePart?)
	if not cust.model then
		return
	end
	local hum = cust.model:FindFirstChildOfClass("Humanoid")
	if hum then
		hum.WalkSpeed = 15
	end
	cust.model:SetAttribute("Runner", true)
	cust.model:AddTag("Runner")
	task.spawn(function()
		local path = { point(cust.owner, "Door"), point(cust.owner, "Outside") }
		if exit then
			table.insert(path, exit)
		end
		NpcService.walkPath(cust.model, path, true)
		if not cust.gone and cust.state == "fleeing" then
			if cust.owner.Parent then
				Net.push(cust.owner, "toast", { key = "scammer_escaped", vars = { name = cust.name } })
				DataService.rep(cust.owner, -1)
			end
			removeCustomer(cust)
		end
	end)
end

-- Called when a runner is caught: they pay up (with a little extra for the trouble).
function CustomerService.caught(cust, catcher: Player?)
	if cust.gone or cust.state ~= "fleeing" then
		return false
	end
	cust.state = "caught"
	local player = cust.owner
	local amount = math.floor((cust.price or 50) * 1.25)
	DataService.money(player, amount, "caught")
	DataService.addXp(player, 30)
	local p = DataService.get(player)
	if p then
		p.stats.caught += 1
	end
	QuestService.bump(catcher or player, "catch")
	NpcService.say(cust.model, if cust.lang == "en" then "OK OK! Here's your money!" else "Tamam tamam! Al paranı!", 4)
	Net.push(player, "toast", { key = "caught_scammer", vars = { amount = amount, by = catcher and catcher.DisplayName or "" } })
	task.delay(2.5, function()
		leave(cust)
	end)
	return true
end

function CustomerService.byModel(model: Instance)
	local id = model:GetAttribute("CustomerId")
	return id and byId[id] or nil
end

function CustomerService.get(id: string)
	return byId[id]
end

function CustomerService.ofShop(player: Player)
	return shops[player]
end

-- Lets a receptionist take the counter: accepts jobs the shop can handle.
function CustomerService.autoServe(player: Player, cust): boolean
	if cust.state ~= "counter" then
		return false
	end
	if cust.arch.special == "stolen_offer" then
		say(cust, "declined", nil, 3)
		leave(cust)
		advance(player)
		return true
	end
	local owned = DataService.owned(player)
	for _, fid in cust.jobData.faults or {} do
		local f = Faults.get(fid)
		for _, t in f and f.tools or {} do
			if not owned[t] then
				say(cust, "declined", nil, 3)
				leave(cust)
				advance(player)
				return true
			end
		end
	end
	return accept(player, cust, math.floor((cust.offer + cust.max) / 2))
end

----------------------------------------------------------------------------------------------------
-- lifecycle
----------------------------------------------------------------------------------------------------
local function tick()
	local now = os.clock()
	for player, s in shops do
		local shop = PlotService.shopOf(player)
		local p = DataService.get(player)
		if not shop or not p then
			continue
		end
		-- spawning
		local active = 0
		for _, c in s.list do
			if c.state == "arrive" or c.state == "queue" or c.state == "counter" then
				active += 1
			end
		end
		local lvl = Upgrades.levels[p.shop.level]
		-- (nobody comes before the grand opening)
		-- the first repairs are done one at a time: no new customer while a job is still waiting
		local gated = (p.stats.repairs or 0) < Config.LearningRepairs - 1 and next(RepairService.jobs(player)) ~= nil
		if p.opened ~= false and not gated and not player:GetAttribute("PowerCut") and now >= s.next and active < (lvl and lvl.queue or 2) + 1 and total < Config.MaxCustomersPerServer then
			local attract = sumItems(player, "attract")
			local speed = (1 + attract / 40 + (p.rep - 50) / 100 + (p.shop.level - 1) * 0.08) * (1 + Employees.effect(p.staff, "customers"))
			local interval = math.max(Config.CustomerSpawnMin, Config.CustomerSpawnBase / math.max(0.3, speed)) * Rand.range(rng, 0.7, 1.3) * difficultyOf(player).spawn
			-- a newcomer gets time to learn: the first repairs come slowly
			if (p.stats.repairs or 0) < Config.LearningRepairs then
				interval *= 1.8
			end
			s.next = now + interval
			task.spawn(spawnCustomer, player)
		end
		-- patience, nagging
		for _, c in table.clone(s.list) do
			if c.gone then
				continue
			end
			if (c.state == "queue" or c.state == "counter") and c.patienceEnd and now > c.patienceEnd then
				say(c, "angry", nil, 5)
				DataService.rep(player, -1.5)
				leave(c)
				advance(player)
			elseif c.state == "waiting" then
				local job = c.job and RepairService.job(player, c.job)
				if not job then
					leave(c)
				elseif now > c.patienceEnd and job.status ~= "ready" then
					RepairService.removeJob(player, job.id)
					DataService.rep(player, -5 * (1 + (c.arch.harsh or 0.4)))
					DataService.review(player, 1, line(c, "angry"), c.name)
					Net.push(player, "toast", { key = "customer_left", vars = { name = c.name } })
					if c.seat then
						c.seat:SetAttribute("Reserved", nil)
						c.seat = nil
					end
					if c.model and c.model.Parent then
						say(c, "angry", nil, 5)
						leave(c)
					else
						removeCustomer(c)
					end
				elseif c.model and c.model.Parent then
					local every = c.arch.nag or 55
					if not c.lastNag or now - c.lastNag > every then
						c.lastNag = now + rng:NextNumber() * 10
						if c.arch.nag or rng:NextNumber() < 0.35 then
							say(c, "nag", nil, 5)
						end
					end
					-- somebody waiting around fidgets now and then: a laugh, a point, a little dance
					if not c.nextFidget then
						c.nextFidget = now + 15 + rng:NextNumber() * 40
					elseif now > c.nextFidget then
						c.nextFidget = now + 25 + rng:NextNumber() * 50
						local kind = if c.arch.look == "kid" or c.arch.look == "gamer" or c.arch.look == "streamer" then (if rng:NextNumber() < 0.5 then "dance" else "laugh") else (if rng:NextNumber() < 0.5 then "laugh" else "point")
						NpcService.emote(c.model, kind)
					end
				end
			end
		end
	end
end

function CustomerService.init() end

function CustomerService.start()
	game:GetService("ProximityPromptService").PromptTriggered:Connect(function(prompt, player)
		if prompt.Name ~= "TalkPrompt" then
			return
		end
		local cust = byId[prompt:GetAttribute("Customer") or ""]
		if not cust or cust.state ~= "counter" then
			return
		end
		if cust.owner ~= player then
			Net.push(player, "toast", { key = "not_your_customer" })
			return
		end
		if cust.arch.special == "stolen_offer" and not cust.sale then
			makeSale(cust)
		end
		if cust.model then
			local char = player.Character
			local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
			if root then
				NpcService.face(cust.model, root.Position)
			end
		end
		Net.push(player, "customer.talk", offerPayload(cust))
	end)
	Net.handle("customer.reply", reply)

	RepairService.jobFinished:Connect(function(player, job)
		if job.customer then
			task.delay(2, pickup, player, job)
		end
	end)

	PlotService.built:Connect(function(player)
		shopState(player)
	end)
	-- the first customer turns up right after the ribbon is cut
	PlotService.opened:Connect(function(player)
		shopState(player).next = os.clock() + 4
	end)
	PlotService.released:Connect(function(player)
		local s = shops[player]
		if s then
			for _, c in table.clone(s.list) do
				removeCustomer(c)
			end
		end
		shops[player] = nil
	end)
	Players.PlayerRemoving:Connect(function(player)
		local s = shops[player]
		if s then
			for _, c in table.clone(s.list) do
				removeCustomer(c)
			end
		end
		shops[player] = nil
	end)

	task.spawn(function()
		while true do
			task.wait(1)
			local ok, err = pcall(tick)
			if not ok then
				warn("[CustomerService] " .. tostring(err))
			end
		end
	end)
end

return CustomerService
