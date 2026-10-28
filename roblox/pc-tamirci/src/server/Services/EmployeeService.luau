-- EmployeeService: hiring at the staff agency, wages, and the staff at work in your shop.
--   technician   picks a waiting job, sits at a free bench and repairs it step by step (TechBot);
--                careless ones occasionally leave a mistake the customer will notice
--   receptionist serves customers at the counter when you're busy
--   manager      orders missing parts for the technicians, speeds the team up
--   security     stands by the door and chases thieves (ThiefService asks for guards)
--   cleaner      keeps the place tidy: customers are more patient

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
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
local candidateSeed: { [Player]: number } = {}

local LOOK = { technician = "technician", receptionist = "receptionist", manager = "manager", security = "guard", cleaner = "cleaner" }

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

function EmployeeService.guards(player: Player)
	local out = {}
	for _, s in staff[player] or {} do
		if s.rec.role == "security" and s.model and s.model.Parent then
			table.insert(out, s)
		end
	end
	return out
end

-- Comfort that staff add to the shop (cleaner, tea maker...).
function EmployeeService.comfort(player: Player): number
	local n = 0
	for _, s in staff[player] or {} do
		local t = Employees.traitById[s.rec.trait]
		n += (t and t.comfort or 0) + (if s.rec.role == "cleaner" then 6 else 0)
	end
	return n
end

local function point(player: Player, name: string): BasePart?
	local shop = PlotService.shopOf(player)
	return shop and shop.points and shop.points:FindFirstChild(name) or nil
end

local function spotFor(player: Player, s): BasePart?
	local role = s.rec.role
	if role == "receptionist" then
		return point(player, "CounterBack")
	elseif role == "manager" then
		return point(player, "ManagerSpot")
	elseif role == "security" then
		return point(player, "GuardSpot")
	elseif role == "cleaner" then
		return point(player, "CleanerSpot")
	end
	return point(player, "ManagerSpot") or point(player, "CleanerSpot")
end

local function despawnAll(player: Player)
	for _, s in staff[player] or {} do
		s.stop = true
		if s.model then
			NpcService.despawn(s.model)
			s.model = nil
		end
	end
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
		local spot = spotFor(player, s)
		local cf = if spot then spot.CFrame + Vector3.new(0, 3, 0) else shop.info.front * CFrame.new(0, 3, 6)
		s.model = NpcService.spawn({ look = LOOK[rec.role] or "casual", gender = rec.gender, name = rec.name, seed = rec.look, cf = cf, tag = "Staff", speed = 11 })
		s.model:SetAttribute("Staff", rec.role)
		local role = Employees.roles[rec.role]
		NpcService.tag(s.model, (role and role.icon or "") .. " " .. rec.name)
	end
end

----------------------------------------------------------------------------------------------------
-- Technicians
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
		if Rules.compatible(dev, id, part, "en") and (not filter or filter(part)) then
			local pr = Market.price(part)
			if pr < price then
				cheapest, price = part, pr
			end
		end
	end
	if cheapest and DataService.money(player, -math.floor(price * 1.1), "manager_order") then
		DataService.addPart(player, cheapest.id, 1, "new")
		Net.push(player, "toast", { key = "manager_bought", vars = { part = cheapest.name, price = math.floor(price * 1.1) } })
		return cheapest.id
	end
	return nil
end

local function techWork(player: Player, s, bench: number, job)
	local rec = s.rec
	local speed = Employees.speed(rec) * RepairService.workSpeed(player) * (if EmployeeService.has(player, "manager") then 1.1 else 1)
	local stepTime = math.clamp(1.1 / speed, 0.25, 2.2) * EmployeeService.stepScale
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
		-- careless hands: a forgotten fan cable now and then
		if rng:NextNumber() > Employees.success(rec) and job.device.kind == "desktop" then
			for _, id in Rules.FanOrder do
				local c = job.device.nodes["cfan_" .. id]
				if c and c.st == "in" then
					c.st = "out"
					break
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

local function techLoop(player: Player, s)
	while not s.stop and player.Parent do
		task.wait(3 + rng:NextNumber() * 3)
		if s.stop or s.busy then
			continue
		end
		local shop = PlotService.shopOf(player)
		if not shop or not s.model then
			continue
		end
		-- the oldest waiting customer job nobody is stuck on
		local pick = nil
		for _, job in RepairService.jobs(player) do
			local blocked = job.blocked and os.clock() - job.blocked.t < 90
			if job.status == "waiting" and not job.own and not blocked and (not pick or job.created < pick.created) then
				pick = job
			end
		end
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
-- Network
----------------------------------------------------------------------------------------------------
local function candidates(player: Player)
	local seed = candidateSeed[player] or (Market.day() * 1000 + player.UserId % 997)
	candidateSeed[player] = seed
	return Employees.candidates(seed, 8)
end

local function openAgency(player: Player)
	local p = DataService.get(player)
	local lvl = p and Upgrades.levels[p.shop.level]
	Net.push(player, "staff.open", { candidates = candidates(player), staff = p and p.staff or {}, capacity = lvl and lvl.staff or 1 })
end

local function hire(player: Player, payload)
	local p = DataService.get(player)
	if not p or not V.tbl(payload) or not V.id(payload.uid) then
		return { ok = false }
	end
	local cand = nil
	for _, c in candidates(player) do
		if c.uid == payload.uid then
			cand = c
		end
	end
	if not cand then
		return { ok = false, err = "gone" }
	end
	for _, e in p.staff do
		if e.from == cand.uid then
			return { ok = false, err = "already" }
		end
	end
	local role = Employees.roles[cand.role]
	local lvl = Upgrades.levels[p.shop.level]
	if #p.staff >= lvl.staff then
		return { ok = false, err = "capacity" }
	end
	if p.shop.level < (role.minShop or 1) then
		return { ok = false, err = "shop_level", need = role.minShop }
	end
	if (rolesOf(player)[cand.role] or 0) >= role.max then
		return { ok = false, err = "role_max" }
	end
	if not DataService.money(player, -cand.hireCost, "hire") then
		return { ok = false, err = "money" }
	end
	local rec = table.clone(cand)
	rec.from = cand.uid -- the same candidate can't be hired twice
	rec.uid = cand.uid .. "_" .. tostring(os.time() % 100000)
	table.insert(p.staff, rec)
	DataService.touch(player)
	spawnStaff(player)
	EmployeeService.startWork(player)
	EmployeeService.hired:Fire(player, rec)
	return { ok = true }
end

local function fire(player: Player, payload)
	local p = DataService.get(player)
	if not p or not V.tbl(payload) or not V.id(payload.uid) then
		return { ok = false }
	end
	for i, e in p.staff do
		if e.uid == payload.uid then
			table.remove(p.staff, i)
			DataService.touch(player)
			spawnStaff(player)
			EmployeeService.startWork(player)
			return { ok = true }
		end
	end
	return { ok = false }
end

function EmployeeService.startWork(player: Player)
	for _, s in staff[player] or {} do
		if s.rec.role == "technician" and not s.loop then
			s.loop = true
			task.spawn(techLoop, player, s)
		end
	end
end

-- Pays wages at the end of an in-game day; unpaid staff quit.
function EmployeeService.payday()
	for player, p in DataService.all() do
		local total = 0
		for _, e in p.staff do
			total += e.wage
		end
		if total > 0 then
			if DataService.money(player, -total, "wages") then
				Net.push(player, "toast", { key = "wages_paid", vars = { amount = total } })
			else
				local quitter = table.remove(p.staff)
				DataService.touch(player)
				Net.push(player, "toast", { key = "staff_quit", vars = { name = quitter and quitter.name or "" } })
				spawnStaff(player)
				EmployeeService.startWork(player)
			end
		end
	end
end

function EmployeeService.init() end

function EmployeeService.start()
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
	end)
	MarketService.opened:Connect(function(player, service)
		if service == "staff" then
			openAgency(player)
		end
	end)
	Net.handle("staff.hire", hire)
	Net.handle("staff.fire", fire)
	Net.handle("staff.refresh", function(player)
		if not DataService.money(player, -50, "refresh") then
			return { ok = false, err = "money" }
		end
		candidateSeed[player] = rng:NextInteger(1, 1e9)
		openAgency(player)
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
end

return EmployeeService
