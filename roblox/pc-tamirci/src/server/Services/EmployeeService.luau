-- EmployeeService: hiring (six places to find people, interviews), wages, raises, severance, and the
-- staff at work in your shop (Data/Employees has the 22 roles).
--   bench roles  (technician, apprentice, foreman, laptop / board / data specialists, builder) pick a
--                waiting job that suits them, sit at a free bench and repair it step by step (TechBot);
--                careless ones occasionally leave a mistake that a foreman or a QA engineer may catch
--   receptionist serves customers at the counter when you're busy
--   manager      orders missing parts for the technicians, speeds the team up, runs the shop offline
--   security     stands by the door and chases thieves (ThiefService asks for guards); the night
--                watchman does the same outside at night
--   the rest     work through their team effects (Employees.effect) in the other services, and at
--                payday: remote support income, the marketer's reputation, the storekeeper's restock
-- Every morning each employee gains experience (stars) and their morale moves with pay and
-- comfort; an employee with no morale left quits.

local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Parts = require(Shared.Data.Parts)
local Employees = require(Shared.Data.Employees)
local Upgrades = require(Shared.Data.Upgrades)
local Market = require(Shared.Economy.Market)
local Rules = require(Shared.Repair.RepairRules)
local TechBot = require(Shared.Repair.TechBot)

local DataService = require(script.Parent.DataService)
local PlotService = require(script.Parent.PlotService)
local RepairService = require(script.Parent.RepairService)
local CustomerService = require(script.Parent.CustomerService)
local NpcService = require(script.Parent.NpcService)
local MarketService = require(script.Parent.MarketService)

local EmployeeService = {}
EmployeeService.hired = Signal.new()
EmployeeService.stepScale = 1 -- tests run the technicians flat out

local V = Net.V
local rng = Random.new()
-- [player] = { [uid] = { rec, model, busy, job } }
local staff: { [Player]: { [string]: any } } = {}
-- the candidate lists: [player][channel] = seed; interviews done: [player][uid] = true
local candidateSeed: { [Player]: { [string]: number } } = {}
local interviewed: { [Player]: { [string]: boolean } } = {}
local channelOf: { [Player]: string } = {}

-- the consumables a storekeeper keeps in stock: below `low` uses they buy a pack (of the brand
-- the shop has most of)
local RESTOCK = {
	{ sub = "paste", low = 3, default = "paste_arctic_mx4" },
	{ sub = "zip", low = 10, default = "zip_ties" },
	{ sub = "solder", low = 6, default = "solder_wire" },
}
-- where each role stands when it isn't at a bench
local SPOTS = {
	counter = { "CounterBack" },
	register = { "CashierSpot", "CounterBack" },
	manager = { "ManagerSpot" },
	guard = { "GuardSpot" },
	clean = { "CleanerSpot" },
	tea = { "TeaSpot", "CleanerSpot" },
	sales = { "SalesSpot", "ManagerSpot" },
	shelf = { "Shelf_1", "CleanerSpot" },
	qa = { "QASpot", "ManagerSpot" },
	night = { "NightGuardSpot", "Outside" },
}

local function isNight(): boolean
	local t = Lighting.ClockTime
	return t >= Config.NightStart or t < Config.NightEnd
end

local function today(): number
	return Workspace:GetAttribute("Day") or 1
end

local function rolesOf(player: Player)
	local p = DataService.get(player)
	local count = {}
	for _, e in p and p.staff or {} do
		count[e.role] = (count[e.role] or 0) + 1
	end
	return count
end

function EmployeeService.has(player: Player, role: string): boolean
	return (rolesOf(player)[role] or 0) > 0
end

-- Guards on duty: the security staff, and the night watchman while it's dark.
function EmployeeService.guards(player: Player)
	local out = {}
	for _, s in staff[player] or {} do
		if (s.rec.role == "security" or s.rec.role == "night_guard") and s.model and s.model.Parent then
			table.insert(out, s)
		end
	end
	return out
end

-- Is a night watchman standing outside right now?
function EmployeeService.watchman(player: Player): boolean
	for _, s in staff[player] or {} do
		if s.rec.role == "night_guard" and s.model and s.model.Parent then
			return true
		end
	end
	return false
end

-- Comfort that staff add to the shop (cleaner, tea maker, friendly faces...).
function EmployeeService.comfort(player: Player): number
	local p = DataService.get(player)
	return Employees.effect(p and p.staff, "comfort")
end

local function point(player: Player, name: string): BasePart?
	local shop = PlotService.shopOf(player)
	return shop and shop.points and shop.points:FindFirstChild(name) or nil
end

-- Where someone stands: their role's spot, a step to the side for the second one there.
local function spotFor(player: Player, s): CFrame?
	local role = Employees.roles[s.rec.role]
	local names = role and SPOTS[role.spot or ""] or { "ManagerSpot", "CleanerSpot" }
	for _, name in names do
		local pt = point(player, name)
		if pt then
			local k = 0
			for _, other in staff[player] or {} do
				if other ~= s and other.spotName == name and other.model then
					k += 1
				end
			end
			s.spotName = name
			return pt.CFrame * CFrame.new(k * 2.6 * (if k % 2 == 0 then 1 else -1), 0, 0)
		end
	end
	return nil
end

-- Works from outside the shop (no one to see standing around).
local function remote(rec): boolean
	local role = Employees.roles[rec.role]
	return role ~= nil and role.spot == nil and not role.bench
end
EmployeeService.remote = remote

local function despawn(s)
	if s.model then
		NpcService.despawn(s.model)
		s.model = nil
	end
end

local function despawnAll(player: Player)
	for _, s in staff[player] or {} do
		s.stop = true
		despawn(s)
	end
end

local function spawnOne(player: Player, s)
	local shop = PlotService.shopOf(player)
	if not shop or s.model then
		return
	end
	local rec = s.rec
	local role = Employees.roles[rec.role]
	local spot = spotFor(player, s)
	local cf = if spot then spot + Vector3.new(0, 3, 0) else shop.info.front * CFrame.new(0, 3, 6)
	s.model = NpcService.spawn({ look = role and role.look or "casual", gender = rec.gender, name = rec.name, seed = rec.look, cf = cf, tag = "Staff", speed = 11 })
	s.model:SetAttribute("Staff", rec.role)
	NpcService.tag(s.model, (role and role.icon or "") .. " " .. rec.name)
end

local function spawnStaff(player: Player)
	despawnAll(player)
	local p = DataService.get(player)
	local shop = PlotService.shopOf(player)
	if not p or not shop then
		return
	end
	local list = {}
	staff[player] = list
	for _, rec in p.staff do
		local s = { rec = rec }
		list[rec.uid] = s
		local role = Employees.roles[rec.role]
		if not remote(rec) and not (role and role.night and not isNight()) then
			spawnOne(player, s)
		end
	end
end

----------------------------------------------------------------------------------------------------
-- Bench work
----------------------------------------------------------------------------------------------------
-- A part from the owner's inventory for node `id`; the manager buys one if nothing fits.
local function pickPart(player: Player, dev, id: string, filter, canBuy: boolean): string?
	local p = DataService.get(player)
	if not p then
		return nil
	end
	local tn = Rules.tnode(dev, id)
	local best = nil
	for _, item in p.inv do
		local part = Parts.get(item.part)
		if part and part.cat == tn.cat and not item.broken and Rules.compatible(dev, id, part, "en") and (not filter or filter(part)) then
			if not best or item.cond > best.cond then
				best = item
			end
		end
	end
	if best then
		return best.part
	end
	if not canBuy then
		return nil
	end
	local cheapest, price = nil, math.huge
	for _, part in Parts.byCat[tn.cat] or {} do
		if not part.own and Rules.compatible(dev, id, part, "en") and (not filter or filter(part)) then
			local pr = Market.price(part)
			if pr < price then
				cheapest, price = part, pr
			end
		end
	end
	-- (a haggler on the team gets the supplier down a little)
	local cost = math.floor(price * 1.1 * (1 - math.min(0.2, Employees.effect(p.staff, "discount"))))
	if cheapest and DataService.money(player, -cost, "manager_order") then
		DataService.addPart(player, cheapest.id, 1, "new")
		Net.push(player, "toast", { key = "manager_bought", vars = { part = cheapest.name, price = cost } })
		return cheapest.id
	end
	return nil
end

-- How fast someone works on a job: their own speed, how well it suits them, the team around them.
function EmployeeService.workRate(player: Player, rec, job): number
	local p = DataService.get(player)
	local fit = Employees.fit(rec, job.device and job.device.kind, job.faults, job.requestId)
	local night = if isNight() then Employees.traitSum(rec, "nightSpeed") else 0
	return Employees.speed(rec) * fit * (1 + night) * RepairService.workSpeed(player) * (1 + Employees.effect(p and p.staff, "teamSpeed") + Upgrades.total(p and p.shop.items, "staffSpeed"))
end

-- A forgotten fan cable: does someone catch it before the customer does?
local function qaCatch(player: Player, rec): string?
	local p = DataService.get(player)
	local best, chance = nil, 0
	for _, e in p and p.staff or {} do
		if e ~= rec then
			local c = Employees.effect({ e }, "catchMistake")
			if c > chance then
				best, chance = e, c
			end
		end
	end
	if best and rng:NextNumber() < math.min(0.95, chance) then
		return best.name
	end
	return nil
end
EmployeeService._qaCatch = qaCatch

-- (the tests load their own dice)
function EmployeeService._setRng(r)
	rng = r or Random.new()
end

local function techWork(player: Player, s, bench: number, job)
	local rec = s.rec
	local stepTime = math.clamp(1.1 / EmployeeService.workRate(player, rec, job), 0.25, 2.6) * EmployeeService.stepScale
	local _, bonus = Employees.fit(rec, job.device and job.device.kind, job.faults, job.requestId)
	local owned = DataService.owned(player)
	local missingTool = nil
	local bot = TechBot.new(job.device, {
		ctx = function(_, _, tool)
			if not owned[tool] then
				missingTool = tool
			end
			return RepairService.ctx(player, job, tool, owned)
		end,
		pickPart = function(id, filter)
			return pickPart(player, job.device, id, filter, EmployeeService.has(player, "manager"))
		end,
		onStep = function()
			RepairService.publish(player, bench)
			if stepTime > 0 then
				task.wait(stepTime)
			end
			if s.stop or not player.Parent then
				error({ stopped = true })
			end
		end,
	})
	local ok, err = pcall(function()
		for _, fid in job.faults or {} do
			bot:fix(fid)
		end
		if job.requestId then
			bot:fulfil(job.requestId, job.request)
		end
		bot:reassemble()
		-- careless hands: a forgotten fan cable now and then (unless someone checks the work)
		local p = DataService.get(player)
		local quality = Upgrades.total(p and p.shop.items, "quality")
		if rng:NextNumber() > math.min(0.99, Employees.success(rec) + bonus + quality) and job.device.kind == "desktop" then
			local checker = qaCatch(player, rec)
			if checker then
				Net.push(player, "toast", { key = "qa_caught", vars = { name = checker, tech = rec.name } })
			else
				for _, id in Rules.FanOrder do
					local c = job.device.nodes["cfan_" .. id]
					if c and c.st == "in" then
						c.st = "out"
						break
					end
				end
			end
		end
		bot:reassemble()
	end)
	if ok then
		local done, info = RepairService.finish(player, job.id)
		if done then
			Net.push(player, "toast", { key = "tech_done", vars = { name = rec.name, job = job.name, fixed = info.verdict.fixed } })
		end
		return
	end
	if type(err) == "table" and err.stopped then
		return
	end
	-- couldn't finish: leave it for the boss
	local reason = "stuck"
	local detail = nil
	if type(err) == "table" and err.needPart then
		reason = "need_part"
		detail = err.needPart
	elseif missingTool then
		reason = "need_tool"
		detail = missingTool
	end
	job.blocked = { reason = reason, detail = detail, by = rec.name, t = os.clock() }
	RepairService.clearBench(player, bench)
	Net.push(player, "toast", { key = "tech_blocked", vars = { name = rec.name, job = job.name, reason = reason, detail = detail or "" } })
end

-- The job someone at the bench takes next: what suits them best, then the oldest.
function EmployeeService.pickJob(player: Player, rec)
	local pick, pickSpecial = nil, false
	for _, job in RepairService.jobs(player) do
		local blocked = job.blocked and os.clock() - job.blocked.t < 90
		if job.status == "waiting" and not job.own and not blocked and Employees.canTake(rec, job.faults, job.requestId) then
			local _, _, special = Employees.fit(rec, job.device and job.device.kind, job.faults, job.requestId)
			if not pick or (special and not pickSpecial) or (special == pickSpecial and job.created < pick.created) then
				pick, pickSpecial = job, special
			end
		end
	end
	return pick
end

local function techLoop(player: Player, s)
	while not s.stop and player.Parent do
		task.wait(3 + rng:NextNumber() * 3)
		if s.stop or s.busy then
			continue
		end
		local shop = PlotService.shopOf(player)
		if not shop or not s.model or player:GetAttribute("PowerCut") then
			-- (no work without electricity)
			continue
		end
		local pick = EmployeeService.pickJob(player, s.rec)
		if not pick then
			continue
		end
		local bench = RepairService.freeBench(player)
		if not bench then
			continue
		end
		if not RepairService.load(player, bench, pick.id, s.rec.uid) then
			continue
		end
		s.busy = true
		local benchModel = shop.benches[bench]
		local staffPt = point(player, "Staff_" .. bench)
		if staffPt and s.model then
			NpcService.walkTo(s.model, staffPt.Position)
			local stool = benchModel and benchModel:FindFirstChild("Stool") :: Seat?
			NpcService.sit(s.model, stool)
		end
		techWork(player, s, bench, pick)
		s.busy = false
		if s.model then
			local hum = s.model:FindFirstChildOfClass("Humanoid")
			if hum then
				hum.Sit = false
			end
			local spot = spotFor(player, s)
			if spot then
				NpcService.walkTo(s.model, spot.Position)
			end
		end
	end
end

----------------------------------------------------------------------------------------------------
-- Receptionist
----------------------------------------------------------------------------------------------------
local function ownerNearCounter(player: Player): boolean
	local counter = point(player, "CounterBack")
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not counter or not root then
		return false
	end
	return (root.Position - counter.Position).Magnitude < 14 and RepairService.session(player) == nil
end

----------------------------------------------------------------------------------------------------
-- Hiring
----------------------------------------------------------------------------------------------------
local function seedOf(player: Player, channel: string): number
	local seeds = candidateSeed[player] or {}
	candidateSeed[player] = seeds
	-- (new faces every day)
	if seeds.day ~= Market.day() then
		table.clear(seeds)
		seeds.day = Market.day()
	end
	if not seeds[channel] then
		seeds[channel] = Market.day() * 1000 + player.UserId % 997 + #channel * 7919 + string.byte(channel) * 131
	end
	return seeds[channel]
end

local function candidates(player: Player, channel: string?)
	local ch = channel or channelOf[player] or "agency"
	return Employees.candidates(seedOf(player, ch), nil, ch)
end
EmployeeService.candidates = candidates

local function find(player: Player, uid: string)
	for _, ch in Employees.channels do
		if string.sub(uid, 1, 2) == string.sub(ch.id, 1, 2) then
			for _, c in candidates(player, ch.id) do
				if c.uid == uid then
					return c
				end
			end
		end
	end
	return nil
end

local function openAgency(player: Player, channel: string?)
	local p = DataService.get(player)
	local ch = Employees.channelById[channel or channelOf[player] or "agency"] or Employees.channels[1]
	channelOf[player] = ch.id
	local seen = interviewed[player] or {}
	local list = {}
	for _, c in candidates(player, ch.id) do
		table.insert(list, Employees.public(c, seen[c.uid]))
	end
	local lvl = p and Upgrades.level(p.shop.level)
	Net.push(player, "staff.open", { channel = ch.id, candidates = list, staff = p and p.staff or {}, capacity = lvl and lvl.staff or 1, day = today() })
end
EmployeeService.openAgency = openAgency

-- Whether a place will deal with you yet (headhunters want a proper shop, referrals need staff).
local function channelOk(p, ch): (boolean, string?)
	if p.shop.level < (ch.minShop or 1) then
		return false, "shop_level"
	end
	if #p.staff < (ch.needStaff or 0) then
		return false, "need_staff"
	end
	return true
end
EmployeeService.channelOk = channelOk

local function hire(player: Player, payload)
	local p = DataService.get(player)
	if not p or not V.tbl(payload) or not V.id(payload.uid) then
		return { ok = false }
	end
	local cand = find(player, payload.uid)
	if not cand then
		return { ok = false, err = "gone" }
	end
	for _, e in p.staff do
		if e.from == cand.uid then
			return { ok = false, err = "already" }
		end
	end
	local role = Employees.roles[cand.role]
	local ch = Employees.channelById[cand.channel]
	local lvl = Upgrades.level(p.shop.level)
	if #p.staff >= lvl.staff then
		return { ok = false, err = "capacity" }
	end
	if p.shop.level < (role.minShop or 1) then
		return { ok = false, err = "shop_level", need = role.minShop }
	end
	local open, why = channelOk(p, ch)
	if not open then
		return { ok = false, err = why }
	end
	if (rolesOf(player)[cand.role] or 0) >= role.max then
		return { ok = false, err = "role_max" }
	end
	if cand.hireCost > 0 and not DataService.money(player, -cand.hireCost, "hire") then
		return { ok = false, err = "money" }
	end
	local rec = table.clone(cand)
	rec.from = cand.uid -- the same candidate can't be hired twice
	rec.uid = cand.uid .. "_" .. tostring(os.time() % 100000)
	rec.hired = today()
	rec.days = 0
	rec.xp = 0
	rec.morale = cand.morale or 70
	rec.known = interviewed[player] and interviewed[player][cand.uid] or nil
	table.insert(p.staff, rec)
	DataService.touch(player)
	spawnStaff(player)
	EmployeeService.startWork(player)
	EmployeeService.hired:Fire(player, rec)
	return { ok = true }
end

local function interview(player: Player, payload)
	if not V.tbl(payload) or not V.id(payload.uid) then
		return { ok = false }
	end
	local cand = find(player, payload.uid)
	if not cand then
		return { ok = false, err = "gone" }
	end
	interviewed[player] = interviewed[player] or {}
	interviewed[player][cand.uid] = true
	return { ok = true, cand = Employees.public(cand, true) }
end

local function fire(player: Player, payload)
	local p = DataService.get(player)
	if not p or not V.tbl(payload) or not V.id(payload.uid) then
		return { ok = false }
	end
	for i, e in p.staff do
		if e.uid == payload.uid then
			local pay = Employees.severance(e)
			if pay > 0 and not DataService.money(player, -pay, "severance") then
				return { ok = false, err = "money" }
			end
			table.remove(p.staff, i)
			DataService.touch(player)
			spawnStaff(player)
			EmployeeService.startWork(player)
			return { ok = true, severance = pay }
		end
	end
	return { ok = false }
end

-- A 10 % raise (one a day per person) lifts their morale.
local function raise(player: Player, payload)
	local p = DataService.get(player)
	if not p or not V.tbl(payload) or not V.id(payload.uid) then
		return { ok = false }
	end
	for _, e in p.staff do
		if e.uid == payload.uid then
			if e.lastRaise == today() then
				return { ok = false, err = "raised_today" }
			end
			e.lastRaise = today()
			e.wage = math.floor((e.wage or 0) * 1.1 / 5 + 0.5) * 5
			e.morale = math.min(100, Employees.moraleOf(e) + 15)
			DataService.touch(player)
			return { ok = true, wage = e.wage }
		end
	end
	return { ok = false }
end

function EmployeeService.startWork(player: Player)
	for _, s in staff[player] or {} do
		local role = Employees.roles[s.rec.role]
		if role and role.bench and not s.loop then
			s.loop = true
			task.spawn(techLoop, player, s)
		end
	end
end

----------------------------------------------------------------------------------------------------
-- Payday
----------------------------------------------------------------------------------------------------
local function quit(player: Player, p, e, key: string)
	local i = table.find(p.staff, e)
	if i then
		table.remove(p.staff, i)
	end
	Net.push(player, "toast", { key = key, vars = { name = e.name } })
end

-- The storekeeper's morning round: a pack of whatever consumable is running low.
local function restock(player: Player, p): { string }
	local bought = {}
	for _, r in RESTOCK do
		local have, fav, favN = 0, r.default, -1
		for id, n in p.stock do
			local part = Parts.get(id)
			if part and part.sub == r.sub then
				have += n
				if n > favN then
					fav, favN = id, n
				end
			end
		end
		local part = Parts.get(fav)
		if part and have <= r.low and DataService.money(player, -Market.price(part), "restock") then
			DataService.addStock(player, part.id, part.uses or 1)
			table.insert(bought, part.name)
		end
	end
	return bought
end
EmployeeService._restock = restock

-- Wages at the end of an in-game day, then a day of experience and morale for everyone. Staff
-- who aren't paid lose heart (the unhappiest walks out); one with no morale left quits.
function EmployeeService.payday()
	for player, p in DataService.all() do
		if #p.staff == 0 then
			continue
		end
		local total = 0
		for _, e in p.staff do
			total += e.wage or 0
		end
		local paid = DataService.money(player, -total, "wages")
		if paid then
			Net.push(player, "toast", { key = "wages_paid", vars = { amount = total } })
		end
		local ctx = {
			paid = paid,
			teach = Employees.has(p.staff, "foreman"),
			teamMorale = Employees.effect(p.staff, "teamMorale") + Upgrades.total(p.shop.items, "staffMorale"),
			learn = Upgrades.total(p.shop.items, "staffLearn"),
			comfort = Upgrades.total(p.shop.items, "comfort") + Employees.effect(p.staff, "comfort"),
			rng = rng,
		}
		local n0, changed = #p.staff, false
		for _, e in table.clone(p.staff) do
			if Employees.dayPass(e, ctx) == "levelup" then
				if e.role == "apprentice" and (e.skill or 1) >= 3 then
					-- three stars: the apprentice is a technician now (and will want a technician's pay)
					e.role = "technician"
					changed = true
					Net.push(player, "toast", { key = "staff_promoted", vars = { name = e.name } })
				else
					Net.push(player, "toast", { key = "staff_levelup", vars = { name = e.name, stars = e.skill } })
				end
			end
		end
		if not paid then
			-- the unhappiest one walks out
			local worst = nil
			for _, e in p.staff do
				if not Employees.hasTrait(e, "loyal") and (not worst or Employees.moraleOf(e) < Employees.moraleOf(worst)) then
					worst = e
				end
			end
			if worst then
				quit(player, p, worst, "staff_quit")
			end
		end
		for _, e in table.clone(p.staff) do
			if Employees.moraleOf(e) < 12 then
				quit(player, p, e, "staff_quit_morale")
			end
		end
		-- light fingers: a cheap part goes missing now and then
		for _, e in p.staff do
			if Employees.hasTrait(e, "sticky") and rng:NextNumber() < 0.15 then
				for i, item in p.inv do
					local part = Parts.get(item.part)
					if part and part.price <= 80 then
						table.remove(p.inv, i)
						Net.push(player, "toast", { key = "staff_sticky", vars = { part = part.name, name = e.name } })
						break
					end
				end
			end
		end
		-- the office: remote support income, the marketer's posts, the storekeeper's round
		local support = 0
		for _, e in p.staff do
			if e.role == "support" then
				support += math.floor(Employees.effect({ e }, "support") * Employees.moraleFactor(e))
			end
		end
		if support > 0 then
			DataService.money(player, support, "support")
			Net.push(player, "toast", { key = "support_income", vars = { amount = support } })
		end
		local rep = Employees.effect(p.staff, "rep")
		if rep > 0 then
			DataService.rep(player, rep)
		end
		if Employees.has(p.staff, "storekeeper") then
			local bought = restock(player, p)
			if #bought > 0 then
				Net.push(player, "toast", { key = "staff_restock", vars = { list = table.concat(bought, ", ") } })
			end
		end
		DataService.touch(player)
		-- (only when the team changed: a respawn would pull the technicians off their benches)
		if (changed or #p.staff ~= n0) and PlotService.shopOf(player) then
			spawnStaff(player)
			EmployeeService.startWork(player)
		end
	end
end

-- A shop with a manager keeps working while its owner is away: the bench staff earn by the hour
-- (up to Config.OfflineEarningsMaxHours), paid out when the owner comes back.
function EmployeeService.offlineEarnings(player: Player, p): number
	local last = p.last or 0
	if last <= 0 then
		return 0
	end
	local hours = math.min(Config.OfflineEarningsMaxHours, (os.time() - last) / 3600)
	if hours < 0.1 then
		return 0
	end
	local manager, perHour = false, 0
	for _, e in p.staff do
		local role = Employees.roles[e.role]
		if e.role == "manager" then
			manager = true
		elseif role and role.bench then
			perHour += (30 + (e.skill or 1) * 12) * (role.speed or 1)
		elseif e.role == "receptionist" or e.role == "salesperson" then
			perHour += 15
		elseif e.role == "support" then
			perHour += 10
		end
	end
	if not manager or perHour <= 0 then
		return 0
	end
	local total = math.floor(perHour * hours)
	DataService.money(player, total, "offline")
	Net.push(player, "toast", { key = "offline_income", vars = { amount = total, hours = string.format("%.1f", hours) } })
	return total
end

function EmployeeService.init() end

function EmployeeService.start()
	DataService.loaded:Connect(function(player, p)
		EmployeeService.offlineEarnings(player, p)
	end)
	PlotService.built:Connect(function(player)
		spawnStaff(player)
		EmployeeService.startWork(player)
	end)
	PlotService.released:Connect(function(player)
		despawnAll(player)
		staff[player] = nil
	end)
	Players.PlayerRemoving:Connect(function(player)
		despawnAll(player)
		staff[player] = nil
		candidateSeed[player] = nil
		interviewed[player] = nil
		channelOf[player] = nil
	end)
	MarketService.opened:Connect(function(player, service)
		if service == "staff" then
			openAgency(player)
		end
	end)
	Net.handle("staff.hire", hire)
	Net.handle("staff.fire", fire)
	Net.handle("staff.raise", raise)
	Net.handle("staff.interview", interview)
	Net.handle("staff.channel", function(player, payload)
		if not V.tbl(payload) or not V.id(payload.id) or not Employees.channelById[payload.id] then
			return { ok = false }
		end
		openAgency(player, payload.id)
		return { ok = true }
	end)
	Net.handle("staff.refresh", function(player)
		local ch = Employees.channelById[channelOf[player] or "agency"] or Employees.channels[1]
		if ch.refresh > 0 and not DataService.money(player, -ch.refresh, "refresh") then
			return { ok = false, err = "money" }
		end
		seedOf(player, ch.id)
		candidateSeed[player][ch.id] = rng:NextInteger(1, 1e9)
		openAgency(player, ch.id)
		return { ok = true }
	end)
	-- receptionists take the counter when you're not there
	CustomerService.atCounter:Connect(function(player, cust)
		if not EmployeeService.has(player, "receptionist") then
			return
		end
		task.delay(6, function()
			if cust.state == "counter" and not ownerNearCounter(player) then
				CustomerService.autoServe(player, cust)
			end
		end)
	end)
	-- the night watchman comes on at dusk and goes home at dawn
	task.spawn(function()
		while true do
			task.wait(5)
			local night = isNight()
			for player, list in staff do
				for _, s in list do
					if s.rec.role == "night_guard" and not s.stop then
						if night and not s.model then
							spawnOne(player, s)
						elseif not night and s.model then
							despawn(s)
						end
					end
				end
			end
		end
	end)
end

return EmployeeService
