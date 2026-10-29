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
end
