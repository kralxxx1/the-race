-- Business: contracts from the internet café (machines paid one by one, bonus when all work) and
-- the PC showcase (a finished own build goes on a stand and a walk-in buyer pays for it).

local Engine = require("../lib/Engine")
local Mock = require("../lib/Mock")
local task = require("@lune/task")

return function(T)
	Engine.context = "server"
	local game = Engine.load("build/PCTamirci.rbxlx")
	local pushes = {}
	Engine.onFireClient = function(_, player, channel, data)
		table.insert(pushes, { player = player, channel = channel, data = data })
	end
	local function lastPush(channel: string, key: string?)
		for i = #pushes, 1, -1 do
			local p = pushes[i]
			if p.channel == channel and (key == nil or (type(p.data) == "table" and p.data.key == key)) then
				return p.data
			end
		end
		return nil
	end
	local function waitFor(fn, timeout: number?, what: string?)
		local t0 = os.clock()
		while os.clock() - t0 < (timeout or 5) do
			local v = fn()
			if v then
				return v
			end
			task.wait(0.03)
		end
		error("timed out waiting for " .. (what or "condition"))
	end

	local started = false
	task.spawn(function()
		Engine.runScript(game:GetService("ServerScriptService").Server.Main)
		started = true
	end)
	waitFor(function()
		return started
	end, 30, "server start")
	local Services = game:GetService("ServerScriptService").Server.Services
	local DataService = Engine.require(Services.DataService)
	local PlotService = Engine.require(Services.PlotService)
	local RepairService = Engine.require(Services.RepairService)
	local ContractService = Engine.require(Services.ContractService)
	local ShowcaseService = Engine.require(Services.ShowcaseService)
	local QuestService = Engine.require(Services.QuestService)
	local EmployeeService = Engine.require(Services.EmployeeService)
	local BillsService = Engine.require(Services.BillsService)
	local Bills = Engine.mod("ReplicatedStorage.Shared.Data.Bills")
	local DeviceGen = Engine.mod("ReplicatedStorage.Shared.Repair.DeviceGen")
	local TechBot = Engine.mod("ReplicatedStorage.Shared.Repair.TechBot")
	local rf = game:GetService("ReplicatedStorage").Remotes.Request
	local pps = game:GetService("ProximityPromptService")
	local CS = game:GetService("CollectionService")

	local player = Engine.addPlayer("Mert")
	Engine.spawnCharacter(player)
	waitFor(function()
		return DataService.get(player) and PlotService.shopOf(player)
	end, 8, "shop")
	PlotService.open(player)
	local function request(action: string, payload)
		return rf.OnServerInvoke(player, action, payload)
	end

	-- repairs a job the way a careful technician would (parts appear as needed)
	local function repair(job)
		local bot = TechBot.new(job.device, {
			ctx = function(_, _, tool)
				local c = RepairService.ctx(player, job, tool, nil)
				c.owned = setmetatable({}, { __index = function()
					return true
				end })
				c.usePaste = function()
					return 0.85
				end
				c.useSolder = function()
					return true
				end
				c.useTies = function()
					return true
				end
				local take = c.takePart
				c.takePart = function(source, partId, uid)
					if source == "inv" then
						DataService.addPart(player, partId, 1, "new")
					end
					return take(source, partId, uid)
				end
				return c
			end,
		})
		for _, fid in job.faults or {} do
			bot:fix(fid)
		end
		if job.requestId then
			bot:fulfil(job.requestId, job.request)
		end
		bot:reassemble()
	end

	T.test("business: an internet café contract is paid per machine plus a bonus", function()
		local p = DataService.get(player)
		p.level = 4
		p.money = 1000
		local point
		for _, a in CS:GetTagged("ServicePoint") do
			if a:GetAttribute("Service") == "contracts" and a:GetAttribute("Poi") == "internet_cafe" then
				point = a
			end
		end
		T.ok(point ~= nil, "café counter")
		player.Character:PivotTo(point.CFrame)
		pps.PromptTriggered:Fire(point:FindFirstChildOfClass("ProximityPrompt"), player)
		local open = waitFor(function()
			return lastPush("contracts.open")
		end, 3, "contracts window")
		T.ok(not open.locked and #open.offers >= 2, "offers")
		local offer = open.offers[1]
		local r = request("contracts.accept", { poi = "internet_cafe", key = offer.key })
		T.ok(r.ok, "accept: " .. tostring(r.err))
		local c = ContractService.active(player)
		T.ok(c and c.total == r.count, "active contract")
		T.eq(request("contracts.accept", { poi = "internet_cafe", key = offer.key }).err, "contract_busy", "one at a time")
		local money0 = p.money
		local jobs = {}
		for _, j in RepairService.jobs(player) do
			if j.contract then
				table.insert(jobs, j)
			end
		end
		T.eq(#jobs, c.total, "machines in the job list")
		for _, j in jobs do
			repair(j)
			local ok, info = RepairService.finish(player, j.id)
			T.ok(ok and info.verdict.fixed, "machine fixed: " .. tostring(info and info.verdict and info.verdict.stage))
		end
		T.ok(ContractService.active(player) == nil, "contract closed")
		local expected = c.pay * c.total + c.bonus
		T.ok(p.money - money0 >= expected, string.format("paid %d (expected %d)", p.money - money0, expected))
		T.ok(lastPush("toast", "contract_done") ~= nil, "bonus toast")
		for _ in RepairService.jobs(player) do
			error("contract jobs should be gone")
		end
	end)

	T.test("business: the data centre wants the contracts desk", function()
		local p = DataService.get(player)
		p.level = 8
		local point
		for _, a in CS:GetTagged("ServicePoint") do
			if a:GetAttribute("Service") == "contracts" and a:GetAttribute("Poi") == "datacenter" then
				point = a
			end
		end
		player.Character:PivotTo(point.CFrame)
		pps.PromptTriggered:Fire(point:FindFirstChildOfClass("ProximityPrompt"), player)
		local open = lastPush("contracts.open")
		T.ok(open.poi == "datacenter" and open.locked and open.why == "contract_desk", "locked without the desk")
		T.eq(request("contracts.accept", { poi = "datacenter", key = open.offers[1].key }).err, "contract_desk", "refused")
	end)

	T.test("business: daily tasks progress and pay out once", function()
		local p = DataService.get(player)
		p.level = 5
		p.quests = nil
		local qs = QuestService.ensure(player)
		T.eq(#qs.list, 3, "three tasks")
		local again = QuestService.ensure(player)
		T.ok(again == qs, "same tasks all day")
		local q = qs.list[1]
		T.eq(request("quests.claim", { i = 1 }).err, "not_done", "not finished yet")
		if q.id == "earn" then
			DataService.money(player, q.goal, "repair")
		else
			QuestService.bump(player, q.id, q.goal)
		end
		T.ok(q.n >= q.goal, "progress reached the goal")
		local money0 = p.money
		local r = request("quests.claim", { i = 1 })
		T.ok(r.ok and p.money == money0 + q.reward, "reward paid")
		T.ok(not request("quests.claim", { i = 1 }).ok, "only once")
		-- income counts towards an earn task
		p.quests.list[2] = { id = "earn", goal = 500, n = 0, claimed = false, reward = 100, xp = 10 }
		DataService.money(player, 200, "repair")
		DataService.money(player, 999, "daily")
		T.eq(p.quests.list[2].n, 200, "only real income counts")
	end)

	T.test("business: a manager runs the shop while you are away", function()
		local p = DataService.get(player)
		p.staff = { { uid = "m1", role = "manager", skill = 3, wage = 200, name = "Müdür" }, { uid = "t1", role = "technician", skill = 4, wage = 120, name = "Tekno" } }
		p.last = os.time() - 3 * 3600
		local money0 = p.money
		local got = EmployeeService.offlineEarnings(player, p)
		T.ok(got > 100 and p.money == money0 + got, "offline income " .. got)
		p.staff = { { uid = "t1", role = "technician", skill = 4, wage = 120, name = "Tekno" } }
		T.eq(EmployeeService.offlineEarnings(player, p), 0, "nothing without a manager")
		p.staff = {}
	end)

	T.test("business: the city hall board lists the leaders", function()
		local board = CS:GetTagged("Leaderboard")[1]
		T.ok(board ~= nil, "board part")
		-- (earlier specs' servers still tick in this process and share the tag registry, so
		-- paint explicitly instead of waiting for the next round)
		Engine.require(Services.MarketService)._paintBoards()
		local label = waitFor(function()
			local gui = board:FindFirstChild("Leaders")
			return gui and gui:FindFirstChild("Text")
		end, 3, "board text")
		T.ok(string.find(label.Text, player.DisplayName, 1, true) ~= nil, "player listed: " .. label.Text)
	end)

	T.test("business: a finished build sells from the showcase", function()
		local p = DataService.get(player)
		p.money = 500
		p.shop.level = 4
		p.shop.items.showcase = true
		PlotService.build(player)
		local shop = PlotService.shopOf(player)
		local stand = shop.points:FindFirstChild("Showcase_1")
		T.ok(stand ~= nil, "showcase stand")
		local prompt = stand:FindFirstChild("ShowcasePrompt")
		T.ok(prompt ~= nil, "stand prompt")
		-- nothing to show yet
		pushes = {}
		pps.PromptTriggered:Fire(prompt, player)
		T.ok(lastPush("toast", "showcase_none") ~= nil, "nothing finished")
		-- an own project, finished and working
		local dev = DeviceGen.desktop(Mock.Random.new(11), "high")
		local job = RepairService.createJob(player, { device = dev, faults = {}, kind = "refurb", own = true, price = 0 })
		local ok, info = RepairService.finish(player, job.id)
		T.ok(ok and info.verdict.fixed, "finished build works")
		pps.PromptTriggered:Fire(prompt, player)
		T.eq(job.status, "showcase", "on display")
		T.ok(shop.model:FindFirstChild("ShowcasePC_1") ~= nil, "PC on the stand")
		T.eq(request("jobs.sell", { job = job.id }).err, "not_sellable", "can't sell it to the dealer while on display")
		-- a buyer comes by sooner or later
		local money0 = p.money
		for _ = 1, 200 do
			ShowcaseService._sellRound()
			if not RepairService.job(player, job.id) then
				break
			end
		end
		T.ok(RepairService.job(player, job.id) == nil, "sold")
		T.ok(p.money > money0, "paid")
		T.ok(shop.model:FindFirstChild("ShowcasePC_1") == nil, "stand empty again")
	end)

	T.test("business: bills arrive, grow when late, cut the power and get paid", function()
		local p = DataService.get(player)
		p.money = 100000
		p.staff = {}
		p.bills = nil
		local b = BillsService.state(p)
		local day0 = 1000
		-- a morning brings yesterday's utility bill
		BillsService.morning(player, p, day0)
		T.eq(#b.list, 1, "one bill")
		local bill = b.list[1]
		T.eq(bill.kind, "utilities", "utilities")
		local Upgrades = Engine.mod("ReplicatedStorage.Shared.Data.Upgrades")
		local u = Bills.utilities(p.shop.level, Upgrades.level(p.shop.level).benches, p.shop.items)
		T.eq(bill.amount, u.total, "amount from the shop's equipment")
		T.eq(bill.due, day0 + Bills.DueDays, "due date")
		-- the same morning twice changes nothing
		BillsService.morning(player, p, day0)
		T.eq(#b.list, 1, "no double bill")
		-- late: +10 % a day, and three days overdue the power goes
		T.eq(Bills.amountDue(bill, bill.due + 2), math.floor(bill.amount * 1.2 + 0.5), "late fee")
		for d = day0 + 1, bill.due + Bills.CutAfter do
			BillsService.morning(player, p, d)
		end
		T.ok(b.cut == true and player:GetAttribute("PowerCut") == true, "power cut")
		local job = RepairService.createJob(player, { device = DeviceGen.desktop(Mock.Random.new(3), "mid"), faults = {}, kind = "repair", price = 100 })
		RepairService.load(player, 1, job.id)
		T.eq(RepairService.act(player, 1, "press_power", nil, {}, "hand").err, "power_cut", "no power tests in the dark")
		-- paying everything brings it back
		local before = p.money
		local r = request("bills.pay", { id = "all" })
		T.ok(r.ok and r.paid >= 1, "paid")
		T.eq(#b.list, 0, "nothing left")
		T.ok(p.money < before, "money taken")
		T.ok(b.cut == false and not player:GetAttribute("PowerCut"), "power back")
		T.ok(#b.paid >= 1 and b.paid[1].amount > 0, "history")
		RepairService.clearBench(player, 1)
		RepairService.removeJob(player, job.id)
	end)

	T.test("business: rent, social security and tax every seventh morning", function()
		local p = DataService.get(player)
		p.money = 100000
		p.bills = nil
		local b = BillsService.state(p)
		-- a week of business: 5000 in, 1200 out (of which 800 wages)
		DataService.money(player, 5000, "repair")
		DataService.money(player, -400, "parts")
		DataService.money(player, -800, "wages")
		T.eq(b.week.income, 5000, "income booked")
		T.eq(b.week.expense, 1200, "spending booked")
		T.eq(b.week.wages, 800, "wages booked")
		local insured = p.shop.items.insurance
		p.shop.items.insurance = true
		for d = 2000, 2000 + Bills.Week - 1 do
			BillsService.morning(player, p, d)
		end
		p.shop.items.insurance = insured
		local kinds = {}
		for _, bill in b.list do
			kinds[bill.kind] = bill
		end
		T.ok(kinds.rent and kinds.rent.amount == Bills.rent(p.shop.level), "rent")
		T.ok(kinds.insurance and kinds.insurance.amount == Bills.InsurancePerLevel * p.shop.level, "the insurance premium")
		T.ok(kinds.sgk and kinds.sgk.amount == math.floor(800 * Bills.SgkRate + 0.5), "SGK on the wages")
		local profitAtWeek = kinds.tax and kinds.tax.detail.profit
		T.ok(kinds.tax and profitAtWeek > 0 and kinds.tax.amount <= math.floor(profitAtWeek * Bills.TaxRate + 0.5), "tax on the profit")
		T.eq(b.week.income, 0, "a new week")
		-- an unpaid tax bill turns into a penalty and costs reputation
		local rep0 = p.rep
		for d = kinds.tax.due + 1, kinds.tax.due + Bills.FineAfter do
			BillsService.morning(player, p, d)
		end
		local fined = false
		for _, bill in b.list do
			if bill.kind == "fine" then
				fined = true
			end
		end
		T.ok(fined, "tax penalty")
		T.ok(p.rep < rep0, "reputation hit")
		-- with the bank's auto-pay order everything is paid in the morning
		p.shop.items.autopay = true
		BillsService.morning(player, p, kinds.tax.due + Bills.FineAfter + 1)
		T.eq(#b.list, 0, "auto-paid")
		p.shop.items.autopay = nil
	end)

	T.test("business: energy upgrades cut the electricity", function()
		local plain = Bills.utilities(3, 3, {})
		local green = Bills.utilities(3, 3, { solar = true, led_lighting = true })
		T.ok(green.elec < plain.elec * 0.6, "solar + LED: " .. green.elec .. " vs " .. plain.elec)
		local ac = Bills.utilities(3, 3, { ac = true })
		T.ok(ac.elec > plain.elec, "air conditioning uses power")
	end)
	----------------------------------------------------------------------------------------------
	-- Staff
	----------------------------------------------------------------------------------------------
	local Employees = Engine.mod("ReplicatedStorage.Shared.Data.Employees")
	local function dice(roll: number)
		return {
			NextNumber = function()
				return roll
			end,
			NextInteger = function(_, a)
				return a
			end,
		}
	end
	local function staffRec(role: string, extra)
		local r = { uid = role .. "_t", role = role, name = role, gender = "m", skill = 3, wage = 100, trait = "calm", trait2 = "punctual", edu = "highschool", morale = 70, days = 0, xp = 0 }
		for k, v in extra or {} do
			r[k] = v
		end
		return r
	end

	T.test("staff: 22 roles, 50 traits, schooling and six places to look", function()
		local Avatars = Engine.mod("ReplicatedStorage.Shared.Data.Avatars")
		T.eq(#Employees.roleOrder, 22, "roles")
		local groups = {}
		for _, g in Employees.groups do
			groups[g.id] = true
		end
		for _, id in Employees.roleOrder do
			local r = Employees.roles[id]
			T.ok(r and r.name.tr and r.name.en and r.desc.tr and r.desc.en and r.icon and r.wage > 0, "role " .. id)
			T.ok(groups[r.group], id .. " in a group")
			T.ok(Avatars.OUTFITS[r.look] ~= nil, id .. " look " .. tostring(r.look))
		end
		T.ok(#Employees.traits >= 48, "traits: " .. #Employees.traits)
		local seen = {}
		for _, t in Employees.traits do
			T.ok(not seen[t.id], "unique trait " .. t.id)
			seen[t.id] = true
			T.ok(t.name.tr and t.name.en and t.say and t.say.tr and t.say.en, "trait text " .. t.id)
		end
		T.eq(#Employees.channels, 6, "places to look")
		local rolesSeen = {}
		for _, ch in Employees.channels do
			for seed = 1, 12 do
				local list = Employees.candidates(seed * 7919, nil, ch.id)
				T.eq(#list, ch.count, ch.id .. " count")
				for _, c in list do
					rolesSeen[c.role] = true
					T.ok(c.channel == ch.id and string.sub(c.uid, 1, 2) == string.sub(ch.id, 1, 2), "uid " .. c.uid)
					if ch.roles then
						T.ok(table.find(ch.roles, c.role) ~= nil, ch.id .. " offers " .. c.role)
					end
					T.ok(c.skill >= 1 and c.skill <= 5 and c.cvSkill >= c.skill, "skill " .. c.skill .. "/" .. c.cvSkill)
					local edu = Employees.eduById[c.edu]
					T.ok(edu ~= nil and (not ch.uni or edu.uni), "schooling " .. tostring(c.edu))
					T.ok(c.age >= 16 and c.age <= 64, "age " .. c.age)
					T.ok(c.wage >= 5 and c.hireCost >= 0, "pay")
					T.ok(c.trait ~= c.trait2 and not Employees.traitById[c.trait].hidden, "traits")
					local share = Avatars.OUTFITS[Employees.roles[c.role].look].female
					T.ok((c.gender == "f" and share > 0) or (c.gender == "m" and share < 1), "an avatar for " .. c.gender)
				end
			end
		end
		for _, id in Employees.roleOrder do
			T.ok(rolesSeen[id], "candidates for " .. id)
		end
		-- the CV hides the truth until the interview
		local c = Employees.candidates(5, nil, "listing")[1]
		local cv = Employees.public(c, false)
		T.ok(cv.skill == nil and cv.trait2 == nil and cv.cvSkill ~= nil, "CV only")
		local met = Employees.public(c, true)
		T.ok(met.skill == c.skill and met.trait2 == c.trait2 and met.interviewed, "after the interview")
	end)

	T.test("staff: interviews, hiring from each place, raises and severance", function()
		local p = DataService.get(player)
		p.money = 1e6
		p.level = 20
		p.shop.level = 2
		p.staff = {}
		local function easy(list)
			for _, c in list do
				local role = Employees.roles[c.role]
				if role.minShop <= 2 and Employees.count(p.staff, c.role) < role.max then
					return c
				end
			end
			error("no candidate a small shop can hire")
		end
		pushes = {}
		-- a listings site: CVs only until you interview
		EmployeeService.openAgency(player, "listing")
		local open = lastPush("staff.open")
		T.eq(open.channel, "listing", "channel")
		T.eq(#open.candidates, 12, "a dozen applicants")
		T.ok(open.candidates[1].skill == nil and open.candidates[1].trait2 == nil, "the truth is hidden")
		local pick = easy(open.candidates)
		local r = request("staff.interview", { uid = pick.uid })
		T.ok(r.ok and r.cand.skill ~= nil and r.cand.trait2 ~= nil, "interviewed")
		EmployeeService.openAgency(player, "listing")
		for _, c in lastPush("staff.open").candidates do
			if c.uid == pick.uid then
				T.ok(c.interviewed and c.skill == r.cand.skill, "remembered")
			end
		end
		local money0 = p.money
		local h = request("staff.hire", { uid = pick.uid })
		T.ok(h.ok, "hired: " .. tostring(h.err))
		T.eq(p.money, money0 - pick.hireCost, "the fee")
		local first = p.staff[1]
		T.ok(first.known and first.morale == 70 and first.days == 0 and first.skill == r.cand.skill, "the record")
		T.eq(request("staff.hire", { uid = pick.uid }).err, "already", "only once")
		-- the headhunter only works with a proper shop; referrals need someone to refer them
		EmployeeService.openAgency(player, "headhunter")
		T.eq(request("staff.hire", { uid = lastPush("staff.open").candidates[1].uid }).err, "shop_level", "the headhunter wants a bigger shop")
		EmployeeService.openAgency(player, "referral")
		local friend = easy(lastPush("staff.open").candidates)
		p.staff = {}
		T.eq(request("staff.hire", { uid = friend.uid }).err, "need_staff", "nobody to refer them")
		p.staff = { first }
		money0 = p.money
		T.ok(request("staff.hire", { uid = friend.uid }).ok, "a friend of the team")
		T.eq(p.money, money0 - friend.hireCost, "half the usual fee")
		T.ok(friend.hireCost <= friend.wage, "half the usual fee: " .. friend.hireCost)
		T.eq(p.staff[2].morale, 82, "referrals start in good spirits")
		-- the state employment office charges nothing
		EmployeeService.openAgency(player, "iskur")
		local free = easy(lastPush("staff.open").candidates)
		money0 = p.money
		local fh = request("staff.hire", { uid = free.uid })
		T.ok(fh.ok and p.money == money0, "hired for free: " .. tostring(fh.err))
		EmployeeService.openAgency(player, "iskur")
		local more = nil
		for _, c in lastPush("staff.open").candidates do
			if c.uid ~= free.uid and Employees.roles[c.role].minShop <= 2 then
				more = c
			end
		end
		T.eq(request("staff.hire", { uid = more.uid }).err, "capacity", "the shop is full")
		-- a raise lifts morale, once a day
		local e = p.staff[1]
		local w0 = e.wage
		T.ok(request("staff.raise", { uid = e.uid }).ok, "a raise")
		T.eq(e.wage, math.floor(w0 * 1.1 / 5 + 0.5) * 5, "10 % more")
		T.eq(e.morale, 85, "happier")
		T.eq(request("staff.raise", { uid = e.uid }).err, "raised_today", "one a day")
		-- severance: nothing in the first week, then two days' wages a week
		money0 = p.money
		T.ok(request("staff.fire", { uid = e.uid }).ok, "let go")
		T.eq(p.money, money0, "no severance in the first week")
		local e2 = p.staff[1]
		e2.days = 15
		money0 = p.money
		local fr = request("staff.fire", { uid = e2.uid })
		T.ok(fr.ok and fr.severance == 4 * e2.wage, "two weeks: four days' wages")
		T.eq(p.money, money0 - 4 * e2.wage, "paid")
		p.staff = {}
	end)

	T.test("staff: a day at work — stars, morale, quitting and the office's jobs", function()
		local p = DataService.get(player)
		p.money = 100000
		p.shop.level = 5
		p.staff = {
			staffRec("apprentice", { uid = "a1", name = "Çırak Ali", skill = 1, wage = 55 }),
			staffRec("foreman", { uid = "f1", skill = 4, wage = 240 }),
			staffRec("support", { uid = "s1" }),
			staffRec("marketer", { uid = "m1", wage = 140 }),
			staffRec("storekeeper", { uid = "k1" }),
			staffRec("cleaner", { uid = "c1", name = "Mutsuz", morale = 5, trait = "grumpy", trait2 = "greedy" }),
		}
		for id in table.clone(p.stock) do
			if string.find(id, "paste", 1, true) then
				p.stock[id] = nil
			end
		end
		local rep0 = p.rep
		pushes = {}
		EmployeeService._setRng(dice(0.99))
		EmployeeService.payday()
		T.ok(lastPush("toast", "wages_paid") ~= nil, "wages paid")
		local quit = lastPush("toast", "staff_quit_morale")
		T.ok(quit and quit.vars.name == "Mutsuz", "the unhappy one quit")
		T.eq(#p.staff, 5, "five left")
		local sup = lastPush("toast", "support_income")
		T.ok(sup and sup.vars.amount > 100, "remote support income")
		T.ok(p.rep > rep0, "the marketer's posts")
		T.ok((p.stock.paste_arctic_mx4 or 0) >= 5, "the storekeeper bought paste")
		T.ok(lastPush("toast", "staff_restock") ~= nil, "restock toast")
		local app = p.staff[1]
		T.ok(app.xp > 0 and app.days == 1, "experience")
		-- taught by the foreman, the apprentice earns stars and becomes a technician
		for _ = 1, 3 do
			EmployeeService.payday()
		end
		T.ok(lastPush("toast", "staff_levelup") ~= nil, "a star")
		T.ok(app.role == "technician" and app.skill >= 3 and lastPush("toast", "staff_promoted") ~= nil, "promoted: " .. app.role .. " " .. app.skill)
		-- a day without wages: everyone loses heart and the unhappiest walks out
		p.money = 0
		EmployeeService.payday()
		T.ok(lastPush("toast", "staff_quit") ~= nil, "one walked out")
		T.eq(#p.staff, 4, "four left")
		for _, e in p.staff do
			T.ok(e.morale < 70, "morale fell: " .. e.morale)
		end
		-- light fingers
		p.money = 100000
		p.staff = { staffRec("cleaner", { uid = "x1", name = "Şüpheli", trait2 = "sticky" }) }
		DataService.addPart(player, "cmos_cr2032", 1, "new")
		local inv0 = #p.inv
		EmployeeService._setRng(dice(0.05))
		EmployeeService.payday()
		T.eq(#p.inv, inv0 - 1, "a part went missing")
		T.ok(lastPush("toast", "staff_sticky") ~= nil, "and you notice")
		EmployeeService._setRng(nil)
		p.staff = {}
	end)

	T.test("staff: specialists take the jobs that suit them; QA catches mistakes", function()
		local laptop = staffRec("laptop_tech")
		local s, b, special = Employees.fit(laptop, "laptop", { "lap_screen" })
		T.ok(s >= 1.5 and b > 0 and special, "laptops")
		T.ok(not select(3, Employees.fit(laptop, "desktop", { "psu_dead" })), "a desktop is just a job")
		T.ok(select(3, Employees.fit(staffRec("board_tech"), "desktop", { "mobo_dead" })), "boards")
		T.ok(select(3, Employees.fit(staffRec("data_recovery"), "laptop", { "virus" })), "malware")
		T.ok(select(3, Employees.fit(staffRec("builder"), "desktop", {}, "build")), "builds")
		T.ok(Employees.fit(staffRec("technician", { trait = "solderer" }), "desktop", { "cap_bulged" }) > 1.2, "a soldering pro")
		T.ok(not Employees.canTake(staffRec("apprentice"), { "mobo_dead" }), "apprentices stay off the hard ones")
		T.ok(Employees.canTake(staffRec("apprentice"), { "dust" }), "but clean the dust")
		T.ok(not Employees.canTake(staffRec("cashier"), { "dust" }), "a cashier doesn't repair")
		-- the laptop technician goes for the laptop even when a desktop came first
		for id in table.clone(RepairService.jobs(player)) do
			RepairService.removeJob(player, id)
		end
		local desk = DeviceGen.desktop(Mock.Random.new(11), "mid")
		DeviceGen.applyFault(desk, "dust", Mock.Random.new(12))
		local deskJob = RepairService.createJob(player, { device = desk, faults = { "dust" }, kind = "repair", price = 60 })
		task.wait(0.02)
		local lap = DeviceGen.laptop(Mock.Random.new(13))
		DeviceGen.applyFault(lap, "lap_screen", Mock.Random.new(14))
		local lapJob = RepairService.createJob(player, { device = lap, faults = { "lap_screen" }, kind = "repair", price = 120 })
		T.eq(EmployeeService.pickJob(player, laptop).id, lapJob.id, "laptop first")
		T.eq(EmployeeService.pickJob(player, staffRec("technician")).id, deskJob.id, "the oldest first")
		T.eq(EmployeeService.pickJob(player, staffRec("apprentice")).id, deskJob.id, "an easy one for the apprentice")
		RepairService.removeJob(player, deskJob.id)
		T.eq(EmployeeService.pickJob(player, staffRec("apprentice")), nil, "nothing easy left")
		RepairService.removeJob(player, lapJob.id)
		-- a forgotten cable: the QA engineer checks the work
		local p = DataService.get(player)
		p.staff = { staffRec("engineer", { name = "Selin", skill = 5, morale = 90 }) }
		EmployeeService._setRng(dice(0.5))
		T.eq(EmployeeService._qaCatch(player, staffRec("technician")), "Selin", "the engineer catches it")
		p.staff = {}
		T.eq(EmployeeService._qaCatch(player, staffRec("technician")), nil, "nobody checks")
		EmployeeService._setRng(nil)
	end)

	T.test("staff: the team changes the shop — till, room, courier, bills, the night watchman", function()
		local Market = Engine.mod("ReplicatedStorage.Shared.Economy.Market")
		local Parts = Engine.mod("ReplicatedStorage.Shared.Data.Parts")
		local p = DataService.get(player)
		p.money = 100000
		p.level = 20
		T.ok(Employees.effect({ staffRec("cashier") }, "till") >= 0.3, "a cashier guards the till")
		T.ok(Employees.effect({ staffRec("marketer") }, "customers") > 0.15, "a marketer brings people in")
		T.ok(Employees.effect({ staffRec("tea_maker"), staffRec("cleaner") }, "comfort") > 10, "tea and a clean shop")
		T.ok(Employees.effect({ staffRec("salesperson") }, "sales") > 0.3, "a sales consultant sells the showcase")
		-- the storekeeper makes room
		p.staff = {}
		local cap0 = DataService.capacityOf(p)
		p.staff = { staffRec("storekeeper") }
		T.ok(DataService.capacityOf(p) >= math.floor(cap0 * 1.25), "more room")
		-- the courier: phone orders with a delivery charge
		p.staff = {}
		T.eq(request("market.buy", { id = "gpu_rtx3060", delivery = true }).err, "no_courier", "no courier, no delivery")
		T.eq(request("market.catalog").err, "no_courier", "no catalogue")
		p.staff = { staffRec("courier") }
		local cat = request("market.catalog")
		T.ok(cat.ok and #cat.catalog > 100, "the depot's catalogue on the phone")
		local m0, inv0 = p.money, #p.inv
		T.ok(request("market.buy", { id = "gpu_rtx3060", delivery = true }).ok, "ordered")
		T.eq(#p.inv, inv0 + 1, "delivered")
		T.eq(m0 - p.money, math.ceil(Market.price(Parts.get("gpu_rtx3060")) * 1.08), "8 % for the delivery")
		-- the network technician runs the line, the accountant pays the bills
		p.staff = { staffRec("network_tech") }
		p.bills = nil
		local b = BillsService.state(p)
		BillsService.morning(player, p, 3000)
		T.ok(b.list[1] and b.list[1].detail.net == 0, "free internet")
		p.staff = { staffRec("accountant") }
		BillsService.morning(player, p, 3001)
		T.eq(#b.list, 0, "the accountant paid everything")
		-- the night watchman comes on at night only
		local Lighting = game:GetService("Lighting")
		Lighting.ClockTime = 22
		p.staff = { staffRec("night_guard") }
		PlotService.build(player)
		waitFor(function()
			return EmployeeService.watchman(player)
		end, 3, "the watchman on duty")
		T.eq(#EmployeeService.guards(player), 1, "a guard at night")
		Lighting.ClockTime = 12
		PlotService.build(player)
		task.wait(0.1)
		T.ok(not EmployeeService.watchman(player), "home by day")
		p.staff = {}
		PlotService.build(player)
	end)
end
